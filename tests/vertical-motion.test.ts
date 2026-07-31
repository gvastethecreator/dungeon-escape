import { describe, expect, test } from "bun:test";

import {
  createVerticalMotionState,
  stepVerticalMotion,
  VERTICAL_EVENT,
  type VerticalMotionConfig,
} from "../src/player/VerticalMotion";

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

    // Fall a few frames so the air jump must re-apply upward speed.
    for (let frame = 0; frame < 8; frame += 1) {
      stepVerticalMotion(state, 1 / 60, false, CONFIG);
    }
    const fallingVelocity = state.velocity;
    expect(fallingVelocity).toBeLessThan(CONFIG.jumpSpeed);

    const airJump = stepVerticalMotion(state, 1 / 60, true, CONFIG);
    expect(airJump & VERTICAL_EVENT.jumped).not.toBe(0);
    expect(state.grounded).toBe(false);
    // Jump impulse then same-frame gravity, matching the grounded jump path.
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
    const state = createVerticalMotionState(CONFIG.eyeHeight);
    const lowCeiling = { ...CONFIG, ceilingHeight: 2.05, headClearance: 0.2 };
    let hitCeiling = false;
    for (let frame = 0; frame < 60; frame += 1) {
      const event = stepVerticalMotion(state, 1 / 60, frame === 0, lowCeiling);
      hitCeiling ||= (event & VERTICAL_EVENT.hitCeiling) !== 0;
    }
    expect(hitCeiling).toBe(true);
    expect(state.y).toBeLessThanOrEqual(1.85);
  });
});
