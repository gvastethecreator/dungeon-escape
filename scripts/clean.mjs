import { readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const generatedPaths = [
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
  ".scratch/build",
  ".code-review-graph",
  ".local",
  ".wrangler/tmp",
];

function projectPath(relativePath) {
  const target = resolve(projectRoot, relativePath);
  if (!target.startsWith(`${projectRoot}\\`) && !target.startsWith(`${projectRoot}/`)) {
    throw new Error(`Refusing to clean outside the project: ${target}`);
  }
  return target;
}

for (const relativePath of generatedPaths) {
  await rm(projectPath(relativePath), { force: true, recursive: true });
  console.log(`removed ${relativePath}`);
}

async function removeScratchResidue(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__pycache__") {
        await rm(target, { force: true, recursive: true });
        console.log(`removed ${target.slice(projectRoot.length + 1)}`);
      } else {
        await removeScratchResidue(target);
      }
    } else if (directory === projectPath(".scratch") && entry.name.endsWith(".log")) {
      await rm(target, { force: true });
      console.log(`removed .scratch/${entry.name}`);
    }
  }
}

await removeScratchResidue(projectPath(".scratch"));

const rootEntries = await readdir(projectRoot, { withFileTypes: true }).catch(() => []);
for (const entry of rootEntries) {
  if (!entry.isDirectory() || !entry.name.startsWith(".proof-")) continue;
  await rm(projectPath(entry.name), { force: true, recursive: true });
  console.log(`removed ${entry.name}`);
}
