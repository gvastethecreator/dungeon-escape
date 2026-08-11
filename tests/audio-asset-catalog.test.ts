import { describe, expect, test } from "bun:test";

import {
  BIOME_AUDIO_KEYS,
  CREATURE_TONES,
  CREATURE_VOICES,
  audioAssetCount,
  audioAssetForBiomeAccent,
  audioAssetForBiomeAmbience,
  audioAssetForCue,
  audioAssetForMusic,
  audioAssetForPickup,
  createAudioGroupLevels,
  creatureBaseTakes,
  creatureToneAsset,
  getAudioAsset,
  listAudioAssets,
  type CollectedPickupKind,
} from "../src/audio/AudioAssetCatalog";

const PICKUP_KINDS = [
  "stone",
  "resolve",
  "time-freeze",
  "luminous-ward",
  "annihilation-pulse",
  "cull-brand",
  "phoenix-egg",
  "map",
  "mobility",
  "clarity",
  "swarm-curse",
  "slow-curse",
  "frenzy-curse",
  "gloom-curse",
  "mirror-curse",
  "spin-curse",
] as const satisfies readonly CollectedPickupKind[];

describe("AudioAssetCatalog", () => {
  test("owns every asset definition and typed public resolution", () => {
    expect(audioAssetCount()).toBe(listAudioAssets().length);
    expect(audioAssetCount()).toBeGreaterThan(100);
    expect(audioAssetForCue("uiSelect")).toBe("ui-select");
    expect(audioAssetForPickup("time-freeze")).toBe("pickup-time-freeze-v2");
    expect(audioAssetForMusic("biome-backrooms-portal")).toBe("music-biome-backrooms-portal");
    expect(getAudioAsset("music-biome-backrooms-portal")).toMatchObject({
      file: "music-biome-backrooms-portal.ogg",
      group: "music",
    });
    expect(() => getAudioAsset("missing-audio-asset")).toThrow(
      "Unknown audio asset: missing-audio-asset",
    );
  });

  test("gives every biome a distinct loop and accent", () => {
    const loops = BIOME_AUDIO_KEYS.map((biome) => audioAssetForBiomeAmbience(biome));
    const accents = BIOME_AUDIO_KEYS.map((biome) => audioAssetForBiomeAccent(biome));
    expect(new Set(loops).size).toBe(BIOME_AUDIO_KEYS.length);
    expect(new Set(accents).size).toBe(BIOME_AUDIO_KEYS.length);
    for (const id of [...loops, ...accents]) expect(getAudioAsset(id).group).toBe("ambience");
    expect(audioAssetForBiomeAmbience("unknown")).toBe("ambience-biome-ancient");
  });

  test("gives every pickup kind its own sound", () => {
    const ids = PICKUP_KINDS.map((kind) => audioAssetForPickup(kind));
    expect(new Set(ids).size).toBe(PICKUP_KINDS.length);
    for (const id of ids) expect(getAudioAsset(id).group).toBe("sfx");
  });

  test("links every personal-library source record to a runtime file", async () => {
    const manifest = (await Bun.file(
      new URL("../assets-source/audio/library-sfx-catalog.json", import.meta.url),
    ).json()) as {
      licenseStatus: string;
      assets: Array<{ id: string; output: string }>;
    };
    expect(manifest.licenseStatus).toBe("user-review-required");
    expect(manifest.assets).toHaveLength(41);
    expect(new Set(manifest.assets.map((asset) => asset.output)).size).toBe(41);
    for (const asset of manifest.assets) {
      expect(getAudioAsset(asset.id).file).toBe(asset.output);
      const runtime = Bun.file(
        new URL(`../public/assets/audio/dungeon/${asset.output}`, import.meta.url),
      );
      expect(await runtime.exists()).toBe(true);
      expect(runtime.size).toBeGreaterThan(800);
    }
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
