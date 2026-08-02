import { describe, expect, test } from "bun:test";

import {
  createVerticalMotionState,
  pickSupportTop,
  stepVerticalMotion,
  VERTICAL_EVENT,
  type VerticalMotionConfig,
} from "../src/player/VerticalMotion";
import { STORY_MAX_STEP_UP, STORY_STEP_RISE } from "../src/world/StoryMetrics";

const CONFIG: VerticalMotionConfig = {
  eyeHeight: 1.62,
  ceilingHeight: 4.4,
  headClearance: 0.18,
  gravity: 17,
  jumpSpeed: 5.8,
  maxAirJumps: 1,
};

describe("first-person vertical motion", () => {
  test("jumps once, follows gravity and lands on the ground", () => {
    const state = createVerticalMotionState(CONFIG.eyeHeight, CONFIG.maxAirJumps);
    const first = stepVerticalMotion(state, 1 / 60, true, CONFIG);
    expect(first & VERTICAL_EVENT.jumped).not.toBe(0);
    expect(state.grounded).toBe(false);
    expect(state.y).toBeGreaterThan(CONFIG.eyeHeight);

    let landed = false;
    for (let frame = 0; frame < 240; frame += 1) {
      const event = stepVerticalMotion(state, 1 / 60, false, CONFIG);
      landed ||= (event & VERTICAL_EVENT.landed) !== 0;
      if (landed) break;
    }
    expect(landed).toBe(true);
    expect(state.grounded).toBe(true);
    expect(state.y).toBe(CONFIG.eyeHeight);
    expect(state.velocity).toBe(0);
  });

  test("allows one double jump while airborne, then refuses a third", () => {
    const state = createVerticalMotionState(CONFIG.eyeHeight, CONFIG.maxAirJumps);
    const groundJump = stepVerticalMotion(state, 1 / 60, true, CONFIG);
    expect(groundJump & VERTICAL_EVENT.jumped).not.toBe(0);
    expect(state.grounded).toBe(false);
    expect(state.airJumpsRemaining).toBe(1);

    for (let frame = 0; frame < 8; frame += 1) {
      stepVerticalMotion(state, 1 / 60, false, CONFIG);
    }
    const fallingVelocity = state.velocity;
    expect(fallingVelocity).toBeLessThan(CONFIG.jumpSpeed);

    const airJump = stepVerticalMotion(state, 1 / 60, true, CONFIG);
    expect(airJump & VERTICAL_EVENT.jumped).not.toBe(0);
    expect(state.grounded).toBe(false);
    expect(state.velocity).toBeCloseTo(CONFIG.jumpSpeed - CONFIG.gravity / 60, 5);
    expect(state.velocity).toBeGreaterThan(fallingVelocity);
    expect(state.airJumpsRemaining).toBe(0);

    const thirdJump = stepVerticalMotion(state, 1 / 60, true, CONFIG);
    expect(thirdJump & VERTICAL_EVENT.jumped).toBe(0);
    expect(state.airJumpsRemaining).toBe(0);
  });

  test("restores air jumps after landing", () => {
    const state = createVerticalMotionState(CONFIG.eyeHeight, CONFIG.maxAirJumps);
    stepVerticalMotion(state, 1 / 60, true, CONFIG);
    stepVerticalMotion(state, 1 / 60, true, CONFIG);
    expect(state.airJumpsRemaining).toBe(0);

    for (let frame = 0; frame < 240; frame += 1) {
      const event = stepVerticalMotion(state, 1 / 60, false, CONFIG);
      if ((event & VERTICAL_EVENT.landed) !== 0) break;
    }
    expect(state.grounded).toBe(true);
    expect(state.airJumpsRemaining).toBe(CONFIG.maxAirJumps);
  });

  test("blocks the camera below the ceiling", () => {
    const state = createVerticalMotionState(CONFIG.eyeHeight, CONFIG.maxAirJumps);
    state.grounded = false;
    state.velocity = 40;
    state.y = CONFIG.ceilingHeight - CONFIG.headClearance - 0.05;
    const event = stepVerticalMotion(state, 1 / 60, false, CONFIG);
    expect(event & VERTICAL_EVENT.hitCeiling).not.toBe(0);
    expect(state.y).toBeCloseTo(CONFIG.ceilingHeight - CONFIG.headClearance, 5);
    expect(state.velocity).toBe(0);
  });

  test("lands on a raised floorEyeY support after a jump", () => {
    const state = createVerticalMotionState(CONFIG.eyeHeight, CONFIG.maxAirJumps);
    stepVerticalMotion(state, 1 / 60, true, CONFIG);
    const raised = CONFIG.eyeHeight + 2.2;
    const raisedConfig: VerticalMotionConfig = {
      ...CONFIG,
      floorEyeY: raised,
      ceilingHeight: raised + 4.4,
    };
    let landed = false;
    for (let frame = 0; frame < 240; frame += 1) {
      const event = stepVerticalMotion(state, 1 / 60, false, raisedConfig);
      landed ||= (event & VERTICAL_EVENT.landed) !== 0;
      if (landed) break;
    }
    expect(landed).toBe(true);
    expect(state.y).toBeCloseTo(raised, 5);
  });

  test("grounded step-up climbs successive stair treads without jumping", () => {
    const state = createVerticalMotionState(CONFIG.eyeHeight, CONFIG.maxAirJumps);
    const config: VerticalMotionConfig = {
      ...CONFIG,
      maxStepUp: STORY_MAX_STEP_UP,
      ceilingHeight: 20,
    };
    for (let step = 1; step <= 20; step += 1) {
      config.floorEyeY = CONFIG.eyeHeight + step * STORY_STEP_RISE;
      const event = stepVerticalMotion(state, 1 / 60, false, config);
      expect(event & VERTICAL_EVENT.steppedUp).not.toBe(0);
      expect(state.grounded).toBe(true);
      expect(state.y).toBeCloseTo(config.floorEyeY, 5);
    }
  });

  test("walking off a raised support starts a fall", () => {
    const state = createVerticalMotionState(CONFIG.eyeHeight + 2, CONFIG.maxAirJumps);
    const event = stepVerticalMotion(state, 1 / 60, false, {
      ...CONFIG,
      floorEyeY: CONFIG.eyeHeight,
    });
    expect(state.grounded).toBe(false);
    // Same frame begins falling after support loss.
    expect(state.y).toBeLessThan(CONFIG.eyeHeight + 2);
    expect(event & VERTICAL_EVENT.jumped).toBe(0);
  });

  test("pickSupportTop prefers the highest reachable tread", () => {
    const feetY = 0.1;
    const picked = pickSupportTop([0, 0.22, 0.44, 1.5], feetY, STORY_MAX_STEP_UP);
    expect(picked).toBeCloseTo(0.22, 5);
    expect(pickSupportTop([2, 3], feetY, STORY_MAX_STEP_UP)).toBeNull();
  });
});
