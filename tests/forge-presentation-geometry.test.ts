import { describe, expect, test } from "bun:test";

import { resolveForgeRoomPresentationRect } from "../src/forge/ForgePresentationGeometry";

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
});
