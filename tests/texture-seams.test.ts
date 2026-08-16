import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";

import { FLOOR, generateDungeon, WALL } from "../src/dungeon/generateDungeon";
import {
  createShaderProgramModeRegistry,
  resetShaderProgramModeRegistryForTests,
  setShaderProgramModeRegistry,
} from "../src/systems/ShaderProgramMode";
import { loadTslMaterialModules } from "../src/systems/TslMaterialModules";
import {
  edgeBlendSeamlessRgba,
  DUNGEON_SURFACE_SHADER_FACTORY_ID,
  DUNGEON_SURFACE_WORLD_UV_SCALE,
  enableDungeonSurfaceShader,
  liftTextureLuminanceRgba,
  liftTextureRoughnessRgba,
  normalMapRgbaFromAlbedo,
  registerDungeonSurfaceShaderFactory,
  registerTextureSource,
  textureEdgeMismatchRgba,
} from "../src/world/TextureTreatment";
import { enableDungeonSurfaceShaderTsl } from "../src/world/TextureTreatment.tsl";
import {
  DUNGEON_SURFACE_TILE_SCALE,
  dungeonCeilingUvOffset,
  dungeonFloorUvOffset,
  dungeonWallUvOffset,
} from "../src/world/StaticDungeonScene";

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

describe("texture seam treatment", () => {
  test("edge-blend forces opposite borders toward the same colors", () => {
    const size = 64;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        data[i] = x < size / 2 ? 255 : 0;
        data[i + 1] = y < size / 2 ? 255 : 0;
        data[i + 2] = 128;
        data[i + 3] = 255;
      }
    }
    edgeBlendSeamlessRgba(data, size, 0.2);

    const at = (x: number, y: number) => {
      const i = (y * size + x) * 4;
      return [data[i]!, data[i + 1]!, data[i + 2]!] as const;
    };
    const left = at(0, Math.floor(size / 2));
    const right = at(size - 1, Math.floor(size / 2));
    const top = at(Math.floor(size / 2), 0);
    const bottom = at(Math.floor(size / 2), size - 1);
    // Opposite edges must match so wrapS/T does not flash a hard line.
    expect(Math.abs(left[0] - right[0])).toBeLessThanOrEqual(2);
    expect(Math.abs(left[1] - right[1])).toBeLessThanOrEqual(2);
    expect(Math.abs(top[0] - bottom[0])).toBeLessThanOrEqual(2);
    expect(Math.abs(top[1] - bottom[1])).toBeLessThanOrEqual(2);
  });

  test("registerTextureSource records edge-blend treatment", () => {
    const texture = new THREE.Texture();
    registerTextureSource(texture, "/assets/textures/biomes/ash/floor.webp", {
      seam: "edge-blend",
    });
    expect(texture.userData.seamTreatment).toBe("edge-blend-wrap");
  });

  test("measures a clean wrap without another destructive blend", () => {
    const size = 16;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        const value = x === 0 || x === size - 1 || y === 0 || y === size - 1 ? 80 : 160;
        data.set([value, value, value, 255], i);
      }
    }
    expect(textureEdgeMismatchRgba(data, size)).toBe(0);
  });

  test("normal maps encode outward Z and react to albedo height", () => {
    const size = 32;
    const albedo = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        // Bright ridge on the left, dark mortar on the right.
        const v = x < size / 2 ? 220 : 40;
        albedo[i] = v;
        albedo[i + 1] = v;
        albedo[i + 2] = v;
        albedo[i + 3] = 255;
      }
    }
    const normals = normalMapRgbaFromAlbedo(albedo, size, 4);
    const mid = (Math.floor(size / 2) * size + Math.floor(size / 2)) * 4;
    // Flat-ish far-right interior should still point mostly outward (B high).
    const far = (Math.floor(size / 2) * size + size - 2) * 4;
    expect(normals[far + 2]!).toBeGreaterThan(200);
    expect(normals[mid + 2]!).toBeGreaterThan(150);
    // Near the bright/dark transition, X channel should deviate from neutral 128.
    const edge = (Math.floor(size / 2) * size + Math.floor(size / 2) - 1) * 4;
    expect(Math.abs(normals[edge]! - 128)).toBeGreaterThan(8);
  });

  test("boundary wall cells expose one face per floor adjacency", () => {
    const dungeon = generateDungeon("wall-face-seams", {
      roomTarget: 8,
      minRoomSize: 5,
      maxRoomSize: 9,
    });
    let faceCount = 0;
    for (let y = 0; y < dungeon.height; y += 1) {
      for (let x = 0; x < dungeon.width; x += 1) {
        if (dungeon.grid[y]?.[x] !== WALL) continue;
        for (const [dx, dy] of [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ] as const) {
          if (dungeon.grid[y + dy]?.[x + dx] === FLOOR) faceCount += 1;
        }
      }
    }
    // Real dungeons always have exposed masonry; faces >> room count.
    expect(faceCount).toBeGreaterThan(dungeon.rooms.length * 4);
  });

  test("surface shader varies continuously instead of tinting whole grid cells", () => {
    resetShaderProgramModeRegistryForTests();
    const material = new THREE.MeshStandardMaterial();
    enableDungeonSurfaceShader(material, "glsl");
    const shader = {
      vertexShader:
        "#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <uv_vertex>",
      fragmentShader: "#include <common>\n#include <map_fragment>",
      uniforms: {},
    };
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer,
    );

    expect(shader.fragmentShader).toContain("bfFbm");
    expect(shader.fragmentShader).not.toContain("bfCellId");
    expect(shader.vertexShader).toContain(`* ${DUNGEON_SURFACE_WORLD_UV_SCALE.toFixed(2)}`);
    expect(material.customProgramCacheKey()).toBe("dungeon-surface-v4");
    expect(material.userData.dungeonSurfaceShaderMode).toBe("glsl");
  });

  test("TSL surface shader registers dual-mode factory and wires node properties", async () => {
    resetShaderProgramModeRegistryForTests();
    setShaderProgramModeRegistry(createShaderProgramModeRegistry("tsl"));
    registerDungeonSurfaceShaderFactory();

    const material = new MeshStandardNodeMaterial();
    enableDungeonSurfaceShader(material);
    expect(material.userData.dungeonSurfaceShaderMode).toBe("tsl");
    expect(material.colorNode).toBeTruthy();
    expect(material.contextNode).toBeTruthy();
    expect(material.customProgramCacheKey()).toBe("dungeon-surface-tsl-v2");
    expect(material.onBeforeCompile).toBe(THREE.Material.prototype.onBeforeCompile);

    const again = new MeshStandardNodeMaterial();
    enableDungeonSurfaceShaderTsl(again);
    expect(again.userData.dungeonSurfaceShader).toBe(true);

    const tsl = await Bun.file(
      new URL("../src/world/TextureTreatment.tsl.ts", import.meta.url),
    ).text();
    expect(tsl).toContain("material.colorNode = materialColor.mul(dungeonSurfaceMacroVariation())");
    expect(tsl).toContain('attribute("aTileUvOffset", "vec2" as const)');
    expect(tsl).toContain("materialColor");

    const registry = createShaderProgramModeRegistry("glsl");
    registerDungeonSurfaceShaderFactory(registry);
    expect(registry.supports(DUNGEON_SURFACE_SHADER_FACTORY_ID, "glsl")).toBe(true);
    expect(registry.supports(DUNGEON_SURFACE_SHADER_FACTORY_ID, "tsl")).toBe(true);
  });

  test("coplanar dungeon faces meet without z-fighting overlap", () => {
    expect(DUNGEON_SURFACE_TILE_SCALE).toBe(1);
  });

  test("floor, ceiling, and rotated wall offsets stay continuous in world space", () => {
    expect(dungeonFloorUvOffset({ x: 4, y: 7 })).toEqual([4, -7]);
    expect(dungeonCeilingUvOffset({ x: 4, y: 7 })).toEqual([4, 7]);
    expect(dungeonWallUvOffset({ x: 4, y: 7 }, 0, 1)).toEqual([4, 0]);
    expect(dungeonWallUvOffset({ x: 4, y: 7 }, 0, -1)).toEqual([-4, 0]);
    expect(dungeonWallUvOffset({ x: 4, y: 7 }, 1, 0)).toEqual([-7, 0]);
    expect(dungeonWallUvOffset({ x: 4, y: 7 }, -1, 0)).toEqual([7, 0]);
  });
});

