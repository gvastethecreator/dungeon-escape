import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { arch, cpus, platform, release } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

export type DungeonLoadTerminal = "complete" | "error" | "timeout" | "superseded";

export type DungeonLoadSpanName =
  | "generation"
  | "plan"
  | "sceneCommit"
  | "actors"
  | "colliderIndex"
  | "texturePolicy"
  | "atmosphere"
  | "editorProjection"
  | "warmup";

export const DUNGEON_LOAD_SPAN_NAMES = Object.freeze([
  "generation",
  "plan",
  "sceneCommit",
  "actors",
  "colliderIndex",
  "texturePolicy",
  "atmosphere",
  "editorProjection",
  "warmup",
] as const satisfies readonly DungeonLoadSpanName[]);

export interface DungeonLoadSpan {
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly durationMs: number;
}

export interface DungeonLoadMilestone {
  readonly atMs: number;
}

/** The public RDL-01 payload exposed by #scene.dataset.dungeonLoadTrace. */
export interface DungeonLoadTraceSnapshot {
  readonly schemaVersion: 1 | 2;
  readonly loadId: string;
  readonly terminal: DungeonLoadTerminal;
  readonly terminalDetail: string | null;
  readonly totalMs: number;
  readonly generation: DungeonLoadSpan | null;
  readonly plan: DungeonLoadSpan | null;
  readonly sceneCommit: DungeonLoadSpan | null;
  readonly actors: DungeonLoadSpan | null;
  readonly colliderIndex: DungeonLoadSpan | null;
  readonly texturePolicy: DungeonLoadSpan | null;
  readonly atmosphere: DungeonLoadSpan | null;
  readonly editorProjection: DungeonLoadSpan | null;
  readonly warmup: DungeonLoadSpan | null;
  /** Schema 2: wall wait; equals warmup.durationMs when present. */
  readonly warmupWaitMs?: number | null;
  /** Schema 2: measured first-draw / compile work. */
  readonly warmupWorkMs?: number | null;
  readonly firstUsableFrame: DungeonLoadMilestone | null;
  readonly inputReady: DungeonLoadMilestone | null;
}

export type DungeonLoadTraceValidation =
  | { readonly ok: true; readonly value: DungeonLoadTraceSnapshot }
  | { readonly ok: false; readonly error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validateSpan(value: unknown, name: DungeonLoadSpanName): string | null {
  if (value === null) return null;
  if (!isRecord(value)) return `${name} must be a span or null.`;
  if (!isNonNegativeFinite(value.startedAtMs))
    return `${name}.startedAtMs must be finite and non-negative.`;
  if (!isNonNegativeFinite(value.endedAtMs))
    return `${name}.endedAtMs must be finite and non-negative.`;
  if (!isNonNegativeFinite(value.durationMs))
    return `${name}.durationMs must be finite and non-negative.`;
  if (value.endedAtMs < value.startedAtMs) return `${name}.endedAtMs must not precede startedAtMs.`;
  if (value.durationMs !== value.endedAtMs - value.startedAtMs)
    return `${name}.durationMs must equal endedAtMs minus startedAtMs.`;
  return null;
}

function validateMilestone(value: unknown, name: "firstUsableFrame" | "inputReady"): string | null {
  if (value === null) return null;
  if (!isRecord(value) || !isNonNegativeFinite(value.atMs))
    return `${name}.atMs must be finite and non-negative.`;
  return null;
}

/**
 * Accepts only a completed RDL-01 trace. Optional phases remain null when the
 * runtime did not measure them; this validator never substitutes a zero value.
 */
export function validateDungeonLoadTrace(
  value: unknown,
  expectedLoadId?: string,
): DungeonLoadTraceValidation {
  if (!isRecord(value)) return { ok: false, error: "Trace must be an object." };
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2)
    return { ok: false, error: "Trace schemaVersion must be 1 or 2." };
  if (typeof value.loadId !== "string" || value.loadId.trim() === "")
    return { ok: false, error: "Trace loadId must be non-empty." };
  if (expectedLoadId !== undefined && value.loadId !== expectedLoadId)
    return { ok: false, error: "Trace loadId does not match the external load ID." };
  if (value.terminal !== "complete")
    return { ok: false, error: "Trace terminal must be complete." };
  if (value.terminalDetail !== null && typeof value.terminalDetail !== "string")
    return { ok: false, error: "Trace terminalDetail must be a string or null." };
  if (!isNonNegativeFinite(value.totalMs))
    return { ok: false, error: "Trace totalMs must be finite and non-negative." };

  for (const name of DUNGEON_LOAD_SPAN_NAMES) {
    const error = validateSpan(value[name], name);
    if (error) return { ok: false, error };
  }
  for (const name of ["firstUsableFrame", "inputReady"] as const) {
    const error = validateMilestone(value[name], name);
    if (error) return { ok: false, error };
  }

  const requiredSpans = ["generation", "sceneCommit", "warmup"] as const;
  for (const name of requiredSpans) {
    if (value[name] === null) return { ok: false, error: `Trace ${name} must be present.` };
  }
  if (value.firstUsableFrame === null)
    return { ok: false, error: "Trace firstUsableFrame must be present." };
  if (value.inputReady === null) return { ok: false, error: "Trace inputReady must be present." };

  const warmup = value.warmup as DungeonLoadSpan;
  const firstUsableFrame = value.firstUsableFrame as DungeonLoadMilestone;
  const inputReady = value.inputReady as DungeonLoadMilestone;
  if (inputReady.atMs < firstUsableFrame.atMs)
    return { ok: false, error: "Trace inputReady must follow firstUsableFrame." };
  if (inputReady.atMs < warmup.endedAtMs)
    return { ok: false, error: "Trace inputReady must follow warmup." };
  if (value.totalMs < firstUsableFrame.atMs)
    return { ok: false, error: "Trace totalMs must include firstUsableFrame." };
  if (value.totalMs < inputReady.atMs)
    return { ok: false, error: "Trace totalMs must include inputReady." };
  for (const name of DUNGEON_LOAD_SPAN_NAMES) {
    const span = value[name] as DungeonLoadSpan | null;
    if (span !== null && value.totalMs < span.endedAtMs)
      return { ok: false, error: `Trace totalMs must include ${name}.endedAtMs.` };
  }

  if (value.schemaVersion === 2) {
    if (value.warmupWaitMs !== null && !isNonNegativeFinite(value.warmupWaitMs))
      return { ok: false, error: "Trace warmupWaitMs must be finite and non-negative or null." };
    if (value.warmupWorkMs !== null && !isNonNegativeFinite(value.warmupWorkMs))
      return { ok: false, error: "Trace warmupWorkMs must be finite and non-negative or null." };
    if (
      isNonNegativeFinite(value.warmupWaitMs) &&
      value.warmupWaitMs !== warmup.durationMs
    ) {
      return { ok: false, error: "Trace warmupWaitMs must equal warmup.durationMs." };
    }
  }

  return { ok: true, value: value as unknown as DungeonLoadTraceSnapshot };
}

export interface NearestRankSummary {
  readonly n: number;
  readonly min: number;
  readonly max: number;
  readonly range: number;
  readonly p50: number;
  readonly p95: number;
}

/** Uses nearest-rank-v1: rank p is ceil(p * n) - 1 in a sorted sample. */
export function nearestRankSummary(values: readonly number[]): NearestRankSummary {
  if (values.length === 0) throw new RangeError("Cannot summarize an empty sample.");
  if (values.some((value) => !Number.isFinite(value) || value < 0))
    throw new RangeError("Samples must be finite and non-negative.");
  const sorted = [...values].sort((left, right) => left - right);
  const atRank = (percentile: number): number => sorted[Math.ceil(percentile * sorted.length) - 1]!;
  const min = sorted[0]!;
  const max = sorted.at(-1)!;
  return Object.freeze({
    n: sorted.length,
    min,
    max,
    range: max - min,
    p50: atRank(0.5),
    p95: atRank(0.95),
  });
}

export type DungeonLoadSampleStatus = "passed" | "failed" | "timed_out" | "cleanup_failed";

export interface DungeonLoadSampleResult {
  readonly status: DungeonLoadSampleStatus;
  readonly trace: unknown;
  readonly expectedLoadId?: string;
}

export interface DungeonLoadAggregate {
  readonly totalMs: NearestRankSummary;
  readonly inputReadyMs: NearestRankSummary;
  readonly spans: Readonly<Record<DungeonLoadSpanName, NearestRankSummary | null>>;
}

export interface DungeonLoadWorkloadSummary {
  readonly expectedSamples: number;
  readonly passedSamples: number;
  readonly verdict: "pass" | "fail";
  readonly aggregate: DungeonLoadAggregate | null;
}

/**
 * A workload passes only when every expected sample passed and produced a
 * valid completed trace. This deliberately refuses partial green aggregates.
 */
