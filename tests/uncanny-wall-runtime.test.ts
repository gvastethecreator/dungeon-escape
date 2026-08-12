import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";

import { listDungeonMoodIds } from "../src/systems/DungeonMood";
import {
  createShaderProgramModeRegistry,
  getShaderProgramModeRegistry,
  resetShaderProgramModeRegistryForTests,
  setShaderProgramModeRegistry,
} from "../src/systems/ShaderProgramMode";
import {
  UNCANNY_WALL_ATLAS_SIZE,
  uncannyWallAnimations,
} from "../src/world/UncannyWallCatalog.generated";
import {
  UNCANNY_WALL_SHADER_FACTORY_ID,
  advanceUncannyWallPlayback,
  createUncannyWallPlayback,
  registerUncannyWallShaderFactory,
  sampleUncannyWallPlayback,
  uncannyWallHoldSeconds,
  uncannyWallVisualProfile,
  UncannyWallRuntime,
} from "../src/world/UncannyWallRuntime";

const durations = [1200, 180, 240, 220] as const;

describe("uncanny wall runtime", () => {
  test("holds frame zero for an independent deterministic 1..10 seconds", () => {
    const holds = Array.from({ length: 160 }, (_, seed) => uncannyWallHoldSeconds(seed, seed % 7));
    expect(Math.min(...holds)).toBe(1);
    expect(Math.max(...holds)).toBe(10);
    expect(new Set(holds).size).toBe(10);

    const state = createUncannyWallPlayback(8137);
    const initialHold = state.remainingSeconds;
    advanceUncannyWallPlayback(state, initialHold - 0.01, durations);
    expect(state.mode).toBe("hold");
    expect(sampleUncannyWallPlayback(state, durations)).toEqual({
      frameA: 0,
      frameB: 0,
      blend: 0,
    });
    advanceUncannyWallPlayback(state, 0.02, durations);
    expect(state.mode).toBe("animate");
  });

  test("plays all four transitions, returns to frame zero, then freezes again", () => {
    const state = createUncannyWallPlayback(42);
    advanceUncannyWallPlayback(state, state.remainingSeconds, durations);
    expect(state).toMatchObject({ mode: "animate", frame: 0 });
    advanceUncannyWallPlayback(state, 0.09, durations);
    const interpolated = sampleUncannyWallPlayback(state, durations, true);
    expect(interpolated.frameA).toBe(0);
    expect(interpolated.frameB).toBe(1);
    expect(interpolated.blend).toBeCloseTo(0.5, 5);
    expect(sampleUncannyWallPlayback(state, durations, false).blend).toBe(0);

    advanceUncannyWallPlayback(state, 0.09 + 0.24 + 0.22 + 0.18, durations);
    expect(state.mode).toBe("hold");
    expect(state.frame).toBe(0);
    expect(state.remainingSeconds).toBeGreaterThanOrEqual(1);
    expect(state.remainingSeconds).toBeLessThanOrEqual(10);
  });

  test("uses one native atlas batch with independent per-instance clocks", () => {
    const definition = uncannyWallAnimations("ancient")[0]!;
    const runtime = new UncannyWallRuntime(new THREE.Texture(), [
      { matrix: new THREE.Matrix4(), row: 0, definition, seed: 1, x: 0, z: 0 },
      { matrix: new THREE.Matrix4(), row: 0, definition, seed: 2, x: 40, z: 0 },
    ]);
    runtime.update(1.1, { x: 0, y: 1.6, z: 0 });
    const geometry = runtime.mesh.geometry;
    const visibility = geometry.getAttribute("uncannyVisibility") as THREE.InstancedBufferAttribute;
    expect(runtime.mesh.count).toBe(2);
    expect(visibility.getX(0)).toBe(1);
    expect(visibility.getX(1)).toBe(0);
    const glsl = runtime.mesh.material as THREE.ShaderMaterial;
    expect(glsl.fragmentShader).toContain("smoothstep");
    expect(glsl.fragmentShader).toContain("mix(first, second");
    expect(glsl.fragmentShader).toContain("uncannySurfaceTint");
    expect(glsl.fragmentShader).toContain("uncannyFogVisibility");
    expect(runtime.mesh.material.userData).toMatchObject({
      biomeIntegrated: true,
      fogAlphaFade: [0.12, 0.48],
    });
  });

  test("derives animated wall grading from each biome wall palette", () => {
    for (const mood of listDungeonMoodIds()) {
      const profile = uncannyWallVisualProfile(mood);
      expect(profile.shadow).toBeGreaterThan(0);
      expect(profile.base).toBeGreaterThan(0);
      expect(profile.highlight).toBeGreaterThan(0);
      expect(profile.propTint).toBeGreaterThan(0);
    }
  });

  test("TSL atlas path registers dual mode and wires node material attributes", () => {
    resetShaderProgramModeRegistryForTests();
    setShaderProgramModeRegistry(createShaderProgramModeRegistry("tsl"));
    registerUncannyWallShaderFactory();

    const definition = uncannyWallAnimations("ancient")[0]!;
    const runtime = new UncannyWallRuntime(new THREE.Texture(), [
      { matrix: new THREE.Matrix4(), row: 0, definition, seed: 1, x: 0, z: 0 },
    ]);
    runtime.update(1.1, { x: 0, y: 1.6, z: 0 });
    expect(runtime.mesh.material).toBeInstanceOf(MeshBasicNodeMaterial);
    expect(runtime.mesh.material.userData.shaderProgramMode).toBe("tsl");
    expect(runtime.mesh.material.userData.uncannyWallAtlas).toBe(true);
    expect((runtime.mesh.material as MeshBasicNodeMaterial).colorNode).toBeTruthy();
    expect((runtime.mesh.material as MeshBasicNodeMaterial).opacityNode).toBeTruthy();
    expect(getShaderProgramModeRegistry().supports(UNCANNY_WALL_SHADER_FACTORY_ID, "glsl")).toBe(
      true,
    );
    expect(getShaderProgramModeRegistry().supports(UNCANNY_WALL_SHADER_FACTORY_ID, "tsl")).toBe(
      true,
    );
    resetShaderProgramModeRegistryForTests();
  });

  test("packages four native-resolution loops for every biome", () => {
    const manifestPath = join(
      process.cwd(),
      "assets-source/runtime-metadata/sprites/uncanny-walls/manifest.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      atlasSize: [number, number];
      contentResize: boolean;
      biomes: Record<
        string,
        { rows: string[]; output: string; outputSha256: string; humanGate: string }
      >;
    };
    const optimizationManifest = JSON.parse(
      readFileSync(join(process.cwd(), "assets-source/runtime-optimization-manifest.json"), "utf8"),
    ) as {
      images: Array<{
        target: string;
        targetSha256: string;
        dimensionPolicy?: string;
        targetDimensions: [number, number];
      }>;
    };
    expect(manifest.atlasSize).toEqual([...UNCANNY_WALL_ATLAS_SIZE]);
    expect(manifest.contentResize).toBe(false);
    for (const mood of listDungeonMoodIds()) {
      expect(uncannyWallAnimations(mood)).toHaveLength(4);
      expect(manifest.biomes[mood]?.rows).toHaveLength(4);
      expect(manifest.biomes[mood]?.humanGate).toBe("approved");
      expect(existsSync(join(process.cwd(), manifest.biomes[mood]!.output))).toBe(true);
      const optimization = optimizationManifest.images.find(
        ({ target }) => target === manifest.biomes[mood]!.output,
      );
      expect(optimization).toMatchObject({
        targetDimensions: [...UNCANNY_WALL_ATLAS_SIZE],
        targetSha256: manifest.biomes[mood]!.outputSha256,
        dimensionPolicy: "native",
      });
    }
  });
});
