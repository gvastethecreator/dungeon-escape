/**
 * Pure floor-hazard damage and surface policy (no Three meshes).
 * HazardTileSystem owns placement presentation and feeds active kind + phase.
 */

import type { HazardSurfaceEffect, HazardTileKind } from "./HazardTileSystem";

export const HAZARD_LABELS: Readonly<Record<HazardTileKind, string>> = {
  fire: "BURNING FLOOR",
  ice: "SLICK ICE",
  toxin: "TOXIC FLOOR",
  spikes: "SPIKE PLATE",
};

export const HAZARD_CONTACT_RADIUS = 0.82;

export const HAZARD_FIRE_DAMAGE = 5;
export const HAZARD_FIRE_COOLDOWN = 0.58;
export const HAZARD_TOXIN_DAMAGE = 3;
export const HAZARD_TOXIN_DURATION = 3.2;
export const HAZARD_TOXIN_TICK = 0.8;
export const HAZARD_SPIKE_DAMAGE = 14;
export const HAZARD_SPIKE_COOLDOWN = 1.4;
export const HAZARD_SPIKE_EXPOSURE_THRESHOLD = 0.62;
export const HAZARD_SPIKE_EXPOSURE_RATE = 2.3;
export const HAZARD_SPIKE_EXPOSURE_EDGE0 = -0.25;
export const HAZARD_SPIKE_EXPOSURE_EDGE1 = 0.72;
export const HAZARD_ICE_MOVEMENT_SCALE = 0.82;
export const HAZARD_ICE_TRACTION = 0.18;

/** Hermite smoothstep used by spike lift and damage sampling. */
export function hazardSmoothstep(value: number, edge0: number, edge1: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(edge0) || !Number.isFinite(edge1)) return 0;
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Spike plate exposure in 0..1 from elapsed time and placement phase.
 * Damage and mesh lift must share this curve.
 */
export function spikeExposure(elapsed: number, phase: number): number {
  const safeElapsed = Number.isFinite(elapsed) ? elapsed : 0;
  const safePhase = Number.isFinite(phase) ? phase : 0;
  return hazardSmoothstep(
    Math.sin(safeElapsed * HAZARD_SPIKE_EXPOSURE_RATE + safePhase),
    HAZARD_SPIKE_EXPOSURE_EDGE0,
    HAZARD_SPIKE_EXPOSURE_EDGE1,
  );
}

export interface HazardClockState {
  fireCooldown: number;
  spikeCooldown: number;
  toxinTickCooldown: number;
  toxinRemaining: number;
}

export interface HazardTraversalInput {
  delta: number;
  /** Floor contact kind under the player this frame, if any and not cleared. */
  contactKind: HazardTileKind | null;
  /** Spike plate exposure in 0..1 when contactKind is spikes. */
  spikeExposure: number;
  airborne: boolean;
  immune: boolean;
}

export interface HazardTraversalResult {
  clocks: HazardClockState;
  effect: HazardSurfaceEffect;
}

export function createHazardClockState(): HazardClockState {
  return {
    fireCooldown: 0,
    spikeCooldown: 0,
    toxinTickCooldown: 0,
    toxinRemaining: 0,
  };
}

/**
 * Tick cooldowns and residue, then apply one frame of contact damage policy.
 * Mutates no external state; returns next clocks + surface effect.
 */
export function tickHazardTraversal(
  clocks: HazardClockState,
  input: HazardTraversalInput,
): HazardTraversalResult {
  const delta = Math.max(0, input.delta);
  let fireCooldown = Math.max(0, clocks.fireCooldown - delta);
  let spikeCooldown = Math.max(0, clocks.spikeCooldown - delta);
  let toxinTickCooldown = Math.max(0, clocks.toxinTickCooldown - delta);
  let toxinRemaining = Math.max(0, clocks.toxinRemaining - delta);
  if (input.immune) toxinRemaining = 0;

  let damage = 0;
  const contact = !input.airborne && !input.immune ? input.contactKind : null;

  if (contact === "fire" && fireCooldown === 0) {
    damage += HAZARD_FIRE_DAMAGE;
    fireCooldown = HAZARD_FIRE_COOLDOWN;
  }
  if (contact === "toxin") toxinRemaining = HAZARD_TOXIN_DURATION;
  if (toxinRemaining > 0 && toxinTickCooldown === 0) {
    damage += HAZARD_TOXIN_DAMAGE;
    toxinTickCooldown = HAZARD_TOXIN_TICK;
  }
  if (
    contact === "spikes" &&
    spikeCooldown === 0 &&
    input.spikeExposure > HAZARD_SPIKE_EXPOSURE_THRESHOLD
  ) {
    damage += HAZARD_SPIKE_DAMAGE;
    spikeCooldown = HAZARD_SPIKE_COOLDOWN;
  }

  const kind = contact ?? (toxinRemaining > 0 ? "toxin" : null);
  return {
    clocks: {
      fireCooldown,
      spikeCooldown,
      toxinTickCooldown,
      toxinRemaining,
    },
    effect: {
      kind,
      label: kind ? HAZARD_LABELS[kind] : "",
      damage,
      movementScale: kind === "ice" ? HAZARD_ICE_MOVEMENT_SCALE : 1,
      traction: kind === "ice" ? HAZARD_ICE_TRACTION : 1,
    },
  };
}
