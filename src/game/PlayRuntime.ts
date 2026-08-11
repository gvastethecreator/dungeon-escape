import {
  applyWorldUpdate,
  createRunSession,
  resetRunSession,
  restoreRunSession,
  snapshotRunSession,
  type PersistedRunSession,
  type RunMode,
  type RunSessionEffects,
  type SessionWorldUpdate,
} from "./RunSession";
import { QuestState } from "./QuestState";
import { STONE_ORDER, type StoneId } from "../ui/copy";
import type { DungeonLoadPhaseObserver } from "../systems/DungeonLoadTrace";

export type { PersistedRunSession } from "./RunSession";

export type PlayPickupKind = NonNullable<SessionWorldUpdate["collectedPickupKind"]>;

/** Optional, load-only observation that does not add a Play world method. */
export interface PlayWorldLoadOptions<TDungeon> {
  carryPhoenix?: boolean;
  stack?: readonly TDungeon[];
  loadTrace?: DungeonLoadPhaseObserver;
}

/**
 * The gameplay subset returned by the world. Presentation-only fields can stay
 * on the concrete world update and travel through `step` unchanged.
 */
export interface PlayWorldUpdate extends Omit<SessionWorldUpdate, "collectedPickupKind"> {
  collectedPickup: { kind: PlayPickupKind; position?: unknown } | null;
}

/**
 * Structural boundary for Play order. It deliberately contains no renderer,
 * browser, or Three types so a fake world can exercise the same runtime seam.
 */
export interface PlayWorldPort<TDungeon, TMood, TPlayer, TWorldUpdate extends PlayWorldUpdate> {
  setDungeon(dungeon: TDungeon, mood: TMood, options?: PlayWorldLoadOptions<TDungeon>): void;
  /**
   * Optional: clear the previous floor, yield once, then rebuild. Hosts use this
   * during successive map loads so the load cover can paint between dispose and build.
   */
  setDungeonWithYield?(
    dungeon: TDungeon,
    mood: TMood,
    yieldToMain: () => Promise<void>,
    options?: PlayWorldLoadOptions<TDungeon>,
  ): Promise<void>;
  update(
    delta: number,
    player: TPlayer,
    atExit: boolean,
    interactPressed?: boolean,
    mouseForwardHeld?: boolean,
  ): TWorldUpdate;
  restoreSession(foundStoneIds: readonly StoneId[]): void;
  restoreRuntimeProgress(
    progress: PlayRuntimeProgress["progress"],
    player: PlayRuntimeProgress["player"],
  ): void;
  dispose(): void;
}

export interface PlayRuntimeProgress {
  progress: {
    difficultyElapsed: number;
    timeFreezeRemaining?: number;
    luminousWardRemaining?: number;
    annihilationPulseRemaining?: number;
    mapRevealed?: boolean;
    mobilityBoostRemaining?: number;
    fogClearRemaining?: number;
    slowCurseRemaining?: number;
    frenzyCurseRemaining?: number;
    gloomCurseRemaining?: number;
    swarmCurseActive?: boolean;
    cullBrandRemaining?: number;
    mirrorCurseRemaining?: number;
    spinCurseRemaining?: number;
    phoenixCharges?: number;
  };
  player: { x: number; z: number };
}

export interface PlayRuntimeLoad<TDungeon, TMood> {
  dungeon: TDungeon;
  mood: TMood;
  /** Optional multi-floor stack built into one resident scene. */
  stack?: readonly TDungeon[];
  /** Optional load-only observer for concrete world build boundaries. */
  loadTrace?: DungeonLoadPhaseObserver;
  persisted?: PersistedRunSession;
  runtimeProgress?: PlayRuntimeProgress;
  resolve?: number;
}

export interface PlayRuntimeStep<TWorldUpdate extends PlayWorldUpdate> {
  worldUpdate: TWorldUpdate | null;
  effects: Readonly<RunSessionEffects>;
  state: Readonly<PlayRuntimeState>;
}

export interface PlayRuntimeQuestState {
  readonly stonesFound: number;
  readonly stonesTotal: number;
  readonly foundStoneIds: readonly StoneId[];
  readonly portalOpen: boolean;
  readonly escaped: boolean;
  readonly isRunning: boolean;
}

export interface PlayRuntimeState {
  readonly resolve: number;
  readonly runMode: RunMode;
  readonly exitReached: boolean;
  readonly quest: Readonly<PlayRuntimeQuestState>;
}

/** A persisted run emitted by this runtime always carries its live quest clock. */
export interface PlayRuntimeSnapshot extends PersistedRunSession {
  runSeconds: number;
}

export type PlayRuntimeFixture = "critical" | "dead" | "portal" | "won";

