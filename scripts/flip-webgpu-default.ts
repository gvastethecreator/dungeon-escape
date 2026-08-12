/**
 * WGP-23 staged-flip armer.
 *
 * Flips `WEBGPU_FLIP_POLICY` to the Chrome/Edge WebGPU cohort so `?renderer=auto`
 * prefers WebGPU where an adapter exists. Run only after `perf:baseline:hitl`
 * passes on the target cohort (WGP-22). The change is intentionally small so a
 * revert is a one-line git revert.
 *
 * Usage:
 *   bun run scripts/flip-webgpu-default.ts
 */

import { readFile, writeFile } from "node:fs/promises";

const POLICY_PATH = "src/systems/WebGpuFlipPolicy.ts";
const source = await readFile(POLICY_PATH, "utf8");

const next = source
  .replace("preferWebGpuWhenAuto: false,", "preferWebGpuWhenAuto: true,")
  .replace('cohort: "webgl-default",', 'cohort: "chrome-edge-webgpu",')
  .replace("stagedFlipArmed: false,", "stagedFlipArmed: true,");

if (next === source) {
  console.error(`No WGP-23 anchors found in ${POLICY_PATH}; the flip may already be armed.`);
  process.exit(1);
}

await writeFile(POLICY_PATH, next);
console.log(`Armed WGP-23 staged flip in ${POLICY_PATH}. Review and commit before merge.`);
