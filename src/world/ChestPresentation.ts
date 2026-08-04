/**
 * Chest lid damp and reward reveal animation.
 * Open intent and nearest selection stay in the Play facade.
 */

import * as THREE from "three";

import type { StaticChestActor } from "./StaticDungeonScene";

export const CHEST_OPEN_DAMP = 7.5;
export const CHEST_CLOSE_DAMP = 5;
export const CHEST_REVEAL_SECONDS = 0.52;
export const CHEST_LID_OPEN_RADIANS = -1.18;

/** Damp lid openness and advance reward reveal for one chest. */
export function updateChestPresentation(chest: StaticChestActor, delta: number): void {
  const nextOpenness = THREE.MathUtils.damp(
    chest.openness,
    chest.opened ? 1 : 0,
    chest.opened ? CHEST_OPEN_DAMP : CHEST_CLOSE_DAMP,
    delta,
  );
  if (Math.abs(nextOpenness - chest.openness) > 0.000_001) {
    chest.openness = nextOpenness;
    chest.lid.rotation.x = CHEST_LID_OPEN_RADIANS * chest.openness;
    chest.runtimeBatch?.updateLidMatrix();
  }
  if (!chest.opened || chest.reward.available || chest.reward.collected) return;
  chest.reward.revealTime += delta;
  const reveal = THREE.MathUtils.clamp(chest.reward.revealTime / CHEST_REVEAL_SECONDS, 0, 1);
  const eased = 1 - Math.pow(1 - reveal, 3);
  // Keep visible so PointLights on power rewards stay in the fixed light count.
  chest.reward.object.visible = true;
  chest.reward.object.position.y = chest.reward.baseY - 0.34 + eased * 0.34;
  chest.reward.object.rotation.y += delta * (1.35 + reveal * 1.25);
  chest.reward.object.scale
    .copy(chest.reward.baseScale)
    .multiplyScalar(0.68 + eased * 0.32 + Math.sin(reveal * Math.PI) * 0.08);
  if (chest.reward.timeFreezeSignal) {
    chest.reward.timeFreezeSignal.light.intensity =
      chest.reward.timeFreezeSignal.baseIntensity * eased;
  }
  if (chest.reward.luminousWardSignal) {
    chest.reward.luminousWardSignal.light.intensity =
      chest.reward.luminousWardSignal.baseIntensity * eased;
  }
  if (chest.reward.annihilationPulseSignal) {
    chest.reward.annihilationPulseSignal.light.intensity =
      chest.reward.annihilationPulseSignal.baseIntensity * eased;
  }
  if (chest.reward.cullBrandSignal) {
    chest.reward.cullBrandSignal.light.intensity =
      chest.reward.cullBrandSignal.baseIntensity * eased;
  }
  if (reveal >= 1) {
    chest.reward.available = true;
    chest.reward.object.scale.copy(chest.reward.baseScale);
  }
}

/** Snap reward into the closed-chest dormant pose after open. */
export function beginChestRewardReveal(chest: StaticChestActor): void {
  chest.reward.revealTime = 0;
  chest.reward.object.position.y = chest.reward.baseY - 0.34;
  chest.reward.object.scale.copy(chest.reward.baseScale).multiplyScalar(0.62);
  if (chest.reward.timeFreezeSignal) chest.reward.timeFreezeSignal.light.intensity = 0;
  if (chest.reward.luminousWardSignal) chest.reward.luminousWardSignal.light.intensity = 0;
  if (chest.reward.annihilationPulseSignal)
    chest.reward.annihilationPulseSignal.light.intensity = 0;
  if (chest.reward.cullBrandSignal) chest.reward.cullBrandSignal.light.intensity = 0;
}
