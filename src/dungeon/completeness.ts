import {
  generateDungeon,
  isExitReachable,
} from "./generateDungeon";
import type { DungeonData, DungeonOptions } from "./types";
import {
  hasValidMagicStonePlacementContract,
  hasValidPortalPlacementContract,
  selectMagicStonePlacements,
} from "../world/MagicStonePlacement";

/** Spawn + exit + four stone seats — absolute floor budget for a completable run. */
export const MIN_REACHABLE_FLOOR_FOR_OBJECTIVES = 6;

/**
 * True when the layout can host a full campaign objective set:
 * reachable portal exit and four distinct reachable magic stones.
 */
export function isDungeonPlayComplete(dungeon: DungeonData): boolean {
  if (!isExitReachable(dungeon)) return false;
  if (!hasValidPortalPlacementContract(dungeon)) return false;
  if ((dungeon.stats.reachableFloorCount ?? 0) < MIN_REACHABLE_FLOOR_FOR_OBJECTIVES) return false;
  try {
    const stones = selectMagicStonePlacements(dungeon);
    return hasValidMagicStonePlacementContract(dungeon, stones);
  } catch {
    return false;
  }
}

/**
 * Generate a dungeon that always admits four stones + portal.
 * Keeps the public seed string; only the layout RNG is re-salted on retries.
 */
export function generateCompletableDungeon(
  seed = "BLACK-FLAG",
  inputOptions: DungeonOptions = {},
  maxAttempts = 16,
): DungeonData {
  const attempts = Math.max(1, Math.floor(maxAttempts));
  let lastError: unknown;
  for (let salt = 0; salt < attempts; salt += 1) {
    try {
      const dungeon = generateDungeon(seed, inputOptions, salt);
      if (!isDungeonPlayComplete(dungeon)) {
        lastError = new Error(
          `Layout salt ${salt} is not play-complete (reachable floors ${dungeon.stats.reachableFloorCount}).`,
        );
        continue;
      }
      return dungeon;
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : "unknown layout failure";
  throw new Error(
    `Could not generate a completable dungeon for seed "${seed.trim() || "BLACK-FLAG"}" after ${attempts} attempts. ${detail}`,
  );
}
