import { describe, expect, test } from "bun:test";
import { MUSIC_ASSET_IDS, musicTrackForBiome } from "../src/audio/AudioMusicPolicy";

describe("AudioMusicPolicy", () => {
  test("maps known biomes and portal beds", () => {
    expect(musicTrackForBiome("ash")).toBe("biome-ash");
    expect(musicTrackForBiome("ash", { portalOpen: true })).toBe("biome-ash-portal");
  });

  test("falls back to ancient for unknown moods", () => {
    expect(musicTrackForBiome("not-a-biome")).toBe("biome-ancient");
    expect(musicTrackForBiome("not-a-biome", { portalOpen: true })).toBe("biome-ancient-portal");
  });

  test("owns welcome, hall, picker, and ending beds", () => {
    expect(MUSIC_ASSET_IDS.menu).toBe("music-menu");
    expect(MUSIC_ASSET_IDS.hall).toBe("music-hall");
    expect(MUSIC_ASSET_IDS["biome-select"]).toBe("music-biome-select");
    expect(MUSIC_ASSET_IDS.win).toBe("music-win");
    expect(MUSIC_ASSET_IDS.lose).toBe("music-lose");
  });
});
