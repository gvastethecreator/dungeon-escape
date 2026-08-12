import { describe, expect, test } from "bun:test";

import {
  BIOME_SCREEN_ART,
  biomeScreenArtSrc,
  mainScreenBiomeForPlayer,
} from "../src/systems/BiomeScreenArt";
import { listBiomeIds } from "../src/systems/BiomeIdentity";
import type { PlayerBiomeStars } from "../src/leaderboard/contract";
import { hasLocalSourceAssets } from "./local-source-assets";

const biomeIds = [...listBiomeIds()];

describe("biome screen art", () => {
  test("publishes one main and one ending asset for every canonical biome", async () => {
    expect(Object.keys(BIOME_SCREEN_ART)).toEqual(biomeIds);

    for (const biomeId of biomeIds) {
      const spec = BIOME_SCREEN_ART[biomeId];
      const main = Bun.file(new URL(`../public${spec.mainSrc}`, import.meta.url));
      const ending = Bun.file(new URL(`../public${spec.endingSrc}`, import.meta.url));
      expect(spec.mainSrc).toBe(`/assets/ui/biome-screens/${biomeId}-main.webp`);
      expect(spec.endingSrc).toBe(`/assets/ui/biome-screens/${biomeId}-ending.webp`);
      expect(await main.exists()).toBe(true);
      expect(await ending.exists()).toBe(true);
      expect(main.size).toBeGreaterThan(35_000);
      expect(ending.size).toBeGreaterThan(35_000);
    }
  });

  test("moves the welcome frontier after saved campaign clears", () => {
    const stars: PlayerBiomeStars = {
      Cristian: {
        Ancient: 1,
        Molten: 1,
      },
    };
    expect(mainScreenBiomeForPlayer(null, stars)).toBe("ancient");
    expect(mainScreenBiomeForPlayer("Cristian", stars)).toBe("frost");
    expect(mainScreenBiomeForPlayer("Other player", stars)).toBe("ancient");
  });

  test.skipIf(
    !hasLocalSourceAssets("imagegen", "biome-screen-art-v2", "biome-screen-art-manifest.json"),
  )("keeps the final frontier on Backrooms and separates each enemy trio", async () => {
    const playerStars: Record<string, number> = Object.fromEntries(
      biomeIds.map((biomeId) => [BIOME_SCREEN_ART[biomeId].label, 1]),
    );
    expect(mainScreenBiomeForPlayer("Cristian", { Cristian: playerStars })).toBe("backrooms");

    const manifest = JSON.parse(
      await Bun.file(
        new URL(
          "../assets-source/imagegen/biome-screen-art-v2/biome-screen-art-manifest.json",
          import.meta.url,
        ),
      ).text(),
    ) as {
      version: number;
      target: { width: number; height: number; format: string };
      biomes: Record<
        string,
        {
          assets: Record<
            "main" | "ending",
            {
              enemies: string[];
              references: string[];
              status: string;
              publicSize: [number, number];
              publicSha256: string;
            }
          >;
        }
      >;
    };

    expect(manifest.version).toBe(2);
    expect(manifest.target).toEqual({ width: 836, height: 470, format: "webp" });

    for (const biomeId of biomeIds) {
      const assets = manifest.biomes[biomeId]!.assets;
      const assignments = {
        main: assets.main.enemies,
        ending: assets.ending.enemies,
      };
      expect(assignments.main).toHaveLength(3);
      expect(assignments.ending).toHaveLength(3);
      expect(assignments.main.some((enemy) => assignments.ending.includes(enemy))).toBe(false);
      for (const kind of ["main", "ending"] as const) {
        expect(assets[kind].status).toBe("integrated");
        expect(assets[kind].publicSize).toEqual([836, 470]);
        expect(assets[kind].publicSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(assets[kind].references).toHaveLength(4);
        for (const path of assets[kind].references) {
          const reference = Bun.file(new URL(`../${path}`, import.meta.url));
          expect(await reference.exists()).toBe(true);
        }
      }
      expect(biomeScreenArtSrc(biomeId, "main")).toContain(`${biomeId}-main.webp`);
      expect(biomeScreenArtSrc(biomeId, "ending")).toContain(`${biomeId}-ending.webp`);
    }
  });

  test.skipIf(
    !hasLocalSourceAssets(
      "imagegen",
      "biome-screen-art-v2",
      "references",
      "reference-manifest.json",
    ),
  )("tracks all 121 current enemy references from promoted animation rows", async () => {
    const references = JSON.parse(
      await Bun.file(
        new URL(
          "../assets-source/imagegen/biome-screen-art-v2/references/reference-manifest.json",
          import.meta.url,
        ),
      ).text(),
    ) as {
      count: number;
      records: Array<{
        biome: string;
        sourceAnimationPackage: string;
        sourceRect: [number, number, number, number];
        sha256: string;
      }>;
    };

    expect(references.count).toBe(121);
    expect(references.records).toHaveLength(121);
    for (const biomeId of biomeIds) {
      expect(references.records.filter((record) => record.biome === biomeId)).toHaveLength(11);
    }
    for (const reference of references.records) {
      expect(reference.sourceAnimationPackage).toEndWith("-enemies-animated.json");
      expect(reference.sourceRect.slice(2)).toEqual([160, 160]);
      expect(reference.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
