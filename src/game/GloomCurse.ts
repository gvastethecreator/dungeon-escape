/** Timed darkness curse: denser fog and a dimmer lantern. */

import { activateTimedSeconds, isTimedSecondsActive, tickTimedSeconds } from "./TimedSeconds";

export const GLOOM_CURSE_DURATION_SECONDS = 20;
/**
 * Multiplies exploration fog density while active.
 * Clarity (fog clear) always wins when both windows overlap.
 */
export const GLOOM_CURSE_FOG_MULTIPLIER = 1.95;
/** Scales the player lantern while the curse is active. */
export const GLOOM_CURSE_LANTERN_MULTIPLIER = 0.52;

export function activateGloomCurse(
  currentSeconds = 0,
  durationSeconds = GLOOM_CURSE_DURATION_SECONDS,
): number {
  return activateTimedSeconds(currentSeconds, durationSeconds);
}

export function tickGloomCurse(remainingSeconds: number, deltaSeconds: number): number {
  return tickTimedSeconds(remainingSeconds, deltaSeconds);
}

export function isGloomCurseActive(remainingSeconds: number): boolean {
  return isTimedSecondsActive(remainingSeconds);
}
