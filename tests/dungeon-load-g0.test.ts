import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import {
  DUNGEON_LOAD_G0_ARTIFACT_ROOT,
  DUNGEON_LOAD_G0_CDP_COMMAND_TIMEOUT_MS,
  DUNGEON_LOAD_G0_SAMPLE_DEADLINE_MS,
  DUNGEON_LOAD_G0_TOOL_SOURCES,
  DUNGEON_LOAD_G0_WORKLOADS,
  createBrowserG0Report,
  createBrowserSampleSpec,
  createBrowserWorkloadReport,
  createDirtyV1,
  createOfflineG0Report,
  createOfflineSampleSpec,
  createOfflineWorkloadReport,
  createPreviewCommand,
  collectToolSourceHashes,
  filterDirtyUntrackedPaths,
  finalizeFailedSampleExit,
  hashCanonicalEntries,
  killKnownPid,
  nearestRankSummary,
  pollArtifactResult,
  renderBrowserMarkdown,
  renderOfflineMarkdown,
  summarizeOfflineWorkload,
  summarizeWorkload,
  validateBrowserSample,
  validateDungeonLoadTrace,
  type OfflineMetrics,
  type DungeonLoadTraceSnapshot,
} from "../scripts/capture-dungeon-load-g0";

function trace(overrides: Partial<DungeonLoadTraceSnapshot> = {}): DungeonLoadTraceSnapshot {
  return {
    schemaVersion: 2,
    loadId: "load-1",
    terminal: "complete",
    terminalDetail: null,
    totalMs: 20,
    generation: { startedAtMs: 0, endedAtMs: 3, durationMs: 3 },
    plan: null,
    sceneCommit: { startedAtMs: 3, endedAtMs: 10, durationMs: 7 },
    actors: null,
    colliderIndex: null,
    texturePolicy: null,
    atmosphere: null,
    editorProjection: null,
    warmup: { startedAtMs: 10, endedAtMs: 17, durationMs: 7 },
    warmupWaitMs: 7,
    warmupWorkMs: 2,
    firstUsableFrame: { atMs: 15 },
    inputReady: { atMs: 17 },
    ...overrides,
  };
}

describe("RDL-02 trace validation", () => {
  test("accepts a complete trace with a null plan", () => {
    const result = validateDungeonLoadTrace(trace(), "load-1");

    expect(result).toEqual({ ok: true, value: trace() });
  });

  test("rejects inconsistent IDs, incomplete terminals, invalid ordering, and missing required spans", () => {
    expect(validateDungeonLoadTrace(trace(), "external-id")).toMatchObject({
      ok: false,
      error: "Trace loadId does not match the external load ID.",
    });
    expect(validateDungeonLoadTrace(trace({ terminal: "timeout" }))).toMatchObject({
      ok: false,
      error: "Trace terminal must be complete.",
    });
    expect(validateDungeonLoadTrace(trace({ inputReady: { atMs: 14 } }))).toMatchObject({
      ok: false,
      error: "Trace inputReady must follow firstUsableFrame.",
    });
    expect(validateDungeonLoadTrace(trace({ generation: null }))).toMatchObject({
      ok: false,
      error: "Trace generation must be present.",
    });
  });

  test("rejects totals that end before milestones or measured spans", () => {
    expect(
      validateDungeonLoadTrace(
        trace({
          totalMs: 18,
          firstUsableFrame: { atMs: 19 },
          inputReady: { atMs: 19 },
        }),
      ),
    ).toMatchObject({ ok: false, error: "Trace totalMs must include firstUsableFrame." });
    expect(validateDungeonLoadTrace(trace({ totalMs: 16 }))).toMatchObject({
      ok: false,
      error: "Trace totalMs must include inputReady.",
    });
    expect(
      validateDungeonLoadTrace(
        trace({
          totalMs: 18,
          generation: { startedAtMs: 0, endedAtMs: 19, durationMs: 19 },
        }),
      ),
    ).toMatchObject({ ok: false, error: "Trace totalMs must include generation.endedAtMs." });
  });
});

