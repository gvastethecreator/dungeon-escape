import { describe, expect, test } from "bun:test";

import { carveRoundedCorridor, FLOOR } from "../src/dungeon/generateDungeon";
import { FORGE_THEME_PROFILES } from "../src/forge/ForgeThemeProfiles";

function floorCount(grid: readonly Uint8Array[]): number {
  return grid.reduce(
    (total, row) => total + row.reduce((rowTotal, cell) => rowTotal + (cell === FLOOR ? 1 : 0), 0),
    0,
  );
}

function reachableCount(grid: readonly Uint8Array[], start: { x: number; y: number }): number {
  const width = grid[0]?.length ?? 0;
  const seen = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const cell = queue.shift()!;
    const key = `${cell.x}:${cell.y}`;
    if (seen.has(key) || grid[cell.y]?.[cell.x] !== FLOOR) continue;
    seen.add(key);
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      if (x >= 0 && y >= 0 && x < width && y < grid.length) queue.push({ x, y });
    }
  }
  return seen.size;
}

describe("corridor geometry", () => {
  test("rounded turns keep a cardinally connected path and leave a curved inner corner", () => {
    const grid = Array.from({ length: 16 }, () => new Uint8Array(20));
    carveRoundedCorridor(grid, { x: 2, y: 2 }, { x: 15, y: 11 }, 0, true);

    expect(grid[2]?.[2]).toBe(FLOOR);
    expect(grid[11]?.[15]).toBe(FLOOR);
    expect(reachableCount(grid, { x: 2, y: 2 })).toBe(floorCount(grid));
    // The bend is inset from the old square elbow instead of filling its full
    // inside corner, which gives the wall pass a rounded silhouette to follow.
    expect(grid[2]?.[15]).toBe(0);
    expect(floorCount(grid)).toBeGreaterThan(15);
  });

  test("Forge keeps biome-specific arc rates and a real arch profile", async () => {
    const [generatorSource, rendererSource] = await Promise.all([
      Bun.file(new URL("../src/forge/generateForgeDungeon.js", import.meta.url)).text(),
      Bun.file(new URL("../src/forge/main.js", import.meta.url)).text(),
    ]);
    const rates = Object.values(FORGE_THEME_PROFILES).map(({ corridorArc }) => corridorArc);

    // All campaign biomes (including ash/iron map-theater profiles).
    expect(rates.length).toBe(11);
    expect(new Set(rates).size).toBeGreaterThan(5);
    expect(generatorSource).toContain("roundedCorridor");
    expect(rendererSource).toContain("TorusGeometry(0.46, 0.11");
  });
});
