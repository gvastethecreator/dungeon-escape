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

  test("floor-transition host delegates one checkpointed transaction and target recovery", () => {
    const source = readFileSync("src/main.ts", "utf8");
    const director = readFileSync("src/game/FloorTransitionDirector.ts", "utf8");
    const hostStart = source.indexOf(
      "const floorTransitions = new FloorTransitionDirector<PreparedFloorTransition>",
    );
    const hostEnd = source.indexOf("\nasync function descendFloor", hostStart);
    const host = source.slice(hostStart, hostEnd);

    expect(hostStart).toBeGreaterThanOrEqual(0);
    expect(hostEnd).toBeGreaterThan(hostStart);
    expect(host).toContain("return localRunSave.flush();");
    expect(host).not.toContain("writeLocalRunSave(");
    expect(host).toContain("return dungeon === prepared.targetDungeon;");
    expect(host).toContain("recoverTarget(prepared, checkpoint)");
    expect(host).toContain("setWelcomeOpen(true);");
    expect(host).toContain('" Local save unavailable."');
    expect(director).toContain("checkpoint = this.port.checkpoint(prepared)");
    expect(director).toContain("await this.port.fade(true)");
    expect(director).toContain("await this.port.fade(false)");
    expect(director).toContain('activeFloor: "target"');
  });
});
