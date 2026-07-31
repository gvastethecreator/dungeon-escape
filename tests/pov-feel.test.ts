import { describe, expect, test } from "bun:test";

import {
  computePovFeel,
  decayExhaustionTrauma,
  decayHitTrauma,
  POV_BOOST_CHROMATIC,
  POV_BOOST_CURVATURE,
  POV_CHROMATIC_MAX,
  POV_CURVATURE_BASE,
  POV_CURVATURE_MIN,
  POV_CURVATURE_SPRINT,
  POV_EXHAUST_TRAUMA_SECONDS,
  POV_HIT_TRAUMA_SECONDS,
  POV_SHAKE_MAX,
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
    expect(danger.shake).toBeGreaterThan(POV_SHAKE_MAX * 0.9);
    expect(danger.chromatic).toBeCloseTo(POV_CHROMATIC_MAX, 5);
  });

  test("hit trauma shakes for a few seconds even without nearby enemies", () => {
    const fresh = computePovFeel({
      sprinting: false,
      speedRatio: 0,
      threatDistance: null,
      hitTrauma: 1,
    });
    const fading = computePovFeel({
      sprinting: false,
      speedRatio: 0,
      threatDistance: null,
      hitTrauma: 0.35,
    });
    const gone = computePovFeel({
      sprinting: false,
      speedRatio: 0,
      threatDistance: null,
      hitTrauma: 0,
    });
    expect(fresh.shake).toBeGreaterThan(0.85);
    expect(fresh.chromatic).toBeGreaterThan(0);
    expect(fading.shake).toBeGreaterThan(0);
    expect(fading.shake).toBeLessThan(fresh.shake);
    expect(gone.shake).toBe(0);
  });

  test("hit trauma decays over a few seconds", () => {
    expect(decayHitTrauma(1, 0)).toBe(1);
    expect(decayHitTrauma(1, POV_HIT_TRAUMA_SECONDS)).toBe(0);
    expect(decayHitTrauma(1, POV_HIT_TRAUMA_SECONDS * 0.5)).toBeCloseTo(0.5, 5);
    expect(decayHitTrauma(0.1, 1)).toBe(0);
  });

  test("exhaustion trauma shakes without a hit and decays over a few seconds", () => {
    const exhausted = computePovFeel({
      sprinting: false,
      speedRatio: 0,
      threatDistance: null,
      exhaustionTrauma: 1,
    });
    const calm = computePovFeel({
      sprinting: false,
      speedRatio: 0,
      threatDistance: null,
      exhaustionTrauma: 0,
    });
    expect(exhausted.shake).toBeGreaterThan(0.5);
    expect(exhausted.shake).toBeLessThan(1.001);
    expect(calm.shake).toBe(0);
    expect(decayExhaustionTrauma(1, 0)).toBe(1);
    expect(decayExhaustionTrauma(1, POV_EXHAUST_TRAUMA_SECONDS)).toBe(0);
    expect(decayExhaustionTrauma(1, POV_EXHAUST_TRAUMA_SECONDS * 0.5)).toBeCloseTo(0.5, 5);
  });

  test("mobility boost adds a strong chromatic fringe, warp, and speed shake", () => {
    const calm = computePovFeel({
      sprinting: false,
      speedRatio: 0,
      threatDistance: null,
      mobilityBoost: 0,
    });
    const boostedIdle = computePovFeel({
      sprinting: false,
      speedRatio: 0,
      threatDistance: null,
      mobilityBoost: 1,
    });
    const boostedRun = computePovFeel({
      sprinting: true,
      speedRatio: 1,
      threatDistance: null,
      mobilityBoost: 1,
    });
    expect(calm.chromatic).toBe(0);
    // Soft fringe only — strong radial CA draws four hard corner diagonals.
    expect(boostedIdle.chromatic).toBeGreaterThan(0);
    expect(boostedRun.chromatic).toBeCloseTo(POV_BOOST_CHROMATIC, 5);
    expect(POV_BOOST_CHROMATIC).toBeGreaterThan(POV_CHROMATIC_MAX * 0.5);
    expect(POV_BOOST_CHROMATIC).toBeLessThan(0.004);
    expect(boostedIdle.curvature).toBeCloseTo(POV_CURVATURE_BASE + POV_BOOST_CURVATURE * 0.5, 4);
    expect(boostedIdle.curvature).toBeGreaterThan(calm.curvature);
    expect(boostedRun.shake).toBeGreaterThan(boostedIdle.shake);
    expect(boostedRun.shake).toBeGreaterThan(0.15);
  });

  test("reduced motion keeps the POV static despite sprint, threat, and trauma", () => {
    const reduced = computePovFeel({
      sprinting: true,
      speedRatio: 1,
      threatDistance: 1.5,
      hitTrauma: 1,
      exhaustionTrauma: 1,
      mobilityBoost: 1,
      reducedMotion: true,
    });
    expect(reduced.curvature).toBe(POV_CURVATURE_MIN);
    expect(reduced.shake).toBe(0);
    expect(reduced.chromatic).toBe(0);

    const state = new PovFeelState();
    state.apply(
      computePovFeel({
        sprinting: true,
        speedRatio: 1,
        threatDistance: 1.5,
        hitTrauma: 1,
        exhaustionTrauma: 1,
      }),
      1,
    );
    const settled = state.apply(reduced, 1 / 60);
    expect(settled.curvature).toBe(POV_CURVATURE_MIN);
    expect(settled.shake).toBe(0);
    expect(settled.chromatic).toBe(0);
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
    expect(last.shake).toBeGreaterThan(POV_SHAKE_MAX * 0.85);
  });

  test("shake sample is zero at rest and bounded under full stress", () => {
    expect(samplePovShake(1.2, 0)).toEqual({ x: 0, y: 0, roll: 0 });
    const s = samplePovShake(0.33, 1);
    expect(Math.abs(s.x)).toBeLessThan(0.04);
    expect(Math.abs(s.y)).toBeLessThan(0.04);
    expect(Math.abs(s.roll)).toBeLessThan(0.04);
  });
});
