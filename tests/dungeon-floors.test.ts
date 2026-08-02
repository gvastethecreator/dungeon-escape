import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { gridToWorld } from "../src/dungeon/gridCollision";
import {
  DungeonFloorCampaign,
  generateDungeonFloorSet,
  MAX_DUNGEON_FLOORS,
} from "../src/dungeon/generateDungeonFloors";
import { WORLD_TILE_SIZE } from "../src/world/WorldMetrics";

describe("multi-floor dungeon generation", () => {
  test("builds deterministic sibling floors with aligned reciprocal shafts", () => {
    const first = generateDungeonFloorSet("DEEP-CAMPAIGN", { roomTarget: 12 }, 3);
    const repeat = generateDungeonFloorSet("DEEP-CAMPAIGN", { roomTarget: 12 }, 3);

    expect(first.floors).toHaveLength(3);
    expect(first.signature).toBe(repeat.signature);
    expect(new Set(first.floors.map((floor) => floor.seed)).size).toBe(3);
    expect(first.shaftPlan.links).toHaveLength(2);

    first.floors.forEach((floor, index) => {
      expect(floor.floor).toMatchObject({
        index,
        number: index + 1,
        count: 3,
        rootSeed: "DEEP-CAMPAIGN",
      });
      expect(floor.floor?.stairs.some((stair) => stair.direction === "up")).toBe(index > 0);
      expect(floor.floor?.stairs.some((stair) => stair.direction === "down")).toBe(index < 2);
      for (const stair of floor.floor?.stairs ?? []) {
        expect(floor.grid[stair.cell.y]?.[stair.cell.x]).toBe(1);
        expect(stair.shaftId.length).toBeGreaterThan(0);
        expect(stair.footprint.length).toBeGreaterThan(0);
        expect(stair.targetFloor).toBe(stair.direction === "down" ? index + 1 : index - 1);
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
    expect(MAX_DUNGEON_FLOORS).toBe(3);
  });

  test("materializes the full stack on first floor access", () => {
    const generatedSeeds: string[] = [];
    const campaign = new DungeonFloorCampaign(
      "LAZY-CAMPAIGN",
      { roomTarget: 10 },
      3,
      (seed, options) => {
        generatedSeeds.push(seed ?? "");
        return generateDungeonFloorSet(seed, options, 1).floors[0]!;
      },
    );

    expect(campaign.cachedFloorCount).toBe(0);
    const first = campaign.floor(0);
    expect(campaign.cachedFloorCount).toBe(3);
    expect(campaign.floor(0)).toBe(first);
    expect(generatedSeeds).toEqual([
      "LAZY-CAMPAIGN",
      "LAZY-CAMPAIGN:F2",
      "LAZY-CAMPAIGN:F3",
    ]);
    expect(campaign.floor(2)?.floor?.index).toBe(2);
    expect(campaign.floor(3)).toBeNull();
  });

  test("floor-transition host still exists for legacy recovery wiring", () => {
    const source = readFileSync("src/main.ts", "utf8");
    const director = readFileSync("src/game/FloorTransitionDirector.ts", "utf8");
    const hostStart = source.indexOf(
      "const floorTransitions = new FloorTransitionDirector<PreparedFloorTransition>",
    );
    // Keep director module contract stable until Play wiring removes stair interact.
    expect(hostStart).toBeGreaterThanOrEqual(0);
    expect(director).toContain("await this.port.fade(true)");
  });
});
