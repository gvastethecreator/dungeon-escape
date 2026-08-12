import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";

import { getDungeonMood } from "../src/systems/DungeonMood";
import {
  createShaderProgramModeRegistry,
  resetShaderProgramModeRegistryForTests,
  setShaderProgramModeRegistry,
} from "../src/systems/ShaderProgramMode";
import { loadTslMaterialModules } from "../src/systems/TslMaterialModules";
import {
  BIOME_INTEGRATED_DECOR_SHADER_FACTORY_ID,
  BIOME_MUTED_PROP_SHADER_FACTORY_ID,
  createBiomeFloorSpriteMaterial,
  createBiomeWallDecalMaterial,
  createWallSpriteMaterial,
  registerBiomeDecorShaderFactories,
} from "../src/world/BiomeDecorMaterial";

function stubWallTextures(): {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  rough: THREE.Texture;
  depth: THREE.Texture;
} {
  const albedo = new THREE.Texture();
  return { albedo, normal: albedo, rough: albedo, depth: albedo };
}

// The shader program mode registry is process-global; leaking `tsl` mode
// into later test files would build node materials where GLSL is expected.
afterEach(() => {
  resetShaderProgramModeRegistryForTests();
});

// TSL builders live in lazily imported `*.tsl` siblings so the WebGL bundle
// never pulls in `three/webgpu`; tests must preload them like Play boot does.
beforeAll(async () => {
  await loadTslMaterialModules();
});

describe("biome decor dual-mode materials (WGP-16)", () => {
  test("registers muted and integrated factory ids for glsl and tsl", () => {
    resetShaderProgramModeRegistryForTests();
    setShaderProgramModeRegistry(createShaderProgramModeRegistry("glsl"));
    registerBiomeDecorShaderFactories();
    const registry = createShaderProgramModeRegistry("glsl");
    registerBiomeDecorShaderFactories(registry);
    expect(registry.supports(BIOME_MUTED_PROP_SHADER_FACTORY_ID, "glsl")).toBe(true);
    expect(registry.supports(BIOME_MUTED_PROP_SHADER_FACTORY_ID, "tsl")).toBe(true);
    expect(registry.supports(BIOME_INTEGRATED_DECOR_SHADER_FACTORY_ID, "tsl")).toBe(true);
  });

  test("GLSL mode keeps MeshStandardMaterial onBeforeCompile treatments", () => {
    resetShaderProgramModeRegistryForTests();
    setShaderProgramModeRegistry(createShaderProgramModeRegistry("glsl"));
    registerBiomeDecorShaderFactories();
    const mood = getDungeonMood("ash");
    const muted = createWallSpriteMaterial(stubWallTextures(), mood, 0.9);
    expect(muted).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(muted.userData.shaderProgramMode).toBe("glsl");
    expect(typeof muted.onBeforeCompile).toBe("function");

    const wall = createBiomeWallDecalMaterial(new THREE.Texture(), mood, 0.2);
    expect(wall).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(wall.userData.biomeSpriteWallDecal).toBe(true);

    const floor = createBiomeFloorSpriteMaterial(new THREE.Texture(), mood, "floor-decal", 0.2);
    expect(floor).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(floor.userData.biomeSpritePlacement).toBe("floor-decal");
  });

  test("TSL mode builds MeshStandardNodeMaterial color graphs", () => {
    resetShaderProgramModeRegistryForTests();
    setShaderProgramModeRegistry(createShaderProgramModeRegistry("tsl"));
    registerBiomeDecorShaderFactories();
    const mood = getDungeonMood("frost");
    const muted = createWallSpriteMaterial(stubWallTextures(), mood, 0.9);
    expect(muted).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(muted.userData.shaderProgramMode).toBe("tsl");
    expect((muted as MeshStandardNodeMaterial).colorNode).toBeTruthy();

    const wall = createBiomeWallDecalMaterial(new THREE.Texture(), mood, 0.18);
    expect(wall).toBeInstanceOf(MeshStandardNodeMaterial);
    expect((wall as MeshStandardNodeMaterial).colorNode).toBeTruthy();
  });
});