describe("RDL-02 nearest-rank aggregation", () => {
  test("uses nearest rank for three values without mutating the input", () => {
    const values = [30, 10, 20];

    expect(nearestRankSummary(values)).toEqual({
      n: 3,
      min: 10,
      max: 30,
      range: 20,
      p50: 20,
      p95: 30,
    });
    expect(values).toEqual([30, 10, 20]);
  });

  test("rejects empty, negative, and non-finite samples", () => {
    expect(() => nearestRankSummary([])).toThrow("empty");
    expect(() => nearestRankSummary([1, -1])).toThrow("finite and non-negative");
    expect(() => nearestRankSummary([Number.NaN])).toThrow("finite and non-negative");
  });
});

describe("RDL-02 fail-closed workload summary", () => {
  test("does not emit a green aggregate for two of three samples or a failed sample", () => {
    const twoOfThree = summarizeWorkload(3, [
      { status: "passed", trace: trace({ loadId: "a" }), expectedLoadId: "a" },
      { status: "passed", trace: trace({ loadId: "b" }), expectedLoadId: "b" },
    ]);
    const withFailure = summarizeWorkload(3, [
      { status: "passed", trace: trace({ loadId: "a" }), expectedLoadId: "a" },
      { status: "failed", trace: trace({ loadId: "b" }), expectedLoadId: "b" },
      { status: "passed", trace: trace({ loadId: "c" }), expectedLoadId: "c" },
    ]);

    expect(twoOfThree).toMatchObject({ passedSamples: 2, verdict: "fail", aggregate: null });
    expect(withFailure).toMatchObject({ passedSamples: 2, verdict: "fail", aggregate: null });
  });

  test("aggregates only three valid passed traces and keeps null spans null", () => {
    const summary = summarizeWorkload(3, [
      { status: "passed", trace: trace({ loadId: "a", totalMs: 30 }), expectedLoadId: "a" },
      { status: "passed", trace: trace({ loadId: "b", totalMs: 18 }), expectedLoadId: "b" },
      { status: "passed", trace: trace({ loadId: "c", totalMs: 20 }), expectedLoadId: "c" },
    ]);

    expect(summary.verdict).toBe("pass");
    expect(summary.aggregate?.totalMs).toMatchObject({ p50: 20, p95: 30, range: 12 });
    expect(summary.aggregate?.spans.plan).toBeNull();
  });
});

describe("RDL-02 canonical hashing", () => {
  test("is stable for inverted input and sensitive to paths and bytes", () => {
    const first = [
      { path: "b.bin", bytes: new Uint8Array([2]) },
      { path: "a.bin", bytes: new Uint8Array([1]) },
    ];
    const inverted = [...first].reverse();

    expect(hashCanonicalEntries(first)).toBe(hashCanonicalEntries(inverted));
    expect(hashCanonicalEntries(first)).not.toBe(
      hashCanonicalEntries([
        { path: "c.bin", bytes: new Uint8Array([1]) },
        { path: "b.bin", bytes: new Uint8Array([2]) },
      ]),
    );
    expect(hashCanonicalEntries(first)).not.toBe(
      hashCanonicalEntries([
        { path: "a.bin", bytes: new Uint8Array([9]) },
        { path: "b.bin", bytes: new Uint8Array([2]) },
      ]),
    );
  });

  test("uses binary framing so entry boundaries cannot collide", () => {
    const oneEntry = [{ path: "a", bytes: new TextEncoder().encode("b\0c") }];
    const twoEntries = [
      { path: "a", bytes: new Uint8Array() },
      { path: "b", bytes: new TextEncoder().encode("c") },
    ];

    expect(hashCanonicalEntries(oneEntry)).not.toBe(hashCanonicalEntries(twoEntries));
    expect(hashCanonicalEntries(twoEntries)).toBe(hashCanonicalEntries([...twoEntries].reverse()));
  });
});

