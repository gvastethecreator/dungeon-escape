/**
 * WGP-24 GLSL contraction — analysis, not execution.
 *
 * The expand-contract plan deletes the GLSL halves of every dual-mode material
 * only after the WGP-23 flip has been armed and observed stable. Deleting them
 * is destructive and irreversible without git history, so this script only
 * enumerates the dual-mode modules and their `ShaderProgramMode` factory ids as
 * the authoritative checklist for a human contraction PR.
 *
 * Usage:
 *   bun run scripts/remove-legacy-glsl.ts
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { glob } from "node:fs/promises";

const CANDIDATE_DIRS = ["src/world", "src/systems"];

const rows: Array<{ module: string; factoryIds: string[]; hasTslSibling: boolean }> = [];

for (const dir of CANDIDATE_DIRS) {
  for await (const entry of glob(join(dir, "**/*.ts"))) {
    if (entry.endsWith(".tsl.ts")) continue;
    const source = await readFile(entry, "utf8");
    const ids = [...source.matchAll(/SHADER_FACTORY_ID\s*=\s*["'`]([a-z-]+)["'`]/g)].map(
      (m) => m[1]!,
    );
    if (ids.length === 0) continue;
    const hasTslSibling = await readFile(entry.replace(/\.ts$/, ".tsl.ts"), "utf8")
      .then(() => true)
      .catch(() => false);
    rows.push({ module: entry, factoryIds: ids, hasTslSibling });
  }
}

rows.sort((a, b) => a.module.localeCompare(b.module));

const ready = rows.filter((r) => r.hasTslSibling);
const pending = rows.filter((r) => !r.hasTslSibling);

console.log("# WGP-24 GLSL contraction checklist\n");
console.log(
  `${ready.length} dual-mode modules have a TSL sibling and can shed their GLSL path after the flip.\n`,
);
console.log("## Ready (GLSL half removable)");
for (const r of ready) {
  console.log(`- \`${r.module}\` — factories: ${r.factoryIds.map((i) => `\`${i}\``).join(", ")}`);
}
if (pending.length > 0) {
  console.log("\n## Blocked (no TSL sibling yet)");
  for (const r of pending) {
    console.log(`- \`${r.module}\` — factories: ${r.factoryIds.map((i) => `\`${i}\``).join(", ")}`);
  }
}
console.log(
  "\nDo not delete a GLSL path until `WEBGPU_FLIP_POLICY.stagedFlipArmed` is true and WGP-22 has passed on the target cohort.",
);
