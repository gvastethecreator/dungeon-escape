import { describe, expect, test } from "bun:test";

import {
  resolveForgeRoomPresentationRect,
  resolveForgeOverlayRoutes,
} from "../src/forge/ForgePresentationGeometry";

describe("Forge presentation room geometry", () => {
  test("falls back to the final center for legacy rooms without animation origins", () => {
    expect(resolveForgeRoomPresentationRect({ cx: 12, cy: 18, w: 7, h: 5 })).toEqual({
      cx: 12,
      cy: 18,
      sx0: 12,
      sy0: 18,
      w: 7,
      h: 5,
    });
  });

  test("repairs non-finite host values before they enter a Three.js position buffer", () => {
    const rect = resolveForgeRoomPresentationRect({
      cx: Number.NaN,
      cy: Number.POSITIVE_INFINITY,
      sx0: Number.NEGATIVE_INFINITY,
      sy0: Number.NaN,
      w: Number.NaN,
      h: -4,
    });

    expect(rect).toEqual({ cx: 0, cy: 0, sx0: 0, sy0: 0, w: 1, h: 4 });
    expect(Object.values(rect).every(Number.isFinite)).toBe(true);
  });

  test("uses the edge-owned route instead of taking a shortcut through unrelated floor", () => {
    const width = 7;
    const height = 5;
    const grid = new Uint8Array(width * height);
    const at = (x: number, y: number): number => y * width + x;
    const expected = [
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 5, y: 3 },
      { x: 5, y: 2 },
      { x: 5, y: 1 },
    ];
    for (const cell of expected) grid[at(cell.x, cell.y)] = 1;
    // A global floor BFS would take this shorter horizontal route. It belongs
    // to other rooms/connections and must not replace the edge-owned path.
    for (let x = 2; x <= 4; x += 1) grid[at(x, 1)] = 1;

    const [path, missing] = resolveForgeOverlayRoutes({
      width,
      height,
      grid,
      rooms: [
        { cx: 1, cy: 1 },
        { cx: 5, cy: 1 },
        { cx: 3, cy: 1 },
      ],
      pairs: [
        { a: 0, b: 1 },
        { a: 0, b: 2 },
      ],
      routes: [expected],
    });

    expect(path).toEqual(expected);
    expect(missing).toEqual([]);
    for (let index = 1; index < path!.length; index += 1) {
      const previous = path![index - 1]!;
      const current = path![index]!;
      expect(Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y)).toBe(1);
      expect(grid[at(current.x, current.y)]).toBe(1);
    }
  });
});
