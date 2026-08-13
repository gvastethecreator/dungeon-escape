/**
 * Staged WebGPU default-flip policy (WGP-23).
 *
 * Armed: `?renderer=auto` prefers WebGPU when an adapter exists.
 * PlayRendererFactory still falls back to WebGL when the probe or init fails.
 */

export interface WebGpuFlipPolicy {
  /** When true, `?renderer=auto` selects WebGPU when an adapter exists. */
  readonly preferWebGpuWhenAuto: boolean;
  /** Human-readable cohort for telemetry / HITL notes. */
  readonly cohort: "webgl-default" | "chrome-edge-webgpu" | "all-webgpu";
  /** Set when the staged flip is armed for production. */
  readonly stagedFlipArmed: boolean;
}

/** Compile-time / runtime switch — Chrome/Edge WebGPU cohort with WebGL fallback. */
export const WEBGPU_FLIP_POLICY: WebGpuFlipPolicy = Object.freeze({
  preferWebGpuWhenAuto: true,
  cohort: "chrome-edge-webgpu",
  stagedFlipArmed: true,
});

export function resolvePreferWebGpuWhenAuto(
  policy: WebGpuFlipPolicy = WEBGPU_FLIP_POLICY,
): boolean {
  return policy.preferWebGpuWhenAuto === true;
}
