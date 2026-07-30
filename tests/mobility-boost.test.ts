import { describe, expect, test } from "bun:test";

import {
  activateMobilityBoost,
  isMobilityBoostActive,
  MOBILITY_BOOST_DURATION_SECONDS,
  MOBILITY_BOOST_SPEED_MULTIPLIER,
  tickMobilityBoost,
} from "../src/game/MobilityBoost";

describe("mobility boost", () => {
  test("starts a bounded speed, stamina, and trap-immunity window", () => {
    expect(activateMobilityBoost()).toBe(MOBILITY_BOOST_DURATION_SECONDS);
    expect(MOBILITY_BOOST_SPEED_MULTIPLIER).toBeGreaterThan(1);
    expect(MOBILITY_BOOST_SPEED_MULTIPLIER).toBeLessThanOrEqual(1.25);
    expect(isMobilityBoostActive(activateMobilityBoost())).toBe(true);
  });

  test("does not shorten an active pickup and expires at zero", () => {
    expect(activateMobilityBoost(20)).toBe(20);
    expect(tickMobilityBoost(2, 0.75)).toBeCloseTo(1.25);
    expect(tickMobilityBoost(0.2, 1)).toBe(0);
    expect(isMobilityBoostActive(0)).toBe(false);
  });
});
