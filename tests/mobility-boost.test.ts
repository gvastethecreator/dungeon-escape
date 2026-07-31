import { describe, expect, test } from "bun:test";

import {
  activateMobilityBoost,
  isMobilityBoostActive,
  MOBILITY_BOOST_CAMERA_BOB_SCALE,
  MOBILITY_BOOST_DURATION_SECONDS,
  MOBILITY_BOOST_FOOTSTEP_GAIN,
  MOBILITY_BOOST_FOV_KICK,
  MOBILITY_BOOST_SPEED_MULTIPLIER,
  MOBILITY_BOOST_STRIDE_RATE,
  tickMobilityBoost,
} from "../src/game/MobilityBoost";

describe("mobility boost", () => {
  test("starts a bounded speed, stamina, and trap-immunity window", () => {
    expect(activateMobilityBoost()).toBe(MOBILITY_BOOST_DURATION_SECONDS);
    expect(MOBILITY_BOOST_SPEED_MULTIPLIER).toBeGreaterThan(1);
    expect(MOBILITY_BOOST_SPEED_MULTIPLIER).toBeLessThanOrEqual(1.35);
    expect(isMobilityBoostActive(activateMobilityBoost())).toBe(true);
  });

  test("does not shorten an active pickup and expires at zero", () => {
    expect(activateMobilityBoost(20)).toBe(20);
    expect(tickMobilityBoost(2, 0.75)).toBeCloseTo(1.25);
    expect(tickMobilityBoost(0.2, 1)).toBe(0);
    expect(isMobilityBoostActive(0)).toBe(false);
  });

  test("owns the boosted feel tunables for camera, cadence, and footsteps", () => {
    expect(MOBILITY_BOOST_CAMERA_BOB_SCALE).toBeGreaterThan(1.5);
    expect(MOBILITY_BOOST_CAMERA_BOB_SCALE).toBeLessThanOrEqual(2.4);
    expect(MOBILITY_BOOST_FOV_KICK).toBeGreaterThan(2);
    expect(MOBILITY_BOOST_FOV_KICK).toBeLessThanOrEqual(5);
    expect(MOBILITY_BOOST_STRIDE_RATE).toBeGreaterThan(0.65);
    expect(MOBILITY_BOOST_STRIDE_RATE).toBeLessThan(0.9);
    expect(MOBILITY_BOOST_FOOTSTEP_GAIN).toBeGreaterThan(1.8);
    expect(MOBILITY_BOOST_FOOTSTEP_GAIN).toBeLessThanOrEqual(2.6);
    expect(MOBILITY_BOOST_SPEED_MULTIPLIER).toBeGreaterThan(1.2);
  });
});
