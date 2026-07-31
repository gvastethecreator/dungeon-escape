/**
 * Shared horizontal reach checks for doors, chests, stairs, and pickups.
 * Keeps Play interaction distance policy out of ad-hoc Math.hypot copies.
 */

export function horizontalDistance2(
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  return Math.hypot(ax - bx, az - bz);
}

export function horizontalDistance(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  return horizontalDistance2(a.x, a.z, b.x, b.z);
}

/** True when the player is within `range` of a world anchor on XZ. */
export function inInteractionRange(
  player: { x: number; z: number },
  target: { x: number; z: number },
  range: number,
): boolean {
  return horizontalDistance(player, target) <= range;
}

/** Prefer the nearest in-range target; returns null when none qualify. */
export function nearestInRangeIndex(
  player: { x: number; z: number },
  targets: readonly { x: number; z: number }[],
  range: number,
): number | null {
  let bestIndex: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < targets.length; index += 1) {
    const distance = horizontalDistance(player, targets[index]!);
    if (distance > range || distance >= bestDistance) continue;
    bestDistance = distance;
    bestIndex = index;
  }
  return bestIndex;
}
