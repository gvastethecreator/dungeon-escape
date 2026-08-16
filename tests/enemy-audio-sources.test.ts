import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";

import {
  CREATURE_TONES,
  CREATURE_VOICES,
  creatureBaseTakes,
  creatureToneAsset,
} from "../src/audio/AudioAssetCatalog";
import { creatureToneForMood } from "../src/audio/CreatureTakeSelector";
import { listBiomeIds } from "../src/systems/BiomeIdentity";
import {
  ENEMY_AUDIO_SOURCES,
  enemyAudioEncodeKey,
  resolveEnemyAudioPath,
} from "../scripts/enemy-audio-sources";

describe("enemy audio sources", () => {
  test("covers every roster take and biome skin with unique encodes", () => {
    const byName = new Map(ENEMY_AUDIO_SOURCES.map((asset) => [asset.name, asset]));
    expect(byName.size).toBe(ENEMY_AUDIO_SOURCES.length);

    const expected = new Set<string>(["enemy-growl", "enemy-attack"]);
    for (const voice of CREATURE_VOICES) {
      for (const role of ["voice", "attack"] as const) {
        for (const id of creatureBaseTakes(voice, role)) expected.add(id);
        for (const tone of CREATURE_TONES) expected.add(creatureToneAsset(voice, role, tone));
      }
    }
    expect(new Set(byName.keys())).toEqual(expected);

    const encodeKeys = ENEMY_AUDIO_SOURCES.map(enemyAudioEncodeKey);
    expect(new Set(encodeKeys).size).toBe(encodeKeys.length);
  });

  test("maps every biome except ancient to its own creature skin", () => {
    for (const biome of listBiomeIds()) {
      expect(creatureToneForMood(biome)).toBe(biome === "ancient" ? "base" : biome);
    }
    expect(creatureToneForMood(null)).toBe("base");
    expect([...CREATURE_TONES]).toEqual(listBiomeIds().filter((id) => id !== "ancient"));
  });

  test("library files exist for every mapped clip", () => {
    const missing = ENEMY_AUDIO_SOURCES.filter(
      (asset) => !existsSync(resolveEnemyAudioPath(asset)),
    ).map((asset) => `${asset.name} -> ${resolveEnemyAudioPath(asset)}`);
    expect(missing).toEqual([]);
  }, 60_000);
});