describe("RDL-02 workloads", () => {
  test("pins the approved Backrooms and Frost configurations", () => {
    expect(DUNGEON_LOAD_G0_WORKLOADS).toEqual([
      expect.objectContaining({
        id: "backrooms",
        biome: "backrooms",
        mood: "backrooms",
        seed: "LOAD-PIPELINE-BACKROOMS-4",
        floors: 4,
        expectedSamples: 3,
        crt: "off",
        perfAudit: true,
        skipRunIntro: true,
      }),
      expect.objectContaining({
        id: "frost",
        biome: "frost",
        mood: "frost",
        seed: "vfx-audit-2026-08-01",
        floors: 1,
        expectedSamples: 3,
        crt: "off",
        perfAudit: true,
        skipRunIntro: true,
      }),
    ]);
    for (const workload of DUNGEON_LOAD_G0_WORKLOADS) {
      expect(workload.viewport).toEqual({ width: 1600, height: 900, dpr: 1 });
    }
  });
});

const backrooms = DUNGEON_LOAD_G0_WORKLOADS[0]!;

function offlineMetrics(
  generationMs = 10,
  worldBuildMs = 20,
  hotSamples: readonly number[] = [3, 1, 2, 5, 4],
): OfflineMetrics {
  return {
    cold: { generationMs, worldBuildMs },
    hotRebuildMs: { samples: hotSamples, ...nearestRankSummary(hotSamples) },
    cardinality: {
      objects: 100,
      meshes: 80,
      instancedMeshes: 10,
      lights: 4,
      colliders: 40,
      pickups: 8,
      chests: 3,
      doors: 9,
      staircases: 3,
    },
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

describe("RDL-02 provenance", () => {
  test("makes dirty-v1 stable by order, sensitive to bytes, and excludes only G0 artifacts", () => {
    const tracked = new TextEncoder().encode("diff --git a/a b/a\n");
    const entries = [
      { path: "new/b.ts", bytes: new Uint8Array([2]) },
      { path: "new/a.ts", bytes: new Uint8Array([1]) },
    ];
    const first = createDirtyV1(tracked, entries);
    const inverted = createDirtyV1(tracked, [...entries].reverse());
    const changed = createDirtyV1(new TextEncoder().encode("diff --git a/b b/b\n"), entries);

    expect(first).toMatchObject({ schema: "dirty-v1", dirty: true, untrackedCount: 2 });
    expect(first.dirtyHash).toBe(inverted.dirtyHash);
    expect(first.dirtyHash).not.toBe(changed.dirtyHash);
    expect(
      filterDirtyUntrackedPaths([
        `${DUNGEON_LOAD_G0_ARTIFACT_ROOT}/run/result.json`,
        ".scratch/resident-dungeon-load/g0-other/result.json",
        "scripts/new-tool.ts",
      ]),
    ).toEqual([".scratch/resident-dungeon-load/g0-other/result.json", "scripts/new-tool.ts"]);
  });

  test("hashes all tool sources, including the ignored offline profiler", async () => {
    const sources = await collectToolSourceHashes(process.cwd());

    expect(sources.map((source) => source.path)).toEqual([...DUNGEON_LOAD_G0_TOOL_SOURCES]);
    expect(sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256))).toBe(true);
    expect(sources[0]?.path).toBe(".scratch/profile-dungeon-pipeline.ts");
  });
});

