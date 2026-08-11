import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

interface CatalogAsset {
  id: string;
  output: string;
  source: string;
  role: string;
  kind: "loop" | "one-shot";
  maxSeconds?: number;
  loopStrategy?: "crossfade";
  startSeconds?: number;
  segmentSeconds?: number;
  crossfadeSeconds?: number;
}

interface Catalog {
  sourceRoot: string;
  outputRoot: string;
  encoding: {
    sampleRate: number;
    channels: number;
    bitrateKbps: number;
  };
  assets: CatalogAsset[];
}

const projectRoot = resolve(import.meta.dirname, "..");
const manifestPath = join(projectRoot, "assets-source", "audio", "library-sfx-catalog.json");
const catalog = (await Bun.file(manifestPath).json()) as Catalog;
const outputRoot = join(projectRoot, catalog.outputRoot);
await mkdir(outputRoot, { recursive: true });

async function runFfmpeg(asset: CatalogAsset): Promise<void> {
  const source = join(catalog.sourceRoot, asset.source);
  const output = join(outputRoot, asset.output);
  if (!(await Bun.file(source).exists())) throw new Error(`${asset.id}: missing source ${source}`);
  await mkdir(dirname(output), { recursive: true });

  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", source];
  if (asset.loopStrategy === "crossfade") {
    const start = asset.startSeconds ?? 0;
    const length = asset.segmentSeconds ?? 14;
    const fade = asset.crossfadeSeconds ?? 1.5;
    const headEnd = start + fade;
    const middleStart = headEnd;
    const middleEnd = start + length - fade;
    const tailStart = middleEnd;
    const end = start + length;
    args.push(
      "-filter_complex",
      `[0:a]asplit=3[h][m][t];[h]atrim=${start}:${headEnd},asetpts=PTS-STARTPTS[head];[m]atrim=${middleStart}:${middleEnd},asetpts=PTS-STARTPTS[mid];[t]atrim=${tailStart}:${end},asetpts=PTS-STARTPTS[tail];[tail][head]acrossfade=d=${fade}:c1=tri:c2=tri[seam];[mid][seam]concat=n=2:v=0:a=1,loudnorm=I=-27:LRA=8:TP=-2[out]`,
      "-map",
      "[out]",
    );
  } else {
    args.push(
      "-af",
      asset.kind === "loop" ? "loudnorm=I=-27:LRA=8:TP=-2" : "loudnorm=I=-19:LRA=9:TP=-1.5",
    );
    if (asset.kind === "one-shot" && asset.maxSeconds) args.push("-t", String(asset.maxSeconds));
  }
  args.push(
    "-vn",
    "-ac",
    String(catalog.encoding.channels),
    "-ar",
    String(catalog.encoding.sampleRate),
    "-c:a",
    "libopus",
    "-b:a",
    `${catalog.encoding.bitrateKbps}k`,
    "-vbr",
    "on",
    "-application",
    "audio",
    output,
  );

  const process = Bun.spawn(["ffmpeg", ...args], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(`${asset.id}: ffmpeg failed\n${stderr.trim()}`);
  const bytes = Bun.file(output).size;
  if (bytes < 800) throw new Error(`${asset.id}: output is too small (${bytes} bytes)`);
  console.log(`${asset.id}\t${asset.output}\t${bytes}`);
}

const requestedIds = new Set(Bun.argv.slice(2));
const selectedAssets = requestedIds.size
  ? catalog.assets.filter((asset) => requestedIds.has(asset.id))
  : catalog.assets;
if (requestedIds.size && selectedAssets.length !== requestedIds.size) {
  const found = new Set(selectedAssets.map((asset) => asset.id));
  const missing = [...requestedIds].filter((id) => !found.has(id));
  throw new Error(`unknown asset id(s): ${missing.join(", ")}`);
}
for (const asset of selectedAssets) await runFfmpeg(asset);
console.log(`built ${selectedAssets.length} library audio assets`);
