/**
 * Sprint stamina: drain while running, regenerate while walking/idle.
 * Full exhaustion is slower to recover than releasing early.
 */

export interface StaminaConfig {
  /** Peak stamina in seconds of sprint. */
  max: number;
  /** Stamina lost per second while sprinting. */
  drainPerSecond: number;
  /** Regen per second when not exhausted (released early). */
  regenEarlyPerSecond: number;
  /** Regen per second after full exhaustion. */
  regenExhaustedPerSecond: number;
  /**
   * After exhaustion, sprint stays locked until stamina reaches this fraction
   * of max (0..1). Prevents micro-sprint flicker at zero.
   */
  recoverRatio: number;
}

export interface StaminaState {
  value: number;
  exhausted: boolean;
}

export interface StaminaStepResult {
  value: number;
  /** 0..1 fill for meters. */
  ratio: number;
  exhausted: boolean;
  /** True when sprint speed should apply this frame. */
  sprinting: boolean;
  /** True on the frame stamina first hits empty. */
  justExhausted: boolean;
  canSprint: boolean;
}

export const STAMINA_MAX = 10;
/** Full bar lasts 10 seconds of continuous sprint. */
export const STAMINA_DRAIN_PER_SEC = 1;
/** Early release: full bar returns in ~4 seconds. */
export const STAMINA_REGEN_EARLY_PER_SEC = 2.5;
/** Exhausted: full bar returns in ~8 seconds. */
export const STAMINA_REGEN_EXHAUSTED_PER_SEC = 1.25;
/** Must recover this fraction before sprinting again after a full drain. */
export const STAMINA_RECOVER_RATIO = 0.35;

export const DEFAULT_STAMINA_CONFIG: Readonly<StaminaConfig> = Object.freeze({
  max: STAMINA_MAX,
  drainPerSecond: STAMINA_DRAIN_PER_SEC,
  regenEarlyPerSecond: STAMINA_REGEN_EARLY_PER_SEC,
  regenExhaustedPerSecond: STAMINA_REGEN_EXHAUSTED_PER_SEC,
  recoverRatio: STAMINA_RECOVER_RATIO,
});

export function createStaminaState(max = STAMINA_MAX): StaminaState {
  return { value: max, exhausted: false };
}

export function resetStamina(state: StaminaState, max = STAMINA_MAX): void {
  state.value = max;
  state.exhausted = false;
}

export function staminaRatio(state: StaminaState, max = STAMINA_MAX): number {
  if (max <= 0) return 0;
  return clamp01(state.value / max);
}

/**
 * Advance stamina for one frame.
 * Drain only while the player is actually sprint-running (intent + can sprint).
 */
export function stepStamina(
  state: StaminaState,
  delta: number,
  wantsSprint: boolean,
  hasMoveIntent: boolean,
  config: Readonly<StaminaConfig> = DEFAULT_STAMINA_CONFIG,
): StaminaStepResult {
  const dt = Math.min(Math.max(delta, 0), 0.05);
  const max = Math.max(0.001, config.max);
  const recoverAt = max * clamp01(config.recoverRatio);

  if (state.exhausted && state.value >= recoverAt) {
    state.exhausted = false;
  }

  const canSprint = state.value > 0 && !state.exhausted;
  const sprinting = wantsSprint && hasMoveIntent && canSprint;
  let justExhausted = false;

  if (sprinting) {
    const previous = state.value;
    state.value = Math.max(0, state.value - config.drainPerSecond * dt);
    if (previous > 0 && state.value <= 0) {
      state.value = 0;
      state.exhausted = true;
      justExhausted = true;
    }
  } else {
    const regen = state.exhausted
      ? config.regenExhaustedPerSecond
      : config.regenEarlyPerSecond;
    if (regen > 0 && state.value < max) {
      state.value = Math.min(max, state.value + regen * dt);
    }
    if (state.exhausted && state.value >= recoverAt) {
      state.exhausted = false;
    }
  }

  const canSprintAfter = state.value > 0 && !state.exhausted;
  return {
    value: state.value,
    ratio: clamp01(state.value / max),
    exhausted: state.exhausted,
    sprinting,
    justExhausted,
    canSprint: canSprintAfter,
  };
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