describe("RDL-02 specs and result contracts", () => {
  test("creates exact browser and offline environments without QA_STATE and with unique sample IDs", () => {
    const runRoot = `${process.cwd()}\\.scratch\\g0-test-run`;
    const inherited = {
      QA_STATE: "critical",
      DUNGEON_LOAD_G0_RESULT_PATH: "stale",
      KEEP_ME: "yes",
    };
    const browser = createBrowserSampleSpec(
      runRoot,
      backrooms,
      1,
      "http://127.0.0.1:43123/",
      inherited,
    );
    const offline = createOfflineSampleSpec(runRoot, backrooms, 1, inherited);

    expect(browser.sampleId).toBe("browser-backrooms-01");
    expect(offline.sampleId).toBe("offline-backrooms-01");
    expect(browser.sampleId).not.toBe(offline.sampleId);
    expect(browser.command).toEqual([
      "bun",
      "run",
      "scripts/cdp-photo.ts",
      "LOAD-PIPELINE-BACKROOMS-4",
      browser.sampleDirectory,
    ]);
    expect(browser.environment).toMatchObject({
      PHOTO_BASE_URL: "http://127.0.0.1:43123",
      BIOME: "backrooms",
      MOOD: "backrooms",
      CRT: "off",
      PHOTO_SIMULATION: "off",
      PERF_SECONDS: "0",
      CDP_COMMAND_TIMEOUT_MS: "80000",
      DUNGEON_LOAD_G0_SAMPLE_ID: "browser-backrooms-01",
      DUNGEON_LOAD_G0_WORKLOAD: "backrooms",
      KEEP_ME: "yes",
    });
    expect(browser.environment.QA_STATE).toBeUndefined();
    expect(offline.command).toEqual(["bun", "run", ".scratch/profile-dungeon-pipeline.ts"]);
    expect(offline.environment).toMatchObject({
      DUNGEON_LOAD_G0_SAMPLE_ID: "offline-backrooms-01",
      DUNGEON_LOAD_G0_WORKLOAD: "backrooms",
      DUNGEON_LOAD_G0_SEED: "LOAD-PIPELINE-BACKROOMS-4",
      DUNGEON_LOAD_G0_FLOORS: "4",
      DUNGEON_LOAD_G0_RESULT_PATH: offline.resultPath,
    });
    expect(offline.environment.QA_STATE).toBeUndefined();
  });

  test("keeps the G0 CDP command timeout inside the sample deadline", async () => {
    const source = await Bun.file(
      new URL("../scripts/capture-dungeon-load-g0.ts", import.meta.url),
    ).text();

    expect(DUNGEON_LOAD_G0_SAMPLE_DEADLINE_MS).toBe(90_000);
    expect(DUNGEON_LOAD_G0_CDP_COMMAND_TIMEOUT_MS).toBe(80_000);
    expect(DUNGEON_LOAD_G0_CDP_COMMAND_TIMEOUT_MS).toBeLessThan(DUNGEON_LOAD_G0_SAMPLE_DEADLINE_MS);
    expect(source).toContain(
      "CDP_COMMAND_TIMEOUT_MS: String(DUNGEON_LOAD_G0_CDP_COMMAND_TIMEOUT_MS)",
    );
    expect(source).not.toContain('CDP_COMMAND_TIMEOUT_MS: "15000"');
    expect(source.match(/deadlineMs: DUNGEON_LOAD_G0_SAMPLE_DEADLINE_MS/g)).toHaveLength(2);
  });

  test("accepts a browser null floor count but rejects a reported mismatch", () => {
    const result = {
      schema: "dungeon-load-g0-browser-sample/v1",
      sampleId: "browser-backrooms-01",
      workload: "backrooms",
      status: "passed",
      dataset: { dungeonLoadId: "load-1" },
      trace: trace(),
      browserErrors: [],
      networkErrors: [],
      cleanup: { chromeExited: true },
      floorCount: null,
    };

    expect(
      validateBrowserSample(result, { sampleId: "browser-backrooms-01", workload: backrooms }),
    ).toEqual(trace());
    expect(() =>
      validateBrowserSample(
        { ...result, floorCount: 1 },
        { sampleId: "browser-backrooms-01", workload: backrooms },
      ),
    ).toThrow("floor count");
  });
});

describe("RDL-02 offline aggregation", () => {
  test("does not emit a green aggregate for two of three samples or a failure", () => {
    const twoOfThree = summarizeOfflineWorkload(3, [
      { status: "passed", metrics: offlineMetrics() },
      { status: "passed", metrics: offlineMetrics(11, 21) },
    ]);
    const withFailure = summarizeOfflineWorkload(3, [
      { status: "passed", metrics: offlineMetrics() },
      { status: "failed", metrics: null },
      { status: "passed", metrics: offlineMetrics(11, 21) },
    ]);

    expect(twoOfThree).toMatchObject({ passedSamples: 2, verdict: "fail", aggregate: null });
    expect(withFailure).toMatchObject({ passedSamples: 2, verdict: "fail", aggregate: null });
  });

  test("aggregates exactly three valid offline samples", () => {
    const summary = summarizeOfflineWorkload(3, [
      { status: "passed", metrics: offlineMetrics(30, 60, [30, 10, 20]) },
      { status: "passed", metrics: offlineMetrics(10, 20, [10, 20, 30]) },
      { status: "passed", metrics: offlineMetrics(20, 40, [20, 30, 10]) },
    ]);

    expect(summary).toMatchObject({ expectedSamples: 3, passedSamples: 3, verdict: "pass" });
    expect(summary.aggregate?.generationMs).toMatchObject({ p50: 20, p95: 30 });
    expect(summary.aggregate?.worldBuildMs).toMatchObject({ p50: 40, p95: 60 });
    expect(summary.aggregate?.hotRebuildMs).toMatchObject({ p50: 20, p95: 30 });
  });
});