export function summarizeWorkload(
  expectedSamples: number,
  sampleResults: readonly DungeonLoadSampleResult[],
): DungeonLoadWorkloadSummary {
  if (!Number.isInteger(expectedSamples) || expectedSamples < 1)
    throw new RangeError("expectedSamples must be a positive integer.");

  const traces: DungeonLoadTraceSnapshot[] = [];
  let hasFailure = sampleResults.length !== expectedSamples;
  for (const sample of sampleResults) {
    if (sample.status !== "passed") {
      hasFailure = true;
      continue;
    }
    const validation = validateDungeonLoadTrace(sample.trace, sample.expectedLoadId);
    if (!validation.ok) {
      hasFailure = true;
      continue;
    }
    traces.push(validation.value);
  }

  const complete = !hasFailure && traces.length === expectedSamples;
  if (!complete) {
    return Object.freeze({
      expectedSamples,
      passedSamples: traces.length,
      verdict: "fail",
      aggregate: null,
    });
  }

  const spans = Object.fromEntries(
    DUNGEON_LOAD_SPAN_NAMES.map((name) => {
      const values = traces.map((trace) => trace[name]);
      return [
        name,
        values.every((value) => value !== null)
          ? nearestRankSummary(values.map((value) => value!.durationMs))
          : null,
      ];
    }),
  ) as Record<DungeonLoadSpanName, NearestRankSummary | null>;

  return Object.freeze({
    expectedSamples,
    passedSamples: traces.length,
    verdict: "pass",
    aggregate: Object.freeze({
      totalMs: nearestRankSummary(traces.map((trace) => trace.totalMs)),
      inputReadyMs: nearestRankSummary(traces.map((trace) => trace.inputReady!.atMs)),
      spans: Object.freeze(spans),
    }),
  });
}

export interface CanonicalHashEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

function unsigned64Frame(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError("Canonical hash frame lengths must be safe non-negative integers.");
  const frame = Buffer.allocUnsafe(8);
  frame.writeBigUInt64BE(BigInt(value));
  return frame;
}

/**
 * Hashes a binary framed stream: entry count, then UTF-8 path length/path and
 * byte length/bytes for each ordinal path. The u64 length frames make entry
 * boundaries unambiguous. Input order cannot affect the digest.
 */
export function hashCanonicalEntries(entries: readonly CanonicalHashEntry[]): string {
  const ordered = entries
    .map((entry) => {
      if (typeof entry.path !== "string" || entry.path === "")
        throw new TypeError("Canonical hash entries require a non-empty path.");
      return { ...entry, pathBytes: Buffer.from(entry.path, "utf8") };
    })
    .sort((left, right) => left.pathBytes.compare(right.pathBytes));
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1]!.pathBytes.equals(ordered[index]!.pathBytes))
      throw new TypeError(
        `Canonical hash entries contain a duplicate path: ${ordered[index]!.path}`,
      );
  }
  const hash = createHash("sha256");
  hash.update(unsigned64Frame(ordered.length));
  for (const entry of ordered) {
    hash.update(unsigned64Frame(entry.pathBytes.byteLength));
    hash.update(entry.pathBytes);
    hash.update(unsigned64Frame(entry.bytes.byteLength));
    hash.update(entry.bytes);
  }
  return hash.digest("hex");
}

export interface DungeonLoadG0Workload {
  readonly id: "backrooms" | "frost";
  readonly biome: "backrooms" | "frost";
  readonly mood: "backrooms" | "frost";
  readonly seed: string;
  readonly floors: number;
  readonly expectedSamples: 3;
  readonly crt: "off";
  readonly viewport: Readonly<{ width: 1600; height: 900; dpr: 1 }>;
  readonly perfAudit: true;
  readonly skipRunIntro: true;
}

const G0_VIEWPORT = Object.freeze({ width: 1600, height: 900, dpr: 1 } as const);

export const DUNGEON_LOAD_G0_WORKLOADS = Object.freeze([
  Object.freeze({
    id: "backrooms",
    biome: "backrooms",
    mood: "backrooms",
    seed: "LOAD-PIPELINE-BACKROOMS-4",
    floors: 4,
    expectedSamples: 3,
    crt: "off",
    viewport: G0_VIEWPORT,
    perfAudit: true,
    skipRunIntro: true,
  }),
  Object.freeze({
    id: "frost",
    biome: "frost",
    mood: "frost",
    seed: "vfx-audit-2026-08-01",
    floors: 1,
    expectedSamples: 3,
    crt: "off",
    viewport: G0_VIEWPORT,
    perfAudit: true,
    skipRunIntro: true,
  }),
] as const satisfies readonly DungeonLoadG0Workload[]);

export function createDungeonLoadG0Workloads(): readonly DungeonLoadG0Workload[] {
  return DUNGEON_LOAD_G0_WORKLOADS;
}

export const DUNGEON_LOAD_G0_ARTIFACT_ROOT = ".scratch/resident-dungeon-load/g0";
export const DUNGEON_LOAD_G0_SAMPLE_DEADLINE_MS = 90_000;
export const DUNGEON_LOAD_G0_CDP_COMMAND_TIMEOUT_MS = 80_000;
export const DUNGEON_LOAD_G0_TOOL_SOURCES = Object.freeze([
  ".scratch/profile-dungeon-pipeline.ts",
  "scripts/capture-dungeon-load-g0.ts",
  "scripts/cdp-photo.ts",
] as const);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function utf8(value: string): Uint8Array {
  return textEncoder.encode(value);
}

