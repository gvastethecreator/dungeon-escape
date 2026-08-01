/**
 * Pure pickup HUD kicker and dataset.kind projection.
 * main.ts still owns DOM animation; this module owns flag priority.
 * Accepts the same flag shape as RunSessionEffects.pickup (label optional).
 */

export type PickupFeedbackKind =
  | "map"
  | "clarity"
  | "mobility"
  | "annihilation-pulse"
  | "luminous-ward"
  | "time-freeze"
  | "flask"
  | "stone"
  | "notice";

export interface PickupFeedbackFlags {
  /** Optional body label; host may render it without feeding kind policy. */
  label?: string;
  mapReveal?: boolean;
  fogClear?: boolean;
  mobilityBoost?: boolean;
  annihilationPulse?: boolean;
  luminousWard?: boolean;
  timeFreeze?: boolean;
  restoreResolve?: boolean;
  stoneId?: string;
}

export interface PickupFeedbackProjection {
  kind: PickupFeedbackKind;
  /** Key under COPY.pickup for the kicker line. */
  kickerKey:
    | "map"
    | "clarity"
    | "mobility"
    | "annihilationPulse"
    | "luminousWard"
    | "timeFreeze"
    | "flask"
    | "small"
    | "notice";
  stoneId?: string;
  /** True when the host should flash the vitals restore treatment. */
  restoreResolve: boolean;
}

/**
 * Resolve feedback kind and kicker from the same priority order as the Play host.
 * Map and clarity win over combat relics; stone wins over generic notice.
 */
export function projectPickupFeedback(flags: PickupFeedbackFlags = {}): PickupFeedbackProjection {
  const restoreResolve = Boolean(flags.restoreResolve);
  if (flags.mapReveal) {
    return { kind: "map", kickerKey: "map", restoreResolve };
  }
  if (flags.fogClear) {
    return { kind: "clarity", kickerKey: "clarity", restoreResolve };
  }
  if (flags.mobilityBoost) {
    return { kind: "mobility", kickerKey: "mobility", restoreResolve };
  }
  if (flags.annihilationPulse) {
    return { kind: "annihilation-pulse", kickerKey: "annihilationPulse", restoreResolve };
  }
  if (flags.luminousWard) {
    return { kind: "luminous-ward", kickerKey: "luminousWard", restoreResolve };
  }
  if (flags.timeFreeze) {
    return { kind: "time-freeze", kickerKey: "timeFreeze", restoreResolve };
  }
  if (restoreResolve) {
    return { kind: "flask", kickerKey: "flask", restoreResolve: true };
  }
  if (flags.stoneId) {
    return {
      kind: "stone",
      kickerKey: "small",
      stoneId: flags.stoneId,
      restoreResolve: false,
    };
  }
  return { kind: "notice", kickerKey: "notice", restoreResolve: false };
}
