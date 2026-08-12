/**
 * Adapter probe for WebGPU without constructing a renderer or device.
 * Failures are reported, never thrown — boot must stay resilient.
 */

export type WebGpuFailureReason =
  | "no-navigator-gpu"
  | "no-adapter"
  | "request-failed"
  | "timeout"
  | null;

export interface WebGpuAvailability {
  readonly hasNavigatorGpu: boolean;
  readonly hasAdapter: boolean;
  readonly failureReason: WebGpuFailureReason;
}

export interface WebGpuProbeEnvironment {
  readonly hasNavigatorGpu: boolean;
  requestAdapter(): Promise<unknown | null>;
}

const DEFAULT_TIMEOUT_MS = 1_500;

function defaultEnvironment(): WebGpuProbeEnvironment | null {
  if (typeof navigator === "undefined") return null;
  const gpu = (
    navigator as Navigator & { gpu?: { requestAdapter?: () => Promise<unknown | null> } }
  ).gpu;
  if (!gpu || typeof gpu.requestAdapter !== "function") {
    return { hasNavigatorGpu: false, requestAdapter: async () => null };
  }
  return {
    hasNavigatorGpu: true,
    requestAdapter: () => gpu.requestAdapter!(),
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("webgpu-adapter-timeout")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function detectWebGpuAvailability(
  timeoutMs = DEFAULT_TIMEOUT_MS,
  environment: WebGpuProbeEnvironment | null = defaultEnvironment(),
): Promise<WebGpuAvailability> {
  if (!environment || !environment.hasNavigatorGpu) {
    return {
      hasNavigatorGpu: false,
      hasAdapter: false,
      failureReason: "no-navigator-gpu",
    };
  }

  try {
    const adapter = await withTimeout(environment.requestAdapter(), timeoutMs);
    if (!adapter) {
      return {
        hasNavigatorGpu: true,
        hasAdapter: false,
        failureReason: "no-adapter",
      };
    }
    return {
      hasNavigatorGpu: true,
      hasAdapter: true,
      failureReason: null,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.message === "webgpu-adapter-timeout";
    return {
      hasNavigatorGpu: true,
      hasAdapter: false,
      failureReason: timedOut ? "timeout" : "request-failed",
    };
  }
}