function decode(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalRepositoryPath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isDungeonLoadG0ArtifactPath(path: string): boolean {
  const canonical = canonicalRepositoryPath(path).replace(/\/+$/, "");
  return (
    canonical === DUNGEON_LOAD_G0_ARTIFACT_ROOT ||
    canonical.startsWith(`${DUNGEON_LOAD_G0_ARTIFACT_ROOT}/`)
  );
}

/** Keep every untracked path except artifacts made by this exact G0 runner. */
export function filterDirtyUntrackedPaths(paths: readonly string[]): readonly string[] {
  return paths.filter((path) => !isDungeonLoadG0ArtifactPath(path));
}

export interface DirtyV1 {
  readonly schema: "dirty-v1";
  readonly algorithm: "sha256 tracked diff; canonical sha256 untracked paths and bytes; canonical sha256 references";
  readonly trackedHash: string;
  readonly untrackedHash: string;
  readonly untrackedCount: number;
  readonly dirty: boolean;
  readonly dirtyHash: string;
}

/**
 * dirty-v1 hashes the raw `git diff --binary --no-ext-diff HEAD` bytes first.
 * It hashes untracked entries as sorted UTF-8 path and byte pairs. It then
 * hashes those stable references with the count, so input enumeration order
 * cannot change the final dirtyHash.
 */
export function createDirtyV1(
  trackedDiffBytes: Uint8Array,
  untrackedEntries: readonly CanonicalHashEntry[],
): DirtyV1 {
  const trackedHash = sha256Bytes(trackedDiffBytes);
  const untrackedHash = hashCanonicalEntries(untrackedEntries);
  const untrackedCount = untrackedEntries.length;
  const dirty = trackedDiffBytes.byteLength > 0 || untrackedCount > 0;
  const dirtyHash = hashCanonicalEntries([
    { path: "dirty-v1/trackedHash", bytes: utf8(trackedHash) },
    { path: "dirty-v1/untrackedHash", bytes: utf8(untrackedHash) },
    { path: "dirty-v1/untrackedCount", bytes: utf8(String(untrackedCount)) },
  ]);
  return Object.freeze({
    schema: "dirty-v1",
    algorithm:
      "sha256 tracked diff; canonical sha256 untracked paths and bytes; canonical sha256 references",
    trackedHash,
    untrackedHash,
    untrackedCount,
    dirty,
    dirtyHash,
  });
}

export interface CommandOutput {
  readonly exitCode: number;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

export type CommandRunner = (
  command: readonly string[],
  options: Readonly<{ cwd: string; env?: Record<string, string | undefined> }>,
) => Promise<CommandOutput>;

async function readProcessStream(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (stream === null) return new Uint8Array();
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const runBunCommand: CommandRunner = async (command, options) => {
  const child = Bun.spawn([...command], {
    cwd: options.cwd,
    env: options.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    readProcessStream(child.stdout),
    readProcessStream(child.stderr),
    child.exited,
  ]);
  return { exitCode, stdout, stderr };
};

function commandError(command: readonly string[], output: CommandOutput): Error {
  const stderr = decode(output.stderr).trim();
  const suffix = stderr ? ` ${stderr.slice(0, 2_000)}` : "";
  return new Error(`${command.join(" ")} exited with ${output.exitCode}.${suffix}`);
}

async function runRequiredCommand(
  runner: CommandRunner,
  command: readonly string[],
  repositoryRoot: string,
): Promise<CommandOutput> {
  const output = await runner(command, { cwd: repositoryRoot });
  if (output.exitCode !== 0) throw commandError(command, output);
  return output;
}

function splitNullDelimitedPaths(bytes: Uint8Array): string[] {
  return decode(bytes)
    .split("\0")
    .filter((path) => path.length > 0)
    .map(canonicalRepositoryPath);
}

function repositoryFile(repositoryRoot: string, repositoryPath: string): string {
  const root = resolve(repositoryRoot);
  const absolute = resolve(root, repositoryPath);
  const rootWithSeparator = `${root}${sep}`;
  if (absolute !== root && !absolute.startsWith(rootWithSeparator)) {
    throw new Error(`Repository path escapes the root: ${repositoryPath}`);
  }
  return absolute;
}

/**
 * Git dirty-v1 includes tracked diff bytes and untracked non-ignored files.
 * Ignored measurement tools are recorded separately in metadata.toolSources.
 */
export async function collectDirtyV1(
  repositoryRoot: string,
  runner: CommandRunner = runBunCommand,
): Promise<DirtyV1> {
  const tracked = await runRequiredCommand(
    runner,
    ["git", "diff", "--binary", "--no-ext-diff", "HEAD"],
    repositoryRoot,
  );
  const untracked = await runRequiredCommand(
    runner,
    ["git", "ls-files", "--others", "--exclude-standard", "-z"],
    repositoryRoot,
  );
  const paths = filterDirtyUntrackedPaths(splitNullDelimitedPaths(untracked.stdout));
  const entries = await Promise.all(
    paths.map(async (path) => ({
      path,
      bytes: new Uint8Array(await readFile(repositoryFile(repositoryRoot, path))),
    })),
  );
  return createDirtyV1(tracked.stdout, entries);
}

export interface ToolSourceHash {
  readonly path: string;
  readonly sha256: string;
}

export async function collectToolSourceHashes(
  repositoryRoot: string,
): Promise<readonly ToolSourceHash[]> {
  return Promise.all(
    DUNGEON_LOAD_G0_TOOL_SOURCES.map(async (path) => ({
      path,
      sha256: sha256Bytes(new Uint8Array(await readFile(repositoryFile(repositoryRoot, path)))),
    })),
  );
}

export interface G0Provenance {
  readonly head: string;
  readonly dirty: DirtyV1;
  readonly package: {
    readonly packageJsonSha256: string;
    readonly bunLockSha256: string;
    readonly packageManager: string | null;
    readonly dependencies: Record<string, unknown>;
    readonly devDependencies: Record<string, unknown>;
  };
  readonly environment: {
    readonly bun: string;
    readonly node: string;
    readonly git: string;
    readonly os: string;
    readonly osRelease: string;
    readonly arch: string;
    readonly cpu: { readonly model: string | null; readonly count: number };
  };
  readonly toolSources: readonly ToolSourceHash[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export async function collectG0Provenance(
  repositoryRoot: string,
  runner: CommandRunner = runBunCommand,
): Promise<G0Provenance> {
  const [headOutput, dirty, packageBytes, bunLockBytes, gitVersionOutput, toolSources] =
    await Promise.all([
      runRequiredCommand(runner, ["git", "rev-parse", "HEAD"], repositoryRoot),
      collectDirtyV1(repositoryRoot, runner),
      readFile(repositoryFile(repositoryRoot, "package.json")),
      readFile(repositoryFile(repositoryRoot, "bun.lock")),
      runRequiredCommand(runner, ["git", "--version"], repositoryRoot),
      collectToolSourceHashes(repositoryRoot),
    ]);
  const packageJson = JSON.parse(decode(new Uint8Array(packageBytes))) as unknown;
  const manifest = asRecord(packageJson);
  return {
    head: decode(headOutput.stdout).trim(),
    dirty,
    package: {
      packageJsonSha256: sha256Bytes(new Uint8Array(packageBytes)),
      bunLockSha256: sha256Bytes(new Uint8Array(bunLockBytes)),
      packageManager: typeof manifest.packageManager === "string" ? manifest.packageManager : null,
      dependencies: asRecord(manifest.dependencies),
      devDependencies: asRecord(manifest.devDependencies),
    },
    environment: {
      bun: Bun.version,
      node: process.version,
      git: decode(gitVersionOutput.stdout).trim(),
      os: platform(),
      osRelease: release(),
      arch: arch(),
      cpu: { model: cpus()[0]?.model ?? null, count: cpus().length },
    },
    toolSources,
  };
}

export interface ArtifactPollOptions<T> {
  readonly deadlineMs: number;
  readonly intervalMs?: number;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly readResult: () => Promise<T | null>;
  readonly hasExited?: () => boolean;
  readonly cleanup: (reason: "timeout" | "exit_without_result") => Promise<void>;
}

export type ArtifactPollResult<T> =
  | { readonly status: "result"; readonly value: T }
  | { readonly status: "timed_out" | "failed" | "cleanup_failed"; readonly error: string | null };

const sleepFor = (milliseconds: number): Promise<void> =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

/** Poll an atomic result file. Cleanup failures always take precedence over a green status. */
export async function pollArtifactResult<T>(
  options: ArtifactPollOptions<T>,
): Promise<ArtifactPollResult<T>> {
  if (!Number.isFinite(options.deadlineMs) || options.deadlineMs < 0)
    throw new RangeError("deadlineMs must be finite and non-negative.");
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? sleepFor;
  const intervalMs = options.intervalMs ?? 250;
  if (!Number.isFinite(intervalMs) || intervalMs <= 0)
    throw new RangeError("intervalMs must be finite and positive.");
  const deadline = now() + options.deadlineMs;
  let reason: "timeout" | "exit_without_result" = "timeout";
  while (now() <= deadline) {
    const result = await options.readResult();
    if (result !== null) return { status: "result", value: result };
    if (options.hasExited?.()) {
      reason = "exit_without_result";
      break;
    }
    const remaining = deadline - now();
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  }
  try {
    await options.cleanup(reason);
  } catch (error) {
    return {
      status: "cleanup_failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return { status: reason === "timeout" ? "timed_out" : "failed", error: null };
}

export type DungeonLoadG0SampleStatus = "passed" | "failed" | "timed_out" | "cleanup_failed";

export interface G0SampleSpec {
  readonly sampleId: string;
  readonly sampleDirectory: string;
  readonly resultPath: string;
  readonly command: readonly string[];
  readonly environment: Record<string, string>;
}

function inheritedEnvironment(base: NodeJS.ProcessEnv): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(base)) {
    if (value !== undefined) environment[name] = value;
  }
  for (const name of [
    "QA_STATE",
    "DUNGEON_LOAD_G0_SAMPLE_DIR",
    "DUNGEON_LOAD_G0_SAMPLE_ID",
    "DUNGEON_LOAD_G0_WORKLOAD",
    "DUNGEON_LOAD_G0_RESULT_PATH",
    "DUNGEON_LOAD_G0_SEED",
    "DUNGEON_LOAD_G0_FLOORS",
  ]) {
    delete environment[name];
  }
  return environment;
}

function sampleSuffix(index: number): string {
  if (!Number.isInteger(index) || index < 1 || index > 99)
    throw new RangeError("Sample index must be an integer from 1 through 99.");
  return String(index).padStart(2, "0");
}

export function createBrowserSampleSpec(
  runRoot: string,
  workload: DungeonLoadG0Workload,
  index: number,
  previewBaseUrl: string,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): G0SampleSpec {
  const suffix = sampleSuffix(index);
  const sampleId = `browser-${workload.id}-${suffix}`;
  const sampleDirectory = resolve(runRoot, "samples", `browser-${workload.id}-${suffix}`);
  const environment = inheritedEnvironment(baseEnvironment);
  Object.assign(environment, {
    PHOTO_BASE_URL: previewBaseUrl.replace(/\/$/, ""),
    BIOME: workload.biome,
    MOOD: workload.mood,
    CRT: "off",
    PHOTO_SIMULATION: "off",
    PERF_SECONDS: "0",
    CDP_COMMAND_TIMEOUT_MS: String(DUNGEON_LOAD_G0_CDP_COMMAND_TIMEOUT_MS),
    DUNGEON_LOAD_G0_SAMPLE_DIR: sampleDirectory,
    DUNGEON_LOAD_G0_SAMPLE_ID: sampleId,
    DUNGEON_LOAD_G0_WORKLOAD: workload.id,
  });
  return {
    sampleId,
    sampleDirectory,
    resultPath: join(sampleDirectory, "result.json"),
    command: ["bun", "run", "scripts/cdp-photo.ts", workload.seed, sampleDirectory],
    environment,
  };
}

export function createOfflineSampleSpec(
  runRoot: string,
  workload: DungeonLoadG0Workload,
  index: number,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): G0SampleSpec {
  const suffix = sampleSuffix(index);
  const sampleId = `offline-${workload.id}-${suffix}`;
  const sampleDirectory = resolve(runRoot, "samples", `offline-${workload.id}-${suffix}`);
  const resultPath = join(sampleDirectory, "result.json");
  const environment = inheritedEnvironment(baseEnvironment);
  Object.assign(environment, {
    DUNGEON_LOAD_G0_WORKLOAD: workload.id,
    DUNGEON_LOAD_G0_SEED: workload.seed,
    DUNGEON_LOAD_G0_FLOORS: String(workload.floors),
    DUNGEON_LOAD_G0_SAMPLE_ID: sampleId,
    DUNGEON_LOAD_G0_RESULT_PATH: resultPath,
  });
  return {
    sampleId,
    sampleDirectory,
    resultPath,
    command: ["bun", "run", ".scratch/profile-dungeon-pipeline.ts"],
    environment,
  };
}

export interface OfflineCardinality {
  readonly objects: number;
  readonly meshes: number;
  readonly instancedMeshes: number;
  readonly lights: number;
  readonly colliders: number;
  readonly pickups: number;
  readonly chests: number;
  readonly doors: number;
  readonly staircases: number;
}

export interface OfflineMetrics {
  readonly cold: { readonly generationMs: number; readonly worldBuildMs: number };
  readonly hotRebuildMs: NearestRankSummary & { readonly samples: readonly number[] };
  readonly cardinality: OfflineCardinality;
  readonly coverage: {
    readonly fakeDom: true;
    readonly imageDecode: "not_measured";
    readonly gpuUpload: "not_measured";
    readonly shaderCompilation: "not_measured";
    readonly inputReady: "not_measured";
    readonly meshSemantics: "Mesh+Sprite+Points";
  };
}

export interface OfflineSampleResult {
  readonly status: DungeonLoadG0SampleStatus;
  readonly metrics: OfflineMetrics | null;
}

export interface OfflineAggregate {
  readonly generationMs: NearestRankSummary;
  readonly worldBuildMs: NearestRankSummary;
  readonly hotRebuildMs: NearestRankSummary;
  readonly cardinality: Readonly<Record<keyof OfflineCardinality, NearestRankSummary>>;
}

export interface OfflineWorkloadSummary {
  readonly expectedSamples: number;
  readonly passedSamples: number;
  readonly verdict: "pass" | "fail";
  readonly aggregate: OfflineAggregate | null;
}

const offlineCardinalityKeys = Object.freeze([
  "objects",
  "meshes",
  "instancedMeshes",
  "lights",
  "colliders",
  "pickups",
  "chests",
  "doors",
  "staircases",
] as const satisfies readonly (keyof OfflineCardinality)[]);

/** Offline aggregation is fail-closed for the same three-sample contract as browser G0. */
export function summarizeOfflineWorkload(
  expectedSamples: number,
  sampleResults: readonly OfflineSampleResult[],
): OfflineWorkloadSummary {
  if (!Number.isInteger(expectedSamples) || expectedSamples < 1)
    throw new RangeError("expectedSamples must be a positive integer.");
  const passed = sampleResults.filter(
    (
      sample,
    ): sample is OfflineSampleResult & {
      readonly status: "passed";
      readonly metrics: OfflineMetrics;
    } => sample.status === "passed" && sample.metrics !== null,
  );
  if (sampleResults.length !== expectedSamples || passed.length !== expectedSamples) {
    return Object.freeze({
      expectedSamples,
      passedSamples: passed.length,
      verdict: "fail",
      aggregate: null,
    });
  }
  const cardinality = Object.fromEntries(
    offlineCardinalityKeys.map((key) => [
      key,
      nearestRankSummary(passed.map((sample) => sample.metrics.cardinality[key])),
    ]),
  ) as Record<keyof OfflineCardinality, NearestRankSummary>;
  return Object.freeze({
    expectedSamples,
    passedSamples: passed.length,
    verdict: "pass",
    aggregate: Object.freeze({
      generationMs: nearestRankSummary(passed.map((sample) => sample.metrics.cold.generationMs)),
      worldBuildMs: nearestRankSummary(passed.map((sample) => sample.metrics.cold.worldBuildMs)),
      hotRebuildMs: nearestRankSummary(
        passed.flatMap((sample) => sample.metrics.hotRebuildMs.samples),
      ),
      cardinality: Object.freeze(cardinality),
    }),
  });
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function requireNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`${label} must be a finite non-negative number.`);
  return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  const number = requireNonNegativeNumber(value, label);
  if (!Number.isInteger(number)) throw new Error(`${label} must be an integer.`);
  return number;
}

function requireEmptyArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length !== 0) throw new Error(`${label} must be empty.`);
}

function requireNearestRankSummary(
  summaryValue: unknown,
  samples: readonly number[],
  label: string,
): NearestRankSummary {
  const summary = requireRecord(summaryValue, label);
  const expected = nearestRankSummary(samples);
  for (const key of ["n", "min", "max", "range", "p50", "p95"] as const) {
    if (summary[key] !== expected[key])
      throw new Error(`${label}.${key} does not match nearest-rank-v1.`);
  }
  return expected;
}

export function validateBrowserSample(
  value: unknown,
  expected: Readonly<{ sampleId: string; workload: DungeonLoadG0Workload }>,
): DungeonLoadTraceSnapshot {
  const sample = requireRecord(value, "Browser G0 result");
  if (sample.schema !== "dungeon-load-g0-browser-sample/v1")
    throw new Error("Browser G0 result has an invalid schema.");
  if (sample.sampleId !== expected.sampleId)
    throw new Error("Browser G0 result sampleId does not match.");
  if (sample.workload !== expected.workload.id)
    throw new Error("Browser G0 result workload does not match.");
  if (sample.status !== "passed")
    throw new Error(`Browser G0 result status is ${String(sample.status)}.`);
  const dataset = requireRecord(sample.dataset, "Browser G0 dataset");
  const datasetLoadId = dataset.dungeonLoadId;
  if (typeof datasetLoadId !== "string" || datasetLoadId === "")
    throw new Error("Browser G0 dataset is missing dungeonLoadId.");
  const trace = validateDungeonLoadTrace(sample.trace, datasetLoadId);
  if (!trace.ok) throw new Error(`Browser G0 trace is invalid: ${trace.error}`);
  requireEmptyArray(sample.browserErrors, "Browser G0 browserErrors");
  requireEmptyArray(sample.networkErrors, "Browser G0 networkErrors");
  const cleanup = requireRecord(sample.cleanup, "Browser G0 cleanup");
  if (cleanup.chromeExited !== true) throw new Error("Browser G0 Chrome did not exit cleanly.");
  if (sample.floorCount !== null) {
    if (typeof sample.floorCount !== "number" || sample.floorCount !== expected.workload.floors)
      throw new Error(`Browser G0 floor count does not match ${expected.workload.floors}.`);
  }
  return trace.value;
}

export function validateOfflineSample(
  value: unknown,
  expected: Readonly<{ sampleId: string; workload: DungeonLoadG0Workload }>,
): OfflineMetrics {
  const sample = requireRecord(value, "Offline G0 result");
  if (sample.schema !== "dungeon-load-g0-offline-sample/v1")
    throw new Error("Offline G0 result has an invalid schema.");
  if (sample.sampleId !== expected.sampleId)
    throw new Error("Offline G0 result sampleId does not match.");
  if (sample.workload !== expected.workload.id)
    throw new Error("Offline G0 result workload does not match.");
  if (sample.seed !== expected.workload.seed)
    throw new Error("Offline G0 result seed does not match.");
  if (sample.floors !== expected.workload.floors)
    throw new Error("Offline G0 result floors do not match.");
  if (sample.status !== "passed")
    throw new Error(`Offline G0 result status is ${String(sample.status)}.`);
  if (sample.error !== null) throw new Error("Offline G0 passed result has an error.");
  if (!Object.hasOwn(sample, "details") || sample.details === null)
    throw new Error("Offline G0 result is missing details.");
  const metrics = requireRecord(sample.metrics, "Offline G0 metrics");
  const cold = requireRecord(metrics.cold, "Offline G0 cold metrics");
  const hot = requireRecord(metrics.hotRebuildMs, "Offline G0 hot rebuild metrics");
  const cardinality = requireRecord(metrics.cardinality, "Offline G0 cardinality");
  const coverage = requireRecord(metrics.coverage, "Offline G0 coverage");
  const samplesValue = hot.samples;
  if (!Array.isArray(samplesValue) || samplesValue.length === 0)
    throw new Error("Offline G0 hot rebuild samples must be non-empty.");
  const samples = samplesValue.map((value, index) =>
    requireNonNegativeNumber(value, `Offline G0 hot rebuild samples[${index}]`),
  );
  const hotSummary = requireNearestRankSummary(hot, samples, "Offline G0 hot rebuild summary");
  const checkedCardinality: OfflineCardinality = {
    objects: requireNonNegativeInteger(cardinality.objects, "Offline G0 cardinality.objects"),
    meshes: requireNonNegativeInteger(cardinality.meshes, "Offline G0 cardinality.meshes"),
    instancedMeshes: requireNonNegativeInteger(
      cardinality.instancedMeshes,
      "Offline G0 cardinality.instancedMeshes",
    ),
    lights: requireNonNegativeInteger(cardinality.lights, "Offline G0 cardinality.lights"),
    colliders: requireNonNegativeInteger(cardinality.colliders, "Offline G0 cardinality.colliders"),
    pickups: requireNonNegativeInteger(cardinality.pickups, "Offline G0 cardinality.pickups"),
    chests: requireNonNegativeInteger(cardinality.chests, "Offline G0 cardinality.chests"),
    doors: requireNonNegativeInteger(cardinality.doors, "Offline G0 cardinality.doors"),
    staircases: requireNonNegativeInteger(
      cardinality.staircases,
      "Offline G0 cardinality.staircases",
    ),
  };
  if (
    coverage.fakeDom !== true ||
    coverage.imageDecode !== "not_measured" ||
    coverage.gpuUpload !== "not_measured" ||
    coverage.shaderCompilation !== "not_measured" ||
    coverage.inputReady !== "not_measured" ||
    coverage.meshSemantics !== "Mesh+Sprite+Points"
  ) {
    throw new Error("Offline G0 coverage does not describe the fixed fake-DOM scope.");
  }
  return {
    cold: {
      generationMs: requireNonNegativeNumber(cold.generationMs, "Offline G0 cold generationMs"),
      worldBuildMs: requireNonNegativeNumber(cold.worldBuildMs, "Offline G0 cold worldBuildMs"),
    },
    hotRebuildMs: { samples, ...hotSummary },
    cardinality: checkedCardinality,
    coverage: {
      fakeDom: true,
      imageDecode: "not_measured",
      gpuUpload: "not_measured",
      shaderCompilation: "not_measured",
      inputReady: "not_measured",
      meshSemantics: "Mesh+Sprite+Points",
    },
  };
}

export interface BrowserSampleReference {
  readonly sampleId: string;
  readonly ref: string;
  readonly status: DungeonLoadG0SampleStatus;
  readonly error: string | null;
  readonly trace: unknown;
  readonly expectedLoadId?: string;
}

export interface OfflineSampleReference {
  readonly sampleId: string;
  readonly ref: string;
  readonly status: DungeonLoadG0SampleStatus;
  readonly error: string | null;
  readonly metrics: OfflineMetrics | null;
}

export interface BrowserWorkloadReport {
  readonly workload: DungeonLoadG0Workload["id"];
  readonly expected: number;
  readonly passed: number;
  readonly verdict: "pass" | "fail";
  readonly refs: readonly Omit<BrowserSampleReference, "trace" | "expectedLoadId">[];
  readonly aggregate: DungeonLoadAggregate | null;
  readonly failures: readonly string[];
}

export interface OfflineWorkloadReport {
  readonly workload: DungeonLoadG0Workload["id"];
  readonly expected: number;
  readonly passed: number;
  readonly verdict: "pass" | "fail";
  readonly refs: readonly Omit<OfflineSampleReference, "metrics">[];
  readonly aggregate: OfflineAggregate | null;
  readonly failures: readonly string[];
}

function failureRows<
  T extends {
    readonly sampleId: string;
    readonly status: DungeonLoadG0SampleStatus;
    readonly error: string | null;
  },
>(expected: number, samples: readonly T[]): readonly string[] {
  const failures = samples
    .filter((sample) => sample.status !== "passed")
    .map(
      (sample) => `${sample.sampleId}: ${sample.status}${sample.error ? ` (${sample.error})` : ""}`,
    );
  for (let index = samples.length; index < expected; index += 1) {
    failures.push(`missing sample ${index + 1} of ${expected}`);
  }
  return failures;
}

export function createBrowserWorkloadReport(
  workload: DungeonLoadG0Workload,
  samples: readonly BrowserSampleReference[],
): BrowserWorkloadReport {
  const summary = summarizeWorkload(
    workload.expectedSamples,
    samples.map((sample) => ({
      status: sample.status,
      trace: sample.trace,
      expectedLoadId: sample.expectedLoadId,
    })),
  );
  return {
    workload: workload.id,
    expected: summary.expectedSamples,
    passed: summary.passedSamples,
    verdict: summary.verdict,
    refs: samples.map(
      ({ trace: _trace, expectedLoadId: _expectedLoadId, ...reference }) => reference,
    ),
    aggregate: summary.aggregate,
    failures: failureRows(summary.expectedSamples, samples),
  };
}

export function createOfflineWorkloadReport(
  workload: DungeonLoadG0Workload,
  samples: readonly OfflineSampleReference[],
): OfflineWorkloadReport {
  const summary = summarizeOfflineWorkload(
    workload.expectedSamples,
    samples.map((sample) => ({ status: sample.status, metrics: sample.metrics })),
  );
  return {
    workload: workload.id,
    expected: summary.expectedSamples,
    passed: summary.passedSamples,
    verdict: summary.verdict,
    refs: samples.map(({ metrics: _metrics, ...reference }) => reference),
    aggregate: summary.aggregate,
    failures: failureRows(summary.expectedSamples, samples),
  };
}

export interface BrowserG0Report {
  readonly schema: "dungeon-load-g0-browser/v1";
  readonly metadataRef: "metadata.json";
  readonly percentileMethod: "nearest-rank-v1";
  readonly verdict: "pass" | "fail";
  readonly workloads: readonly BrowserWorkloadReport[];
  readonly failures: readonly string[];
}

export interface OfflineG0Report {
  readonly schema: "dungeon-load-g0-offline/v1";
  readonly metadataRef: "metadata.json";
  readonly percentileMethod: "nearest-rank-v1";
  readonly verdict: "pass" | "fail";
  readonly workloads: readonly OfflineWorkloadReport[];
  readonly failures: readonly string[];
}

export function createBrowserG0Report(
  workloadReports: readonly BrowserWorkloadReport[],
): BrowserG0Report {
  const failures = workloadReports.flatMap((report) =>
    report.failures.map((failure) => `${report.workload}: ${failure}`),
  );
  return {
    schema: "dungeon-load-g0-browser/v1",
    metadataRef: "metadata.json",
    percentileMethod: "nearest-rank-v1",
    verdict: workloadReports.every((report) => report.verdict === "pass") ? "pass" : "fail",
    workloads: workloadReports,
    failures,
  };
}

export function createOfflineG0Report(
  workloadReports: readonly OfflineWorkloadReport[],
): OfflineG0Report {
  const failures = workloadReports.flatMap((report) =>
    report.failures.map((failure) => `${report.workload}: ${failure}`),
  );
  return {
    schema: "dungeon-load-g0-offline/v1",
    metadataRef: "metadata.json",
    percentileMethod: "nearest-rank-v1",
    verdict: workloadReports.every((report) => report.verdict === "pass") ? "pass" : "fail",
    workloads: workloadReports,
    failures,
  };
}

export interface G0MarkdownIdentity {
  readonly runId: string;
  readonly head: string;
  readonly buildHash: string;
}

function reportHeader(
  title: string,
  identity: G0MarkdownIdentity,
  verdict: "pass" | "fail",
): string[] {
  return [
    `# ${title}`,
    "",
    "## Identity",
    "",
    `- Run: \`${identity.runId}\``,
    `- HEAD: \`${identity.head}\``,
    `- Build hash: \`${identity.buildHash}\``,
    "",
    "## Verdict",
    "",
    verdict === "pass"
      ? "PASS. Each workload has three valid samples."
      : "FAIL. Partial or failed samples are not an accepted baseline.",
    "",
    "| Workload | Passed | Expected | Verdict |",
    "| --- | ---: | ---: | --- |",
  ];
}

function reportFailures(failures: readonly string[]): string[] {
  if (failures.length === 0) return ["## Failures", "", "None.", ""];
  return ["## Failures", "", ...failures.map((failure) => `- ${failure}`), ""];
}

export function renderBrowserMarkdown(
  report: BrowserG0Report,
  identity: G0MarkdownIdentity,
): string {
  const lines = reportHeader("Dungeon load G0 browser report", identity, report.verdict);
  for (const workload of report.workloads) {
    lines.push(
      `| ${workload.workload} | ${workload.passed} | ${workload.expected} | ${workload.verdict} |`,
    );
  }
  lines.push("", "## Aggregates", "");
  for (const workload of report.workloads) {
    if (workload.aggregate === null) {
      lines.push(
        `### ${workload.workload}`,
        "",
        "No aggregate. The workload did not pass 3/3.",
        "",
      );
      continue;
    }
    lines.push(
      `### ${workload.workload}`,
      "",
      "| Metric | p50 | p95 | Range |",
      "| --- | ---: | ---: | ---: |",
      `| Total ms | ${workload.aggregate.totalMs.p50} | ${workload.aggregate.totalMs.p95} | ${workload.aggregate.totalMs.range} |`,
      `| Input-ready ms | ${workload.aggregate.inputReadyMs.p50} | ${workload.aggregate.inputReadyMs.p95} | ${workload.aggregate.inputReadyMs.range} |`,
      "",
    );
  }
  lines.push(...reportFailures(report.failures));
  lines.push("## Limits", "", "The browser report measures the controlled preview only.", "");
  return lines.join("\n");
}

export function renderOfflineMarkdown(
  report: OfflineG0Report,
  identity: G0MarkdownIdentity,
): string {
  const lines = reportHeader("Dungeon load G0 offline report", identity, report.verdict);
  for (const workload of report.workloads) {
    lines.push(
      `| ${workload.workload} | ${workload.passed} | ${workload.expected} | ${workload.verdict} |`,
    );
  }
  lines.push("", "## Aggregates", "");
  for (const workload of report.workloads) {
    if (workload.aggregate === null) {
      lines.push(
        `### ${workload.workload}`,
        "",
        "No aggregate. The workload did not pass 3/3.",
        "",
      );
      continue;
    }
    lines.push(
      `### ${workload.workload}`,
      "",
      "| Metric | p50 | p95 | Range |",
      "| --- | ---: | ---: | ---: |",
      `| Generation ms | ${workload.aggregate.generationMs.p50} | ${workload.aggregate.generationMs.p95} | ${workload.aggregate.generationMs.range} |`,
      `| World build ms | ${workload.aggregate.worldBuildMs.p50} | ${workload.aggregate.worldBuildMs.p95} | ${workload.aggregate.worldBuildMs.range} |`,
      `| Hot rebuild ms | ${workload.aggregate.hotRebuildMs.p50} | ${workload.aggregate.hotRebuildMs.p95} | ${workload.aggregate.hotRebuildMs.range} |`,
      "",
    );
  }
  lines.push(...reportFailures(report.failures));
  lines.push(
    "## Limits",
    "",
    "The offline profiler uses a fake DOM. It does not measure image decode, GPU upload, shader compilation, or input-ready.",
    "",
  );
  return lines.join("\n");
}

export async function writeTextAtomically(destination: string, text: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = join(
    dirname(destination),
    `.${destination.split(/[\\/]/).at(-1) ?? "result"}.${process.pid}.${Date.now()}.tmp`,
  );
  await writeFile(temporary, text, "utf8");
  await rename(temporary, destination);
}

export async function writeJsonAtomically(destination: string, value: unknown): Promise<void> {
  await writeTextAtomically(destination, `${JSON.stringify(value, null, 2)}\n`);
}

export function createPreviewCommand(repositoryRoot: string, port: number): readonly string[] {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Preview port must be an integer between 1 and 65535; received ${port}.`);
  }

  const resolvedRoot = resolve(repositoryRoot);
  const viteEntrypoint = resolve(resolvedRoot, "node_modules", "vite", "bin", "vite.js");
  const relativeEntrypoint = relative(resolvedRoot, viteEntrypoint);
  if (
    relativeEntrypoint === "" ||
    relativeEntrypoint === ".." ||
    relativeEntrypoint.startsWith(`..${sep}`)
  ) {
    throw new Error(`Vite preview entrypoint is outside the repository: ${viteEntrypoint}`);
  }

  return Object.freeze([
    "node",
    viteEntrypoint,
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ]);
}

interface ManagedProcess {
  readonly pid: number;
  readonly exited: Promise<number>;
  readonly kill: () => void;
  readonly logsDone: Promise<void>;
}

async function drainProcessStream(
  stream: ReadableStream<Uint8Array> | null,
  destination: string,
): Promise<void> {
  await writeFile(destination, await readProcessStream(stream));
}

function spawnManagedProcess(
  command: readonly string[],
  cwd: string,
  environment: Record<string, string>,
  stdoutPath: string,
  stderrPath: string,
): ManagedProcess {
  const child = Bun.spawn([...command], {
    cwd,
    env: environment,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    pid: child.pid,
    exited: child.exited,
    kill: () => child.kill(),
    logsDone: Promise.all([
      drainProcessStream(child.stdout, stdoutPath),
      drainProcessStream(child.stderr, stderrPath),
    ]).then(() => undefined),
  };
}

async function waitForValue<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ readonly complete: true; readonly value: T } | { readonly complete: false }> {
  return new Promise((resolveValue) => {
    const timeout = setTimeout(() => resolveValue({ complete: false }), timeoutMs);
    void promise.then(
      (value) => {
        clearTimeout(timeout);
        resolveValue({ complete: true, value });
      },
      () => {
        clearTimeout(timeout);
        resolveValue({ complete: false });
      },
    );
  });
}

function isAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = isRecord(error) && typeof error.code === "string" ? error.code : null;
    return code !== "ESRCH";
  }
}

function uniqueKnownPids(values: readonly unknown[]): number[] {
  return [
    ...new Set(
      values.filter(
        (value): value is number =>
          typeof value === "number" &&
          Number.isInteger(value) &&
          value > 0 &&
          value !== process.pid,
      ),
    ),
  ];
}

function pidsFromRecord(value: unknown): number[] {
  if (!isRecord(value)) return [];
  const pids = isRecord(value.pids) ? value.pids : {};
  return uniqueKnownPids([value.bunPid, value.chromePid, pids.bun, pids.chrome]);
}

async function readJsonIfPresent(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    const code = isRecord(error) && typeof error.code === "string" ? error.code : null;
    if (code === "ENOENT") return null;
    throw error;
  }
}

export interface KillKnownPidDependencies {
  readonly runner?: CommandRunner;
  readonly isAlive?: (pid: number) => boolean;
  readonly platform?: NodeJS.Platform;
}

export async function killKnownPid(
  pid: number,
  repositoryRoot: string,
  dependencies: KillKnownPidDependencies = {},
): Promise<void> {
  const pidIsAlive = dependencies.isAlive ?? isAlive;
  if (!pidIsAlive(pid)) return;
  if ((dependencies.platform ?? process.platform) === "win32") {
    try {
      const output = await (dependencies.runner ?? runBunCommand)(
        ["taskkill", "/PID", String(pid), "/T", "/F"],
        { cwd: repositoryRoot },
      );
      if (output.exitCode !== 0 && pidIsAlive(pid)) {
        throw commandError(["taskkill", "/PID", String(pid), "/T", "/F"], output);
      }
    } catch (error) {
      if (pidIsAlive(pid)) throw error;
    }
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    if (pidIsAlive(pid)) throw new Error(`Could not kill known PID ${pid}.`);
  }
}

/** Kill only the explicit Bun and Chrome PIDs recorded for one sample. */
async function cleanupKnownProcesses(
  child: ManagedProcess | null,
  pids: readonly number[],
  repositoryRoot: string,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  try {
    child?.kill();
  } catch {
    // A process can exit between the result poll and the direct kill.
  }
  if (child !== null) {
    const firstWait = await waitForValue(
      child.exited,
      Math.max(0, Math.min(5_000, deadline - Date.now())),
    );
    if (!firstWait.complete && isAlive(child.pid)) await killKnownPid(child.pid, repositoryRoot);
  }
  for (const pid of uniqueKnownPids([child?.pid, ...pids])) {
    if (Date.now() >= deadline) break;
    await killKnownPid(pid, repositoryRoot);
  }
  while (Date.now() < deadline) {
    if (uniqueKnownPids([child?.pid, ...pids]).every((pid) => !isAlive(pid))) return;
    await sleepFor(100);
  }
  const alive = uniqueKnownPids([child?.pid, ...pids]).filter(isAlive);
  if (alive.length > 0) throw new Error(`Known sample PIDs are still alive: ${alive.join(", ")}.`);
}

async function waitForLogs(process: ManagedProcess | null): Promise<void> {
  if (process === null) return;
  const completed = await waitForValue(process.logsDone, 10_000);
  if (!completed.complete) throw new Error("Sample stdout/stderr did not drain within 10 seconds.");
}

export interface RawSampleOutcome {
  readonly status: DungeonLoadG0SampleStatus;
  readonly error: string | null;
  readonly value: unknown | null;
  readonly cleanupComplete: boolean;
}

export interface FailedSampleExitOptions {
  readonly exitCode: number;
  readonly childPid: number;
  readonly started: unknown;
  readonly result: unknown;
  readonly cleanup: (pids: readonly number[]) => Promise<void>;
}

function declaredFailedSampleOutcome(result: unknown): {
  readonly status: Exclude<DungeonLoadG0SampleStatus, "passed">;
  readonly error: string | null;
} | null {
  if (!isRecord(result)) return null;
  const status = result.status;
  if (status !== "timed_out" && status !== "cleanup_failed" && status !== "failed") return null;
  if (result.error !== null && typeof result.error !== "string") return null;
  return { status, error: result.error };
}

/** Classify a non-zero sample exit only after every recorded PID is dead. */
export async function finalizeFailedSampleExit(
  options: FailedSampleExitOptions,
): Promise<RawSampleOutcome> {
  const declaredFailure = declaredFailedSampleOutcome(options.result);
  const pids = uniqueKnownPids([
    options.childPid,
    ...pidsFromRecord(options.started),
    ...pidsFromRecord(options.result),
  ]);
  try {
    await options.cleanup(pids);
  } catch (error) {
    return {
      status: "cleanup_failed",
      error: error instanceof Error ? error.message : String(error),
      value: options.result,
      cleanupComplete: false,
    };
  }
  if (declaredFailure !== null) {
    return {
      ...declaredFailure,
      value: options.result,
      cleanupComplete: declaredFailure.status !== "cleanup_failed",
    };
  }
  return {
    status: "failed",
    error: `The sample Bun process exited with ${options.exitCode}.`,
    value: options.result,
    cleanupComplete: true,
  };
}

interface RunRawSampleOptions {
  readonly repositoryRoot: string;
  readonly spec: G0SampleSpec;
  readonly workload: DungeonLoadG0Workload;
  readonly kind: "browser" | "offline";
  readonly deadlineMs: number;
}

function syntheticSampleResult(
  kind: "browser" | "offline",
  spec: G0SampleSpec,
  workload: DungeonLoadG0Workload,
  status: Exclude<DungeonLoadG0SampleStatus, "passed">,
  error: string | null,
  startedAt: string,
  pids: readonly number[],
): Record<string, unknown> {
  const common = {
    sampleId: spec.sampleId,
    workload: workload.id,
    startedAt,
    finishedAt: new Date().toISOString(),
    status,
    error,
    synthetic: true,
  };
  if (kind === "browser") {
    return {
      schema: "dungeon-load-g0-browser-sample/v1",
      ...common,
      pids: { bun: pids[0] ?? null, chrome: pids[1] ?? null },
      cleanup: { chromeExited: false, error },
      trace: null,
      dataset: null,
      browserErrors: [],
      networkErrors: [],
      metrics: null,
    };
  }
  return {
    schema: "dungeon-load-g0-offline-sample/v1",
    ...common,
    seed: workload.seed,
    floors: workload.floors,
    metrics: null,
    details: null,
  };
}

/**
 * This is the process seam. It starts one fresh Bun process, polls its atomic
 * result file, and only kills PIDs that the sample itself recorded.
 */
export async function runRawG0Sample(options: RunRawSampleOptions): Promise<RawSampleOutcome> {
  const { repositoryRoot, spec, workload, kind, deadlineMs } = options;
  const startedAt = new Date().toISOString();
  let child: ManagedProcess | null = null;
  let childExited = false;
  let started: unknown | null = null;
  let cleanupComplete = true;
  try {
    await mkdir(join(spec.sampleDirectory, "logs"), { recursive: true });
    child = spawnManagedProcess(
      spec.command,
      repositoryRoot,
      spec.environment,
      join(spec.sampleDirectory, "logs", "stdout.log"),
      join(spec.sampleDirectory, "logs", "stderr.log"),
    );
    void child.exited.then(() => {
      childExited = true;
    });
    const cleanup = async (): Promise<void> => {
      started = await readJsonIfPresent(join(spec.sampleDirectory, "started.json"));
      await cleanupKnownProcesses(child, pidsFromRecord(started), repositoryRoot);
    };
    const polled = await pollArtifactResult({
      deadlineMs,
      intervalMs: 250,
      readResult: () => readJsonIfPresent(spec.resultPath),
      hasExited: () => childExited,
      cleanup,
    });
    if (polled.status !== "result") {
      cleanupComplete = polled.status !== "cleanup_failed";
      const synthetic = syntheticSampleResult(
        kind,
        spec,
        workload,
        polled.status,
        polled.error,
        startedAt,
        pidsFromRecord(started),
      );
      await writeJsonAtomically(spec.resultPath, synthetic);
      return { status: polled.status, error: polled.error, value: synthetic, cleanupComplete };
    }

    const exit = await waitForValue(child.exited, 10_000);
    const resultPids = pidsFromRecord(polled.value);
    if (!exit.complete) {
      try {
        await cleanupKnownProcesses(child, resultPids, repositoryRoot);
      } catch (error) {
        cleanupComplete = false;
        return {
          status: "cleanup_failed",
          error: error instanceof Error ? error.message : String(error),
          value: polled.value,
          cleanupComplete,
        };
      }
      return {
        status: "failed",
        error: "The sample wrote result.json but its Bun process did not exit within 10 seconds.",
        value: polled.value,
        cleanupComplete,
      };
    }
    if (exit.value !== 0) {
      try {
        started ??= await readJsonIfPresent(join(spec.sampleDirectory, "started.json"));
      } catch {
        // The result and child PID still provide bounded cleanup ownership.
      }
      return finalizeFailedSampleExit({
        exitCode: exit.value,
        childPid: child.pid,
        started,
        result: polled.value,
        cleanup: (pids) => cleanupKnownProcesses(child, pids, repositoryRoot),
      });
    }
    const alive = uniqueKnownPids([child.pid, ...resultPids]).filter(isAlive);
    if (alive.length > 0) {
      try {
        await cleanupKnownProcesses(child, alive, repositoryRoot);
      } catch (error) {
        cleanupComplete = false;
        return {
          status: "cleanup_failed",
          error: error instanceof Error ? error.message : String(error),
          value: polled.value,
          cleanupComplete,
        };
      }
      return {
        status: "failed",
        error: `The sample left known PIDs alive: ${alive.join(", ")}.`,
        value: polled.value,
        cleanupComplete,
      };
    }
    return { status: "passed", error: null, value: polled.value, cleanupComplete };
  } catch (error) {
    try {
      started ??= await readJsonIfPresent(join(spec.sampleDirectory, "started.json"));
      await cleanupKnownProcesses(child, pidsFromRecord(started), repositoryRoot);
    } catch (cleanupError) {
      cleanupComplete = false;
      return {
        status: "cleanup_failed",
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        value: null,
        cleanupComplete,
      };
    }
    return {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      value: null,
      cleanupComplete,
    };
  } finally {
    try {
      await waitForLogs(child);
    } catch {
      // A failed log drain cannot change a previously persisted sample result.
    }
  }
}

export interface BuildTree {
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly hash: string;
  readonly files: readonly { readonly path: string; readonly bytes: number }[];
}

export async function collectBuildTree(distRoot: string): Promise<BuildTree> {
  const entries: CanonicalHashEntry[] = [];
  const files: Array<{ path: string; bytes: number }> = [];
  async function visit(directory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) =>
      Buffer.from(left.name, "utf8").compare(Buffer.from(right.name, "utf8")),
    );
    for (const child of children) {
      const absolute = join(directory, child.name);
      if (child.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (!child.isFile()) throw new Error(`Build tree contains a non-file entry: ${absolute}`);
      const path = canonicalRepositoryPath(relative(distRoot, absolute));
      const bytes = new Uint8Array(await readFile(absolute));
      entries.push({ path, bytes });
      files.push({ path, bytes: bytes.byteLength });
    }
  }
  await visit(distRoot);
  return {
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    hash: hashCanonicalEntries(entries),
    files,
  };
}

export function createDungeonLoadG0RunId(startedAt: Date, head: string, buildHash: string): string {
  const compactUtc = startedAt.toISOString().replace(/[-:.]/g, "");
  return `${compactUtc}-${head.slice(0, 7)}-${buildHash.slice(0, 12)}`;
}

async function findFreeLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        rejectPort(new Error("Could not allocate a loopback TCP port."));
        return;
      }
      server.close((error) => (error ? rejectPort(error) : resolvePort(address.port)));
    });
  });
}

async function waitForPreview(baseUrl: string, deadlineMs = 30_000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  let lastError: string | null = null;
  while (Date.now() <= deadline) {
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleepFor(Math.min(250, remaining));
  }
  throw new Error(
    `Vite preview did not respond within 30 seconds.${lastError ? ` ${lastError}` : ""}`,
  );
}

async function captureBrowserSamples(
  repositoryRoot: string,
  runRoot: string,
  workload: DungeonLoadG0Workload,
  previewBaseUrl: string,
): Promise<{
  readonly samples: readonly BrowserSampleReference[];
  readonly cleanupComplete: boolean;
}> {
  const samples: BrowserSampleReference[] = [];
  let cleanupComplete = true;
  for (let index = 1; index <= workload.expectedSamples; index += 1) {
    const spec = createBrowserSampleSpec(runRoot, workload, index, previewBaseUrl);
    const raw = await runRawG0Sample({
      repositoryRoot,
      spec,
      workload,
      kind: "browser",
      deadlineMs: DUNGEON_LOAD_G0_SAMPLE_DEADLINE_MS,
    });
    cleanupComplete &&= raw.cleanupComplete;
    const ref = canonicalRepositoryPath(relative(runRoot, spec.resultPath));
    if (raw.status !== "passed" || raw.value === null) {
      samples.push({
        sampleId: spec.sampleId,
        ref,
        status: raw.status,
        error: raw.error,
        trace: raw.value,
      });
      continue;
    }
    try {
      const trace = validateBrowserSample(raw.value, { sampleId: spec.sampleId, workload });
      const result = requireRecord(raw.value, "Browser G0 result");
      const dataset = requireRecord(result.dataset, "Browser G0 dataset");
      samples.push({
        sampleId: spec.sampleId,
        ref,
        status: "passed",
        error: null,
        trace,
        expectedLoadId: String(dataset.dungeonLoadId),
      });
    } catch (error) {
      samples.push({
        sampleId: spec.sampleId,
        ref,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        trace: raw.value,
      });
    }
  }
  return { samples, cleanupComplete };
}

async function captureOfflineSamples(
  repositoryRoot: string,
  runRoot: string,
  workload: DungeonLoadG0Workload,
): Promise<{
  readonly samples: readonly OfflineSampleReference[];
  readonly cleanupComplete: boolean;
}> {
  const samples: OfflineSampleReference[] = [];
  let cleanupComplete = true;
  for (let index = 1; index <= workload.expectedSamples; index += 1) {
    const spec = createOfflineSampleSpec(runRoot, workload, index);
    const raw = await runRawG0Sample({
      repositoryRoot,
      spec,
      workload,
      kind: "offline",
      deadlineMs: DUNGEON_LOAD_G0_SAMPLE_DEADLINE_MS,
    });
    cleanupComplete &&= raw.cleanupComplete;
    const ref = canonicalRepositoryPath(relative(runRoot, spec.resultPath));
    if (raw.status !== "passed" || raw.value === null) {
      samples.push({
        sampleId: spec.sampleId,
        ref,
        status: raw.status,
        error: raw.error,
        metrics: null,
      });
      continue;
    }
    try {
      samples.push({
        sampleId: spec.sampleId,
        ref,
        status: "passed",
        error: null,
        metrics: validateOfflineSample(raw.value, { sampleId: spec.sampleId, workload }),
      });
    } catch (error) {
      samples.push({
        sampleId: spec.sampleId,
        ref,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        metrics: null,
      });
    }
  }
  return { samples, cleanupComplete };
}

export interface DungeonLoadG0Metadata {
  readonly schema: "dungeon-load-g0-metadata/v1";
  readonly runId: string;
  readonly startedAt: string;
  readonly repositoryRoot: string;
  readonly provenance: Omit<G0Provenance, "toolSources">;
  readonly toolSources: readonly ToolSourceHash[];
  readonly build: {
    readonly command: "bun run build";
    readonly status: "passed" | "failed";
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly exitCode: number;
    readonly fileCount: number | null;
    readonly totalBytes: number | null;
    readonly hash: string | null;
    readonly files: readonly { readonly path: string; readonly bytes: number }[] | null;
  };
}

function metadataFrom(
  runId: string,
  startedAt: string,
  repositoryRoot: string,
  provenance: G0Provenance,
  build: DungeonLoadG0Metadata["build"],
): DungeonLoadG0Metadata {
  const { toolSources, ...withoutToolSources } = provenance;
  return {
    schema: "dungeon-load-g0-metadata/v1",
    runId,
    startedAt,
    repositoryRoot,
    provenance: withoutToolSources,
    toolSources,
    build,
  };
}

function withReportFailure<
  T extends { readonly verdict: "pass" | "fail"; readonly failures: readonly string[] },
>(report: T, failure: string | null): T {
  if (failure === null) return report;
  return { ...report, verdict: "fail", failures: [...report.failures, failure] };
}

async function createFreshRunRoot(runRoot: string): Promise<void> {
  await mkdir(dirname(runRoot), { recursive: true });
  await mkdir(runRoot);
  await mkdir(join(runRoot, "logs"));
}

export interface DungeonLoadG0RunResult {
  readonly runId: string;
  readonly runRoot: string;
  readonly verdict: "pass" | "fail";
  readonly browser: BrowserG0Report;
  readonly offline: OfflineG0Report;
  readonly previewCleanupComplete: boolean;
  readonly sampleCleanupComplete: boolean;
}

export interface DungeonLoadG0MainOptions {
  readonly repositoryRoot?: string;
}

/**
 * Capture the approved three browser and three offline samples for each G0
 * workload. The function is inert on import and resolves the repository from
 * this script, never from the caller's working directory.
 */
export async function main(
  options: DungeonLoadG0MainOptions = {},
): Promise<DungeonLoadG0RunResult> {
  const repositoryRoot = resolve(options.repositoryRoot ?? join(import.meta.dir, ".."));
  const started = new Date();
  const startedAt = started.toISOString();
  const provenance = await collectG0Provenance(repositoryRoot);
  const buildStartedAt = new Date().toISOString();
  const buildOutput = await runBunCommand(["bun", "run", "build"], { cwd: repositoryRoot });
  const buildFinishedAt = new Date().toISOString();
  if (buildOutput.exitCode !== 0) {
    const runId = `${started.toISOString().replace(/[-:.]/g, "")}-${provenance.head.slice(0, 7)}-build-failed`;
    const runRoot = join(repositoryRoot, DUNGEON_LOAD_G0_ARTIFACT_ROOT, runId);
    await createFreshRunRoot(runRoot);
    await Promise.all([
      writeFile(join(runRoot, "logs", "build.stdout.log"), buildOutput.stdout),
      writeFile(join(runRoot, "logs", "build.stderr.log"), buildOutput.stderr),
    ]);
    await writeJsonAtomically(
      join(runRoot, "metadata.json"),
      metadataFrom(runId, startedAt, repositoryRoot, provenance, {
        command: "bun run build",
        status: "failed",
        startedAt: buildStartedAt,
        finishedAt: buildFinishedAt,
        exitCode: buildOutput.exitCode,
        fileCount: null,
        totalBytes: null,
        hash: null,
        files: null,
      }),
    );
    throw new Error(
      `bun run build failed with ${buildOutput.exitCode}. See ${join(runRoot, "logs")}.`,
    );
  }

  const buildTree = await collectBuildTree(join(repositoryRoot, "dist"));
  const runId = createDungeonLoadG0RunId(started, provenance.head, buildTree.hash);
  const runRoot = join(repositoryRoot, DUNGEON_LOAD_G0_ARTIFACT_ROOT, runId);
  await createFreshRunRoot(runRoot);
  await Promise.all([
    writeFile(join(runRoot, "logs", "build.stdout.log"), buildOutput.stdout),
    writeFile(join(runRoot, "logs", "build.stderr.log"), buildOutput.stderr),
  ]);
  const metadata = metadataFrom(runId, startedAt, repositoryRoot, provenance, {
    command: "bun run build",
    status: "passed",
    startedAt: buildStartedAt,
    finishedAt: buildFinishedAt,
    exitCode: buildOutput.exitCode,
    fileCount: buildTree.fileCount,
    totalBytes: buildTree.totalBytes,
    hash: buildTree.hash,
    files: buildTree.files,
  });
  await writeJsonAtomically(join(runRoot, "metadata.json"), metadata);

  let preview: ManagedProcess | null = null;
  let previewCleanupComplete = true;
  let previewFailure: string | null = null;
  const browserSamples = new Map<DungeonLoadG0Workload["id"], readonly BrowserSampleReference[]>();
  let browserCleanupComplete = true;
  try {
    const port = await findFreeLoopbackPort();
    const previewBaseUrl = `http://127.0.0.1:${port}`;
    const previewCommand = createPreviewCommand(repositoryRoot, port);
    preview = spawnManagedProcess(
      previewCommand,
      repositoryRoot,
      inheritedEnvironment(process.env),
      join(runRoot, "logs", "preview.stdout.log"),
      join(runRoot, "logs", "preview.stderr.log"),
    );
    await waitForPreview(previewBaseUrl);
    for (const workload of DUNGEON_LOAD_G0_WORKLOADS) {
      const captured = await captureBrowserSamples(
        repositoryRoot,
        runRoot,
        workload,
        previewBaseUrl,
      );
      browserSamples.set(workload.id, captured.samples);
      browserCleanupComplete &&= captured.cleanupComplete;
    }
  } catch (error) {
    previewFailure = error instanceof Error ? error.message : String(error);
  } finally {
    if (preview !== null) {
      try {
        await cleanupKnownProcesses(preview, [], repositoryRoot);
      } catch (error) {
        previewCleanupComplete = false;
        previewFailure ??= error instanceof Error ? error.message : String(error);
      }
      try {
        await waitForLogs(preview);
      } catch (error) {
        previewCleanupComplete = false;
        previewFailure ??= error instanceof Error ? error.message : String(error);
      }
    }
  }

  const offlineSamples = new Map<DungeonLoadG0Workload["id"], readonly OfflineSampleReference[]>();
  let offlineCleanupComplete = true;
  for (const workload of DUNGEON_LOAD_G0_WORKLOADS) {
    const captured = await captureOfflineSamples(repositoryRoot, runRoot, workload);
    offlineSamples.set(workload.id, captured.samples);
    offlineCleanupComplete &&= captured.cleanupComplete;
  }

  const browser = withReportFailure(
    createBrowserG0Report(
      DUNGEON_LOAD_G0_WORKLOADS.map((workload) =>
        createBrowserWorkloadReport(workload, browserSamples.get(workload.id) ?? []),
      ),
    ),
    previewFailure,
  );
  const offline = createOfflineG0Report(
    DUNGEON_LOAD_G0_WORKLOADS.map((workload) =>
      createOfflineWorkloadReport(workload, offlineSamples.get(workload.id) ?? []),
    ),
  );
  const identity = { runId, head: metadata.provenance.head, buildHash: buildTree.hash };
  await Promise.all([
    writeJsonAtomically(join(runRoot, "browser.json"), browser),
    writeJsonAtomically(join(runRoot, "offline.json"), offline),
    writeTextAtomically(join(runRoot, "browser.md"), renderBrowserMarkdown(browser, identity)),
    writeTextAtomically(join(runRoot, "offline.md"), renderOfflineMarkdown(offline, identity)),
  ]);
  const sampleCleanupComplete = browserCleanupComplete && offlineCleanupComplete;
  const verdict =
    browser.verdict === "pass" &&
    offline.verdict === "pass" &&
    previewCleanupComplete &&
    sampleCleanupComplete
      ? "pass"
      : "fail";
  const result: DungeonLoadG0RunResult = {
    runId,
    runRoot,
    verdict,
    browser,
    offline,
    previewCleanupComplete,
    sampleCleanupComplete,
  };
  await writeJsonAtomically(join(runRoot, "summary.json"), result);
  if (verdict !== "pass") throw new Error(`Dungeon load G0 failed. See ${runRoot}.`);
  return result;
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
