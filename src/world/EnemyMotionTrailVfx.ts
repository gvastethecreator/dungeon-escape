import * as THREE from "three";

import { ENEMY_ARCHETYPES, type EnemyKind } from "./EnemyArchetypes";
import { setEnemyBillboardFrame, type EnemyBillboardAtlasMaterial } from "./EnemyBillboardMaterial";
import type { EnemyAnimationDefinition } from "./EnemySpriteAtlas";

/** Presentation input for one live enemy billboard. */
export interface EnemyMotionTrailTarget {
  kind: EnemyKind;
  /** Instance index inside the kind's billboard batch (and trail layer). */
  instanceIndex: number;
  position: THREE.Vector3Like;
  yaw: number;
  scaleX: number;
  scaleY: number;
  phaseVisibility: number;
  spawnReveal: number;
  moving: boolean;
}

interface TrailSample {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scaleX: number;
  scaleY: number;
  strength: number;
}

interface EnemyTrailSlot {
  samples: TrailSample[];
  writeIndex: number;
  filled: number;
  /** Horizontal meters accumulated since the last history write. */
  distanceSinceSample: number;
  lastX: number;
  lastZ: number;
  hasLast: boolean;
  /** This slot needs a later fade or a reset if its actor disappears. */
  tracked: boolean;
  trackedIndex: number;
  seenFrame: number;
  /** The GPU still contains a non-zero transform for this slot. */
  rendered: boolean;
}

interface KindTrailLayer {
  mesh: THREE.InstancedMesh;
  material: EnemyBillboardAtlasMaterial;
  animation: EnemyAnimationDefinition;
  alphaAttribute: THREE.InstancedBufferAttribute;
  capacity: number;
  slots: EnemyTrailSlot[];
  activeSlots: number[];
  matrixDirty: boolean;
  alphaDirty: boolean;
  /** Animation frame currently shown on the live billboard. */
  liveFrame: number;
}

const TRAIL_SAMPLES = 5;
/** Base material opacity for black afterimages. */
export const ENEMY_TRAIL_OPACITY = 0.4;
/** Minimum horizontal travel between history samples. */
const SAMPLE_SPACING = 0.085;
/** Below this horizontal speed (m/s) the trail decays instead of writing. */
const SPEED_THRESHOLD = 0.55;
/** Beyond this horizontal distance the afterimage is not useful to the player. */
export const ENEMY_TRAIL_MAX_DISTANCE = 16;
const ENEMY_TRAIL_MAX_DISTANCE_SQ = ENEMY_TRAIL_MAX_DISTANCE * ENEMY_TRAIL_MAX_DISTANCE;
/**
 * Continuous strength loss while the enemy is still moving.
 * Newer cards appear full; older ones fade out before the next sample replaces them.
 */
const MOVING_FADE_PER_SECOND = 2.6;
const IDLE_FADE_PER_SECOND = 4.2;
const FROZEN_FADE_PER_SECOND = 3.0;
const ZERO_SCALE = new THREE.Vector3(0, 0, 0);

/**
 * Unlit black afterimage of the enemy atlas. RGB is forced black; alpha comes
 * from the sprite (and per-instance trail fade).
 */
export function createEnemyTrailMaterial(map: THREE.Texture): EnemyBillboardAtlasMaterial {
  const atlasFrame = new THREE.Vector4(0, 0, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    map,
    color: 0x000000,
    transparent: true,
    opacity: ENEMY_TRAIL_OPACITY,
    alphaTest: 0.04,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: true,
  });
  material.name = "Enemy motion trail material";
  material.userData.enemyAtlasFrame = atlasFrame;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEnemyAtlasFrame = { value: atlasFrame };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aTrailAlpha;\nvarying float vTrailAlpha;\nuniform vec4 uEnemyAtlasFrame;",
      )
      .replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\nvMapUv = uEnemyAtlasFrame.xy + vMapUv * uEnemyAtlasFrame.zw;",
      )
      .replace("#include <begin_vertex>", "vTrailAlpha = aTrailAlpha;\n#include <begin_vertex>");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vTrailAlpha;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
