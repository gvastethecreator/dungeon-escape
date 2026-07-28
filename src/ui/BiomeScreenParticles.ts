import type { BiomeId } from "../systems/BiomeIdentity";
import {
  getBiomeParticleProfile,
  type BiomeParticleLayerProfile,
  type BiomeParticleMotion,
  type BiomeParticleProfile,
  type BiomeParticleShape,
} from "../systems/BiomeParticleProfile";

type ScreenParticleLayerKind = "support" | "signature" | "ceiling";

export interface BiomeScreenParticleLayerTheme {
  kind: ScreenParticleLayerKind;
  name: string;
  motion: BiomeParticleMotion;
  shape: BiomeParticleShape;
  colors: readonly [number, number];
  glow: boolean;
}

export interface BiomeScreenParticleTheme {
  id: BiomeId;
  label: string;
  layers: readonly BiomeScreenParticleLayerTheme[];
}

export interface BiomeScreenParticlesOptions {
  density?: number;
  seedSalt?: number;
}

interface ScreenParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
  phaseSpeed: number;
  rotation: number;
  rotationSpeed: number;
  wobble: number;
  orbitRadius: number;
  color: string;
  glow: boolean;
  layer: BiomeParticleLayerProfile;
}

const LAYER_KINDS = ["support", "signature", "ceiling"] as const;
const LAYER_BUDGET: Record<ScreenParticleLayerKind, number> = {
  support: 28,
  signature: 19,
  ceiling: 7,
};
const FRAME_INTERVAL_MS = 1000 / 30;
const MAX_PIXEL_RATIO = 1.5;
const TAU = Math.PI * 2;

