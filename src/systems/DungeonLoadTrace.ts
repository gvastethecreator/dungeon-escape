/**
 * Load telemetry is intentionally DOM-free so the same timing contract can be
 * exercised in Bun and forwarded through the Play runtime without browser
 * adapters. Values are relative to one trace's start, not wall-clock dates.
 */

export type DungeonLoadTerminal = "complete" | "error" | "timeout" | "superseded";

export const DUNGEON_LOAD_TIMED_PHASES = [
  "generation",
  "plan",
  "sceneCommit",
  "actors",
  "colliderIndex",
  "texturePolicy",
  "atmosphere",
  "editorProjection",
  "warmup",
] as const;

export type DungeonLoadTimedPhase = (typeof DUNGEON_LOAD_TIMED_PHASES)[number];

export type DungeonLoadWorldPhase = Extract<
  DungeonLoadTimedPhase,
  "plan" | "sceneCommit" | "actors" | "colliderIndex"
>;

export interface DungeonLoadPhaseObserver {
  begin(phase: DungeonLoadWorldPhase): boolean;
  end(phase: DungeonLoadWorldPhase): boolean;
}

export interface DungeonLoadSpan {
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly durationMs: number;
}

export interface DungeonLoadMilestone {
  readonly atMs: number;
}

/** Stable, JSON-safe payload consumed by browser and offline telemetry. */
export interface DungeonLoadTraceSnapshot {
  readonly schemaVersion: 1;
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
  readonly firstUsableFrame: DungeonLoadMilestone | null;
  readonly inputReady: DungeonLoadMilestone | null;
}

export type DungeonLoadClock = () => number;

export interface DungeonLoadTraceOptions {
  readonly clock?: DungeonLoadClock;
  readonly loadId?: string;
}

export interface DungeonLoadTraceControllerOptions {
  readonly clock?: DungeonLoadClock;
  readonly createLoadId?: () => string;
}

let nextLoadSequence = 0;

