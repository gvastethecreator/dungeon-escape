/**
 * Browser/device render path selection.
 * Firefox and low-end hosts choke on full shader precompile + CRT history passes.
 */

import type { LaunchRenderOverrides } from "../launch/LaunchConfiguration";

export interface RenderCapabilityProfile {
  readonly isFirefox: boolean;
  readonly isLowEnd: boolean;
  /** Use default GPU selection (avoids dual-GPU high-performance black screens). */
  readonly preferDefaultGpu: boolean;
  /** CRT phosphor/history path (extra full-screen targets + samples). */
  readonly enableCrtByDefault: boolean;
  /** Cap passed to resolveRenderPixelRatio. */
  readonly pixelRatioCap: number;
  /** Max wait for compileAsync chain before forcing ready. */
  readonly compileTimeoutMs: number;
  /**
   * Skip compileAsync and only draw warmup frames.
   * Firefox parallel compile is weak; long compile freezes look like a dead tab.
   */
  readonly skipShaderPrecompile: boolean;
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

/** Serializes renderer work that cannot be cancelled by the browser once started. */
export class SerialRenderWorkQueue {
  #tail: Promise<void> = Promise.resolve();

  run<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(work, work);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
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

  let enableCrtByDefault = !treatAsConstrained;
  if (forceCrt === true) enableCrtByDefault = true;
  if (forceCrt === false) enableCrtByDefault = false;

  // High quality force: ?quality=1 keeps CRT/precompile even on Firefox.
  const highQuality = forceQuality === true && forceSafe !== true;

  return {
    isFirefox,
    isLowEnd,
    preferDefaultGpu: treatAsConstrained && !highQuality,
    enableCrtByDefault: highQuality ? forceCrt !== false : enableCrtByDefault,
    pixelRatioCap: highQuality ? 1.25 : treatAsConstrained ? 1 : 1.25,
    compileTimeoutMs: highQuality ? 8_000 : isFirefox ? 2_000 : isLowEnd ? 3_000 : 6_000,
    skipShaderPrecompile: highQuality ? false : isFirefox || safeMode,
    adaptiveCrtDisableMs: treatAsConstrained ? 28 : 36,
  };
}

export async function raceWithTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  label = "timeout",
): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    try {
      return { ok: true, value: await work };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), timeoutMs);
      }),
    ]);
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
