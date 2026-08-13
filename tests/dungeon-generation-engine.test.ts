import { describe, expect, test } from "bun:test";

import { DEFAULT_DUNGEON_PARAMS } from "../src/domain/core";
import {
  dungeonOptionsFromParams,
  generateDungeonBuild,
  generateDungeonBuildWithYield,
} from "../src/dungeon/DungeonGenerationEngine";

const FAST_PARAMS = {
  ...DEFAULT_DUNGEON_PARAMS,
  roomTarget: 8,
  mapWidth: 41,
  mapHeight: 41,
};

describe("DungeonGenerationEngine", () => {
  test("owns the conversion from product settings to topology options", () => {
    expect(dungeonOptionsFromParams(FAST_PARAMS)).toEqual({
      roomTarget: 8,
      extraConnectionRate: 0.2,
      width: 41,
      height: 41,
      minRoomSize: 5,
      maxRoomSize: 9,
      corridorRadius: 0,
      roomPadding: 2,
    });
  });

  test("returns a single dungeon without creating a campaign owner", () => {
    const result = generateDungeonBuild({ seed: "ENGINE-SINGLE", params: FAST_PARAMS });

    expect(result.dungeon.seed).toBe("ENGINE-SINGLE");
    expect(result.floorSet).toBeNull();
  });

  test("treats invalid floor settings as a safe single-floor request", () => {
    const result = generateDungeonBuild({
      seed: "ENGINE-INVALID-FLOORS",
      params: FAST_PARAMS,
      floorCount: Number.NaN,
      activeFloor: Number.POSITIVE_INFINITY,
    });

    expect(result.floorSet).toBeNull();
    expect(result.dungeon.seed).toBe("ENGINE-INVALID-FLOORS");
  });

  test("materializes and selects the complete resident floor stack", () => {
    const result = generateDungeonBuild({
      seed: "ENGINE-STACK",
      params: FAST_PARAMS,
      floorCount: 4,
      activeFloor: 2,
    });

    expect(result.floorSet?.cachedFloorCount).toBe(4);
    expect(result.floorSet?.allFloors()).toHaveLength(4);
    expect(result.dungeon.floor?.index).toBe(2);
    expect(result.dungeon.floor?.count).toBe(4);
  });

  test("yields between campaign floors without changing the generated stack", async () => {
    let yields = 0;
    const result = await generateDungeonBuildWithYield(
      {
        seed: "ENGINE-STACK-YIELD",
        params: FAST_PARAMS,
        floorCount: 4,
        activeFloor: 1,
      },
      async () => {
        yields += 1;
      },
    );
    const sync = generateDungeonBuild({
      seed: "ENGINE-STACK-YIELD",
      params: FAST_PARAMS,
      floorCount: 4,
      activeFloor: 1,
    });

    expect(yields).toBeGreaterThanOrEqual(4);
    expect(result.dungeon.topologySignature).toBe(sync.dungeon.topologySignature);
    expect(result.floorSet?.cachedFloorCount).toBe(4);
    expect(result.dungeon.floor?.index).toBe(1);
  });

  test("has no editor, DOM, rendering, or world dependency", async () => {
    const source = await Bun.file(
      new URL("../src/dungeon/DungeonGenerationEngine.ts", import.meta.url),
    ).text();

    expect(source).not.toMatch(/\/editor\//);
    expect(source).not.toMatch(/\b(document|window)\b/);
    expect(source).not.toContain('from "three"');
    expect(source).not.toMatch(/\/world\//);
  });
});
