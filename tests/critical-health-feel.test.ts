import { describe, expect, test } from "bun:test";

import {
  computeCriticalHealthFeel,
  CRITICAL_HEALTH_PULSE_DURATION,
  CRITICAL_HEALTH_PULSE_PERIOD,
} from "../src/systems/CriticalHealthFeel";

describe("critical health feel", () => {
  test("starts only below fifteen percent", () => {
    expect(computeCriticalHealthFeel(15, 0)).toEqual({
      active: false,
      severity: 0,
      movementDrift: 0,
      redTint: 0,
    });
    expect(computeCriticalHealthFeel(14.99, 0).active).toBe(true);
  });

  test("keeps the erratic steering slight and disables it for reduced motion", () => {
    for (let time = 0; time < 20; time += 0.17) {
      expect(Math.abs(computeCriticalHealthFeel(4, time).movementDrift)).toBeLessThanOrEqual(0.1);
    }
    expect(computeCriticalHealthFeel(4, 2.3, true).movementDrift).toBe(0);
  });

  test("uses brief red pulses with a clear rest between them", () => {
    const peak = computeCriticalHealthFeel(2, CRITICAL_HEALTH_PULSE_DURATION / 2);
    const rest = computeCriticalHealthFeel(
      2,
      CRITICAL_HEALTH_PULSE_DURATION +
        (CRITICAL_HEALTH_PULSE_PERIOD - CRITICAL_HEALTH_PULSE_DURATION) / 2,
    );
    expect(peak.redTint).toBeGreaterThan(0.2);
    expect(peak.redTint).toBeLessThan(0.35);
    expect(rest.redTint).toBe(0);
  });
});
