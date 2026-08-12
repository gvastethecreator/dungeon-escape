import { afterEach, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";

import {
  createShaderProgramModeRegistry,
  getShaderProgramModeRegistry,
  resetShaderProgramModeRegistryForTests,
  setShaderProgramModeRegistry,
} from "../src/systems/ShaderProgramMode";
import { getDungeonMood } from "../src/systems/DungeonMood";
import {
  createEnemyBillboardMaterial,
  createEnemyBillboardMaterialTsl,
  ENEMY_BILLBOARD_SHADER_FACTORY_ID,
  registerEnemyBillboardShaderFactory,
  setEnemyBillboardFrame,
  setEnemyFreezeAmount,
} from "../src/world/EnemyBillboardMaterial";
import {
  createEnemyTrailMaterial,
  createEnemyTrailMaterialTsl,
  ENEMY_MOTION_TRAIL_SHADER_FACTORY_ID,
  registerEnemyMotionTrailShaderFactory,
} from "../src/world/EnemyMotionTrailVfx";
import { ENEMY_ANIMATIONS } from "../src/world/EnemySpriteAtlas";

// The shader program mode registry is process-global; leaking `tsl` mode
// into later test files would build node materials where GLSL is expected.
afterEach(() => {
  resetShaderProgramModeRegistryForTests();
});

describe("enemy billboard TSL port", () => {
  test("glsl path keeps onBeforeCompile atlas/freeze wiring", () => {
    resetShaderProgramModeRegistryForTests();
    const material = createEnemyBillboardMaterial(new THREE.Texture(), getDungeonMood("frost"));
    expect(material.userData.enemyBillboardShaderMode).toBe("glsl");
    const glslMaterial = material as THREE.MeshStandardMaterial;
    expect(glslMaterial.isMeshStandardMaterial).toBe(true);
    expect(glslMaterial.customProgramCacheKey()).toBe("enemy-billboard-instance-atlas-freeze-v6");

    const shader = {
      vertexShader: "#include <common>\n#include <uv_vertex>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <alphatest_fragment>\n#include <emissivemap_fragment>",
      uniforms: {} as Record<string, { value: unknown }>,
    };
    glslMaterial.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );
    expect(shader.vertexShader).toContain("attribute float aEnemyVisibility");
    expect(shader.vertexShader).toContain("attribute vec4 aEnemyAtlasFrame");
    expect(shader.fragmentShader).toContain("vec3(0.299, 0.587, 0.114)");
    expect(shader.fragmentShader).not.toContain("luminance(");
    expect(shader.uniforms.uEnemyFreeze).toBe(material.userData.enemyFreezeAmount!);

    setEnemyFreezeAmount(material, 0.55);
    expect(material.userData.enemyFreezeAmount?.value).toBeCloseTo(0.55, 5);
    material.dispose();
  });

  test("TSL billboard registers dual-mode factory and wires node properties", () => {
    resetShaderProgramModeRegistryForTests();
    setShaderProgramModeRegistry(createShaderProgramModeRegistry("tsl"));
    registerEnemyBillboardShaderFactory();

    const material = createEnemyBillboardMaterial(new THREE.Texture(), getDungeonMood("fungal"));
    const nodeMaterial = material as unknown as MeshStandardNodeMaterial;
    expect(material.userData.enemyBillboardShaderMode).toBe("tsl");
    expect(nodeMaterial.isMeshStandardNodeMaterial).toBe(true);
    expect(nodeMaterial.colorNode).toBeTruthy();
    expect(nodeMaterial.contextNode).toBeTruthy();
    expect(nodeMaterial.opacityNode).toBeTruthy();
    expect(nodeMaterial.emissiveNode).toBeTruthy();
    expect(material.customProgramCacheKey()).toBe("enemy-billboard-instance-atlas-freeze-tsl-v1");
    expect(material.onBeforeCompile).toBe(THREE.Material.prototype.onBeforeCompile);

    setEnemyFreezeAmount(material, 1);
    expect(material.userData.enemyFreezeAmount?.value).toBe(1);
    setEnemyBillboardFrame(material, ENEMY_ANIMATIONS.goblin, 2);
    expect(material.userData.enemyAtlasFrame).toBeInstanceOf(THREE.Vector4);

    const again = createEnemyBillboardMaterialTsl(new THREE.Texture(), getDungeonMood("frost"));
    expect(again.userData.enemyBillboardShaderMode).toBe("tsl");
    again.dispose();
    material.dispose();

    const registry = createShaderProgramModeRegistry("glsl");
    registerEnemyBillboardShaderFactory(registry);
    expect(registry.supports(ENEMY_BILLBOARD_SHADER_FACTORY_ID, "glsl")).toBe(true);
    expect(registry.supports(ENEMY_BILLBOARD_SHADER_FACTORY_ID, "tsl")).toBe(true);
    resetShaderProgramModeRegistryForTests();
  });

  test("enemy-billboard factory rebinds across registry swaps", () => {
    resetShaderProgramModeRegistryForTests();
    expect(getShaderProgramModeRegistry().supports(ENEMY_BILLBOARD_SHADER_FACTORY_ID, "tsl")).toBe(
      true,
    );
    setShaderProgramModeRegistry(createShaderProgramModeRegistry("tsl"));
    registerEnemyBillboardShaderFactory();
    expect(getShaderProgramModeRegistry().supports(ENEMY_BILLBOARD_SHADER_FACTORY_ID, "glsl")).toBe(
      true,
    );
    expect(getShaderProgramModeRegistry().supports(ENEMY_BILLBOARD_SHADER_FACTORY_ID, "tsl")).toBe(
      true,
    );
    resetShaderProgramModeRegistryForTests();
  });
});