describe("RDL-02 polling and cleanup seams", () => {
  test("returns a result through an injected clock and reader", async () => {
    let now = 0;
    let reads = 0;
    const result = await pollArtifactResult({
      deadlineMs: 10,
      intervalMs: 5,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
      readResult: async () => (reads++ === 1 ? { ready: true } : null),
      cleanup: async () => {
        throw new Error("cleanup must not run");
      },
    });

    expect(result).toEqual({ status: "result", value: { ready: true } });
  });

  test("reports timeout and cleanup failure without a real process", async () => {
    let now = 0;
    const timeout = await pollArtifactResult({
      deadlineMs: 10,
      intervalMs: 5,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
      readResult: async () => null,
      cleanup: async () => undefined,
    });
    const cleanupFailure = await pollArtifactResult({
      deadlineMs: 0,
      now: () => 0,
      readResult: async () => null,
      cleanup: async () => {
        throw new Error("still alive");
      },
    });

    expect(timeout).toEqual({ status: "timed_out", error: null });
    expect(cleanupFailure).toEqual({ status: "cleanup_failed", error: "still alive" });
  });

  test("does not turn a Windows taskkill race into cleanup_failed after the PID exits", async () => {
    let livenessChecks = 0;
    const commands: string[][] = [];
    await killKnownPid(41234, process.cwd(), {
      platform: "win32",
      isAlive: () => livenessChecks++ === 0,
      runner: async (command) => {
        commands.push([...command]);
        return { exitCode: 128, stdout: new Uint8Array(), stderr: new Uint8Array([1]) };
      },
    });

    expect(commands).toEqual([["taskkill", "/PID", "41234", "/T", "/F"]]);
  });

  test("cleans child, started, and result PIDs before classifying a non-zero exit", async () => {
    let cleaned: readonly number[] = [];
    const failed = await finalizeFailedSampleExit({
      exitCode: 7,
      childPid: 41001,
      started: { bunPid: 41001, chromePid: 41002 },
      result: { pids: { bun: 41001, chrome: 41003 } },
      cleanup: async (pids) => {
        cleaned = pids;
      },
    });
    const cleanupFailed = await finalizeFailedSampleExit({
      exitCode: 7,
      childPid: 41001,
      started: { chromePid: 41002 },
      result: { pids: { chrome: 41003 } },
      cleanup: async () => {
        throw new Error("PID 41003 is still alive");
      },
    });

    expect(cleaned).toEqual([41001, 41002, 41003]);
    expect(failed).toMatchObject({
      status: "failed",
      error: "The sample Bun process exited with 7.",
      cleanupComplete: true,
    });
    expect(cleanupFailed).toMatchObject({
      status: "cleanup_failed",
      error: "PID 41003 is still alive",
      cleanupComplete: false,
    });
  });

  test("preserves a declared timeout after cleanup and lets a real cleanup failure prevail", async () => {
    const declaredTimeout = {
      status: "timed_out",
      error: "CDP command Runtime.evaluate timed out during renderer-ready after 80000 ms.",
      failurePhase: "renderer-ready",
      pids: { bun: 42001, chrome: 42002 },
    };
    let cleaned: readonly number[] = [];
    const preserved = await finalizeFailedSampleExit({
      exitCode: 1,
      childPid: 42001,
      started: null,
      result: declaredTimeout,
      cleanup: async (pids) => {
        cleaned = pids;
      },
    });
    const cleanupOverride = await finalizeFailedSampleExit({
      exitCode: 1,
      childPid: 42001,
      started: null,
      result: declaredTimeout,
      cleanup: async () => {
        throw new Error("Chrome PID 42002 survived cleanup");
      },
    });

    expect(cleaned).toEqual([42001, 42002]);
    expect(preserved).toEqual({
      status: "timed_out",
      error: declaredTimeout.error,
      value: declaredTimeout,
      cleanupComplete: true,
    });
    expect(preserved.value).toMatchObject({ failurePhase: "renderer-ready" });
    expect(cleanupOverride).toMatchObject({
      status: "cleanup_failed",
      error: "Chrome PID 42002 survived cleanup",
      cleanupComplete: false,
    });
  });
});

