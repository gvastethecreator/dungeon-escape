import { describe, expect, test } from "bun:test";

import { generateDungeonFloorSet } from "../src/dungeon/generateDungeonFloors";

describe("multi-floor dungeon generation", () => {
  test("builds deterministic sibling floors with reciprocal stairs", () => {
    const first = generateDungeonFloorSet("DEEP-CAMPAIGN", { roomTarget: 12 }, 3);
    const repeat = generateDungeonFloorSet("DEEP-CAMPAIGN", { roomTarget: 12 }, 3);

    expect(first.floors).toHaveLength(3);
    expect(first.signature).toBe(repeat.signature);
    expect(new Set(first.floors.map((floor) => floor.seed)).size).toBe(3);

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
        expect(stair.targetFloor).toBe(
          stair.direction === "down" ? index + 1 : index - 1,
        );
      }
    });
  });

  test("clamps the floor count to the supported campaign range", () => {
    expect(generateDungeonFloorSet("ONE", {}, 0).floors).toHaveLength(1);
    expect(generateDungeonFloorSet("MANY", {}, 99).floors).toHaveLength(4);
  });
});
