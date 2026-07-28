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
      "paintedSteel",
      "root",
      "stone",
      "wood",
    ]);
  });

  test("metals stay heavier than dielectrics under IBL", () => {
    const materials = createDungeonMaterials();
    expect(materials.iron.metalness).toBeGreaterThan(materials.wood.metalness);
    expect(materials.paintedSteel.metalness).toBeGreaterThan(materials.root.metalness);
    expect(materials.brass.metalness).toBeGreaterThan(materials.ceramic.metalness);
    expect(materials.iron.envMapIntensity).toBeGreaterThan(materials.stone.envMapIntensity);
  });

  test("every primary prop material carries an albedo map", () => {
    const materials = createDungeonMaterials();
    for (const key of [
      "wood",
      "root",
      "iron",
      "paintedSteel",
      "brass",
      "ceramic",
      "bone",
      "crystal",
      "ice",
    ] as const) {
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
    expect(materials.wood.aoMap).toBeNull();
    expect(materials.iron.bumpMap).toBeDefined();
    expect(materials.root.bumpMap).toBeDefined();
    expect(materials.paintedSteel.bumpMap).toBeDefined();
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
      expect(material.aoMap).toBeNull();
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

  test("matte roles use low indirect fill while metals keep scene reflections", () => {
    const materials = createDungeonMaterials();
    applyMoodToDungeonMaterials(materials, 0x77aaa2, 1);
    for (const key of ["stone", "darkStone", "wood", "root", "cloth", "bone", "ceramic"] as const) {
      expect(materials[key].emissiveMap).toBe(materials[key].map);
      expect(materials[key].emissiveIntensity).toBeGreaterThan(0.04);
      expect(materials[key].emissiveIntensity).toBeLessThan(0.2);
    }
    expect(materials.wood.emissiveIntensity).toBeGreaterThanOrEqual(0.14);
    expect(materials.bone.emissiveIntensity).toBeGreaterThanOrEqual(0.1);
    expect(materials.cloth.emissiveIntensity).toBeGreaterThanOrEqual(0.1);
    expect(materials.ceramic.emissiveIntensity).toBeGreaterThanOrEqual(0.1);
    for (const key of ["iron", "paintedSteel", "brass"] as const) {
      expect(materials[key].emissiveMap).toBeNull();
      expect(materials[key].emissiveIntensity).toBe(0);
    }
    expect(materials.crystal.emissiveMap).toBeNull();
    expect(materials.ice.emissiveMap).toBeNull();
    expect(materials.crystal.emissiveIntensity).toBeGreaterThan(0.5);
    expect(materials.ice.emissiveIntensity).toBeGreaterThan(0.2);
  });

  test("role finishes keep roughness and IBL response distinct", () => {
    const materials = createDungeonMaterials();
    applyMoodToDungeonMaterials(materials, 0x77aaa2, 1);
    expect(materials.cloth.roughness).toBe(1);
    expect(materials.stone.roughness).toBeGreaterThan(materials.wood.roughness);
    expect(materials.iron.roughness).toBeGreaterThan(materials.brass.roughness);
    expect(materials.iron.envMapIntensity).toBeGreaterThanOrEqual(1);
    expect(materials.iron.envMapIntensity).toBeLessThanOrEqual(1.5);
    expect(materials.iron.envMapIntensity).toBeGreaterThan(materials.brass.envMapIntensity);
    expect(materials.brass.envMapIntensity).toBeGreaterThan(materials.wood.envMapIntensity);
    expect(materials.crystal.roughness).toBeLessThan(materials.ice.roughness);
  });

  test("absolute PBR roughness maps are not multiplied by the fallback scalar", () => {
    const materials = createDungeonMaterials();
    materials.iron.roughnessMap = new THREE.Texture();
    materials.iron.userData.absoluteRoughnessMap = true;
    materials.iron.roughness = 0.4;
    applyMoodToDungeonMaterials(materials, 0x77aaa2, 1);
    expect(materials.iron.roughness).toBe(1);
  });

  test("browser-white PBR multipliers return to distinct role colors before biome tint", () => {
    const materials = createDungeonMaterials();
    for (const material of [materials.wood, materials.iron, materials.brass]) {
      material.color.setHex(0xffffff);
      material.userData.baseDungeonColor = 0xffffff;
    }
    applyMoodToDungeonMaterials(materials, 0x77aaa2, 1);
    expect(
      new Set([materials.wood, materials.iron, materials.brass].map((m) => m.color.getHex())).size,
    ).toBe(3);
    expect(materials.wood.color.getHex()).not.toBe(0xffffff);
  });

  test("stone props keep their role maps while the room changes biome surfaces", () => {
    const materials = createDungeonMaterials();
    const stoneMaps = {
      map: materials.stone.map,
      normal: materials.stone.normalMap,
      roughness: materials.stone.roughnessMap,
    };
    const darkStoneMaps = {
      map: materials.darkStone.map,
      normal: materials.darkStone.normalMap,
      roughness: materials.darkStone.roughnessMap,
    };
    const sunken = biome("sunken");
    applyBiomeMapsToDungeonMaterials(materials, sunken, "sunken");
    expect(materials.stone.map).toBe(stoneMaps.map);
    expect(materials.stone.normalMap).toBe(stoneMaps.normal);
    expect(materials.stone.roughnessMap).toBe(stoneMaps.roughness);
    expect(materials.darkStone.map).toBe(darkStoneMaps.map);
    expect(materials.darkStone.normalMap).toBe(darkStoneMaps.normal);
    expect(materials.darkStone.roughnessMap).toBe(darkStoneMaps.roughness);
    expect(materials.stone.userData.biomePropMoodId).toBe("sunken");
    expect(materials.stone.userData.biomeMasonryBound).toBe(false);

    const frost = biome("frost");
    applyBiomeMapsToDungeonMaterials(materials, frost, "frost");
    expect(materials.stone.map).toBe(stoneMaps.map);
    expect(materials.darkStone.map).toBe(darkStoneMaps.map);
    expect(materials.stone.userData.biomePropMoodId).toBe("frost");
  });
});