describe("RDL-02 reports and entrypoint", () => {
  test("owns preview through one direct Node process without a package wrapper", async () => {
    const port = 43_123;
    const viteEntrypoint = resolve(process.cwd(), "node_modules", "vite", "bin", "vite.js");
    const command = createPreviewCommand(process.cwd(), port);
    const source = await Bun.file(
      new URL("../scripts/capture-dungeon-load-g0.ts", import.meta.url),
    ).text();
    const previewStart = source.indexOf("const previewCommand = createPreviewCommand");
    const previewEnd = source.indexOf("await waitForPreview", previewStart);
    const previewOwnership = source.slice(previewStart, previewEnd);

    expect(command).toEqual([
      "node",
      viteEntrypoint,
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ]);
    expect(command).not.toContain("bun");
    expect(command).not.toContain("x");
    expect(command.filter((argument) => argument === viteEntrypoint)).toHaveLength(1);
    expect(previewOwnership.match(/preview\s*=\s*spawnManagedProcess\(/g)).toHaveLength(1);
    expect(previewOwnership).toContain("previewCommand,");
  });

  test("rejects invalid preview ports", () => {
    for (const port of [0, 65_536, 1.5]) {
      expect(() => createPreviewCommand(process.cwd(), port)).toThrow(
        "Preview port must be an integer between 1 and 65535",
      );
    }
  });

  test("marks partial browser and offline reports as failures in JSON and Markdown", () => {
    const browserWorkload = createBrowserWorkloadReport(backrooms, [
      {
        sampleId: "browser-backrooms-01",
        ref: "a/result.json",
        status: "passed",
        error: null,
        trace: trace(),
        expectedLoadId: "load-1",
      },
      {
        sampleId: "browser-backrooms-02",
        ref: "b/result.json",
        status: "passed",
        error: null,
        trace: trace(),
        expectedLoadId: "load-1",
      },
    ]);
    const offlineWorkload = createOfflineWorkloadReport(backrooms, [
      {
        sampleId: "offline-backrooms-01",
        ref: "a/result.json",
        status: "passed",
        error: null,
        metrics: offlineMetrics(),
      },
      {
        sampleId: "offline-backrooms-02",
        ref: "b/result.json",
        status: "passed",
        error: null,
        metrics: offlineMetrics(),
      },
    ]);
    const browserReport = createBrowserG0Report([browserWorkload]);
    const offlineReport = createOfflineG0Report([offlineWorkload]);
    const identity = { runId: "run", head: "head", buildHash: "build" };

    expect(browserReport).toMatchObject({ verdict: "fail", percentileMethod: "nearest-rank-v1" });
    expect(offlineReport).toMatchObject({ verdict: "fail", percentileMethod: "nearest-rank-v1" });
    expect(renderBrowserMarkdown(browserReport, identity)).toContain(
      "Partial or failed samples are not an accepted baseline.",
    );
    expect(renderOfflineMarkdown(offlineReport, identity)).toContain(
      "Partial or failed samples are not an accepted baseline.",
    );
  });

  test("imports without a build and exposes the exact package command", async () => {
    const packageJson = JSON.parse(await Bun.file(`${process.cwd()}/package.json`).text()) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["profile:resident-load:g0"]).toBe(
      "bun run scripts/capture-dungeon-load-g0.ts",
    );
  });
});
