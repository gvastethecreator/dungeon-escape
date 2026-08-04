import * as THREE from "three";
import type { SceneTextureSink } from "../systems/SceneTextureRegistry";

import { LUMINOUS_WARD_DURATION_SECONDS } from "../game/LuminousWard";

export interface LuminousWardViewer {
  x: number;
  y: number;
  z: number;
}

/** Orbiting light motes around the player field. */
export const WARD_PARTICLE_COUNT = 16;
/** History samples per mote used for the motion trail. */
export const WARD_TRAIL_SAMPLES = 4;
/** Soft green core of the ward field. */
const WARD_COLOR = 0xc7f39a;
const WARD_COLOR_OUTER = 0x84b75d;
const WARD_COLOR_CORE = 0xe8ffc8;

interface WardMote {
  /** Base orbit angle offset (radians). */
  phase: number;
  /** Orbit radius in meters. */
  radius: number;
  /** Mean height above the ground field. */
  height: number;
  /** Angular speed (rad/s). */
  spin: number;
  /** Vertical bob speed. */
  bob: number;
  /** Vertical bob amplitude. */
  bobAmp: number;
  /** Size multiplier for the live particle. */
  size: number;
  /** Accumulated travel used to space trail samples. */
  distanceSinceSample: number;
  lastX: number;
  lastY: number;
  lastZ: number;
  hasLast: boolean;
  /** Ring buffer of world-relative trail positions. */
  trail: Array<{ x: number; y: number; z: number; strength: number }>;
  trailWrite: number;
  trailFilled: number;
}

/**
 * Soft circular disc texture for Points (radial alpha falloff).
 * Works in browser (Canvas) and headless tests (DataTexture).
 */
