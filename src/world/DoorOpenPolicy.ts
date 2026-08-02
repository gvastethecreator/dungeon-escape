/**
 * Pure auto-door open latch and collision flags.
 * DungeonWorld damps meshes; this module owns target state and thresholds.
 * Once a door opens, it stays open for the rest of the run.
 */

export const DOOR_DEFAULT_OPEN_DISTANCE = 2.65;
/** Kept for callers/tests; close-by-distance is disabled (latch-open policy). */
export const DOOR_DEFAULT_CLOSE_DISTANCE = 3.7;
export const DOOR_PASSABLE_OPENNESS = 0.82;
export const DOOR_CLOSED_OPENNESS = 0.08;

/**
 * Latch-open: open inside openDistance, then never re-close by distance.
 * `closeDistance` is accepted for API stability but ignored.
 */
export function resolveDoorTargetOpen(
  previousTargetOpen: boolean,
  distance: number,
  openDistance: number = DOOR_DEFAULT_OPEN_DISTANCE,
  _closeDistance: number = DOOR_DEFAULT_CLOSE_DISTANCE,
): boolean {
  if (previousTargetOpen) return true;
  if (!Number.isFinite(distance)) return previousTargetOpen;
  if (distance < openDistance) return true;
  return previousTargetOpen;
}

/** True when openness is high enough for the player to pass the leaf gap. */
export function isDoorPassable(openness: number): boolean {
  return Number.isFinite(openness) && openness > DOOR_PASSABLE_OPENNESS;
}

/** True when the door reads as shut for collision / audio. */
export function isDoorClosed(openness: number): boolean {
  return Number.isFinite(openness) && openness < DOOR_CLOSED_OPENNESS;
}
