import type { DungeonMoodId } from "./DungeonMood";

/** Continuous fullscreen lens response driven by the active biome. */
export interface BiomeLensFeel {
  /**
   * Underwater UV noise warp strength 0..1.
   * Only sunken authors a non-zero value; other biomes stay flat.
   */
  waterWarp: number;
}

const ZERO_FEEL: BiomeLensFeel = { waterWarp: 0 };

/** Authored sunken water-warp — quiet enough to sit under CRT and hazard FX. */
export const SUNKEN_WATER_WARP = 0.18;
/** Reduced-motion floor: keep a hint of pressure without living noise. */
export const SUNKEN_WATER_WARP_REDUCED = 0.04;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Map the active mood into continuous post-pass lens targets.
 * Pure math so sunken warp stays unit-testable without WebGL.
 */
export function computeBiomeLensFeel(
  moodId: DungeonMoodId | null | undefined,
  reducedMotion = false,
): BiomeLensFeel {
  if (moodId !== "sunken") return ZERO_FEEL;
  return {
    waterWarp: clamp01(reducedMotion ? SUNKEN_WATER_WARP_REDUCED : SUNKEN_WATER_WARP),
  };
}
