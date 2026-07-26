import { describe, expect, test } from "bun:test";
import { resolveForgeRenderQuality } from "../src/forge/ForgeRenderQuality";

describe("Forge render quality", () => {
  test("drops the full-scene shadow pass on compact viewports", () => {
    expect(resolveForgeRenderQuality(390, 3)).toEqual({
      pixelRatio: 1.25,
      directionalShadows: false,
    });
  });

  test("keeps directional shadows and a bounded DPR on desktop", () => {
    expect(resolveForgeRenderQuality(1440, 2)).toEqual({
      pixelRatio: 1.6,
      directionalShadows: true,
    });
  });

  test("never asks the renderer for a sub-native DPR", () => {
    expect(resolveForgeRenderQuality(390, 0.75).pixelRatio).toBe(1);
  });
});
