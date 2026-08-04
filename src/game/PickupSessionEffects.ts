/**
 * Pure session feedback for collected pickup kinds.
 * RunSession.applyWorldUpdate owns health/damage; this table owns kind labels and flash.
 */

import { COPY } from "../ui/copy";
import type { RunSessionEffects } from "./RunSession";

export type SessionPickupKind = NonNullable<
  import("./RunSession").SessionWorldUpdate["collectedPickupKind"]
>;

type PickupSessionRow = {
  status: string;
  pickup: NonNullable<RunSessionEffects["pickup"]>;
  flash: NonNullable<RunSessionEffects["flash"]>;
  sessionChanged?: true;
};

const PICKUP_SESSION_EFFECTS: Readonly<Partial<Record<SessionPickupKind, PickupSessionRow>>> = {
  "time-freeze": {
    status: COPY.status.timeFreeze,
    pickup: { label: COPY.pickup.timeFreeze, timeFreeze: true },
    flash: "event",
  },
  "luminous-ward": {
    status: COPY.status.luminousWard,
    pickup: { label: COPY.pickup.luminousWard, luminousWard: true },
    flash: "event",
  },
  "annihilation-pulse": {
    status: COPY.status.annihilationPulse,
    pickup: { label: COPY.pickup.annihilationPulse, annihilationPulse: true },
    flash: "event",
  },
  "cull-brand": {
    status: COPY.status.cullBrand,
    pickup: { label: COPY.pickup.cullBrand, cullBrand: true },
    flash: "event",
  },
  map: {
    status: COPY.status.map,
    pickup: { label: COPY.pickup.map, mapReveal: true },
    flash: "event",
    sessionChanged: true,
  },
  mobility: {
    status: COPY.status.mobility,
    pickup: { label: COPY.pickup.mobility, mobilityBoost: true },
    flash: "event",
    sessionChanged: true,
  },
  clarity: {
    status: COPY.status.clarity,
    pickup: { label: COPY.pickup.clarity, fogClear: true },
    flash: "event",
    sessionChanged: true,
  },
  "swarm-curse": {
    status: COPY.status.swarmCurse,
    pickup: { label: COPY.pickup.swarmCurse, swarmCurse: true },
    flash: "damage",
    sessionChanged: true,
  },
  "slow-curse": {
    status: COPY.status.slowCurse,
    pickup: { label: COPY.pickup.slowCurse, slowCurse: true },
    flash: "damage",
  },
  "frenzy-curse": {
    status: COPY.status.frenzyCurse,
    pickup: { label: COPY.pickup.frenzyCurse, frenzyCurse: true },
    flash: "damage",
  },
  "gloom-curse": {
    status: COPY.status.gloomCurse,
    pickup: { label: COPY.pickup.gloomCurse, gloomCurse: true },
    flash: "damage",
  },
  "mirror-curse": {
    status: COPY.status.mirrorCurse,
    pickup: { label: COPY.pickup.mirrorCurse, mirrorCurse: true },
    flash: "damage",
  },
  "spin-curse": {
    status: COPY.status.spinCurse,
    pickup: { label: COPY.pickup.spinCurse, spinCurse: true },
    flash: "damage",
  },
  "phoenix-egg": {
    status: COPY.status.phoenixEgg,
    pickup: { label: COPY.pickup.phoenixEgg, phoenixEgg: true },
    flash: "event",
    sessionChanged: true,
  },
};

/** Resolve status/pickup/flash for one collected kind, or null when the kind is not table-driven. */
export function pickupSessionEffects(
  kind: SessionPickupKind | null | undefined,
): PickupSessionRow | null {
  if (!kind) return null;
  return PICKUP_SESSION_EFFECTS[kind] ?? null;
}

/** Merge table row into a mutable effects bag. */
export function applyPickupSessionEffects(
  effects: RunSessionEffects,
  kind: SessionPickupKind | null | undefined,
): boolean {
  const row = pickupSessionEffects(kind);
  if (!row) return false;
  effects.status = row.status;
  effects.pickup = row.pickup;
  effects.playPickup = true;
  effects.flash = row.flash;
  if (row.sessionChanged) effects.sessionChanged = true;
  return true;
}
