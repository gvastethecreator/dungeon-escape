import { describe, expect, test } from "bun:test";
import {
  DEFAULT_WORLD_METRICS,
  WORLD_TILE_SIZE,
  WORLD_WALL_HEIGHT,
} from "../src/world/WorldMetrics";
import { SOFT_FOG_DEFAULT_WALL_HEIGHT } from "../src/systems/AtmosphereSystem";

describe("WorldMetrics", () => {
  test("tile and wall height stay shared with atmosphere defaults", () => {
    expect(WORLD_TILE_SIZE).toBe(2.4);
    expect(WORLD_WALL_HEIGHT).toBe(4.4);
    expect(SOFT_FOG_DEFAULT_WALL_HEIGHT).toBe(WORLD_WALL_HEIGHT);
    expect(DEFAULT_WORLD_METRICS.tileSize).toBe(WORLD_TILE_SIZE);
  });
});
