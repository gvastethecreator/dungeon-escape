/** Timed control curse: continuous yaw bias that disorients aim. */

import { activateTimedSeconds, isTimedSecondsActive, tickTimedSeconds } from "./TimedSeconds";

export const SPIN_CURSE_DURATION_SECONDS = 10;
/** Radians per second added to look yaw while active. */
export const SPIN_CURSE_YAW_BIAS = 0.55;
/** Look sensitivity scale while spinning (slightly twitchier). */
export const SPIN_CURSE_SENSITIVITY_SCALE = 1.1;

export function activateSpinCurse(
  currentSeconds = 0,
  durationSeconds = SPIN_CURSE_DURATION_SECONDS,
): number {
  return activateTimedSeconds(currentSeconds, durationSeconds);
}

export function tickSpinCurse(remainingSeconds: number, deltaSeconds: number): number {
  return tickTimedSeconds(remainingSeconds, deltaSeconds);
}

export function isSpinCurseActive(remainingSeconds: number): boolean {
  return isTimedSecondsActive(remainingSeconds);
}
