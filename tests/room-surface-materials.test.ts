import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import type { BiomeLayerTextures, BiomeSurfaceTextures } from "../src/world/AssetLibrary";
import {
  applyBiomeMaps,
  createRoomSurfaceMaterials,
  disposeRoomSurfaceMaterials,
  type RoomSurfaceTextures,
} from "../src/world/RoomSurfaceMaterials";

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

function baseTextures(): RoomSurfaceTextures {
  return {
    floor: new THREE.Texture(),
    wall: new THREE.Texture(),
    ceiling: new THREE.Texture(),
  };
}

describe("room surface finishes", () => {
  test("propagates biome-specific roughness and IBL response by layer", () => {
    const materials = createRoomSurfaceMaterials(baseTextures());
    applyBiomeMaps(materials, biome("sunken"), "sunken");
    expect(materials.corridor.floor.roughness).toBeCloseTo(0.94);
    expect(materials.corridor.floor.envMapIntensity).toBeCloseTo(0.22);
    expect(materials.corridor.wall.roughness).toBeCloseTo(0.97);
    expect(materials.corridor.wall.envMapIntensity).toBeCloseTo(0.17);
    expect(materials.corridor.ceiling.envMapIntensity).toBeCloseTo(0.11);

    applyBiomeMaps(materials, biome("obsidian"), "obsidian");
    expect(materials.corridor.floor.roughness).toBeCloseTo(0.82);
    expect(materials.corridor.floor.envMapIntensity).toBeCloseTo(0.3);
    expect(materials.corridor.wall.envMapIntensity).toBeCloseTo(0.24);
    expect(materials.corridor.floor.envMapIntensity).toBeGreaterThan(
      materials.corridor.wall.envMapIntensity,
    );
    expect(materials.corridor.floor.metalness).toBeCloseTo(0.02);
    disposeRoomSurfaceMaterials(materials);
  });
});
