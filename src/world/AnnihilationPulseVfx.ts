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

export type AnnihilationBurstShape =
  | "splatter"
  | "ember"
  | "crystal"
  | "droplet"
  | "bubble"
  | "spore"
  | "shard"
  | "crumb";

export interface AnnihilationBurstProfile {
  material: AnnihilationBurstMaterial;
  primary: number;
  secondary: number;
  gravity: number;
  speed: number;
  shape: AnnihilationBurstShape;
  lifeMin: number;
  lifeMax: number;
  sizeMin: number;
  sizeMax: number;
}

const BURST_PROFILES: Readonly<Record<AnnihilationBurstMaterial, AnnihilationBurstProfile>> = {
  blood: {
    material: "blood",
    primary: 0xa4162b,
    secondary: 0xf06b4e,
    gravity: 3.4,
    speed: 2.8,
    shape: "splatter",
    lifeMin: 0.42,
    lifeMax: 0.78,
    sizeMin: 0.065,
    sizeMax: 0.115,
  },
  slag: {
    material: "slag",
    primary: 0xf04b16,
    secondary: 0xffc05b,
    gravity: 1.8,
    speed: 2.6,
    shape: "ember",
    lifeMin: 0.48,
    lifeMax: 0.82,
    sizeMin: 0.06,
    sizeMax: 0.105,
  },
  ice: {
    material: "ice",
    primary: 0x86ecff,
    secondary: 0xe2ffff,
    gravity: 1.4,
    speed: 2.4,
    shape: "crystal",
    lifeMin: 0.58,
    lifeMax: 0.96,
    sizeMin: 0.075,
    sizeMax: 0.13,
  },
  sap: {
    material: "sap",
    primary: 0x4cae58,
    secondary: 0xc8e36b,
    gravity: 2.5,
    speed: 2.35,
    shape: "droplet",
    lifeMin: 0.52,
    lifeMax: 0.88,
    sizeMin: 0.07,
    sizeMax: 0.12,
  },
  water: {
    material: "water",
    primary: 0x39bac2,
    secondary: 0xb6fff0,
    gravity: 2.1,
    speed: 2.25,
    shape: "bubble",
    lifeMin: 0.62,
    lifeMax: 1,
    sizeMin: 0.08,
    sizeMax: 0.135,
  },
  spore: {
    material: "spore",
    primary: 0xa05bd0,
    secondary: 0x68e2bc,
    gravity: 0.9,
    speed: 1.9,
    shape: "spore",
    lifeMin: 0.82,
    lifeMax: 1.28,
    sizeMin: 0.085,
    sizeMax: 0.145,
  },
  obsidian: {
    material: "obsidian",
    primary: 0x6f3d93,
    secondary: 0xd28bd7,
    gravity: 2.2,
    speed: 2.7,
    shape: "shard",
    lifeMin: 0.5,
    lifeMax: 0.86,
    sizeMin: 0.075,
    sizeMax: 0.13,
  },
  dust: {
    material: "dust",
    primary: 0xbba56a,
    secondary: 0xf2dd9a,
    gravity: 2.9,
    speed: 2.1,
    shape: "crumb",
    lifeMin: 0.56,
    lifeMax: 0.96,
    sizeMin: 0.065,
    sizeMax: 0.12,
  },
};

