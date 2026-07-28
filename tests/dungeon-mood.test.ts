import { describe, expect, test } from "bun:test";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import type { DungeonData } from "../src/dungeon/types";
import { FORGE_THEME_PROFILES } from "../src/forge/ForgeThemeProfiles";
import { listBiomeIds, listForgeBiomeIds } from "../src/systems/BiomeIdentity";
import {
  listDungeonMoodIds,
  parseDungeonMoodId,
  resolveDungeonMood,
} from "../src/systems/DungeonMood";
import {
  biomeDoorTextureUrl,
  biomeTextureUrl,
  biomeWallDecorTextureUrl,
} from "../src/world/AssetLibrary";
import { getBiomeDecorationProfile } from "../src/world/BiomeDecorationProfile";
import {
  applyMoodToSurfaceMaterials,
  createRoomSurfaceMaterials,
} from "../src/world/RoomSurfaceMaterials";
import * as THREE from "three";
import { existsSync } from "node:fs";
import { join } from "node:path";

function withForgeTheme(dungeon: DungeonData, themeKey: string): DungeonData {
  return {
    ...dungeon,
    forge: {
      name: "test",
      themeKey,
      roomTypes: {},
      source: "dungeon-forge",
      seed: 1,
      decorDensity: 1,
      maxBfs: 0,
      maxDepth: 0,
      roomIds: new Int16Array(dungeon.width * dungeon.height),
      corridors: new Uint8Array(dungeon.width * dungeon.height),
      doorways: new Uint8Array(dungeon.width * dungeon.height),
      bfs: new Int32Array(dungeon.width * dungeon.height),
      pools: new Uint8Array(dungeon.width * dungeon.height),
      lakeMask: new Uint8Array(dungeon.width * dungeon.height),
      rooms: [],
      props: [],
      spawns: [],
      torches: [],
      arches: [],
    },
  };
}

