import type { BiomeId } from "./BiomeIdentity";

/**
 * Scheduled world-atmosphere pulses per biome (not player buffs).
 * Fall-style events (dustfall, cinderfall, spore-bloom, …) intensify the
 * biome's existing ceiling precipitation particles — never full-screen streaks.
 */
export type BiomeEventId =
  | "dustfall"
  | "ember-surge"
  | "whiteout"
  | "funeral-toll"
  | "root-bloom"
  | "cinderfall"
  | "lockdown"
  | "black-sun"
  | "high-tide"
  | "spore-bloom"
  | "light-loop";

export interface BiomeEventProfile {
  id: BiomeEventId;
  label: string;
  intervalSeconds: number;
  durationSeconds: number;
  /** World locomotion drag while the pulse is active (1 = no change). */
  movementScale: number;
  hazardDamageScale: number;
  enemyPressureScale: number;
}

export interface BiomeEventSnapshot {
  id: BiomeEventId;
  label: string;
  active: boolean;
  started: boolean;
  remainingSeconds: number;
  movementScale: number;
  hazardDamageScale: number;
  enemyPressureScale: number;
  cycle: number;
}

export const BIOME_EVENT_PROFILES: Readonly<Record<BiomeId, BiomeEventProfile>> = {
  ancient: {
    // Ceiling grit / mortar dust — screen falloff only; no movement drag.
    id: "dustfall",
    label: "Dustfall",
    intervalSeconds: 52,
    durationSeconds: 9,
    movementScale: 1,
    hazardDamageScale: 0.9,
    enemyPressureScale: 0.92,
  },
  molten: {
    id: "ember-surge",
    label: "Ember surge",
    intervalSeconds: 43,
    durationSeconds: 8,
    movementScale: 0.94,
    hazardDamageScale: 1.25,
    enemyPressureScale: 1.1,
  },
  frost: {
    id: "whiteout",
    label: "Whiteout",
    intervalSeconds: 48,
    durationSeconds: 10,
    movementScale: 0.9,
    hazardDamageScale: 1,
    enemyPressureScale: 0.9,
  },
  grim: {
    id: "funeral-toll",
    label: "Funeral toll",
    intervalSeconds: 46,
    durationSeconds: 9,
    movementScale: 0.97,
    hazardDamageScale: 1.05,
    enemyPressureScale: 1.18,
  },
  verdant: {
    id: "root-bloom",
    label: "Root bloom",
    intervalSeconds: 50,
    durationSeconds: 10,
    movementScale: 0.92,
    hazardDamageScale: 0.72,
    enemyPressureScale: 0.9,
  },
  ash: {
    id: "cinderfall",
    label: "Cinderfall",
    intervalSeconds: 47,
    durationSeconds: 8,
    movementScale: 0.96,
    hazardDamageScale: 1.15,
    enemyPressureScale: 1.04,
  },
  iron: {
    id: "lockdown",
    label: "Iron lockdown",
    intervalSeconds: 45,
    durationSeconds: 9,
    movementScale: 0.88,
    hazardDamageScale: 1.08,
    enemyPressureScale: 1.08,
  },
  obsidian: {
    id: "black-sun",
    label: "Black sun",
    intervalSeconds: 44,
    durationSeconds: 8,
    movementScale: 0.95,
    hazardDamageScale: 1.24,
    enemyPressureScale: 1.12,
  },
  sunken: {
    id: "high-tide",
    label: "High tide",
    intervalSeconds: 49,
    durationSeconds: 11,
    movementScale: 0.82,
    hazardDamageScale: 1.08,
    enemyPressureScale: 0.94,
  },
  fungal: {
    id: "spore-bloom",
    label: "Spore bloom",
    intervalSeconds: 46,
    durationSeconds: 10,
    movementScale: 0.91,
    hazardDamageScale: 1.2,
    enemyPressureScale: 1.06,
  },
  backrooms: {
    id: "light-loop",
    label: "Light loop",
    intervalSeconds: 38,
    durationSeconds: 7,
    movementScale: 0.96,
    hazardDamageScale: 1.12,
    enemyPressureScale: 1.22,
  },
};

const INITIAL_GRACE_SECONDS = 18;

/**
 * Pure deterministic event schedule. Seed offset prevents every generated run
 * from firing on the same wall-clock second while save/resume stays exact.
 */
export function sampleBiomeEvent(
  biomeId: BiomeId,
  elapsedSeconds: number,
  seedHash: number,
  previousCycle = -1,
): BiomeEventSnapshot {
  const profile = BIOME_EVENT_PROFILES[biomeId];
  const elapsed = Math.max(0, elapsedSeconds);
  const offset = Math.abs(seedHash % 11);
  const scheduled = elapsed - INITIAL_GRACE_SECONDS + offset;
  const cycle = scheduled >= 0 ? Math.floor(scheduled / profile.intervalSeconds) : -1;
  const phase =
    cycle >= 0 ? scheduled - cycle * profile.intervalSeconds : profile.durationSeconds + 1;
  const active = cycle >= 0 && phase < profile.durationSeconds;
  return {
    id: profile.id,
    label: profile.label,
    active,
    started: active && cycle !== previousCycle,
    remainingSeconds: active ? Math.max(0, profile.durationSeconds - phase) : 0,
    movementScale: active ? profile.movementScale : 1,
    hazardDamageScale: active ? profile.hazardDamageScale : 1,
    enemyPressureScale: active ? profile.enemyPressureScale : 1,
    cycle,
  };
}
