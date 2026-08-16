import * as THREE from "three";
import type { SceneTextureSink } from "../systems/SceneTextureRegistry";

import {
  SHOTGUN_CONE_COS,
  SHOTGUN_PELLET_COUNT,
  SHOTGUN_PELLET_TRAVEL_SECONDS,
  SHOTGUN_RANGE,
  fillShotgunPelletDirections,
  type ShotgunVec3,
} from "../game/Shotgun";

export const SHOTGUN_BLAST_PELLET_COUNT = SHOTGUN_PELLET_COUNT;
export const SHOTGUN_BLAST_MAX_SHOTS = 4;
export const SHOTGUN_BLAST_MAX_PELLETS = SHOTGUN_BLAST_PELLET_COUNT * SHOTGUN_BLAST_MAX_SHOTS;
export const SHOTGUN_BLAST_SPARK_COUNT = 192;
export const SHOTGUN_BLAST_MUZZLE_SECONDS = 0.09;
export const SHOTGUN_BLAST_MUZZLE_SPARKS = 14;
export const SHOTGUN_BLAST_KILL_SPARKS = 32;

const PELLET_COLOR = 0xffe08a;
const TRACER_HEAD = 0xfff4c8;
const TRACER_TAIL = 0xff7a32;
const SPARK_HOT = 0xfff1c0;
const SPARK_COOL = 0xff9a4a;
const MUZZLE_COLOR = 0xfff3c4;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export interface ShotgunBlastTrigger {
  origin: THREE.Vector3Like;
  direction: THREE.Vector3Like;
  impacts?: readonly THREE.Vector3Like[];
  seed?: number;
}

interface PelletSlot {
  active: boolean;
  age: number;
  life: number;
  originX: number;
  originY: number;
  originZ: number;
  dirX: number;
  dirY: number;
  dirZ: number;
  travel: number;
}

interface SparkSlot {
  active: boolean;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  smoke: boolean;
}

/**
 * Soft radial disc for muzzle sparks and impact motes.
 * Canvas in the browser; DataTexture in headless tests.
 */
export function createShotgunSparkTexture(size = 40): THREE.Texture {
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
        const alpha = dist >= 1 ? 0 : Math.pow(core, 1.45);
        const i = (y * resolution + x) * 4;
        data[i] = 255;
        data[i + 1] = Math.round(210 + core * 45);
        data[i + 2] = Math.round(140 + core * 80);
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

  const canvas = document.createElement("canvas");
  canvas.width = resolution;
  canvas.height = resolution;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create shotgun spark texture.");
  const mid = resolution * 0.5;
  const gradient = context.createRadialGradient(mid, mid, 0, mid, mid, mid * 0.98);
  gradient.addColorStop(0, "rgba(255, 248, 220, 1)");
  gradient.addColorStop(0.22, "rgba(255, 196, 96, 0.9)");
  gradient.addColorStop(0.55, "rgba(255, 120, 48, 0.4)");
  gradient.addColorStop(0.82, "rgba(140, 160, 180, 0.12)");
  gradient.addColorStop(1, "rgba(40, 50, 60, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, resolution, resolution);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function pelletTravelToImpacts(
  origin: THREE.Vector3Like,
  direction: ShotgunVec3,
  impacts: readonly THREE.Vector3Like[] | undefined,
): number {
  let travel = SHOTGUN_RANGE;
  if (!impacts || impacts.length === 0) return travel;
  for (const impact of impacts) {
    const dx = impact.x - origin.x;
    const dy = impact.y - origin.y;
    const dz = impact.z - origin.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 0.08 || distance >= travel) continue;
    const inv = 1 / distance;
    const dot = dx * inv * direction.x + dy * inv * direction.y + dz * inv * direction.z;
    if (dot >= Math.max(0.82, SHOTGUN_CONE_COS - 0.04)) travel = distance;
  }
  return travel;
}

/**
 * Hitscan combat stays in Shotgun.ts. This pool draws flying pellets, tracers,
 * a muzzle flash, and impact sparks for each successful blast.
 */
