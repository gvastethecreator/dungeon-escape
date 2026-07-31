import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  DungeonFloorCampaign,
  generateDungeonFloorSet,
} from "../src/dungeon/generateDungeonFloors";

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
        expect(stair.targetFloor).toBe(stair.direction === "down" ? index + 1 : index - 1);
      }
    });
  });

  test("clamps the floor count to the supported campaign range", () => {
    expect(generateDungeonFloorSet("ONE", {}, 0).floors).toHaveLength(1);
    expect(generateDungeonFloorSet("MANY", {}, 99).floors).toHaveLength(4);
  });

  test("generates and caches only the requested campaign floor", () => {
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
    expect(campaign.cachedFloorCount).toBe(1);
    expect(campaign.floor(0)).toBe(first);
    expect(generatedSeeds).toEqual(["LAZY-CAMPAIGN"]);

    const third = campaign.floor(2);
    expect(third?.floor?.index).toBe(2);
    expect(campaign.cachedFloorCount).toBe(2);
    expect(generatedSeeds).toEqual(["LAZY-CAMPAIGN", "LAZY-CAMPAIGN:F3"]);
    expect(campaign.floor(4)).toBeNull();
  });

  test("floor-transition host keeps one save owner and explicit failure recovery branches", () => {
    const source = readFileSync("src/main.ts", "utf8");
    const start = source.indexOf("async function transitionCampaignFloor(");
    const end = source.indexOf("\nasync function descendFloor", start);
    const transition = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(transition).toContain("transitionFailed = true;");
    expect(transition).toContain("const floorCheckpointSaved = localRunSave.flush();");
    expect(transition).not.toContain("writeLocalRunSave(");
    expect(transition).toContain("if (dungeon === targetDungeon)");
    expect(transition).toContain("setWelcomeOpen(true);");
    expect(transition).toContain("{ resume, runSource }");
    expect(transition).toContain('" Local save unavailable."');
    expect(transition).toContain("floorTransitionPending = false;");
    expect(transition).toContain("controller.setEnabled(canEnablePlayController());");
    expect(transition).toContain("if (transitionFailed) throw transitionError;");
  });
});
