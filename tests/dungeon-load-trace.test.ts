import { describe, expect, test } from "bun:test";

import {
  DungeonLoadTrace,
  DungeonLoadTraceController,
  type DungeonLoadPhaseObserver,
} from "../src/systems/DungeonLoadTrace";
import {
  PlayRuntime,
  type PlayWorldLoadOptions,
  type PlayWorldPort,
  type PlayWorldUpdate,
} from "../src/game/PlayRuntime";
import {
  RunIntroDirector,
  type RunIntroPort,
  type RunIntroRequest,
} from "../src/game/RunIntroDirector";

type TestDungeon = { id: string };
type TestMood = { id: string };
type TestPlayer = { x: number; z: number };

class TraceAwareWorld implements PlayWorldPort<TestDungeon, TestMood, TestPlayer, PlayWorldUpdate> {
  seenTrace: DungeonLoadPhaseObserver | undefined;

  constructor(private readonly advance: (milliseconds: number) => void) {}

  setDungeon(
    _dungeon: TestDungeon,
    _mood: TestMood,
    options?: PlayWorldLoadOptions<TestDungeon>,
  ): void {
    this.seenTrace = options?.loadTrace;
    this.seenTrace?.begin("sceneCommit");
    this.advance(4);
    this.seenTrace?.end("sceneCommit");
    this.seenTrace?.begin("colliderIndex");
    this.advance(2);
    this.seenTrace?.end("colliderIndex");
    this.seenTrace?.begin("actors");
    this.advance(3);
    this.seenTrace?.end("actors");
  }

  update(): never {
    throw new Error("The load trace test does not step play.");
  }

  restoreSession(): void {}

  restoreRuntimeProgress(): void {}

  dispose(): void {}
}

function cancellableIntroRequest(): RunIntroRequest {
  return {
    seed: "INTRO-REBUILD",
    themeKey: "ancient",
    refreshProcedural: false,
    skip: false,
    reducedMotion: false,
  };
}

