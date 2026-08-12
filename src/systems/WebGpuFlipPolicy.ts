/**
 * Staged WebGPU default-flip policy (WGP-23).
 *
 * Until HITL go/no-go (WGP-22) accepts WebGPU on the Chrome/Edge cohort,
 * `preferWebGpuWhenAuto` stays false so `?renderer=auto` remains WebGL.
 */

export interface WebGpuFlipPolicy {
  /** When true, `?renderer=auto` selects WebGPU when an adapter exists. */
  readonly preferWebGpuWhenAuto: boolean;
  /** Human-readable cohort for telemetry / HITL notes. */
  readonly cohort: "webgl-default" | "chrome-edge-webgpu" | "all-webgpu";
  /** Set when the staged flip is armed for production. */
  readonly stagedFlipArmed: boolean;
}

/** Compile-time / runtime switch — flip to chrome-edge after WGP-22 pass. */
export const WEBGPU_FLIP_POLICY: WebGpuFlipPolicy = Object.freeze({
  preferWebGpuWhenAuto: false,
  cohort: "webgl-default",
  stagedFlipArmed: false,
});

export function resolvePreferWebGpuWhenAuto(
  policy: WebGpuFlipPolicy = WEBGPU_FLIP_POLICY,
): boolean {
  return policy.preferWebGpuWhenAuto === true;
}
