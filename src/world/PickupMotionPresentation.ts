/**
 * Idle bob / signal pulse and collect fly motion for pickups.
 * Collect eligibility stays on InteractionReach.
 */

import * as THREE from "three";

import { ensurePickupMaterialOwnership, setPickupDormant, setPickupOpacity } from "./ItemFactory";
import type { StaticPickupActor } from "./StaticDungeonScene";

export const PICKUP_COLLECT_DURATION = 0.78;
export const PICKUP_COLLECT_RISE_END = 0.38;
const pickupPlayerLocal = new THREE.Vector3();

export interface PickupMotionFrame {
  player: THREE.Vector3Like;
  elapsed: number;
  delta: number;
}

/** Animate a collected pickup flying into the player. Returns true when finished. */
export function updateCollectedPickupMotion(
  pickup: StaticPickupActor,
  frame: PickupMotionFrame,
): boolean {
  pickup.collectTime += frame.delta;
  const duration = PICKUP_COLLECT_DURATION;
  const riseEnd = PICKUP_COLLECT_RISE_END;
  const progress = THREE.MathUtils.clamp(pickup.collectTime / duration, 0, 1);
  const originX = pickup.collectOriginX;
  const originY = pickup.collectOriginY;
  const originZ = pickup.collectOriginZ;
  const peakY = originY + 2.85;
  const player = pickup.object.parent
    ? pickup.object.parent.worldToLocal(
        pickupPlayerLocal.set(frame.player.x, frame.player.y, frame.player.z),
      )
    : pickupPlayerLocal.set(frame.player.x, frame.player.y, frame.player.z);
  let x = originX;
  let y = originY;
  let z = originZ;
  if (progress <= riseEnd) {
    const riseT = progress / riseEnd;
    const eased = 1 - Math.pow(1 - riseT, 3);
    y = originY + eased * (peakY - originY);
  } else {
    const flyT = (progress - riseEnd) / (1 - riseEnd);
    const eased = flyT * flyT * (3 - 2 * flyT);
    x = THREE.MathUtils.lerp(originX, player.x, eased);
    z = THREE.MathUtils.lerp(originZ, player.z, eased);
    y = THREE.MathUtils.lerp(peakY, player.y - 0.12, eased);
  }
  pickup.object.position.set(x, y, z);
  const pop =
    1 +
    Math.sin(Math.min(1, progress / riseEnd) * Math.PI) *
      (pickup.stoneSignal ? 0.52 : 0.36) *
      (progress <= riseEnd ? 1 : 1 - (progress - riseEnd) / (1 - riseEnd));
  const shrink = progress <= riseEnd ? 1 : 1 - 0.55 * ((progress - riseEnd) / (1 - riseEnd));
  pickup.object.scale.copy(pickup.baseScale).multiplyScalar(pop * shrink);
  pickup.object.rotation.y +=
    frame.delta * (pickup.stoneSignal ? 3.2 + progress * 6 : 2.2 + progress * 4);
  const fade =
    progress <= riseEnd ? 0 : THREE.MathUtils.clamp((progress - riseEnd) / (1 - riseEnd), 0, 1);
  setPickupOpacity(pickup.object, 1 - fade);
  if (pickup.stoneSignal) pickup.stoneSignal.light.intensity = 0;
  if (pickup.timeFreezeSignal) pickup.timeFreezeSignal.light.intensity = 0;
  if (pickup.luminousWardSignal) pickup.luminousWardSignal.light.intensity = 0;
  if (pickup.annihilationPulseSignal) pickup.annihilationPulseSignal.light.intensity = 0;
  if (pickup.cullBrandSignal) pickup.cullBrandSignal.light.intensity = 0;
  if (pickup.shotgunSignal) pickup.shotgunSignal.light.intensity = 0;
  if (progress >= 1) {
    setPickupDormant(pickup.object, true);
    return true;
  }
  return false;
}

