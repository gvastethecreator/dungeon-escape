/**
 * Pure pickup HUD kicker and dataset.kind projection.
 * main.ts still owns DOM animation; this module owns flag priority.
 * Accepts the same flag shape as RunSessionEffects.pickup (label optional).
 */

export type PickupFeedbackKind =
  | "map"
  | "clarity"
  | "mobility"
  | "hand-torch"
  | "annihilation-pulse"
  | "cull-brand"
  | "phoenix-egg"
  | "luminous-ward"
  | "time-freeze"
  | "swarm-curse"
  | "slow-curse"
  | "frenzy-curse"
  | "gloom-curse"
  | "mirror-curse"
  | "spin-curse"
  | "flask"
  | "stone"
  | "notice";

export interface PickupFeedbackFlags {
  /** Optional body label; host may render it without feeding kind policy. */
  label?: string;
  mapReveal?: boolean;
  fogClear?: boolean;
  mobilityBoost?: boolean;
  handTorch?: boolean;
  annihilationPulse?: boolean;
  cullBrand?: boolean;
  phoenixEgg?: boolean;
  luminousWard?: boolean;
  timeFreeze?: boolean;
  swarmCurse?: boolean;
  slowCurse?: boolean;
  frenzyCurse?: boolean;
  gloomCurse?: boolean;
  mirrorCurse?: boolean;
  spinCurse?: boolean;
  restoreResolve?: boolean;
  stoneId?: string;
}

export interface PickupFeedbackProjection {
  kind: PickupFeedbackKind;
  /** Key under COPY.pickup for the small action line. */
  kickerKey: "itemFound" | "curseFound" | "notice";
  stoneId?: string;
  /** True when the host should flash the vitals restore treatment. */
  restoreResolve: boolean;
}

/**
 * Resolve feedback kind and kicker from the same priority order as the Play host.
 * Map and clarity win over combat relics; curses outrank generic notice; stone wins next.
 * Kicker is only ITEM FOUND / CURSE FOUND (plus notice for non-loot lines).
 */
export function projectPickupFeedback(flags: PickupFeedbackFlags = {}): PickupFeedbackProjection {
  const restoreResolve = Boolean(flags.restoreResolve);
  if (flags.mapReveal) {
    return { kind: "map", kickerKey: "itemFound", restoreResolve };
  }
  if (flags.fogClear) {
    return { kind: "clarity", kickerKey: "itemFound", restoreResolve };
  }
  if (flags.mobilityBoost) {
    return { kind: "mobility", kickerKey: "itemFound", restoreResolve };
  }
  if (flags.handTorch) {
    return { kind: "hand-torch", kickerKey: "itemFound", restoreResolve };
  }
  if (flags.annihilationPulse) {
    return { kind: "annihilation-pulse", kickerKey: "itemFound", restoreResolve };
  }
  if (flags.cullBrand) {
    return { kind: "cull-brand", kickerKey: "itemFound", restoreResolve };
  }
  if (flags.phoenixEgg) {
    return { kind: "phoenix-egg", kickerKey: "itemFound", restoreResolve };
  }
  if (flags.luminousWard) {
    return { kind: "luminous-ward", kickerKey: "itemFound", restoreResolve };
  }
  if (flags.timeFreeze) {
    return { kind: "time-freeze", kickerKey: "itemFound", restoreResolve };
  }
  if (flags.swarmCurse) {
    return { kind: "swarm-curse", kickerKey: "curseFound", restoreResolve };
  }
  if (flags.slowCurse) {
    return { kind: "slow-curse", kickerKey: "curseFound", restoreResolve };
  }
  if (flags.frenzyCurse) {
    return { kind: "frenzy-curse", kickerKey: "curseFound", restoreResolve };
  }
  if (flags.gloomCurse) {
    return { kind: "gloom-curse", kickerKey: "curseFound", restoreResolve };
  }
  if (flags.mirrorCurse) {
    return { kind: "mirror-curse", kickerKey: "curseFound", restoreResolve };
  }
  if (flags.spinCurse) {
    return { kind: "spin-curse", kickerKey: "curseFound", restoreResolve };
  }
  if (restoreResolve) {
    return { kind: "flask", kickerKey: "itemFound", restoreResolve: true };
  }
  if (flags.stoneId) {
    return {
      kind: "stone",
      kickerKey: "itemFound",
      stoneId: flags.stoneId,
      restoreResolve: false,
    };
  }
  return { kind: "notice", kickerKey: "notice", restoreResolve: false };
}