describe("texture luminance treatment", () => {
  test("lifts a dark albedo to a readable target while keeping contrast", () => {
    const data = new Uint8ClampedArray([
      20, 18, 16, 255, 40, 35, 30, 255, 60, 52, 44, 255, 80, 68, 56, 255,
    ]);
    liftTextureLuminanceRgba(data, { targetLuma: 0.4, contrast: 1.4, gamma: 0.82 });
    const luminances = Array.from({ length: 4 }, (_, index) => {
      const offset = index * 4;
      return data[offset]! * 0.2126 + data[offset + 1]! * 0.7152 + data[offset + 2]! * 0.0722;
    });
    const mean = luminances.reduce((sum, value) => sum + value, 0) / luminances.length / 255;
    expect(mean).toBeCloseTo(0.4, 1);
    expect(luminances[3]! - luminances[0]!).toBeGreaterThan(70);
  });

  test("lifts roughness maps without flattening their authored variation", () => {
    const data = new Uint8ClampedArray([
      0, 12, 40, 255, 64, 80, 96, 255, 160, 140, 120, 255, 255, 220, 180, 255,
    ]);
    liftTextureRoughnessRgba(data, { floor: 0.4 });
    expect(data[0]).toBe(102);
    expect(data[4]).toBeGreaterThan(data[0]!);
    expect(data[8]).toBeGreaterThan(data[4]!);
    expect(data[12]).toBe(255);
    for (let pixel = 0; pixel < data.length; pixel += 4) {
      expect(data[pixel + 1]).toBe(data[pixel]);
      expect(data[pixel + 2]).toBe(data[pixel]);
    }
  });
});
