import { describe, expect, test } from "bun:test";

import { parseForgeDungeonMessage } from "../src/dungeon/forgeIntake";
import { FORGE_THEME_PROFILES } from "../src/forge/ForgeThemeProfiles";
import type { ForgeThemeId } from "../src/forge/ForgeThemeProfiles";
import { generateForgeDungeon } from "../src/forge/generateForgeDungeon";
import { listForgeBiomeIds } from "../src/systems/BiomeIdentity";

type ForgeGolden = {
  params: {
    seed: number;
    roomCount: number;
    loopChance: number;
    decorDensity: number;
  };
  cases: Record<
    string,
    {
      seed: number;
      name: string;
      W: number;
      H: number;
      entrance: number;
      boss: number;
      maxBfs: number;
      maxDepth: number;
      stats: Record<string, number>;
      arrays: Record<string, string>;
      lists: Record<string, string>;
    }
  >;
};

type ForgeTypedArray = Int16Array | Uint8Array;

const golden = (await Bun.file(
  new URL("./fixtures/forge-generation-golden.json", import.meta.url),
).json()) as ForgeGolden;

function fnv1a(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function typedArrayHash(value: ForgeTypedArray): string {
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return `${value.constructor.name}:${value.byteLength / value.BYTES_PER_ELEMENT}:${fnv1a(bytes)}`;
}

function listHash(value: unknown): string {
  return fnv1a(new TextEncoder().encode(JSON.stringify(value)));
}

function buildParams(themeKey: ForgeThemeId) {
  return { ...golden.params, themeKey };
}

function statsWithoutTiming(stats: Record<string, number>) {
  const { genMs: _genMs, ...rest } = stats;
  return rest;
}

describe("Forge pure generation", () => {
  test("keeps each Forge profile aligned with biome identity", () => {
    // Editor chips stay on forge-supported biomes; campaign theater also needs
    // ash/iron profiles so New Game map colors match play.
    for (const id of listForgeBiomeIds()) {
      expect(FORGE_THEME_PROFILES[id]).toBeDefined();
    }
    expect(FORGE_THEME_PROFILES.ash).toBeDefined();
    expect(FORGE_THEME_PROFILES.iron).toBeDefined();
  });

  test("imports without a DOM or WebGL runtime", async () => {
    expect(globalThis.document).toBeUndefined();
    const module = await import("../src/forge/generateForgeDungeon");
    expect(module.generateForgeDungeon).toBe(generateForgeDungeon);
  });

  test("rejects a room count that cannot form a dungeon", () => {
    expect(() =>
      generateForgeDungeon({
        ...buildParams("grim"),
        roomCount: 1,
      }),
    ).toThrow("Forge generation roomCount must be an integer from 2 to 80.");
  });

  test("rejects invalid public generator parameters before generation", () => {
    const valid = buildParams("grim");
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ seed: 1e308 }, "Forge generation seed must be an unsigned 32-bit integer."],
      [{ roomCount: 2.5 }, "Forge generation roomCount must be an integer from 2 to 80."],
      [{ loopChance: Number.NaN }, "Forge generation loopChance must be a number from 0 to 1."],
      [
        { decorDensity: Number.POSITIVE_INFINITY },
        "Forge generation decorDensity must be a number from 0 to 1.",
      ],
      [{ themeKey: "nope" }, "Forge generation themeKey is unsupported."],
    ];

    for (const [override, message] of cases) {
      expect(() =>
        generateForgeDungeon({
          ...valid,
          ...override,
        } as Parameters<typeof generateForgeDungeon>[0]),
      ).toThrow(message);
    }
  });

  test("matches the captured generation golden for every Forge theme", () => {
    for (const themeKey of Object.keys(golden.cases) as ForgeThemeId[]) {
      const expected = golden.cases[themeKey]!;
      const dungeon = generateForgeDungeon(buildParams(themeKey));

      expect(
        {
          seed: dungeon.seed,
          name: dungeon.name,
          W: dungeon.W,
          H: dungeon.H,
          entrance: dungeon.entrance,
          boss: dungeon.boss,
          maxBfs: dungeon.maxBfs,
          maxDepth: dungeon.maxDepth,
        },
        themeKey,
      ).toEqual({
        seed: expected.seed,
        name: expected.name,
        W: expected.W,
        H: expected.H,
        entrance: expected.entrance,
        boss: expected.boss,
        maxBfs: expected.maxBfs,
        maxDepth: expected.maxDepth,
      });
      expect(statsWithoutTiming(dungeon.stats), themeKey).toEqual(expected.stats);
      expect(dungeon.stats.genMs, themeKey).toBe(0);

      for (const [key, signature] of Object.entries(expected.arrays)) {
        expect(
          typedArrayHash(dungeon[key as keyof typeof dungeon] as ForgeTypedArray),
          `${themeKey}:${key}`,
        ).toBe(signature);
      }
      for (const [key, hash] of Object.entries(expected.lists)) {
        expect(listHash(dungeon[key as keyof typeof dungeon]), `${themeKey}:${key}`).toBe(hash);
      }
    }
  });

  test("is deterministic while returning fresh, cloneable output", () => {
    const params = buildParams("molten");
    const first = generateForgeDungeon(params);
    const second = generateForgeDungeon(params);

    expect(first).not.toBe(second);
    expect(first.grid).not.toBe(second.grid);
    expect(first.roomId).not.toBe(second.roomId);
    expect(typedArrayHash(first.grid)).toBe(typedArrayHash(second.grid));
    expect(listHash(first.props)).toBe(listHash(second.props));

    const clone = structuredClone(first);
    expect(clone).not.toBe(first);
    expect(clone.grid).not.toBe(first.grid);
    expect(typedArrayHash(clone.grid)).toBe(typedArrayHash(first.grid));
    expect(listHash(clone.rooms)).toBe(listHash(first.rooms));
  });

  test("produces a v1 payload accepted by the Forge intake for every theme", () => {
    for (const themeKey of Object.keys(golden.cases) as ForgeThemeId[]) {
      const dungeon = generateForgeDungeon(buildParams(themeKey));
      const result = parseForgeDungeonMessage({
        type: "black-flag:forge-dungeon",
        version: 1,
        dungeon,
      });

      expect(result.kind, themeKey).toBe("accepted");
      if (result.kind === "accepted") expect(result.value.params.profile).toBe(themeKey);
    }
  });
});
