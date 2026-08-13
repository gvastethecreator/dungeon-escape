import { describe, expect, test } from "bun:test";

import {
  resolvePreferWebGpuWhenAuto,
  WEBGPU_FLIP_POLICY,
  type WebGpuFlipPolicy,
} from "../src/systems/WebGpuFlipPolicy";

describe("WebGPU flip policy (WGP-23)", () => {
  test("armed policy prefers WebGPU on auto, with WebGL still the factory fallback", () => {
    expect(WEBGPU_FLIP_POLICY.preferWebGpuWhenAuto).toBe(true);
    expect(WEBGPU_FLIP_POLICY.stagedFlipArmed).toBe(true);
    expect(WEBGPU_FLIP_POLICY.cohort).toBe("chrome-edge-webgpu");
    expect(resolvePreferWebGpuWhenAuto()).toBe(true);
  });

  test("resolves preferWebGpuWhenAuto from an armed policy object", () => {
    const armed: WebGpuFlipPolicy = {
      preferWebGpuWhenAuto: true,
      cohort: "chrome-edge-webgpu",
      stagedFlipArmed: true,
    };
    expect(resolvePreferWebGpuWhenAuto(armed)).toBe(true);
  });
});
