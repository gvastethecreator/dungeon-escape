import { describe, expect, test } from "bun:test";

import { SPIN_CURSE_SENSITIVITY_SCALE, SPIN_CURSE_YAW_BIAS } from "../src/game/SpinCurse";
import { projectLocomotionMods } from "../src/player/ControlModsProjection";

describe("ControlModsProjection", () => {
  test("clears all control mods when windows are inactive", () => {
    expect(
      projectLocomotionMods({
        mirrorCurseRemaining: 0,
        spinCurseRemaining: 0,
        slowCurseRemaining: 0,
        mobilityBoostRemaining: 0,
      }),
    ).toEqual({
      invertLook: false,
      invertMove: false,
      yawBias: 0,
      sensitivityScale: 1,
      slowActive: false,
      mobilityActive: false,
    });
  });

  test("projects mirror invert without spin bias", () => {
    const mods = projectLocomotionMods({
      mirrorCurseRemaining: 4,
      spinCurseRemaining: 0,
    });
    expect(mods.invertLook).toBe(true);
    expect(mods.invertMove).toBe(true);
    expect(mods.yawBias).toBe(0);
    expect(mods.sensitivityScale).toBe(1);
  });

  test("projects spin yaw and sensitivity", () => {
    const mods = projectLocomotionMods({
      mirrorCurseRemaining: 0,
      spinCurseRemaining: 3,
      slowCurseRemaining: 2,
      mobilityBoostRemaining: 1,
    });
    expect(mods.yawBias).toBe(SPIN_CURSE_YAW_BIAS);
    expect(mods.sensitivityScale).toBe(SPIN_CURSE_SENSITIVITY_SCALE);
    expect(mods.slowActive).toBe(true);
    expect(mods.mobilityActive).toBe(true);
  });
});