describe("DungeonLoadTrace", () => {
  test("forwards world observation and completes only after warmup's first usable frame", () => {
    let now = 10;
    const trace = new DungeonLoadTrace({ clock: () => now, loadId: "load-order" });
    const world = new TraceAwareWorld((milliseconds) => {
      now += milliseconds;
    });
    const runtime = new PlayRuntime<TestDungeon, TestMood, TestPlayer, PlayWorldUpdate>(world);

    runtime.load({
      dungeon: { id: "dungeon" },
      mood: { id: "mood" },
      loadTrace: trace,
    });

    expect(world.seenTrace).toBe(trace);
    now += 5;
    trace.begin("warmup");
    now += 7;
    expect(trace.markFirstUsableFrame()).toBe(true);
    now += 2;
    trace.end("warmup");
    now += 1;
    expect(trace.markInputReady()).toBe(true);
    const snapshot = trace.finish("complete");

    expect(snapshot).toMatchObject({
      schemaVersion: 2,
      loadId: "load-order",
      terminal: "complete",
      generation: null,
      plan: null,
      texturePolicy: null,
      atmosphere: null,
      editorProjection: null,
      sceneCommit: { durationMs: 4 },
      colliderIndex: { durationMs: 2 },
      actors: { durationMs: 3 },
      warmup: { durationMs: 9 },
      warmupWaitMs: 9,
      warmupWorkMs: null,
      firstUsableFrame: { atMs: 21 },
      inputReady: { atMs: 24 },
    });
    expect(snapshot?.inputReady?.atMs).toBeGreaterThan(snapshot?.firstUsableFrame?.atMs ?? 0);
    expect(snapshot?.inputReady?.atMs).toBeGreaterThan(snapshot?.warmup?.endedAtMs ?? 0);
  });

  test("records warmup work separately from the wait span", () => {
    let now = 0;
    const trace = new DungeonLoadTrace({ clock: () => now, loadId: "warmup-work" });
    trace.begin("warmup");
    now = 5;
    expect(trace.recordWarmupWorkMs(12.4)).toBe(true);
    expect(trace.recordWarmupWorkMs(99)).toBe(false);
    expect(trace.markFirstUsableFrame()).toBe(true);
    now = 20;
    trace.end("warmup");
    now = 21;
    expect(trace.markInputReady()).toBe(true);
    expect(trace.finish("complete")).toMatchObject({
      schemaVersion: 2,
      warmup: { durationMs: 20 },
      warmupWaitMs: 20,
      warmupWorkMs: 12.4,
    });
  });

  test("accepts a first frame only inside warmup and completes only after its input handoff", () => {
    let now = 0;
    const invalid = new DungeonLoadTrace({ clock: () => now, loadId: "invalid-warmup-order" });

    expect(invalid.markFirstUsableFrame()).toBe(false);
    expect(invalid.isPhaseOpen("warmup")).toBe(false);
    invalid.begin("warmup");
    expect(invalid.isPhaseOpen("warmup")).toBe(true);
    now = 4;
    invalid.end("warmup");
    now = 5;
    expect(invalid.markFirstUsableFrame()).toBe(false);
    expect(invalid.markInputReady()).toBe(false);
    expect(invalid.finish("complete")).toBeNull();
    expect(invalid.isOpen).toBe(true);

    const valid = new DungeonLoadTrace({ clock: () => now, loadId: "valid-warmup-order" });
    valid.begin("warmup");
    now = 8;
    expect(valid.markFirstUsableFrame()).toBe(true);
    now = 10;
    valid.end("warmup");
    now = 12;
    expect(valid.markInputReady()).toBe(true);
    expect(valid.finish("complete")).toMatchObject({
      terminal: "complete",
      warmup: { startedAtMs: 0, endedAtMs: 5 },
      firstUsableFrame: { atMs: 3 },
      inputReady: { atMs: 7 },
    });
  });

  test("keeps missing phases null and has only the declared terminal outcomes", () => {
    let now = 0;
    const errorTrace = new DungeonLoadTrace({ clock: () => now, loadId: "load-error" });
    errorTrace.begin("generation");
    now = 6;
    const error = errorTrace.finish("error", "generation failed");

    expect(error).toMatchObject({
      terminal: "error",
      terminalDetail: "generation failed",
      generation: { durationMs: 6 },
      plan: null,
      sceneCommit: null,
      warmup: null,
      firstUsableFrame: null,
      inputReady: null,
    });

    const timeoutTrace = new DungeonLoadTrace({ clock: () => now, loadId: "load-timeout" });
    timeoutTrace.begin("warmup");
    now = 13;
    expect(timeoutTrace.finish("timeout")?.terminal).toBe("timeout");

    const incompleteTrace = new DungeonLoadTrace({ clock: () => now, loadId: "load-incomplete" });
    expect(incompleteTrace.finish("complete")).toBeNull();
    expect(incompleteTrace.markInputReady()).toBe(false);
    expect(incompleteTrace.isOpen).toBe(true);
  });

  test("supersedes the previous trace without letting it finish as the active load", () => {
    let now = 0;
    let sequence = 0;
    const controller = new DungeonLoadTraceController({
      clock: () => now,
      createLoadId: () => `replacement-${++sequence}`,
    });
    const first = controller.open().trace;
    first.begin("generation");
    now = 8;
    const replacement = controller.open();

    expect(replacement.superseded).toMatchObject({
      loadId: "replacement-1",
      terminal: "superseded",
      generation: { durationMs: 8 },
    });
    expect(controller.isActive(first)).toBe(false);
    expect(first.begin("warmup")).toBe(false);
    expect(controller.finish(first, "error")).toBeNull();
    expect(controller.active()).toBe(replacement.trace);
  });

  test("does not let a stale warmup owner complete or publish its replacement", () => {
    let now = 0;
    let sequence = 0;
    const controller = new DungeonLoadTraceController({
      clock: () => now,
      createLoadId: () => `owner-${++sequence}`,
    });
    const published: string[] = [];
    const publishIfComplete = (trace: DungeonLoadTrace): void => {
      const snapshot = controller.complete(trace);
      if (snapshot) published.push(snapshot.loadId);
    };

    const first = controller.open().trace;
    first.begin("warmup");
    now = 2;
    expect(first.markFirstUsableFrame()).toBe(true);
    now = 3;
    first.end("warmup");

    const second = controller.open().trace;
    second.begin("warmup");
    now = 5;
    expect(second.markFirstUsableFrame()).toBe(true);
    now = 6;
    second.end("warmup");

    publishIfComplete(first);
    expect(published).toEqual([]);
    expect(controller.active()).toBe(second);
    expect(second.isOpen).toBe(true);

    now = 7;
    publishIfComplete(second);
    expect(published).toEqual(["owner-2"]);
  });

  test("cancels an active intro without running the direct rebuild callback", async () => {
    let now = 0;
    let sequence = 0;
    let waitingForIntroFrame = false;
    let rebuildCallbackExecuted = false;
    const published: Array<{ loadId: string; terminal: string }> = [];
    const controller = new DungeonLoadTraceController({
      clock: () => now,
      createLoadId: () => `intro-rebuild-${++sequence}`,
    });
    const introTrace = controller.open().trace;
    const port: RunIntroPort = {
      prepare() {},
      refreshProcedural() {},
      fade() {
        return Promise.resolve();
      },
      clearLoader() {},
      enterTheater() {},
      setTheaterStatus() {},
      leaveTheater() {},
      waitFrames(_count, signal) {
        waitingForIntroFrame = true;
        return new Promise((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      },
      waitDelay() {
        return Promise.resolve();
      },
      buildWorld() {
        return Promise.resolve({ ok: false, message: "cancelled" });
      },
      waitForWorldReady() {
        return Promise.resolve("degraded");
      },
      startPresentation() {
        return Promise.resolve({ ok: false, reason: "aborted" });
      },
      activatePlayMode() {},
      restorePlayInputAndFocus() {
        return Promise.resolve();
      },
      recoverToWelcome() {},
      resetIntro(destination) {
        const snapshot = controller.finish(
          introTrace,
          destination === "superseded" ? "superseded" : "error",
        );
        if (snapshot) published.push(snapshot);
      },
    };
    const director = new RunIntroDirector(port);
    const running = director.start(cancellableIntroRequest());

    for (let attempt = 0; attempt < 20 && !waitingForIntroFrame; attempt += 1) {
      await Promise.resolve();
    }
    expect(waitingForIntroFrame).toBe(true);

    const runDirectRebuild = (): DungeonLoadTrace | null => {
      if (director.cancel()) return null;
      rebuildCallbackExecuted = true;
      return controller.open().trace;
    };

    expect(runDirectRebuild()).toBeNull();
    expect(await running).toMatchObject({ kind: "cancelled", reason: "cancelled" });
    expect(controller.finish(introTrace, "error")).toBeNull();
    expect(rebuildCallbackExecuted).toBe(false);
    expect(sequence).toBe(1);
    expect(controller.active()).toBeNull();
    expect(published).toMatchObject([{ loadId: "intro-rebuild-1", terminal: "error" }]);

    const normalTrace = runDirectRebuild();
    expect(normalTrace).not.toBeNull();
    expect(rebuildCallbackExecuted).toBe(true);
    normalTrace!.begin("warmup");
    now = 2;
    expect(normalTrace!.markFirstUsableFrame()).toBe(true);
    now = 3;
    normalTrace!.end("warmup");
    now = 4;
    const normalSnapshot = controller.complete(normalTrace!);
    if (normalSnapshot) published.push(normalSnapshot);

    expect(normalSnapshot).toMatchObject({ loadId: "intro-rebuild-2", terminal: "complete" });
    expect(published).toMatchObject([
      { loadId: "intro-rebuild-1", terminal: "error" },
      { loadId: "intro-rebuild-2", terminal: "complete" },
    ]);
  });

  test("wires draw, warmup completion, and input in that order in the browser host", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const warmupStart = source.indexOf("function startRendererWarmup");
    const warmupEnd = source.indexOf("function clearObjectiveBannerTimers", warmupStart);
    const warmup = source.slice(warmupStart, warmupEnd);
    const readyStart = source.indexOf("function markRendererWarmupReady");
    const readyEnd = source.indexOf("function startRendererWarmup", readyStart);
    const ready = source.slice(readyStart, readyEnd);
    const waiterStart = source.indexOf("async function waitForRendererWarmup");
    const waiterEnd = source.indexOf("async function dismissBootScreen", waiterStart);
    const waiter = source.slice(waiterStart, waiterEnd);
    const inputStart = source.indexOf("function markDungeonLoadInputReady");
    const inputEnd = source.indexOf("function markCurrentRendererWarmupInputReady", inputStart);
    const input = source.slice(inputStart, inputEnd);
    const introStart = source.indexOf("const runIntroDirector = new RunIntroDirector");
    const introEnd = source.indexOf("/**\n * Campaign New Game", introStart);
    const intro = source.slice(introStart, introEnd);
    const startPlay = source.slice(
      source.indexOf("function startPlayWithSeed"),
      source.indexOf("let currentSelectedPortraitIndex"),
    );
    const forge = source.slice(
      source.indexOf("function applyForgeDungeon"),
      source.indexOf("function selectEditorSpawn"),
    );
    const spawn = source.slice(
      source.indexOf("function selectEditorSpawn"),
      source.indexOf("function setEngineMode", source.indexOf("function selectEditorSpawn")),
    );
    const rebuild = source.slice(
      source.indexOf("async function rebuildDungeonCovered"),
      source.indexOf("function restartCurrentMap"),
    );
    const directBuild = source.slice(
      source.indexOf("async function buildDungeon"),
      source.indexOf("function setEditorSurface", source.indexOf("async function buildDungeon")),
    );

    expect(warmup.indexOf("povPost.render(renderer, scene, camera);")).toBeGreaterThan(-1);
    expect(warmup.indexOf("trace?.markFirstUsableFrame();")).toBeGreaterThan(
      warmup.indexOf("povPost.render(renderer, scene, camera);"),
    );
    expect(warmup.indexOf("trace?.recordWarmupWorkMs(roundedWarmupWorkMs);")).toBeGreaterThan(
      warmup.indexOf("trace?.markFirstUsableFrame();"),
    );
    expect(warmup.lastIndexOf("markRendererWarmupReady(")).toBeGreaterThan(
      warmup.indexOf("trace?.recordWarmupWorkMs(roundedWarmupWorkMs);"),
    );
    const firstRafStart = warmup.indexOf("window.requestAnimationFrame(() =>");
    expect(firstRafStart).toBeGreaterThan(-1);
    const staleWarmupStart = warmup.indexOf(
      "if (!isCurrentRendererWarmup(sequence, trace))",
      firstRafStart,
    );
    const currentWarmupStart = warmup.indexOf("let warmupError: unknown = null;", staleWarmupStart);
    expect(staleWarmupStart).toBeGreaterThan(firstRafStart);
    expect(currentWarmupStart).toBeGreaterThan(staleWarmupStart);
    expect(warmup.slice(staleWarmupStart, currentWarmupStart)).not.toContain(
      "setPickupEffectsWarmupVisible(false)",
    );
    expect(ready.indexOf('trace?.end("warmup");')).toBeGreaterThan(-1);
    expect(ready.indexOf("controller.setEnabled(inputEnabled);")).toBeGreaterThan(
      ready.indexOf('trace?.end("warmup");'),
    );
    expect(ready.indexOf("markDungeonLoadInputReady(trace);")).toBeGreaterThan(
      ready.indexOf("controller.setEnabled(inputEnabled);"),
    );
    expect(input).not.toContain("dungeonLoadTraces.active()");
    expect(waiter).toContain("const expectedSequence = renderWarmupSequence;");
    expect(waiter).toContain("const expectedTrace = rendererWarmupTrace;");
    expect(waiter).toContain("expectedSequence === renderWarmupSequence");
    expect(waiter).toContain("expectedSequence !== renderWarmupSequence");
    expect(waiter).toContain("expectedTrace,");
    expect(waiter).not.toContain("dungeonLoadTraces.active()");
    expect(startPlay.indexOf("const trace = openDungeonLoadTrace();")).toBeGreaterThan(-1);
    expect(startPlay.indexOf("const trace = openDungeonLoadTrace();")).toBeLessThan(
      startPlay.indexOf("return runIntroDirector.start(request)"),
    );
    expect(intro).toContain("const trace = activeRunIntroTrace;");
    expect(intro).toContain("await buildDungeon(seed, {}, trace);");
    expect(forge).toContain("const trace = openDungeonLoadTrace();");
    expect(forge).toContain('finishDungeonLoadTrace(trace, "error", message);');
    expect(spawn.indexOf("supersedeActiveDungeonLoadTrace(")).toBeLessThan(
      spawn.indexOf("const warmupSequence = beginRendererWarmup();"),
    );
    expect(rebuild.indexOf("if (cancelRunIntroBeforeDirectDungeonBuild()) return;")).toBeLessThan(
      rebuild.indexOf("await setSceneFadeOpaque(true"),
    );
    expect(
      directBuild.indexOf(
        "if (cancelRunIntroBeforeDirectDungeonBuild(trace)) return getRuntimeState();",
      ),
    ).toBeLessThan(directBuild.indexOf("const loadTrace = trace ?? openDungeonLoadTrace();"));
  });
});
