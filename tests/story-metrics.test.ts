import { describe, expect, test } from "bun:test";

import { WORLD_TILE_SIZE, WORLD_WALL_HEIGHT } from "../src/world/WorldMetrics";
import {
  activeFloorFromSupportY,
  closedCeilingY,
  DEFAULT_STORY_METRICS,
  floorSlabY,
  standingEyeY,
  STORY_FLIGHT_LENGTH,
  STORY_HEIGHT,
  STORY_MAX_STEP_UP,
  STORY_SHAFT_CELLS_ALONG,
  STORY_STEP_COUNT,
  STORY_STEP_RISE,
} from "../src/world/StoryMetrics";

describe("StoryMetrics", () => {
  test("step flight reaches a full story height", () => {
    expect(STORY_HEIGHT).toBe(WORLD_WALL_HEIGHT);
    expect(STORY_STEP_COUNT * STORY_STEP_RISE).toBeGreaterThanOrEqual(STORY_HEIGHT - 1e-6);
    expect(STORY_FLIGHT_LENGTH).toBeCloseTo(STORY_STEP_COUNT * DEFAULT_STORY_METRICS.stepRun, 5);
    expect(STORY_SHAFT_CELLS_ALONG).toBeGreaterThanOrEqual(
      Math.ceil(STORY_FLIGHT_LENGTH / WORLD_TILE_SIZE),
    );
    expect(STORY_MAX_STEP_UP).toBeGreaterThan(STORY_STEP_RISE);
  });

  test("slab and active-floor helpers stay deterministic", () => {
    expect(floorSlabY(0)).toBe(0);
    expect(floorSlabY(1)).toBe(STORY_HEIGHT);
    expect(floorSlabY(2)).toBe(STORY_HEIGHT * 2);
    expect(standingEyeY(STORY_HEIGHT, 1.62)).toBeCloseTo(STORY_HEIGHT + 1.62, 5);
    expect(closedCeilingY(0)).toBe(WORLD_WALL_HEIGHT);
    expect(activeFloorFromSupportY(0, 3)).toBe(0);
    // Mid-flight stays on the lower logical floor (floor bias, not round).
    expect(activeFloorFromSupportY(STORY_HEIGHT * 0.5, 3)).toBe(0);
    expect(activeFloorFromSupportY(STORY_HEIGHT, 3)).toBe(1);
    expect(activeFloorFromSupportY(STORY_HEIGHT * 2 + 0.1, 3)).toBe(2);
    expect(activeFloorFromSupportY(STORY_HEIGHT * 9, 3)).toBe(2);
  });
});
