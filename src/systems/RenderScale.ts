export const RENDER_SCALE = 0.7;

export function resolveRenderPixelRatio(devicePixelRatio: number, cap: number): number {
  const safeDeviceRatio = Number.isFinite(devicePixelRatio) ? Math.max(0.1, devicePixelRatio) : 1;
  const safeCap = Number.isFinite(cap) ? Math.max(0.1, cap) : 1;
  return Math.min(safeDeviceRatio, safeCap) * RENDER_SCALE;
}