const EMPTY_EFFECTS: Readonly<RunSessionEffects> = Object.freeze({});
const QA_WON_SECONDS = 154;

function immutableEffects(effects: RunSessionEffects): Readonly<RunSessionEffects> {
  if (Object.keys(effects).length === 0) return EMPTY_EFFECTS;
  const next = effects.pickup
    ? { ...effects, pickup: Object.freeze({ ...effects.pickup }) }
    : { ...effects };
  return Object.freeze(next);
}

function immutableSnapshot(snapshot: PersistedRunSession): PlayRuntimeSnapshot {
  const foundStoneIds = Object.freeze([...snapshot.foundStoneIds]) as unknown as StoneId[];
  const perStoneSeconds = snapshot.perStoneSeconds
    ? (Object.freeze({ ...snapshot.perStoneSeconds }) as Partial<Record<StoneId, number>>)
    : undefined;
  return Object.freeze({
    ...snapshot,
    foundStoneIds,
    perStoneSeconds,
    runSeconds: snapshot.runSeconds ?? 0,
  }) as PlayRuntimeSnapshot;
}

/**
 * Owns the order of a live Play run. The host owns input and presentation, then
 * maps this module's data output to HUD, audio, overlays, and saves.
 */
export class PlayRuntime<TDungeon, TMood, TPlayer, TWorldUpdate extends PlayWorldUpdate> {
  private readonly session = createRunSession();
  private readonly quest = new QuestState();
  private cachedState: Readonly<PlayRuntimeState> | null = null;
  private gameplayClockMs = 0;
  private disposed = false;

  constructor(private readonly world: PlayWorldPort<TDungeon, TMood, TPlayer, TWorldUpdate>) {}

  /**
   * Starts a new run or restores one after building the world. Restore order is
   * fixed here so callers cannot replay world/session transitions differently.
   */
  load(input: PlayRuntimeLoad<TDungeon, TMood>): Readonly<PlayRuntimeState> {
    this.assertActive();
    const carryPhoenix = (input.runtimeProgress?.progress?.phoenixCharges ?? 0) > 0;
    this.world.setDungeon(input.dungeon, input.mood, {
      carryPhoenix,
      stack: input.stack,
      loadTrace: input.loadTrace,
    });
    return this.finishLoad(input);
  }

  /**
   * Same restore order as `load`, but rebuilds the world with a host-supplied
   * yield so successive map swaps stay responsive.
   */
  async loadWithYield(
    input: PlayRuntimeLoad<TDungeon, TMood>,
    yieldToMain: () => Promise<void>,
  ): Promise<Readonly<PlayRuntimeState>> {
    this.assertActive();
    const carryPhoenix = (input.runtimeProgress?.progress?.phoenixCharges ?? 0) > 0;
    if (this.world.setDungeonWithYield) {
      await this.world.setDungeonWithYield(input.dungeon, input.mood, yieldToMain, {
        carryPhoenix,
        stack: input.stack,
        loadTrace: input.loadTrace,
      });
    } else {
      this.world.setDungeon(input.dungeon, input.mood, {
        carryPhoenix,
        stack: input.stack,
        loadTrace: input.loadTrace,
      });
    }
    return this.finishLoad(input);
  }

  private finishLoad(input: PlayRuntimeLoad<TDungeon, TMood>): Readonly<PlayRuntimeState> {
    if (input.persisted) {
      this.restorePersisted(input.persisted, input.runtimeProgress);
    } else {
      resetRunSession(this.session, input.resolve ?? 100);
      this.gameplayClockMs = 0;
      this.quest.start(this.gameplayClockMs);
      this.cachedState = null;
    }
    return this.state();
  }

  /** Restores an existing world without rebuilding its dungeon. */
  restore(
    persisted: PersistedRunSession,
    runtimeProgress?: PlayRuntimeProgress,
  ): Readonly<PlayRuntimeState> {
    this.assertActive();
    this.restorePersisted(persisted, runtimeProgress);
    return this.state();
  }

