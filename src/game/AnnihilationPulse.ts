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

/** Enemies below this phase visibility do not take a pulse hit. */
export const ANNIHILATION_PULSE_MIN_PHASE_VISIBILITY = 0.04;
/** Floor for enemy body reach when scale is very small. */
export const ANNIHILATION_PULSE_ENEMY_REACH_MIN = 0.28;
/** Scale factor applied to the smaller of scaleX/scaleY for body reach. */
export const ANNIHILATION_PULSE_ENEMY_REACH_SCALE = 0.2;

export interface AnnihilationPulseEnemyPose {
  defeated: boolean;
  scaleX: number;
  scaleY: number;
  phaseVisibility: number;
  position: { x: number; z: number };
  /** Base sprite scale used for body reach (falls back to live scale). */
  baseScaleX?: number;
  baseScaleY?: number;
}

/**
 * Horizontal body reach added to the kill ring radius for one enemy pose.
 */
export function annihilationPulseEnemyReach(enemy: AnnihilationPulseEnemyPose): number {
  const scaleX = enemy.baseScaleX ?? enemy.scaleX;
  const scaleY = enemy.baseScaleY ?? enemy.scaleY;
  const body = Math.min(scaleX, scaleY) * ANNIHILATION_PULSE_ENEMY_REACH_SCALE;
  return Math.max(ANNIHILATION_PULSE_ENEMY_REACH_MIN, body);
}

/**
 * True when the pulse origin kills this enemy pose.
 * Skips defeated, near-zero scale, and spectral low-visibility seats.
 */
export function annihilationPulseHitsEnemy(
  origin: { x: number; z: number },
  enemy: AnnihilationPulseEnemyPose,
  radius: number = ANNIHILATION_PULSE_RADIUS,
): boolean {
  if (
    enemy.defeated ||
    enemy.scaleX <= 0.001 ||
    enemy.scaleY <= 0.001 ||
    enemy.phaseVisibility < ANNIHILATION_PULSE_MIN_PHASE_VISIBILITY
  ) {
    return false;
  }
  const distance = Math.hypot(enemy.position.x - origin.x, enemy.position.z - origin.z);
  return distance <= radius + annihilationPulseEnemyReach(enemy);
}
