/**
 * Enemy ↔ player contact volumes for combat ticks.
 * Horizontal range stays on the archetype; this module owns vertical vault rules.
 */

import type { EnemyArchetype } from "./EnemyArchetypes";
import { PLAYER_COMBAT_EYE_HEIGHT, playerFeetY } from "../player/CombatPose";

export { PLAYER_COMBAT_EYE_HEIGHT };

export interface EnemyContactBody {
  position: { x: number; y: number; z: number };
  baseY: number;
}

/**
 * Soles must reach this far into the enemy top band (or above it) to vault.
 * A few centimeters of forgiveness keeps jump-overs readable.
 */
const VAULT_CLEARANCE_METERS = 0.05;

/**
 * Solid body height for contact. Low-profile crawlers use a hard top cap so a
 * mid jump (well below double-jump apex) reliably vaults them; tall humanoids
 * keep nearly full authored height.
 */
function enemySolidBodyHeight(
  archetype: Pick<EnemyArchetype, "height" | "lowProfile">,
): number {
  const ratio = archetype.lowProfile ? 0.8 : 0.92;
  const body = archetype.height * ratio;
  // ~0.7 m top: single-jump apex is ~0.99 m of feet clearance in play stats.
  return archetype.lowProfile ? Math.min(body, 0.7) : body;
}

export interface VerticalRange {
  minY: number;
  maxY: number;
}

/** Player hurt volume from soles to just above the eyes. */
export function playerHurtVerticalRange(
  playerY: number,
  eyeHeight = PLAYER_COMBAT_EYE_HEIGHT,
): VerticalRange {
  const feetY = playerFeetY(playerY, eyeHeight);
  return {
    minY: feetY,
    maxY: playerY + 0.18,
  };
}

/**
 * Enemy contact volume in world Y. Includes hover seat and the current bob /
 * pounce / flight offset from the authored base center.
 */
export function enemyContactVerticalRange(
  enemy: EnemyContactBody,
  archetype: Pick<EnemyArchetype, "height" | "hoverOffset" | "lowProfile">,
): VerticalRange {
  const bob = enemy.position.y - enemy.baseY;
  const seat = archetype.hoverOffset + bob;
  const minY = Math.max(0, seat - 0.08);
  const maxY = enemySolidBodyHeight(archetype) + seat;
  return {
    minY,
    maxY: Math.max(minY + 0.1, maxY),
  };
}

/**
 * True when the player body still intersects the enemy strike volume on Y.
 * Jumping so soles clear the enemy top is a successful vault (no contact).
 */
export function enemyStrikesPlayerVertically(
  playerY: number,
  enemy: EnemyContactBody,
  archetype: Pick<EnemyArchetype, "height" | "hoverOffset" | "lowProfile">,
  eyeHeight = PLAYER_COMBAT_EYE_HEIGHT,
): boolean {
  const playerBand = playerHurtVerticalRange(playerY, eyeHeight);
  const enemyBand = enemyContactVerticalRange(enemy, archetype);
  // Vault: feet at or above the solid top (with a small clearance).
  if (playerBand.minY >= enemyBand.maxY - VAULT_CLEARANCE_METERS) return false;
  // Entirely under the strike volume (rare; floating hazards).
  if (playerBand.maxY <= enemyBand.minY) return false;
  return true;
}
