/** Timed control curse: invert look and movement axes. */

import {
  activateTimedSeconds,
  isTimedSecondsActive,
  tickTimedSeconds,
} from "./TimedSeconds";

export const MIRROR_CURSE_DURATION_SECONDS = 12;

export function activateMirrorCurse(
  currentSeconds = 0,
  durationSeconds = MIRROR_CURSE_DURATION_SECONDS,
): number {
  return activateTimedSeconds(currentSeconds, durationSeconds);
}

export function tickMirrorCurse(remainingSeconds: number, deltaSeconds: number): number {
  return tickTimedSeconds(remainingSeconds, deltaSeconds);
}

export function isMirrorCurseActive(remainingSeconds: number): boolean {
  return isTimedSecondsActive(remainingSeconds);
}
