import { hashSeed } from "../core/random";
import { exportPlayDungeonToForgePresentation } from "../dungeon/exportPlayDungeonToForge";
import type { DungeonData } from "../dungeon/types";
import type { ForgeAnimationResult, ForgePresentationStartResult } from "../forge/ForgeFrameClient";
import type { ForgePresentationInput } from "../forge/ForgeFrameProtocol";
import type { RunSource } from "./RunSource";

const FORGE_LOAD_TIMEOUT_MS = 6_000;
const FORGE_ANIMATION_TIMEOUT_MS = 10_000;
const FORGE_REDUCED_MOTION_TIMEOUT_MS = 800;
const FORGE_FALLBACK_HOLD_MS = 900;
const FORGE_REDUCED_STATIC_HOLD_MS = 600;
const FORGE_REDUCED_FALLBACK_HOLD_MS = 320;
const WORLD_BUILD_WARMUP_MS = 10_000;
const PLAY_WARMUP_MS = 4_000;
const FADE_TO_BLACK_MS = 260;
const FADE_TO_CLEAR_MS = 300;

export interface RunIntroRequest {
  readonly seed: string;
  readonly runSource?: RunSource;
  readonly themeKey: string;
  readonly refreshProcedural?: boolean;
  readonly skip: boolean;
  readonly reducedMotion: boolean;
}

export type RunIntroCancellationReason = "cancelled" | "superseded" | "disposed";
export type RunIntroResetDestination = RunIntroCancellationReason | "failed";
export type RunIntroPath = "skip" | "forge" | "forge-fallback";
export type RunIntroWarmup = "ready" | "degraded";

export type RunIntroResult =
  | {
      readonly kind: "entered-play";
      readonly seed: string;
      readonly path: RunIntroPath;
      readonly warmup: RunIntroWarmup;
      readonly animation?: ForgeAnimationResult;
      readonly forgeReason?: "load-timeout" | "post-failed" | "disposed";
    }
  | {
      readonly kind: "cancelled";
      readonly seed: string;
      readonly reason: RunIntroCancellationReason;
    }
  | {
      readonly kind: "failed";
      readonly seed: string;
      readonly stage: "build" | "intro" | "enter-play";
      readonly message: string;
    };

export interface RunIntroBuildResult {
  readonly ok: boolean;
  readonly dungeon?: DungeonData;
  readonly message?: string;
}

export interface RunIntroPort {
  /** Atomically close menus, stop input, and select the requested run identity. */
  prepare(request: RunIntroRequest): void;
  refreshProcedural(): void;
  fade(
    target: "opaque" | "clear",
    options: { readonly instant?: boolean; readonly durationMs?: number },
    signal: AbortSignal,
  ): Promise<void>;
  enterTheater(): void;
  setTheaterStatus(status: "entering-play"): void;
  leaveTheater(): void;
  waitFrames(count: number, signal: AbortSignal): Promise<void>;
  waitDelay(durationMs: number, signal: AbortSignal): Promise<void>;
  buildWorld(seed: string, signal: AbortSignal): Promise<RunIntroBuildResult>;
  waitForWorldReady(timeoutMs: number, signal: AbortSignal): Promise<RunIntroWarmup>;
  startPresentation(
    input: ForgePresentationInput,
    options: {
      readonly loadTimeoutMs: number;
      readonly completionTimeoutMs: number;
      readonly signal: AbortSignal;
    },
  ): Promise<ForgePresentationStartResult>;
  /** Switch to Play while keeping controller input gated. */
  activatePlayMode(): void;
  /** The only successful path allowed to restore controller input and focus. */
  restorePlayInputAndFocus(signal: AbortSignal): Promise<void>;
  recoverToWelcome(message?: string): void;
  /** Synchronous, idempotent reset used before a replacement can start. */
  resetIntro(destination: RunIntroResetDestination): void;
}

interface RunOperation {
  readonly request: RunIntroRequest;
  readonly controller: AbortController;
  readonly done: Promise<void>;
  readonly resolveDone: () => void;
  cancellationReason: RunIntroCancellationReason | null;
  failureStage: "build" | "intro" | "enter-play";
  session: Extract<ForgePresentationStartResult, { ok: true }>["session"] | null;
  reset: boolean;
}

/** Owns the complete New Game/Hall run-intro transaction and its cancellation boundary. */
export class RunIntroDirector {
  readonly #port: RunIntroPort;
  #active: RunOperation | null = null;
  #requestId = 0;
  #disposed = false;

  constructor(port: RunIntroPort) {
    this.#port = port;
  }

