/** Timed control curse: continuous yaw bias that disorients aim. */

export const SPIN_CURSE_DURATION_SECONDS = 10;
/** Radians per second added to look yaw while active. */
export const SPIN_CURSE_YAW_BIAS = 0.55;
/** Look sensitivity scale while spinning (slightly twitchier). */
export const SPIN_CURSE_SENSITIVITY_SCALE = 1.1;

export function activateSpinCurse(
  currentSeconds = 0,
  durationSeconds = SPIN_CURSE_DURATION_SECONDS,
): number {
  return Math.max(Math.max(0, currentSeconds), Math.max(0, durationSeconds));
}

export function tickSpinCurse(remainingSeconds: number, deltaSeconds: number): number {
  return Math.max(0, remainingSeconds - Math.max(0, deltaSeconds));
}

export function isSpinCurseActive(remainingSeconds: number): boolean {
  return remainingSeconds > 0;
}
