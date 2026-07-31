import { describe, expect, test } from "bun:test";
import { musicTrackForBiome } from "../src/audio/AudioMusicPolicy";

describe("AudioMusicPolicy", () => {
  test("maps known biomes and portal beds", () => {
    expect(musicTrackForBiome("ash")).toBe("biome-ash");
    expect(musicTrackForBiome("ash", { portalOpen: true })).toBe("biome-ash-portal");
  });

  test("falls back to ancient for unknown moods", () => {
    expect(musicTrackForBiome("not-a-biome")).toBe("biome-ancient");
    expect(musicTrackForBiome("not-a-biome", { portalOpen: true })).toBe(
      "biome-ancient-portal",
    );
  });
});
