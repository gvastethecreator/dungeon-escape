import { describe, expect, test } from "bun:test";

import {
  BIOME_PARTICLE_MOTION_ID,
  BIOME_PARTICLE_SHAPE_ID,
  getBiomeParticleProfile,
} from "../src/systems/BiomeParticleProfile";
import { listDungeonMoodIds } from "../src/systems/DungeonMood";

describe("biome particle profiles", () => {
  test("all biomes have a distinct signature motion and shape pair", () => {
    const signatures = listDungeonMoodIds().map((id) => {
      const profile = getBiomeParticleProfile(id);
      expect(profile.label.length).toBeGreaterThan(4);
      expect(profile.signature.name.toLowerCase()).toContain(id);
      expect(profile.signature.glow).toBe(true);
      return `${profile.signature.motion}:${profile.signature.shape}`;
    });
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  test("profiles stay visible and inside the two-field render budget", () => {
    for (const id of listDungeonMoodIds()) {
      const profile = getBiomeParticleProfile(id);
      for (const layer of [profile.support, profile.signature]) {
        expect(layer.minCount).toBeGreaterThanOrEqual(80);
        expect(layer.maxCount).toBeGreaterThanOrEqual(layer.minCount);
        expect(layer.opacity).toBeGreaterThanOrEqual(0.42);
        expect(layer.sizeMin).toBeGreaterThanOrEqual(0.04);
        expect(layer.sizeMax).toBeGreaterThan(layer.sizeMin);
        expect(layer.color).not.toBe(layer.colorAlt);
        expect(BIOME_PARTICLE_MOTION_ID[layer.motion]).toBeGreaterThanOrEqual(0);
        expect(BIOME_PARTICLE_SHAPE_ID[layer.shape]).toBeGreaterThanOrEqual(0);
      }
      expect(profile.support.maxCount + profile.signature.maxCount).toBeLessThanOrEqual(1_800);
    }
  });

  test("the full set uses a broad motion and silhouette language", () => {
    const profiles = listDungeonMoodIds().map(getBiomeParticleProfile);
    const motions = new Set(
      profiles.flatMap((profile) => [profile.support.motion, profile.signature.motion]),
    );
    const shapes = new Set(
      profiles.flatMap((profile) => [profile.support.shape, profile.signature.shape]),
    );
    expect(motions.size).toBeGreaterThanOrEqual(8);
    expect(shapes.size).toBeGreaterThanOrEqual(8);
  });
});
