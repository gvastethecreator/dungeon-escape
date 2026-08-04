import { describe, expect, test } from "bun:test";

import {
  TIMED_SECONDS_ACTIVE_EPSILON,
  activateTimedSeconds,
  isTimedSecondsActive,
  replaceTimedSeconds,
  tickTimedSeconds,
} from "../src/game/TimedSeconds";

describe("TimedSeconds", () => {
  test("activate takes the max of current and duration", () => {
    expect(activateTimedSeconds(4, 10)).toBe(10);
    expect(activateTimedSeconds(12, 10)).toBe(12);
    expect(activateTimedSeconds(-1, 8)).toBe(8);
    expect(activateTimedSeconds(Number.NaN, 5)).toBe(5);
  });

  test("replace always writes the duration", () => {
    expect(replaceTimedSeconds(10)).toBe(10);
    expect(replaceTimedSeconds(-3)).toBe(0);
    expect(replaceTimedSeconds(Number.NaN)).toBe(0);
  });

  test("tick counts down and clamps non-finite remaining", () => {
    expect(tickTimedSeconds(5, 1.5)).toBe(3.5);
    expect(tickTimedSeconds(0.4, 1)).toBe(0);
    expect(tickTimedSeconds(Number.NaN, 1)).toBe(0);
    expect(tickTimedSeconds(5, Number.NaN)).toBe(5);
  });

  test("tick can cap remaining when delta is not positive", () => {
    expect(tickTimedSeconds(99, 0, { maxSeconds: 10 })).toBe(10);
    expect(tickTimedSeconds(8, -1, { maxSeconds: 10 })).toBe(8);
  });

  test("isActive respects epsilon", () => {
    expect(isTimedSecondsActive(0)).toBe(false);
    expect(isTimedSecondsActive(0.00005)).toBe(true);
    expect(isTimedSecondsActive(0.00005, TIMED_SECONDS_ACTIVE_EPSILON)).toBe(false);
    expect(isTimedSecondsActive(1, TIMED_SECONDS_ACTIVE_EPSILON)).toBe(true);
  });
});
