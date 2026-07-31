/** Temporary vision pickup: clears exploration/scene fog for a short window. */
export const FOG_CLEAR_DURATION_SECONDS = 20;

export function activateFogClear(
  currentSeconds = 0,
  durationSeconds = FOG_CLEAR_DURATION_SECONDS,
): number {
  return Math.max(Math.max(0, currentSeconds), Math.max(0, durationSeconds));
}

export function tickFogClear(remainingSeconds: number, deltaSeconds: number): number {
  return Math.max(0, remainingSeconds - Math.max(0, deltaSeconds));
}

export function isFogClearActive(remainingSeconds: number): boolean {
  return remainingSeconds > 0;
}