// Keep the authored silhouette, paint the body pure black for the afterimage.
diffuseColor.rgb = vec3(0.0);
diffuseColor.a *= clamp(vTrailAlpha, 0.0, 1.0);`,
      );
  };
  material.customProgramCacheKey = () => "enemy-motion-trail-black-atlas-v2";
  return material;
}

/** Animation frame one step behind the live billboard (wraps in the strip). */
export function previousEnemyAnimationFrame(frameIndex: number, frameCount: number): number {
  const count = Math.max(1, Math.trunc(frameCount));
  const frame = ((Math.trunc(frameIndex) % count) + count) % count;
  return (frame + count - 1) % count;
}

function createEmptySlot(): EnemyTrailSlot {
  return {
    samples: Array.from({ length: TRAIL_SAMPLES }, () => ({
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      scaleX: 0,
      scaleY: 0,
      strength: 0,
    })),
    writeIndex: 0,
    filled: 0,
    distanceSinceSample: 0,
    lastX: 0,
    lastZ: 0,
    hasLast: false,
    tracked: false,
    trackedIndex: -1,
    seenFrame: 0,
    rendered: false,
  };
}

/**
 * Black sprite afterimages for enemy pursuit.
 * Each kind reuses its atlas texture and shows the previous animation frame
 * while sampling poses by distance travelled.
 */
export class EnemyMotionTrailVfx {
  readonly root = new THREE.Group();
  private readonly layers = new Map<EnemyKind, KindTrailLayer>();
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");
  private updateFrame = 0;
  private resetPending = false;

  constructor() {
    this.root.name = "Enemy motion trail field";
  }

  /**
   * Register one kind's trail batch. Capacity matches the live billboard batch
   * so `instanceIndex` lines up with the enemy actor.
   */
  registerKind(
    kind: EnemyKind,
    map: THREE.Texture,
    animation: EnemyAnimationDefinition,
    capacity: number,
  ): void {
    if (this.layers.has(kind)) return;
    const count = Math.max(1, Math.trunc(capacity));
    const material = createEnemyTrailMaterial(map);
    setEnemyBillboardFrame(
      material,
      animation,
      previousEnemyAnimationFrame(0, animation.frames.length),
    );

    const geometry = new THREE.PlaneGeometry(1, 1);
    const alphaArray = new Float32Array(count * TRAIL_SAMPLES);
    const alphaAttribute = new THREE.InstancedBufferAttribute(alphaArray, 1);
    alphaAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("aTrailAlpha", alphaAttribute);

    const mesh = new THREE.InstancedMesh(geometry, material, count * TRAIL_SAMPLES);
    mesh.name = `Enemy motion trail ${kind}`;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(mesh);

    const layer: KindTrailLayer = {
      mesh,
      material,
      animation,
      alphaAttribute,
      capacity: count,
      slots: Array.from({ length: count }, () => createEmptySlot()),
      activeSlots: [],
      matrixDirty: false,
      alphaDirty: false,
      liveFrame: 0,
    };
    this.hideLayer(layer);
    this.layers.set(kind, layer);
  }

  /** Keep trail UVs on the frame before the live billboard animation frame. */
  syncAnimationFrame(kind: EnemyKind, liveFrame: number): void {
    const layer = this.layers.get(kind);
    if (!layer) return;
    if (layer.liveFrame === liveFrame) return;
    layer.liveFrame = liveFrame;
    setEnemyBillboardFrame(
      layer.material,
      layer.animation,
      previousEnemyAnimationFrame(liveFrame, layer.animation.frames.length),
    );
  }

  /**
   * A floor handoff hides stale local samples without allocating or composing
   * matrices on the rebind path. The next active presentation frame clears and
   * resumes this reusable field.
   */
  resetForRebind(): void {
    this.resetPending = true;
    this.root.visible = false;
  }

  update(
    targets: readonly EnemyMotionTrailTarget[],
    delta: number,
    frozen = false,
    viewerPosition?: THREE.Vector3Like,
  ): void {
    if (this.resetPending) {
      for (const layer of this.layers.values()) this.resetLayer(layer);
      this.resetPending = false;
    }
    this.root.visible = true;
    const safeDelta = Math.max(0, delta);
    const frame = (this.updateFrame += 1);
    for (const layer of this.layers.values()) {
      layer.matrixDirty = false;
      layer.alphaDirty = false;
    }

    for (const target of targets) {
      const layer = this.layers.get(target.kind);
      if (!layer) continue;
      if (target.instanceIndex < 0 || target.instanceIndex >= layer.capacity) continue;
      const slot = layer.slots[target.instanceIndex]!;
      const baseInstance = target.instanceIndex * TRAIL_SAMPLES;

      if (viewerPosition) {
        const dx = target.position.x - viewerPosition.x;
        const dz = target.position.z - viewerPosition.z;
        if (dx * dx + dz * dz > ENEMY_TRAIL_MAX_DISTANCE_SQ) {
          this.clearTrailSlot(layer, slot, baseInstance);
          this.untrackSlot(layer, slot);
          continue;
        }
      }

      const visibility = THREE.MathUtils.clamp(target.phaseVisibility * target.spawnReveal, 0, 1);
      const alive = visibility > 0.04 && target.scaleX > 0.001 && target.scaleY > 0.001;
      if (!alive) {
        this.clearTrailSlot(layer, slot, baseInstance);
        this.untrackSlot(layer, slot);
        continue;
      }

      this.trackSlot(layer, slot, target.instanceIndex);
      slot.seenFrame = frame;

      let speed = 0;
      if (slot.hasLast) {
        const dx = target.position.x - slot.lastX;
        const dz = target.position.z - slot.lastZ;
        const step = Math.hypot(dx, dz);
        speed = safeDelta > 1e-5 ? step / safeDelta : 0;
        if (!frozen && target.moving) {
          slot.distanceSinceSample += step;
        }
      }
      slot.lastX = target.position.x;
      slot.lastZ = target.position.z;
      slot.hasLast = true;

      // An idle or frozen actor with no residual card only needs its last pose
      // for a later movement sample. There is no trail work to do this frame.
      if (slot.filled === 0 && (frozen || !target.moving)) continue;

      const spectral = ENEMY_ARCHETYPES[target.kind].silhouette === "spectral";
      const dashy =
        ENEMY_ARCHETYPES[target.kind].behavior === "dash_halt" ||
        ENEMY_ARCHETYPES[target.kind].behavior === "erratic" ||
        ENEMY_ARCHETYPES[target.kind].behavior === "skitter";
      const speedBoost = THREE.MathUtils.clamp((speed - SPEED_THRESHOLD) / 2.4, 0, 1);
      const writeTrail =
        !frozen &&
        target.moving &&
        speed >= SPEED_THRESHOLD &&
        slot.distanceSinceSample >= SAMPLE_SPACING;

      // Always fade existing cards so each handoff to the next sample is smooth.
      const fadeRate = frozen
        ? FROZEN_FADE_PER_SECOND
        : target.moving
          ? MOVING_FADE_PER_SECOND
          : IDLE_FADE_PER_SECOND;
      this.decaySlot(slot, safeDelta * fadeRate);

      if (writeTrail) {
        const sample = slot.samples[slot.writeIndex]!;
        sample.x = target.position.x;
        sample.y = target.position.y;
        sample.z = target.position.z;
        sample.yaw = target.yaw;
        sample.scaleX = target.scaleX;
        sample.scaleY = target.scaleY;
        // Peak near 1; material opacity (0.4) and age fade set the final look.
        sample.strength =
          visibility * (0.92 + speedBoost * 0.08) * (spectral ? 1.05 : dashy ? 1.0 : 0.96);
        slot.writeIndex = (slot.writeIndex + 1) % TRAIL_SAMPLES;
        slot.filled = Math.min(TRAIL_SAMPLES, slot.filled + 1);
        slot.distanceSinceSample = 0;
      }

      const strengthScale = visibility * (0.92 + speedBoost * 0.08) * (spectral ? 1.04 : 1);
      if (writeTrail) {
        this.writeSlotInstances(layer, slot, baseInstance, strengthScale);
      } else if (slot.filled === 0) {
        this.clearSlotInstances(layer, slot, baseInstance);
      } else {
        this.writeSlotAlphas(layer, slot, baseInstance, strengthScale);
      }
    }

    // Only slots with history need a later fade. Reserve actors never enter this list.
    for (const layer of this.layers.values()) {
      this.decayMissingSlots(layer, frame, safeDelta);
      if (layer.matrixDirty) layer.mesh.instanceMatrix.needsUpdate = true;
      if (layer.alphaDirty) layer.alphaAttribute.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const layer of this.layers.values()) {
      layer.mesh.geometry.dispose();
      layer.material.dispose();
    }
    this.layers.clear();
    this.root.clear();
  }

  /** Test helper: first registered trail mesh, if any. */
  getDebugMesh(kind?: EnemyKind): THREE.InstancedMesh | null {
    if (kind) return this.layers.get(kind)?.mesh ?? null;
    const first = this.layers.values().next().value as KindTrailLayer | undefined;
    return first?.mesh ?? null;
  }

  private decaySlot(slot: EnemyTrailSlot, amount: number): void {
    if (slot.filled === 0 || amount <= 0) return;
    let live = 0;
    for (let index = 0; index < TRAIL_SAMPLES; index += 1) {
      const sample = slot.samples[index]!;
      sample.strength = Math.max(0, sample.strength - amount);
      if (sample.strength > 0.001) live += 1;
    }
    if (live === 0) {
      slot.filled = 0;
      slot.writeIndex = 0;
      slot.distanceSinceSample = 0;
    }
  }

  private trackSlot(layer: KindTrailLayer, slot: EnemyTrailSlot, instanceIndex: number): void {
    if (slot.tracked) return;
    slot.tracked = true;
    slot.trackedIndex = layer.activeSlots.length;
    layer.activeSlots.push(instanceIndex);
  }

  private untrackSlot(layer: KindTrailLayer, slot: EnemyTrailSlot): void {
    if (!slot.tracked) return;
    const listIndex = slot.trackedIndex;
    const instanceIndex = layer.activeSlots[listIndex];
    const lastInstanceIndex = layer.activeSlots.pop();
    if (
      instanceIndex !== undefined &&
      lastInstanceIndex !== undefined &&
      lastInstanceIndex !== instanceIndex
    ) {
      layer.activeSlots[listIndex] = lastInstanceIndex;
      layer.slots[lastInstanceIndex]!.trackedIndex = listIndex;
    }
    slot.tracked = false;
    slot.trackedIndex = -1;
    slot.seenFrame = 0;
  }

  private clearTrailSlot(layer: KindTrailLayer, slot: EnemyTrailSlot, baseInstance: number): void {
    if (!slot.hasLast && slot.filled === 0 && !slot.rendered) return;
    slot.filled = 0;
    slot.writeIndex = 0;
    slot.distanceSinceSample = 0;
    slot.lastX = 0;
    slot.lastZ = 0;
    slot.hasLast = false;
    for (const sample of slot.samples) sample.strength = 0;
    this.clearSlotInstances(layer, slot, baseInstance);
  }

  private clearSlotInstances(
    layer: KindTrailLayer,
    slot: EnemyTrailSlot,
    baseInstance: number,
  ): void {
    if (!slot.rendered) return;
    let alphaChanged = false;
    for (let age = 0; age < TRAIL_SAMPLES; age += 1) {
      const instanceIndex = baseInstance + age;
      if (layer.alphaAttribute.getX(instanceIndex) !== 0) {
        layer.alphaAttribute.setX(instanceIndex, 0);
        alphaChanged = true;
      }
      layer.mesh.setMatrixAt(
        instanceIndex,
        this.matrix.compose(this.position, this.quaternion, ZERO_SCALE),
      );
    }
    layer.matrixDirty = true;
    if (alphaChanged) layer.alphaDirty = true;
    slot.rendered = false;
  }

  private decayMissingSlots(layer: KindTrailLayer, frame: number, delta: number): void {
    for (let listIndex = layer.activeSlots.length - 1; listIndex >= 0; listIndex -= 1) {
      const instanceIndex = layer.activeSlots[listIndex]!;
      const slot = layer.slots[instanceIndex]!;
      if (slot.seenFrame === frame) continue;
      slot.hasLast = false;
      slot.distanceSinceSample = 0;
      this.decaySlot(slot, delta * IDLE_FADE_PER_SECOND);
      const baseInstance = instanceIndex * TRAIL_SAMPLES;
      if (slot.filled === 0) {
        this.clearSlotInstances(layer, slot, baseInstance);
        this.untrackSlot(layer, slot);
        continue;
      }
      this.writeSlotAlphas(layer, slot, baseInstance, 1);
    }
  }

  private writeSlotAlphas(
    layer: KindTrailLayer,
    slot: EnemyTrailSlot,
    baseInstance: number,
    strengthScale: number,
  ): void {
    let alphaChanged = false;
    for (let age = 0; age < TRAIL_SAMPLES; age += 1) {
      const instanceIndex = baseInstance + age;
      const alpha = this.trailAlpha(slot, age, strengthScale);
      if (layer.alphaAttribute.getX(instanceIndex) === alpha) continue;
      layer.alphaAttribute.setX(instanceIndex, alpha);
      alphaChanged = true;
    }
    if (alphaChanged) layer.alphaDirty = true;
  }

  private writeSlotInstances(
    layer: KindTrailLayer,
    slot: EnemyTrailSlot,
    baseInstance: number,
    strengthScale: number,
  ): void {
    let alphaChanged = false;
    for (let age = 0; age < TRAIL_SAMPLES; age += 1) {
      const instanceIndex = baseInstance + age;
      const sample = this.trailSample(slot, age);
      const alpha = sample ? this.sampleAlpha(sample, age, strengthScale) : 0;
      if (layer.alphaAttribute.getX(instanceIndex) !== alpha) {
        layer.alphaAttribute.setX(instanceIndex, alpha);
        alphaChanged = true;
      }
      if (!sample || alpha <= 0.001) {
        layer.mesh.setMatrixAt(
          instanceIndex,
          this.matrix.compose(this.position, this.quaternion, ZERO_SCALE),
        );
        continue;
      }

      const ageT = age / Math.max(1, TRAIL_SAMPLES - 1);
      const sizeFade = 0.88 + (1 - ageT) * 0.12;
      this.position.set(sample.x, sample.y - ageT * 0.025, sample.z);
      this.euler.set(0, sample.yaw, 0);
      this.quaternion.setFromEuler(this.euler);
      this.scale.set(sample.scaleX * sizeFade, sample.scaleY * sizeFade, 1);
      layer.mesh.setMatrixAt(
        instanceIndex,
        this.matrix.compose(this.position, this.quaternion, this.scale),
      );
    }
    layer.matrixDirty = true;
    if (alphaChanged) layer.alphaDirty = true;
    slot.rendered = slot.filled > 0;
  }

  private trailSample(slot: EnemyTrailSlot, age: number): TrailSample | null {
    if (slot.filled === 0 || age >= slot.filled) return null;
    const sampleIndex = (slot.writeIndex - 1 - age + TRAIL_SAMPLES * 4) % TRAIL_SAMPLES;
    const sample = slot.samples[sampleIndex]!;
    return sample.strength > 0.001 ? sample : null;
  }

  private trailAlpha(slot: EnemyTrailSlot, age: number, strengthScale: number): number {
    const sample = this.trailSample(slot, age);
    return sample ? this.sampleAlpha(sample, age, strengthScale) : 0;
  }

  private sampleAlpha(sample: TrailSample, age: number, strengthScale: number): number {
    if (strengthScale <= 0.001) return 0;
    // Smooth cascade: newest card is brightest; older cards ease out before
    // the ring buffer reclaims their slot for the next afterimage.
    const ageT = age / Math.max(1, TRAIL_SAMPLES - 1);
    const ageFade = (1 - ageT) * (1 - ageT) * (1 - 0.35 * ageT);
    return THREE.MathUtils.clamp(sample.strength * strengthScale * ageFade, 0, 1);
  }

  private hideLayer(layer: KindTrailLayer): void {
    for (let index = 0; index < layer.capacity * TRAIL_SAMPLES; index += 1) {
      layer.alphaAttribute.setX(index, 0);
      layer.mesh.setMatrixAt(
        index,
        this.matrix.compose(this.position, this.quaternion, ZERO_SCALE),
      );
    }
    layer.mesh.instanceMatrix.needsUpdate = true;
    layer.alphaAttribute.needsUpdate = true;
  }

  private resetLayer(layer: KindTrailLayer): void {
    layer.activeSlots.length = 0;
    for (const slot of layer.slots) {
      slot.writeIndex = 0;
      slot.filled = 0;
      slot.distanceSinceSample = 0;
      slot.lastX = 0;
      slot.lastZ = 0;
      slot.hasLast = false;
      slot.tracked = false;
      slot.trackedIndex = -1;
      slot.seenFrame = 0;
      slot.rendered = false;
      for (const sample of slot.samples) sample.strength = 0;
    }
    this.hideLayer(layer);
  }
}