/** Idle hover and signal light pulse for an available pickup. */
export function updateIdlePickupMotion(pickup: StaticPickupActor, frame: PickupMotionFrame): void {
  const powerPickup =
    pickup.timeFreezeSignal ||
    pickup.luminousWardSignal ||
    pickup.annihilationPulseSignal ||
    pickup.cullBrandSignal ||
    pickup.shotgunSignal;
  const motionScale = powerPickup ? 0.56 : 0.68;
  // Glow opacity is mutable presentation state. Detach shared reward
  // materials once, then let subsequent frames reuse the owned instances.
  if (
    pickup.stoneSignal ||
    pickup.luminousWardSignal ||
    pickup.annihilationPulseSignal ||
    pickup.cullBrandSignal ||
    pickup.shotgunSignal
  ) {
    ensurePickupMaterialOwnership(pickup.object);
  }
  if (pickup.stoneSignal) {
    const phase = frame.elapsed * 1.65 + pickup.object.id;
    pickup.object.position.y = pickup.baseY;
    pickup.stoneSignal.crystalAssembly.position.y = Math.sin(phase) * 0.035;
    pickup.stoneSignal.crystalAssembly.rotation.y += frame.delta * 0.56;
    pickup.stoneSignal.crown.rotation.y -= frame.delta * 0.92;
    pickup.stoneSignal.glow.rotation.y -= frame.delta * 0.12;
  } else {
    pickup.object.position.y =
      pickup.baseY + Math.sin(frame.elapsed * 2 + pickup.object.id) * 0.08 * motionScale;
    pickup.object.rotation.y += frame.delta * 0.46;
  }
  if (pickup.timeFreezeSignal) {
    const pulse = 0.95 + Math.sin(frame.elapsed * 2.35 + pickup.object.id) * 0.05;
    pickup.timeFreezeSignal.light.intensity = pickup.timeFreezeSignal.baseIntensity * pulse;
  }
  if (pickup.luminousWardSignal) {
    const pulse = 0.95 + Math.sin(frame.elapsed * 2.15 + pickup.object.id) * 0.05;
    pickup.luminousWardSignal.light.intensity = pickup.luminousWardSignal.baseIntensity * pulse;
    const glowMaterial = pickup.luminousWardSignal.glow.material;
    if (glowMaterial instanceof THREE.MeshBasicMaterial) {
      glowMaterial.opacity = pickup.luminousWardSignal.baseGlowOpacity * (0.95 + pulse * 0.05);
    }
  }
  if (pickup.annihilationPulseSignal) {
    const pulse = 0.92 + Math.sin(frame.elapsed * 3.1 + pickup.object.id) * 0.08;
    pickup.annihilationPulseSignal.light.intensity =
      pickup.annihilationPulseSignal.baseIntensity * pulse;
    const glowMaterial = pickup.annihilationPulseSignal.glow.material;
    if (glowMaterial instanceof THREE.MeshBasicMaterial) {
      glowMaterial.opacity = pickup.annihilationPulseSignal.baseGlowOpacity * (0.9 + pulse * 0.1);
    }
  }
  if (pickup.cullBrandSignal) {
    const pulse = 0.92 + Math.sin(frame.elapsed * 2.85 + pickup.object.id) * 0.08;
    pickup.cullBrandSignal.light.intensity = pickup.cullBrandSignal.baseIntensity * pulse;
    const glowMaterial = pickup.cullBrandSignal.glow.material;
    if (glowMaterial instanceof THREE.MeshBasicMaterial) {
      glowMaterial.opacity = pickup.cullBrandSignal.baseGlowOpacity * (0.9 + pulse * 0.1);
    }
  }
  if (pickup.shotgunSignal) {
    const pulse = 0.92 + Math.sin(frame.elapsed * 2.55 + pickup.object.id) * 0.08;
    pickup.shotgunSignal.light.intensity = pickup.shotgunSignal.baseIntensity * pulse;
    const glowMaterial = pickup.shotgunSignal.glow.material;
    if (glowMaterial instanceof THREE.MeshBasicMaterial) {
      glowMaterial.opacity = pickup.shotgunSignal.baseGlowOpacity * (0.9 + pulse * 0.1);
    }
  }
  if (pickup.stoneSignal) {
    const pulse = 0.92 + Math.sin(frame.elapsed * 2.35 + pickup.object.id) * 0.08;
    pickup.stoneSignal.light.intensity = pickup.stoneSignal.baseLightIntensity * pulse;
    const glowMaterial = pickup.stoneSignal.glow.material;
    if (glowMaterial instanceof THREE.MeshBasicMaterial) {
      glowMaterial.opacity = pickup.stoneSignal.baseGlowOpacity * (0.82 + pulse * 0.18);
    }
    pickup.stoneSignal.crown.scale.setScalar(0.68 * (0.97 + pulse * 0.055));
  }
}
