/** Timed player slowdown from a cursed chest. */

export const SLOW_CURSE_DURATION_SECONDS = 14;
/** Multiplies walk/sprint while the curse is active. */
export const SLOW_CURSE_SPEED_MULTIPLIER = 0.72;

export function activateSlowCurse(
  currentSeconds = 0,
  durationSeconds = SLOW_CURSE_DURATION_SECONDS,
): number {
  return Math.max(Math.max(0, currentSeconds), Math.max(0, durationSeconds));
}

export function tickSlowCurse(remainingSeconds: number, deltaSeconds: number): number {
  return Math.max(0, remainingSeconds - Math.max(0, deltaSeconds));
}

export function isSlowCurseActive(remainingSeconds: number): boolean {
  return remainingSeconds > 0;
}
