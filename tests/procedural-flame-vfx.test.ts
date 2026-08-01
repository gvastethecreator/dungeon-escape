import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  createNoiseFlame,
  setNoiseFlameMoodPalette,
  tickNoiseFlame,
} from "../src/world/ProceduralFlameVfx";

describe("procedural noise flame", () => {
  test("rebuilds the reference technique on one two-triangle card", () => {
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
    expect(result.material.fragmentShader).toContain("tipFade");
    expect(result.material.fragmentShader).toContain("baseFade");
    expect(result.material.fragmentShader).toContain("baseWidth");
    expect(result.material.fragmentShader).toContain("smoothstep(0.965, 1.0, y)");
    expect((result.details[0] as THREE.Points).material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(result.material.blending).toBe(THREE.NormalBlending);
    expect(result.material.depthWrite).toBe(false);
    expect(result.material.toneMapped).toBe(true);
    expect(result.material.fog).toBe(true);
  });

  test("animates and fades through uniforms while accepting biome palettes", () => {
    const result = createNoiseFlame({
      name: "Test flame",
      width: 0.3,
      height: 0.5,
      phase: 0,
      opacity: 0.8,
    });
    const outer = new THREE.Color(0x326ec8);
    const core = new THREE.Color(0x9cecff);

    expect(setNoiseFlameMoodPalette(result.material, outer, core)).toBe(true);
    const sourceHsl = { h: 0, s: 0, l: 0 };
    const vividHsl = { h: 0, s: 0, l: 0 };
    outer.getHSL(sourceHsl);
    (result.material.uniforms.uOuterColor.value as THREE.Color).getHSL(vividHsl);
    expect(vividHsl.s).toBeGreaterThan(sourceHsl.s);
    expect(tickNoiseFlame(result.material, 3.5, 0.25)).toBe(true);
    expect(result.material.uniforms.uTime.value).toBe(3.5);
    expect(result.material.uniforms.uOpacity.value).toBeCloseTo(0.2);
    const emberMaterial = result.material.userData.emberMaterial as THREE.ShaderMaterial;
    expect(emberMaterial.uniforms.uTime.value).toBe(3.5);
    expect(emberMaterial.uniforms.uOpacity.value).toBeCloseTo(0.2);
  });
});
