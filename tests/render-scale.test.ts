import { describe, expect, test } from "bun:test";

import { RENDER_SCALE, resolveRenderPixelRatio } from "../src/systems/RenderScale";

describe("render scale", () => {
  test("renders the game at 0.7x after the device ratio cap", () => {
    expect(RENDER_SCALE).toBe(0.7);
    expect(resolveRenderPixelRatio(1, 1)).toBeCloseTo(0.7);
    expect(resolveRenderPixelRatio(2, 1.25)).toBeCloseTo(0.875);
    expect(resolveRenderPixelRatio(2, 0.85)).toBeCloseTo(0.595);
  });

  test("keeps invalid inputs bounded", () => {
    expect(resolveRenderPixelRatio(Number.NaN, 1)).toBeCloseTo(0.7);
    expect(resolveRenderPixelRatio(1, Number.POSITIVE_INFINITY)).toBeCloseTo(0.7);
  });
});