export class ShotgunBlastVfx {
  readonly root = new THREE.Group();
  private readonly pellets: THREE.InstancedMesh;
  private readonly tracers: THREE.LineSegments;
  private readonly sparks: THREE.Points;
  private readonly muzzle: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private readonly muzzleCone: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  private readonly texture: THREE.Texture;
  private readonly pelletSlots: PelletSlot[] = [];
  private readonly sparkSlots: SparkSlot[] = [];
  private readonly pelletDirections: ShotgunVec3[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly aimVector = new THREE.Vector3();
  private readonly pelletColor = new THREE.Color();
  private readonly tracerHead = new THREE.Color(TRACER_HEAD);
  private readonly tracerTail = new THREE.Color(TRACER_TAIL);
  private readonly sparkHot = new THREE.Color(SPARK_HOT);
  private readonly sparkCool = new THREE.Color(SPARK_COOL);
  private readonly tracerPositions: Float32Array;
  private readonly tracerColors: Float32Array;
  private readonly sparkPositions: Float32Array;
  private readonly sparkColors: Float32Array;
  private readonly sparkSizes: Float32Array;
  private pelletCursor = 0;
  private sparkCursor = 0;
  private activePelletCountValue = 0;
  private activeSparkCountValue = 0;
  private muzzleAge = 1;
  private idleClean = true;
  private warming = false;
  private disposed = false;

  constructor(private readonly textureSink?: SceneTextureSink) {
    this.root.name = "Shotgun blast field";
    this.texture = createShotgunSparkTexture();
    this.textureSink?.register(this.texture);

    for (let index = 0; index < SHOTGUN_BLAST_MAX_PELLETS; index += 1) {
      this.pelletSlots.push({
        active: false,
        age: 0,
        life: SHOTGUN_PELLET_TRAVEL_SECONDS,
        originX: 0,
        originY: -1000,
        originZ: 0,
        dirX: 0,
        dirY: 0,
        dirZ: -1,
        travel: SHOTGUN_RANGE,
      });
    }
    for (let index = 0; index < SHOTGUN_BLAST_SPARK_COUNT; index += 1) {
      this.sparkSlots.push({
        active: false,
        age: 0,
        life: 0.2,
        x: 0,
        y: -1000,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 0.04,
        smoke: false,
      });
    }

    this.pellets = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.032, 6, 4),
      new THREE.MeshBasicMaterial({
        color: PELLET_COLOR,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
      SHOTGUN_BLAST_MAX_PELLETS,
    );
    this.pellets.name = "Shotgun pellets";
    this.pellets.frustumCulled = false;
    this.pellets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pellets.count = SHOTGUN_BLAST_MAX_PELLETS;
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let index = 0; index < SHOTGUN_BLAST_MAX_PELLETS; index += 1) {
      this.pellets.setMatrixAt(index, this.dummy.matrix);
      this.pellets.setColorAt(index, this.pelletColor.setHex(PELLET_COLOR));
    }
    this.pellets.instanceMatrix.needsUpdate = true;
    if (this.pellets.instanceColor) this.pellets.instanceColor.needsUpdate = true;

    this.tracerPositions = new Float32Array(SHOTGUN_BLAST_MAX_PELLETS * 6);
    this.tracerColors = new Float32Array(SHOTGUN_BLAST_MAX_PELLETS * 6);
    const tracerGeometry = new THREE.BufferGeometry();
    tracerGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.tracerPositions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    tracerGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(this.tracerColors, 3).setUsage(THREE.DynamicDrawUsage),
    );
    tracerGeometry.setDrawRange(0, 0);
    tracerGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 24);
    this.tracers = new THREE.LineSegments(
      tracerGeometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.tracers.name = "Shotgun pellet tracers";
    this.tracers.frustumCulled = false;

    this.sparkPositions = new Float32Array(SHOTGUN_BLAST_SPARK_COUNT * 3);
    this.sparkColors = new Float32Array(SHOTGUN_BLAST_SPARK_COUNT * 3);
    this.sparkSizes = new Float32Array(SHOTGUN_BLAST_SPARK_COUNT);
    this.sparkPositions.fill(0);
    for (let index = 0; index < SHOTGUN_BLAST_SPARK_COUNT; index += 1) {
      this.sparkPositions[index * 3 + 1] = -1000;
      this.sparkSizes[index] = 0.04;
    }
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.sparkPositions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    sparkGeometry.setAttribute("color", new THREE.BufferAttribute(this.sparkColors, 3));
    sparkGeometry.setAttribute(
      "size",
      new THREE.BufferAttribute(this.sparkSizes, 1).setUsage(THREE.DynamicDrawUsage),
    );
    sparkGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 24);
    this.sparks = new THREE.Points(
      sparkGeometry,
      new THREE.PointsMaterial({
        map: this.texture,
        color: SPARK_HOT,
        size: 0.055,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        opacity: 0.9,
        sizeAttenuation: true,
        vertexColors: true,
        toneMapped: false,
      }),
    );
    this.sparks.name = "Shotgun blast sparks";
    this.sparks.frustumCulled = false;
    this.sparks.visible = false;

    this.muzzle = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 12),
      new THREE.MeshBasicMaterial({
        color: MUZZLE_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.muzzle.name = "Shotgun world muzzle flash";
    this.muzzle.frustumCulled = false;
    this.muzzle.visible = false;

    this.muzzleCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.28, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffc45a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.muzzleCone.name = "Shotgun muzzle cone";
    this.muzzleCone.frustumCulled = false;
    this.muzzleCone.visible = false;

    this.root.add(this.pellets, this.tracers, this.sparks, this.muzzle, this.muzzleCone);
  }

  get activePelletCount(): number {
    return this.activePelletCountValue;
  }

  get activeSparkCount(): number {
    return this.activeSparkCountValue;
  }

  triggerBlast(input: ShotgunBlastTrigger): void {
    const length = Math.hypot(input.direction.x, input.direction.y, input.direction.z);
    if (length < 1e-6) return;
    const aim: ShotgunVec3 = {
      x: input.direction.x / length,
      y: input.direction.y / length,
      z: input.direction.z / length,
    };
    const seed = Number.isFinite(input.seed) ? (input.seed as number) : 0;
    fillShotgunPelletDirections(aim, seed, this.pelletDirections);
    for (let index = 0; index < SHOTGUN_PELLET_COUNT; index += 1) {
      const direction = this.pelletDirections[index]!;
      const slot = this.pelletSlots[this.pelletCursor]!;
      this.pelletCursor = (this.pelletCursor + 1) % SHOTGUN_BLAST_MAX_PELLETS;
      slot.active = true;
      slot.age = 0;
      slot.life = SHOTGUN_PELLET_TRAVEL_SECONDS;
      slot.originX = input.origin.x;
      slot.originY = input.origin.y;
      slot.originZ = input.origin.z;
      slot.dirX = direction.x;
      slot.dirY = direction.y;
      slot.dirZ = direction.z;
      slot.travel = pelletTravelToImpacts(input.origin, direction, input.impacts);
    }

    this.muzzleAge = 0;
    this.muzzle.position.set(input.origin.x, input.origin.y, input.origin.z);
    this.muzzleCone.position.set(
      input.origin.x + aim.x * 0.12,
      input.origin.y + aim.y * 0.12,
      input.origin.z + aim.z * 0.12,
    );
    this.aimVector.set(aim.x, aim.y, aim.z);
    this.dummy.position.copy(this.muzzleCone.position);
    this.dummy.quaternion.setFromUnitVectors(Y_AXIS, this.aimVector);
    this.muzzleCone.quaternion.copy(this.dummy.quaternion);
    this.muzzle.visible = true;
    this.muzzleCone.visible = true;
    this.idleClean = false;

    this.spawnSparkBurst(input.origin, aim, SHOTGUN_BLAST_MUZZLE_SPARKS, seed, "muzzle");
    if (input.impacts) {
      for (let impactIndex = 0; impactIndex < input.impacts.length; impactIndex += 1) {
        const impact = input.impacts[impactIndex]!;
        this.spawnSparkBurst(
          impact,
          aim,
          SHOTGUN_BLAST_KILL_SPARKS,
          seed + impactIndex * 11.3,
          "kill",
        );
      }
    }
    this.syncPelletBuffers();
    this.syncSparkBuffers();
  }

  update(delta: number, viewer?: THREE.Vector3Like): void {
    if (this.disposed || this.warming) return;
    const safeDelta = Math.max(0, Number.isFinite(delta) ? delta : 0);
    if (
      this.idleClean &&
      this.activePelletCountValue === 0 &&
      this.activeSparkCountValue === 0 &&
      this.muzzleAge >= 1
    ) {
      return;
    }

    let livePellets = 0;
    for (let index = 0; index < SHOTGUN_BLAST_MAX_PELLETS; index += 1) {
      const slot = this.pelletSlots[index]!;
      if (!slot.active) continue;
      slot.age += safeDelta;
      if (slot.age >= slot.life) {
        slot.active = false;
        continue;
      }
      livePellets += 1;
    }
    this.activePelletCountValue = livePellets;

    let liveSparks = 0;
    for (let index = 0; index < SHOTGUN_BLAST_SPARK_COUNT; index += 1) {
      const slot = this.sparkSlots[index]!;
      if (!slot.active) continue;
      slot.age += safeDelta;
      if (slot.age >= slot.life) {
        slot.active = false;
        continue;
      }
      liveSparks += 1;
      const drag = slot.smoke ? 0.55 : 1.8;
      slot.vy -= (slot.smoke ? 0.4 : 6.2) * safeDelta;
      const damp = Math.max(0, 1 - drag * safeDelta);
      slot.vx *= damp;
      slot.vy *= damp;
      slot.vz *= damp;
      slot.x += slot.vx * safeDelta;
      slot.y += slot.vy * safeDelta;
      slot.z += slot.vz * safeDelta;
    }
    this.activeSparkCountValue = liveSparks;

    this.muzzleAge = Math.min(1, this.muzzleAge + safeDelta / SHOTGUN_BLAST_MUZZLE_SECONDS);
    const muzzleLive = this.muzzleAge < 1;
    const flash = muzzleLive ? 1 - this.muzzleAge : 0;
    this.muzzle.material.opacity = flash * 0.92;
    this.muzzleCone.material.opacity = flash * 0.55;
    this.muzzle.visible = muzzleLive;
    this.muzzleCone.visible = muzzleLive;
    if (muzzleLive && viewer) {
      this.muzzle.lookAt(viewer.x, viewer.y, viewer.z);
    }

    this.syncPelletBuffers();
    this.syncSparkBuffers();
    this.pellets.visible = livePellets > 0;
    this.tracers.visible = livePellets > 0;
    this.sparks.visible = liveSparks > 0;
    this.idleClean = livePellets === 0 && liveSparks === 0 && !muzzleLive;
  }

  /**
   * Put live pellet/tracer/spark/muzzle draws in the first warmup frame so the
   * first real blast does not compile those programs or upload empty buffers.
   * Opacity stays tiny; geometry is not scale-0 or drawRange 0.
   */
  setWarmupVisible(visible: boolean, position: THREE.Vector3Like = { x: 0, y: 1.4, z: 0 }): void {
    this.warming = visible;
    if (visible) {
      this.writeWarmupDrawables(position);
      this.idleClean = false;
      return;
    }
    this.clearWarmupDrawables();
    this.idleClean =
      this.activePelletCountValue === 0 && this.activeSparkCountValue === 0 && this.muzzleAge >= 1;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.textureSink?.unregister(this.texture);
    this.pellets.geometry.dispose();
    (this.pellets.material as THREE.MeshBasicMaterial).dispose();
    this.tracers.geometry.dispose();
    (this.tracers.material as THREE.LineBasicMaterial).dispose();
    this.sparks.geometry.dispose();
    (this.sparks.material as THREE.PointsMaterial).dispose();
    this.muzzle.geometry.dispose();
    this.muzzle.material.dispose();
    this.muzzleCone.geometry.dispose();
    this.muzzleCone.material.dispose();
    this.texture.dispose();
    this.root.clear();
  }

  private writeWarmupDrawables(position: THREE.Vector3Like): void {
    const x = position.x;
    const y = position.y + 1.2;
    const z = position.z;
    this.dummy.position.set(x, y, z);
    this.dummy.scale.setScalar(1);
    this.dummy.updateMatrix();
    this.pellets.setMatrixAt(0, this.dummy.matrix);
    this.pellets.instanceMatrix.needsUpdate = true;
    this.pellets.visible = true;

    this.tracerPositions[0] = x;
    this.tracerPositions[1] = y;
    this.tracerPositions[2] = z;
    this.tracerPositions[3] = x;
    this.tracerPositions[4] = y;
    this.tracerPositions[5] = z - 0.45;
    this.tracerColors[0] = this.tracerTail.r;
    this.tracerColors[1] = this.tracerTail.g;
    this.tracerColors[2] = this.tracerTail.b;
    this.tracerColors[3] = this.tracerHead.r;
    this.tracerColors[4] = this.tracerHead.g;
    this.tracerColors[5] = this.tracerHead.b;
    const tracerPosition = this.tracers.geometry.getAttribute("position") as THREE.BufferAttribute;
    const tracerColor = this.tracers.geometry.getAttribute("color") as THREE.BufferAttribute;
    tracerPosition.needsUpdate = true;
    tracerColor.needsUpdate = true;
    this.tracers.geometry.setDrawRange(0, 2);
    this.tracers.visible = true;

    for (let index = 0; index < 8; index += 1) {
      const offset = index * 3;
      this.sparkPositions[offset] = x + (index % 3) * 0.02;
      this.sparkPositions[offset + 1] = y;
      this.sparkPositions[offset + 2] = z;
      this.sparkColors[offset] = this.sparkHot.r;
      this.sparkColors[offset + 1] = this.sparkHot.g;
      this.sparkColors[offset + 2] = this.sparkHot.b;
      this.sparkSizes[index] = 0.06;
    }
    const sparkPositions = this.sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
    const sparkColors = this.sparks.geometry.getAttribute("color") as THREE.BufferAttribute;
    const sparkSizes = this.sparks.geometry.getAttribute("size") as THREE.BufferAttribute;
    sparkPositions.needsUpdate = true;
    sparkColors.needsUpdate = true;
    sparkSizes.needsUpdate = true;
    this.sparks.visible = true;

    this.muzzle.position.set(x, y, z);
    this.muzzle.material.opacity = 0.05;
    this.muzzle.visible = true;
    this.muzzleCone.position.set(x, y, z - 0.08);
    this.muzzleCone.material.opacity = 0.05;
    this.muzzleCone.visible = true;
  }

  private clearWarmupDrawables(): void {
    if (this.activePelletCountValue === 0) {
      this.dummy.position.set(0, -1000, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.pellets.setMatrixAt(0, this.dummy.matrix);
      this.pellets.instanceMatrix.needsUpdate = true;
      this.pellets.visible = false;
      this.tracerPositions[1] = -1000;
      this.tracerPositions[4] = -1000;
      this.tracers.geometry.setDrawRange(0, 0);
      this.tracers.visible = false;
    }
    if (this.activeSparkCountValue === 0) {
      for (let index = 0; index < 8; index += 1) {
        this.sparkPositions[index * 3 + 1] = -1000;
        this.sparkSizes[index] = 0;
      }
      const sparkPositions = this.sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
      const sparkSizes = this.sparks.geometry.getAttribute("size") as THREE.BufferAttribute;
      sparkPositions.needsUpdate = true;
      sparkSizes.needsUpdate = true;
      this.sparks.visible = false;
    }
    if (this.muzzleAge >= 1) {
      this.muzzle.material.opacity = 0;
      this.muzzleCone.material.opacity = 0;
      this.muzzle.visible = false;
      this.muzzleCone.visible = false;
    }
  }

  private spawnSparkBurst(
    origin: THREE.Vector3Like,
    aim: ShotgunVec3,
    count: number,
    seed: number,
    mode: "muzzle" | "kill",
  ): void {
    const kill = mode === "kill";
    for (let particle = 0; particle < count; particle += 1) {
      const slot = this.sparkSlots[this.sparkCursor]!;
      this.sparkCursor = (this.sparkCursor + 1) % SHOTGUN_BLAST_SPARK_COUNT;
      const random = Math.sin(seed * 12.9898 + particle * 78.233) * 43758.5453;
      const t = random - Math.floor(random);
      const randomTwo = Math.sin(seed * 4.11 + particle * 19.17) * 23421.631;
      const u = randomTwo - Math.floor(randomTwo);
      const angle = t * Math.PI * 2;
      const smoke = kill ? particle % 5 === 0 : particle % 5 === 0;
      const speed = smoke ? 0.7 + u * 0.8 : kill ? 3.4 + t * 4.2 : 2.4 + t * 3.2;
      slot.active = true;
      slot.age = 0;
      slot.life = smoke ? 0.38 + u * 0.22 : kill ? 0.28 + t * 0.32 : 0.12 + t * 0.16;
      slot.x = origin.x + (t - 0.5) * (kill ? 0.16 : 0.06);
      slot.y = origin.y + (u - 0.5) * (kill ? 0.22 : 0.05);
      slot.z = origin.z + (t - 0.5) * (kill ? 0.16 : 0.06);
      slot.vx = Math.cos(angle) * speed * (kill ? 1.15 : 0.45) + aim.x * (kill ? -0.8 : 2.8);
      slot.vy = (smoke ? 0.55 : kill ? 2.6 : 1.1) + u * (kill ? 3.8 : 1.4);
      slot.vz = Math.sin(angle) * speed * (kill ? 1.15 : 0.45) + aim.z * (kill ? -0.8 : 2.8);
      slot.size = smoke ? 0.12 : kill ? 0.055 + t * 0.06 : 0.04 + t * 0.035;
      slot.smoke = smoke;
    }
  }

  private syncPelletBuffers(): void {
    const head = this.tracerHead;
    const tail = this.tracerTail;
    let live = 0;
    for (let index = 0; index < SHOTGUN_BLAST_MAX_PELLETS; index += 1) {
      const slot = this.pelletSlots[index]!;
      const tracer = index * 6;
      if (!slot.active) {
        this.dummy.position.set(0, -1000, 0);
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.pellets.setMatrixAt(index, this.dummy.matrix);
        this.tracerPositions[tracer] = 0;
        this.tracerPositions[tracer + 1] = -1000;
        this.tracerPositions[tracer + 2] = 0;
        this.tracerPositions[tracer + 3] = 0;
        this.tracerPositions[tracer + 4] = -1000;
        this.tracerPositions[tracer + 5] = 0;
        continue;
      }
      live += 1;
      const progress = slot.age / Math.max(slot.life, 1e-4);
      const distance = slot.travel * progress;
      const x = slot.originX + slot.dirX * distance;
      const y = slot.originY + slot.dirY * distance;
      const z = slot.originZ + slot.dirZ * distance;
      const trail = 0.18 + (1 - progress) * 0.38;
      this.dummy.position.set(x, y, z);
      this.dummy.scale.setScalar(0.7 + (1 - progress) * 0.55);
      this.dummy.updateMatrix();
      this.pellets.setMatrixAt(index, this.dummy.matrix);
      this.pelletColor.setHex(PELLET_COLOR).multiplyScalar(1.15 - progress * 0.55);
      this.pellets.setColorAt(index, this.pelletColor);
      this.tracerPositions[tracer] = x - slot.dirX * trail;
      this.tracerPositions[tracer + 1] = y - slot.dirY * trail;
      this.tracerPositions[tracer + 2] = z - slot.dirZ * trail;
      this.tracerPositions[tracer + 3] = x;
      this.tracerPositions[tracer + 4] = y;
      this.tracerPositions[tracer + 5] = z;
      this.tracerColors[tracer] = tail.r;
      this.tracerColors[tracer + 1] = tail.g;
      this.tracerColors[tracer + 2] = tail.b;
      this.tracerColors[tracer + 3] = head.r;
      this.tracerColors[tracer + 4] = head.g;
      this.tracerColors[tracer + 5] = head.b;
    }
    this.pellets.instanceMatrix.needsUpdate = true;
    if (this.pellets.instanceColor) this.pellets.instanceColor.needsUpdate = true;
    const tracerPosition = this.tracers.geometry.getAttribute("position") as THREE.BufferAttribute;
    const tracerColor = this.tracers.geometry.getAttribute("color") as THREE.BufferAttribute;
    tracerPosition.needsUpdate = true;
    tracerColor.needsUpdate = true;
    this.tracers.geometry.setDrawRange(0, live * 2);
    this.activePelletCountValue = live;
  }

  private syncSparkBuffers(): void {
    const hot = this.sparkHot;
    const cool = this.sparkCool;
    let live = 0;
    for (let index = 0; index < SHOTGUN_BLAST_SPARK_COUNT; index += 1) {
      const slot = this.sparkSlots[index]!;
      const offset = index * 3;
      if (!slot.active) {
        this.sparkPositions[offset + 1] = -1000;
        this.sparkSizes[index] = 0;
        continue;
      }
      live += 1;
      const life = slot.age / Math.max(slot.life, 1e-4);
      this.sparkPositions[offset] = slot.x;
      this.sparkPositions[offset + 1] = slot.y;
      this.sparkPositions[offset + 2] = slot.z;
      const color = slot.smoke ? cool : hot;
      this.sparkColors[offset] = color.r;
      this.sparkColors[offset + 1] = color.g;
      this.sparkColors[offset + 2] = color.b;
      this.sparkSizes[index] = slot.size * (1 - life * 0.7);
    }
    const positions = this.sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
    const colors = this.sparks.geometry.getAttribute("color") as THREE.BufferAttribute;
    const sizes = this.sparks.geometry.getAttribute("size") as THREE.BufferAttribute;
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    sizes.needsUpdate = true;
    this.activeSparkCountValue = live;
    this.sparks.visible = live > 0;
  }
}
