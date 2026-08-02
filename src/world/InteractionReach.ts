/**
 * Shared horizontal reach checks for doors, chests, stairs, and pickups.
 * Owns Play grab radii; presentation modules only re-export for expand-contract.
 */

/** Chest open prompt and interact radius. */
export const CHEST_INTERACTION_DISTANCE = 1.9;
/** Default pickup grab radius (health flasks, power rewards). */
export const PICKUP_COLLECTION_DISTANCE = 1.18;
/** Magic stones get a wider grab so dense props near the seat cannot softlock a run. */
export const STONE_COLLECTION_DISTANCE = 1.55;

export type PickupReachKind = "stone" | "other" | string;

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

export function canInteractWithChest(distance: number, opened: boolean): boolean {
  return !opened && Number.isFinite(distance) && distance <= CHEST_INTERACTION_DISTANCE;
}

/**
 * Chest open intent: explicit interact (E / UI) or hold-click auto-open.
 * Stairs must not use mouseForwardHeld.
 */
export function shouldOpenChest(interactPressed: boolean, mouseForwardHeld: boolean): boolean {
  return Boolean(interactPressed || mouseForwardHeld);
}

/** Point-form of chest reach for callers that still have world positions. */
export function canInteractWithChestAt(
  player: { x: number; z: number },
  chest: { x: number; z: number },
  opened: boolean,
): boolean {
  return !opened && inInteractionRange(player, chest, CHEST_INTERACTION_DISTANCE);
}

export function canCollectPickup(
  distance: number,
  autoCollect = false,
  kind: PickupReachKind = "other",
): boolean {
  if (autoCollect) return true;
  if (!Number.isFinite(distance)) return false;
  const limit = kind === "stone" ? STONE_COLLECTION_DISTANCE : PICKUP_COLLECTION_DISTANCE;
  return distance <= limit;
}

export function canCollectPickupAt(
  player: { x: number; z: number },
  pickup: { x: number; z: number },
  autoCollect = false,
  kind: PickupReachKind = "other",
): boolean {
  if (autoCollect) return true;
  const limit = kind === "stone" ? STONE_COLLECTION_DISTANCE : PICKUP_COLLECTION_DISTANCE;
  return inInteractionRange(player, pickup, limit);
}
