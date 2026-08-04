/** Sprint-and-stamina pickup rules. Kept pure for save/resume and gameplay tests. */

import {
  activateTimedSeconds,
  isTimedSecondsActive,
  tickTimedSeconds,
} from "./TimedSeconds";

export const MOBILITY_BOOST_DURATION_SECONDS = 14;
export const MOBILITY_BOOST_SPEED_MULTIPLIER = 1.28;
/** Head-bob amplitude scale while the boost runs (speed sensation). */
export const MOBILITY_BOOST_CAMERA_BOB_SCALE = 1.95;
/** Extra FOV degrees at full stride while boosted. */
export const MOBILITY_BOOST_FOV_KICK = 3.4;
/** Stride length scale: shorter strides raise the footstep cadence. */
export const MOBILITY_BOOST_STRIDE_RATE = 0.78;
/** Footstep loudness while boosted (heavier, faster-feeling steps). */
export const MOBILITY_BOOST_FOOTSTEP_GAIN = 2.15;

export function activateMobilityBoost(
  currentSeconds = 0,
  durationSeconds = MOBILITY_BOOST_DURATION_SECONDS,
): number {
  return activateTimedSeconds(currentSeconds, durationSeconds);
}

export function tickMobilityBoost(remainingSeconds: number, deltaSeconds: number): number {
  return tickTimedSeconds(remainingSeconds, deltaSeconds);
}

export function isMobilityBoostActive(remainingSeconds: number): boolean {
  return isTimedSecondsActive(remainingSeconds);
}
