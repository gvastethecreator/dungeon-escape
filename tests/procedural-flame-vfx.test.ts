import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { MeshBasicNodeMaterial, PointsNodeMaterial } from "three/webgpu";

import {
  createShaderProgramModeRegistry,
  getShaderProgramModeRegistry,
  resetShaderProgramModeRegistryForTests,
  setShaderProgramModeRegistry,
} from "../src/systems/ShaderProgramMode";
import { loadTslMaterialModules } from "../src/systems/TslMaterialModules";
import {
  createNoiseFlame,
  NOISE_FLAME_SHADER_FACTORY_ID,
  registerNoiseFlameShaderFactory,
  setNoiseFlameMoodPalette,
  tickNoiseFlame,
  type NoiseFlameEmberUniformHandles,
  type NoiseFlameUniformHandles,
} from "../src/world/ProceduralFlameVfx";

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

describe("procedural noise flame", () => {
  test("rebuilds the reference technique on one two-triangle card", () => {
    resetShaderProgramModeRegistryForTests();
    const result = createNoiseFlame({
      name: "Test flame",
      width: 0.4,
      height: 0.6,
      phase: 1.25,
    });

    expect(result.flame.geometry.name).toBe("Procedural teardrop noise flame card");
    expect(result.flame.geometry.userData.referenceTechnique).toBe(
      "teardrop-noise-offset-threshold-palette",
    );
    expect(result.flame.geometry.userData.edgePadding).toEqual({ bottom: 0.08, top: 0.08 });
    expect(result.flame.geometry.boundingBox?.min.y).toBeCloseTo(-0.08);
    expect(result.flame.geometry.boundingBox?.max.y).toBeCloseTo(1.08);
    expect(result.flame.geometry.getAttribute("position").count).toBe(4);
    expect(result.flame.material).toBe(result.material);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toBeInstanceOf(THREE.Points);
    expect(result.details[0]?.name).toBe("Floating flame embers");
    expect(result.material.userData.sourceTechnique).toContain("animated noise offset/map");
    expect(result.material.userData.shaderProgramMode).toBe("glsl");
    expect((result.material as THREE.ShaderMaterial).fragmentShader).toContain("tipFade");
    expect((result.material as THREE.ShaderMaterial).fragmentShader).toContain("baseFade");
    expect((result.material as THREE.ShaderMaterial).fragmentShader).toContain("baseWidth");
    expect((result.material as THREE.ShaderMaterial).fragmentShader).toContain(
      "smoothstep(0.965, 1.0, y)",
    );
    expect((result.details[0] as THREE.Points).material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(result.material.blending).toBe(THREE.NormalBlending);
    expect(result.material.depthWrite).toBe(false);
    expect(result.material.toneMapped).toBe(true);
    expect(result.material.fog).toBe(true);
  });

  test("animates and fades through uniforms while accepting biome palettes", () => {
    resetShaderProgramModeRegistryForTests();
    const result = createNoiseFlame({
      name: "Test flame",
      width: 0.3,
      height: 0.5,
      phase: 0,
      opacity: 0.8,
    });
    const outer = new THREE.Color(0x326ec8);
    const core = new THREE.Color(0x9cecff);
    const handles = result.material.userData.noiseFlameHandles as NoiseFlameUniformHandles;

    expect(setNoiseFlameMoodPalette(result.material, outer, core)).toBe(true);
    const sourceHsl = { h: 0, s: 0, l: 0 };
    const vividHsl = { h: 0, s: 0, l: 0 };
    outer.getHSL(sourceHsl);
    handles.uOuterColor.value.getHSL(vividHsl);
    expect(vividHsl.s).toBeGreaterThan(sourceHsl.s);
    expect(tickNoiseFlame(result.material, 3.5, 0.25)).toBe(true);
    expect(handles.uTime.value).toBe(3.5);
    expect(handles.uOpacity.value).toBeCloseTo(0.2);
    const emberHandles = result.material.userData.emberHandles as NoiseFlameEmberUniformHandles;
    expect(emberHandles.uTime.value).toBe(3.5);
    expect(emberHandles.uOpacity.value).toBeCloseTo(0.2);
  });

  test("TSL mode builds MeshBasicNodeMaterial flame and sprite embers", () => {
    resetShaderProgramModeRegistryForTests();
    setShaderProgramModeRegistry(createShaderProgramModeRegistry("tsl"));
    registerNoiseFlameShaderFactory();

    const result = createNoiseFlame({
      name: "TSL flame",
      width: 0.4,
      height: 0.6,
      phase: 0.5,
      opacity: 0.9,
    });

    expect(result.material).toBeInstanceOf(MeshBasicNodeMaterial);
    expect(result.material.userData.shaderProgramMode).toBe("tsl");
    expect(result.material.userData.noiseFlameHandles).toBeDefined();
    expect(result.details[0]).toBeInstanceOf(THREE.Sprite);
    expect(result.details[0]?.userData.emberPrimitive).toBe("sprite");
    expect((result.details[0] as THREE.Sprite).count).toBeGreaterThanOrEqual(4);
    expect(result.material.userData.emberMaterial).toBeInstanceOf(PointsNodeMaterial);

    const outer = new THREE.Color(0x326ec8);
    const core = new THREE.Color(0x9cecff);
    expect(setNoiseFlameMoodPalette(result.material, outer, core)).toBe(true);
    expect(tickNoiseFlame(result.material, 2, 0.5)).toBe(true);
    const handles = result.material.userData.noiseFlameHandles as NoiseFlameUniformHandles;
    expect(handles.uTime.value).toBe(2);
    expect(handles.uOpacity.value).toBeCloseTo(0.45);

    resetShaderProgramModeRegistryForTests();
  });

  test("factory registers glsl+tsl and rebinds across registry swaps", () => {
    resetShaderProgramModeRegistryForTests();
    registerNoiseFlameShaderFactory();
    expect(getShaderProgramModeRegistry().supports(NOISE_FLAME_SHADER_FACTORY_ID, "glsl")).toBe(
      true,
    );
    expect(getShaderProgramModeRegistry().supports(NOISE_FLAME_SHADER_FACTORY_ID, "tsl")).toBe(
      true,
    );

    setShaderProgramModeRegistry(createShaderProgramModeRegistry("tsl"));
    registerNoiseFlameShaderFactory();
    expect(getShaderProgramModeRegistry().supports(NOISE_FLAME_SHADER_FACTORY_ID, "glsl")).toBe(
      true,
    );
    expect(getShaderProgramModeRegistry().supports(NOISE_FLAME_SHADER_FACTORY_ID, "tsl")).toBe(
      true,
    );
    resetShaderProgramModeRegistryForTests();
  });
});