export function createWardParticleTexture(size = 48): THREE.Texture {
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
        // Hot core + soft rim so Points read as circles, not squares.
        const alpha = dist >= 1 ? 0 : Math.pow(core, 1.35);
        const i = (y * resolution + x) * 4;
        const glow = 0.72 + core * 0.28;
        data[i] = Math.round(255 * glow);
        data[i + 1] = Math.round(252 * glow);
        data[i + 2] = Math.round(230 * glow);
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
  if (!context) throw new Error("Unable to create ward particle texture.");
  const mid = resolution * 0.5;
  const gradient = context.createRadialGradient(mid, mid, 0, mid, mid, mid * 0.98);
  gradient.addColorStop(0, "rgba(255, 255, 240, 1)");
  gradient.addColorStop(0.18, "rgba(232, 255, 200, 0.95)");
  gradient.addColorStop(0.48, "rgba(180, 230, 120, 0.55)");
  gradient.addColorStop(0.78, "rgba(120, 170, 70, 0.18)");
  gradient.addColorStop(1, "rgba(80, 120, 40, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, resolution, resolution);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Radial soft fill for the ground aura disc (opaque centre, soft edge).
 */
export function createWardAuraDiscTexture(size = 128): THREE.Texture {
  const resolution = Math.max(16, Math.trunc(size));
  if (typeof document === "undefined") {
    const data = new Uint8Array(resolution * resolution * 4);
    const half = (resolution - 1) * 0.5;
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const dx = (x - half) / half;
        const dy = (y - half) / half;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const edge = Math.max(0, 1 - dist);
        // Soft fill with a thin brighter rim near the outer edge.
        const fill = Math.pow(edge, 1.1) * 0.55;
        const rim = Math.exp(-Math.pow((dist - 0.86) / 0.1, 2)) * 0.85;
        const alpha = Math.min(1, fill + rim) * (dist >= 1 ? 0 : 1);
        const i = (y * resolution + x) * 4;
        data[i] = 190;
        data[i + 1] = 240;
        data[i + 2] = 140;
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
  if (!context) throw new Error("Unable to create ward aura disc texture.");
  const mid = resolution * 0.5;
  const fill = context.createRadialGradient(mid, mid, mid * 0.05, mid, mid, mid * 0.98);
  fill.addColorStop(0, "rgba(210, 255, 160, 0.42)");
  fill.addColorStop(0.45, "rgba(150, 210, 90, 0.22)");
  fill.addColorStop(0.78, "rgba(110, 170, 60, 0.12)");
  fill.addColorStop(0.9, "rgba(180, 240, 120, 0.55)");
  fill.addColorStop(1, "rgba(90, 140, 50, 0)");
  context.fillStyle = fill;
  context.fillRect(0, 0, resolution, resolution);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createShieldMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(WARD_COLOR) },
      uRimColor: { value: new THREE.Color(WARD_COLOR_CORE) },
      uOpacity: { value: 0 },
      uPulse: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uRimColor;
      uniform float uOpacity;
      uniform float uPulse;
      uniform float uTime;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float ndotv = abs(dot(normalize(vWorldNormal), viewDir));
        // Soft shell: invisible head-on, bright on the silhouette.
        float fresnel = pow(1.0 - ndotv, 2.35);
        float bands = 0.55 + 0.45 * sin(vWorldPosition.y * 7.5 + uTime * 1.8);
        float hex = 0.72 + 0.28 * sin((vWorldPosition.x + vWorldPosition.z) * 4.2 - uTime * 1.1);
        float shell = fresnel * bands * hex * uPulse;
        vec3 color = mix(uColor, uRimColor, clamp(fresnel * 1.15, 0.0, 1.0));
        float alpha = shell * uOpacity;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
}

/**
 * Player-centred field for the luminous ward. The light remains in the scene
 * at all times; intensity and material opacity fade to zero after expiry.
 * This avoids a renderer light-list rebuild when the item is picked up.
 */
export class LuminousWardVfx {
  readonly root = new THREE.Group();
  readonly light: THREE.PointLight;
  private readonly groundDisc: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly innerRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly outerRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly shield: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly motes: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly trails: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly particleTexture: THREE.Texture;
  private readonly auraTexture: THREE.Texture;
  private readonly moteData: WardMote[];
  private readonly motePositions: Float32Array;
  private readonly trailPositions: Float32Array;
  private readonly trailSizes: Float32Array;
  private readonly trailAlphas: Float32Array;
  private readonly baseLightIntensity = 2.8;
  private readonly baseLightRange = 10;
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private lastElapsed = 0;
  private hasElapsed = false;
  private particlesActive = false;
  /** True when inactive fields already sit at zero cost (no uniform churn). */
  private idleClean = false;
  private disposed = false;

  constructor(private readonly textureSink?: SceneTextureSink) {
    this.root.name = "Luminous ward player field";

    this.particleTexture = createWardParticleTexture();
    this.auraTexture = createWardAuraDiscTexture();
    this.textureSink?.register(this.particleTexture);
    this.textureSink?.register(this.auraTexture);

    this.light = new THREE.PointLight(0xb9e879, 0, this.baseLightRange, 2);
    this.light.name = "Luminous ward area light";
    this.light.position.y = 1.22;

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: WARD_COLOR,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const outerMaterial = ringMaterial.clone();
    outerMaterial.color.setHex(WARD_COLOR_OUTER);

    this.groundDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(7.4, 7.4),
      new THREE.MeshBasicMaterial({
        map: this.auraTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    );
    this.groundDisc.name = "Luminous ward ground aura";
    this.groundDisc.rotation.x = -Math.PI / 2;
    this.groundDisc.position.y = 0.018;
    this.groundDisc.renderOrder = 2;

    this.innerRing = new THREE.Mesh(new THREE.RingGeometry(3.05, 3.32, 48), ringMaterial);
    this.innerRing.name = "Luminous ward ground radius";
    this.innerRing.rotation.x = -Math.PI / 2;
    this.innerRing.position.y = 0.03;
    this.innerRing.renderOrder = 3;

    this.outerRing = new THREE.Mesh(new THREE.TorusGeometry(3.55, 0.032, 6, 48), outerMaterial);
    this.outerRing.name = "Luminous ward outer ring";
    this.outerRing.rotation.x = -Math.PI / 2;
    this.outerRing.position.y = 0.07;
    this.outerRing.renderOrder = 3;

    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(3.15, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.58),
      createShieldMaterial(),
    );
    this.shield.name = "Luminous ward protective shell";
    this.shield.position.y = 0.08;
    this.shield.renderOrder = 2;
    this.shield.frustumCulled = false;

    this.moteData = Array.from({ length: WARD_PARTICLE_COUNT }, (_, index) => {
      const t = index / WARD_PARTICLE_COUNT;
      return {
        phase: t * Math.PI * 2 + (index % 3) * 0.37,
        radius: 1.55 + (index % 7) * 0.28 + (index % 2) * 0.12,
        height: 0.42 + (index % 5) * 0.28 + (index % 3) * 0.08,
        spin: 0.4 + (index % 5) * 0.12 + (index % 2 === 0 ? 0.08 : -0.05),
        bob: 1.1 + (index % 4) * 0.35,
        bobAmp: 0.07 + (index % 3) * 0.03,
        size: 0.072 + (index % 4) * 0.014,
        distanceSinceSample: 0,
        lastX: 0,
        lastY: 0,
        lastZ: 0,
        hasLast: false,
        trail: Array.from({ length: WARD_TRAIL_SAMPLES }, () => ({
          x: 0,
          y: 0,
          z: 0,
          strength: 0,
        })),
        trailWrite: 0,
        trailFilled: 0,
      } satisfies WardMote;
    });

    this.motePositions = new Float32Array(WARD_PARTICLE_COUNT * 3);
    this.trailPositions = new Float32Array(WARD_PARTICLE_COUNT * WARD_TRAIL_SAMPLES * 3);
    this.trailSizes = new Float32Array(WARD_PARTICLE_COUNT * WARD_TRAIL_SAMPLES);
    this.trailAlphas = new Float32Array(WARD_PARTICLE_COUNT * WARD_TRAIL_SAMPLES);

    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute("position", new THREE.BufferAttribute(this.motePositions, 3));
    this.motes = new THREE.Points(
      moteGeometry,
      new THREE.PointsMaterial({
        map: this.particleTexture,
        color: WARD_COLOR_CORE,
        size: 0.14,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        toneMapped: false,
        alphaTest: 0.02,
      }),
    );
    this.motes.name = "Luminous ward floating motes";
    this.motes.renderOrder = 4;
    this.motes.frustumCulled = false;

    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3));
    trailGeometry.setAttribute("aTrailSize", new THREE.BufferAttribute(this.trailSizes, 1));
    trailGeometry.setAttribute("aTrailAlpha", new THREE.BufferAttribute(this.trailAlphas, 1));
    const trailMaterial = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.particleTexture },
        uColor: { value: new THREE.Color(WARD_COLOR) },
        uOpacity: { value: 0 },
        uPixelRatio: {
          value: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1,
        },
        uBaseSize: { value: 110 },
      },
      vertexShader: /* glsl */ `
        attribute float aTrailSize;
        attribute float aTrailAlpha;
        uniform float uPixelRatio;
        uniform float uBaseSize;
        varying float vTrailAlpha;
        void main() {
          vTrailAlpha = aTrailAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float size = max(aTrailSize, 0.001) * uBaseSize * uPixelRatio;
          gl_PointSize = size / max(0.12, -mvPosition.z);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vTrailAlpha;
        void main() {
          vec4 texel = texture2D(map, gl_PointCoord);
          float alpha = texel.a * vTrailAlpha * uOpacity;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(uColor * texel.rgb, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    });
    this.trails = new THREE.Points(trailGeometry, trailMaterial);
    this.trails.name = "Luminous ward motion trails";
    this.trails.renderOrder = 3;
    this.trails.frustumCulled = false;

    this.root.add(
      this.light,
      this.groundDisc,
      this.innerRing,
      this.outerRing,
      this.shield,
      this.trails,
      this.motes,
    );
    this.update(0, 0, { x: 0, y: 0, z: 0 }, 0);
  }

  update(remaining: number, elapsed: number, viewer: LuminousWardViewer, delta = 0): void {
    const active = remaining > 0.0001;
    // Keep the ward graph compiled for warmup, but skip uniform churn while idle.
    if (!active && this.idleClean && !this.particlesActive) return;

    const life = THREE.MathUtils.clamp(remaining / LUMINOUS_WARD_DURATION_SECONDS, 0, 1);
    const pulse = 0.96 + Math.sin(elapsed * 3.4) * 0.04;
    const breath = 0.98 + Math.sin(elapsed * 1.35) * 0.02;
    const fade = active ? 0.76 + life * 0.24 : 0;
    const urgency = life < 0.16 ? 1 + (0.16 - life) * 0.8 : 1;

    let step = delta;
    if (!Number.isFinite(step) || step <= 0) {
      step = this.hasElapsed ? Math.max(0, elapsed - this.lastElapsed) : 0;
    }
    // Cap one-frame catch-up so trails do not explode after a hitch.
    step = Math.min(0.05, Math.max(0, step));
    this.lastElapsed = elapsed;
    this.hasElapsed = true;

    this.position.set(viewer.x, Math.max(0.02, viewer.y - 1.48), viewer.z);
    this.root.position.copy(this.position);

    this.light.intensity = this.baseLightIntensity * fade * pulse * urgency;
    this.light.distance = this.baseLightRange;
    this.light.color.setHex(life < 0.18 ? 0xd4ff8a : 0xb9e879);

    // First-person priority: anchor the protected radius on the floor and let
    // the Fresnel shell carry height without drawing rings across enemy silhouettes.
    this.groundDisc.material.opacity = 0.14 * fade * breath;
    this.innerRing.material.opacity = 0.06 * fade * pulse;
    this.outerRing.material.opacity = 0.11 * fade * pulse * urgency;

    const shieldMat = this.shield.material;
    shieldMat.uniforms.uOpacity.value = 0.14 * fade;
    shieldMat.uniforms.uPulse.value = pulse * breath * urgency;
    shieldMat.uniforms.uTime.value = elapsed;
    // Slight warm shift as the ward runs out.
    (shieldMat.uniforms.uColor.value as THREE.Color).setHex(life < 0.18 ? 0xd8ff90 : WARD_COLOR);

    this.motes.material.opacity = 0.38 * fade;
    this.trails.material.uniforms.uOpacity.value = 0.2 * fade;

    this.outerRing.rotation.z = elapsed * 0.25;
    this.shield.rotation.y = elapsed * 0.11;

    this.scale.setScalar(0.96 + pulse * 0.06);
    this.groundDisc.scale.setScalar(0.98 + breath * 0.04);
    this.innerRing.scale.copy(this.scale);
    this.outerRing.scale.copy(this.scale);
    this.shield.scale.setScalar((0.98 + breath * 0.05) * (0.96 + life * 0.05));

    const nextParticlesActive = active && fade > 0.001;
    if (nextParticlesActive || this.particlesActive) {
      this.updateParticles(elapsed, step, nextParticlesActive);
    }
    this.particlesActive = nextParticlesActive;
    this.idleClean = !active && !nextParticlesActive;
  }

  private updateParticles(elapsed: number, delta: number, active: boolean): void {
    const trailCount = WARD_PARTICLE_COUNT * WARD_TRAIL_SAMPLES;
    if (!active) {
      for (let i = 0; i < WARD_PARTICLE_COUNT; i += 1) {
        this.motePositions[i * 3] = 0;
        this.motePositions[i * 3 + 1] = -20;
        this.motePositions[i * 3 + 2] = 0;
        const mote = this.moteData[i]!;
        mote.hasLast = false;
        mote.distanceSinceSample = 0;
        mote.trailFilled = 0;
      }
      for (let i = 0; i < trailCount; i += 1) {
        this.trailPositions[i * 3] = 0;
        this.trailPositions[i * 3 + 1] = -20;
        this.trailPositions[i * 3 + 2] = 0;
        this.trailSizes[i] = 0;
        this.trailAlphas[i] = 0;
      }
      this.markParticleBuffersDirty();
      return;
    }

    // Minimum travel (m) before writing a new trail sample.
    const sampleSpacing = 0.05;
    const fadePerSecond = 2.8;

    for (let index = 0; index < WARD_PARTICLE_COUNT; index += 1) {
      const mote = this.moteData[index]!;
      const angle = mote.phase + elapsed * mote.spin;
      // Mild radius pulse so paths do not look perfectly circular.
      const radius = mote.radius * (0.94 + 0.06 * Math.sin(elapsed * 1.3 + mote.phase * 2.1));
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = mote.height + Math.sin(elapsed * mote.bob + mote.phase) * mote.bobAmp;

      this.motePositions[index * 3] = x;
      this.motePositions[index * 3 + 1] = y;
      this.motePositions[index * 3 + 2] = z;

      if (mote.hasLast && delta > 0) {
        const dx = x - mote.lastX;
        const dy = y - mote.lastY;
        const dz = z - mote.lastZ;
        const moved = Math.hypot(dx, dy, dz);
        mote.distanceSinceSample += moved;

        // Continuous trail fade while the mote travels.
        for (let s = 0; s < mote.trailFilled; s += 1) {
          const sample = mote.trail[s]!;
          sample.strength = Math.max(0, sample.strength - fadePerSecond * delta);
        }

        while (mote.distanceSinceSample >= sampleSpacing) {
          mote.distanceSinceSample -= sampleSpacing;
          const slot = mote.trail[mote.trailWrite]!;
          slot.x = x;
          slot.y = y;
          slot.z = z;
          slot.strength = 1;
          mote.trailWrite = (mote.trailWrite + 1) % WARD_TRAIL_SAMPLES;
          mote.trailFilled = Math.min(WARD_TRAIL_SAMPLES, mote.trailFilled + 1);
        }
      }

      mote.lastX = x;
      mote.lastY = y;
      mote.lastZ = z;
      mote.hasLast = true;

      // Write trail samples into the shared buffer (oldest → newest).
      for (let sampleIndex = 0; sampleIndex < WARD_TRAIL_SAMPLES; sampleIndex += 1) {
        const bufferIndex = index * WARD_TRAIL_SAMPLES + sampleIndex;
        if (sampleIndex >= mote.trailFilled) {
          this.trailPositions[bufferIndex * 3] = x;
          this.trailPositions[bufferIndex * 3 + 1] = -20;
          this.trailPositions[bufferIndex * 3 + 2] = z;
          this.trailSizes[bufferIndex] = 0;
          this.trailAlphas[bufferIndex] = 0;
          continue;
        }
        // Read chronological order: oldest first.
        const read =
          (mote.trailWrite - mote.trailFilled + sampleIndex + WARD_TRAIL_SAMPLES * 4) %
          WARD_TRAIL_SAMPLES;
        const sample = mote.trail[read]!;
        const ageT = (sampleIndex + 1) / (mote.trailFilled + 1);
        const strength = sample.strength * ageT;
        this.trailPositions[bufferIndex * 3] = sample.x;
        this.trailPositions[bufferIndex * 3 + 1] = sample.y;
        this.trailPositions[bufferIndex * 3 + 2] = sample.z;
        // Older samples shrink; newer ones stay close to the mote size.
        this.trailSizes[bufferIndex] = (0.35 + ageT * 0.75) * (mote.size / 0.12);
        this.trailAlphas[bufferIndex] = strength * (0.2 + ageT * 0.75);
      }
    }

    this.markParticleBuffersDirty();
  }

  private markParticleBuffersDirty(): void {
    const motePos = this.motes.geometry.getAttribute("position") as THREE.BufferAttribute;
    motePos.needsUpdate = true;
    const trailPos = this.trails.geometry.getAttribute("position") as THREE.BufferAttribute;
    trailPos.needsUpdate = true;
    const trailSize = this.trails.geometry.getAttribute("aTrailSize") as THREE.BufferAttribute;
    trailSize.needsUpdate = true;
    const trailAlpha = this.trails.geometry.getAttribute("aTrailAlpha") as THREE.BufferAttribute;
    trailAlpha.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.textureSink?.unregister(this.particleTexture);
    this.textureSink?.unregister(this.auraTexture);
    this.groundDisc.geometry.dispose();
    this.groundDisc.material.dispose();
    this.innerRing.geometry.dispose();
    this.innerRing.material.dispose();
    this.outerRing.geometry.dispose();
    this.outerRing.material.dispose();
    this.shield.geometry.dispose();
    this.shield.material.dispose();
    this.motes.geometry.dispose();
    this.motes.material.dispose();
    this.trails.geometry.dispose();
    this.trails.material.dispose();
    this.particleTexture.dispose();
    this.auraTexture.dispose();
    this.root.clear();
  }
}
