import { describe, expect, test } from "bun:test";

import { DUNGEON_GENERATION_INPUT_RANGES } from "../src/domain/core";
import { generateDungeon } from "../src/dungeon/generateDungeon";
import {
  biomeCampaignParams,
  biomeDifficultyRank,
  nextBiomeId,
} from "../src/systems/BiomeCampaign";
import { listBiomeIds } from "../src/systems/BiomeIdentity";

function withinGenerationRanges(params: ReturnType<typeof biomeCampaignParams>): void {
  for (const [key, range] of Object.entries(DUNGEON_GENERATION_INPUT_RANGES) as Array<
    [keyof typeof DUNGEON_GENERATION_INPUT_RANGES, { min: number; max: number }]
  >) {
    const value = params[key];
    expect(value).toBeGreaterThanOrEqual(range.min);
    expect(value).toBeLessThanOrEqual(range.max);
  }
}

describe("biome campaign difficulty ramp", () => {
  test("orders biomes from Ancient (easiest) to Backrooms (hardest)", () => {
    const order = listBiomeIds();
    expect(order[0]).toBe("ancient");
    expect(order[order.length - 1]).toBe("backrooms");
    expect(biomeDifficultyRank("ancient")).toBe(0);
    expect(biomeDifficultyRank("backrooms")).toBe(order.length - 1);
  });

  test("nextBiomeId walks campaign order and stops after Backrooms", () => {
    const order = listBiomeIds();
    expect(nextBiomeId("ancient")).toBe("molten");
    expect(nextBiomeId("fungal")).toBe("backrooms");
    expect(nextBiomeId("backrooms")).toBeNull();
    for (let i = 0; i < order.length - 1; i += 1) {
      expect(nextBiomeId(order[i]!)).toBe(order[i + 1]!);
    }
  });

  test("ramps rooms, map size, and enemy density by biome order", () => {
    const ids = listBiomeIds();
    for (let i = 1; i < ids.length; i += 1) {
      const prev = biomeCampaignParams(ids[i - 1]!);
      const next = biomeCampaignParams(ids[i]!);
      withinGenerationRanges(prev);
      withinGenerationRanges(next);
      expect(next.roomTarget).toBeGreaterThanOrEqual(prev.roomTarget);
      expect(next.mapWidth).toBeGreaterThanOrEqual(prev.mapWidth);
      expect(next.enemyDensity).toBeGreaterThanOrEqual(prev.enemyDensity);
    }
  });

  test("makes Backrooms a large outlier versus Ancient", () => {
    const ancient = biomeCampaignParams("ancient");
    const backrooms = biomeCampaignParams("backrooms");
    expect(backrooms.roomTarget).toBeGreaterThanOrEqual(ancient.roomTarget * 3);
    expect(backrooms.mapWidth * backrooms.mapHeight).toBeGreaterThan(
      ancient.mapWidth * ancient.mapHeight * 4,
    );
    expect(backrooms.enemyDensity).toBe(100);
  });

  test("can generate a Backrooms-scale dungeon from campaign params", () => {
    const params = biomeCampaignParams("backrooms");
    const dungeon = generateDungeon("BIOME-BACKROOMS-TEST", {
      roomTarget: params.roomTarget,
      extraConnectionRate: params.loopRate / 100,
      width: params.mapWidth,
      height: params.mapHeight,
      minRoomSize: params.minRoomSize,
      maxRoomSize: params.maxRoomSize,
      corridorRadius: params.corridorRadius,
      roomPadding: params.roomPadding,
    });
    expect(dungeon.width).toBe(params.mapWidth);
    expect(dungeon.height).toBe(params.mapHeight);
    expect(dungeon.stats.roomCount).toBeGreaterThan(20);
  });
});