const BURST_SHAPE_ID: Readonly<Record<AnnihilationBurstShape, number>> = {
  splatter: 0,
  ember: 1,
  crystal: 2,
  droplet: 3,
  bubble: 4,
  spore: 5,
  shard: 6,
  crumb: 7,
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
      attribute float aShape;
      attribute float aSpin;
      varying vec3 vColor;
      varying float vAlpha;
      varying float vShape;
      varying float vSpin;
      void main() {
        vColor = color;
        vAlpha = aAlpha;
        vShape = aShape;
        vSpin = aSpin;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * (250.0 / max(0.8, -mvPosition.z)), 1.0, 20.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vShape;
      varying float vSpin;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float cs = cos(vSpin);
        float sn = sin(vSpin);
        uv = mat2(cs, -sn, sn, cs) * uv;
        float d = length(uv);
        float mask = 0.0;

        if (vShape < 0.5) {
          float angle = atan(uv.y, uv.x);
          float edge = 0.3 + sin(angle * 5.0 + vSpin) * 0.08;
          float body = smoothstep(edge + 0.08, edge - 0.09, d);
          float tail = smoothstep(0.18, 0.02, length(vec2(uv.x * 2.5, uv.y + 0.28)));
          mask = max(body, tail);
        } else if (vShape < 1.5) {
          float diamond = abs(uv.x) * 1.1 + abs(uv.y) * 1.45;
          float ember = 1.0 - smoothstep(0.25, 0.48, diamond);
          float hot = smoothstep(0.2, 0.03, d);
          mask = max(ember, hot);
        } else if (vShape < 2.5) {
          float crystal = abs(uv.x) * 2.7 + abs(uv.y) * 0.7;
          float body = 1.0 - smoothstep(0.28, 0.48, crystal);
          float glint = 1.0 - smoothstep(0.02, 0.06, min(abs(uv.x), abs(uv.y)));
          mask = max(body, glint * smoothstep(0.45, 0.12, d));
        } else if (vShape < 3.5) {
          vec2 drop = vec2(uv.x * 1.7, uv.y * 0.8 + 0.09);
          float body = smoothstep(0.43, 0.08, length(drop));
          float tip = smoothstep(0.2, 0.02, length(vec2(uv.x * 2.6, uv.y + 0.3)));
          mask = max(body, tip) * smoothstep(0.5, 0.13, abs(uv.x));
        } else if (vShape < 4.5) {
          float ring = 1.0 - smoothstep(0.025, 0.075, abs(d - 0.31));
          float glint = smoothstep(0.11, 0.015, length(uv - vec2(-0.13, 0.13)));
          mask = max(ring * 0.9, glint);
        } else if (vShape < 5.5) {
          float core = smoothstep(0.34, 0.08, d);
          float dotA = smoothstep(0.09, 0.02, length(uv - vec2(0.2, 0.08)));
          float dotB = smoothstep(0.075, 0.02, length(uv - vec2(-0.17, -0.14)));
          mask = max(core * 0.72, max(dotA, dotB));
        } else if (vShape < 6.5) {
          float shard = length(vec2(uv.x * 3.6, uv.y * 0.74));
          float fracture = 1.0 - smoothstep(0.02, 0.06, abs(uv.x + uv.y * 0.28));
          mask = max(smoothstep(0.48, 0.08, shard), fracture * smoothstep(0.36, 0.08, d));
        } else {
          float angle = atan(uv.y, uv.x);
          float rough = 0.29 + sin(angle * 4.0 + vSpin * 1.7) * 0.085;
          mask = smoothstep(rough + 0.08, rough - 0.1, d);
        }

        float alpha = mask * vAlpha;
        if (alpha < 0.015) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
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
  private readonly shapes = new Float32Array(MAX_BURST_PARTICLES);
  private readonly spins = new Float32Array(MAX_BURST_PARTICLES);
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
    this.geometry.setAttribute("aShape", new THREE.BufferAttribute(this.shapes, 1));
    this.geometry.setAttribute("aSpin", new THREE.BufferAttribute(this.spins, 1));
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
      this.lives[index] = profile.lifeMin + randomTwo * (profile.lifeMax - profile.lifeMin);
      this.sizes[index] = profile.sizeMin + random * (profile.sizeMax - profile.sizeMin);
      this.shapes[index] = BURST_SHAPE_ID[profile.shape];
      this.spins[index] = angle + randomTwo * Math.PI;
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
    this.geometry.getAttribute("aShape").needsUpdate = true;
    this.geometry.getAttribute("aSpin").needsUpdate = true;
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
    this.sizes.fill(0.065);
    this.shapes.fill(BURST_SHAPE_ID.crumb);
    this.spins.fill(0);
    this.geometry.getAttribute("position").needsUpdate = true;
    this.geometry.getAttribute("color").needsUpdate = true;
    this.geometry.getAttribute("aAlpha").needsUpdate = true;
    this.geometry.getAttribute("aSize").needsUpdate = true;
    this.geometry.getAttribute("aShape").needsUpdate = true;
    this.geometry.getAttribute("aSpin").needsUpdate = true;
  }
}
