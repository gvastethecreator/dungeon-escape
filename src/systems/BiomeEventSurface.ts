/**
 * Pure composition of floor-hazard surface effects with biome-event scales.
 */

export const BIOME_EVENT_MOVEMENT_MIN = 0.55;
export const BIOME_EVENT_MOVEMENT_MAX = 1.2;

export interface BiomeEventSurfaceScales {
  hazardDamageScale: number;
  movementScale: number;
}

export interface ComposableHazardSurface {
  kind: string | null;
  label: string;
  damage: number;
  movementScale: number;
  traction: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Apply biome-event damage and locomotion scales to a sampled floor surface.
 * Movement stays inside the playable clamp so extreme profiles cannot softlock.
 */
export function composeHazardWithBiomeEvent<T extends ComposableHazardSurface>(
  surface: T,
  event: BiomeEventSurfaceScales,
): T {
  const damageScale = Number.isFinite(event.hazardDamageScale) ? event.hazardDamageScale : 1;
  const movementScale = Number.isFinite(event.movementScale) ? event.movementScale : 1;
  return {
    ...surface,
    damage: surface.damage * damageScale,
    movementScale: clamp(
      surface.movementScale * movementScale,
      BIOME_EVENT_MOVEMENT_MIN,
      BIOME_EVENT_MOVEMENT_MAX,
    ),
  };
}

/** Scale run difficulty by biome-event enemy pressure, clamped to 0..1. */
export function composeDifficultyWithBiomeEvent(
  difficulty: number,
  enemyPressureScale: number,
): number {
  const base = Number.isFinite(difficulty) ? difficulty : 0;
  const scale = Number.isFinite(enemyPressureScale) ? enemyPressureScale : 1;
  return clamp(base * scale, 0, 1);
}