describe("enemy motion trail TSL port", () => {
  test("glsl path keeps black atlas afterimage compile wiring", () => {
    resetShaderProgramModeRegistryForTests();
    const material = createEnemyTrailMaterial(new THREE.Texture());
    expect(material.userData.enemyMotionTrailShaderMode).toBe("glsl");
    expect((material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x000000);
    expect(material.customProgramCacheKey?.()).toBe("enemy-motion-trail-black-atlas-v2");

    const shader = {
      vertexShader: "#include <common>\n#include <uv_vertex>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <map_fragment>",
      uniforms: {} as Record<string, { value: unknown }>,
    };
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );
    expect(shader.vertexShader).toContain("attribute float aTrailAlpha");
    expect(shader.vertexShader).toContain("uEnemyAtlasFrame");
    expect(shader.fragmentShader).toContain("diffuseColor.rgb = vec3(0.0)");
    material.dispose();
  });

  test("TSL trail registers dual-mode factory and wires node properties", () => {
    resetShaderProgramModeRegistryForTests();
    setShaderProgramModeRegistry(createShaderProgramModeRegistry("tsl"));
    registerEnemyMotionTrailShaderFactory();

    const material = createEnemyTrailMaterial(new THREE.Texture());
    const nodeMaterial = material as MeshBasicNodeMaterial;
    expect(material.userData.enemyMotionTrailShaderMode).toBe("tsl");
    expect(nodeMaterial.isMeshBasicNodeMaterial).toBe(true);
    expect(nodeMaterial.colorNode).toBeTruthy();
    expect(nodeMaterial.contextNode).toBeTruthy();
    expect(nodeMaterial.opacityNode).toBeTruthy();
    expect(material.customProgramCacheKey?.()).toBe("enemy-motion-trail-black-atlas-tsl-v1");
    expect(material.onBeforeCompile).toBe(THREE.Material.prototype.onBeforeCompile);

    setEnemyBillboardFrame(material, ENEMY_ANIMATIONS.goblin, 1);
    expect(material.userData.enemyAtlasFrame).toBeInstanceOf(THREE.Vector4);

    const again = createEnemyTrailMaterialTsl(new THREE.Texture());
    expect(again.userData.enemyMotionTrailShaderMode).toBe("tsl");
    again.dispose();
    material.dispose();

    const registry = createShaderProgramModeRegistry("glsl");
    registerEnemyMotionTrailShaderFactory(registry);
    expect(registry.supports(ENEMY_MOTION_TRAIL_SHADER_FACTORY_ID, "glsl")).toBe(true);
    expect(registry.supports(ENEMY_MOTION_TRAIL_SHADER_FACTORY_ID, "tsl")).toBe(true);
    resetShaderProgramModeRegistryForTests();
  });
});
