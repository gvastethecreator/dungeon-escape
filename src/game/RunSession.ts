import { COPY, stoneLabel, type StoneId } from "../ui/copy";
import type { QuestState } from "./QuestState";

export type RunMode = "playing" | "dead" | "won";

/** Subset of WorldUpdate needed for session rules (no Three). */
export interface SessionWorldUpdate {
  collectedPickupKind?:
    | "stone"
    | "resolve"
    | "time-freeze"
    | "luminous-ward"
    | "annihilation-pulse"
    | "map"
    | "mobility"
    | null;
  collectedStoneId: StoneId | null;
  /** All IDs collected in one world update. Older adapters may omit this. */
  collectedStoneIds?: readonly StoneId[];
  stonesFound: number;
  stonesTotal: number;
  portalOpen: boolean;
  resolveGain: number;
  damage: number;
  reachedLockedExit: boolean;
  reachedOpenExit: boolean;
}

export interface RunSessionState {
  resolve: number;
  runMode: RunMode;
  exitReached: boolean;
}

export interface PersistedRunSession {
  resolve: number;
  foundStoneIds: StoneId[];
  portalOpen: boolean;
  runMode: RunMode;
  exitReached: boolean;
  /** Active gameplay seconds at snapshot time; resume keeps this clock. */
  runSeconds?: number;
  /** Optional per-stone find offsets (run seconds). */
  perStoneSeconds?: Partial<Record<StoneId, number>>;
}

export interface RunSessionEffects {
  status?: string;
  pickup?: {
    label: string;
    restoreResolve?: boolean;
    stoneId?: StoneId;
    timeFreeze?: boolean;
    luminousWard?: boolean;
    annihilationPulse?: boolean;
    mapReveal?: boolean;
    mobilityBoost?: boolean;
  };
  endOverlay?: "dead" | "won";
  flash?: "event" | "damage";
  damageHit?: boolean;
  playEnemyHit?: boolean;
  playPickup?: boolean;
  sessionChanged?: boolean;
  /** Prefer quest-derived progress for HUD / domain after stone events. */
  questPortalOpen?: boolean;
  questStonesFound?: number;
  questStonesTotal?: number;
}

export function createRunSession(resolve = 100): RunSessionState {
  return { resolve, runMode: "playing", exitReached: false };
}

export function resetRunSession(session: RunSessionState, resolve = 100): void {
  session.resolve = resolve;
  session.runMode = "playing";
  session.exitReached = false;
}

export function snapshotRunSession(
  session: RunSessionState,
  quest: QuestState,
  nowMs = performance.now(),
): PersistedRunSession {
  const questSnapshot = quest.snapshot(nowMs);
  return {
    resolve: session.resolve,
    foundStoneIds: questSnapshot.foundIds,
    portalOpen: questSnapshot.portalOpen,
    runMode: session.runMode,
    exitReached: session.exitReached,
    runSeconds: questSnapshot.runSeconds,
    perStoneSeconds: questSnapshot.perStoneSeconds,
  };
}

export function restoreRunSession(
  session: RunSessionState,
  quest: QuestState,
  persisted: PersistedRunSession,
  nowMs = performance.now(),
): void {
  session.resolve = Math.max(0, Math.min(100, persisted.resolve));
  session.runMode = persisted.runMode;
  session.exitReached = persisted.exitReached;
  quest.restore(
    {
      foundIds: [...persisted.foundStoneIds],
      escaped: persisted.runMode === "won",
      running: persisted.runMode === "playing",
      runSeconds: Math.max(0, persisted.runSeconds ?? 0),
      perStoneSeconds: persisted.perStoneSeconds,
    },
    nowMs,
  );
}

/**
 * Pure play-session reducer. Mutates session + quest; returns effects for the host.
 * Portal/stone HUD authority after collect: quest (not world-only flags).
 */
