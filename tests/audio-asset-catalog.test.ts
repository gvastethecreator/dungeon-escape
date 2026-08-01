import { describe, expect, test } from "bun:test";

import {
  CREATURE_TONES,
  CREATURE_VOICES,
  audioAssetCount,
  audioAssetForCue,
  audioAssetForMusic,
  audioAssetForPickup,
  createAudioGroupLevels,
  creatureBaseTakes,
  creatureToneAsset,
  getAudioAsset,
  listAudioAssets,
} from "../src/audio/AudioAssetCatalog";

describe("AudioAssetCatalog", () => {
  test("owns every asset definition and typed public resolution", () => {
    expect(audioAssetCount()).toBe(listAudioAssets().length);
    expect(audioAssetCount()).toBeGreaterThan(100);
    expect(audioAssetForCue("uiSelect")).toBe("ui-select");
    expect(audioAssetForPickup("time-freeze")).toBe("pickup-time-freeze");
    expect(audioAssetForMusic("biome-backrooms-portal")).toBe("music-biome-backrooms-portal");
    expect(getAudioAsset("music-biome-backrooms-portal")).toMatchObject({
      file: "music-biome-backrooms-portal.ogg",
      group: "music",
    });
    expect(() => getAudioAsset("missing-audio-asset")).toThrow(
      "Unknown audio asset: missing-audio-asset",
    );
  });

  test("covers all creature base takes and biome tone assets", () => {
    for (const voice of CREATURE_VOICES) {
      for (const role of ["voice", "attack"] as const) {
        const base = creatureBaseTakes(voice, role);
        expect(base).toHaveLength(3);
        for (const id of base) expect(getAudioAsset(id).group).toBe("threat");
        for (const tone of CREATURE_TONES) {
          expect(getAudioAsset(creatureToneAsset(voice, role, tone)).group).toBe("threat");
        }
      }
    }
  });

  test("returns an independent group-level record", () => {
    const first = createAudioGroupLevels();
    const second = createAudioGroupLevels();
    first.ui = 1;
    expect(second.ui).toBe(0.28);
  });
});
