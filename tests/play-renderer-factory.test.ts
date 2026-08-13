import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("play renderer factory", () => {
  test("main boots through the shared factory and exposes backend telemetry", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const factory = readFileSync("src/systems/PlayRendererFactory.ts", "utf8");

    expect(main).toContain("createPlayRendererHandle({");
    expect(main).toContain("preference: renderPathCaps.requestedRenderer");
    expect(main).toContain("__rendererInfo");
    expect(main).toContain("playRendererHandle.isWebGpuRenderer");
    expect(main).toContain("!playRendererHandle.isWebGpuRenderer || povPost.isCrtEnabled()");
    // WebGPU keeps POV post; it runs the TSL RenderPipeline instead of the GLSL passes.
    expect(main).toContain("playRendererHandle.shaderProgramMode");
    expect(main).toContain("bootPlayShaderMode(shaderProgramMode)");
    expect(main).not.toContain('programMode: playRendererHandle.isWebGpuRenderer ? "tsl" : "glsl"');
    expect(main).toContain("recalibrateRenderCapabilitiesForBackend(");
    expect(factory).toContain("await renderer.init()");
    expect(factory).toContain("created.raw.backend?.isWebGPUBackend === true");
    expect(factory).not.toContain("|| created.raw.isWebGPURenderer === true");
    expect(factory).toContain('preference === "webgpu"');
    expect(factory).toContain("WebGPU was requested");
    expect(factory).toContain("skippedWebGpuAvailability()");
    expect(factory).toContain("wantsWebGpu");
    expect(factory).toContain('shaderProgramMode: handle.isWebGpuRenderer ? "tsl" : "glsl"');
  });
});
