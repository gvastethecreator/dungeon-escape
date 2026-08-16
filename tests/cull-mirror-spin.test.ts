import { describe, expect, test } from "bun:test";

import {
  activateCullBrand,
  createCullBrandState,
  isCullBrandActive,
  tickCullBrand,
  tryConsumeCullBrand,
} from "../src/game/CullBrand";
import {
  activateMirrorCurse,
  isMirrorCurseActive,
  MIRROR_CURSE_DURATION_SECONDS,
  tickMirrorCurse,
} from "../src/game/MirrorCurse";
import {
  activateSpinCurse,
  isSpinCurseActive,
  SPIN_CURSE_DURATION_SECONDS,
  SPIN_CURSE_YAW_BIAS,
  tickSpinCurse,
} from "../src/game/SpinCurse";
import { OFFENSE_POWER_KINDS, planOffensePowerKind } from "../src/game/OffensePowerPlan";
import { CURSE_CHEST_KINDS, planCurseChestPlacements } from "../src/game/CurseChestPlan";
import { projectPickupFeedback } from "../src/ui/PickupFeedback";
import { applyWorldUpdate, createRunSession } from "../src/game/RunSession";
import { QuestState } from "../src/game/QuestState";

describe("cull brand", () => {
  test("activates one charge and expires on tick or consume", () => {
    const state = createCullBrandState();
    activateCullBrand(state);
    expect(isCullBrandActive(state)).toBe(true);
    expect(tryConsumeCullBrand(state)).toBe(true);
    expect(isCullBrandActive(state)).toBe(false);
    expect(tryConsumeCullBrand(state)).toBe(false);

    activateCullBrand(state);
    tickCullBrand(state, 100);
    expect(isCullBrandActive(state)).toBe(false);
  });
});

describe("mirror and spin curses", () => {
  test("timed control curses activate and expire", () => {
    expect(activateMirrorCurse()).toBe(MIRROR_CURSE_DURATION_SECONDS);
    expect(tickMirrorCurse(activateMirrorCurse(), 100)).toBe(0);
    expect(isMirrorCurseActive(activateMirrorCurse())).toBe(true);

    expect(activateSpinCurse()).toBe(SPIN_CURSE_DURATION_SECONDS);
    expect(tickSpinCurse(activateSpinCurse(), 100)).toBe(0);
    expect(isSpinCurseActive(activateSpinCurse())).toBe(true);
    expect(SPIN_CURSE_YAW_BIAS).toBeGreaterThan(0);
  });
});

describe("offense power pool", () => {
  test("is deterministic and stays inside the offense kind set", () => {
    const a = planOffensePowerKind("offense-seed-9");
    const b = planOffensePowerKind("offense-seed-9");
    expect(a).toBe(b);
    expect(OFFENSE_POWER_KINDS).toContain(a);
  });
});

describe("curse plan includes control curses", () => {
  test("catalog lists mirror and spin", () => {
    expect(CURSE_CHEST_KINDS).toContain("mirror-curse");
    expect(CURSE_CHEST_KINDS).toContain("spin-curse");
    const placements = planCurseChestPlacements("control-curse-seed", "obsidian");
    for (const entry of placements) {
      expect(CURSE_CHEST_KINDS).toContain(entry.kind);
    }
  });
});

describe("pickup feedback and session effects", () => {
  test("projects cull brand and control curses", () => {
    expect(projectPickupFeedback({ cullBrand: true })).toEqual({
      kind: "cull-brand",
      kickerKey: "itemFound",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ mirrorCurse: true })).toEqual({
      kind: "mirror-curse",
      kickerKey: "curseFound",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ spinCurse: true })).toEqual({
      kind: "spin-curse",
      kickerKey: "curseFound",
      restoreResolve: false,
    });
  });

  test("run session applies new pickup kinds", () => {
    const session = createRunSession(100);
    const quest = new QuestState();
    const cull = applyWorldUpdate(session, quest, {
      collectedPickupKind: "cull-brand",
      collectedStoneId: null,
      stonesFound: 0,
      stonesTotal: 4,
      portalOpen: false,
      resolveGain: 0,
      damage: 0,
      reachedLockedExit: false,
      reachedOpenExit: false,
    });
    expect(cull.pickup?.cullBrand).toBe(true);
    expect(cull.status).toBeUndefined();

    const mirror = applyWorldUpdate(session, quest, {
      collectedPickupKind: "mirror-curse",
      collectedStoneId: null,
      stonesFound: 0,
      stonesTotal: 4,
      portalOpen: false,
      resolveGain: 0,
      damage: 0,
      reachedLockedExit: false,
      reachedOpenExit: false,
    });
    expect(mirror.pickup?.mirrorCurse).toBe(true);
    expect(mirror.flash).toBe("damage");
  });
});
