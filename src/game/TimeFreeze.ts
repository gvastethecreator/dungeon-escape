/** Duration of the time-freeze pickup in gameplay seconds. */
export const TIME_FREEZE_DURATION_SECONDS = 10;

export function activateTimeFreeze(): number {
  return TIME_FREEZE_DURATION_SECONDS;
}

export function tickTimeFreeze(remaining: number, delta: number): number {
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  if (!Number.isFinite(delta) || delta <= 0)
    return Math.min(remaining, TIME_FREEZE_DURATION_SECONDS);
  return Math.max(0, remaining - delta);
}

export function isTimeFreezeActive(remaining: number): boolean {
  return Number.isFinite(remaining) && remaining > 0.0001;
}
