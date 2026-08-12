import { describe, expect, test } from "bun:test";

import {
  resolvePreferWebGpuWhenAuto,
  WEBGPU_FLIP_POLICY,
  type WebGpuFlipPolicy,
} from "../src/systems/WebGpuFlipPolicy";

describe("WebGPU flip policy (WGP-23)", () => {
  test("defaults keep auto on WebGL until HITL arms the staged flip", () => {
    expect(WEBGPU_FLIP_POLICY.preferWebGpuWhenAuto).toBe(false);
    expect(WEBGPU_FLIP_POLICY.stagedFlipArmed).toBe(false);
    expect(WEBGPU_FLIP_POLICY.cohort).toBe("webgl-default");
    expect(resolvePreferWebGpuWhenAuto()).toBe(false);
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
