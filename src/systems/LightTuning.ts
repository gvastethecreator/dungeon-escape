import * as THREE from "three";

/**
 * Keep the visible PointLight count fixed while the player moves. Three.js
 * includes that count in its shader key, so changing it during play can force
 * a costly shader compile on the render thread.
 */
export const MAX_DYNAMIC_FIRE_LIGHTS = 10;

export const PLAYER_LANTERN_TUNING = Object.freeze({
  color: 0xd0a064,
  /** Strong close fill around the body; steeper decay keeps distant rooms dark. */
  intensity: 76,
  /** One room of useful light, then fog and physical decay take over. */
  range: 18,
  decay: 1.8,
  /** Keeps the point source out of walls when the camera reaches its collision radius. */
  backwardOffset: 0.85,
  threatBoost: 4,
});

export const MATERIAL_FILL_TUNING = Object.freeze({
  color: 0xe3ddd3,
  /** Low neutral floor so unlit albedo retains shape without flattening depth. */
  intensity: 0.64,
});

/** Global interior contrast pass applied after each biome's authored response. */
export const INTERIOR_LIGHT_TUNING = Object.freeze({
  bounceScale: 0.82,
  keyScale: 0.86,
  rimScale: 0.84,
  iblScale: 0.84,
  fogScale: 1.08,
});

const PLAYER_FILL_NEUTRAL = new THREE.Color(0xf1d5b5);

/**
 * Keep the biome hue while adding enough broad light for wood, stone, metal,
 * and bone maps to keep their own color response.
 */
export function resolvePlayerLanternColor(moodColor: number): number {
  return new THREE.Color(moodColor).lerp(PLAYER_FILL_NEUTRAL, 0.38).getHex();
}

export function resolveDungeonExposure(lightLevel: number, moodBias: number): number {
  return 0.68 + THREE.MathUtils.clamp(lightLevel, 0, 1) * 0.44 + moodBias * 0.4;
}

export const FIRE_LIGHT_TUNING = Object.freeze({
  fullLodDistance: 11,
  cutoffLodDistance: 16,
  wallRange: 16,
  /** Floor campfires (legacy key name: candle). */
  candleRange: 9,
  brazierRange: 12,
});
