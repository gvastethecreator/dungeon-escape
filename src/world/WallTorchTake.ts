/**
 * Wall-sconce grab rules and extinguish presentation.
 * DungeonWorld owns the interact prompt; this module owns takeability + burn-out.
 */

import type { StaticFireEffect } from "./StaticDungeonScene";
import { INTERACTION_VERTICAL_BAND } from "./InteractionReach";

/** Reach for F-take on wall torches / lanterns (slightly past chest grab). */
export const WALL_TORCH_INTERACTION_DISTANCE = 2.05;

export function canTakeWallTorch(
  distance: number,
  effect: Pick<StaticFireEffect, "takeable" | "taken">,
  verticalDelta?: number,
): boolean {
  if (!effect.takeable || effect.taken) return false;
  if (!Number.isFinite(distance) || distance > WALL_TORCH_INTERACTION_DISTANCE) return false;
  if (
    verticalDelta !== undefined &&
    Number.isFinite(verticalDelta) &&
    Math.abs(verticalDelta) > INTERACTION_VERTICAL_BAND
  ) {
    return false;
  }
  return true;
}

/** Wall torches require an explicit interact (F / UI) — not hold-to-walk click. */
export function shouldTakeWallTorch(interactPressed: boolean): boolean {
  return Boolean(interactPressed);
}

/** Kill flame, glow, and point light; leave the empty sconce mesh in place. */
export function extinguishTakenWallTorch(effect: StaticFireEffect): void {
  effect.taken = true;
  effect.flame.visible = false;
  for (const detail of effect.flameDetails) detail.visible = false;
  for (const halo of effect.halos) halo.visible = false;
  effect.currentLightFactor = 0;
  effect.baseIntensity = 0;
  if (effect.light) {
    // Keep the light in the graph. Toggling `visible` rebakes every PBR
    // program (light count is compiled into shaders) and freezes the frame.
    effect.light.intensity = 0;
  }
  const glow = effect.root.getObjectByName("Torch wall glow card");
  if (glow) glow.visible = false;
  effect.root.userData.wallTorchTaken = true;
}
