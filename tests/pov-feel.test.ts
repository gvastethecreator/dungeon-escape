import { describe, expect, test } from "bun:test";

import {
  computePovFeel,
  POV_CHROMATIC_MAX,
  POV_CURVATURE_BASE,
  POV_CURVATURE_MIN,
  POV_CURVATURE_SPRINT,
  POV_THREAT_FAR,
  POV_THREAT_NEAR,
  PovFeelState,
  samplePovShake,
  threatProximity,
} from "../src/systems/povFeel";

describe("pov feel curves", () => {
  test("idle has base curvature and no threat FX", () => {
    const feel = computePovFeel({
      sprinting: false,
      speedRatio: 0,
      threatDistance: null,
    });
    expect(feel.curvature).toBeCloseTo(POV_CURVATURE_BASE, 4);
    expect(feel.chromatic).toBe(0);
    expect(feel.shake).toBe(0);
  });

  test("sprint raises curvature above base", () => {
    const walk = computePovFeel({ sprinting: false, speedRatio: 0.4, threatDistance: null });
    const sprint = computePovFeel({ sprinting: true, speedRatio: 1, threatDistance: null });
    expect(sprint.curvature).toBeGreaterThan(walk.curvature);
    expect(sprint.curvature).toBeGreaterThan(POV_CURVATURE_BASE);
    expect(sprint.curvature).toBeLessThanOrEqual(POV_CURVATURE_BASE + POV_CURVATURE_SPRINT + 0.001);
  });

  test("threat proximity ramps between far and near bands", () => {
    expect(threatProximity(null)).toBe(0);
    expect(threatProximity(POV_THREAT_FAR + 1)).toBe(0);
    expect(threatProximity(POV_THREAT_NEAR)).toBe(1);
    expect(threatProximity(POV_THREAT_NEAR - 0.5)).toBe(1);
    const mid = threatProximity((POV_THREAT_FAR + POV_THREAT_NEAR) / 2);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });

  test("close threat enables shake and chromatic aberration", () => {
    const calm = computePovFeel({ sprinting: false, speedRatio: 0, threatDistance: 12 });
    const danger = computePovFeel({
      sprinting: false,
      speedRatio: 0,
      threatDistance: POV_THREAT_NEAR,
    });
    expect(calm.shake).toBe(0);
    expect(calm.chromatic).toBe(0);
    expect(danger.shake).toBeGreaterThan(0.9);
    expect(danger.chromatic).toBeCloseTo(POV_CHROMATIC_MAX, 5);
  });

  test("reduced motion clamps warp and softens threat FX", () => {
    const feel = computePovFeel({
      sprinting: true,
      speedRatio: 1,
      threatDistance: 1.5,
      reducedMotion: true,
    });
    expect(feel.curvature).toBe(POV_CURVATURE_MIN);
    expect(feel.shake).toBeLessThan(0.2);
    expect(feel.chromatic).toBeLessThan(POV_CHROMATIC_MAX * 0.2);
  });

  test("feel state damps toward targets without snapping", () => {
    const state = new PovFeelState();
    const target = computePovFeel({
      sprinting: true,
      speedRatio: 1,
      threatDistance: 1,
    });
    const mid = state.apply(target, 1 / 60);
    expect(mid.curvature).toBeGreaterThan(POV_CURVATURE_BASE);
    expect(mid.curvature).toBeLessThan(target.curvature);
    expect(mid.shake).toBeLessThan(target.shake);
    // Several frames approach the target.
    let last = mid;
    for (let i = 0; i < 40; i += 1) last = state.apply(target, 1 / 30);
    expect(last.shake).toBeGreaterThan(0.85);
  });

  test("shake sample is zero at rest and bounded under full stress", () => {
    expect(samplePovShake(1.2, 0)).toEqual({ x: 0, y: 0, roll: 0 });
    const s = samplePovShake(0.33, 1);
    expect(Math.abs(s.x)).toBeLessThan(0.03);
    expect(Math.abs(s.y)).toBeLessThan(0.03);
    expect(Math.abs(s.roll)).toBeLessThan(0.03);
  });
});
