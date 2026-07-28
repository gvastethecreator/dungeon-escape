import { DEFAULT_DUNGEON_PARAMS, type DungeonParams } from "../domain/core";
import type { BiomeId } from "./BiomeIdentity";
import { listBiomeIds } from "./BiomeIdentity";

/**
 * Default New Game campaign ramps: Ancient is the softest, Backrooms is a
 * large, dense outlier. Values stay inside DUNGEON_GENERATION_INPUT_RANGES.
 */
const BIOME_CAMPAIGN_OVERRIDES: Record<BiomeId, Partial<DungeonParams>> = {
  ancient: {
    roomTarget: 10,
    loopRate: 10,
    decorDensity: 45,
    mapWidth: 51,
    mapHeight: 51,
    minRoomSize: 4,
    maxRoomSize: 7,
    corridorRadius: 0,
    roomPadding: 2,
    enemyDensity: 26,
    lightLevel: 78,
  },
  molten: {
    roomTarget: 12,
    loopRate: 12,
    decorDensity: 48,
    mapWidth: 55,
    mapHeight: 55,
    minRoomSize: 4,
    maxRoomSize: 7,
    corridorRadius: 0,
    roomPadding: 2,
    enemyDensity: 34,
    lightLevel: 70,
  },
  frost: {
    roomTarget: 13,
    loopRate: 14,
    decorDensity: 50,
    mapWidth: 59,
    mapHeight: 59,
    minRoomSize: 4,
    maxRoomSize: 8,
    corridorRadius: 0,
    roomPadding: 2,
    enemyDensity: 40,
    lightLevel: 68,
  },
  grim: {
    roomTarget: 14,
    loopRate: 16,
    decorDensity: 55,
    mapWidth: 63,
    mapHeight: 63,
    minRoomSize: 4,
    maxRoomSize: 8,
    corridorRadius: 0,
    roomPadding: 2,
    enemyDensity: 46,
    lightLevel: 58,
  },
  verdant: {
    roomTarget: 15,
    loopRate: 18,
    decorDensity: 60,
    mapWidth: 67,
    mapHeight: 67,
    minRoomSize: 5,
    maxRoomSize: 8,
    corridorRadius: 0,
    roomPadding: 2,
    enemyDensity: 52,
    lightLevel: 64,
  },
  ash: {
    roomTarget: 16,
    loopRate: 20,
    decorDensity: 62,
    mapWidth: 71,
    mapHeight: 71,
    minRoomSize: 5,
    maxRoomSize: 9,
    corridorRadius: 0,
    roomPadding: 2,
    enemyDensity: 58,
    lightLevel: 56,
  },
  iron: {
    roomTarget: 18,
    loopRate: 22,
    decorDensity: 58,
    mapWidth: 77,
    mapHeight: 77,
    minRoomSize: 5,
    maxRoomSize: 9,
    corridorRadius: 0,
    roomPadding: 1,
    enemyDensity: 66,
    lightLevel: 52,
  },
  obsidian: {
    roomTarget: 20,
    loopRate: 24,
    decorDensity: 64,
    mapWidth: 83,
    mapHeight: 83,
    minRoomSize: 5,
    maxRoomSize: 10,
    corridorRadius: 0,
    roomPadding: 1,
    enemyDensity: 74,
    lightLevel: 48,
  },
  sunken: {
    roomTarget: 22,
    loopRate: 28,
    decorDensity: 68,
    mapWidth: 89,
    mapHeight: 89,
    minRoomSize: 5,
    maxRoomSize: 10,
    corridorRadius: 1,
    roomPadding: 1,
    enemyDensity: 82,
    lightLevel: 46,
  },
  fungal: {
    roomTarget: 25,
    loopRate: 32,
    decorDensity: 74,
    mapWidth: 97,
    mapHeight: 97,
    minRoomSize: 5,
    maxRoomSize: 11,
    corridorRadius: 1,
    roomPadding: 1,
    enemyDensity: 90,
    lightLevel: 42,
  },
  // Much larger and denser than the rest — endless-office maze pressure.
  backrooms: {
    roomTarget: 42,
    loopRate: 42,
    decorDensity: 88,
    mapWidth: 121,
    mapHeight: 121,
    minRoomSize: 4,
    maxRoomSize: 8,
    corridorRadius: 0,
    roomPadding: 1,
    enemyDensity: 100,
    lightLevel: 55,
  },
};

export function biomeCampaignParams(biomeId: BiomeId): DungeonParams {
  return {
    ...DEFAULT_DUNGEON_PARAMS,
    ...BIOME_CAMPAIGN_OVERRIDES[biomeId],
    profile: `biome-${biomeId}`,
  };
}

/** 0 = easiest (Ancient), higher = harder. */
export function biomeDifficultyRank(biomeId: BiomeId): number {
  return listBiomeIds().indexOf(biomeId);
}

/** Next campaign biome after `biomeId`, or null on the final step (Backrooms). */
export function nextBiomeId(biomeId: BiomeId): BiomeId | null {
  const ids = listBiomeIds();
  const index = ids.indexOf(biomeId);
  if (index < 0 || index >= ids.length - 1) return null;
  return ids[index + 1]!;
}
