import { join, resolve } from "node:path";

import {
  createAudioGroupLevels,
  getAudioAsset,
  type AudioGroup,
} from "../src/audio/AudioAssetCatalog";

interface CatalogAsset {
  id: string;
  output: string;
  source: string;
  kind: "loop" | "one-shot";
  maxSeconds?: number;
}

interface Catalog {
  sourceRoot: string;
  outputRoot: string;
  encoding: {
    sampleRate: number;
    channels: number;
  };
  assets: CatalogAsset[];
}

interface ProbeOutput {
  streams?: Array<{ codec_name?: string; sample_rate?: string; channels?: number }>;
  format?: { duration?: string };
}

const projectRoot = resolve(import.meta.dirname, "..");
const manifestPath = join(projectRoot, "assets-source", "audio", "library-sfx-catalog.json");
const catalog = (await Bun.file(manifestPath).json()) as Catalog;
const levels = createAudioGroupLevels();
const errors: string[] = [];
const durations: number[] = [];
const loopDurations: number[] = [];
const oneShotDurations: number[] = [];
const postMixerPeaks: number[] = [];
let outputBytes = 0;

async function commandOutput(command: string[]): Promise<string> {
  const process = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr.trim() || `${command[0]} exited ${exitCode}`);
  return `${stdout}\n${stderr}`;
}

for (const asset of catalog.assets) {
  const sourcePath = join(catalog.sourceRoot, asset.source);
  const outputPath = join(projectRoot, catalog.outputRoot, asset.output);
  if (!(await Bun.file(sourcePath).exists())) {
    errors.push(`${asset.id}: missing source`);
    continue;
  }
  const output = Bun.file(outputPath);
  if (!(await output.exists())) {
    errors.push(`${asset.id}: missing output`);
    continue;
  }
  outputBytes += output.size;

  const definition = getAudioAsset(asset.id);
  if (definition.file !== asset.output) errors.push(`${asset.id}: catalog output mismatch`);
  const expectedGroup: AudioGroup =
    asset.kind === "loop" || asset.id.includes("-accent") ? "ambience" : "sfx";
  if (definition.group !== expectedGroup)
    errors.push(`${asset.id}: expected ${expectedGroup} group`);

  const probe = JSON.parse(
    await commandOutput([
      "ffprobe",
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_name,sample_rate,channels",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      outputPath,
    ]),
  ) as ProbeOutput;
  const stream = probe.streams?.[0];
  const duration = Number(probe.format?.duration ?? 0);
  durations.push(duration);
  if (stream?.codec_name !== "opus") errors.push(`${asset.id}: codec is not Opus`);
  if (Number(stream?.sample_rate) !== catalog.encoding.sampleRate)
    errors.push(`${asset.id}: sample rate mismatch`);
  if (stream?.channels !== catalog.encoding.channels) errors.push(`${asset.id}: channel mismatch`);
  if (asset.kind === "loop") {
    loopDurations.push(duration);
    if (duration < 8) errors.push(`${asset.id}: loop is shorter than 8 seconds`);
  } else {
    oneShotDurations.push(duration);
    if (asset.maxSeconds && duration > asset.maxSeconds + 0.15)
      errors.push(`${asset.id}: one-shot exceeds its duration cap`);
  }

  const effectiveGain = definition.gain * levels[definition.group];
  const volumeReport = await commandOutput([
    "ffmpeg",
    "-hide_banner",
    "-nostats",
    "-i",
    outputPath,
    "-af",
    `volume=${effectiveGain},volumedetect`,
    "-f",
    "null",
    "-",
  ]);
  const peakMatch = volumeReport.match(/max_volume:\s*(-?[\d.]+) dB/);
  const peak = peakMatch ? Number(peakMatch[1]) : Number.NEGATIVE_INFINITY;
  postMixerPeaks.push(peak);
  if (!Number.isFinite(peak) || peak < -45) errors.push(`${asset.id}: inaudible post-mixer peak`);
}

const summary = {
  ok: errors.length === 0,
  assets: catalog.assets.length,
  loops: loopDurations.length,
  oneShots: oneShotDurations.length,
  outputBytes,
  minDurationSeconds: Math.min(...durations),
  minLoopSeconds: Math.min(...loopDurations),
  maxOneShotSeconds: Math.max(...oneShotDurations),
  minPostMixerPeakDb: Math.min(...postMixerPeaks),
  maxPostMixerPeakDb: Math.max(...postMixerPeaks),
  errors,
};
console.log(JSON.stringify(summary, null, 2));
if (!summary.ok) process.exitCode = 1;
