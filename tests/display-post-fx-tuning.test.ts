import { describe, expect, test } from "bun:test";

import {
  DEFAULT_DISPLAY_POST_FX_TUNING,
  DISPLAY_POST_FX_PRESETS,
  DISPLAY_POST_FX_TUNING_KEY,
  displayPostFxPreset,
  normalizeDisplayPostFxTuning,
  readDisplayPostFxTuning,
  writeDisplayPostFxTuning,
} from "../src/systems/DisplayPostFxTuning";

describe("display post effect tuning", () => {
  test("ships bounded CRT presets for the local display lab", () => {
    expect(DISPLAY_POST_FX_PRESETS).toHaveLength(2);
    expect(new Set(DISPLAY_POST_FX_PRESETS.map((preset) => preset.id)).size).toBe(2);
    for (const preset of DISPLAY_POST_FX_PRESETS) {
      expect(normalizeDisplayPostFxTuning(preset.tuning)).toEqual(preset.tuning);
      expect(preset.tuning.halation).toBeGreaterThanOrEqual(0);
      expect(preset.tuning.persistence).toBeGreaterThanOrEqual(0);
      expect(preset.tuning.scanlines).toBeGreaterThanOrEqual(0);
      expect(preset.tuning.phosphorMask).toBeGreaterThanOrEqual(0);
    }
    expect(displayPostFxPreset("balanced")?.label).toBe("Balanced CRT");
    expect(displayPostFxPreset("clean")?.label).toBe("Clean CRT");
    expect(displayPostFxPreset("missing")).toBeNull();
  });

  test("clamps imported CRT values", () => {
    expect(
      normalizeDisplayPostFxTuning({ halation: 8, brightness: 0, curvatureScale: -1 }),
    ).toEqual({
      ...DEFAULT_DISPLAY_POST_FX_TUNING,
      halation: 0.35,
      brightness: 0.9,
      curvatureScale: 0,
    });
  });

  test("round-trips local-only tuning without changing player settings", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    const tuning = { ...DEFAULT_DISPLAY_POST_FX_TUNING, scanlines: 0.52 };
    expect(writeDisplayPostFxTuning(tuning, storage)).toBe(true);
    expect(values.has(DISPLAY_POST_FX_TUNING_KEY)).toBe(true);
    expect(readDisplayPostFxTuning(storage)).toEqual(tuning);
  });
});
