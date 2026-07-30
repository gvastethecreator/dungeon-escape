import { describe, expect, test } from "bun:test";

import { generateCompletableDungeon } from "../src/dungeon/completeness";
import type {
  ForgeAnimationResult,
  ForgePresentationSession,
  ForgePresentationStartResult,
} from "../src/forge/ForgeFrameClient";
import type { ForgePresentationInput } from "../src/forge/ForgeFrameProtocol";
import {
  RunIntroDirector,
  type RunIntroBuildResult,
  type RunIntroPort,
  type RunIntroRequest,
  type RunIntroWarmup,
} from "../src/game/RunIntroDirector";

const TEST_DUNGEON = generateCompletableDungeon("INTRO-DIRECTOR");

function request(overrides: Partial<RunIntroRequest> = {}): RunIntroRequest {
  return {
    seed: "INTRO-DIRECTOR",
    runSource: "campaign",
    themeKey: "ancient",
    refreshProcedural: false,
    skip: false,
    reducedMotion: false,
    ...overrides,
  };
}

class FakePresentationSession implements ForgePresentationSession {
  readonly completion: Promise<ForgeAnimationResult>;
  stopCount = 0;
  readonly #finish: (result: ForgeAnimationResult) => void;

  constructor(autoComplete = true) {
    let finish = (_result: ForgeAnimationResult): void => undefined;
    this.completion = new Promise((resolve) => {
      finish = resolve;
    });
    this.#finish = finish;
    if (autoComplete) queueMicrotask(() => finish("completed"));
  }

  stop(): void {
    this.stopCount += 1;
    this.#finish("cancelled");
  }
}

class FakeRunIntroPort implements RunIntroPort {
  readonly events: string[] = [];
  buildResult: RunIntroBuildResult = { ok: true, dungeon: TEST_DUNGEON };
  warmup: RunIntroWarmup = "ready";
  presentationReason: Extract<ForgePresentationStartResult, { ok: false }>["reason"] | null = null;
  autoCompletePresentation = true;
  blockFramesOnce = false;
  blockRestoreOnce = false;
  presentationError: Error | null = null;
  restoreCount = 0;
  lastPresentation: ForgePresentationInput | null = null;
  lastSession: FakePresentationSession | null = null;

  prepare(input: RunIntroRequest): void {
    this.events.push(`prepare:${input.seed}`);
  }

  refreshProcedural(): void {
    this.events.push("refresh");
  }

  fade(
    target: "opaque" | "clear",
    options: { readonly instant?: boolean; readonly durationMs?: number },
    signal: AbortSignal,
  ): Promise<void> {
    this.events.push(`fade:${target}:${Boolean(options.instant)}:${options.durationMs ?? 0}`);
    return abortableResolution(signal);
  }

  enterTheater(): void {
    this.events.push("theater:forging");
  }

  setTheaterStatus(): void {
    this.events.push("theater:entering-play");
  }

  leaveTheater(): void {
    this.events.push("theater:off");
  }

  waitFrames(count: number, signal: AbortSignal): Promise<void> {
    this.events.push(`frames:${count}`);
    if (this.blockFramesOnce) {
      this.blockFramesOnce = false;
      return waitForAbort(signal);
    }
    return abortableResolution(signal);
  }

  waitDelay(durationMs: number, signal: AbortSignal): Promise<void> {
    this.events.push(`delay:${durationMs}`);
    return abortableResolution(signal);
  }

  buildWorld(seed: string, signal: AbortSignal): Promise<RunIntroBuildResult> {
    this.events.push(`build:${seed}`);
    if (signal.aborted) return Promise.resolve({ ok: false, message: "cancelled" });
    return Promise.resolve(this.buildResult);
  }

  waitForWorldReady(timeoutMs: number, signal: AbortSignal): Promise<RunIntroWarmup> {
    this.events.push(`warmup:${timeoutMs}`);
    if (signal.aborted) return Promise.resolve("degraded");
    return Promise.resolve(this.warmup);
  }

  startPresentation(
    input: ForgePresentationInput,
    options: {
      readonly loadTimeoutMs: number;
      readonly completionTimeoutMs: number;
      readonly signal: AbortSignal;
    },
  ): Promise<ForgePresentationStartResult> {
    this.lastPresentation = input;
    this.events.push(
      `present:${input.animate}:${options.loadTimeoutMs}:${options.completionTimeoutMs}`,
    );
    if (options.signal.aborted) return Promise.resolve({ ok: false, reason: "aborted" });
    if (this.presentationError) return Promise.reject(this.presentationError);
    if (this.presentationReason) {
      return Promise.resolve({ ok: false, reason: this.presentationReason });
    }
    const session = new FakePresentationSession(this.autoCompletePresentation);
    this.lastSession = session;
    return Promise.resolve({ ok: true, session });
  }

