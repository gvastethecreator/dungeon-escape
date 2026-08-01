/**
 * Pure planner for rare cursed power chests.
 * Positives stay dense and deterministic; curses are probabilistic and capped.
 */

import { createSeededRandom } from "../core/random";
import { biomeDifficultyRank } from "../systems/BiomeCampaign";
import type { BiomeId } from "../systems/BiomeIdentity";
import { parseDungeonMoodId } from "../systems/DungeonMood";

export const CURSE_CHEST_KINDS = [
  "swarm-curse",
  "slow-curse",
  "frenzy-curse",
  "gloom-curse",
] as const;

export type CurseChestKind = (typeof CURSE_CHEST_KINDS)[number];

/** Ancient / Molten / Frost never spawn curses. */
export const CURSE_MIN_BIOME_RANK = 3;
/** Hard cap per floor; always below the eight positive power chests. */
export const CURSE_MAX_PER_FLOOR = 2;
/** Independent chance per kind after rank gate (before cap). */
export const CURSE_KIND_SPAWN_CHANCE = 0.2;
/** Only mid/late route seats. */
export const CURSE_MIN_DEPTH_FRACTION = 0.48;

const CURSE_DEPTH_FRACTIONS: Readonly<Record<CurseChestKind, number>> = {
  "swarm-curse": 0.52,
  "slow-curse": 0.64,
  "frenzy-curse": 0.76,
  "gloom-curse": 0.88,
};

const CURSE_SALTS: Readonly<Record<CurseChestKind, number>> = {
  "swarm-curse": 101,
  "slow-curse": 103,
  "frenzy-curse": 107,
  "gloom-curse": 109,
};

export interface CurseChestPlacement {
  kind: CurseChestKind;
  depthFraction: number;
  salt: number;
}

export function isBiomeEligibleForCurseChests(moodId: string | null | undefined): boolean {
  const id = parseDungeonMoodId(moodId ?? "");
  if (!id) return false;
  return biomeDifficultyRank(id as BiomeId) >= CURSE_MIN_BIOME_RANK;
}

/**
 * Deterministic subset of curse kinds for one dungeon build.
 * Returns at most CURSE_MAX_PER_FLOOR placements, each unique by kind.
 */
export function planCurseChestPlacements(
  seed: string,
  moodId: string | null | undefined,
): readonly CurseChestPlacement[] {
  if (!isBiomeEligibleForCurseChests(moodId)) return [];
  const random = createSeededRandom(`${seed}:curse-chests`);
  const picks: CurseChestPlacement[] = [];
  for (const kind of CURSE_CHEST_KINDS) {
    if (picks.length >= CURSE_MAX_PER_FLOOR) break;
    if (random.next() > CURSE_KIND_SPAWN_CHANCE) continue;
    const depthFraction = Math.max(CURSE_MIN_DEPTH_FRACTION, CURSE_DEPTH_FRACTIONS[kind]);
    picks.push({
      kind,
      depthFraction,
      salt: CURSE_SALTS[kind],
    });
  }
  return picks;
}
