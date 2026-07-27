/** Duration of the luminous ward pickup in gameplay seconds. */
export const LUMINOUS_WARD_DURATION_SECONDS = 30;

/** Enemies keep this horizontal distance while the ward is active. */
export const LUMINOUS_WARD_REPEL_RADIUS = 8.25;

export function activateLuminousWard(): number {
  return LUMINOUS_WARD_DURATION_SECONDS;
}

export function tickLuminousWard(remaining: number, delta: number): number {
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;
  if (!Number.isFinite(delta) || delta <= 0)
    return Math.min(remaining, LUMINOUS_WARD_DURATION_SECONDS);
  return Math.max(0, remaining - delta);
}

export function isLuminousWardActive(remaining: number): boolean {
  return Number.isFinite(remaining) && remaining > 0.0001;
}