function defaultClock(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function defaultLoadId(): string {
  nextLoadSequence += 1;
  return `dungeon-load-${Date.now().toString(36)}-${nextLoadSequence.toString(36)}`;
}

function emptySpans(): Record<DungeonLoadTimedPhase, DungeonLoadSpan | null> {
  return {
    generation: null,
    plan: null,
    sceneCommit: null,
    actors: null,
    colliderIndex: null,
    texturePolicy: null,
    atmosphere: null,
    editorProjection: null,
    warmup: null,
  };
}

/**
 * A single load's timing state. It has no browser state and can only finish
 * once. Phases that never begin remain null; the trace never substitutes 0ms
 * for a phase that did not happen.
 */
export class DungeonLoadTrace implements DungeonLoadPhaseObserver {
  readonly loadId: string;
  private readonly startedAt: number;
  private lastElapsedMs = 0;
  private readonly phaseStarts = new Map<DungeonLoadTimedPhase, number>();
  private readonly spans = emptySpans();
  private firstFrame: DungeonLoadMilestone | null = null;
  private input: DungeonLoadMilestone | null = null;
  private terminalSnapshot: DungeonLoadTraceSnapshot | null = null;

  constructor({ clock = defaultClock, loadId = defaultLoadId() }: DungeonLoadTraceOptions = {}) {
    this.clock = clock;
    this.loadId = loadId;
    this.startedAt = this.clock();
  }

  private readonly clock: DungeonLoadClock;

  get isOpen(): boolean {
    return this.terminalSnapshot === null;
  }

  isPhaseOpen(phase: DungeonLoadTimedPhase): boolean {
    return this.isOpen && this.phaseStarts.has(phase);
  }

  begin(phase: DungeonLoadTimedPhase): boolean {
    if (!this.isOpen || this.phaseStarts.has(phase) || this.spans[phase] !== null) return false;
    this.phaseStarts.set(phase, this.elapsedMs());
    return true;
  }

  end(phase: DungeonLoadTimedPhase): boolean {
    const startedAtMs = this.phaseStarts.get(phase);
    if (!this.isOpen || startedAtMs === undefined) return false;
    this.phaseStarts.delete(phase);
    const endedAtMs = this.elapsedMs();
    this.spans[phase] = Object.freeze({
      startedAtMs,
      endedAtMs,
      durationMs: endedAtMs - startedAtMs,
    });
    return true;
  }

  markFirstUsableFrame(): boolean {
    if (!this.isPhaseOpen("warmup") || this.firstFrame !== null) return false;
    this.firstFrame = Object.freeze({ atMs: this.elapsedMs() });
    return true;
  }

  markInputReady(): boolean {
    const warmup = this.spans.warmup;
    if (
      !this.isOpen ||
      this.input !== null ||
      this.firstFrame === null ||
      warmup === null ||
      this.firstFrame.atMs < warmup.startedAtMs ||
      this.firstFrame.atMs > warmup.endedAtMs
    ) {
      return false;
    }
    const atMs = this.elapsedMs();
    if (atMs < warmup.endedAtMs) return false;
    this.input = Object.freeze({ atMs });
    return true;
  }

  finish(terminal: DungeonLoadTerminal, terminalDetail?: string): DungeonLoadTraceSnapshot | null {
    if (this.terminalSnapshot !== null) return this.terminalSnapshot;
    if (terminal === "complete" && !this.hasValidCompletionOrder()) return null;

    const completedAtMs = this.elapsedMs();
    for (const [phase, startedAtMs] of this.phaseStarts) {
      this.spans[phase] = Object.freeze({
        startedAtMs,
        endedAtMs: completedAtMs,
        durationMs: completedAtMs - startedAtMs,
      });
    }
    this.phaseStarts.clear();
    this.terminalSnapshot = Object.freeze({
      schemaVersion: 1,
      loadId: this.loadId,
      terminal,
      terminalDetail: terminalDetail || null,
      totalMs: completedAtMs,
      generation: this.spans.generation,
      plan: this.spans.plan,
      sceneCommit: this.spans.sceneCommit,
      actors: this.spans.actors,
      colliderIndex: this.spans.colliderIndex,
      texturePolicy: this.spans.texturePolicy,
      atmosphere: this.spans.atmosphere,
      editorProjection: this.spans.editorProjection,
      warmup: this.spans.warmup,
      firstUsableFrame: this.firstFrame,
      inputReady: this.input,
    });
    return this.terminalSnapshot;
  }

  private elapsedMs(): number {
    const observed = this.clock() - this.startedAt;
    const next = Number.isFinite(observed) ? Math.max(0, observed) : this.lastElapsedMs;
    this.lastElapsedMs = Math.max(this.lastElapsedMs, next);
    return this.lastElapsedMs;
  }

  private hasValidCompletionOrder(): boolean {
    const warmup = this.spans.warmup;
    if (warmup === null || this.firstFrame === null || this.input === null) return false;
    return (
      this.firstFrame.atMs >= warmup.startedAtMs &&
      this.firstFrame.atMs <= warmup.endedAtMs &&
      this.input.atMs >= warmup.endedAtMs
    );
  }
}

/**
 * Keeps one live trace. Replacing it finalizes the previous trace as
 * superseded, and stale callers can no longer mutate or publish the new load.
 */
export class DungeonLoadTraceController {
  private readonly clock: DungeonLoadClock;
  private readonly createLoadId: () => string;
  private activeTrace: DungeonLoadTrace | null = null;

  constructor({
    clock = defaultClock,
    createLoadId = defaultLoadId,
  }: DungeonLoadTraceControllerOptions = {}) {
    this.clock = clock;
    this.createLoadId = createLoadId;
  }

  open(): {
    readonly trace: DungeonLoadTrace;
    readonly superseded: DungeonLoadTraceSnapshot | null;
  } {
    const superseded = this.activeTrace?.finish("superseded") ?? null;
    const trace = new DungeonLoadTrace({ clock: this.clock, loadId: this.createLoadId() });
    this.activeTrace = trace;
    return { trace, superseded };
  }

  active(): DungeonLoadTrace | null {
    return this.activeTrace;
  }

  isActive(trace: DungeonLoadTrace): boolean {
    return this.activeTrace === trace && trace.isOpen;
  }

  finish(
    trace: DungeonLoadTrace,
    terminal: DungeonLoadTerminal,
    terminalDetail?: string,
  ): DungeonLoadTraceSnapshot | null {
    if (!this.isActive(trace)) return null;
    const snapshot = trace.finish(terminal, terminalDetail);
    if (snapshot !== null) this.activeTrace = null;
    return snapshot;
  }

  complete(trace: DungeonLoadTrace): DungeonLoadTraceSnapshot | null {
    if (!this.isActive(trace) || !trace.markInputReady()) return null;
    return this.finish(trace, "complete");
  }
}
