import { describe, expect, test } from "bun:test";
import {
  EDITOR_LIGHTING_THEME_KEYS,
  resolveEditorLightingProfile,
} from "../src/editor/EditorLightingProfiles";

describe("editor lighting profiles", () => {
  test("covers every Forge biome and keeps values in render-safe ranges", () => {
    expect(EDITOR_LIGHTING_THEME_KEYS).toEqual([
      "ancient",
      "molten",
      "frost",
      "grim",
      "verdant",
      "ash",
      "iron",
      "obsidian",
      "sunken",
      "fungal",
      "backrooms",
    ]);

    for (const themeKey of EDITOR_LIGHTING_THEME_KEYS) {
      const profile = resolveEditorLightingProfile(themeKey);
      expect(profile.surfaceGain).toBeGreaterThanOrEqual(1);
      expect(profile.ambientGain).toBeGreaterThan(0);
      expect(profile.keyGain).toBeGreaterThan(0);
      expect(profile.exposure).toBeGreaterThan(1);
      expect(profile.floorRoughness).toBeGreaterThanOrEqual(0.5);
      expect(profile.floorRoughness).toBeLessThanOrEqual(1);
      expect(profile.wallRoughness).toBeGreaterThanOrEqual(0.5);
      expect(profile.wallRoughness).toBeLessThanOrEqual(1);
      expect(profile.mapBrightness).toBeGreaterThanOrEqual(1);
      expect(profile.mapContrast).toBeGreaterThanOrEqual(1);
      expect(profile.mapAmbientOpacity).toBeGreaterThan(0);
      expect(profile.mapEdgeOpacity).toBeGreaterThan(0);
      expect(profile.mapGlowOpacity).toBeGreaterThan(0);
      expect(profile.fogScale).toBeGreaterThan(0);
      expect(profile.fogScale).toBeLessThanOrEqual(1);
    }
  });

  test("gives the darkest atlases more lift while keeping frost restrained", () => {
    const obsidian = resolveEditorLightingProfile("obsidian");
    const sunken = resolveEditorLightingProfile("sunken");
    const frost = resolveEditorLightingProfile("frost");

    expect(obsidian.surfaceGain).toBeGreaterThan(frost.surfaceGain);
    expect(sunken.surfaceGain).toBeGreaterThan(frost.surfaceGain);
    expect(obsidian.mapBrightness).toBeGreaterThan(frost.mapBrightness);
    expect(obsidian.floorRoughness).toBeLessThan(frost.floorRoughness);
  });

  test("falls back to the ash treatment for unknown themes", () => {
    expect(resolveEditorLightingProfile("unknown")).toEqual(resolveEditorLightingProfile("ash"));
  });
});
