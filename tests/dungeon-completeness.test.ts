import { describe, expect, test } from "bun:test";

import {
  generateCompletableDungeon,
  isDungeonPlayComplete,
  MIN_REACHABLE_FLOOR_FOR_OBJECTIVES,
} from "../src/dungeon/completeness";
import { biomeCampaignParams } from "../src/systems/BiomeCampaign";
import { listBiomeIds } from "../src/systems/BiomeIdentity";
import {
  hasValidMagicStonePlacementContract,
  hasValidPortalPlacementContract,
  selectMagicStonePlacements,
} from "../src/world/MagicStonePlacement";

describe("dungeon play completeness", () => {
  test("requires enough reachable floor for spawn, exit, and four stones", () => {
    expect(MIN_REACHABLE_FLOOR_FOR_OBJECTIVES).toBe(6);
  });

  test("campaign biomes always produce completable layouts", () => {
    for (const biomeId of listBiomeIds()) {
      const params = biomeCampaignParams(biomeId);
      for (let index = 0; index < 8; index += 1) {
        const dungeon = generateCompletableDungeon(`COMPLETE-${biomeId}-${index}`, {
          roomTarget: params.roomTarget,
          extraConnectionRate: params.loopRate / 100,
          width: params.mapWidth,
          height: params.mapHeight,
          minRoomSize: params.minRoomSize,
          maxRoomSize: params.maxRoomSize,
          corridorRadius: params.corridorRadius,
          roomPadding: params.roomPadding,
        });
        expect(isDungeonPlayComplete(dungeon)).toBe(true);
        expect(hasValidPortalPlacementContract(dungeon)).toBe(true);
        const stones = selectMagicStonePlacements(dungeon);
        expect(hasValidMagicStonePlacementContract(dungeon, stones)).toBe(true);
        expect(stones).toHaveLength(4);
        // Public seed stays stable even if layout RNG was re-salted.
        expect(dungeon.seed).toBe(`COMPLETE-${biomeId}-${index}`);
      }
    }
  });

  test("tight maps still complete or throw only after retries", () => {
    for (let index = 0; index < 20; index += 1) {
      const dungeon = generateCompletableDungeon(`TIGHT-${index}`, {
        roomTarget: 8,
        minRoomSize: 3,
        maxRoomSize: 5,
        width: 41,
        height: 41,
        roomPadding: 1,
        corridorRadius: 0,
      });
      expect(isDungeonPlayComplete(dungeon)).toBe(true);
      expect(selectMagicStonePlacements(dungeon)).toHaveLength(4);
    }
  });
});