export function applyWorldUpdate(
  session: RunSessionState,
  quest: QuestState,
  update: SessionWorldUpdate,
  nowMs = 0,
): RunSessionEffects {
  const effects: RunSessionEffects = {};
  if (session.runMode !== "playing") return effects;

  const stoneIds =
    update.collectedStoneIds && update.collectedStoneIds.length > 0
      ? update.collectedStoneIds
      : update.collectedStoneId
        ? [update.collectedStoneId]
        : [];
  let lastCollectedStoneId: StoneId | null = null;
  for (const stoneId of stoneIds) {
    if (quest.collectStone(stoneId, nowMs)) lastCollectedStoneId = stoneId;
  }
  if (lastCollectedStoneId) {
    effects.questPortalOpen = quest.portalOpen;
    effects.questStonesFound = quest.stonesFound;
    effects.questStonesTotal = quest.totalStones;
    effects.status = quest.portalOpen
      ? COPY.status.portalOpen
      : COPY.status.stoneFound(
          stoneLabel(lastCollectedStoneId),
          quest.stonesFound,
          quest.totalStones,
        );
    effects.pickup = {
      label: stoneLabel(lastCollectedStoneId),
      stoneId: lastCollectedStoneId,
    };
    effects.playPickup = true;
    effects.flash = "event";
    effects.sessionChanged = true;
  }

  if (update.collectedPickupKind === "time-freeze") {
    effects.status = COPY.status.timeFreeze;
    effects.pickup = { label: COPY.pickup.timeFreeze, timeFreeze: true };
    effects.playPickup = true;
    effects.flash = "event";
  }

  if (update.collectedPickupKind === "luminous-ward") {
    effects.status = COPY.status.luminousWard;
    effects.pickup = { label: COPY.pickup.luminousWard, luminousWard: true };
    effects.playPickup = true;
    effects.flash = "event";
  }

  if (update.collectedPickupKind === "annihilation-pulse") {
    effects.status = COPY.status.annihilationPulse;
    effects.pickup = { label: COPY.pickup.annihilationPulse, annihilationPulse: true };
    effects.playPickup = true;
    effects.flash = "event";
  }

  if (update.collectedPickupKind === "map") {
    effects.status = COPY.status.map;
    effects.pickup = { label: COPY.pickup.map, mapReveal: true };
    effects.playPickup = true;
    effects.flash = "event";
    effects.sessionChanged = true;
  }

  if (update.collectedPickupKind === "mobility") {
    effects.status = COPY.status.mobility;
    effects.pickup = { label: COPY.pickup.mobility, mobilityBoost: true };
    effects.playPickup = true;
    effects.flash = "event";
    effects.sessionChanged = true;
  }

  if (update.resolveGain > 0) {
    session.resolve = Math.min(100, session.resolve + update.resolveGain);
    effects.status = `Health restored +${update.resolveGain}.`;
    effects.pickup = { label: `Health +${update.resolveGain}`, restoreResolve: true };
    effects.playPickup = true;
    effects.flash = "event";
    effects.sessionChanged = true;
  }

  if (update.damage > 0) {
    session.resolve = Math.max(0, session.resolve - update.damage);
    effects.damageHit = true;
    effects.playEnemyHit = true;
    effects.flash = "damage";
    effects.status = `Hostile contact −${update.damage} health.`;
    effects.sessionChanged = true;
    if (session.resolve <= 0) {
      session.runMode = "dead";
      quest.stop();
      effects.endOverlay = "dead";
    }
  }

  const questPortalOpen = quest.portalOpen;
  if (update.reachedLockedExit || (update.reachedOpenExit && !questPortalOpen)) {
    effects.status = COPY.status.portalSealed;
  }

  if (
    session.runMode === "playing" &&
    update.reachedOpenExit &&
    questPortalOpen &&
    !session.exitReached
  ) {
    session.exitReached = true;
    session.runMode = "won";
    quest.markEscaped(nowMs);
    effects.endOverlay = "won";
    effects.sessionChanged = true;
  }

  return effects;
}
