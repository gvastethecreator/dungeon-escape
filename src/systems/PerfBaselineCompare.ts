/**
 * WebGL / WebGPU performance baseline comparison (WGP-03 / WGP-22).
 */

export interface PerfBaselineSample {
  readonly frameP50Ms: number;
  readonly frameP95Ms: number;
  readonly frameMaxMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly programs: number;
  readonly rendererReadyMs: number;
  readonly firstInputMs: number;
  readonly longestLongTaskMs: number | null;
}

export interface PerfBaselineArtifact {
  readonly schemaVersion: 1;
  readonly commit: string;
  readonly capturedAt: string;
  readonly machine: string;
  readonly browser: string;
  readonly os: string;
  readonly seed: string;
  readonly mood: string;
  readonly capabilityPath: string;
  readonly backend: "webgl" | "webgpu";
  readonly crtEnabled: boolean;
  readonly samples: readonly PerfBaselineSample[];
  readonly median: PerfBaselineSample;
}

export interface PerfMetricDelta {
  readonly metric: keyof PerfBaselineSample;
  readonly baseline: number | null;
  readonly candidate: number | null;
  readonly delta: number | null;
  readonly deltaRatio: number | null;
}

export interface PerfBaselineComparison {
  readonly baseline: Pick<
    PerfBaselineArtifact,
    "commit" | "backend" | "mood" | "capabilityPath" | "browser"
  >;
  readonly candidate: Pick<
    PerfBaselineArtifact,
    "commit" | "backend" | "mood" | "capabilityPath" | "browser"
  >;
  readonly deltas: readonly PerfMetricDelta[];
}

const METRICS: readonly (keyof PerfBaselineSample)[] = [
  "frameP50Ms",
  "frameP95Ms",
  "frameMaxMs",
  "drawCalls",
  "triangles",
  "programs",
  "rendererReadyMs",
  "firstInputMs",
  "longestLongTaskMs",
];

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function medianSample(samples: readonly PerfBaselineSample[]): PerfBaselineSample {
  return {
    frameP50Ms: median(samples.map((s) => s.frameP50Ms)),
    frameP95Ms: median(samples.map((s) => s.frameP95Ms)),
    frameMaxMs: median(samples.map((s) => s.frameMaxMs)),
    drawCalls: median(samples.map((s) => s.drawCalls)),
    triangles: median(samples.map((s) => s.triangles)),
    programs: median(samples.map((s) => s.programs)),
    rendererReadyMs: median(samples.map((s) => s.rendererReadyMs)),
    firstInputMs: median(samples.map((s) => s.firstInputMs)),
    longestLongTaskMs: (() => {
      const present = samples
        .map((s) => s.longestLongTaskMs)
        .filter((v): v is number => typeof v === "number");
      return present.length === 0 ? null : median(present);
    })(),
  };
}

export function comparePerfBaselines(
  baseline: PerfBaselineArtifact,
  candidate: PerfBaselineArtifact,
): PerfBaselineComparison {
  const deltas = METRICS.map((metric) => {
    const left = baseline.median[metric];
    const right = candidate.median[metric];
    if (left === null || right === null) {
      return { metric, baseline: left, candidate: right, delta: null, deltaRatio: null };
    }
    const delta = right - left;
    return {
      metric,
      baseline: left,
      candidate: right,
      delta,
      deltaRatio: left === 0 ? null : delta / left,
    };
  });
  return {
    baseline: {
      commit: baseline.commit,
      backend: baseline.backend,
      mood: baseline.mood,
      capabilityPath: baseline.capabilityPath,
      browser: baseline.browser,
    },
    candidate: {
      commit: candidate.commit,
      backend: candidate.backend,
      mood: candidate.mood,
      capabilityPath: candidate.capabilityPath,
      browser: candidate.browser,
    },
    deltas,
  };
}
