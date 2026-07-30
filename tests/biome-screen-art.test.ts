import { describe, expect, test } from "bun:test";

import {
  BIOME_SCREEN_ART,
  biomeScreenArtSrc,
  mainScreenBiomeForPlayer,
} from "../src/systems/BiomeScreenArt";
import { listBiomeIds } from "../src/systems/BiomeIdentity";
import type { PlayerBiomeStars } from "../src/leaderboard/contract";

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

  test("keeps the final frontier on Backrooms and separates each enemy trio", async () => {
    const playerStars: Record<string, number> = Object.fromEntries(
      biomeIds.map((biomeId) => [BIOME_SCREEN_ART[biomeId].label, 1]),
    );
    expect(mainScreenBiomeForPlayer("Cristian", { Cristian: playerStars })).toBe("backrooms");

    const manifest = JSON.parse(
      await Bun.file(
        new URL(
          "../assets-source/imagegen/biome-screen-art-v1/biome-screen-art-manifest.json",
          import.meta.url,
        ),
      ).text(),
    ) as {
      biomes: Record<string, { enemyReferences: { main: string[]; ending: string[] } }>;
    };

    for (const biomeId of biomeIds) {
      const assignments = manifest.biomes[biomeId]!.enemyReferences;
      expect(assignments.main).toHaveLength(3);
      expect(assignments.ending).toHaveLength(3);
      expect(assignments.main.some((enemy) => assignments.ending.includes(enemy))).toBe(false);
      for (const enemy of [...assignments.main, ...assignments.ending]) {
        const reference = Bun.file(
          new URL(
            `../assets-source/imagegen/biome-screen-art-v1/references/enemies/${enemy}`,
            import.meta.url,
          ),
        );
        expect(await reference.exists()).toBe(true);
      }
      expect(biomeScreenArtSrc(biomeId, "main")).toContain(`${biomeId}-main.webp`);
      expect(biomeScreenArtSrc(biomeId, "ending")).toContain(`${biomeId}-ending.webp`);
    }
  });
});
