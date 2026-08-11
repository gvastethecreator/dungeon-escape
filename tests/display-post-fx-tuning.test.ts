import { describe, expect, test } from "bun:test";

import {
  DEFAULT_DISPLAY_POST_FX_TUNING,
  DISPLAY_POST_FX_PRESETS,
  DISPLAY_POST_FX_TUNING_KEY,
  displayPostFxPreset,
  normalizeDisplayPostFxPresetSnapshot,
  normalizeDisplayPostFxTuning,
  readDisplayPostFxTuning,
  writeDisplayPostFxTuning,
} from "../src/systems/DisplayPostFxTuning";

describe("display post effect tuning", () => {
  test("ships bounded presets for the local display lab", () => {
    expect(DISPLAY_POST_FX_PRESETS).toHaveLength(8);
    expect(new Set(DISPLAY_POST_FX_PRESETS.map((preset) => preset.id)).size).toBe(8);
    for (const preset of DISPLAY_POST_FX_PRESETS) {
      expect(normalizeDisplayPostFxTuning(preset.tuning)).toEqual(preset.tuning);
      expect(preset.paletteDitherStrength).toBeGreaterThanOrEqual(0);
      expect(preset.paletteDitherStrength).toBeLessThanOrEqual(1);
      expect(preset.tuning.paletteDitherScale).toBeGreaterThanOrEqual(0.25);
      expect(preset.tuning.paletteShadowGuard).toBeGreaterThanOrEqual(0);
      expect(preset.tuning.paletteFlatGuard).toBeGreaterThanOrEqual(0);
    }
    expect(displayPostFxPreset("pico-arcade")?.tuning.paletteStage).toBe("world");
    expect(new Set(DISPLAY_POST_FX_PRESETS.map((preset) => preset.paletteEffect))).toEqual(
      new Set([
        "off",
        "pico-8",
        "commodore-64",
        "game-boy-olive",
        "cga-0-high",
        "ega-16",
        "zx-spectrum",
      ]),
    );
    expect(displayPostFxPreset("missing")).toBeNull();
  });

  test("clamps imported values and rejects unknown palette identities", () => {
    expect(
      normalizeDisplayPostFxPresetSnapshot({
        paletteEffect: "unknown",
        paletteDitherStrength: 5,
        tuning: { halation: 8, brightness: 0, curvatureScale: -1 },
      }),
    ).toEqual({
      paletteEffect: "off",
      paletteDitherStrength: 1,
      tuning: {
        ...DEFAULT_DISPLAY_POST_FX_TUNING,
        halation: 0.35,
        brightness: 0.9,
        curvatureScale: 0,
      },
    });
  });

  test("round-trips local-only tuning without changing player settings", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    const tuning = { ...DEFAULT_DISPLAY_POST_FX_TUNING, paletteStage: "world" as const };
    expect(writeDisplayPostFxTuning(tuning, storage)).toBe(true);
    expect(values.has(DISPLAY_POST_FX_TUNING_KEY)).toBe(true);
    expect(readDisplayPostFxTuning(storage)).toEqual(tuning);
  });
});
