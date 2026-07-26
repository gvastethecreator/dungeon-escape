import { describe, expect, test } from "bun:test";

import {
  applyMoodToDungeonMaterials,
  createDungeonMaterials,
  disposeDungeonMaterials,
  type DungeonMaterials,
} from "../src/world/MaterialLibrary";

describe("dungeon prop materials", () => {
  test("createDungeonMaterials yields the full iron-ash set", () => {
    const materials = createDungeonMaterials();
    const keys = Object.keys(materials) as (keyof DungeonMaterials)[];
    expect(keys.sort()).toEqual([
      "bone",
      "brass",
      "ceramic",
      "cloth",
      "crystal",
      "darkStone",
      "ice",
      "iron",
      "stone",
      "wood",
    ]);
  });

  test("metals stay heavier than dielectrics under IBL", () => {
    const materials = createDungeonMaterials();
    expect(materials.iron.metalness).toBeGreaterThan(materials.wood.metalness);
    expect(materials.brass.metalness).toBeGreaterThan(materials.ceramic.metalness);
    expect(materials.iron.envMapIntensity).toBeGreaterThan(materials.stone.envMapIntensity);
  });

  test("every primary prop material carries an albedo map", () => {
    const materials = createDungeonMaterials();
    for (const key of ["wood", "iron", "brass", "ceramic", "bone", "crystal", "ice"] as const) {
      expect(materials[key].map).toBeDefined();
    }
  });

  test("in SSR/test runtime the procedural bump fallback is used (no PBR load)", () => {
    // When document is undefined (Bun test env), loadPbrMaps returns nulls and
    // the procedural bumpMap must remain so the prop still has microsurface.
    const materials = createDungeonMaterials();
    expect(materials.wood.bumpMap).toBeDefined();
    expect(materials.wood.normalMap).toBeNull();
    expect(materials.wood.roughnessMap).toBeNull();
    expect(materials.iron.bumpMap).toBeDefined();
    expect(materials.brass.bumpMap).toBeDefined();
    expect(materials.ceramic.bumpMap).toBeDefined();
  });

  test("disposeDungeonMaterials clears maps without throwing", () => {
    const materials = createDungeonMaterials();
    expect(() => disposeDungeonMaterials(materials)).not.toThrow();
    for (const material of Object.values(materials)) {
      expect(() => material.dispose()).not.toThrow();
    }
  });

  test("compact materials keep albedo detail without extra surface maps", () => {
    const materials = createDungeonMaterials({ compact: true });
    for (const material of Object.values(materials)) {
      expect(material.map).toBeDefined();
      expect(material.bumpMap).toBeNull();
      expect(material.normalMap).toBeNull();
      expect(material.roughnessMap).toBeNull();
    }
  });

  test("biome tint is restrained per material role and does not accumulate", () => {
    const materials = createDungeonMaterials();
    const originalWood = materials.wood.color.getHex();
    applyMoodToDungeonMaterials(materials, 0x6f8f78, 1);
    const verdantWood = materials.wood.color.getHex();
    const verdantIron = materials.iron.color.getHex();
    expect(verdantWood).not.toBe(originalWood);
    applyMoodToDungeonMaterials(materials, 0x6f8f78, 1);
    expect(materials.wood.color.getHex()).toBe(verdantWood);
    applyMoodToDungeonMaterials(materials, 0xc4a85d, 1);
    expect(materials.wood.color.getHex()).not.toBe(verdantWood);
    expect(materials.iron.color.getHex()).not.toBe(verdantIron);
  });
});
