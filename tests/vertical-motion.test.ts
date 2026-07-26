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
};

describe("first-person vertical motion", () => {
  test("jumps once, follows gravity and lands on the ground", () => {
    const state = createVerticalMotionState(CONFIG.eyeHeight);
    const first = stepVerticalMotion(state, 1 / 60, true, CONFIG);
    expect(first & VERTICAL_EVENT.jumped).not.toBe(0);
    expect(state.grounded).toBe(false);
    expect(state.y).toBeGreaterThan(CONFIG.eyeHeight);

    const airY = state.y;
    const airJump = stepVerticalMotion(state, 1 / 60, true, CONFIG);
    expect(airJump & VERTICAL_EVENT.jumped).toBe(0);
    expect(state.y).toBeGreaterThan(airY);

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
