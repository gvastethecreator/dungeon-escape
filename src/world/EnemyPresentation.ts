import * as THREE from "three";

import {
  ENEMY_ARCHETYPES,
  getEnemyVisualBodySize,
  getEnemySpriteRenderMetrics,
  isLowProfileEnemy,
  type EnemyKind,
} from "./EnemyArchetypes";
import {
  enemyOpaqueFeetY,
  resolveEnemyContactShadowLayout,
  setEnemyBillboardFrame,
  setEnemyBillboardInstanceFrame,
  setEnemyFreezeAmount,
} from "./EnemyBillboardMaterial";
import type { EnemyMotionTrailTarget } from "./EnemyMotionTrailVfx";
import {
  animationFrameIndex,
  enemyAttackFrameIndex,
  type EnemyAnimationDefinition,
} from "./EnemySpriteAtlas";
import type { EnemySimBody } from "./EnemySim";

export interface EnemyPresentationActor extends EnemySimBody {
  position: THREE.Vector3;
  baseScale: THREE.Vector2;
  batch: THREE.InstancedMesh;
  shadowBatch: THREE.InstancedMesh;
  instanceIndex: number;
  shadowInstanceIndex: number;
  yaw: number;
  spawnReveal: number;
  startsActive: boolean;
  visibilityAttribute: THREE.InstancedBufferAttribute;
  tier: number;
  defeated: boolean;
}

export interface EnemyAnimationBatch {
  kind: EnemyKind;
  material: THREE.MeshStandardMaterial;
  animation: EnemyAnimationDefinition;
  attackAnimation?: EnemyAnimationDefinition;
  atlasFrameAttribute: THREE.InstancedBufferAttribute;
  frame: number;
  phaseOffset: number;
}

export interface EnemyPresentationTrail {
  syncAnimationFrame(kind: EnemyKind, frame: number): void;
  update(
    targets: readonly EnemyMotionTrailTarget[],
    delta: number,
    frozen: boolean,
    viewerPosition: THREE.Vector3Like,
  ): void;
}

export interface EnemyPresentationFrame {
  actors: readonly EnemyPresentationActor[];
  billboardBatches: ReadonlySet<THREE.InstancedMesh>;
  shadowBatches: ReadonlySet<THREE.InstancedMesh>;
  visibilityAttributes: ReadonlySet<THREE.InstancedBufferAttribute>;
  animationBatches: ReadonlyMap<EnemyKind, EnemyAnimationBatch>;
  animationElapsed: number;
  revealSeconds: number;
  frozen: boolean;
  player: THREE.Vector3Like;
  delta: number;
  moodId: string;
  trail: EnemyPresentationTrail | null;
}

interface EnemyPresentationActorState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  roll: number;
  scaleX: number;
  scaleY: number;
  visibility: number;
}

/** Applies the complete render projection for enemy actors after simulation. */
export class EnemyPresentation {
  private readonly movingKinds = new Set<EnemyKind>();
  private readonly dirtyBillboardBatches = new Set<THREE.InstancedMesh>();
  private readonly dirtyShadowBatches = new Set<THREE.InstancedMesh>();
  private readonly dirtyVisibilityAttributes = new Set<THREE.InstancedBufferAttribute>();
  private readonly actorState = new WeakMap<EnemyPresentationActor, EnemyPresentationActorState>();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly matrix = new THREE.Matrix4();
  private readonly axisX = new THREE.Vector3(1, 0, 0);
  private frame = 0;

