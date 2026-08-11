import { describe, expect, test } from "bun:test";

import { DUNGEON_GENERATION_INPUT_RANGES } from "../src/domain/core";
import { generateDungeon } from "../src/dungeon/generateDungeon";
import {
  biomeCampaignParams,
  biomeCampaignFloorCount,
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
  test("uses smaller campaign layouts while keeping the biome ramp", () => {
    const expectedLayouts = {
      ancient: [9, 47],
      molten: [11, 51],
      frost: [12, 55],
      grim: [13, 59],
      verdant: [14, 63],
      ash: [15, 67],
      iron: [16, 71],
      obsidian: [18, 77],
      sunken: [20, 83],
      fungal: [22, 89],
      backrooms: [34, 105],
    } as const;
    for (const biomeId of listBiomeIds()) {
      const params = biomeCampaignParams(biomeId);
      expect([params.roomTarget, params.mapWidth] as const).toEqual(expectedLayouts[biomeId]);
      expect(params.mapHeight).toBe(params.mapWidth);
    }
  });

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

  test("adds floors gradually without exceeding the multi-slab stack contract", () => {
    const ids = listBiomeIds();
    let prior = 1;
    for (const id of ids) {
      const count = biomeCampaignFloorCount(id);
      expect(count).toBeGreaterThanOrEqual(prior);
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(4);
      prior = count;
    }
    expect(biomeCampaignFloorCount("ancient")).toBe(1);
    expect(biomeCampaignFloorCount("fungal")).toBe(3);
    expect(biomeCampaignFloorCount("backrooms")).toBe(4);
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
