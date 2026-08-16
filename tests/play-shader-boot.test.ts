import { describe, expect, test } from "bun:test";

import { PLAY_SHADER_FACTORY_LOADERS } from "../src/systems/PlayShaderBoot";
import { skippedWebGpuAvailability } from "../src/systems/WebGpuAvailability";

describe("play shader boot", () => {
  test("owns one factory loader list and does not value-import three/webgpu", async () => {
    const boot = await Bun.file(
      new URL("../src/systems/PlayShaderBoot.ts", import.meta.url),
    ).text();
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(PLAY_SHADER_FACTORY_LOADERS).toHaveLength(14);
    expect(boot).toContain("await Promise.all(PLAY_SHADER_FACTORY_LOADERS.map");
    expect(boot).not.toContain('from "three/webgpu"');
    expect(main).toContain("bootPlayShaderMode(shaderProgramMode)");
    expect(main).not.toContain("registerDungeonSurfaceShaderFactory()");
  });
});

describe("skipped webgpu probe", () => {
  test("reports not-requested without calling requestAdapter", () => {
    const result = skippedWebGpuAvailability();
    expect(result.hasAdapter).toBe(false);
    expect(result.failureReason).toBe("not-requested");
  });
});