  /**
   * Advances gameplay once. The raw world update remains available to the host
   * for presentation, while RunSession derives the resulting Play transitions.
   */
  step(input: {
    delta: number;
    player: TPlayer;
    atExit: boolean;
    interactPressed?: boolean;
    mouseForwardHeld?: boolean;
  }): PlayRuntimeStep<TWorldUpdate> {
    this.assertActive();
    if (this.session.runMode !== "playing") {
      return { worldUpdate: null, effects: EMPTY_EFFECTS, state: this.state() };
    }
    const delta = Number.isFinite(input.delta) ? Math.max(0, input.delta) : 0;
    const worldUpdate = this.world.update(
      delta,
      input.player,
      input.atExit,
      input.interactPressed,
      input.mouseForwardHeld,
    );
    this.gameplayClockMs += delta * 1_000;
    const effects = applyWorldUpdate(
      this.session,
      this.quest,
      {
        collectedPickupKind: worldUpdate.collectedPickup?.kind ?? null,
        collectedStoneId: worldUpdate.collectedStoneId,
        collectedStoneIds: worldUpdate.collectedStoneIds,
        stonesFound: worldUpdate.stonesFound,
        stonesTotal: worldUpdate.stonesTotal,
        portalOpen: worldUpdate.portalOpen,
        resolveGain: worldUpdate.resolveGain,
        damage: worldUpdate.damage,
        reachedLockedExit: worldUpdate.reachedLockedExit,
        reachedOpenExit: worldUpdate.reachedOpenExit,
        phoenixCharges: worldUpdate.phoenixCharges,
      },
      this.gameplayClockMs,
    );
    if (effects.sessionChanged) this.cachedState = null;
    return {
      worldUpdate,
      effects: immutableEffects(effects),
      state: this.state(),
    };
  }

  /** Persists the session and the active gameplay clock. */
  snapshot(): PlayRuntimeSnapshot {
    this.assertActive();
    return immutableSnapshot(snapshotRunSession(this.session, this.quest, this.gameplayClockMs));
  }

  /** Active gameplay seconds. Paused, hidden, editor, and end states do not advance it. */
  runSeconds(): number {
    this.assertActive();
    return this.quest.runSeconds(this.gameplayClockMs);
  }

  /** Immutable live state for host presentation, reused until a transition occurs. */
  state(): Readonly<PlayRuntimeState> {
    if (this.cachedState) return this.cachedState;
    const foundStoneIds = Object.freeze(STONE_ORDER.filter((id) => this.quest.hasStone(id)));
    const quest = Object.freeze({
      stonesFound: this.quest.stonesFound,
      stonesTotal: this.quest.totalStones,
      foundStoneIds,
      portalOpen: this.quest.portalOpen,
      escaped: this.quest.escaped,
      isRunning: this.quest.isRunning,
    });
    this.cachedState = Object.freeze({
      resolve: this.session.resolve,
      runMode: this.session.runMode,
      exitReached: this.session.exitReached,
      quest,
    });
    return this.cachedState;
  }

  /** Applies deterministic visual QA state without exposing session or quest internals. */
  loadFixture(fixture: PlayRuntimeFixture): Readonly<PlayRuntimeState> {
    this.assertActive();
    const persisted = this.fixtureSnapshot(fixture);
    this.restorePersisted(persisted, undefined);
    return this.state();
  }

  /** Safe to call from more than one browser teardown path. */
  dispose(): void {
    if (this.disposed) return;
    this.quest.stop();
    this.cachedState = null;
    this.disposed = true;
    this.world.dispose();
  }

  private restorePersisted(
    persisted: PersistedRunSession,
    runtimeProgress: PlayRuntimeProgress | undefined,
  ): void {
    const restoredSeconds =
      typeof persisted.runSeconds === "number" && Number.isFinite(persisted.runSeconds)
        ? Math.max(0, persisted.runSeconds)
        : 0;
    this.gameplayClockMs = restoredSeconds * 1_000;
    restoreRunSession(
      this.session,
      this.quest,
      { ...persisted, runSeconds: restoredSeconds },
      this.gameplayClockMs,
    );
    this.world.restoreSession(persisted.foundStoneIds);
    if (runtimeProgress) {
      this.world.restoreRuntimeProgress(runtimeProgress.progress, runtimeProgress.player);
    }
    this.cachedState = null;
  }

  private fixtureSnapshot(fixture: PlayRuntimeFixture): PersistedRunSession {
    if (fixture === "critical") {
      return {
        resolve: 10,
        foundStoneIds: [],
        portalOpen: false,
        runMode: "playing",
        exitReached: false,
      };
    }
    if (fixture === "dead") {
      return {
        resolve: 0,
        foundStoneIds: [],
        portalOpen: false,
        runMode: "dead",
        exitReached: false,
      };
    }
    const perStoneSeconds: Partial<Record<StoneId, number>> = {};
    for (const [index, id] of STONE_ORDER.entries()) perStoneSeconds[id] = 70 + index * 28;
    if (fixture === "portal") {
      return {
        resolve: 100,
        foundStoneIds: [...STONE_ORDER],
        portalOpen: true,
        runMode: "playing",
        exitReached: false,
        runSeconds: QA_WON_SECONDS,
        perStoneSeconds,
      };
    }
    return {
      resolve: 100,
      foundStoneIds: [...STONE_ORDER],
      portalOpen: true,
      runMode: "won",
      exitReached: true,
      runSeconds: QA_WON_SECONDS,
      perStoneSeconds,
    };
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("PlayRuntime is disposed.");
  }
}
