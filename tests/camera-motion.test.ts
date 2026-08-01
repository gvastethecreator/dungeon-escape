import { describe, expect, test } from "bun:test";

import { clampLookPitch, dampAngle } from "../src/player/FirstPersonController";
import {
  computeStrafeLeanTarget,
  stepCameraMotion,
  STRAFE_LEAN_MAX,
  type CameraMotionInput,
} from "../src/player/CameraMotionProjection";
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

describe("strafe camera lean", () => {
  test("leans into the right when velocity is along camera right", () => {
    const lean = computeStrafeLeanTarget(1, 0, 1, 0, 1, STRAFE_LEAN_MAX);
    expect(lean).toBeCloseTo(-STRAFE_LEAN_MAX, 5);
  });

  test("leans into the left when velocity is along camera left", () => {
    const lean = computeStrafeLeanTarget(-1, 0, 1, 0, 1, STRAFE_LEAN_MAX);
    expect(lean).toBeCloseTo(STRAFE_LEAN_MAX, 5);
  });

  test("stays neutral when moving purely forward", () => {
    // Camera right is +X; forward velocity is +Z.
    expect(computeStrafeLeanTarget(0, 4, 1, 0, 5, STRAFE_LEAN_MAX)).toBeCloseTo(0, 8);
  });

  test("scales with lateral speed and clamps at full strafe", () => {
    const half = computeStrafeLeanTarget(2.5, 0, 1, 0, 5, 0.1);
    const full = computeStrafeLeanTarget(10, 0, 1, 0, 5, 0.1);
    expect(half).toBeCloseTo(-0.05, 5);
    expect(full).toBeCloseTo(-0.1, 5);
  });

  test("returns zero when motion scale or right vector is empty", () => {
    expect(computeStrafeLeanTarget(3, 0, 0, 0, 5, STRAFE_LEAN_MAX)).toBe(0);
    expect(computeStrafeLeanTarget(3, 0, 1, 0, 5, 0)).toBe(0);
  });
});

describe("reduced-motion camera route", () => {
  const activeInput: CameraMotionInput = {
    delta: 1 / 60,
    moved: true,
    sprinting: true,
    reducedMotion: false,
    motionScale: 1,
    velocityX: 7,
    velocityZ: 0,
    rightX: 1,
    rightZ: 0,
    maxSpeed: 7,
    stridePhase: Math.PI / 2,
    elapsed: 1,
    landingDip: -0.08,
    strafeLean: 0,
    currentFov: 75,
    baseFov: 75,
    mobilityBoost: true,
  };

  test("returns a neutral pose when reduced motion is active", () => {
    const projection = stepCameraMotion({ ...activeInput, reducedMotion: true });

    expect(projection).toEqual({
      rightOffset: 0,
      verticalOffset: 0,
      landingDip: 0,
      roll: 0,
      fov: 75,
    });
  });

  test("projects bob, landing recovery, strafe lean, boost, and FOV in normal mode", () => {
    const projection = stepCameraMotion(activeInput);

    expect(projection.rightOffset).toBeGreaterThan(0);
    expect(projection.verticalOffset).not.toBe(0);
    expect(projection.landingDip).toBeGreaterThan(activeInput.landingDip);
    expect(projection.landingDip).toBeLessThan(0);
    expect(projection.roll).toBeLessThan(0);
    expect(projection.fov).toBeGreaterThan(activeInput.baseFov);
  });

  test("keeps idle breathing without inventing stride bob", () => {
    const projection = stepCameraMotion({
      ...activeInput,
      moved: false,
      sprinting: false,
      velocityX: 0,
      elapsed: Math.PI / (2 * 1.65),
      landingDip: 0,
      mobilityBoost: false,
    });

    expect(projection.rightOffset).toBe(0);
    expect(projection.verticalOffset).toBeCloseTo(0.0035, 6);
    expect(projection.roll).toBe(0);
  });

  test("can reuse an output record on the render path", () => {
    const output = { rightOffset: 9, verticalOffset: 9, landingDip: 9, roll: 9, fov: 9 };

    expect(stepCameraMotion(activeInput, output)).toBe(output);
    expect(output.rightOffset).not.toBe(9);
  });
});
