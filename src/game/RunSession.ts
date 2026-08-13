import { COPY, stoneLabel, type StoneId } from "../ui/copy";
import { hasPhoenixCharge, phoenixReviveResolve, tryConsumePhoenixCharge } from "./PhoenixEgg";
import { applyPickupSessionEffects } from "./PickupSessionEffects";
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
    | "cull-brand"
    | "shotgun"
    | "phoenix-egg"
    | "map"
    | "mobility"
    | "clarity"
    | "hand-torch"
    | "swarm-curse"
    | "slow-curse"
    | "frenzy-curse"
    | "gloom-curse"
    | "mirror-curse"
    | "spin-curse"
    | null;
  /** Armed phoenix charges available before this damage resolves. */
  phoenixCharges?: number;
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
    cullBrand?: boolean;
    shotgun?: boolean;
    mapReveal?: boolean;
    mobilityBoost?: boolean;
    fogClear?: boolean;
    handTorch?: boolean;
    swarmCurse?: boolean;
    slowCurse?: boolean;
    frenzyCurse?: boolean;
    gloomCurse?: boolean;
    mirrorCurse?: boolean;
    spinCurse?: boolean;
    phoenixEgg?: boolean;
  };
  endOverlay?: "dead" | "won";
  flash?: "event" | "damage";
  damageHit?: boolean;
  playEnemyHit?: boolean;
  playPickup?: boolean;
  sessionChanged?: boolean;
  /** Lethal damage spent a phoenix charge; host should fire annihilation pulse. */
  phoenixRevive?: boolean;
  /** Remaining phoenix charges after this update (host syncs world). */
  phoenixCharges?: number;
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

  applyPickupSessionEffects(effects, update.collectedPickupKind);

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
    effects.sessionChanged = true;
    if (session.resolve <= 0) {
      const phoenix = tryConsumePhoenixCharge(update.phoenixCharges ?? 0);
      if (phoenix.consumed) {
        session.resolve = phoenixReviveResolve();
        session.runMode = "playing";
        effects.phoenixRevive = true;
        effects.phoenixCharges = phoenix.charges;
        effects.endOverlay = undefined;
        effects.flash = "event";
        effects.status = COPY.status.phoenixRevive;
        effects.damageHit = false;
      } else {
        session.runMode = "dead";
        quest.stop();
        effects.endOverlay = "dead";
        effects.phoenixCharges = 0;
      }
    } else if (hasPhoenixCharge(update.phoenixCharges ?? 0)) {
      effects.phoenixCharges = update.phoenixCharges;
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
