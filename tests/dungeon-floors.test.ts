import { describe, expect, test } from "bun:test";

import { gridToWorld } from "../src/dungeon/gridCollision";
import {
  createDungeonFloorCampaign,
  createPendingDungeonFloorCampaign,
  DungeonFloorCampaign,
  generateDungeonFloorSet,
  MAX_DUNGEON_FLOORS,
} from "../src/dungeon/generateDungeonFloors";
import { stairFlightFootprintCells } from "../src/dungeon/StairShaftPlan";
import { WORLD_TILE_SIZE } from "../src/world/WorldMetrics";

describe("multi-floor dungeon generation", () => {
  test("builds deterministic sibling floors with aligned reciprocal shafts", () => {
    const first = generateDungeonFloorSet("DEEP-CAMPAIGN", { roomTarget: 12 }, 4);
    const repeat = generateDungeonFloorSet("DEEP-CAMPAIGN", { roomTarget: 12 }, 4);

    expect(first.floors).toHaveLength(4);
    expect(first.signature).toBe(repeat.signature);
    expect(new Set(first.floors.map((floor) => floor.seed)).size).toBe(4);
    expect(first.shaftPlan.links).toHaveLength(3);

    first.floors.forEach((floor, index) => {
      expect(floor.floor).toMatchObject({
        index,
        number: index + 1,
        count: 4,
        rootSeed: "DEEP-CAMPAIGN",
      });
      expect(floor.floor?.stairs.some((stair) => stair.direction === "down")).toBe(index > 0);
      expect(floor.floor?.stairs.some((stair) => stair.direction === "up")).toBe(index < 3);
      const expectedOpenCells = new Set(
        first.shaftPlan.links
          .filter((link) => link.lowerFloor === index || link.upperFloor === index)
          .flatMap((link) =>
            stairFlightFootprintCells(link.footprint).map((cell) => `${cell.x},${cell.y}`),
          ),
      );
      expect(new Set(floor.floor?.openVerticalCells?.map((cell) => `${cell.x},${cell.y}`))).toEqual(
        expectedOpenCells,
      );
      const actualFloorCells = floor.grid.reduce(
        (total, row) => total + row.reduce((count, cell) => count + Number(cell === 1), 0),
        0,
      );
      expect(floor.stats.floorCount).toBe(actualFloorCells);
      expect(floor.stats.reachableFloorCount).toBe(actualFloorCells);
      for (const stair of floor.floor?.stairs ?? []) {
        expect(floor.grid[stair.cell.y]?.[stair.cell.x]).toBe(1);
        expect(floor.distances[stair.cell.y * floor.width + stair.cell.x]).toBeGreaterThanOrEqual(
          0,
        );
        expect(stair.shaftId.length).toBeGreaterThan(0);
        expect(stair.footprint.length).toBeGreaterThan(0);
        expect(stair.targetFloor).toBe(stair.direction === "up" ? index + 1 : index - 1);
      }
    });

    // Aligned XZ between reciprocal stair anchors.
    for (const link of first.shaftPlan.links) {
      const lower = first.floors[link.lowerFloor]!;
      const upper = first.floors[link.upperFloor]!;
      const lowerWorld = gridToWorld(lower, link.anchor, WORLD_TILE_SIZE);
      const upperWorld = gridToWorld(upper, link.anchor, WORLD_TILE_SIZE);
      expect(lowerWorld.x).toBeCloseTo(upperWorld.x, 5);
      expect(lowerWorld.z).toBeCloseTo(upperWorld.z, 5);
      for (const cell of link.footprint) {
        expect(lower.grid[cell.y]?.[cell.x]).toBe(1);
        expect(upper.grid[cell.y]?.[cell.x]).toBe(1);
      }
    }
  });

  test("clamps the floor count to the supported campaign range", () => {
    expect(generateDungeonFloorSet("ONE", {}, 0).floors).toHaveLength(1);
    expect(generateDungeonFloorSet("MANY", {}, 99).floors).toHaveLength(MAX_DUNGEON_FLOORS);
    expect(MAX_DUNGEON_FLOORS).toBe(4);
  });

  test("materializes the full stack on first floor access", () => {
    const generatedSeeds: string[] = [];
    const campaign = new DungeonFloorCampaign(
      "LAZY-CAMPAIGN",
      { roomTarget: 10 },
      4,
      (seed, options) => {
        generatedSeeds.push(seed ?? "");
        return generateDungeonFloorSet(seed, options, 1).floors[0]!;
      },
    );

    expect(campaign.cachedFloorCount).toBe(0);
    const first = campaign.floor(0);
    expect(campaign.cachedFloorCount).toBe(4);
    expect(campaign.floor(0)).toBe(first);
    expect(generatedSeeds).toEqual([
      "LAZY-CAMPAIGN",
      "LAZY-CAMPAIGN:F2",
      "LAZY-CAMPAIGN:F3",
      "LAZY-CAMPAIGN:F4",
    ]);
    expect(campaign.floor(3)?.floor?.index).toBe(3);
    expect(campaign.floor(4)).toBeNull();
  });

  test("factory returns the whole resident stack already generated", () => {
    const campaign = createDungeonFloorCampaign("EAGER-CAMPAIGN", { roomTarget: 10 }, 4);
    expect(campaign.cachedFloorCount).toBe(4);
    expect(campaign.allFloors()).toHaveLength(4);
  });

  test("materializeWithYield generates the same stack as eager materialize", async () => {
    let yields = 0;
    const pending = createPendingDungeonFloorCampaign("YIELD-CAMPAIGN", { roomTarget: 10 }, 4);
    expect(pending.cachedFloorCount).toBe(0);
    await pending.materializeWithYield(async () => {
      yields += 1;
    });
    const eager = createDungeonFloorCampaign("YIELD-CAMPAIGN", { roomTarget: 10 }, 4);

    expect(yields).toBeGreaterThanOrEqual(4);
    expect(pending.cachedFloorCount).toBe(4);
    expect(pending.allFloors().map((floor) => floor.topologySignature)).toEqual(
      eager.allFloors().map((floor) => floor.topologySignature),
    );
  });

  test("reuses an accepted first floor instead of generating it twice", () => {
    const initial = generateDungeonFloorSet("REUSED-FIRST", { roomTarget: 8 }, 1).floors[0]!;
    const generatedSeeds: string[] = [];
    const campaign = new DungeonFloorCampaign(
      "REUSED-FIRST",
      { roomTarget: 8 },
      4,
      (seed, options) => {
        generatedSeeds.push(seed ?? "");
        return generateDungeonFloorSet(seed, options, 1).floors[0]!;
      },
      initial,
    ).materialize();

    expect(campaign.cachedFloorCount).toBe(4);
    expect(generatedSeeds).toEqual(["REUSED-FIRST:F2", "REUSED-FIRST:F3", "REUSED-FIRST:F4"]);
  });
});
