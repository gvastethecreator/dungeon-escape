import { describe, expect, test } from "bun:test";

import { detectWebGpuAvailability } from "../src/systems/WebGpuAvailability";
import { WEBGPU_TYPE_SURFACE } from "../src/systems/WebGpuTypeSurface";

describe("webgpu availability probe", () => {
  test("reports missing navigator.gpu without throwing", async () => {
    const result = await detectWebGpuAvailability(50, {
      hasNavigatorGpu: false,
      requestAdapter: async () => {
        throw new Error("should not be called");
      },
    });
    expect(result).toEqual({
      hasNavigatorGpu: false,
      hasAdapter: false,
      failureReason: "no-navigator-gpu",
    });
  });

  test("reports adapter absence", async () => {
    const result = await detectWebGpuAvailability(50, {
      hasNavigatorGpu: true,
      requestAdapter: async () => null,
    });
    expect(result).toEqual({
      hasNavigatorGpu: true,
      hasAdapter: false,
      failureReason: "no-adapter",
    });
  });

  test("reports adapter presence", async () => {
    const result = await detectWebGpuAvailability(50, {
      hasNavigatorGpu: true,
      requestAdapter: async () => ({}),
    });
    expect(result).toEqual({
      hasNavigatorGpu: true,
      hasAdapter: true,
      failureReason: null,
    });
  });

  test("treats request failures as unavailable", async () => {
    const result = await detectWebGpuAvailability(50, {
      hasNavigatorGpu: true,
      requestAdapter: async () => {
        throw new Error("adapter boom");
      },
    });
    expect(result.failureReason).toBe("request-failed");
    expect(result.hasAdapter).toBe(false);
  });

  test("times out hung adapter requests", async () => {
    const result = await detectWebGpuAvailability(20, {
      hasNavigatorGpu: true,
      requestAdapter: () => new Promise(() => {}),
    });
    expect(result.failureReason).toBe("timeout");
    expect(result.hasAdapter).toBe(false);
  });
});

describe("webgpu type surface", () => {
  test("resolves three/webgpu and three/tsl constructors", () => {
    expect(typeof WEBGPU_TYPE_SURFACE.WebGPURenderer).toBe("function");
    expect(typeof WEBGPU_TYPE_SURFACE.RenderPipeline).toBe("function");
    expect(typeof WEBGPU_TYPE_SURFACE.MeshStandardNodeMaterial).toBe("function");
    expect(typeof WEBGPU_TYPE_SURFACE.SpriteNodeMaterial).toBe("function");
    expect(typeof WEBGPU_TYPE_SURFACE.PMREMGenerator).toBe("function");
  });
});
