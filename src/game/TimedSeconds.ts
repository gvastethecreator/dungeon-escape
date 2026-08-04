/**
 * Shared duration clock for timed powers and curses.
 * Domain modules keep constants and call these helpers.
 */

/** Default activity floor used by freeze/ward-style clocks. */
export const TIMED_SECONDS_ACTIVE_EPSILON = 0.0001;

/**
 * Extend or refresh a window: remaining becomes max(current, duration).
 * Non-finite inputs collapse to zero before the max.
 */
export function activateTimedSeconds(
  currentSeconds = 0,
  durationSeconds = 0,
): number {
  const current = Number.isFinite(currentSeconds) ? Math.max(0, currentSeconds) : 0;
  const duration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  return Math.max(current, duration);
}

/**
 * Replace the window with a fixed duration (no max-with-current).
 * Used by time freeze and luminous ward.
 */
export function replaceTimedSeconds(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds)) return 0;
  return Math.max(0, durationSeconds);
}

/**
 * Count down a remaining window.
 * When `maxSeconds` is set and delta is not positive, remaining is clamped to that cap.
 */
export function tickTimedSeconds(
  remainingSeconds: number,
  deltaSeconds: number,
  options?: { maxSeconds?: number },
): number {
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return 0;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    if (options?.maxSeconds != null && Number.isFinite(options.maxSeconds)) {
      return Math.min(remainingSeconds, Math.max(0, options.maxSeconds));
    }
    return Math.max(0, remainingSeconds);
  }
  return Math.max(0, remainingSeconds - deltaSeconds);
}

/** True when a remaining window is still active. */
export function isTimedSecondsActive(
  remainingSeconds: number,
  epsilon = 0,
): boolean {
  return Number.isFinite(remainingSeconds) && remainingSeconds > epsilon;
}
