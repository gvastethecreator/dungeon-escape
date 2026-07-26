import { describe, expect, test } from "bun:test";

import { FLOOR, generateDungeon, isExitReachable } from "../src/dungeon/generateDungeon";

describe("procedural dungeon", () => {
  test("a fixed seed creates one connected dungeon with a reachable exit", () => {
    const dungeon = generateDungeon("CAMPANA-17", { roomTarget: 16 });
    expect(dungeon.seed).toBe("CAMPANA-17");
    expect(dungeon.rooms.length).toBeGreaterThanOrEqual(12);
    expect(dungeon.stats.floorCount).toBeGreaterThan(0);
    expect(dungeon.stats.reachableFloorCount).toBe(dungeon.stats.floorCount);
    expect(dungeon.grid[dungeon.spawn.y]?.[dungeon.spawn.x]).toBe(FLOOR);
    expect(dungeon.grid[dungeon.exit.y]?.[dungeon.exit.x]).toBe(FLOOR);
    expect(isExitReachable(dungeon)).toBe(true);
  });

  test("seeds are reproducible and form distinct layouts", () => {
    const first = generateDungeon("MAREA-08", { roomTarget: 14 });
    const repeat = generateDungeon("MAREA-08", { roomTarget: 14 });
    const alternate = generateDungeon("CENIZA-42", { roomTarget: 14 });
    expect(first.topologySignature).toBe(repeat.topologySignature);
    expect(first.topologySignature).not.toBe(alternate.topologySignature);
    expect(first.stats.exitDistance).toBeGreaterThan(0);
    expect(alternate.stats.reachableFloorCount).toBe(alternate.stats.floorCount);
  });

  test("a representative seed set keeps all floor cells connected", () => {
    for (const seed of [
      "CAMPANA-17",
      "MAREA-08",
      "CENIZA-42",
      "HUESO-03",
      "NIEBLA-77",
      "RUNA-19",
    ]) {
      const dungeon = generateDungeon(seed, { roomTarget: 20 });
      expect(dungeon.rooms.length).toBe(20);
      expect(dungeon.stats.reachableFloorCount).toBe(dungeon.stats.floorCount);
      expect(isExitReachable(dungeon)).toBe(true);
    }
  });
});
