/**
 * Pure auto-door open/close hysteresis and collision flags.
 * DungeonWorld damps meshes; this module owns target state and thresholds.
 */

export const DOOR_DEFAULT_OPEN_DISTANCE = 2.65;
export const DOOR_DEFAULT_CLOSE_DISTANCE = 3.7;
export const DOOR_PASSABLE_OPENNESS = 0.82;
export const DOOR_CLOSED_OPENNESS = 0.08;

/**
 * Hysteresis: open inside openDistance, close outside closeDistance, else hold.
 */
export function resolveDoorTargetOpen(
  previousTargetOpen: boolean,
  distance: number,
  openDistance: number = DOOR_DEFAULT_OPEN_DISTANCE,
  closeDistance: number = DOOR_DEFAULT_CLOSE_DISTANCE,
): boolean {
  if (!Number.isFinite(distance)) return previousTargetOpen;
  if (distance < openDistance) return true;
  if (distance > closeDistance) return false;
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
