/** Timed control curse: invert look and movement axes. */

export const MIRROR_CURSE_DURATION_SECONDS = 12;

export function activateMirrorCurse(
  currentSeconds = 0,
  durationSeconds = MIRROR_CURSE_DURATION_SECONDS,
): number {
  return Math.max(Math.max(0, currentSeconds), Math.max(0, durationSeconds));
}

export function tickMirrorCurse(remainingSeconds: number, deltaSeconds: number): number {
  return Math.max(0, remainingSeconds - Math.max(0, deltaSeconds));
}

export function isMirrorCurseActive(remainingSeconds: number): boolean {
  return remainingSeconds > 0;
}
