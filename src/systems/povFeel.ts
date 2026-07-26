/**
 * First-person feel targets for lens warp, chromatic fringe, and camera shake.
 * Pure math — no Three.js — so sprint/threat curves stay unit-testable.
 */

export interface PovFeelInput {
  /** True while the player is actually sprinting (speed above walk band). */
  sprinting: boolean;
  /** 0..1 speed relative to max sprint speed. */
  speedRatio: number;
  /** Nearest hostile distance in world units, or null when none nearby. */
  threatDistance: number | null;
  /** System preference: cut motion intensity hard. */
  reducedMotion?: boolean;
}

export interface PovFeelTarget {
  /** Outward (pincushion) lens warp strength (UV radial). */
  curvature: number;
  /** RGB channel split along radial UV (subtle). */
  chromatic: number;
  /** Camera shake amplitude 0..1. */
  shake: number;
}

/** Base outward lens warp — light curve without inward fish-eye. */
export const POV_CURVATURE_BASE = 0.032;
/** Extra warp while sprinting (speed sensation). */
export const POV_CURVATURE_SPRINT = 0.022;
/** Soft floor on curvature so the FOV never reads perfectly flat. */
export const POV_CURVATURE_MIN = 0.02;

/** Chromatic at full threat (screen UV units). */
export const POV_CHROMATIC_MAX = 0.002;
/** Threat band: outside far → zero CA/shake; inside near → full. */
export const POV_THREAT_FAR = 7.5;
export const POV_THREAT_NEAR = 2.1;
/** Peak camera shake (meters / radians scale applied by consumer). */
export const POV_SHAKE_MAX = 1;

export function threatProximity(distance: number | null): number {
  if (distance === null || !Number.isFinite(distance)) return 0;
  if (distance >= POV_THREAT_FAR) return 0;
  if (distance <= POV_THREAT_NEAR) return 1;
  return 1 - (distance - POV_THREAT_NEAR) / (POV_THREAT_FAR - POV_THREAT_NEAR);
}

/**
 * Map locomotion + threat into post/camera targets.
 * Sprint widens the lens a little; threat adds shake + chromatic fringe.
 */
export function computePovFeel(input: PovFeelInput): PovFeelTarget {
  const reduced = input.reducedMotion === true;
  const speed = clamp01(input.speedRatio);
  const sprintBlend = input.sprinting ? 1 : speed * 0.35;
  const threat = threatProximity(input.threatDistance);

  let curvature = POV_CURVATURE_BASE + POV_CURVATURE_SPRINT * sprintBlend * (0.45 + 0.55 * speed);
  curvature = Math.max(POV_CURVATURE_MIN, curvature);

  let chromatic = POV_CHROMATIC_MAX * smoothstep(0.08, 1, threat);
  let shake = POV_SHAKE_MAX * smoothstep(0.12, 1, threat);

  if (reduced) {
    curvature = POV_CURVATURE_MIN;
    chromatic *= 0.15;
    shake *= 0.12;
  }

  return {
    curvature: Number(curvature.toFixed(5)),
    chromatic: Number(chromatic.toFixed(6)),
    shake: Number(shake.toFixed(4)),
  };
}

/** Smooth-damped feel state for frame loops (avoids flicker on threat spikes). */
export class PovFeelState {
  private current: PovFeelTarget = {
    curvature: POV_CURVATURE_BASE,
    chromatic: 0,
    shake: 0,
  };

  get value(): Readonly<PovFeelTarget> {
    return this.current;
  }

  apply(target: PovFeelTarget, delta: number, lambda = 6.5): PovFeelTarget {
    const t = 1 - Math.exp(-lambda * Math.max(0, delta));
    this.current = {
      curvature: this.current.curvature + (target.curvature - this.current.curvature) * t,
      chromatic: this.current.chromatic + (target.chromatic - this.current.chromatic) * t,
      shake: this.current.shake + (target.shake - this.current.shake) * t,
    };
    return this.current;
  }

  reset(): void {
    this.current = { curvature: POV_CURVATURE_BASE, chromatic: 0, shake: 0 };
  }
}

/**
 * Deterministic shake offsets from time + amplitude.
 * Returns position meters and roll radians — small on purpose.
 */
export function samplePovShake(
  timeSec: number,
  amplitude: number,
  seed = 0,
): { x: number; y: number; roll: number } {
  const a = clamp01(amplitude);
  if (a <= 0.0001) return { x: 0, y: 0, roll: 0 };
  // Layered sines — not pure noise, but reads as stress without RNG thrash.
  const t = timeSec + seed * 12.9898;
  const x =
    Math.sin(t * 23.7) * 0.55 + Math.sin(t * 41.3 + 1.7) * 0.3 + Math.sin(t * 67.1 + 0.4) * 0.15;
  const y =
    Math.sin(t * 19.1 + 2.1) * 0.5 +
    Math.sin(t * 37.9 + 0.9) * 0.35 +
    Math.sin(t * 53.4 + 1.3) * 0.15;
  const roll = Math.sin(t * 15.4 + 0.6) * 0.55 + Math.sin(t * 29.8 + 2.4) * 0.45;
  const posScale = 0.014 * a;
  const rollScale = 0.012 * a;
  return {
    x: x * posScale,
    y: y * posScale * 0.85,
    roll: roll * rollScale,
  };
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
