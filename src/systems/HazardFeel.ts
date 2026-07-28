import type { HazardTileKind } from "../world/HazardTileSystem";

/** Full-screen hit wash style. Enemy contact stays blood-red; hazards use their own grade. */
export type DamageWashKind = "enemy" | HazardTileKind;

export interface HazardFeel {
  /** UV heat shimmer + warm grade (fire). */
  heatwave: number;
  /** Full-screen poison grade (toxin DoT or standing on toxic floor). */
  toxinGreen: number;
  /** Cold grade while on ice. */
  iceBlue: number;
  /** Metallic edge pulse for spike plates. */
  spikeEdge: number;
}

const ZERO_FEEL: HazardFeel = {
  heatwave: 0,
  toxinGreen: 0,
  iceBlue: 0,
  spikeEdge: 0,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Prefer hazard wash when the surface dealt damage this frame.
 * Enemy contact wins only when the surface did not damage.
 */
export function resolveDamageWashKind(
  surfaceKind: HazardTileKind | null,
  surfaceDamage: number,
): DamageWashKind {
  if (surfaceDamage > 0 && surfaceKind) return surfaceKind;
  return "enemy";
}

/**
 * Continuous lens response for the active hazard surface.
 * Toxin keeps grading while the DoT remains (kind stays "toxin" after leaving the tile).
 * hitBoost (0..1) briefly amplifies the look right after a hazard damage tick.
 */
export function computeHazardFeel(
  kind: HazardTileKind | null,
  hitBoost = 0,
  reducedMotion = false,
): HazardFeel {
  if (!kind) return ZERO_FEEL;
  const boost = clamp01(hitBoost);
  const motion = reducedMotion ? 0.35 : 1;

  switch (kind) {
    case "fire":
      return {
        heatwave: clamp01((0.52 + boost * 0.48) * motion),
        toxinGreen: 0,
        iceBlue: 0,
        spikeEdge: 0,
      };
    case "toxin":
      return {
        heatwave: 0,
        toxinGreen: clamp01(0.28 + boost * 0.42),
        iceBlue: 0,
        spikeEdge: 0,
      };
    case "ice":
      return {
        heatwave: 0,
        toxinGreen: 0,
        iceBlue: clamp01(0.22 + boost * 0.28),
        spikeEdge: 0,
      };
    case "spikes":
      return {
        heatwave: 0,
        toxinGreen: 0,
        iceBlue: 0,
        spikeEdge: clamp01((0.12 + boost * 0.55) * motion),
      };
    default:
      return ZERO_FEEL;
  }
}

export function decayHazardHitBoost(current: number, deltaSeconds: number): number {
  if (current <= 0) return 0;
  return Math.max(0, current - Math.max(0, deltaSeconds) / 0.85);
}
