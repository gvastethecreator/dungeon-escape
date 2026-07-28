import * as THREE from "three";

import {
  ANNIHILATION_PULSE_RADIUS,
  ANNIHILATION_PULSE_REPEL_RADIUS,
} from "../game/AnnihilationPulse";

export type AnnihilationBurstMaterial =
  | "blood"
  | "slag"
  | "ice"
  | "sap"
  | "water"
  | "spore"
  | "obsidian"
  | "dust";

export interface AnnihilationBurstProfile {
  material: AnnihilationBurstMaterial;
  primary: number;
  secondary: number;
  gravity: number;
  speed: number;
}

const BURST_PROFILES: Readonly<Record<AnnihilationBurstMaterial, AnnihilationBurstProfile>> = {
  blood: { material: "blood", primary: 0xa4162b, secondary: 0xf06b4e, gravity: 3.4, speed: 2.8 },
  slag: { material: "slag", primary: 0xf04b16, secondary: 0xffc05b, gravity: 1.8, speed: 2.6 },
  ice: { material: "ice", primary: 0x86ecff, secondary: 0xe2ffff, gravity: 1.4, speed: 2.4 },
  sap: { material: "sap", primary: 0x4cae58, secondary: 0xc8e36b, gravity: 2.5, speed: 2.35 },
  water: { material: "water", primary: 0x39bac2, secondary: 0xb6fff0, gravity: 2.1, speed: 2.25 },
  spore: { material: "spore", primary: 0xa05bd0, secondary: 0x68e2bc, gravity: 0.9, speed: 1.9 },
  obsidian: {
    material: "obsidian",
    primary: 0x6f3d93,
    secondary: 0xd28bd7,
    gravity: 2.2,
    speed: 2.7,
  },
  dust: { material: "dust", primary: 0xbba56a, secondary: 0xf2dd9a, gravity: 2.9, speed: 2.1 },
};

const BLOOD_BIOMES = new Set(["ancient", "grim", "ash", "iron"]);

export function getAnnihilationBurstProfile(
  moodId: string | null | undefined,
): AnnihilationBurstProfile {
  const id = (moodId ?? "ash").trim().toLowerCase();
  if (BLOOD_BIOMES.has(id)) return BURST_PROFILES.blood;
  if (id === "molten") return BURST_PROFILES.slag;
  if (id === "frost") return BURST_PROFILES.ice;
  if (id === "verdant") return BURST_PROFILES.sap;
  if (id === "sunken") return BURST_PROFILES.water;
  if (id === "fungal") return BURST_PROFILES.spore;
  if (id === "obsidian") return BURST_PROFILES.obsidian;
  return BURST_PROFILES.dust;
}

interface PulseRingSlot {
  root: THREE.Group;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  active: boolean;
  age: number;
}

const PULSE_RING_COUNT = 4;
const PULSE_RING_DURATION = 0.72;
const MAX_BURST_PARTICLES = 288;

