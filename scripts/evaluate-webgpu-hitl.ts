/**
 * WGP-22 HITL go/no-go runner.
 *
 * Compares a WebGPU candidate capture against the WebGL baseline from the same
 * machine and prints the pass/fail verdict with the failing metrics. Exits 1 on
 * no-go so it can gate the WGP-23 flip in CI or a manual run.
 *
 * Usage:
 *   bun run scripts/evaluate-webgpu-hitl.ts <baseline.json> <candidate.json>
 */

import { readFile } from "node:fs/promises";

import { evaluatePerfGoNoGo } from "../src/systems/PerfBaselineCapture";
import type { PerfBaselineArtifact } from "../src/systems/PerfBaselineCompare";

const [, , baselinePath, candidatePath] = process.argv;

if (!baselinePath || !candidatePath) {
  console.error(
    "Usage: bun run scripts/evaluate-webgpu-hitl.ts <baseline.json> <candidate.json>",
  );
  process.exit(2);
}

const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as PerfBaselineArtifact;
const candidate = JSON.parse(await readFile(candidatePath, "utf8")) as PerfBaselineArtifact;

const result = evaluatePerfGoNoGo(baseline, candidate);

console.log(
  JSON.stringify(
    {
      pass: result.pass,
      baseline: {
        commit: baseline.commit,
        backend: baseline.backend,
        capturedAt: baseline.capturedAt,
      },
      candidate: {
        commit: candidate.commit,
        backend: candidate.backend,
        capturedAt: candidate.capturedAt,
      },
      reasons: result.reasons,
    },
    null,
    2,
  ),
);

process.exit(result.pass ? 0 : 1);
