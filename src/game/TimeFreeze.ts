/** Duration of the time-freeze pickup in gameplay seconds. */

import {
  TIMED_SECONDS_ACTIVE_EPSILON,
  isTimedSecondsActive,
  replaceTimedSeconds,
  tickTimedSeconds,
} from "./TimedSeconds";

export const TIME_FREEZE_DURATION_SECONDS = 10;

export function activateTimeFreeze(): number {
  return replaceTimedSeconds(TIME_FREEZE_DURATION_SECONDS);
}

export function tickTimeFreeze(remaining: number, delta: number): number {
  return tickTimedSeconds(remaining, delta, { maxSeconds: TIME_FREEZE_DURATION_SECONDS });
}

export function isTimeFreezeActive(remaining: number): boolean {
  return isTimedSecondsActive(remaining, TIMED_SECONDS_ACTIVE_EPSILON);
}
