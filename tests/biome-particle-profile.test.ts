import { describe, expect, test } from "bun:test";

import {
  BIOME_PARTICLE_MOTION_ID,
  BIOME_PARTICLE_SHAPE_ID,
  getBiomeParticleProfile,
  isCeilingPrecipitationLayer,
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

  test("every biome ships ceiling precipitation that falls from the slab", () => {
    const ceilingKinds = new Set<string>();
    for (const id of listDungeonMoodIds()) {
      const profile = getBiomeParticleProfile(id);
      const ceiling = profile.ceiling;
      expect(isCeilingPrecipitationLayer(ceiling)).toBe(true);
      expect(ceiling.motion).toBe("drip");
      expect(ceiling.name.toLowerCase()).toContain(id === "grim" ? "grim" : id);
      expect(ceiling.minCount).toBeGreaterThanOrEqual(40);
      expect(ceiling.maxCount).toBeLessThanOrEqual(240);
      expect(ceiling.opacity).toBeGreaterThanOrEqual(0.5);
      expect(["drop", "crumb", "streak", "ash", "shard"]).toContain(ceiling.shape);
      ceilingKinds.add(`${ceiling.shape}:${ceiling.color.toString(16)}`);
    }
    // Blood, water, dirt and slag should not all collapse to one look.
    expect(ceilingKinds.size).toBeGreaterThanOrEqual(8);
  });

  test("profiles stay visible and inside the three-field render budget", () => {
    for (const id of listDungeonMoodIds()) {
      const profile = getBiomeParticleProfile(id);
      for (const layer of [profile.support, profile.signature, profile.ceiling]) {
        expect(layer.minCount).toBeGreaterThanOrEqual(40);
        expect(layer.maxCount).toBeGreaterThanOrEqual(layer.minCount);
        expect(layer.opacity).toBeGreaterThanOrEqual(0.42);
        expect(layer.sizeMin).toBeGreaterThanOrEqual(0.02);
        expect(layer.sizeMax).toBeGreaterThan(layer.sizeMin);
        expect(layer.color).not.toBe(layer.colorAlt);
        expect(BIOME_PARTICLE_MOTION_ID[layer.motion]).toBeGreaterThanOrEqual(0);
        expect(BIOME_PARTICLE_SHAPE_ID[layer.shape]).toBeGreaterThanOrEqual(0);
      }
      expect(
        profile.support.maxCount + profile.signature.maxCount + profile.ceiling.maxCount,
      ).toBeLessThanOrEqual(2_000);
    }
  });

  test("the full set uses a broad motion and silhouette language", () => {
    const profiles = listDungeonMoodIds().map(getBiomeParticleProfile);
    const motions = new Set(
      profiles.flatMap((profile) => [
        profile.support.motion,
        profile.signature.motion,
        profile.ceiling.motion,
      ]),
    );
    const shapes = new Set(
      profiles.flatMap((profile) => [
        profile.support.shape,
        profile.signature.shape,
        profile.ceiling.shape,
      ]),
    );
    expect(motions.has("drip")).toBe(true);
    expect(motions.size).toBeGreaterThanOrEqual(8);
    expect(shapes.has("drop") || shapes.has("crumb")).toBe(true);
    expect(shapes.size).toBeGreaterThanOrEqual(8);
  });

  test("sunken ambient dust is bubbles; signature rises; ceiling still seeps", () => {
    const profile = getBiomeParticleProfile("sunken");
    expect(profile.support.shape).toBe("bubble");
    expect(profile.support.motion).toBe("drift");
    expect(profile.support.name.toLowerCase()).toContain("bubble");
    expect(profile.signature.shape).toBe("bubble");
    expect(profile.signature.motion).toBe("rise");
    expect(profile.ceiling.motion).toBe("drip");
    expect(profile.ceiling.shape).toBe("drop");
  });
});
