import { describe, expect, test } from "bun:test";

import {
  createShaderProgramModeRegistry,
  getShaderProgramModeRegistry,
  resetShaderProgramModeRegistryForTests,
  setShaderProgramModeRegistry,
  UnsupportedShaderProgramModeError,
} from "../src/systems/ShaderProgramMode";
import {
  DUNGEON_SURFACE_SHADER_FACTORY_ID,
  registerDungeonSurfaceShaderFactory,
} from "../src/world/TextureTreatment";
import {
  NOISE_FLAME_SHADER_FACTORY_ID,
  registerNoiseFlameShaderFactory,
} from "../src/world/ProceduralFlameVfx";
import {
  registerVolumetricBeamShaderFactory,
  VOLUMETRIC_BEAM_SHADER_FACTORY_ID,
} from "../src/world/VolumetricBeam";

describe("shader program mode registry", () => {
  test("defaults to glsl and tracks factory support counts", () => {
    const registry = createShaderProgramModeRegistry();
    expect(registry.mode).toBe("glsl");

    registry.register({ id: "flame", supports: ["glsl"] });
    registry.register({ id: "beam", supports: ["glsl", "tsl"] });

    expect(registry.supports("flame")).toBe(true);
    expect(registry.supports("flame", "tsl")).toBe(false);
    expect(registry.supports("beam", "tsl")).toBe(true);
    expect(registry.countByMode()).toEqual({ glsl: 2, tsl: 1 });
  });

  test("require fails clearly for unsupported modes", () => {
    const registry = createShaderProgramModeRegistry("tsl");
    registry.register({ id: "flame", supports: ["glsl"] });

    expect(() => registry.require("flame")).toThrow(UnsupportedShaderProgramModeError);
    expect(() => registry.require("missing", "glsl")).toThrow(/missing/);
  });

  test("dungeon-surface factory rebinds across registry swaps with glsl+tsl support", () => {
    resetShaderProgramModeRegistryForTests();
    expect(getShaderProgramModeRegistry().supports(DUNGEON_SURFACE_SHADER_FACTORY_ID, "tsl")).toBe(
      true,
    );

    setShaderProgramModeRegistry(createShaderProgramModeRegistry("tsl"));
    registerDungeonSurfaceShaderFactory();
    expect(getShaderProgramModeRegistry().supports(DUNGEON_SURFACE_SHADER_FACTORY_ID, "glsl")).toBe(
      true,
    );
    expect(getShaderProgramModeRegistry().supports(DUNGEON_SURFACE_SHADER_FACTORY_ID, "tsl")).toBe(
      true,
    );
    resetShaderProgramModeRegistryForTests();
  });

  test("noise-flame and volumetric-beam factories support glsl+tsl", () => {
    resetShaderProgramModeRegistryForTests();
    registerNoiseFlameShaderFactory();
    registerVolumetricBeamShaderFactory();
    expect(getShaderProgramModeRegistry().supports(NOISE_FLAME_SHADER_FACTORY_ID, "tsl")).toBe(
      true,
    );
    expect(getShaderProgramModeRegistry().supports(VOLUMETRIC_BEAM_SHADER_FACTORY_ID, "tsl")).toBe(
      true,
    );

    setShaderProgramModeRegistry(createShaderProgramModeRegistry("tsl"));
    registerNoiseFlameShaderFactory();
    registerVolumetricBeamShaderFactory();
    expect(getShaderProgramModeRegistry().supports(NOISE_FLAME_SHADER_FACTORY_ID, "glsl")).toBe(
      true,
    );
    expect(getShaderProgramModeRegistry().supports(VOLUMETRIC_BEAM_SHADER_FACTORY_ID, "glsl")).toBe(
      true,
    );
    resetShaderProgramModeRegistryForTests();
  });
});
