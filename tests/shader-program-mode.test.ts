import { describe, expect, test } from "bun:test";

import {
  createShaderProgramModeRegistry,
  UnsupportedShaderProgramModeError,
} from "../src/systems/ShaderProgramMode";

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
});
