/**
 * Browser/device render path selection.
 * Firefox and low-end hosts choke on high-cost render profiles + CRT history passes.
 */

import type { LaunchRenderOverrides } from "../launch/LaunchConfiguration";

export interface RenderCapabilityProfile {
  readonly isFirefox: boolean;
  readonly isLowEnd: boolean;
  /** Whether this browser path may use incremental async shader warmup. */
  readonly allowAsyncShaderWarmup: boolean;
  /** Use default GPU selection (avoids dual-GPU high-performance black screens). */
  readonly preferDefaultGpu: boolean;
  /** CRT phosphor/history path (extra full-screen targets + samples). */
  readonly enableCrtByDefault: boolean;
  /** Cap passed to resolveRenderPixelRatio. */
  readonly pixelRatioCap: number;
  /** Public telemetry label for the selected browser/device render path. */
  readonly telemetryPath: "firefox" | "low-end" | "safe" | "default";
  /** Maximum Visual QA boot wait for the first live-world draw. */
  readonly rendererReadyTimeoutMs: number;
  /** Soften grain/CRT motion cost when frames already miss budget. */
  readonly adaptiveCrtDisableMs: number;
}

export interface RenderCapabilityInput {
  userAgent?: string;
  hardwareConcurrency?: number;
  /** Chrome/Edge only; omit on Firefox. */
  deviceMemory?: number;
  /** Override for tests / QA. */
  search?: string;
  /** Parsed once by the browser host. Wins over `search` when supplied. */
  overrides?: LaunchRenderOverrides;
}

export interface RendererCompileCapabilities {
  /** Three.js exposes the async compilation entry point. */
  readonly hasCompileAsync: boolean;
  /** The current WebGL context can report asynchronous program completion. */
  readonly hasParallelShaderCompile: boolean;
  /** Both renderer support and the WebGL extension are present. */
  readonly canCompileAsync: boolean;
}

interface RendererCompileCapabilitySource {
  compileAsync?: unknown;
  extensions?: {
    get?: (name: string) => unknown;
  };
}

/**
 * `compileAsync` only yields usefully when KHR_parallel_shader_compile is
 * available. Keep this renderer probe separate from browser-path selection so
 * tests and fallback hosts can make the decision without creating WebGL.
 */
export function detectRendererCompileCapabilities(
  renderer: RendererCompileCapabilitySource,
): RendererCompileCapabilities {
  const hasCompileAsync = typeof renderer.compileAsync === "function";
  let hasParallelShaderCompile = false;
  try {
    hasParallelShaderCompile = Boolean(renderer.extensions?.get?.("KHR_parallel_shader_compile"));
  } catch {
    // A failed extension probe is equivalent to an unsupported async path.
  }
  return {
    hasCompileAsync,
    hasParallelShaderCompile,
    canCompileAsync: hasCompileAsync && hasParallelShaderCompile,
  };
}

function readQueryFlag(search: string, key: string): boolean | null {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const raw = params.get(key);
    if (raw === null) return null;
    if (raw === "" || raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

export function isFirefoxUserAgent(userAgent: string): boolean {
  // Exclude Seamonkey; include mobile Firefox.
  return /firefox\//i.test(userAgent) && !/seamonkey/i.test(userAgent);
}

export function detectRenderCapabilities(
  input: RenderCapabilityInput = {},
): RenderCapabilityProfile {
  const userAgent =
    input.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const cores =
    input.hardwareConcurrency ??
    (typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined) ??
    8;
  const memory =
    input.deviceMemory ??
    (typeof navigator !== "undefined"
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
      : undefined);
  const search = input.overrides
    ? ""
    : (input.search ?? (typeof window !== "undefined" ? window.location.search : ""));

  const isFirefox = isFirefoxUserAgent(userAgent);
  const isLowEnd =
    cores <= 4 || (typeof memory === "number" && Number.isFinite(memory) && memory <= 4);

  const forceQuality = input.overrides ? input.overrides.quality : readQueryFlag(search, "quality");
  const forceCrt = input.overrides ? input.overrides.crt : readQueryFlag(search, "crt");
  const forceSafe = input.overrides
    ? input.overrides.safeRender
    : readQueryFlag(search, "safeRender");

  const safeMode = forceSafe === true || (forceQuality === false && forceSafe !== false);
  const treatAsConstrained = safeMode || isFirefox || isLowEnd;

  // CRT history adds full-screen render targets and is an observed source of
  // cold-load stalls and frame spikes even on fast desktop GPUs. Keep it as an
  // explicit aesthetic option instead of charging every run by default.
  let enableCrtByDefault = false;
  if (forceCrt === true) enableCrtByDefault = true;
  if (forceCrt === false) enableCrtByDefault = false;

  // High quality force keeps quality caps and optional CRT even on Firefox.
  const highQuality = forceQuality === true && forceSafe !== true;
  const shortWarmupDeadline = highQuality ? false : isFirefox || safeMode;
  const telemetryPath = isFirefox
    ? "firefox"
    : isLowEnd
      ? "low-end"
      : shortWarmupDeadline
        ? "safe"
        : "default";

  return {
    isFirefox,
    isLowEnd,
    allowAsyncShaderWarmup: !treatAsConstrained && !isFirefox,
    preferDefaultGpu: treatAsConstrained && !highQuality,
    enableCrtByDefault,
    pixelRatioCap: highQuality ? 1.25 : treatAsConstrained ? 1 : 1.25,
    telemetryPath,
    rendererReadyTimeoutMs: shortWarmupDeadline ? 2_500 : 8_000,
    adaptiveCrtDisableMs: treatAsConstrained ? 28 : 36,
  };
}
