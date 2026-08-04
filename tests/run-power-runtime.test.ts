import { describe, expect, test } from "bun:test";

import {
  applyPickupToRunPowers,
  createRunPowerRuntime,
  resetRunPowerRuntime,
  restoreRunPowerRuntime,
  tickRunPowerRuntime,
} from "../src/game/RunPowerRuntime";
import { MIRROR_CURSE_DURATION_SECONDS } from "../src/game/MirrorCurse";
import { SPIN_CURSE_DURATION_SECONDS } from "../src/game/SpinCurse";
import { TIME_FREEZE_DURATION_SECONDS } from "../src/game/TimeFreeze";

describe("RunPowerRuntime", () => {
  test("tick counts down timed windows and returns pulse count", () => {
    const state = createRunPowerRuntime();
    applyPickupToRunPowers(state, "time-freeze");
    applyPickupToRunPowers(state, "slow-curse");
    expect(state.timeFreezeSeconds).toBe(TIME_FREEZE_DURATION_SECONDS);
    tickRunPowerRuntime(state, 2);
    expect(state.timeFreezeSeconds).toBe(TIME_FREEZE_DURATION_SECONDS - 2);
    expect(state.slowCurseSeconds).toBeGreaterThan(0);
  });

  test("reset clears windows and can carry phoenix", () => {
    const state = createRunPowerRuntime();
    applyPickupToRunPowers(state, "phoenix-egg");
    applyPickupToRunPowers(state, "mobility");
    resetRunPowerRuntime(state, { carryPhoenix: true });
    expect(state.phoenixCharges).toBe(1);
    expect(state.mobilityBoostSeconds).toBe(0);
    resetRunPowerRuntime(state);
    expect(state.phoenixCharges).toBe(0);
  });

  test("mirror and spin clear each other", () => {
    const state = createRunPowerRuntime();
    applyPickupToRunPowers(state, "mirror-curse");
    expect(state.mirrorCurseSeconds).toBe(MIRROR_CURSE_DURATION_SECONDS);
    applyPickupToRunPowers(state, "spin-curse");
    expect(state.mirrorCurseSeconds).toBe(0);
    expect(state.spinCurseSeconds).toBe(SPIN_CURSE_DURATION_SECONDS);
    applyPickupToRunPowers(state, "mirror-curse");
    expect(state.spinCurseSeconds).toBe(0);
    expect(state.mirrorCurseSeconds).toBe(MIRROR_CURSE_DURATION_SECONDS);
  });

  test("restore rehydrates remaining windows", () => {
    const state = createRunPowerRuntime();
    restoreRunPowerRuntime(state, {
      timeFreezeRemaining: 4,
      swarmCurseActive: true,
      cullBrandRemaining: 6,
      phoenixCharges: 1,
      mapRevealed: true,
    });
    expect(state.timeFreezeSeconds).toBe(4);
    expect(state.swarmCurseActive).toBe(true);
    expect(state.cullBrand.remaining).toBe(6);
    expect(state.cullBrand.charges).toBe(1);
    expect(state.phoenixCharges).toBe(1);
    expect(state.mapRevealed).toBe(true);
  });

  test("applyPickupToRunPowers returns false for stone", () => {
    const state = createRunPowerRuntime();
    expect(applyPickupToRunPowers(state, "stone")).toBe(false);
  });
});
