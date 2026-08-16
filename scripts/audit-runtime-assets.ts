import { readdir, readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join, relative, resolve, sep } from "node:path";

import { listEnemyAtlasSources } from "../src/world/EnemySpriteAtlas";

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_PUBLIC_ROOT = join(PROJECT_ROOT, "public");

const SOURCE_ONLY_PUBLIC_PATHS = [
  /^assets\/sprites\/enemies-v[3-6](?:\/|$)/,
  /^assets\/sprites\/enemies-v8\/_src(?:\/|$)/,
  /^assets\/sprites\/viewmodel(?:\/|$)/,
  /^assets\/sprites\/iron-ash-enemies(?:-v[23])?\.(?:png|webp)$/,
  /^assets\/sprites\/iron-ash-viewmodel\.(?:png|webp)$/,
] as const;

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".ts"]);
const ASSET_URL = /\/assets\/[A-Za-z0-9_./-]+\.(?:jpe?g|json|ogg|opus|png|svg|webp)/g;

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function portable(path: string): string {
  return path.split(sep).join("/");
}

function webpDimensions(bytes: Uint8Array): [number, number] | null {
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.length < 30 || ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WEBP") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const kind = ascii(offset, 4);
    const size = view.getUint32(offset + 4, true);
    const payload = offset + 8;
    if (payload + size > bytes.length) return null;
    if (kind === "VP8X" && size >= 10) {
      const width =
        1 + bytes[payload + 4]! + (bytes[payload + 5]! << 8) + (bytes[payload + 6]! << 16);
      const height =
        1 + bytes[payload + 7]! + (bytes[payload + 8]! << 8) + (bytes[payload + 9]! << 16);
      return [width, height];
    }
    if (kind === "VP8L" && size >= 5 && bytes[payload] === 0x2f) {
      const width = 1 + bytes[payload + 1]! + ((bytes[payload + 2]! & 0x3f) << 8);
      const height =
        1 +
        (bytes[payload + 2]! >> 6) +
        (bytes[payload + 3]! << 2) +
        ((bytes[payload + 4]! & 0x0f) << 10);
      return [width, height];
    }
    if (
      kind === "VP8 " &&
      size >= 10 &&
      bytes[payload + 3] === 0x9d &&
      bytes[payload + 4] === 0x01 &&
      bytes[payload + 5] === 0x2a
    ) {
      return [
        view.getUint16(payload + 6, true) & 0x3fff,
        view.getUint16(payload + 8, true) & 0x3fff,
      ];
    }
    offset = payload + size + (size % 2);
  }
  return null;
}

async function sourceAssetUrls(): Promise<Set<string>> {
  const roots = [join(PROJECT_ROOT, "src")];
  const files = [
    join(PROJECT_ROOT, "index.html"),
    join(PROJECT_ROOT, "forge.html"),
    join(PROJECT_ROOT, "model-lab.html"),
    join(PROJECT_ROOT, "model-playground.html"),
    join(PROJECT_ROOT, "sprite-playground.html"),
    join(PROJECT_ROOT, "reliquary.html"),
  ];
  for (const root of roots) files.push(...(await walkFiles(root)));
  const urls = new Set<string>();
  for (const file of files) {
    if (!TEXT_EXTENSIONS.has(extname(file))) continue;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(ASSET_URL)) urls.add(match[0]!);
  }
  return urls;
}

export interface RuntimeAssetAudit {
  ok: boolean;
  fileCount: number;
  bytes: number;
  optimizationManifest: "verified" | "unavailable";
  missing: string[];
  sourceLeaks: string[];
  enemyAtlasOrphans: string[];
  unoptimizedRasters: string[];
  optimizationIssues: string[];
}

type RuntimeOptimizationManifest = {
  images: Array<{
    target: string;
    sourceDimensions: [number, number];
    targetDimensions: [number, number];
    targetBytes: number;
    targetSha256: string;
    resample?: string;
  }>;
};