  update(frame: EnemyPresentationFrame): void {
    this.frame += 1;
    this.dirtyBillboardBatches.clear();
    this.dirtyShadowBatches.clear();
    this.dirtyVisibilityAttributes.clear();
    this.updateAnimationFrames(frame);

    for (const actor of frame.actors) {
      if (!frame.frozen) {
        actor.spawnReveal = Math.min(
          1,
          actor.spawnReveal + frame.delta / Math.max(0.1, frame.revealSeconds),
        );
      }

      actor.yaw = Math.atan2(frame.player.x - actor.position.x, frame.player.z - actor.position.z);
      this.euler.set(0, actor.yaw, actor.roll);
      this.quaternion.setFromEuler(this.euler);
      this.scale.set(actor.scaleX, actor.scaleY, 1);
      const visibility = actor.phaseVisibility * actor.spawnReveal;
      const previous = this.actorState.get(actor);
      const poseChanged =
        !previous ||
        previous.x !== actor.position.x ||
        previous.y !== actor.position.y ||
        previous.z !== actor.position.z ||
        previous.yaw !== actor.yaw ||
        previous.roll !== actor.roll ||
        previous.scaleX !== actor.scaleX ||
        previous.scaleY !== actor.scaleY ||
        previous.visibility !== visibility;
      if (poseChanged) {
        actor.visibilityAttribute.setX(actor.instanceIndex, visibility);
        actor.batch.setMatrixAt(
          actor.instanceIndex,
          this.matrix.compose(actor.position, this.quaternion, this.scale),
        );
        this.dirtyVisibilityAttributes.add(actor.visibilityAttribute);
        this.dirtyBillboardBatches.add(actor.batch);
      }
      // Contact shadows are purely decorative; amortize stable actors while
      // immediately updating a changed pose so combat feedback remains exact.
      if (poseChanged || (this.frame + actor.instanceIndex) % 3 === 0) {
        this.writeContactShadow(actor, visibility, frame.moodId);
        this.dirtyShadowBatches.add(actor.shadowBatch);
      }
      if (previous) {
        previous.x = actor.position.x;
        previous.y = actor.position.y;
        previous.z = actor.position.z;
        previous.yaw = actor.yaw;
        previous.roll = actor.roll;
        previous.scaleX = actor.scaleX;
        previous.scaleY = actor.scaleY;
        previous.visibility = visibility;
      } else {
        this.actorState.set(actor, {
          x: actor.position.x,
          y: actor.position.y,
          z: actor.position.z,
          yaw: actor.yaw,
          roll: actor.roll,
          scaleX: actor.scaleX,
          scaleY: actor.scaleY,
          visibility,
        });
      }
    }

    for (const batch of this.dirtyBillboardBatches) batch.instanceMatrix.needsUpdate = true;
    for (const batch of this.dirtyShadowBatches) batch.instanceMatrix.needsUpdate = true;
    for (const attribute of this.dirtyVisibilityAttributes) attribute.needsUpdate = true;
    for (const batch of frame.animationBatches.values()) {
      setEnemyFreezeAmount(batch.material, frame.frozen ? 1 : 0);
    }
    frame.trail?.update(frame.actors, frame.delta, frame.frozen, frame.player);
  }

  writeContactShadow(actor: EnemyPresentationActor, visibility: number, moodId: string): void {
    const archetype = ENEMY_ARCHETYPES[actor.kind];
    const body = getEnemyVisualBodySize(actor.kind, moodId);
    const sprite = getEnemySpriteRenderMetrics(actor.kind, moodId);
    const feetY = enemyOpaqueFeetY(actor.position.y, sprite.planeHeight, sprite.bottomPaddingRatio);
    const layout = resolveEnemyContactShadowLayout({
      bodyWidth: body.width,
      lowProfile: isLowProfileEnemy(actor.kind),
      feetY,
      visibility,
      spectral: archetype.silhouette === "spectral",
    });
    this.position.set(actor.position.x, layout.y, actor.position.z);
    this.quaternion.setFromAxisAngle(this.axisX, -Math.PI / 2);
    this.scale.set(layout.width, layout.depth, 1);
    actor.shadowBatch.setMatrixAt(
      actor.shadowInstanceIndex,
      this.matrix.compose(this.position, this.quaternion, this.scale),
    );
  }

  private updateAnimationFrames(frame: EnemyPresentationFrame): void {
    this.movingKinds.clear();
    for (const actor of frame.actors) if (actor.moving) this.movingKinds.add(actor.kind);
    for (const batch of frame.animationBatches.values()) {
      const nextFrame = this.movingKinds.has(batch.kind)
        ? animationFrameIndex(batch.animation, frame.animationElapsed, batch.phaseOffset)
        : 0;
      if (nextFrame !== batch.frame) {
        setEnemyBillboardFrame(batch.material, batch.animation, nextFrame);
        batch.frame = nextFrame;
      }
      frame.trail?.syncAnimationFrame(batch.kind, batch.frame);
    }
    for (const actor of frame.actors) {
      const batch = frame.animationBatches.get(actor.kind);
      if (!batch) continue;
      const attacking = actor.attackPulse > 0 && batch.attackAnimation;
      const animation = attacking ? batch.attackAnimation! : batch.animation;
      const frameIndex = attacking
        ? enemyAttackFrameIndex(actor.attackPulse, animation.frames.length)
        : actor.moving
          ? animationFrameIndex(batch.animation, frame.animationElapsed, batch.phaseOffset)
          : 0;
      setEnemyBillboardInstanceFrame(
        batch.atlasFrameAttribute,
        actor.instanceIndex,
        animation,
        frameIndex,
      );
    }
    for (const batch of frame.animationBatches.values()) {
      batch.atlasFrameAttribute.needsUpdate = true;
    }
  }
}
