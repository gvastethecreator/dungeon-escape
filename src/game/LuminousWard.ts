/** Duration of the luminous ward pickup in gameplay seconds. */

import {
  TIMED_SECONDS_ACTIVE_EPSILON,
  isTimedSecondsActive,
  replaceTimedSeconds,
  tickTimedSeconds,
} from "./TimedSeconds";

export const LUMINOUS_WARD_DURATION_SECONDS = 15;

/** Enemies keep this horizontal distance while the ward is active. */
export const LUMINOUS_WARD_REPEL_RADIUS = 8.25;

export function activateLuminousWard(): number {
  return replaceTimedSeconds(LUMINOUS_WARD_DURATION_SECONDS);
}

export function tickLuminousWard(remaining: number, delta: number): number {
  return tickTimedSeconds(remaining, delta, { maxSeconds: LUMINOUS_WARD_DURATION_SECONDS });
}

export function isLuminousWardActive(remaining: number): boolean {
  return isTimedSecondsActive(remaining, TIMED_SECONDS_ACTIVE_EPSILON);
}
