import { describe, expect, test } from "bun:test";

import {
  comparePerfBaselines,
  medianSample,
  type PerfBaselineArtifact,
  type PerfBaselineSample,
} from "../src/systems/PerfBaselineCompare";

function sample(overrides: Partial<PerfBaselineSample> = {}): PerfBaselineSample {
  return {
    frameP50Ms: 8,
    frameP95Ms: 12,
    frameMaxMs: 20,
    drawCalls: 100,
    triangles: 50_000,
    programs: 40,
    rendererReadyMs: 900,
    firstInputMs: 1_200,
    longestLongTaskMs: 80,
    ...overrides,
  };
}

function artifact(
  backend: "webgl" | "webgpu",
  samples: readonly PerfBaselineSample[],
): PerfBaselineArtifact {
  return {
    schemaVersion: 1,
    commit: "abc",
    capturedAt: "2026-08-12T00:00:00.000Z",
    machine: "test",
    browser: "Chrome",
    os: "linux",
    seed: "SEED",
    mood: "ash",
    capabilityPath: "default",
    backend,
    crtEnabled: false,
    samples,
    median: medianSample(samples),
  };
}

describe("perf baseline compare", () => {
  test("medians samples and publishes deltas", () => {
    const baseline = artifact("webgl", [sample(), sample({ frameP95Ms: 14 }), sample()]);
    const candidate = artifact("webgpu", [
      sample({ frameP95Ms: 10, firstInputMs: 800 }),
      sample({ frameP95Ms: 10, firstInputMs: 820 }),
      sample({ frameP95Ms: 11, firstInputMs: 810 }),
    ]);
    expect(baseline.median.frameP95Ms).toBe(12);
    const comparison = comparePerfBaselines(baseline, candidate);
    const p95 = comparison.deltas.find((delta) => delta.metric === "frameP95Ms");
    const input = comparison.deltas.find((delta) => delta.metric === "firstInputMs");
    expect(p95?.delta).toBeLessThan(0);
    expect(input?.candidate).toBe(810);
  });
});
