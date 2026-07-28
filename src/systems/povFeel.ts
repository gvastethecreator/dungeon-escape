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
  /**
   * Residual hit trauma 0..1. Starts at 1 on damage and decays over a few
   * seconds so the camera keeps shaking after the impact.
   */
  hitTrauma?: number;
  /**
   * Residual exhaustion trauma 0..1. Starts at 1 when sprint stamina empties
   * and decays over a few seconds as a weaker, wobblier shake.
   */
  exhaustionTrauma?: number;
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
  /** Lets the state clear prior effects as soon as the system preference changes. */
  reducedMotion: boolean;
}

/** Base outward lens warp — light curve without inward fish-eye. */
export const POV_CURVATURE_BASE = 0.032;
/** Extra warp while sprinting (speed sensation). */
export const POV_CURVATURE_SPRINT = 0.022;
/** Soft floor on curvature so the FOV never reads perfectly flat. */
export const POV_CURVATURE_MIN = 0.02;

/** Chromatic at full threat (screen UV units). */
export const POV_CHROMATIC_MAX = 0.002;
/** Extra chromatic while hit trauma is full. */
export const POV_HIT_CHROMATIC = 0.0018;
/** Threat band: outside far → zero CA/shake; inside near → full. */
export const POV_THREAT_FAR = 6.5;
export const POV_THREAT_NEAR = 1.85;
/** Peak camera shake from threat alone (0..1). */
export const POV_SHAKE_MAX = 0.72;
/** Peak camera shake contribution from a fresh hit. */
export const POV_HIT_SHAKE = 1;
/** How long full hit trauma takes to decay to zero (seconds). */
export const POV_HIT_TRAUMA_SECONDS = 3.1;
/** Peak camera shake when sprint stamina fully empties. */
export const POV_EXHAUST_SHAKE = 0.78;
/** Soft chromatic fringe while exhausted (weaker than a hit). */
export const POV_EXHAUST_CHROMATIC = 0.0009;
/** How long full exhaustion trauma takes to decay to zero (seconds). */
export const POV_EXHAUST_TRAUMA_SECONDS = 2.8;

export function threatProximity(distance: number | null): number {
  if (distance === null || !Number.isFinite(distance)) return 0;
  if (distance >= POV_THREAT_FAR) return 0;
  if (distance <= POV_THREAT_NEAR) return 1;
  return 1 - (distance - POV_THREAT_NEAR) / (POV_THREAT_FAR - POV_THREAT_NEAR);
}

/**
 * Map locomotion + threat + hit/exhaust trauma into post/camera targets.
 * Close enemies shake a little; a hit or full stamina crash keeps the lens
 * unstable for a few seconds.
 */
export function computePovFeel(input: PovFeelInput): PovFeelTarget {
  if (input.reducedMotion === true) {
    return {
      curvature: POV_CURVATURE_MIN,
      chromatic: 0,
      shake: 0,
      reducedMotion: true,
    };
  }

  const speed = clamp01(input.speedRatio);
  const sprintBlend = input.sprinting ? 1 : speed * 0.35;
  const threat = threatProximity(input.threatDistance);
  const hit = clamp01(input.hitTrauma ?? 0);
  const exhaust = clamp01(input.exhaustionTrauma ?? 0);
  // Ease-out so the last second of trauma still reads without a hard cut.
  const hitFeel = hit * hit * (3 - 2 * hit);
  const exhaustFeel = exhaust * exhaust * (3 - 2 * exhaust);

  let curvature = POV_CURVATURE_BASE + POV_CURVATURE_SPRINT * sprintBlend * (0.45 + 0.55 * speed);
  curvature = Math.max(POV_CURVATURE_MIN, curvature);
  curvature += hitFeel * 0.012 + exhaustFeel * 0.008;

  const threatShake = POV_SHAKE_MAX * smoothstep(0.1, 1, threat);
  const hitShake = POV_HIT_SHAKE * hitFeel;
  const exhaustShake = POV_EXHAUST_SHAKE * exhaustFeel;
  // Threat is subtle; hits own the stronger band. Exhaustion is a mid wobble.
  const traumaShake = Math.max(hitShake, exhaustShake);
  let shake = Math.min(
    1,
    Math.max(threatShake, traumaShake * 0.55) + traumaShake * 0.45,
  );

  let chromatic =
    POV_CHROMATIC_MAX * smoothstep(0.08, 1, threat) +
    POV_HIT_CHROMATIC * hitFeel +
    POV_EXHAUST_CHROMATIC * exhaustFeel;

  return {
    curvature: Number(curvature.toFixed(5)),
    chromatic: Number(chromatic.toFixed(6)),
    shake: Number(shake.toFixed(4)),
    reducedMotion: false,
  };
}

/** Smooth-damped feel state for frame loops (avoids flicker on threat spikes). */
export class PovFeelState {
  private current: PovFeelTarget = {
    curvature: POV_CURVATURE_BASE,
    chromatic: 0,
    shake: 0,
    reducedMotion: false,
  };

  get value(): Readonly<PovFeelTarget> {
    return this.current;
  }

  apply(target: PovFeelTarget, delta: number, lambda = 6.5): PovFeelTarget {
    if (target.reducedMotion) {
      this.current = target;
      return this.current;
    }
    const t = 1 - Math.exp(-lambda * Math.max(0, delta));
    this.current = {
      curvature: this.current.curvature + (target.curvature - this.current.curvature) * t,
      chromatic: this.current.chromatic + (target.chromatic - this.current.chromatic) * t,
      // Hits should land faster than ambient threat ramps.
      shake: this.current.shake + (target.shake - this.current.shake) * Math.min(1, t * 1.65),
      reducedMotion: false,
    };
    return this.current;
  }

  reset(): void {
    this.current = { curvature: POV_CURVATURE_BASE, chromatic: 0, shake: 0, reducedMotion: false };
  }
}

/**
 * Deterministic shake offsets from time + amplitude.
 * Returns position meters and roll radians — readable under stress, still small.
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
  // Slightly stronger than before so close threats and hits are felt, not guessed.
  const posScale = 0.022 * a;
  const rollScale = 0.018 * a;
  return {
    x: x * posScale,
    y: y * posScale * 0.9,
    roll: roll * rollScale,
  };
}

/** Linear hit-trauma decay over {@link POV_HIT_TRAUMA_SECONDS}. */
export function decayHitTrauma(current: number, deltaSeconds: number): number {
  if (current <= 0) return 0;
  const step = Math.max(0, deltaSeconds) / POV_HIT_TRAUMA_SECONDS;
  return Math.max(0, current - step);
}

/** Linear exhaustion-trauma decay over {@link POV_EXHAUST_TRAUMA_SECONDS}. */
export function decayExhaustionTrauma(current: number, deltaSeconds: number): number {
  if (current <= 0) return 0;
  const step = Math.max(0, deltaSeconds) / POV_EXHAUST_TRAUMA_SECONDS;
  return Math.max(0, current - step);
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
