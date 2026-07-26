import * as THREE from "three";

/**
 * Keep the visible PointLight count fixed while the player moves. Three.js
 * includes that count in its shader key, so changing it during play can force
 * a costly shader compile on the render thread.
 */
export const MAX_DYNAMIC_FIRE_LIGHTS = 10;

export const PLAYER_LANTERN_TUNING = Object.freeze({
  color: 0xd0a064,
  /** Local exploration fill: readable at one room radius, dark beyond it. */
  intensity: 96,
  /** Reaches the next corridor decision while keeping distant rooms dark. */
  range: 20.5,
  decay: 1.72,
  threatBoost: 6,
});

export function resolveDungeonExposure(lightLevel: number, moodBias: number): number {
  return 0.72 + THREE.MathUtils.clamp(lightLevel, 0, 1) * 0.48 + moodBias * 0.45;
}

export const FIRE_LIGHT_TUNING = Object.freeze({
  fullLodDistance: 11,
  cutoffLodDistance: 16,
  wallRange: 16,
  /** Floor campfires (legacy key name: candle). */
  candleRange: 9,
  brazierRange: 12,
});
