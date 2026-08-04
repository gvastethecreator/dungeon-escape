import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import type { BiomeLayerTextures, BiomeSurfaceTextures } from "../src/world/AssetLibrary";
import { SceneTextureRegistry } from "../src/systems/SceneTextureRegistry";
import {
  applyBiomeMaps,
  createRoomSurfaceMaterials,
  disposeRoomSurfaceMaterials,
  type RoomSurfaceTextures,
} from "../src/world/RoomSurfaceMaterials";
import { registerTextureSource } from "../src/world/TextureTreatment";

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

class PendingSurfaceImage extends EventTarget {
  width = 0;
  height = 0;

  finish(): void {
    this.width = 8;
    this.height = 8;
    this.dispatchEvent(new Event("load"));
  }
}

describe("room surface finishes", () => {
  test("links every theme clone to source readiness and unregisters only owned clones", () => {
    const image = new PendingSurfaceImage();
    const source = new THREE.Texture(image);
    registerTextureSource(source, "/test/pending-surface.webp", { seam: "none" });
    source.generateMipmaps = true;
    const registry = new SceneTextureRegistry(false);
    let sourceDisposals = 0;
    source.addEventListener("dispose", () => (sourceDisposals += 1));
    const materials = createRoomSurfaceMaterials(
      { floor: source, wall: source, ceiling: source },
      registry,
    );

    expect(registry.diagnostics()).toEqual({
      smoothingEnabled: false,
      registered: 28,
      pending: 28,
    });
    const pendingVersion = materials.corridor.floor.map?.version;
    registry.setSmoothing(true);
    expect(materials.corridor.floor.map?.version).toBe(pendingVersion);
    image.finish();
    expect(registry.diagnostics().pending).toBe(0);
    expect(materials.corridor.floor.map?.magFilter).toBe(THREE.LinearFilter);

    disposeRoomSurfaceMaterials(materials);
    expect(registry.diagnostics().registered).toBe(1);
    expect(registry.has(source)).toBe(true);
    expect(sourceDisposals).toBe(0);
    registry.unregister(source);
  });

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
