import * as THREE from "three";

import { MOBILITY_BOOST_DURATION_SECONDS } from "../game/MobilityBoost";

export interface MobilityBoostViewer {
  x: number;
  y: number;
  z: number;
}

/** Soft green draught motes that fall and drift while the wayfinder boost runs. */
export const MOBILITY_DUST_COUNT = 56;

const DUST_COLOR = 0xa8e07a;
const DUST_COLOR_HOT = 0xd8f5a8;

/**
 * Soft circular dust disc for Points (radial alpha falloff).
 * Works in browser (Canvas) and headless tests (DataTexture).
 */
export function createMobilityDustTexture(size = 40): THREE.Texture {
  const resolution = Math.max(8, Math.trunc(size));
  if (typeof document === "undefined") {
    const data = new Uint8Array(resolution * resolution * 4);
    const half = (resolution - 1) * 0.5;
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const dx = (x - half) / half;
        const dy = (y - half) / half;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const core = Math.max(0, 1 - dist);
        const alpha = dist >= 1 ? 0 : Math.pow(core, 1.55);
        const i = (y * resolution + x) * 4;
        const glow = 0.7 + core * 0.3;
        data[i] = Math.round(210 * glow);
        data[i + 1] = Math.round(255 * glow);
        data[i + 2] = Math.round(160 * glow);
        data[i + 3] = Math.round(alpha * 255);
      }
    }
    const texture = new THREE.DataTexture(data, resolution, resolution);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  const canvas = document.createElement("canvas");
  canvas.width = resolution;
  canvas.height = resolution;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create mobility dust texture.");
  const mid = resolution * 0.5;
  const gradient = context.createRadialGradient(mid, mid, 0, mid, mid, mid * 0.98);
  gradient.addColorStop(0, "rgba(240, 255, 200, 1)");
  gradient.addColorStop(0.22, "rgba(180, 230, 120, 0.88)");
  gradient.addColorStop(0.55, "rgba(120, 180, 80, 0.38)");
  gradient.addColorStop(0.82, "rgba(80, 130, 50, 0.1)");
  gradient.addColorStop(1, "rgba(40, 80, 20, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, resolution, resolution);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

interface DustSeed {
  phase: number;
  radius: number;
  height: number;
  fall: number;
  swirl: number;
  size: number;
  lateral: number;
}

/**
 * Player-centered draught mote field for the mobility boost pickup.
 * Soft circular motes fall and drift — never hard geometric diagonals.
 * (Not the ancient-biome "dustfall" ceiling atmosphere event.)
 */
export class MobilityBoostVfx {
  readonly root = new THREE.Group();
  private readonly dust: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly texture: THREE.Texture;
  private readonly positions: Float32Array;
  private readonly seeds: DustSeed[];
  private buffersActive = false;
  private readonly hotColor = new THREE.Color(DUST_COLOR_HOT);

  constructor(count = MOBILITY_DUST_COUNT) {
    const particleCount = Math.max(16, Math.trunc(count));
    this.root.name = "Mobility boost draught field";
    this.texture = createMobilityDustTexture();
    this.positions = new Float32Array(particleCount * 3);
    this.seeds = Array.from({ length: particleCount }, (_, index) => {
      const seed = (index * 0.6180339887) % 1;
      return {
        phase: seed * Math.PI * 2,
        radius: 0.28 + seed * 1.15,
        height: 0.35 + ((index * 0.37) % 1) * 1.85,
        fall: 0.55 + seed * 0.95,
        swirl: 0.35 + ((index * 0.19) % 1) * 1.1,
        size: 0.7 + seed * 0.9,
        lateral: 0.12 + seed * 0.28,
      };
    });

    for (let index = 0; index < particleCount; index += 1) {
      this.positions[index * 3] = 0;
      this.positions[index * 3 + 1] = -1000;
      this.positions[index * 3 + 2] = 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setDrawRange(0, particleCount);

    this.dust = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        map: this.texture,
        color: DUST_COLOR,
        size: 0.09,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        toneMapped: false,
      }),
    );
    this.dust.name = "Mobility draught motes";
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 4;
    this.root.add(this.dust);
    this.update(0, 0, { x: 0, y: 1.5, z: 0 }, 0);
  }

  update(
    remaining: number,
    elapsed: number,
    viewer: MobilityBoostViewer,
    _delta: number,
  ): void {
    const active = remaining > 0.0001;
    const life = THREE.MathUtils.clamp(remaining / MOBILITY_BOOST_DURATION_SECONDS, 0, 1);
    // Soft enter/exit: first second blooms, last second settles.
    const enter = THREE.MathUtils.smoothstep(life, 0, 0.12);
    const exit = THREE.MathUtils.smoothstep(life, 0, 0.18);
    const intensity = enter * exit;

    if (!active && !this.buffersActive) {
      this.dust.material.opacity = 0;
      this.dust.material.size = 0.02;
      this.dust.visible = true;
      return;
    }

    this.buffersActive = active || intensity > 0.001;
    const count = this.seeds.length;
    const pulse = 0.94 + Math.sin(elapsed * 5.2) * 0.06;

    for (let index = 0; index < count; index += 1) {
      const seed = this.seeds[index]!;
      const cycle = 1.35 + seed.phase * 0.55;
      const local = (elapsed * seed.fall + seed.phase * 3.1) % cycle;
      const t = local / cycle;
      // Fall from above the head down past the feet, with a soft swirl.
      const fallY = seed.height - t * (seed.height + 0.55);
      const angle = seed.phase + elapsed * seed.swirl + t * 1.8;
      const radius = seed.radius * (0.72 + Math.sin(t * Math.PI) * 0.38);
      const drift = Math.sin(elapsed * 1.7 + seed.phase * 5) * seed.lateral;
      const riseFade = Math.sin(t * Math.PI);
      const i3 = index * 3;
      if (!active || intensity < 0.001) {
        this.positions[i3] = 0;
        this.positions[i3 + 1] = -1000;
        this.positions[i3 + 2] = 0;
        continue;
      }
      // Soft envelope pulls motes inward at birth/death so the cloud never
      // reads as rigid rays from the player center.
      const envelope = 0.35 + riseFade * 0.65;
      this.positions[i3] = viewer.x + Math.cos(angle) * radius * envelope + drift;
      this.positions[i3 + 1] = viewer.y + fallY - 0.85;
      this.positions[i3 + 2] = viewer.z + Math.sin(angle) * radius * envelope + drift * 0.6;
    }

    const positionAttr = this.dust.geometry.getAttribute("position");
    if (positionAttr) positionAttr.needsUpdate = true;
    this.dust.geometry.computeBoundingSphere();

    this.dust.material.opacity = THREE.MathUtils.clamp(0.42 * intensity * pulse, 0, 0.72);
    this.dust.material.size = 0.055 + 0.05 * intensity;
    this.dust.material.color.setHex(DUST_COLOR).lerp(this.hotColor, 0.28 * intensity);
    this.dust.visible = true;
  }

  setWarmupVisible(visible: boolean, position: MobilityBoostViewer = { x: 0, y: 1.5, z: 0 }): void {
    if (visible) {
      this.update(MOBILITY_BOOST_DURATION_SECONDS, 0.5, position, 0);
      this.dust.material.opacity = 0.001;
      this.dust.material.size = 0.02;
      return;
    }
    this.update(0, 0, position, 0);
  }

  dispose(): void {
    this.dust.geometry.dispose();
    this.dust.material.dispose();
    this.texture.dispose();
    this.root.clear();
  }
}
