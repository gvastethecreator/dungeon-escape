import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("play renderer factory", () => {
  test("main boots through the shared factory and exposes backend telemetry", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const factory = readFileSync("src/systems/PlayRendererFactory.ts", "utf8");

    expect(main).toContain("createPlayRendererHandle({");
    expect(main).toContain("preference: renderPathCaps.requestedRenderer");
    expect(main).toContain("__rendererInfo");
    expect(main).toContain('playRendererHandle.isWebGpuRenderer');
    expect(main).toContain("povPost.setEnabled(false)");
    expect(factory).toContain("await renderer.init()");
    expect(factory).toContain('preference === "webgpu"');
    expect(factory).toContain("WebGPU was requested");
  });
});
