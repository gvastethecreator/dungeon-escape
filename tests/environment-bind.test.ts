import { describe, expect, test } from "bun:test";

describe("environment bind adapters", () => {
  test("WebGPU PMREM is a lazy import and WebGL uses THREE.PMREMGenerator", async () => {
    const bind = await Bun.file(
      new URL("../src/systems/EnvironmentBind.ts", import.meta.url),
    ).text();
    const lighting = await Bun.file(
      new URL("../src/systems/LightingRig.ts", import.meta.url),
    ).text();
    expect(bind).toContain('await import("three/webgpu")');
    expect(bind).toContain("new THREE.PMREMGenerator");
    expect(bind).not.toContain('from "three/webgpu"');
    expect(lighting).toContain("createPmremAdapter(renderer)");
    expect(lighting).not.toContain("new THREE.PMREMGenerator");
    expect(lighting).toContain("async bindEnvironment");
  });
});
