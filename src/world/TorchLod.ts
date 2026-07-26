import { FIRE_LIGHT_TUNING } from "../systems/LightTuning";

export interface TorchLodState {
  rootVisible: boolean;
  flameVisible: boolean;
  haloVisible: boolean;
  lightFactor: number;
}

/**
 * Distance LOD for wall fire. Geometry stays up longer than the light so
 * props do not hard-pop at the same moment the point light joins the frame.
 */
export function computeTorchLod(
  distance: number,
  cutoffDistance: number = FIRE_LIGHT_TUNING.cutoffLodDistance,
): TorchLodState {
  const safeDistance = Math.max(0, distance);
  const safeCutoff = Math.max(0.1, cutoffDistance);
  // Scale the full-intensity band with the wall reference so candles/braziers
  // keep the same relative fade, while wall torches hit fullLodDistance exactly.
  const fullRatio = FIRE_LIGHT_TUNING.fullLodDistance / FIRE_LIGHT_TUNING.cutoffLodDistance;
  const fullDistance = Math.min(FIRE_LIGHT_TUNING.fullLodDistance, safeCutoff * fullRatio);
  const lightFactor =
    safeDistance <= fullDistance
      ? 1
      : Math.max(0, 1 - (safeDistance - fullDistance) / (safeCutoff - fullDistance));
  return {
    // Fog and practical lights fade before this range. Keeping each multi-mesh
    // sconce past it only inflates draw calls in first-person play.
    rootVisible: safeDistance < 36,
    flameVisible: safeDistance < safeCutoff,
    haloVisible: safeDistance < Math.min(15, safeCutoff),
    lightFactor,
  };
}