function hash(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function colorChannels(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

function createPulseRing(index: number): PulseRingSlot {
  const root = new THREE.Group();
  root.name = `Annihilation pulse ring ${index + 1}`;
  root.visible = false;
  const material = new THREE.MeshBasicMaterial({
    color: 0xff7198,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 56), material);
  ring.name = "Annihilation expanding kill ring";
  ring.rotation.x = -Math.PI / 2;
  ring.frustumCulled = false;
  root.add(ring);
  return { root, ring, active: false, age: 0 };
}

function createBurstMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {},
    vertexShader: `
      attribute float aAlpha;
      attribute float aSize;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (220.0 / max(1.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 point = gl_PointCoord - vec2(0.5);
        float distanceToCenter = length(point);
        if (distanceToCenter > 0.5) discard;
        float edge = 1.0 - smoothstep(0.2, 0.5, distanceToCenter);
        gl_FragColor = vec4(vColor, vAlpha * edge);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
}

/** Fixed-budget field, expanding rings, and biome-aware enemy death particles. */
export class AnnihilationPulseVfx {
  readonly root = new THREE.Group();
  private readonly rings = Array.from({ length: PULSE_RING_COUNT }, (_, index) =>
    createPulseRing(index),
  );
  private readonly positions = new Float32Array(MAX_BURST_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_BURST_PARTICLES * 3);
  private readonly alphas = new Float32Array(MAX_BURST_PARTICLES);
  private readonly sizes = new Float32Array(MAX_BURST_PARTICLES);
  private readonly ages = new Float32Array(MAX_BURST_PARTICLES);
  private readonly lives = new Float32Array(MAX_BURST_PARTICLES);
  private readonly velocityX = new Float32Array(MAX_BURST_PARTICLES);
  private readonly velocityY = new Float32Array(MAX_BURST_PARTICLES);
  private readonly velocityZ = new Float32Array(MAX_BURST_PARTICLES);
  private readonly particleActive = new Uint8Array(MAX_BURST_PARTICLES);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly particles: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly field: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly fieldCore: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private readonly light: THREE.PointLight;
  private particleCursor = 0;
  private ringCursor = 0;
  private activeBurstCountValue = 0;

  constructor() {
    this.root.name = "Annihilation pulse field and death particles";

    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));
    this.particles = new THREE.Points(this.geometry, createBurstMaterial());
    this.particles.name = "Biome annihilation enemy particles";
    this.particles.frustumCulled = false;
    this.particles.visible = true;

    this.field = new THREE.Mesh(
      new THREE.TorusGeometry(ANNIHILATION_PULSE_REPEL_RADIUS, 0.018, 6, 72),
      new THREE.MeshBasicMaterial({
        color: 0xff7198,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.field.name = "Annihilation repel radius";
    this.field.rotation.x = Math.PI / 2;
    this.field.frustumCulled = false;

    this.fieldCore = new THREE.Mesh(
      new THREE.CircleGeometry(ANNIHILATION_PULSE_RADIUS * 0.98, 48),
      new THREE.MeshBasicMaterial({
        color: 0x8f284e,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.fieldCore.name = "Annihilation pulse inner field";
    this.fieldCore.rotation.x = -Math.PI / 2;
    this.fieldCore.frustumCulled = false;

    this.light = new THREE.PointLight(0xff6d91, 0, 10, 2);
    this.light.name = "Annihilation pulse field light";

    this.root.add(this.field, this.fieldCore, this.light, this.particles);
    this.root.add(...this.rings.map((ring) => ring.root));
    this.clearParticleBuffers();
  }

  get activeBurstCount(): number {
    return this.activeBurstCountValue;
  }

  triggerPulse(position: THREE.Vector3Like, moodId: string | null | undefined): void {
    const slot = this.rings[this.ringCursor] ?? this.rings[0]!;
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    const profile = getAnnihilationBurstProfile(moodId);
    slot.active = true;
    slot.age = 0;
    slot.root.visible = true;
    slot.root.position.set(position.x, 0.055, position.z);
    slot.root.scale.setScalar(0.18);
    slot.ring.material.color.setHex(profile.primary);
    slot.ring.material.opacity = 0.82;
  }

  triggerEnemyBurst(
    position: THREE.Vector3Like,
    moodId: string | null | undefined,
    seed = 0,
  ): void {
    const profile = getAnnihilationBurstProfile(moodId);
    const primary = colorChannels(profile.primary);
    const secondary = colorChannels(profile.secondary);
    for (let particle = 0; particle < 18; particle += 1) {
      const index = this.particleCursor;
      this.particleCursor = (this.particleCursor + 1) % MAX_BURST_PARTICLES;
      const random = hash(seed * 17.13 + particle * 2.71 + index * 0.031);
      const randomTwo = hash(seed * 9.41 + particle * 4.19 + index * 0.071);
      const angle = random * Math.PI * 2;
      const lift = 0.25 + randomTwo * 0.9;
      const speed = profile.speed * (0.64 + random * 0.62);
      const offset = index * 3;
      this.positions[offset] = position.x + Math.cos(angle) * random * 0.1;
      this.positions[offset + 1] = position.y + 0.1 + randomTwo * 0.35;
      this.positions[offset + 2] = position.z + Math.sin(angle) * random * 0.1;
      this.velocityX[index] = Math.cos(angle) * speed;
      this.velocityY[index] = speed * (0.34 + lift * 0.48);
      this.velocityZ[index] = Math.sin(angle) * speed;
      this.ages[index] = 0;
      this.lives[index] = 0.38 + randomTwo * 0.38;
      this.sizes[index] =
        profile.material === "blood" ? 0.045 + random * 0.04 : 0.04 + random * 0.035;
      this.alphas[index] = 0.96;
      const color = particle % 3 === 0 ? secondary : primary;
      this.colors[offset] = color[0];
      this.colors[offset + 1] = color[1];
      this.colors[offset + 2] = color[2];
      this.particleActive[index] = 1;
    }
    this.activeBurstCountValue += 1;
    this.geometry.getAttribute("position").needsUpdate = true;
    this.geometry.getAttribute("color").needsUpdate = true;
    this.geometry.getAttribute("aAlpha").needsUpdate = true;
    this.geometry.getAttribute("aSize").needsUpdate = true;
  }

  update(
    remaining: number,
    elapsed: number,
    viewer: THREE.Vector3Like,
    delta: number,
    moodId: string | null | undefined,
  ): void {
    const active = Number.isFinite(remaining) && remaining > 0.0001;
    const safeDelta = Math.max(0, Number.isFinite(delta) ? delta : 0);
    const profile = getAnnihilationBurstProfile(moodId);
    const pulse = 0.72 + Math.sin(elapsed * 8.2) * Math.sin(elapsed * 3.1) * 0.18;
    this.root.position.set(0, 0, 0);
    this.field.position.set(viewer.x, 0.045, viewer.z);
    this.fieldCore.position.set(viewer.x, 0.038, viewer.z);
    this.light.position.set(viewer.x, 0.8, viewer.z);
    this.field.material.color.setHex(profile.primary);
    this.fieldCore.material.color.setHex(profile.primary);
    this.field.material.opacity = active ? 0.13 + pulse * 0.04 : 0;
    this.fieldCore.material.opacity = active ? 0.012 + pulse * 0.008 : 0;
    this.light.intensity = active ? 0.16 + pulse * 0.16 : 0;

    for (const slot of this.rings) {
      if (!slot.active) continue;
      slot.age += safeDelta;
      const progress = THREE.MathUtils.clamp(slot.age / PULSE_RING_DURATION, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      slot.root.scale.setScalar((ANNIHILATION_PULSE_RADIUS * eased) / 1.02);
      slot.ring.material.opacity = (1 - progress) * 0.82;
      if (progress >= 1) {
        slot.active = false;
        slot.root.visible = false;
      }
    }

    let activeParticles = 0;
    for (let index = 0; index < MAX_BURST_PARTICLES; index += 1) {
      if (this.particleActive[index] === 0) {
        this.alphas[index] = 0;
        continue;
      }
      this.ages[index] += safeDelta;
      const life = this.lives[index]!;
      if (this.ages[index] >= life) {
        this.particleActive[index] = 0;
        this.alphas[index] = 0;
        continue;
      }
      activeParticles += 1;
      const offset = index * 3;
      this.velocityY[index] -= profile.gravity * safeDelta;
      const drag = Math.max(0, 1 - safeDelta * 0.85);
      this.velocityX[index] *= drag;
      this.velocityY[index] *= drag;
      this.velocityZ[index] *= drag;
      this.positions[offset] += this.velocityX[index] * safeDelta;
      this.positions[offset + 1] += this.velocityY[index] * safeDelta;
      this.positions[offset + 2] += this.velocityZ[index] * safeDelta;
      const lifeProgress = this.ages[index] / life;
      this.alphas[index] = Math.pow(1 - lifeProgress, 1.35);
    }
    this.activeBurstCountValue = activeParticles > 0 ? Math.ceil(activeParticles / 18) : 0;
    this.geometry.getAttribute("position").needsUpdate = activeParticles > 0;
    this.geometry.getAttribute("aAlpha").needsUpdate = true;
  }

  setWarmupVisible(visible: boolean): void {
    this.root.visible = true;
    this.field.material.opacity = 0;
    this.fieldCore.material.opacity = 0;
    this.light.intensity = 0;
    for (const slot of this.rings) {
      if (!slot.active) slot.root.visible = visible;
      slot.ring.material.opacity = 0;
    }
    if (visible) this.particles.visible = true;
  }

  dispose(): void {
    this.field.geometry.dispose();
    this.field.material.dispose();
    this.fieldCore.geometry.dispose();
    this.fieldCore.material.dispose();
    for (const slot of this.rings) {
      slot.ring.geometry.dispose();
      slot.ring.material.dispose();
    }
    this.geometry.dispose();
    this.particles.material.dispose();
    this.root.clear();
  }

  private clearParticleBuffers(): void {
    this.positions.fill(0);
    this.colors.fill(0);
    this.alphas.fill(0);
    this.sizes.fill(0.04);
    this.geometry.getAttribute("position").needsUpdate = true;
    this.geometry.getAttribute("color").needsUpdate = true;
    this.geometry.getAttribute("aAlpha").needsUpdate = true;
    this.geometry.getAttribute("aSize").needsUpdate = true;
  }
}
