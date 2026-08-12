import * as THREE from "three";
import type { SceneTextureSink } from "../systems/SceneTextureRegistry";

import { TIME_FREEZE_DURATION_SECONDS } from "../game/TimeFreeze";

export interface TimeFreezeVfxTarget {
  position: THREE.Vector3Like;
  phaseVisibility: number;
  spawnReveal: number;
  scaleX: number;
  scaleY: number;
}

const PARTICLES_PER_ENEMY = 10;

/** Small authored ice glint shared by all frozen-enemy motes. */
export function createTimeFreezeCrystalTexture(size = 32): THREE.DataTexture {
  const resolution = Math.max(8, Math.trunc(size));
  const data = new Uint8Array(resolution * resolution * 4);
  const half = (resolution - 1) * 0.5;
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const nx = (x - half) / half;
      const ny = (y - half) / half;
      const diamond = Math.abs(nx) * 1.8 + Math.abs(ny) * 0.72;
      const body = THREE.MathUtils.clamp((1 - diamond) * 2.4, 0, 1);
      const crossDistance = Math.min(Math.abs(nx), Math.abs(ny));
      const cross =
        THREE.MathUtils.clamp((0.13 - crossDistance) / 0.13, 0, 1) *
        THREE.MathUtils.clamp((0.92 - Math.hypot(nx, ny)) / 0.28, 0, 1);
      const alpha = Math.max(body, cross * 0.78);
      const offset = (y * resolution + x) * 4;
      data[offset] = 214;
      data[offset + 1] = 249;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGBAFormat);
  texture.name = "Time freeze crystal point texture";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Body frost for frozen enemies: soft rising motes leave the sprite itself.
 * No orbit rings or crystal shards — freeze is read from desaturation plus
 * these particles so the billboard stays clear.
 */
export class TimeFreezeVfx {
  readonly root = new THREE.Group();
  private readonly motes: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly capacity: number;
  private readonly particleCount: number;
  private readonly positions: Float32Array;
  private readonly seeds: Float32Array;
  private readonly crystalTexture: THREE.DataTexture;
  private disposed = false;
  private buffersActive = false;

  constructor(
    capacity: number,
    private readonly textureSink?: SceneTextureSink,
  ) {
    this.capacity = Math.max(1, Math.trunc(capacity));
    this.particleCount = this.capacity * PARTICLES_PER_ENEMY;
    this.root.name = "Time freeze enemy frost field";
    this.crystalTexture = createTimeFreezeCrystalTexture();
    this.textureSink?.register(this.crystalTexture);

    this.positions = new Float32Array(this.particleCount * 3);
    this.seeds = new Float32Array(this.particleCount);
    for (let index = 0; index < this.particleCount; index += 1) {
      this.seeds[index] = (index * 0.6180339887) % 1;
      this.positions[index * 3] = 0;
      this.positions[index * 3 + 1] = -1000;
      this.positions[index * 3 + 2] = 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setDrawRange(0, this.particleCount);

    this.motes = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        map: this.crystalTexture,
        color: 0xb7f4ff,
        size: 0.055,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        alphaTest: 0.025,
        toneMapped: false,
      }),
    );
    this.motes.name = "Time freeze body motes";
    // Player-attached body motes; camera-relative, so cull would hide the buff.
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 3;
    this.root.add(this.motes);
    this.update(0, 0, []);
  }

  update(remaining: number, elapsed: number, targets: readonly TimeFreezeVfxTarget[]): void {
    const active = remaining > 0.0001;
    const life = THREE.MathUtils.clamp(remaining / TIME_FREEZE_DURATION_SECONDS, 0, 1);
    const pulse = 0.96 + Math.sin(elapsed * 4.6) * 0.04;

    // The field stays in the graph for shader warmup. Once its buffers are
    // cleared, idle frames can leave the large position array untouched.
    if (!active && !this.buffersActive) {
      this.motes.material.opacity = 0;
      this.motes.material.size = 0.01;
      this.motes.visible = true;
      return;
    }

    for (let enemyIndex = 0; enemyIndex < this.capacity; enemyIndex += 1) {
      const target = targets[enemyIndex];
      const visible =
        active &&
        target !== undefined &&
        target.spawnReveal > 0.001 &&
        target.phaseVisibility > 0.001 &&
        target.scaleX > 0.001 &&
        target.scaleY > 0.001;
      const base = enemyIndex * PARTICLES_PER_ENEMY;

      if (!visible || !target) {
        for (let particle = 0; particle < PARTICLES_PER_ENEMY; particle += 1) {
          const index = (base + particle) * 3;
          this.positions[index] = 0;
          this.positions[index + 1] = -1000;
          this.positions[index + 2] = 0;
        }
        continue;
      }

      const visibility = THREE.MathUtils.clamp(target.phaseVisibility * target.spawnReveal, 0, 1);
      const bodyWidth = Math.max(0.22, target.scaleX * 0.34);
      const bodyHeight = Math.max(0.35, target.scaleY * 0.92);
      const bodyBaseY = target.position.y - target.scaleY * 0.42;

      for (let particle = 0; particle < PARTICLES_PER_ENEMY; particle += 1) {
        const seed = this.seeds[base + particle] ?? 0;
        const cycle = 1.55 + seed * 1.35;
        const local = (elapsed * (0.55 + seed * 0.85) + seed * cycle) % cycle;
        const t = local / cycle;
        const rise = t * bodyHeight * (0.82 + seed * 0.28);
        const swirl = elapsed * (1.1 + seed * 1.4) + seed * Math.PI * 2;
        const radius = bodyWidth * (0.18 + seed * 0.72) * (0.55 + Math.sin(t * Math.PI) * 0.45);
        const fadeLift = Math.sin(t * Math.PI);
        const index = (base + particle) * 3;
        this.positions[index] =
          target.position.x + Math.cos(swirl) * radius * fadeLift * visibility;
        this.positions[index + 1] = bodyBaseY + rise + Math.sin(elapsed * 2.4 + seed * 9) * 0.02;
        this.positions[index + 2] =
          target.position.z + Math.sin(swirl) * radius * fadeLift * visibility;
      }
    }

    const positionAttr = this.motes.geometry.getAttribute("position") as THREE.BufferAttribute;
    positionAttr.needsUpdate = true;
    this.motes.material.opacity = active ? (0.14 + life * 0.3) * pulse : 0;
    this.motes.material.size = active ? 0.034 + life * 0.018 : 0.01;
    // Keep the Points object visible so the freeze program is compiled during
    // renderer warmup instead of the first pickup activation frame.
    this.motes.visible = true;
    this.buffersActive = active;
  }

  /** Force the frost field into the compile/render path without a live freeze. */
  setWarmupVisible(visible: boolean): void {
    this.motes.visible = true;
    if (visible) {
      this.motes.material.opacity = 0.01;
      this.motes.material.size = 0.01;
    } else if (this.motes.material.opacity <= 0.02) {
      this.motes.material.opacity = 0;
    }
  }

  /** Hide stale local-space motes during an active-floor handoff. */
  resetForRebind(): void {
    this.buffersActive = false;
    this.motes.visible = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.textureSink?.unregister(this.crystalTexture);
    this.motes.geometry.dispose();
    this.motes.material.dispose();
    this.crystalTexture.dispose();
    this.root.clear();
  }
}
