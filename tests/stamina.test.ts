import { describe, expect, test } from "bun:test";

import {
  createStaminaState,
  DEFAULT_STAMINA_CONFIG,
  resetStamina,
  STAMINA_MAX,
  STAMINA_REGEN_EARLY_PER_SEC,
  STAMINA_REGEN_EXHAUSTED_PER_SEC,
  stepStamina,
} from "../src/player/Stamina";

const DT = 1 / 60;

function advance(
  state: ReturnType<typeof createStaminaState>,
  seconds: number,
  wantsSprint: boolean,
  hasMoveIntent = true,
): ReturnType<typeof stepStamina> {
  let last = stepStamina(state, 0, wantsSprint, hasMoveIntent);
  const frames = Math.ceil(seconds / DT);
  for (let i = 0; i < frames; i += 1) {
    last = stepStamina(state, DT, wantsSprint, hasMoveIntent);
  }
  return last;
}

describe("sprint stamina", () => {
  test("starts full and drains over about 10 seconds of sprint", () => {
    const state = createStaminaState();
    expect(state.value).toBe(STAMINA_MAX);
    const mid = advance(state, 5, true);
    expect(mid.value).toBeGreaterThan(4.5);
    expect(mid.value).toBeLessThan(5.5);
    expect(mid.sprinting).toBe(true);
    expect(mid.exhausted).toBe(false);

    let emptied = false;
    for (let i = 0; i < 400; i += 1) {
      const result = stepStamina(state, DT, true, true);
      if (result.justExhausted) {
        emptied = true;
        expect(result.value).toBe(0);
        expect(result.exhausted).toBe(true);
        // Last sprint frame still applies speed; next frames cannot.
        expect(result.canSprint).toBe(false);
        break;
      }
    }
    expect(emptied).toBe(true);
  });

  test("does not drain while holding sprint without movement", () => {
    const state = createStaminaState();
    const idle = advance(state, 3, true, false);
    expect(idle.value).toBeCloseTo(STAMINA_MAX, 3);
    expect(idle.sprinting).toBe(false);
  });

  test("early release regenerates faster than full exhaustion", () => {
    const early = createStaminaState();
    advance(early, 4, true);
    const earlyStart = early.value;
    expect(earlyStart).toBeLessThan(STAMINA_MAX);
    expect(early.exhausted).toBe(false);
    const earlyAfter = advance(early, 2, false);
    const earlyGained = earlyAfter.value - earlyStart;
    // Roughly 2s * early regen (may clip at max if remaining is small).
    expect(earlyGained).toBeGreaterThan(STAMINA_REGEN_EARLY_PER_SEC * 1.5);

    const tired = createStaminaState();
    for (let i = 0; i < 700; i += 1) {
      const result = stepStamina(tired, DT, true, true);
      if (result.justExhausted) break;
    }
    expect(tired.exhausted).toBe(true);
    expect(tired.value).toBe(0);
    const tiredAfter = advance(tired, 2, false);
    expect(tiredAfter.value).toBeLessThan(earlyGained);
    expect(tiredAfter.value).toBeCloseTo(STAMINA_REGEN_EXHAUSTED_PER_SEC * 2, 1);
  });

  test("justExhausted fires once when the bar hits empty", () => {
    const state = createStaminaState();
    let exhaustedFrames = 0;
    for (let i = 0; i < 700; i += 1) {
      const result = stepStamina(state, DT, true, true);
      if (result.justExhausted) exhaustedFrames += 1;
    }
    expect(exhaustedFrames).toBe(1);
    expect(state.exhausted).toBe(true);
  });

  test("after exhaustion sprint stays locked until recover ratio", () => {
    const state = createStaminaState();
    advance(state, 11, true);
    expect(state.exhausted).toBe(true);

    // Tiny regen: still locked.
    const locked = stepStamina(state, 0.2, true, true, DEFAULT_STAMINA_CONFIG);
    expect(locked.sprinting).toBe(false);
    expect(locked.exhausted).toBe(true);

    // Recover past threshold without wanting sprint.
    advance(state, 4, false);
    expect(state.exhausted).toBe(false);
    expect(state.value).toBeGreaterThan(
      DEFAULT_STAMINA_CONFIG.max * DEFAULT_STAMINA_CONFIG.recoverRatio,
    );
    const free = stepStamina(state, DT, true, true);
    expect(free.sprinting).toBe(true);
  });

  test("reset restores a full bar", () => {
    const state = createStaminaState();
    advance(state, 11, true);
    resetStamina(state);
    expect(state.value).toBe(STAMINA_MAX);
    expect(state.exhausted).toBe(false);
  });
});
