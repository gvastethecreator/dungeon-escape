import { describe, expect, test } from "bun:test";

import { collectLiquidSections, countLiquidBoundaryEdges } from "../src/world/LiquidSectionKit";

describe("connected liquid sections", () => {
  test("keeps adjacent water cells in one authored surface", () => {
    const width = 6;
    const height = 4;
    const mask = new Uint8Array(width * height);
    const at = (x: number, y: number) => y * width + x;
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [4, 2],
    ] as const)
      mask[at(x, y)] = 1;

    const sections = collectLiquidSections(mask, width, height);
    expect(sections.map((section) => section.cells.length)).toEqual([3, 1]);
    expect(countLiquidBoundaryEdges(sections[0]!, mask, width, height)).toBe(8);
    expect(countLiquidBoundaryEdges(sections[1]!, mask, width, height)).toBe(4);
  });
});
