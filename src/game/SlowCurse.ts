/** Timed player slowdown from a cursed chest. */

import {
  activateTimedSeconds,
  isTimedSecondsActive,
  tickTimedSeconds,
} from "./TimedSeconds";

export const SLOW_CURSE_DURATION_SECONDS = 14;
/** Multiplies walk/sprint while the curse is active. */
export const SLOW_CURSE_SPEED_MULTIPLIER = 0.72;

export function activateSlowCurse(
  currentSeconds = 0,
  durationSeconds = SLOW_CURSE_DURATION_SECONDS,
): number {
  return activateTimedSeconds(currentSeconds, durationSeconds);
}

export function tickSlowCurse(remainingSeconds: number, deltaSeconds: number): number {
  return tickTimedSeconds(remainingSeconds, deltaSeconds);
}

export function isSlowCurseActive(remainingSeconds: number): boolean {
  return isTimedSecondsActive(remainingSeconds);
}
