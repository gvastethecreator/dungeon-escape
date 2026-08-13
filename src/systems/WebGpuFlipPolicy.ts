/**
 * Staged WebGPU default-flip policy (WGP-23).
 *
 * Disarmed: `?renderer=auto` stays on WebGL2. Opt in with `?renderer=webgpu`.
 * Re-arm only after the TSL path samples maps and IBL without dropping albedo.
 */

export interface WebGpuFlipPolicy {
  /** When true, `?renderer=auto` selects WebGPU when an adapter exists. */
  readonly preferWebGpuWhenAuto: boolean;
  /** Human-readable cohort for telemetry / HITL notes. */
  readonly cohort: "webgl-default" | "chrome-edge-webgpu" | "all-webgpu";
  /** Set when the staged flip is armed for production. */
  readonly stagedFlipArmed: boolean;
}

/** Compile-time / runtime switch — WebGL2 default until the WebGPU TSL path is stable. */
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
