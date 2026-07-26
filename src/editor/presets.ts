import { DEFAULT_DUNGEON_PARAMS, type DungeonParams } from "../domain/core";

export type DungeonPresetId = "balanced" | "tight" | "sprawl" | "gauntlet" | "crypt";

export type DungeonEditorParams = DungeonParams;

export const DUNGEON_PRESETS: Record<DungeonPresetId, DungeonEditorParams> = {
  balanced: {
    ...DEFAULT_DUNGEON_PARAMS,
  },
  tight: {
    profile: "tight",
    roomTarget: 12,
    loopRate: 8,
    decorDensity: 40,
    mapWidth: 55,
    mapHeight: 55,
    minRoomSize: 4,
    maxRoomSize: 7,
    corridorRadius: 0,
    roomPadding: 1,
    enemyDensity: 65,
    lightLevel: 55,
  },
  sprawl: {
    profile: "sprawl",
    roomTarget: 24,
    loopRate: 32,
    decorDensity: 75,
    mapWidth: 89,
    mapHeight: 89,
    minRoomSize: 6,
    maxRoomSize: 12,
    corridorRadius: 1,
    roomPadding: 2,
    enemyDensity: 40,
    lightLevel: 75,
  },
  gauntlet: {
    profile: "gauntlet",
    roomTarget: 14,
    loopRate: 5,
    decorDensity: 35,
    mapWidth: 61,
    mapHeight: 81,
    minRoomSize: 4,
    maxRoomSize: 6,
    corridorRadius: 0,
    roomPadding: 1,
    enemyDensity: 90,
    lightLevel: 45,
  },
  crypt: {
    profile: "crypt",
    roomTarget: 18,
    loopRate: 18,
    decorDensity: 80,
    mapWidth: 73,
    mapHeight: 73,
    minRoomSize: 5,
    maxRoomSize: 10,
    corridorRadius: 0,
    roomPadding: 2,
    enemyDensity: 55,
    lightLevel: 35,
  },
};
