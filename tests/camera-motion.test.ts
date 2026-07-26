import { describe, expect, test } from "bun:test";

import { clampLookPitch, dampAngle } from "../src/player/FirstPersonController";
import { LookInputFilter } from "../src/player/LookInputFilter";

describe("camera angle smoothing", () => {
  test("moves toward the target without reaching it in one frame", () => {
    const next = dampAngle(0, 1, 20, 1 / 60);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });

  test("uses the short path across the angle seam", () => {
    const current = Math.PI - 0.05;
    const target = -Math.PI + 0.05;
    const next = dampAngle(current, target, 20, 1 / 60);
    expect(next).toBeGreaterThan(current);
    expect(next - current).toBeLessThan(0.05);
  });

  test("is stable when delta is zero", () => {
    expect(dampAngle(0.75, -1.2, 20, 0)).toBe(0.75);
  });

  test("keeps vertical look away from the Euler singularity", () => {
    expect(clampLookPitch(4)).toBe(1.18);
    expect(clampLookPitch(-4)).toBe(-1.18);
    expect(clampLookPitch(0.4)).toBe(0.4);
  });

  test("limits a burst of pointer-lock events to one bounded frame delta", () => {
    const filter = new LookInputFilter(72, 118);
    for (let index = 0; index < 20; index += 1) filter.push(900, -900);
    expect(filter.consume()).toEqual({ x: 118, y: -118 });
    expect(filter.consume()).toEqual({ x: 0, y: 0 });
  });
});
