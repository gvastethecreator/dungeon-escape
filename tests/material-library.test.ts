import { describe, expect, test } from "bun:test";

import {
  applyBiomeMapsToDungeonMaterials,
  applyMoodToDungeonMaterials,
  createDungeonMaterials,
  disposeDungeonMaterials,
  type DungeonMaterials,
} from "../src/world/MaterialLibrary";
import type { BiomeLayerTextures, BiomeSurfaceTextures } from "../src/world/AssetLibrary";
import * as THREE from "three";

function layer(name: string): BiomeLayerTextures {
  const albedo = new THREE.Texture();
  albedo.name = `${name}-albedo`;
  const normal = new THREE.Texture();
  normal.name = `${name}-normal`;
  const rough = new THREE.Texture();
  rough.name = `${name}-rough`;
  return { albedo, normal, rough, depth: null };
}

function biome(name: string): BiomeSurfaceTextures {
  return {
    floor: layer(`${name}-floor`),
    wall: layer(`${name}-wall`),
    ceiling: layer(`${name}-ceiling`),
  };
}

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

  test("dark prop roles reuse their albedo map as restrained indirect fill", () => {
    const materials = createDungeonMaterials();
    applyMoodToDungeonMaterials(materials, 0x77aaa2, 1);
    for (const key of [
      "stone",
      "darkStone",
      "wood",
      "iron",
      "brass",
      "cloth",
      "bone",
      "ceramic",
    ] as const) {
      expect(materials[key].emissiveMap).toBe(materials[key].map);
      expect(materials[key].emissiveIntensity).toBeGreaterThan(0.2);
      expect(materials[key].emissiveIntensity).toBeLessThan(0.6);
    }
    expect(materials.crystal.emissiveMap).toBeNull();
    expect(materials.ice.emissiveMap).toBeNull();
  });

  test("browser-white PBR multipliers return to distinct role colors before biome tint", () => {
    const materials = createDungeonMaterials();
    materials.wood.color.setHex(0xffffff);
    materials.iron.color.setHex(0xffffff);
    materials.brass.color.setHex(0xffffff);
    applyMoodToDungeonMaterials(materials, 0x77aaa2, 1);
    expect(
      new Set([materials.wood, materials.iron, materials.brass].map((m) => m.color.getHex())).size,
    ).toBe(3);
    expect(materials.wood.color.getHex()).not.toBe(0xffffff);
  });

  test("masonry props bind the active biome floor and wall PBR maps", () => {
    const materials = createDungeonMaterials();
    const sunken = biome("sunken");
    applyBiomeMapsToDungeonMaterials(materials, sunken, "sunken");
    expect(materials.stone.map).not.toBe(sunken.wall.albedo);
    expect(materials.stone.map?.image).toBe(sunken.wall.albedo.image);
    expect(materials.stone.map?.repeat.x).toBeCloseTo(1.25);
    expect(materials.stone.normalMap?.repeat.x).toBeCloseTo(1.25);
    expect(materials.stone.roughnessMap?.repeat.x).toBeCloseTo(1.25);
    expect(materials.darkStone.map).not.toBe(sunken.floor.albedo);
    expect(materials.darkStone.map?.image).toBe(sunken.floor.albedo.image);
    expect(materials.darkStone.map?.repeat.x).toBeCloseTo(1.4);
    expect(materials.darkStone.normalMap?.repeat.x).toBeCloseTo(1.4);
    expect(materials.darkStone.roughnessMap?.repeat.x).toBeCloseTo(1.4);

    const frost = biome("frost");
    applyBiomeMapsToDungeonMaterials(materials, frost, "frost");
    expect(materials.stone.map?.image).toBe(frost.wall.albedo.image);
    expect(materials.darkStone.map?.image).toBe(frost.floor.albedo.image);
    expect(materials.stone.roughness).toBeLessThan(materials.darkStone.roughness);
  });
});
