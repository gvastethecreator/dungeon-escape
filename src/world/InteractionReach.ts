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
/**
 * Max |player.y - target.y| for interact/collect across stacked slabs.
 * Keeps same-XZ objects on other stories out of reach (~half a story).
 */
export const INTERACTION_VERTICAL_BAND = 2.2;

export type PickupReachKind = "stone" | "other" | string;

export function horizontalDistance2(ax: number, az: number, bx: number, bz: number): number {
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

/** True when vertical separation is within the multi-slab interact band. */
export function inVerticalInteractionBand(
  playerY: number,
  targetY: number,
  band = INTERACTION_VERTICAL_BAND,
): boolean {
  if (!Number.isFinite(playerY) || !Number.isFinite(targetY)) return true;
  return Math.abs(playerY - targetY) <= band;
}

/** XZ range plus optional vertical band (required for multi-slab stacks). */
export function inInteractionRange3d(
  player: { x: number; y?: number; z: number },
  target: { x: number; y?: number; z: number },
  range: number,
  verticalBand = INTERACTION_VERTICAL_BAND,
): boolean {
  if (!inInteractionRange(player, target, range)) return false;
  if (player.y === undefined || target.y === undefined) return true;
  return inVerticalInteractionBand(player.y, target.y, verticalBand);
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

export function canInteractWithChest(
  distance: number,
  opened: boolean,
  verticalDelta?: number,
): boolean {
  if (opened || !Number.isFinite(distance) || distance > CHEST_INTERACTION_DISTANCE) {
    return false;
  }
  if (
    verticalDelta !== undefined &&
    Number.isFinite(verticalDelta) &&
    Math.abs(verticalDelta) > INTERACTION_VERTICAL_BAND
  ) {
    return false;
  }
  return true;
}

/**
 * Chest open intent: explicit interact (F / UI) or hold-click auto-open.
 * Stairs must not use mouseForwardHeld.
 */
export function shouldOpenChest(interactPressed: boolean, mouseForwardHeld: boolean): boolean {
  return Boolean(interactPressed || mouseForwardHeld);
}

/** Point-form of chest reach for callers that still have world positions. */
export function canInteractWithChestAt(
  player: { x: number; y?: number; z: number },
  chest: { x: number; y?: number; z: number },
  opened: boolean,
): boolean {
  return !opened && inInteractionRange3d(player, chest, CHEST_INTERACTION_DISTANCE);
}

export function canCollectPickup(
  distance: number,
  autoCollect = false,
  kind: PickupReachKind = "other",
  verticalDelta?: number,
): boolean {
  if (
    verticalDelta !== undefined &&
    Number.isFinite(verticalDelta) &&
    Math.abs(verticalDelta) > INTERACTION_VERTICAL_BAND
  ) {
    return false;
  }
  if (autoCollect) return true;
  if (!Number.isFinite(distance)) return false;
  const limit = kind === "stone" ? STONE_COLLECTION_DISTANCE : PICKUP_COLLECTION_DISTANCE;
  if (distance > limit) return false;
  return true;
}

export function canCollectPickupAt(
  player: { x: number; y?: number; z: number },
  pickup: { x: number; y?: number; z: number },
  autoCollect = false,
  kind: PickupReachKind = "other",
): boolean {
  if (
    player.y !== undefined &&
    pickup.y !== undefined &&
    !inVerticalInteractionBand(player.y, pickup.y)
  ) {
    return false;
  }
  if (autoCollect) return true;
  const limit = kind === "stone" ? STONE_COLLECTION_DISTANCE : PICKUP_COLLECTION_DISTANCE;
  return inInteractionRange3d(player, pickup, limit);
}
