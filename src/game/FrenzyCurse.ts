/** Timed enemy frenzy: faster pursuit and quicker attack cadence. */

import {
  activateTimedSeconds,
  isTimedSecondsActive,
  tickTimedSeconds,
} from "./TimedSeconds";

export const FRENZY_CURSE_DURATION_SECONDS = 18;
/** Multiplies enemy move speed while the curse is active. */
export const FRENZY_CURSE_SPEED_MULTIPLIER = 1.38;
/** Multiplies hit-cooldown drain so enemies strike more often. */
export const FRENZY_CURSE_ATTACK_RATE_MULTIPLIER = 1.45;
/** Multiplies detection range so enemies commit from farther out. */
export const FRENZY_CURSE_DETECTION_MULTIPLIER = 1.28;

export function activateFrenzyCurse(
  currentSeconds = 0,
  durationSeconds = FRENZY_CURSE_DURATION_SECONDS,
): number {
  return activateTimedSeconds(currentSeconds, durationSeconds);
}

export function tickFrenzyCurse(remainingSeconds: number, deltaSeconds: number): number {
  return tickTimedSeconds(remainingSeconds, deltaSeconds);
}

export function isFrenzyCurseActive(remainingSeconds: number): boolean {
  return isTimedSecondsActive(remainingSeconds);
}