describe("dungeon mood tints", () => {
  test("ships eleven moods with four distinct expansion biomes", () => {
    expect(listDungeonMoodIds()).toEqual([
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
    ]);
  });

  test("forge themeKey wins over profile", () => {
    const base = generateDungeon("MOOD-FORGE", { roomTarget: 8 });
    const molten = resolveDungeonMood(withForgeTheme(base, "molten"), "crypt");
    expect(molten.id).toBe("molten");
    expect(molten.fog).not.toBe(resolveDungeonMood(base, "crypt").fog);
  });

  test("profile crypt biases toward grim while staying deterministic", () => {
    const dungeon = generateDungeon("MOOD-CRYPT-A", { roomTarget: 8 });
    const first = resolveDungeonMood(dungeon, "crypt");
    const second = resolveDungeonMood(dungeon, "crypt");
    expect(first.id).toBe(second.id);
    expect(first.surfaceTint).toBe(second.surfaceTint);
  });

  test("seed hash yields a known mood without forge or profile", () => {
    const dungeon = generateDungeon("MOOD-SEED", { roomTarget: 8 });
    const mood = resolveDungeonMood(dungeon);
    expect(listDungeonMoodIds()).toContain(mood.id);
  });

  test("backrooms stays rare in seeded runs and direct in authored runs", () => {
    const base = generateDungeon("MOOD-SPECIAL", { roomTarget: 8 });
    // Independent rare channel (same mix as resolveDungeonMood).
    const channel = (hash: number, salt: number) =>
      (Math.imul(Math.abs(hash) ^ salt, 2654435761) >>> 0);
    let rareHash = 0;
    let commonHash = 1;
    for (let h = 0; h < 50_000; h++) {
      if (channel(h, 0xa5a5a5a5) % 100 < 8) {
        rareHash = h;
        break;
      }
    }
    for (let h = 0; h < 50_000; h++) {
      if (channel(h, 0xa5a5a5a5) % 100 >= 8) {
        commonHash = h;
        break;
      }
    }
    expect(resolveDungeonMood({ ...base, seedHash: rareHash }).id).toBe("backrooms");
    expect(resolveDungeonMood({ ...base, seedHash: commonHash }).id).not.toBe("backrooms");
    expect(resolveDungeonMood(withForgeTheme(base, "backrooms")).id).toBe("backrooms");
  });

  test("NEW GAME balanced profile can resolve every biome including backrooms", () => {
    const counts = Object.fromEntries(listDungeonMoodIds().map((id) => [id, 0])) as Record<
      string,
      number
    >;
    const samples = 4_000;
    for (let i = 0; i < samples; i++) {
      const dungeon = generateDungeon(`ASH-BAL-${i.toString(36).toUpperCase()}`, {
        roomTarget: 8,
      });
      counts[resolveDungeonMood(dungeon, "balanced").id] += 1;
    }
    // Default NEW GAME uses profile "balanced". Every authored biome must be reachable.
    for (const id of listDungeonMoodIds()) {
      expect(counts[id]).toBeGreaterThan(0);
    }
    // Backrooms stays uncommon but well above a one-in-thousands fluke.
    expect(counts.backrooms).toBeGreaterThan(samples * 0.04);
    expect(counts.backrooms).toBeLessThan(samples * 0.14);
    // Profile still biases ash without erasing the rest of the roster.
    expect(counts.ash).toBeGreaterThan(counts.frost);
    expect(counts.ash).toBeLessThan(samples * 0.65);
  });

  test("distinct moods change fog and surface tint values", () => {
    const dungeon = generateDungeon("MOOD-RANGE", { roomTarget: 8 });
    const frost = resolveDungeonMood(withForgeTheme(dungeon, "frost"));
    const grim = resolveDungeonMood(withForgeTheme(dungeon, "grim"));
    expect(frost.fog).not.toBe(grim.fog);
    expect(frost.mistColor).not.toBe(grim.mistColor);
    expect(frost.surfaceTint).not.toBe(grim.surfaceTint);
    expect(frost.environmentIntensity).not.toBe(grim.environmentIntensity);
  });

  test("surface materials recolor from base palettes under a mood", () => {
    const map = new THREE.Texture();
    const surfaces = createRoomSurfaceMaterials({ floor: map, wall: map, ceiling: map });
    const before = surfaces.corridor.floor.color.getHex();
    applyMoodToSurfaceMaterials(surfaces, 0xff8040, 0.8);
    expect(surfaces.corridor.floor.color.getHex()).not.toBe(before);
    applyMoodToSurfaceMaterials(surfaces, 0xffffff, 0, 1);
    expect(surfaces.corridor.floor.color.getHex()).toBe(before);
  });

  test("albedoGain darkens surfaces for bright biomes like frost", () => {
    const map = new THREE.Texture();
    const surfaces = createRoomSurfaceMaterials({ floor: map, wall: map, ceiling: map });
    applyMoodToSurfaceMaterials(surfaces, 0xffffff, 0, 1);
    const full = surfaces.corridor.floor.color.r;
    applyMoodToSurfaceMaterials(surfaces, 0xffffff, 0, 0.55);
    expect(surfaces.corridor.floor.color.r).toBeCloseTo(full * 0.55, 5);
  });

  test("parseDungeonMoodId accepts known ids and rejects junk", () => {
    expect(parseDungeonMoodId("frost")).toBe("frost");
    expect(parseDungeonMoodId("MOLTEN")).toBe("molten");
    expect(parseDungeonMoodId("BACKROOMS")).toBe("backrooms");
    expect(parseDungeonMoodId("nope")).toBeNull();
    expect(parseDungeonMoodId(null)).toBeNull();
  });

  test("Forge exposes every expansion biome and loads its surface pack", async () => {
    const source = await Bun.file(new URL("../src/forge/main.js", import.meta.url)).text();
    for (const id of ["obsidian", "sunken", "fungal", "backrooms"] as const) {
      expect(listForgeBiomeIds()).toContain(id);
      expect(listBiomeIds()).toContain(id);
      expect(FORGE_THEME_PROFILES[id]).toBeDefined();
    }
    expect(source).toContain("const THEME_KEYS = listForgeBiomeIds();");
    expect(source).toContain("const BIOME_KEYS = listBiomeIds();");
    expect(source).toContain("for (const identity of listForgeBiomeIdentities())");
    expect(source).toContain('moodChannel(seed, 0xa5a5a5a5) % 100 < 8');
    expect(source).toContain('return "backrooms"');
    expect(FORGE_THEME_PROFILES.backrooms.fluorescent).toBe(true);
    expect(source).toContain("if (TH.fluorescent)");
    expect(source).toContain('["panelGlow", GEO.panelGlow, matGlow');
  });

  test("every biome ships pixel floor, wall and ceiling maps", () => {
    const root = join(import.meta.dir, "../public/assets/textures/biomes");
    for (const id of listDungeonMoodIds()) {
      for (const surface of ["floor", "wall", "ceiling"] as const) {
        expect(existsSync(join(root, id, `${surface}.png`))).toBe(true);
        expect(biomeTextureUrl(id, surface)).toBe(`/assets/textures/biomes/${id}/${surface}.png`);
        // DepthAnything V2 baked PBR companions
        for (const kind of ["normal", "rough", "depth"] as const) {
          expect(existsSync(join(root, id, `${surface}-${kind}.png`))).toBe(true);
          expect(biomeTextureUrl(id, surface, kind)).toBe(
            `/assets/textures/biomes/${id}/${surface}-${kind}.png`,
          );
        }
      }
    }
  });

  test("every biome ships ImageGen door and wall-decor assets", () => {
    const textureRoot = join(import.meta.dir, "../public/assets/textures/biomes");
    const spriteRoot = join(import.meta.dir, "../public/assets/sprites/biomes");
    for (const id of listDungeonMoodIds()) {
      expect(existsSync(join(textureRoot, id, "door.png"))).toBe(true);
      expect(existsSync(join(spriteRoot, `${id}-wall-decor.png`))).toBe(true);
      expect(biomeDoorTextureUrl(id)).toBe(`/assets/textures/biomes/${id}/door.png`);
      expect(biomeWallDecorTextureUrl(id)).toBe(`/assets/sprites/biomes/${id}-wall-decor.png`);
    }
    expect(existsSync(join(import.meta.dir, "../assets-source/imagegen/biome-doors-v1.png"))).toBe(
      true,
    );
    expect(
      existsSync(join(import.meta.dir, "../assets-source/imagegen/uncanny-wall-decor-v1.png")),
    ).toBe(true);
  });

  test("decoration forms change with biome identity", () => {
    expect(getBiomeDecorationProfile("backrooms")).toMatchObject({
      doorStyle: "office",
      curvedArch: false,
      wallDecorDensity: 1.6,
    });
    expect(getBiomeDecorationProfile("verdant").hangingKind).toBe("vine");
    expect(getBiomeDecorationProfile("fungal").hangingKind).toBe("vine");
    expect(getBiomeDecorationProfile("iron").hangingKind).toBe("chain");
    expect(getBiomeDecorationProfile("verdant").hangingKinds).toContain("root-cluster");
    expect(getBiomeDecorationProfile("iron").hangingKinds).toContain("iron-cage");
    expect(getBiomeDecorationProfile("grim").hangingKinds).toContain("bone-mobile");
    expect(getBiomeDecorationProfile("grim").boneDensity).toBeGreaterThan(
      getBiomeDecorationProfile("verdant").boneDensity,
    );
  });
});
