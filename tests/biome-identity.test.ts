import { describe, expect, test } from "bun:test";

import {
  getBiomeIdentity,
  listBiomeIds,
  listForgeBiomeIdentities,
  listForgeBiomeIds,
  parseBiomeId,
} from "../src/systems/BiomeIdentity";
import { getDungeonMood, listDungeonMoodIds } from "../src/systems/DungeonMood";

const ALL_BIOMES = [
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
] as const;

const FORGE_BIOMES = [
  "ancient",
  "molten",
  "frost",
  "grim",
  "verdant",
  "obsidian",
  "sunken",
  "fungal",
  "backrooms",
] as const;

describe("biome identity", () => {
  test("owns stable IDs, order, labels, and Forge support", () => {
    expect(listBiomeIds()).toEqual(ALL_BIOMES);
    expect(listForgeBiomeIds()).toEqual(FORGE_BIOMES);
    expect(listForgeBiomeIdentities().map(({ id, label }) => ({ id, label }))).toEqual(
      FORGE_BIOMES.map((id) => ({ id, label: getBiomeIdentity(id).label })),
    );
    expect(getBiomeIdentity("grim")).toEqual({
      id: "grim",
      label: "Grim",
      forgeSupported: true,
    });
    expect(getBiomeIdentity("ash").forgeSupported).toBe(false);
    expect(getBiomeIdentity("iron").forgeSupported).toBe(false);
    expect(Object.isFrozen(listBiomeIds())).toBe(true);
    expect(Object.isFrozen(listForgeBiomeIdentities())).toBe(true);
    expect(Object.isFrozen(getBiomeIdentity("grim"))).toBe(true);
  });

  test("keeps runtime mood identity and free-text parsing on the same seam", () => {
    expect(listDungeonMoodIds()).toBe(listBiomeIds());
    for (const id of ALL_BIOMES) {
      expect(getDungeonMood(id).id).toBe(id);
      expect(getDungeonMood(id).label).toBe(getBiomeIdentity(id).label);
    }
    expect(parseBiomeId(" FROST ")).toBe("frost");
    expect(parseBiomeId("nope")).toBeNull();
    expect(parseBiomeId(null)).toBeNull();
  });

  test("renders Forge theme chips from the catalog instead of duplicate HTML", async () => {
    const [host, source] = await Promise.all([
      Bun.file(new URL("../forge.html", import.meta.url)).text(),
      Bun.file(new URL("../src/forge/main.js", import.meta.url)).text(),
    ]);
    const chips = host.match(/<div class="chips" id="chips">[\s\S]*?<\/div>/)?.[0] ?? "";

    expect(chips).toContain('data-t="random"');
    expect(chips).not.toContain('data-t="grim"');
    expect(source).toContain("const THEME_KEYS = listForgeBiomeIds();");
    expect(source).toContain("for (const identity of listForgeBiomeIdentities())");
    expect(source).toContain("const BIOME_KEYS = listBiomeIds();");
  });
});
