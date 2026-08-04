/** Temporary vision pickup: clears exploration/scene fog for a short window. */

import {
  activateTimedSeconds,
  isTimedSecondsActive,
  tickTimedSeconds,
} from "./TimedSeconds";

export const FOG_CLEAR_DURATION_SECONDS = 20;

export function activateFogClear(
  currentSeconds = 0,
  durationSeconds = FOG_CLEAR_DURATION_SECONDS,
): number {
  return activateTimedSeconds(currentSeconds, durationSeconds);
}

export function tickFogClear(remainingSeconds: number, deltaSeconds: number): number {
  return tickTimedSeconds(remainingSeconds, deltaSeconds);
}

export function isFogClearActive(remainingSeconds: number): boolean {
  return isTimedSecondsActive(remainingSeconds);
}
