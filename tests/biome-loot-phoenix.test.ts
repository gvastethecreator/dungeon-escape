import { describe, expect, test } from "bun:test";

import {
  planBiomeLootBudget,
  spreadDepthFractions,
  FLOOR_LOOT_HARD_CAP,
} from "../src/game/BiomeLootPlan";
import {
  armPhoenixCharge,
  hasPhoenixCharge,
  PHOENIX_REVIVE_RESOLVE,
  phoenixReviveResolve,
  tryConsumePhoenixCharge,
} from "../src/game/PhoenixEgg";
import { applyWorldUpdate, createRunSession } from "../src/game/RunSession";
import { QuestState } from "../src/game/QuestState";
import { projectPickupFeedback } from "../src/ui/PickupFeedback";
import { COPY } from "../src/ui/copy";

describe("biome loot plan", () => {
  test("harder biomes get more health and free support", () => {
    const soft = planBiomeLootBudget("ancient", "loot-seed-a");
    const hard = planBiomeLootBudget("backrooms", "loot-seed-a");
    expect(soft.healthTotal).toBeLessThan(hard.healthTotal);
    expect(soft.freeFlasks).toBeLessThan(hard.freeFlasks);
    expect(soft.extraSupportChests.length).toBe(0);
    expect(hard.extraSupportChests.length).toBe(2);
    expect(hard.freePowers.length).toBeGreaterThan(0);
  });

  test("is deterministic and respects hard cap projection", () => {
    const a = planBiomeLootBudget("fungal", "same-seed");
    const b = planBiomeLootBudget("fungal", "same-seed");
    expect(a).toEqual(b);
    const projected =
      a.healthChests +
      a.freeFlasks +
      a.freePowers.length +
      a.extraSupportChests.length +
      (a.placePhoenix ? 1 : 0);
    expect(projected).toBeLessThanOrEqual(FLOOR_LOOT_HARD_CAP);
  });

  test("skips phoenix when already armed", () => {
    const armed = planBiomeLootBudget("grim", "egg", { phoenixArmed: true });
    expect(armed.placePhoenix).toBe(false);
    const fresh = planBiomeLootBudget("grim", "egg", { phoenixArmed: false });
    expect(fresh.placePhoenix).toBe(true);
  });

  test("spreadDepthFractions covers the route", () => {
    expect(spreadDepthFractions(0)).toEqual([]);
    expect(spreadDepthFractions(1)[0]).toBeCloseTo(0.525, 3);
    expect(spreadDepthFractions(3).length).toBe(3);
  });
});

describe("phoenix egg rules", () => {
  test("arms and consumes one charge", () => {
    expect(hasPhoenixCharge(0)).toBe(false);
    const armed = armPhoenixCharge(0);
    expect(hasPhoenixCharge(armed)).toBe(true);
    const spent = tryConsumePhoenixCharge(armed);
    expect(spent.consumed).toBe(true);
    expect(spent.charges).toBe(0);
    expect(phoenixReviveResolve()).toBe(PHOENIX_REVIVE_RESOLVE);
  });

  test("lethal damage with charge revives instead of dying", () => {
    const session = createRunSession(10);
    const quest = new QuestState();
    quest.start(0);
    const effects = applyWorldUpdate(
      session,
      quest,
      {
        collectedStoneId: null,
        stonesFound: 0,
        stonesTotal: 4,
        portalOpen: false,
        resolveGain: 0,
        damage: 40,
        reachedLockedExit: false,
        reachedOpenExit: false,
        phoenixCharges: 1,
      },
      1000,
    );
    expect(session.runMode).toBe("playing");
    expect(session.resolve).toBe(PHOENIX_REVIVE_RESOLVE);
    expect(effects.phoenixRevive).toBe(true);
    expect(effects.endOverlay).toBeUndefined();
    expect(effects.phoenixCharges).toBe(0);
  });

  test("lethal damage without charge ends the run", () => {
    const session = createRunSession(5);
    const quest = new QuestState();
    quest.start(0);
    const effects = applyWorldUpdate(
      session,
      quest,
      {
        collectedStoneId: null,
        stonesFound: 0,
        stonesTotal: 4,
        portalOpen: false,
        resolveGain: 0,
        damage: 20,
        reachedLockedExit: false,
        reachedOpenExit: false,
        phoenixCharges: 0,
      },
      1000,
    );
    expect(session.runMode).toBe("dead");
    expect(effects.endOverlay).toBe("dead");
  });

  test("pickup feedback and copy exist", () => {
    expect(projectPickupFeedback({ phoenixEgg: true })).toEqual({
      kind: "phoenix-egg",
      kickerKey: "itemFound",
      restoreResolve: false,
    });
    expect(COPY.pickup.phoenixEgg).toContain("Phoenix");
    expect(COPY.status.phoenixRevive).toContain(String(PHOENIX_REVIVE_RESOLVE));
  });
});

describe("host wiring smoke", () => {
  test("scene and host expose phoenix and free loot seams", async () => {
    const [scene, main, html] = await Promise.all([
      Bun.file(new URL("../src/world/StaticDungeonScene.ts", import.meta.url)).text(),
      Bun.file(new URL("../src/main.ts", import.meta.url)).text(),
      Bun.file(new URL("../index.html", import.meta.url)).text(),
    ]);
    expect(scene).toContain("planBiomeLootBudget");
    expect(scene).toContain("addFloorPickup");
    expect(scene).toContain("phoenix-egg");
    expect(main).toContain("applyPhoenixRevive");
    expect(main).toContain("syncPhoenixHud");
    expect(html).toContain('id="phoenix-status"');
    expect(html).toContain("phoenix-egg.webp");
    expect(html).toContain("cull-brand.webp");
    expect(html).toContain("mirror-curse.webp");
    expect(html).toContain("spin-curse.webp");
  });
});