export function biomeScreenParticleTheme(id: BiomeId): BiomeScreenParticleTheme {
  const profile = getBiomeParticleProfile(id);
  return {
    id,
    label: profile.label,
    layers: LAYER_KINDS.map((kind) => {
      const layer = profile[kind];
      return {
        kind,
        name: layer.name,
        motion: layer.motion,
        shape: layer.shape,
        colors: [layer.color, layer.colorAlt] as const,
        glow: layer.glow,
      };
    }),
  };
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(min: number, max: number, amount: number): number {
  return min + (max - min) * amount;
}

function colorToCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function particleVelocity(
  layer: BiomeParticleLayerProfile,
  random: () => number,
): Pick<ScreenParticle, "vx" | "vy"> {
  const jitter = 0.004 + layer.turbulence * 0.012;
  let vx = layer.flowX * 0.085 + mix(-jitter, jitter, random());
  let vy = -layer.flowY * 0.075 + mix(-jitter, jitter, random());
  const speed = 0.008 + layer.speed * 0.055;

  switch (layer.motion) {
    case "rise":
      vy -= speed;
      break;
    case "fall":
      vy += speed;
      break;
    case "drip":
      vy += 0.055 + layer.speed * 0.1;
      vx *= 0.45;
      break;
    case "spark":
      vx += (random() > 0.5 ? 1 : -1) * (0.025 + layer.speed * 0.07);
      vy -= speed * 0.4;
      break;
    case "flutter":
      vx += mix(-0.016, 0.016, random());
      vy += speed * 0.25;
      break;
    case "orbit":
      vx *= 0.25;
      vy *= 0.25;
      break;
    case "pulse":
    case "flicker":
      vx *= 0.42;
      vy *= 0.42;
      break;
    case "drift":
      vx += speed * 0.35;
      break;
  }

  return { vx, vy };
}

function drawParticleShape(
  context: CanvasRenderingContext2D,
  shape: BiomeParticleShape,
  size: number,
): void {
  switch (shape) {
    case "streak":
      context.fillRect(-size * 0.45, -size * 2.2, Math.max(1, size * 0.9), size * 4.4);
      break;
    case "flake":
      context.fillRect(-size * 1.4, -size * 0.25, size * 2.8, Math.max(1, size * 0.5));
      context.fillRect(-size * 0.25, -size * 1.4, Math.max(1, size * 0.5), size * 2.8);
      break;
    case "ash":
      context.beginPath();
      context.moveTo(-size * 1.3, -size * 0.35);
      context.lineTo(size * 0.6, -size);
      context.lineTo(size * 1.2, size * 0.45);
      context.lineTo(-size * 0.45, size);
      context.closePath();
      context.fill();
      break;
    case "wisp":
      context.beginPath();
      context.ellipse(0, 0, size * 2.8, size * 0.72, 0, 0, TAU);
      context.fill();
      break;
    case "spore":
      context.beginPath();
      context.arc(0, 0, size, 0, TAU);
      context.fill();
      context.globalAlpha *= 0.34;
      context.beginPath();
      context.arc(0, 0, size * 2.1, 0, TAU);
      context.fill();
      break;
    case "shard":
      context.beginPath();
      context.moveTo(0, -size * 1.9);
      context.lineTo(size * 0.72, 0);
      context.lineTo(0, size * 1.35);
      context.lineTo(-size * 0.72, 0);
      context.closePath();
      context.fill();
      break;
    case "bubble":
      context.lineWidth = Math.max(1, size * 0.38);
      context.beginPath();
      context.arc(0, 0, size * 1.25, 0, TAU);
      context.stroke();
      break;
    case "block":
      context.fillRect(-size, -size, size * 2, size * 2);
      break;
    case "drop":
      context.beginPath();
      context.moveTo(0, -size * 1.8);
      context.bezierCurveTo(size * 1.3, -size * 0.2, size, size * 1.25, 0, size * 1.45);
      context.bezierCurveTo(-size, size * 1.25, -size * 1.3, -size * 0.2, 0, -size * 1.8);
      context.fill();
      break;
    case "crumb":
      context.fillRect(-size * 0.8, -size * 0.65, size * 1.6, size * 1.3);
      break;
    case "mote":
      context.beginPath();
      context.arc(0, 0, size, 0, TAU);
      context.fill();
      break;
  }
}

export class BiomeScreenParticles {
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D | null;
  readonly #density: number;
  readonly #seedSalt: number;
  readonly #motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  readonly #resizeObserver: ResizeObserver;
  #biomeId: BiomeId;
  #profile: BiomeParticleProfile;
  #particles: ScreenParticle[] = [];
  #active = false;
  #width = 0;
  #height = 0;
  #frameRequest = 0;
  #lastFrameAt = 0;

  constructor(
    canvas: HTMLCanvasElement,
    biomeId: BiomeId,
    options: BiomeScreenParticlesOptions = {},
  ) {
    this.#canvas = canvas;
    this.#context = canvas.getContext("2d", { alpha: true });
    this.#density = Math.max(0.25, Math.min(1.5, options.density ?? 1));
    this.#seedSalt = options.seedSalt ?? 0;
    this.#biomeId = biomeId;
    this.#profile = getBiomeParticleProfile(biomeId);
    this.#canvas.dataset.biomeId = biomeId;
    this.#canvas.dataset.particleLabel = this.#profile.label;
    this.#resizeObserver = new ResizeObserver(() => {
      if (!this.#active) return;
      const changed = this.#resize();
      if (changed) this.#rebuild();
      this.#render(performance.now() / 1000);
    });
    this.#resizeObserver.observe(canvas);
    this.#motionQuery.addEventListener("change", this.#handleMotionPreference);
    document.addEventListener("visibilitychange", this.#handleVisibilityChange);
  }

  setBiome(biomeId: BiomeId): void {
    if (this.#biomeId === biomeId && this.#particles.length > 0) return;
    this.#biomeId = biomeId;
    this.#profile = getBiomeParticleProfile(biomeId);
    this.#canvas.dataset.biomeId = biomeId;
    this.#canvas.dataset.particleLabel = this.#profile.label;
    this.#particles = [];
    if (this.#active) {
      this.#resize();
      this.#rebuild();
      this.#render(performance.now() / 1000);
    }
  }

  setActive(active: boolean): void {
    if (this.#active === active) return;
    this.#active = active;
    this.#canvas.dataset.particleState = active ? "active" : "paused";
    if (!active) {
      this.#stop();
      return;
    }
    this.#resize();
    if (this.#particles.length === 0) this.#rebuild();
    this.#render(performance.now() / 1000);
    this.#start();
  }

  destroy(): void {
    this.#stop();
    this.#resizeObserver.disconnect();
    this.#motionQuery.removeEventListener("change", this.#handleMotionPreference);
    document.removeEventListener("visibilitychange", this.#handleVisibilityChange);
  }

  readonly #handleMotionPreference = (): void => {
    this.#stop();
    if (!this.#active) return;
    this.#render(performance.now() / 1000);
    this.#start();
  };

  readonly #handleVisibilityChange = (): void => {
    if (document.hidden) this.#stop();
    else this.#start();
  };

  #resize(): boolean {
    if (!this.#context) return false;
    const bounds = this.#canvas.getBoundingClientRect();
    const width = Math.round(bounds.width);
    const height = Math.round(bounds.height);
    if (width < 2 || height < 2) return false;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const targetWidth = Math.round(width * pixelRatio);
    const targetHeight = Math.round(height * pixelRatio);
    const changed = width !== this.#width || height !== this.#height;
    if (this.#canvas.width !== targetWidth || this.#canvas.height !== targetHeight) {
      this.#canvas.width = targetWidth;
      this.#canvas.height = targetHeight;
      this.#context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      this.#context.imageSmoothingEnabled = false;
    }
    this.#width = width;
    this.#height = height;
    return changed;
  }

  #rebuild(): void {
    if (this.#width < 2 || this.#height < 2) return;
    const mobileScale = this.#width <= 640 ? 0.58 : this.#width <= 960 ? 0.78 : 1;
    const random = seededRandom(hashSeed(`${this.#biomeId}:${this.#seedSalt}`));
    const particles: ScreenParticle[] = [];

    for (const kind of LAYER_KINDS) {
      const layer = this.#profile[kind];
      const count = Math.max(
        kind === "ceiling" ? 3 : 8,
        Math.round(LAYER_BUDGET[kind] * this.#density * mobileScale),
      );
      for (let index = 0; index < count; index += 1) {
        const velocity = particleVelocity(layer, random);
        const size = 0.9 + mix(layer.sizeMin, layer.sizeMax, random()) * 32;
        particles.push({
          x: random(),
          y: kind === "ceiling" ? random() * 0.56 - 0.08 : random(),
          vx: velocity.vx,
          vy: velocity.vy,
          size,
          alpha: layer.opacity * mix(0.42, 0.86, random()),
          phase: random() * TAU,
          phaseSpeed: mix(0.45, 1.35, random()) * (0.6 + layer.speed),
          rotation: random() * TAU,
          rotationSpeed: mix(-0.7, 0.7, random()) * (0.3 + layer.turbulence),
          wobble: mix(0.002, 0.014, random()) * (0.5 + layer.turbulence),
          orbitRadius: layer.motion === "orbit" ? mix(0.012, 0.045, random()) : 0,
          color: colorToCss(random() > 0.5 ? layer.color : layer.colorAlt),
          glow: layer.glow,
          layer,
        });
      }
    }

    this.#particles = particles;
  }

  #start(): void {
    if (!this.#active || document.hidden || this.#motionQuery.matches || this.#frameRequest !== 0) {
      return;
    }
    this.#lastFrameAt = performance.now();
    this.#frameRequest = window.requestAnimationFrame(this.#tick);
  }

  #stop(): void {
    if (this.#frameRequest !== 0) window.cancelAnimationFrame(this.#frameRequest);
    this.#frameRequest = 0;
  }

  readonly #tick = (time: number): void => {
    this.#frameRequest = 0;
    if (!this.#active || document.hidden || this.#motionQuery.matches) return;
    const elapsed = time - this.#lastFrameAt;
    if (elapsed >= FRAME_INTERVAL_MS) {
      const delta = Math.min(elapsed / 1000, 0.05);
      this.#lastFrameAt = time;
      this.#update(delta, time / 1000);
      this.#render(time / 1000);
    }
    this.#frameRequest = window.requestAnimationFrame(this.#tick);
  };

  #update(delta: number, time: number): void {
    for (const particle of this.#particles) {
      const turbulence = Math.sin(time * particle.phaseSpeed + particle.phase) * particle.wobble;
      particle.x += (particle.vx + turbulence) * delta;
      particle.y += (particle.vy + turbulence * 0.42) * delta;
      particle.rotation += particle.rotationSpeed * delta;

      if (particle.x < -0.1) particle.x = 1.1;
      else if (particle.x > 1.1) particle.x = -0.1;
      if (particle.y < -0.12) particle.y = 1.12;
      else if (particle.y > 1.12) {
        particle.y = -0.12;
        if (particle.layer.motion === "drip") {
          particle.x = (Math.sin(particle.phase * 91.7 + time) + 1) * 0.5;
        }
      }
    }
  }

  #render(time: number): void {
    const context = this.#context;
    if (!context || this.#width < 2 || this.#height < 2) return;
    context.clearRect(0, 0, this.#width, this.#height);

    for (const particle of this.#particles) {
      const pulse =
        particle.layer.motion === "pulse"
          ? 0.64 + Math.sin(time * particle.phaseSpeed + particle.phase) * 0.3
          : 1;
      const flicker =
        particle.layer.motion === "flicker"
          ? Math.sin(time * particle.phaseSpeed * 7 + particle.phase) > 0.25
            ? 1
            : 0.12
          : 1;
      const orbitX = Math.cos(time * particle.phaseSpeed + particle.phase) * particle.orbitRadius;
      const orbitY =
        Math.sin(time * particle.phaseSpeed + particle.phase) * particle.orbitRadius * 0.56;
      const x = (particle.x + orbitX) * this.#width;
      const y = (particle.y + orbitY) * this.#height;

      context.save();
      context.translate(Math.round(x), Math.round(y));
      context.rotate(particle.rotation);
      context.fillStyle = particle.color;
      context.strokeStyle = particle.color;
      context.globalAlpha = Math.max(0, particle.alpha * pulse * flicker);
      if (particle.glow) {
        context.globalCompositeOperation = "lighter";
        context.shadowColor = particle.color;
        context.shadowBlur = Math.min(10, particle.size * 2.6);
      }
      drawParticleShape(context, particle.layer.shape, particle.size);
      context.restore();
    }
  }
}
