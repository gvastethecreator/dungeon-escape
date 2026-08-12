import { afterEach, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { POV_VIGNETTE_INNER_RADIUS, POV_VIGNETTE_STRENGTH } from "../src/systems/PovPostFx";
import {
  createShaderProgramModeRegistry,
  resetShaderProgramModeRegistryForTests,
  setShaderProgramModeRegistry,
} from "../src/systems/ShaderProgramMode";

import {
  createLiquidMaterial,
  tickLiquidSections,
  type LiquidSurface,
} from "../src/world/LiquidSectionKit";

// The shader program mode registry is process-global; leaking `tsl` mode
// into later test files would build node materials where GLSL is expected.
afterEach(() => {
  resetShaderProgramModeRegistryForTests();
});

describe("water and post-process finish", () => {
  test("dark water is rough, non-metallic and has a time-driven wave shader", () => {
    const material = createLiquidMaterial("pool");
    expect(material.roughness).toBeGreaterThanOrEqual(0.7);
    expect(material.metalness).toBe(0);
    expect(material.envMapIntensity).toBeLessThan(0.4);
    expect(material.userData.liquidShaderMode).toBe("glsl");
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <map_fragment>",
    };
    (
      material.onBeforeCompile as unknown as (shader: {
        uniforms: Record<string, unknown>;
        vertexShader: string;
        fragmentShader: string;
      }) => void
    )(shader);
    expect(shader.vertexShader).toContain("transformed.y += liquidWave");
    expect(shader.fragmentShader).toContain("liquidRipple");
    expect(shader.uniforms.uLiquidTime).toBeDefined();

    const surface: LiquidSurface = {
      kind: "pool",
      mesh: new THREE.Mesh(new THREE.PlaneGeometry(), material),
      material,
    };
    tickLiquidSections([surface], 4.5);
    expect((material.userData.liquidTime as { value: number }).value).toBe(4.5);
    surface.mesh.geometry.dispose();
    material.map?.dispose();
    material.dispose();
  });

  test("TSL liquid mode builds MeshStandardNodeMaterial with position/color nodes", () => {
    resetShaderProgramModeRegistryForTests();
    setShaderProgramModeRegistry(createShaderProgramModeRegistry("tsl"));

    const material = createLiquidMaterial("pool", undefined, "tsl");
    expect(material).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(material.userData.liquidShaderMode).toBe("tsl");
    const nodeMaterial = material as unknown as MeshStandardNodeMaterial;
    expect(nodeMaterial.positionNode).toBeTruthy();
    expect(nodeMaterial.colorNode).toBeTruthy();

    const surface: LiquidSurface = {
      kind: "pool",
      mesh: new THREE.Mesh(new THREE.PlaneGeometry(), material),
      material,
    };
    tickLiquidSections([surface], 3.25);
    expect((material.userData.liquidTime as { value: number }).value).toBe(3.25);
    expect((material.userData.liquidTimeUniform as { value: number }).value).toBe(3.25);

    surface.mesh.geometry.dispose();
    material.map?.dispose();
    material.dispose();
    resetShaderProgramModeRegistryForTests();
  });

  test("the existing POV pass carries bounded subtle grain", async () => {
    const source = await Bun.file(new URL("../src/systems/PovPostFx.ts", import.meta.url)).text();
    expect(source).toContain("grain * uGrain * grainResponse");
    expect(source).toContain("grain * this.displayTuning.grainScale");
    expect(source).toContain("0.014");
    expect(source).toContain("floor(uTime * 18.0)");
    expect(source).toContain("grainResponse");
  });

  test("the POV vignette only shades the outer field of view", async () => {
    const source = await Bun.file(new URL("../src/systems/PovPostFx.ts", import.meta.url)).text();
    expect(POV_VIGNETTE_STRENGTH).toBeGreaterThan(0.05);
    expect(POV_VIGNETTE_STRENGTH).toBeLessThanOrEqual(0.12);
    expect(POV_VIGNETTE_INNER_RADIUS).toBeGreaterThanOrEqual(0.6);
    expect(source).toContain("gradedColor *= 1.0 - vignette * uVignette");
  });
});