  async start(request: RunIntroRequest): Promise<RunIntroResult> {
    const id = ++this.#requestId;
    if (this.#disposed) return cancelledResult(request.seed, "disposed");

    let resolveDone = (): void => undefined;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    const operation: RunOperation = {
      request,
      controller: new AbortController(),
      done,
      resolveDone,
      cancellationReason: null,
      failureStage: "intro",
      session: null,
      reset: false,
    };
    const previous = this.#active;
    this.#active = operation;
    if (previous) this.#abort(previous, "superseded");

    try {
      if (previous) await previous.done;
      if (operation.controller.signal.aborted) return this.#cancelled(operation);
      if (this.#disposed) {
        this.#abort(operation, "disposed");
        return this.#cancelled(operation);
      }
      if (id !== this.#requestId) {
        this.#abort(operation, "superseded");
        return this.#cancelled(operation);
      }
      return await this.#run(operation);
    } catch (error) {
      if (operation.controller.signal.aborted) return this.#cancelled(operation);
      this.#stopSession(operation);
      this.#safeReset(operation, "failed");
      this.#safeLeaveTheater();
      const message = error instanceof Error ? error.message : "Could not start the dungeon.";
      this.#safeRecover(message);
      return {
        kind: "failed",
        seed: request.seed,
        stage: operation.failureStage,
        message,
      };
    } finally {
      this.#stopSession(operation);
      if (this.#active === operation) this.#active = null;
      operation.resolveDone();
    }
  }

  cancel(): boolean {
    this.#requestId += 1;
    if (!this.#active) return false;
    this.#abort(this.#active, "cancelled");
    return true;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#requestId += 1;
    if (this.#active) this.#abort(this.#active, "disposed");
  }

  async #run(operation: RunOperation): Promise<RunIntroResult> {
    const { request } = operation;
    const signal = operation.controller.signal;
    this.#port.prepare(request);
    if (signal.aborted) return this.#cancelled(operation);

    if (request.refreshProcedural) this.#port.refreshProcedural();
    if (request.skip) return this.#runSkipped(operation);

    await this.#port.fade("opaque", { instant: true }, signal);
    if (signal.aborted) return this.#cancelled(operation);
    this.#port.enterTheater();
    await this.#port.waitFrames(2, signal);
    if (signal.aborted) return this.#cancelled(operation);

    operation.failureStage = "build";
    const build = await this.#port.buildWorld(request.seed, signal);
    if (signal.aborted) return this.#cancelled(operation);
    if (!build.ok || !build.dungeon) {
      return this.#recoverBuildFailure(
        operation,
        build.message ?? "Could not generate the dungeon.",
      );
    }
    await this.#port.waitForWorldReady(WORLD_BUILD_WARMUP_MS, signal);
    if (signal.aborted) return this.#cancelled(operation);

    operation.failureStage = "intro";
    const presentationInput: ForgePresentationInput = {
      animate: !request.reducedMotion,
      seed: hashSeed(request.seed) % 999_999 || 1,
      themeKey: request.themeKey,
      dungeon: exportPlayDungeonToForgePresentation(build.dungeon, request.themeKey),
    };
    const presentation = await this.#port.startPresentation(presentationInput, {
      loadTimeoutMs: FORGE_LOAD_TIMEOUT_MS,
      completionTimeoutMs: request.reducedMotion
        ? FORGE_REDUCED_MOTION_TIMEOUT_MS
        : FORGE_ANIMATION_TIMEOUT_MS,
      signal,
    });
    if (signal.aborted) {
      if (presentation.ok) presentation.session.stop();
      return this.#cancelled(operation);
    }

    let path: RunIntroPath;
    let animation: ForgeAnimationResult | undefined;
    let forgeReason: "load-timeout" | "post-failed" | "disposed" | undefined;
    if (presentation.ok) {
      path = "forge";
      operation.session = presentation.session;
      await this.#port.waitFrames(2, signal);
      if (signal.aborted) return this.#cancelled(operation);
      await this.#port.fade(
        "clear",
        { instant: request.reducedMotion, durationMs: FADE_TO_CLEAR_MS },
        signal,
      );
      if (signal.aborted) return this.#cancelled(operation);
      if (request.reducedMotion) {
        [animation] = await Promise.all([
          presentation.session.completion,
          this.#port.waitDelay(FORGE_REDUCED_STATIC_HOLD_MS, signal),
        ]);
      } else {
        animation = await presentation.session.completion;
      }
      if (signal.aborted) return this.#cancelled(operation);
    } else {
      if (presentation.reason === "aborted") return this.#cancelled(operation);
      path = "forge-fallback";
      forgeReason = presentation.reason;
      await this.#port.fade(
        "clear",
        { instant: request.reducedMotion, durationMs: FADE_TO_CLEAR_MS },
        signal,
      );
      if (signal.aborted) return this.#cancelled(operation);
      await this.#port.waitDelay(
        request.reducedMotion ? FORGE_REDUCED_FALLBACK_HOLD_MS : FORGE_FALLBACK_HOLD_MS,
        signal,
      );
      if (signal.aborted) return this.#cancelled(operation);
    }

    this.#port.setTheaterStatus("entering-play");
    await this.#port.fade(
      "opaque",
      { instant: request.reducedMotion, durationMs: FADE_TO_BLACK_MS },
      signal,
    );
    if (signal.aborted) return this.#cancelled(operation);
    this.#stopSession(operation);
    this.#port.leaveTheater();

    operation.failureStage = "enter-play";
    this.#port.activatePlayMode();
    const warmup = await this.#port.waitForWorldReady(PLAY_WARMUP_MS, signal);
    if (signal.aborted) return this.#cancelled(operation);
    await this.#port.fade(
      "clear",
      { instant: request.reducedMotion, durationMs: FADE_TO_CLEAR_MS },
      signal,
    );
    if (signal.aborted) return this.#cancelled(operation);
    await this.#port.restorePlayInputAndFocus(signal);
    if (signal.aborted) return this.#cancelled(operation);
    return {
      kind: "entered-play",
      seed: request.seed,
      path,
      warmup,
      animation,
      forgeReason,
    };
  }

  async #runSkipped(operation: RunOperation): Promise<RunIntroResult> {
    const signal = operation.controller.signal;
    operation.failureStage = "build";
    const build = await this.#port.buildWorld(operation.request.seed, signal);
    if (signal.aborted) return this.#cancelled(operation);
    if (!build.ok || !build.dungeon) {
      return this.#recoverBuildFailure(
        operation,
        build.message ?? "Could not generate the dungeon.",
      );
    }
    operation.failureStage = "enter-play";
    this.#port.activatePlayMode();
    const warmup = await this.#port.waitForWorldReady(PLAY_WARMUP_MS, signal);
    if (signal.aborted) return this.#cancelled(operation);
    await this.#port.restorePlayInputAndFocus(signal);
    if (signal.aborted) return this.#cancelled(operation);
    return {
      kind: "entered-play",
      seed: operation.request.seed,
      path: "skip",
      warmup,
    };
  }

  async #recoverBuildFailure(operation: RunOperation, message: string): Promise<RunIntroResult> {
    const signal = operation.controller.signal;
    this.#stopSession(operation);
    this.#safeLeaveTheater();
    await this.#port.fade(
      "clear",
      { instant: operation.request.reducedMotion, durationMs: FADE_TO_CLEAR_MS },
      signal,
    );
    if (signal.aborted) return this.#cancelled(operation);
    this.#port.recoverToWelcome(message);
    return {
      kind: "failed",
      seed: operation.request.seed,
      stage: "build",
      message,
    };
  }

  #abort(operation: RunOperation, reason: RunIntroCancellationReason): void {
    if (operation.cancellationReason === null || reason === "disposed") {
      operation.cancellationReason = reason;
    }
    operation.controller.abort();
    this.#stopSession(operation);
    this.#safeReset(operation, reason);
  }

  #safeReset(operation: RunOperation, destination: RunIntroResetDestination): void {
    if (operation.reset) return;
    operation.reset = true;
    try {
      this.#port.resetIntro(destination);
    } catch {
      // Cleanup is best-effort and must not block recovery or a replacement.
    }
  }

  #cancelled(operation: RunOperation): RunIntroResult {
    return cancelledResult(
      operation.request.seed,
      operation.cancellationReason ?? (this.#disposed ? "disposed" : "cancelled"),
    );
  }

  #stopSession(operation: RunOperation): void {
    const session = operation.session;
    if (!session) return;
    operation.session = null;
    session.stop();
  }

  #safeLeaveTheater(): void {
    try {
      this.#port.leaveTheater();
    } catch {
      // Recovery still attempts to return to Welcome.
    }
  }

  #safeRecover(message: string): void {
    try {
      this.#port.recoverToWelcome(message);
    } catch {
      // The explicit failed outcome remains available to the caller.
    }
  }
}

function cancelledResult(seed: string, reason: RunIntroCancellationReason): RunIntroResult {
  return { kind: "cancelled", seed, reason };
}
