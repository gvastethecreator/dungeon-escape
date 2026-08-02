import * as THREE from "three";

import { CULL_BRAND_DURATION_SECONDS } from "../game/CullBrand";

export interface CullBrandViewer {
  x: number;
  y: number;
  z: number;
}

const EMBER_COUNT = 18;
const EMBER_COLOR = 0xff7a3a;
const EMBER_HOT = 0xffd0a0;
/** World-space particle size (meters). Small to avoid camera-near blowup. */
const EMBER_SIZE = 0.055;
/** Orbit tightly around torso so points stay away from the near plane. */
const ORBIT_RADIUS = 0.42;
const BODY_Y_MIN = 0.28;
const BODY_Y_MAX = 0.95;

function createEmberTexture(size = 48): THREE.Texture {
  const resolution = Math.max(16, Math.trunc(size));
  const data = new Uint8Array(resolution * resolution * 4);
  const half = (resolution - 1) * 0.5;
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const core = Math.max(0, 1 - dist);
      // Soft falloff — avoids hard square sprites when clipped.
      const alpha = dist >= 1 ? 0 : Math.pow(core, 1.85);
      const i = (y * resolution + x) * 4;
      data[i] = 255;
      data[i + 1] = Math.round(150 + core * 70);
      data[i + 2] = Math.round(50 + core * 40);
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, resolution, resolution);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/**
 * Compact brand field: small embers orbit the torso while a cull charge is armed.
 */
export class CullBrandVfx {
  readonly root = new THREE.Group();
  private readonly embers: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly positions: Float32Array;
  private readonly texture: THREE.Texture;
  private active = false;

  constructor() {
    this.root.name = "Cull brand field";
    this.texture = createEmberTexture();
    this.positions = new Float32Array(EMBER_COUNT * 3);
    // Park off-screen until first update.
    for (let i = 0; i < EMBER_COUNT; i += 1) {
      this.positions[i * 3 + 1] = -1000;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setDrawRange(0, EMBER_COUNT);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4);
    this.embers = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        map: this.texture,
        color: EMBER_COLOR,
        size: EMBER_SIZE,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        opacity: 0.72,
        sizeAttenuation: true,
        toneMapped: false,
      }),
    );
    this.embers.name = "Cull brand embers";
    this.embers.visible = false;
    this.embers.frustumCulled = true;
    this.root.add(this.embers);
  }

  update(remaining: number, elapsed: number, viewer: CullBrandViewer): void {
    const on = Number.isFinite(remaining) && remaining > 0.0001;
    if (!on) {
      if (this.active) {
        this.embers.visible = false;
        this.active = false;
      }
      return;
    }
    this.embers.visible = true;
    this.active = true;
    const urgency = THREE.MathUtils.clamp(remaining / CULL_BRAND_DURATION_SECONDS, 0.25, 1);
    this.embers.material.opacity = 0.35 + urgency * 0.35;
    this.embers.material.color.setHex(urgency > 0.35 ? EMBER_COLOR : EMBER_HOT);
    // Eye height ~viewer.y; keep particles on torso, not in the near frustum.
    const baseY = viewer.y - 1.15;
    for (let i = 0; i < EMBER_COUNT; i += 1) {
      const t = i / EMBER_COUNT;
      const angle = t * Math.PI * 2 + elapsed * 1.6;
      const radius = ORBIT_RADIUS + Math.sin(elapsed * 2.2 + i) * 0.04;
      const y = THREE.MathUtils.lerp(BODY_Y_MIN, BODY_Y_MAX, (i % 6) / 5);
      this.positions[i * 3] = viewer.x + Math.cos(angle) * radius;
      this.positions[i * 3 + 1] = baseY + y;
      this.positions[i * 3 + 2] = viewer.z + Math.sin(angle) * radius;
    }
    const attr = this.embers.geometry.getAttribute("position") as THREE.BufferAttribute;
    attr.needsUpdate = true;
    if (this.embers.geometry.boundingSphere) {
      this.embers.geometry.boundingSphere.center.set(viewer.x, viewer.y - 0.5, viewer.z);
      this.embers.geometry.boundingSphere.radius = 2.2;
    }
  }

  setWarmupVisible(visible: boolean, viewer: CullBrandViewer): void {
    if (!visible) {
      this.embers.visible = false;
      return;
    }
    this.update(CULL_BRAND_DURATION_SECONDS, 0, viewer);
  }

  dispose(): void {
    this.embers.geometry.dispose();
    this.embers.material.dispose();
    this.texture.dispose();
  }
}
