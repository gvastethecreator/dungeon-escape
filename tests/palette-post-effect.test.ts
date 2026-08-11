import { describe, expect, test } from "bun:test";

import {
  DEFAULT_PALETTE_DITHER_STRENGTH,
  MAX_POST_PALETTE_COLORS,
  PALETTE_POST_EFFECT_IDS,
  PALETTE_POST_EFFECT_PROFILES,
  normalizePaletteDitherStrength,
  normalizePalettePostEffectId,
  palettePostEffectProfile,
} from "../src/systems/PalettePostEffect";

describe("palette post effect catalog", () => {
  test("ships distinct bounded classic palettes copied from the pinned source", () => {
    expect(PALETTE_POST_EFFECT_IDS).toHaveLength(7);
    expect(PALETTE_POST_EFFECT_PROFILES).toHaveLength(6);
    expect(new Set(PALETTE_POST_EFFECT_PROFILES.map((profile) => profile.id)).size).toBe(6);
    for (const profile of PALETTE_POST_EFFECT_PROFILES) {
      expect(profile.colors.length).toBeGreaterThanOrEqual(4);
      expect(profile.colors.length).toBeLessThanOrEqual(MAX_POST_PALETTE_COLORS);
      expect(profile.colors.every((color) => /^#[0-9A-F]{6}$/.test(color))).toBe(true);
      expect(profile.recommendedDitherStrength).toBeGreaterThanOrEqual(0.45);
      expect(profile.recommendedDitherStrength).toBeLessThanOrEqual(0.65);
      expect(profile.quantization.shadowStart).toBeLessThan(profile.quantization.shadowEnd);
      expect(profile.quantization.flatSuppression).toBeGreaterThan(0.7);
      expect(profile.quantization.lightnessWeight).toBeGreaterThan(
        profile.quantization.chromaWeight,
      );
    }
    expect(
      new Set(PALETTE_POST_EFFECT_PROFILES.map((profile) => JSON.stringify(profile.quantization)))
        .size,
    ).toBe(PALETTE_POST_EFFECT_PROFILES.length);
    expect(palettePostEffectProfile("pico-8")?.colors).toHaveLength(16);
    expect(palettePostEffectProfile("off")).toBeNull();
  });

  test("normalizes saved palette settings", () => {
    expect(normalizePalettePostEffectId("commodore-64")).toBe("commodore-64");
    expect(normalizePalettePostEffectId("missing")).toBe("off");
    expect(normalizePaletteDitherStrength(2)).toBe(1);
    expect(normalizePaletteDitherStrength(-1)).toBe(0);
    expect(normalizePaletteDitherStrength("0.4")).toBe(DEFAULT_PALETTE_DITHER_STRENGTH);
  });
});