  activatePlayMode(): void {
    this.events.push("play:activate");
  }

  restorePlayInputAndFocus(signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    this.restoreCount += 1;
    this.events.push("play:restore");
    if (this.blockRestoreOnce) {
      this.blockRestoreOnce = false;
      return waitForAbort(signal);
    }
    return Promise.resolve();
  }

  recoverToWelcome(message?: string): void {
    this.events.push(`welcome:${message ?? ""}`);
  }

  resetIntro(destination: "cancelled" | "superseded" | "disposed" | "failed"): void {
    this.events.push(`reset:${destination}`);
  }
}

describe("run intro director", () => {
  test("owns the complete Forge theater transaction and restores input once", async () => {
    const port = new FakeRunIntroPort();
    const director = new RunIntroDirector(port);

    const result = await director.start(request({ refreshProcedural: true }));

    expect(result).toMatchObject({
      kind: "entered-play",
      seed: "INTRO-DIRECTOR",
      path: "forge",
      warmup: "ready",
      animation: "completed",
    });
    expect(port.events).toEqual([
      "prepare:INTRO-DIRECTOR",
      "refresh",
      "fade:opaque:true:0",
      "theater:forging",
      "frames:2",
      "build:INTRO-DIRECTOR",
      "warmup:10000",
      "present:true:6000:10000",
      "frames:2",
      "fade:clear:false:300",
      "theater:entering-play",
      "fade:opaque:false:260",
      "theater:off",
      "play:activate",
      "warmup:4000",
      "fade:clear:false:300",
      "play:restore",
    ]);
    expect(port.lastSession?.stopCount).toBe(1);
    expect(port.restoreCount).toBe(1);
    expect(port.lastPresentation).toMatchObject({
      animate: true,
      themeKey: "ancient",
    });
  });

  test("keeps reduced motion in the theater with instant fades and no map animation", async () => {
    const port = new FakeRunIntroPort();
    const director = new RunIntroDirector(port);

    const result = await director.start(request({ reducedMotion: true }));

    expect(result).toMatchObject({ kind: "entered-play", path: "forge" });
    expect(port.events).toContain("present:false:6000:800");
    expect(port.events.filter((event) => event.startsWith("fade:"))).toEqual([
      "fade:opaque:true:0",
      "fade:clear:true:300",
      "fade:opaque:true:260",
      "fade:clear:true:300",
    ]);
    expect(port.events).toContain("delay:600");
    expect(port.restoreCount).toBe(1);
  });

  test("skip shares build, Play activation, warmup, and the single input handoff", async () => {
    const port = new FakeRunIntroPort();
    const director = new RunIntroDirector(port);

    const result = await director.start(request({ skip: true, refreshProcedural: true }));

    expect(result).toEqual({
      kind: "entered-play",
      seed: "INTRO-DIRECTOR",
      path: "skip",
      warmup: "ready",
    });
    expect(port.events).toEqual([
      "prepare:INTRO-DIRECTOR",
      "refresh",
      "build:INTRO-DIRECTOR",
      "play:activate",
      "warmup:4000",
      "play:restore",
    ]);
    expect(port.restoreCount).toBe(1);
    expect(port.lastPresentation).toBeNull();
  });

  test("treats unavailable Forge as a timed fallback instead of stranding the run", async () => {
    const port = new FakeRunIntroPort();
    port.presentationReason = "load-timeout";
    const director = new RunIntroDirector(port);

    const result = await director.start(request());

    expect(result).toMatchObject({
      kind: "entered-play",
      path: "forge-fallback",
      forgeReason: "load-timeout",
    });
    expect(port.events).toContain("delay:900");
    expect(port.events).toContain("play:restore");
    expect(port.restoreCount).toBe(1);
  });

  test("build failure clears the theater and recovers Welcome without restoring play input", async () => {
    const port = new FakeRunIntroPort();
    port.buildResult = { ok: false, message: "generation blocked" };
    const director = new RunIntroDirector(port);

    const result = await director.start(request());

    expect(result).toEqual({
      kind: "failed",
      seed: "INTRO-DIRECTOR",
      stage: "build",
      message: "generation blocked",
    });
    expect(port.events.slice(-3)).toEqual([
      "theater:off",
      "fade:clear:false:300",
      "welcome:generation blocked",
    ]);
    expect(port.restoreCount).toBe(0);
    expect(port.lastSession).toBeNull();
  });

  test("unexpected intro failure resets the opaque overlay before Welcome recovery", async () => {
    const port = new FakeRunIntroPort();
    port.presentationError = new Error("presentation rejected");
    const director = new RunIntroDirector(port);

    expect(await director.start(request())).toEqual({
      kind: "failed",
      seed: "INTRO-DIRECTOR",
      stage: "intro",
      message: "presentation rejected",
    });
    expect(port.events.slice(-3)).toEqual([
      "reset:failed",
      "theater:off",
      "welcome:presentation rejected",
    ]);
    expect(port.restoreCount).toBe(0);
  });

  test("explicit cancellation settles promptly and leaves no active intro", async () => {
    const port = new FakeRunIntroPort();
    port.blockFramesOnce = true;
    const director = new RunIntroDirector(port);
    const running = director.start(request());
    await waitForEvent(port, "frames:2");

    expect(director.cancel()).toBe(true);
    expect(await running).toEqual({
      kind: "cancelled",
      seed: "INTRO-DIRECTOR",
      reason: "cancelled",
    });
    expect(port.events).toContain("reset:cancelled");
    expect(port.restoreCount).toBe(0);
    expect(director.cancel()).toBe(false);
  });

  test("cancellation during map presentation stops its owned session exactly once", async () => {
    const port = new FakeRunIntroPort();
    port.autoCompletePresentation = false;
    const director = new RunIntroDirector(port);
    const running = director.start(request());
    await waitForEvent(port, "fade:clear:false:300");

    expect(director.cancel()).toBe(true);
    expect(await running).toMatchObject({ kind: "cancelled", reason: "cancelled" });
    expect(port.lastSession?.stopCount).toBe(1);
    expect(port.restoreCount).toBe(0);
  });

  test("cancellation during the final input handoff cannot report an entered run", async () => {
    const port = new FakeRunIntroPort();
    port.blockRestoreOnce = true;
    const director = new RunIntroDirector(port);
    const running = director.start(request({ skip: true }));
    await waitForEvent(port, "play:restore");

    expect(director.cancel()).toBe(true);
    expect(await running).toEqual({
      kind: "cancelled",
      seed: "INTRO-DIRECTOR",
      reason: "cancelled",
    });
    expect(port.events).toContain("reset:cancelled");
    expect(port.restoreCount).toBe(1);
  });

  test("a replacement waits for old cleanup and only the new run enters Play", async () => {
    const port = new FakeRunIntroPort();
    port.blockFramesOnce = true;
    const director = new RunIntroDirector(port);
    const oldRun = director.start(request({ seed: "OLD" }));
    await waitForEvent(port, "frames:2");

    const newRun = director.start(request({ seed: "NEW", skip: true }));
    expect(await oldRun).toEqual({ kind: "cancelled", seed: "OLD", reason: "superseded" });
    expect(await newRun).toMatchObject({ kind: "entered-play", seed: "NEW", path: "skip" });
    expect(port.events.indexOf("reset:superseded")).toBeLessThan(
      port.events.indexOf("prepare:NEW"),
    );
    expect(port.restoreCount).toBe(1);
  });

  test("cancels a replacement while it waits for superseded cleanup", async () => {
    const port = new FakeRunIntroPort();
    port.blockFramesOnce = true;
    const director = new RunIntroDirector(port);
    const oldRun = director.start(request({ seed: "OLD" }));
    await waitForEvent(port, "frames:2");

    const replacement = director.start(request({ seed: "NEW", skip: true }));
    expect(director.cancel()).toBe(true);

    expect(await oldRun).toEqual({ kind: "cancelled", seed: "OLD", reason: "superseded" });
    expect(await replacement).toEqual({ kind: "cancelled", seed: "NEW", reason: "cancelled" });
    expect(port.events).toContain("reset:cancelled");
    expect(port.events).not.toContain("prepare:NEW");
    expect(port.restoreCount).toBe(0);
  });

  test("dispose cancels active work and permanently rejects later starts", async () => {
    const port = new FakeRunIntroPort();
    port.blockFramesOnce = true;
    const director = new RunIntroDirector(port);
    const running = director.start(request());
    await waitForEvent(port, "frames:2");

    director.dispose();
    director.dispose();
    expect(await running).toEqual({
      kind: "cancelled",
      seed: "INTRO-DIRECTOR",
      reason: "disposed",
    });
    expect(await director.start(request({ seed: "LATE", skip: true }))).toEqual({
      kind: "cancelled",
      seed: "LATE",
      reason: "disposed",
    });
    expect(port.events.filter((event) => event === "reset:disposed")).toHaveLength(1);
    expect(port.restoreCount).toBe(0);
  });
});

function abortableResolution(signal: AbortSignal): Promise<void> {
  return signal.aborted ? Promise.resolve() : Promise.resolve();
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}

async function waitForEvent(port: FakeRunIntroPort, expected: string): Promise<void> {
  for (let attempt = 0; attempt < 20 && !port.events.includes(expected); attempt += 1) {
    await Promise.resolve();
  }
  expect(port.events).toContain(expected);
}
