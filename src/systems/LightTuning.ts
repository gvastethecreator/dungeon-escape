import * as THREE from "three";

/** Three local practicals per resident slab — denser torch pools without blowing the shader budget. */
export const DYNAMIC_FIRE_LIGHTS_PER_FLOOR = 3;

/**
 * Resident stacks keep a few practical PointLights per slab, but only the active
 * slab exposes them to the renderer. Three.js bakes the visible light count
 * into every PBR shader, so a larger graph causes severe first-view stalls.
 */
export const MAX_DYNAMIC_FIRE_LIGHTS = DYNAMIC_FIRE_LIGHTS_PER_FLOOR * 4;

export const PLAYER_LANTERN_TUNING = Object.freeze({
  color: 0xd0a064,
  /** Soft body fill; the forward cone carries most of the readable throw. */
  intensity: 118,
  /** Useful form light inside the current room, then fog and physical decay take over. */
  range: 17,
  decay: 2,
  /** Keeps the point source out of walls when the camera reaches its collision radius. */
  backwardOffset: 0.85,
  /** Aim a SpotLight along view so corridors open ahead of the player. */
  forwardIntensity: 110,
  forwardRange: 24,
  forwardAngle: 0.78,
  forwardPenumbra: 0.52,
  forwardOffset: 0.28,
  threatBoost: 4,
});

export const MATERIAL_FILL_TUNING = Object.freeze({
  color: 0xe3ddd3,
  /** Readable neutral floor for dark PBR roles while key/rim lights keep the modeled depth. */
  intensity: 1.05,
});

/** Global interior contrast pass applied after each biome's authored response. */
export const INTERIOR_LIGHT_TUNING = Object.freeze({
  bounceScale: 1.02,
  keyScale: 1.1,
  /** Biome-colored side light keeps profile faces readable without lifting distant room blacks. */
  rimScale: 60,
  /** Metals need an environment response in low-key biomes or they collapse into the background. */
  iblScale: 1.38,
  /** Slightly under 1 so authored biome fog stays atmospheric without burying mid-range rooms. */
  fogScale: 0.96,
});

const PLAYER_FILL_NEUTRAL = new THREE.Color(0xf1d5b5);

/**
 * Keep the biome hue while adding enough broad light for wood, stone, metal,
 * and bone maps to keep their own color response.
 */
export function resolvePlayerLanternColor(moodColor: number): number {
  return new THREE.Color(moodColor).lerp(PLAYER_FILL_NEUTRAL, 0.44).getHex();
}

/** Keep each biome hue while lifting dark palette swatches into usable light colors. */
export function resolveInteriorRimColor(moodColor: number): number {
  const color = new THREE.Color(moodColor);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  return color
    .setHSL(hsl.h, THREE.MathUtils.clamp(hsl.s * 0.92, 0.18, 0.58), Math.max(hsl.l, 0.58))
    .getHex();
}

export function resolveDungeonExposure(lightLevel: number, moodBias: number): number {
  return 0.68 + THREE.MathUtils.clamp(lightLevel, 0, 1) * 0.44 + moodBias * 0.4;
}

export const FIRE_LIGHT_TUNING = Object.freeze({
  fullLodDistance: 14,
  cutoffLodDistance: 22,
  /** Wall torch PointLight distance; a little longer than a room band. */
  wallRange: 22,
  /** Floor campfires (legacy key name: candle). */
  candleRange: 10,
  brazierRange: 13,
});
