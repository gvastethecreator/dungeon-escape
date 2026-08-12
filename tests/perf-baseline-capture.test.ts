import { describe, expect, test } from "bun:test";

import {
  buildPerfBaselineArtifact,
  DEFAULT_PERF_GO_NO_GO_THRESHOLDS,
  evaluatePerfGoNoGo,
} from "../src/systems/PerfBaselineCapture";
import type { PerfBaselineArtifact, PerfBaselineSample } from "../src/systems/PerfBaselineCompare";

function sample(partial: Partial<PerfBaselineSample> = {}): PerfBaselineSample {
  return {
    frameP50Ms: 14,
    frameP95Ms: 18,
    frameMaxMs: 28,
    drawCalls: 120,
    triangles: 40_000,
    programs: 80,
    rendererReadyMs: 900,
    firstInputMs: 1100,
    longestLongTaskMs: 40,
    ...partial,
  };
}

function artifact(
  backend: "webgl" | "webgpu",
  medianPartial: Partial<PerfBaselineSample>,
): PerfBaselineArtifact {
  const samples = [sample(medianPartial)];
  return buildPerfBaselineArtifact(
    {
      commit: "abc",
      machine: "ci",
      browser: "chrome",
      os: "linux",
      seed: "S",
      mood: "ash",
      capabilityPath: "default",
      backend,
      crtEnabled: false,
    },
    samples,
    "2026-08-12T00:00:00.000Z",
  );
}

describe("perf baseline capture helpers", () => {
  test("builds schemaVersion 1 artifacts with medians", () => {
    const built = artifact("webgl", {});
    expect(built.schemaVersion).toBe(1);
    expect(built.median.frameP95Ms).toBe(18);
    expect(built.backend).toBe("webgl");
  });

  test("go/no-go passes when candidate stays within thresholds", () => {
    const baseline = artifact("webgl", {});
    const candidate = artifact("webgpu", {
      frameP95Ms: 19,
      rendererReadyMs: 1000,
      drawCalls: 125,
    });
    const result = evaluatePerfGoNoGo(baseline, candidate, DEFAULT_PERF_GO_NO_GO_THRESHOLDS);
    expect(result.pass).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  test("go/no-go fails with reasons when candidate regresses", () => {
    const baseline = artifact("webgl", {});
    const candidate = artifact("webgpu", {
      frameP95Ms: 40,
      rendererReadyMs: 2000,
      drawCalls: 200,
    });
    const result = evaluatePerfGoNoGo(baseline, candidate);
    expect(result.pass).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });

  test("go/no-go fails closed when capture metrics are missing", () => {
    const baseline = artifact("webgl", { rendererReadyMs: 0, drawCalls: 0 });
    const candidate = artifact("webgpu", { rendererReadyMs: 0, drawCalls: 0 });
    const result = evaluatePerfGoNoGo(baseline, candidate);
    expect(result.pass).toBe(false);
    expect(result.reasons).toEqual([
      "rendererReadyMs requires positive baseline and candidate values; received 0/0",
      "drawCalls requires positive baseline and candidate values; received 0/0",
    ]);
  });
});
