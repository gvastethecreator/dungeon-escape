/**
 * Pure projection of a Play step's damage/feedback intent.
 * main.ts executes DOM/audio; this owns wash-kind and hit-priority policy.
 */

import { resolveDamageWashKind, type DamageWashKind } from "./HazardFeel";
import type { HazardSurfaceEffect } from "../world/HazardTileSystem";

export interface PlayStepDamageInput {
  enemyDamage: number;
  surface: Pick<HazardSurfaceEffect, "kind" | "damage">;
  hasAttacker: boolean;
}

export interface PlayStepDamageIntent {
  /** Total health loss this step from combat + surface. */
  totalDamage: number;
  /** Whether the host should play hostile hit feedback. */
  playEnemyHit: boolean;
  washKind: DamageWashKind;
  /** Prefer attacker spatial hit; otherwise hazard sting only. */
  useAttackerAudio: boolean;
}

/**
 * Map world combat + surface sample into one feedback intent for the host frame.
 */
export function projectPlayStepDamage(input: PlayStepDamageInput): PlayStepDamageIntent {
  const enemyDamage = Math.max(0, input.enemyDamage);
  const surfaceDamage = Math.max(0, input.surface.damage);
  const totalDamage = enemyDamage + surfaceDamage;
  const playEnemyHit = totalDamage > 0;
  const washKind = resolveDamageWashKind(input.surface.kind, surfaceDamage);
  return {
    totalDamage,
    playEnemyHit,
    washKind,
    useAttackerAudio: playEnemyHit && input.hasAttacker && enemyDamage > 0,
  };
}
