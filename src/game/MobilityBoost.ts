/** Sprint-and-stamina pickup rules. Kept pure for save/resume and gameplay tests. */
export const MOBILITY_BOOST_DURATION_SECONDS = 14;
export const MOBILITY_BOOST_SPEED_MULTIPLIER = 1.18;

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
