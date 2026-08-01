/**
 * Pure adaptive CRT enable/disable hysteresis for the Play frame budget.
 * main.ts applies WebGL and UI; this module owns the auto state machine.
 */

export const ADAPTIVE_CRT_RECOVER_HYSTERESIS_MS = 8;

export interface AdaptiveCrtState {
  /** Whether CRT is currently on for presentation. */
  enabled: boolean;
  /** True after auto-disable until recovery. */
  autoDisabled: boolean;
}

export interface AdaptiveCrtStepInput {
  /** Smoothed frame cost in milliseconds. */
  frameMs: number;
  /** Disable when frame cost is at or above this value. */
  disableMs: number;
  /** Gap below disableMs required before auto re-enable. */
  recoverHysteresisMs?: number;
  /** When true, auto policy does not change state. */
  manualOverride: boolean;
  /** Default CRT preference after recovery (from render caps). */
  enableByDefault: boolean;
}

/**
 * Step adaptive CRT. Manual override freezes the previous state.
 * Disable uses `frameMs >= disableMs`. Recover uses
 * `frameMs <= disableMs - hysteresis` and restores `enableByDefault`.
 */
export function stepAdaptiveCrt(
  state: AdaptiveCrtState,
  input: AdaptiveCrtStepInput,
): AdaptiveCrtState {
  if (input.manualOverride) {
    return { enabled: state.enabled, autoDisabled: state.autoDisabled };
  }

  const hysteresis =
    input.recoverHysteresisMs === undefined
      ? ADAPTIVE_CRT_RECOVER_HYSTERESIS_MS
      : input.recoverHysteresisMs;
  const frameMs = Number.isFinite(input.frameMs) ? input.frameMs : 0;
  const disableMs = Number.isFinite(input.disableMs) ? input.disableMs : 0;

  if (!state.autoDisabled && state.enabled && frameMs >= disableMs) {
    return { enabled: false, autoDisabled: true };
  }

  if (state.autoDisabled && !state.enabled && frameMs <= disableMs - hysteresis) {
    return {
      enabled: Boolean(input.enableByDefault),
      autoDisabled: false,
    };
  }

  return { enabled: state.enabled, autoDisabled: state.autoDisabled };
}
