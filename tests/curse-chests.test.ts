import { describe, expect, test } from "bun:test";

import {
  CURSE_CHEST_KINDS,
  CURSE_KIND_SPAWN_CHANCE,
  CURSE_MAX_PER_FLOOR,
  CURSE_MIN_BIOME_RANK,
  CURSE_MIN_DEPTH_FRACTION,
  isBiomeEligibleForCurseChests,
  planCurseChestPlacements,
} from "../src/game/CurseChestPlan";
import { FRENZY_CURSE_SPEED_MULTIPLIER, activateFrenzyCurse, tickFrenzyCurse } from "../src/game/FrenzyCurse";
import { GLOOM_CURSE_FOG_MULTIPLIER, activateGloomCurse, tickGloomCurse } from "../src/game/GloomCurse";
import { SLOW_CURSE_SPEED_MULTIPLIER, activateSlowCurse, tickSlowCurse } from "../src/game/SlowCurse";
import { SWARM_CURSE_TARGET_MULTIPLIER, swarmTargetEnemies } from "../src/game/SwarmCurse";

describe("curse pure modules", () => {
  test("timed curses activate, tick, and expire", () => {
    expect(activateSlowCurse()).toBeGreaterThan(0);
    expect(tickSlowCurse(activateSlowCurse(), 100)).toBe(0);
    expect(SLOW_CURSE_SPEED_MULTIPLIER).toBeLessThan(1);

    expect(activateFrenzyCurse()).toBeGreaterThan(0);
    expect(tickFrenzyCurse(activateFrenzyCurse(), 100)).toBe(0);
    expect(FRENZY_CURSE_SPEED_MULTIPLIER).toBeGreaterThan(1);

    expect(activateGloomCurse()).toBeGreaterThan(0);
    expect(tickGloomCurse(activateGloomCurse(), 100)).toBe(0);
    expect(GLOOM_CURSE_FOG_MULTIPLIER).toBeGreaterThan(1);
  });

  test("swarm doubles the active monster target", () => {
    expect(swarmTargetEnemies(12, false)).toBe(12);
    expect(swarmTargetEnemies(12, true)).toBe(12 * SWARM_CURSE_TARGET_MULTIPLIER);
    expect(swarmTargetEnemies(7.9, true)).toBe(14);
  });
});

describe("curse chest placement plan", () => {
  test("blocks early biomes and caps mid/late floors", () => {
    expect(CURSE_MIN_BIOME_RANK).toBe(3);
    expect(CURSE_MAX_PER_FLOOR).toBe(2);
    expect(CURSE_KIND_SPAWN_CHANCE).toBeLessThan(0.5);
    expect(isBiomeEligibleForCurseChests("ancient")).toBe(false);
    expect(isBiomeEligibleForCurseChests("molten")).toBe(false);
    expect(isBiomeEligibleForCurseChests("frost")).toBe(false);
    expect(isBiomeEligibleForCurseChests("grim")).toBe(true);
    expect(isBiomeEligibleForCurseChests("backrooms")).toBe(true);
    expect(planCurseChestPlacements("seed-a", "ancient")).toEqual([]);
  });

  test("is deterministic, unique by kind, and stays under the positive-chest budget", () => {
    const a = planCurseChestPlacements("curse-plan-17", "obsidian");
    const b = planCurseChestPlacements("curse-plan-17", "obsidian");
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(CURSE_MAX_PER_FLOOR);
    expect(a.length).toBeLessThan(8);
    expect(new Set(a.map((entry) => entry.kind)).size).toBe(a.length);
    for (const entry of a) {
      expect(CURSE_CHEST_KINDS).toContain(entry.kind);
      expect(entry.depthFraction).toBeGreaterThanOrEqual(CURSE_MIN_DEPTH_FRACTION);
    }
  });

  test("wires cursed kinds through the static scene chest path", async () => {
    const source = await Bun.file(
      new URL("../src/world/StaticDungeonScene.ts", import.meta.url),
    ).text();
    expect(source).toContain("planCurseChestPlacements");
    expect(source).toContain("swarm-curse");
    expect(source).toContain("slow-curse");
    expect(source).toContain("frenzy-curse");
    expect(source).toContain("gloom-curse");
    expect(source).toContain("mirror-curse");
    expect(source).toContain("spin-curse");
    expect(source).toContain("planOffensePowerKind");
    expect(source).toContain("cull-brand");
  });

  test("host wires curse HUD chips, floor swarm clear, and minimap markers", async () => {
    const [main, resumeMap, minimap, html] = await Promise.all([
      Bun.file(new URL("../src/main.ts", import.meta.url)).text(),
      Bun.file(new URL("../src/game/RunResumeMapping.ts", import.meta.url)).text(),
      Bun.file(new URL("../src/ui/projectMinimapFeatures.ts", import.meta.url)).text(),
      Bun.file(new URL("../index.html", import.meta.url)).text(),
    ]);
    expect(html).toContain('id="slow-curse-status"');
    expect(html).toContain('id="swarm-curse-status"');
    expect(html).toContain('id="mirror-curse-status"');
    expect(html).toContain('id="spin-curse-status"');
    expect(html).toContain('id="cull-brand-status"');
    expect(main).toContain("syncCurseHud");
    expect(main).toContain("resetCurseHud");
    expect(main).toContain("setSlowCurse");
    expect(main).toContain("setControlMods");
    expect(resumeMap).toContain("nextResume.swarmCurseActive = false");
    expect(minimap).toContain('firstUncollected(input.pickups, "swarm-curse")');
    expect(minimap).toContain('firstUncollected(input.pickups, "gloom-curse")');
    expect(minimap).toContain('firstUncollected(input.pickups, "mirror-curse")');
    expect(minimap).toContain('firstUncollected(input.pickups, "cull-brand")');
  });
});
