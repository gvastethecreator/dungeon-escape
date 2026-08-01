/**
 * Shared combat pose constants for vertical hit tests and floor-hazard clearance.
 * `player.y` in Play is the camera/eye height from FirstPersonController.
 */

/** Standing camera height shared by movement, combat, saves, and floor transitions. */
export const PLAYER_COMBAT_EYE_HEIGHT = 1.62;

/**
 * Jump height (eye rise above standing) that counts as airborne for floor traps.
 * Ignores ordinary stair/ground jitter of a few centimeters.
 */
export const PLAYER_AIRBORNE_JUMP_HEIGHT = 0.16;

/** Recover sole height from the eye/camera Y used in combat and world samples. */
export function playerFeetY(eyeY: number, eyeHeight: number = PLAYER_COMBAT_EYE_HEIGHT): number {
  const safeEye =
    Number.isFinite(eyeHeight) && eyeHeight > 0.5 ? eyeHeight : PLAYER_COMBAT_EYE_HEIGHT;
  return eyeY - safeEye;
}

/** True when feet have cleared the floor-trigger band used by hazards. */
export function isPlayerAirborneFromJumpHeight(jumpHeight: number): boolean {
  return Number.isFinite(jumpHeight) && jumpHeight > PLAYER_AIRBORNE_JUMP_HEIGHT;
}
