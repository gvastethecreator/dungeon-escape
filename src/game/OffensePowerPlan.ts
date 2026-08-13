/**
 * Deterministic offense power slot: one positive kill/pressure relic per floor.
 * Keeps the total positive chest count fixed while allowing new kinds to compete.
 */

import { createSeededRandom } from "../core/random";

export const OFFENSE_POWER_KINDS = ["annihilation-pulse", "cull-brand", "shotgun"] as const;
export type OffensePowerKind = (typeof OFFENSE_POWER_KINDS)[number];

/** Pulse stays slightly more common; shotgun and brand share the rest. */
export const OFFENSE_POWER_WEIGHTS: Readonly<Record<OffensePowerKind, number>> = {
  "annihilation-pulse": 0.4,
  "cull-brand": 0.3,
  shotgun: 0.3,
};

export const OFFENSE_POWER_DEPTH_FRACTION = 0.64;
export const OFFENSE_POWER_SALT = 83;

/**
 * Pick one offense reward for the floor. Stable for a given dungeon seed.
 */
export function planOffensePowerKind(seed: string): OffensePowerKind {
  const random = createSeededRandom(`${seed}:offense-power`);
  const roll = random.next();
  let cumulative = 0;
  for (const kind of OFFENSE_POWER_KINDS) {
    cumulative += OFFENSE_POWER_WEIGHTS[kind];
    if (roll < cumulative) return kind;
  }
  return "annihilation-pulse";
}
