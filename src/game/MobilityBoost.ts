/** Sprint-and-stamina pickup rules. Kept pure for save/resume and gameplay tests. */
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
  return Math.max(Math.max(0, currentSeconds), Math.max(0, durationSeconds));
}

export function tickMobilityBoost(remainingSeconds: number, deltaSeconds: number): number {
  return Math.max(0, remainingSeconds - Math.max(0, deltaSeconds));
}

export function isMobilityBoostActive(remainingSeconds: number): boolean {
  return remainingSeconds > 0;
}
