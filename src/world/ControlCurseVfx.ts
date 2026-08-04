import * as THREE from "three";
import type { SceneTextureSink } from "../systems/SceneTextureRegistry";

import { MIRROR_CURSE_DURATION_SECONDS } from "../game/MirrorCurse";
import { SPIN_CURSE_DURATION_SECONDS } from "../game/SpinCurse";

export interface ControlCurseViewer {
  x: number;
  y: number;
  z: number;
}

const MIRROR_COUNT = 16;
const SPIN_COUNT = 20;
const MIRROR_COLOR = 0x7ec8e8;
const SPIN_COLOR = 0xc07ae0;
const POINT_SIZE = 0.05;
const ORBIT = 0.48;

function createSoftDiscTexture(r: number, g: number, b: number, size = 48): THREE.Texture {
  const resolution = Math.max(16, Math.trunc(size));
  const data = new Uint8Array(resolution * resolution * 4);
  const half = (resolution - 1) * 0.5;
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const core = Math.max(0, 1 - dist);
      const alpha = dist >= 1 ? 0 : Math.pow(core, 1.9);
      const i = (y * resolution + x) * 4;
      const glow = 0.7 + core * 0.3;
      data[i] = Math.round(r * glow);
      data[i + 1] = Math.round(g * glow);
      data[i + 2] = Math.round(b * glow);
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

function makePoints(
  name: string,
  count: number,
  color: number,
  texture: THREE.Texture,
  positions: Float32Array,
): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  for (let i = 0; i < count; i += 1) positions[i * 3 + 1] = -1000;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, count);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4);
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: texture,
      color,
      size: POINT_SIZE,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.7,
      sizeAttenuation: true,
      toneMapped: false,
    }),
  );
  points.name = name;
  points.visible = false;
  points.frustumCulled = true;
  return points;
}

/**
 * Compact control-curse fields (mirror / spin). Small motes around the torso only.
 */
export class ControlCurseVfx {
  readonly root = new THREE.Group();
  private readonly mirror: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly spin: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly mirrorPos: Float32Array;
  private readonly spinPos: Float32Array;
  private readonly mirrorTex: THREE.Texture;
  private readonly spinTex: THREE.Texture;
  private mirrorActive = false;
  private spinActive = false;
  private disposed = false;

  constructor(private readonly textureSink?: SceneTextureSink) {
    this.root.name = "Control curse field";
    this.mirrorTex = createSoftDiscTexture(126, 200, 232);
    this.spinTex = createSoftDiscTexture(192, 122, 224);
    this.textureSink?.register(this.mirrorTex);
    this.textureSink?.register(this.spinTex);
    this.mirrorPos = new Float32Array(MIRROR_COUNT * 3);
    this.spinPos = new Float32Array(SPIN_COUNT * 3);
    this.mirror = makePoints(
      "Mirror curse shards",
      MIRROR_COUNT,
      MIRROR_COLOR,
      this.mirrorTex,
      this.mirrorPos,
    );
    this.spin = makePoints("Spin curse helix", SPIN_COUNT, SPIN_COLOR, this.spinTex, this.spinPos);
    this.root.add(this.mirror, this.spin);
  }

  private writeOrbit(
    positions: Float32Array,
    count: number,
    viewer: ControlCurseViewer,
    elapsed: number,
    spinRate: number,
    radiusBase: number,
    heightSpan: number,
    flipX = 1,
  ): void {
    const baseY = viewer.y - 1.15;
    for (let i = 0; i < count; i += 1) {
      const t = i / count;
      const angle = t * Math.PI * 2 + elapsed * spinRate;
      const radius = radiusBase + (i % 3) * 0.04;
      const y = 0.32 + t * heightSpan;
      positions[i * 3] = viewer.x + Math.cos(angle) * radius * flipX;
      positions[i * 3 + 1] = baseY + y;
      positions[i * 3 + 2] = viewer.z + Math.sin(angle) * radius;
    }
  }

  private touchBounds(points: THREE.Points, viewer: ControlCurseViewer): void {
    if (points.geometry.boundingSphere) {
      points.geometry.boundingSphere.center.set(viewer.x, viewer.y - 0.5, viewer.z);
      points.geometry.boundingSphere.radius = 2;
    }
  }

  update(
    mirrorRemaining: number,
    spinRemaining: number,
    elapsed: number,
    viewer: ControlCurseViewer,
  ): void {
    const mirrorOn = Number.isFinite(mirrorRemaining) && mirrorRemaining > 0.0001;
    const spinOn = Number.isFinite(spinRemaining) && spinRemaining > 0.0001;

    if (mirrorOn) {
      this.mirror.visible = true;
      const urgency = THREE.MathUtils.clamp(
        mirrorRemaining / MIRROR_CURSE_DURATION_SECONDS,
        0.25,
        1,
      );
      this.mirror.material.opacity = 0.32 + urgency * 0.32;
      const flip = Math.sin(elapsed * 4.5) >= 0 ? 1 : -1;
      this.writeOrbit(this.mirrorPos, MIRROR_COUNT, viewer, elapsed, 1.1, ORBIT, 0.55, flip);
      (this.mirror.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      this.touchBounds(this.mirror, viewer);
      this.mirrorActive = true;
    } else if (this.mirrorActive) {
      this.mirror.visible = false;
      this.mirrorActive = false;
    }

    if (spinOn) {
      this.spin.visible = true;
      const urgency = THREE.MathUtils.clamp(spinRemaining / SPIN_CURSE_DURATION_SECONDS, 0.25, 1);
      this.spin.material.opacity = 0.34 + urgency * 0.32;
      this.writeOrbit(this.spinPos, SPIN_COUNT, viewer, elapsed, 2.4, ORBIT * 0.95, 0.7);
      (this.spin.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      this.touchBounds(this.spin, viewer);
      this.spinActive = true;
    } else if (this.spinActive) {
      this.spin.visible = false;
      this.spinActive = false;
    }
  }

  setWarmupVisible(visible: boolean, viewer: ControlCurseViewer): void {
    if (!visible) {
      this.mirror.visible = false;
      this.spin.visible = false;
      return;
    }
    this.update(1, 1, 0, viewer);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.textureSink?.unregister(this.mirrorTex);
    this.textureSink?.unregister(this.spinTex);
    this.mirror.geometry.dispose();
    this.spin.geometry.dispose();
    this.mirror.material.dispose();
    this.spin.material.dispose();
    this.mirrorTex.dispose();
    this.spinTex.dispose();
  }
}
