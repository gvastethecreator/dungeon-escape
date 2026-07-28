import { describe, expect, test } from "bun:test";

import {
  clampLookPitch,
  computeStrafeLeanTarget,
  dampAngle,
  STRAFE_LEAN_MAX,
} from "../src/player/FirstPersonController";
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
  test("clears bob, lean, landing bounce, and FOV motion in the controller", async () => {
    const source = await Bun.file(
      new URL("../src/player/FirstPersonController.ts", import.meta.url),
    ).text();
    const transformStart = source.indexOf("private syncCameraTransform");
    const transformSource = source.slice(transformStart);
    const reducedStart = transformSource.indexOf("if (this.reducedMotionQuery.matches) {");
    const reducedEnd = transformSource.indexOf("\n    }\n\n    const motionScale", reducedStart);
    const reducedBranch = transformSource.slice(reducedStart, reducedEnd);

    expect(transformStart).toBeGreaterThanOrEqual(0);
    expect(source).toContain("private readonly baseFov: number;");
    expect(transformSource).toContain("if (this.reducedMotionQuery.matches) {");
    expect(transformSource).toContain("this.landingDip = 0;");
    expect(transformSource).toContain("this.strafeLean = 0;");
    expect(transformSource).toContain("this.camera.position.copy(this.position);");
    expect(transformSource).toContain('this.euler.set(this.lookPitch, this.lookYaw, 0, "YXZ");');
    expect(transformSource).toContain("this.camera.fov = this.baseFov;");
    expect(transformSource).not.toContain("reducedMotion ? 0.16 : 1");
    expect(reducedEnd).toBeGreaterThan(reducedStart);
    expect(reducedBranch).toContain("return;");
    expect(source).not.toContain("[...this.vaultedColliderIds]");
  });
});