async function readOptimizationManifest(path: string): Promise<RuntimeOptimizationManifest | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as RuntimeOptimizationManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function auditRuntimeAssets(
  publicRoot = DEFAULT_PUBLIC_ROOT,
): Promise<RuntimeAssetAudit> {
  const files = await walkFiles(publicRoot);
  const relativeFiles = files.map((file) => portable(relative(publicRoot, file))).sort();
  const publicPaths = new Set(relativeFiles.map((file) => `/${file}`));
  const required = await sourceAssetUrls();
  listEnemyAtlasSources().forEach((url) => required.add(url));

  const missing = [...required].filter((url) => !publicPaths.has(url)).sort();
  const sourceLeaks = relativeFiles
    .filter((file) => SOURCE_ONLY_PUBLIC_PATHS.some((pattern) => pattern.test(file)))
    .sort();
  const expectedEnemyFiles = new Set(
    listEnemyAtlasSources().map((url) => url.replace("/assets/sprites/enemies-v8/", "")),
  );
  const enemyAtlasOrphans = relativeFiles
    .filter((file) => file.startsWith("assets/sprites/enemies-v8/"))
    .map((file) => file.replace("assets/sprites/enemies-v8/", ""))
    .filter((file) => !expectedEnemyFiles.has(file))
    .sort();
  const unoptimizedRasters = relativeFiles.filter((file) => /\.(?:jpe?g|png)$/i.test(file));
  const manifestPath = join(PROJECT_ROOT, "assets-source", "runtime-optimization-manifest.json");
  const manifest = await readOptimizationManifest(manifestPath);
  const optimizationManifest = manifest ? "verified" : "unavailable";
  const optimizationIssues: string[] = [];
  const optimizedTargets = new Set<string>();
  for (const entry of manifest?.images ?? []) {
    const targetRelative = entry.target.replace(/^public\//, "");
    optimizedTargets.add(targetRelative);
    const target = join(publicRoot, ...targetRelative.split("/"));
    if (!publicPaths.has(`/${targetRelative}`)) {
      optimizationIssues.push(`${targetRelative}: missing optimized output`);
      continue;
    }
    const expectedDimensions: [number, number] =
      entry.resample === "none"
        ? entry.sourceDimensions
        : [
            Math.max(1, Math.floor(entry.sourceDimensions[0] / 2)),
            Math.max(1, Math.floor(entry.sourceDimensions[1] / 2)),
          ];
    if (
      entry.targetDimensions[0] !== expectedDimensions[0] ||
      entry.targetDimensions[1] !== expectedDimensions[1]
    ) {
      optimizationIssues.push(
        `${targetRelative}: dimensions do not match ${entry.resample === "none" ? "authored runtime size" : "50% optimization"}`,
      );
    }
    const bytes = await readFile(target);
    if (bytes.byteLength !== entry.targetBytes)
      optimizationIssues.push(`${targetRelative}: byte count drifted`);
    if (createHash("sha256").update(bytes).digest("hex") !== entry.targetSha256)
      optimizationIssues.push(`${targetRelative}: hash drifted`);
    const actualDimensions = webpDimensions(bytes);
    if (!actualDimensions) optimizationIssues.push(`${targetRelative}: invalid WebP dimensions`);
    else if (
      actualDimensions[0] !== entry.targetDimensions[0] ||
      actualDimensions[1] !== entry.targetDimensions[1]
    ) {
      optimizationIssues.push(
        `${targetRelative}: dimensions drifted (${actualDimensions.join("x")})`,
      );
    }
  }
  for (const file of relativeFiles.filter((file) => file.endsWith(".webp"))) {
    if (manifest && !optimizedTargets.has(file)) {
      optimizationIssues.push(`${file}: missing manifest record`);
      continue;
    }
    if (!manifest) {
      const bytes = await readFile(join(publicRoot, ...file.split("/")));
      if (!webpDimensions(bytes)) optimizationIssues.push(`${file}: invalid WebP dimensions`);
    }
  }
  let bytes = 0;
  for (const file of files) bytes += (await stat(file)).size;
  return {
    ok:
      missing.length === 0 &&
      sourceLeaks.length === 0 &&
      enemyAtlasOrphans.length === 0 &&
      unoptimizedRasters.length === 0 &&
      optimizationIssues.length === 0,
    fileCount: files.length,
    bytes,
    optimizationManifest,
    missing,
    sourceLeaks,
    enemyAtlasOrphans,
    unoptimizedRasters,
    optimizationIssues,
  };
}

if (import.meta.main) {
  const audit = await auditRuntimeAssets();
  console.log(JSON.stringify(audit, null, 2));
  if (!audit.ok) process.exitCode = 1;
}
