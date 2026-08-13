/**
 * Pure session feedback for collected pickup kinds.
 * RunSession.applyWorldUpdate owns health/damage; this table owns kind labels and flash.
 * Pickup HUD chips / gothic ITEM FOUND cover the message — do not emit status toasts.
 */

import { COPY } from "../ui/copy";
import type { RunSessionEffects } from "./RunSession";

export type SessionPickupKind = NonNullable<
  import("./RunSession").SessionWorldUpdate["collectedPickupKind"]
>;

type PickupSessionRow = {
  pickup: NonNullable<RunSessionEffects["pickup"]>;
  flash: NonNullable<RunSessionEffects["flash"]>;
  sessionChanged?: true;
};

const PICKUP_SESSION_EFFECTS: Readonly<Partial<Record<SessionPickupKind, PickupSessionRow>>> = {
  "time-freeze": {
    pickup: { label: COPY.pickup.timeFreeze, timeFreeze: true },
    flash: "event",
  },
  "luminous-ward": {
    pickup: { label: COPY.pickup.luminousWard, luminousWard: true },
    flash: "event",
  },
  "annihilation-pulse": {
    pickup: { label: COPY.pickup.annihilationPulse, annihilationPulse: true },
    flash: "event",
  },
  "cull-brand": {
    pickup: { label: COPY.pickup.cullBrand, cullBrand: true },
    flash: "event",
  },
  shotgun: {
    pickup: { label: COPY.pickup.shotgun, shotgun: true },
    flash: "event",
  },
  map: {
    pickup: { label: COPY.pickup.map, mapReveal: true },
    flash: "event",
    sessionChanged: true,
  },
  mobility: {
    pickup: { label: COPY.pickup.mobility, mobilityBoost: true },
    flash: "event",
    sessionChanged: true,
  },
  clarity: {
    pickup: { label: COPY.pickup.clarity, fogClear: true },
    flash: "event",
    sessionChanged: true,
  },
  "hand-torch": {
    pickup: { label: COPY.pickup.handTorch, handTorch: true },
    flash: "event",
  },
  "swarm-curse": {
    pickup: { label: COPY.pickup.swarmCurse, swarmCurse: true },
    flash: "damage",
    sessionChanged: true,
  },
  "slow-curse": {
    pickup: { label: COPY.pickup.slowCurse, slowCurse: true },
    flash: "damage",
  },
  "frenzy-curse": {
    pickup: { label: COPY.pickup.frenzyCurse, frenzyCurse: true },
    flash: "damage",
  },
  "gloom-curse": {
    pickup: { label: COPY.pickup.gloomCurse, gloomCurse: true },
    flash: "damage",
  },
  "mirror-curse": {
    pickup: { label: COPY.pickup.mirrorCurse, mirrorCurse: true },
    flash: "damage",
  },
  "spin-curse": {
    pickup: { label: COPY.pickup.spinCurse, spinCurse: true },
    flash: "damage",
  },
  "phoenix-egg": {
    pickup: { label: COPY.pickup.phoenixEgg, phoenixEgg: true },
    flash: "event",
    sessionChanged: true,
  },
};

/** Resolve pickup/flash for one collected kind, or null when the kind is not table-driven. */
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
  effects.pickup = row.pickup;
  effects.playPickup = true;
  effects.flash = row.flash;
  if (row.sessionChanged) effects.sessionChanged = true;
  return true;
}
