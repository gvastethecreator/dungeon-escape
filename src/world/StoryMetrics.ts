import { WORLD_TILE_SIZE, WORLD_WALL_HEIGHT } from "./WorldMetrics";

/**
 * Shared vertical story scale for multi-floor slabs and walkable stair flights.
 * Keep kit geometry, colliders, and vertical motion on these values.
 */
export const STORY_DECK_THICKNESS = 0.35;
/** Vertical distance between successive floor slab origins. */
export const STORY_HEIGHT = WORLD_WALL_HEIGHT;
/** Rise per tread; sized for grounded step-up without requiring a jump. */
export const STORY_STEP_RISE = 0.22;
/** Depth per tread along the flight axis. */
export const STORY_STEP_RUN = 0.36;
/** Clear walking width between rails. */
export const STORY_STEP_WIDTH = WORLD_TILE_SIZE * 0.85;
/** Max grounded step-up (slightly above one tread). */
export const STORY_MAX_STEP_UP = STORY_STEP_RISE + 0.05;

export const STORY_STEP_COUNT = Math.ceil(STORY_HEIGHT / STORY_STEP_RISE);
export const STORY_FLIGHT_LENGTH = STORY_STEP_COUNT * STORY_STEP_RUN;
/** Grid cells along the flight (landing pads extra). */
export const STORY_SHAFT_CELLS_ALONG = Math.max(
  3,
  Math.ceil(STORY_FLIGHT_LENGTH / WORLD_TILE_SIZE),
);
export const STORY_SHAFT_CELLS_ACROSS = 1;
/** Clear cells before first tread and after last. */
export const STORY_LANDING_CELLS = 1;

export interface StoryMetrics {
  tileSize: number;
  wallHeight: number;
  deckThickness: number;
  storyHeight: number;
  stepRise: number;
  stepRun: number;
  stepWidth: number;
  stepCount: number;
  flightLength: number;
  maxStepUp: number;
  shaftCellsAlong: number;
  shaftCellsAcross: number;
  landingCells: number;
}

export const DEFAULT_STORY_METRICS: Readonly<StoryMetrics> = Object.freeze({
  tileSize: WORLD_TILE_SIZE,
  wallHeight: WORLD_WALL_HEIGHT,
  deckThickness: STORY_DECK_THICKNESS,
  storyHeight: STORY_HEIGHT,
  stepRise: STORY_STEP_RISE,
  stepRun: STORY_STEP_RUN,
  stepWidth: STORY_STEP_WIDTH,
  stepCount: STORY_STEP_COUNT,
  flightLength: STORY_FLIGHT_LENGTH,
  maxStepUp: STORY_MAX_STEP_UP,
  shaftCellsAlong: STORY_SHAFT_CELLS_ALONG,
  shaftCellsAcross: STORY_SHAFT_CELLS_ACROSS,
  landingCells: STORY_LANDING_CELLS,
});

/** Absolute Y of the floor slab origin for a zero-based floor index. */
export function floorSlabY(floorIndex: number, storyHeight = STORY_HEIGHT): number {
  return Math.max(0, Math.floor(floorIndex)) * storyHeight;
}

/**
 * Active floor index from a support/feet Y sample.
 * Uses floor bias (+0.2 story) so mid-flight stays on the lower logical grid
 * until the player nears the upper landing.
 */
export function activeFloorFromSupportY(
  supportY: number,
  floorCount: number,
  storyHeight = STORY_HEIGHT,
): number {
  const count = Math.max(1, Math.floor(floorCount));
  if (!(supportY > 0) || !(storyHeight > 0)) return 0;
  const index = Math.floor(supportY / storyHeight + 0.2);
  return Math.max(0, Math.min(count - 1, index));
}

/** Eye Y while standing on a slab (slab origin + eye height). */
export function standingEyeY(slabY: number, eyeHeight: number): number {
  return slabY + eyeHeight;
}

/**
 * Closed-room ceiling plane for a slab (world Y of the solid ceiling underside).
 * Shaft columns must not use this probe.
 */
export function closedCeilingY(slabY: number, wallHeight = WORLD_WALL_HEIGHT): number {
  return slabY + wallHeight;
}
