/**
 * Deterministic per-floor loot budgets scaled by campaign biome rank.
 * Harder biomes get more health and free support pickups without raising offense power.
 */

import { createSeededRandom } from "../core/random";
import { biomeDifficultyRank } from "../systems/BiomeCampaign";
import type { BiomeId } from "../systems/BiomeIdentity";
import { isBiomeId } from "../systems/BiomeIdentity";

export const FLOOR_LOOT_HARD_CAP = 40;

export type FloorSupportPowerKind = "time-freeze" | "luminous-ward" | "clarity";
export type FloorFreePowerKind = FloorSupportPowerKind;

export interface BiomeLootBudget {
  /** Total resolve sources (chests + free flasks). */
  healthTotal: number;
  /** Resolve flasks inside bonus chests. */
  healthChests: number;
  /** Free resolve pickups (rooms + corridors). */
  freeFlasks: number;
  /** Free flasks that prefer corridor seats. */
  corridorFlasks: number;
  /** Free support powers on the floor (no chest). */
  freePowers: readonly FloorFreePowerKind[];
  /** Extra support power chests beyond the base eight. */
  extraSupportChests: readonly FloorSupportPowerKind[];
  /** Place one phoenix egg when the run does not already hold a charge. */
  placePhoenix: boolean;
}

const SUPPORT_POWER_ROTATION: readonly FloorSupportPowerKind[] = [
  "time-freeze",
  "luminous-ward",
  "clarity",
  "time-freeze",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveRank(moodOrBiomeId: string | null | undefined): number {
  if (!moodOrBiomeId) return 0;
  const id = moodOrBiomeId.trim().toLowerCase();
  if (isBiomeId(id)) return Math.max(0, biomeDifficultyRank(id as BiomeId));
  return 0;
}

function pickSupportPowers(count: number, seed: string, salt: string): FloorSupportPowerKind[] {
  if (count <= 0) return [];
  const random = createSeededRandom(`${seed}:${salt}`);
  const picks: FloorSupportPowerKind[] = [];
  for (let index = 0; index < count; index += 1) {
    const roll = Math.floor(random.next() * SUPPORT_POWER_ROTATION.length);
    picks.push(SUPPORT_POWER_ROTATION[roll] ?? "time-freeze");
  }
  return picks;
}

/**
 * Pure budget for one procedural floor. Forge imports skip free loot (caller).
 */
export function planBiomeLootBudget(
  moodOrBiomeId: string | null | undefined,
  seed: string,
  options: { phoenixArmed?: boolean } = {},
): BiomeLootBudget {
  const rank = resolveRank(moodOrBiomeId);
  const healthTotal = clamp(Math.round(4 + rank * 1.4), 4, 20);
  // Prefer a healthy mix of chests and free flasks.
  const healthChests = clamp(Math.round(healthTotal * 0.45), 2, 10);
  const freeFlasks = clamp(healthTotal - healthChests, 1, 14);
  const corridorFlasks = clamp(Math.floor(freeFlasks * (0.45 + rank * 0.03)), 1, freeFlasks);

  let freePowerCount = 0;
  if (rank <= 0) freePowerCount = 0;
  else if (rank <= 2) freePowerCount = 1;
  else freePowerCount = clamp(Math.floor((rank - 1) / 2), 1, 4);

  // Ward from rank 3; clarity from rank 5 — filter after rotation picks.
  const rawPowers = pickSupportPowers(freePowerCount, seed, "free-powers");
  const freePowers: FloorFreePowerKind[] = rawPowers.filter((kind) => {
    if (kind === "luminous-ward") return rank >= 3;
    if (kind === "clarity") return rank >= 5;
    return true;
  });
  // Backfill with freeze if filters emptied slots.
  while (freePowers.length < freePowerCount) freePowers.push("time-freeze");

  const extraSupportCount = rank >= 10 ? 2 : rank >= 7 ? 1 : 0;
  const extraSupportChests = pickSupportPowers(extraSupportCount, seed, "extra-support");

  const placePhoenix = options.phoenixArmed !== true;

  // Soft cap awareness (caller still enforces seat availability).
  const projected =
    healthChests +
    freeFlasks +
    freePowers.length +
    extraSupportChests.length +
    (placePhoenix ? 1 : 0);
  if (projected > FLOOR_LOOT_HARD_CAP) {
    // Prefer keeping phoenix and free powers; trim free flasks first.
    const overflow = projected - FLOOR_LOOT_HARD_CAP;
    const trimmedFlasks = Math.max(1, freeFlasks - overflow);
    const trimmedCorridor = Math.min(corridorFlasks, trimmedFlasks);
    return {
      healthTotal: healthChests + trimmedFlasks,
      healthChests,
      freeFlasks: trimmedFlasks,
      corridorFlasks: trimmedCorridor,
      freePowers,
      extraSupportChests,
      placePhoenix,
    };
  }

  return {
    healthTotal,
    healthChests,
    freeFlasks,
    corridorFlasks,
    freePowers,
    extraSupportChests,
    placePhoenix,
  };
}

/** Depth fractions spread across a route for N free placements. */
export function spreadDepthFractions(count: number, base = 0.2, span = 0.65): number[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  if (n === 1) return [base + span * 0.5];
  return Array.from({ length: n }, (_, index) => base + (span * index) / (n - 1));
}
