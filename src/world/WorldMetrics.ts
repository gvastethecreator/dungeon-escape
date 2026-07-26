/** Shared first-person world scale — inject into world, atmosphere, doors. */
export const WORLD_TILE_SIZE = 2.4;
export const WORLD_WALL_HEIGHT = 4.4;

export interface WorldMetrics {
  tileSize: number;
  wallHeight: number;
}

export const DEFAULT_WORLD_METRICS: Readonly<WorldMetrics> = {
  tileSize: WORLD_TILE_SIZE,
  wallHeight: WORLD_WALL_HEIGHT,
};
