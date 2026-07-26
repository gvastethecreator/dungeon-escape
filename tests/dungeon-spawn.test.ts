import { describe, expect, test } from "bun:test";

import { generateDungeon, isExitReachable, setDungeonSpawn } from "../src/dungeon/generateDungeon";

describe("editable dungeon spawn", () => {
  test("moves the spawn to a valid floor cell and recalculates the route", () => {
    const dungeon = generateDungeon("EDITOR-SPAWN");
    const candidate = dungeon.rooms.find((room) => room.role === "room")?.center;
    expect(candidate).toBeDefined();
    const edited = setDungeonSpawn(dungeon, candidate!);
    expect(edited.spawn).toEqual(candidate!);
    expect(edited.stats.reachableFloorCount).toBe(edited.stats.floorCount);
    expect(isExitReachable(edited)).toBe(true);
    expect(edited.exit).not.toEqual(edited.spawn);
  });

  test("rejects a wall cell", () => {
    const dungeon = generateDungeon("EDITOR-WALL");
    expect(() => setDungeonSpawn(dungeon, { x: 0, y: 0 })).toThrow("floor cell");
  });
});
