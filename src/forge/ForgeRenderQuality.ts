export interface ForgeRenderQuality {
  pixelRatio: number;
  directionalShadows: boolean;
}

/**
 * Keeps the full editor readable on small screens without paying for a second
 * shadow render of the whole dungeon. The ambient and practical-light rig
 * remains active, so route, stones and biome colour still read on mobile.
 */
export function resolveForgeRenderQuality(
  viewportWidth: number,
  devicePixelRatio: number,
): ForgeRenderQuality {
  const compact = viewportWidth < 640;

  return {
    pixelRatio: Math.min(Math.max(devicePixelRatio, 1), compact ? 1.25 : 1.6),
    directionalShadows: !compact,
  };
}
