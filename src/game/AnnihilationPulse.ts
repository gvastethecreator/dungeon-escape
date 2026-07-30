/** Runtime rules for the annihilation pulse pickup. */
export const ANNIHILATION_PULSE_DURATION_SECONDS = 13;
export const ANNIHILATION_PULSE_INTERVAL_SECONDS = 2.8;
/** Maximum horizontal reach of one expanding kill ring. */
export const ANNIHILATION_PULSE_RADIUS = 7.2;
/** Enemies keep distance from the bearer between pulses. */
export const ANNIHILATION_PULSE_REPEL_RADIUS = 11.5;
/** The escape motion is deliberately stronger than the luminous ward. */
export const ANNIHILATION_PULSE_REPEL_SPEED_MULTIPLIER = 1.85;

export interface AnnihilationPulseClock {
  remaining: number;
  timeSincePulse: number;
}

export function createAnnihilationPulseClock(): AnnihilationPulseClock {
  return { remaining: 0, timeSincePulse: 0 };
}

export function activateAnnihilationPulse(clock: AnnihilationPulseClock): void {
  clock.remaining = ANNIHILATION_PULSE_DURATION_SECONDS;
  // The first pulse lands after one full interval, giving the pickup feedback
  // time to read before the field fires.
  clock.timeSincePulse = 0;
}

/** Advance the field and return how many pulse rings should fire this tick. */
export function tickAnnihilationPulse(clock: AnnihilationPulseClock, delta: number): number {
  if (!Number.isFinite(clock.remaining) || clock.remaining <= 0) {
    clock.remaining = 0;
    clock.timeSincePulse = 0;
    return 0;
  }

  const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
  clock.remaining = Math.max(0, clock.remaining - safeDelta);
  if (clock.remaining <= 0) {
    clock.timeSincePulse = 0;
    return 0;
  }

  clock.timeSincePulse += safeDelta;
  let pulses = 0;
  // A capped catch-up keeps a long tab wake-up from spawning unbounded work.
  while (clock.timeSincePulse >= ANNIHILATION_PULSE_INTERVAL_SECONDS && pulses < 4) {
    clock.timeSincePulse -= ANNIHILATION_PULSE_INTERVAL_SECONDS;
    pulses += 1;
  }
  return pulses;
}

export function isAnnihilationPulseActive(clock: AnnihilationPulseClock): boolean {
  return Number.isFinite(clock.remaining) && clock.remaining > 0.0001;
}
