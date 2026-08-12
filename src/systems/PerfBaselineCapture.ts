/**
 * Pure helpers for WGP-03 / WGP-22 performance baseline capture artifacts.
 */

import {
  medianSample,
  type PerfBaselineArtifact,
  type PerfBaselineSample,
} from "./PerfBaselineCompare";

export type PerfBaselineBackend = "webgl" | "webgpu";

export interface PerfBaselineCaptureContext {
  readonly commit: string;
  readonly machine: string;
  readonly browser: string;
  readonly os: string;
  readonly seed: string;
  readonly mood: string;
  readonly capabilityPath: string;
  readonly backend: PerfBaselineBackend;
  readonly crtEnabled: boolean;
}

/** Build a schemaVersion:1 artifact from live samples (WGP-03). */
export function buildPerfBaselineArtifact(
  context: PerfBaselineCaptureContext,
  samples: readonly PerfBaselineSample[],
  capturedAt = new Date().toISOString(),
): PerfBaselineArtifact {
  if (samples.length === 0) {
    throw new Error("Perf baseline capture requires at least one sample.");
  }
  return {
    schemaVersion: 1,
    commit: context.commit,
    capturedAt,
    machine: context.machine,
    browser: context.browser,
    os: context.os,
    seed: context.seed,
    mood: context.mood,
    capabilityPath: context.capabilityPath,
    backend: context.backend,
    crtEnabled: context.crtEnabled,
    samples: [...samples],
    median: medianSample(samples),
  };
}

/**
 * HITL go/no-go thresholds for WGP-22 (candidate vs WebGL baseline medians).
 * Ratios are candidate/baseline; values > 1 mean the candidate is slower/heavier.
 */
export interface PerfGoNoGoThresholds {
  readonly maxFrameP95Ratio: number;
  readonly maxRendererReadyRatio: number;
  readonly maxDrawCallRatio: number;
}

export const DEFAULT_PERF_GO_NO_GO_THRESHOLDS: PerfGoNoGoThresholds = {
  maxFrameP95Ratio: 1.15,
  maxRendererReadyRatio: 1.35,
  maxDrawCallRatio: 1.25,
};

export interface PerfGoNoGoResult {
  readonly pass: boolean;
  readonly reasons: readonly string[];
}

export function evaluatePerfGoNoGo(
  baseline: PerfBaselineArtifact,
  candidate: PerfBaselineArtifact,
  thresholds: PerfGoNoGoThresholds = DEFAULT_PERF_GO_NO_GO_THRESHOLDS,
): PerfGoNoGoResult {
  const reasons: string[] = [];
  const ratio = (metric: keyof PerfBaselineSample): number | null => {
    const left = baseline.median[metric];
    const right = candidate.median[metric];
    if (typeof left !== "number" || typeof right !== "number" || left <= 0) return null;
    return right / left;
  };

  const p95 = ratio("frameP95Ms");
  if (p95 !== null && p95 > thresholds.maxFrameP95Ratio) {
    reasons.push(`frameP95Ms ratio ${p95.toFixed(3)} exceeds ${thresholds.maxFrameP95Ratio}`);
  }
  const ready = ratio("rendererReadyMs");
  if (ready !== null && ready > thresholds.maxRendererReadyRatio) {
    reasons.push(
      `rendererReadyMs ratio ${ready.toFixed(3)} exceeds ${thresholds.maxRendererReadyRatio}`,
    );
  }
  const draws = ratio("drawCalls");
  if (draws !== null && draws > thresholds.maxDrawCallRatio) {
    reasons.push(`drawCalls ratio ${draws.toFixed(3)} exceeds ${thresholds.maxDrawCallRatio}`);
  }
  return { pass: reasons.length === 0, reasons };
}
