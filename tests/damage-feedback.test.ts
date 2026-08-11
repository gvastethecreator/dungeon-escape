import { describe, expect, test } from "bun:test";

import { knockbackAwayFrom } from "../src/world/DungeonWorld";

describe("damage feedback — knockback direction", () => {
  test("pushes target away from attacker on +X", () => {
    const dir = knockbackAwayFrom(5, 0, 0, 0);
    expect(dir.x).toBeCloseTo(1, 5);
    expect(dir.z).toBeCloseTo(0, 5);
  });

  test("pushes target away from attacker on -Z", () => {
    const dir = knockbackAwayFrom(0, -3, 0, 0);
    expect(dir.x).toBeCloseTo(0, 5);
    expect(dir.z).toBeCloseTo(-1, 5);
  });

  test("returns unit length for diagonal push", () => {
    const dir = knockbackAwayFrom(3, 4, 0, 0);
    expect(Math.hypot(dir.x, dir.z)).toBeCloseTo(1, 5);
    expect(dir.x).toBeCloseTo(0.6, 5);
    expect(dir.z).toBeCloseTo(0.8, 5);
  });

  test("fallback unit vector when source and target coincide", () => {
    const dir = knockbackAwayFrom(2, 2, 2, 2);
    expect(Math.hypot(dir.x, dir.z)).toBeCloseTo(1, 5);
  });
});

describe("damage feedback — HUD markup and styles", () => {
  test("health orb hosts splatter layer for blood particles", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('class="health-orb__splatter"');
    expect(host).toContain('id="damage-vignette"');
  });

  test("styles define full-screen red wash and orb splash particles", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    expect(css).toContain("damage-red-wash");
    expect(css).toContain(".damage-vignette.is-hit");
    expect(css).toContain('.damage-vignette[data-kind="toxin"]');
    expect(css).toContain('.damage-vignette[data-kind="fire"]');
    expect(css).toContain(".health-orb__splatter");
    expect(css).toContain(".health-orb__drop");
    expect(css).toContain("orb-splatter");
    expect(css).toContain(".health-orb.is-hurt");
  });

  test("controller exposes applyKnockback", async () => {
    const src = await Bun.file(
      new URL("../src/player/FirstPersonController.ts", import.meta.url),
    ).text();
    expect(src).toContain("applyKnockback");
    expect(src).toContain("knockVel");
  });

  test("main wires knockback + orb splash on damage", async () => {
    const src = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(src).toContain("triggerDamageFeedback");
    expect(src).toContain("spawnOrbBloodSplash");
    expect(src).toContain("worldUpdate.knockback");
    expect(src).toContain("DAMAGE_WASH_SECONDS");
    expect(src).toContain("projectPlayStepDamage");
    expect(src).toContain("damageIntent.washKind");
  });

  test("main arms hit trauma so the camera keeps shaking after a hit", async () => {
    const src = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(src).toContain("hitTrauma = 1");
    expect(src).toContain("decayHitTrauma");
    expect(src).toContain("hitTrauma: simulationActive ? hitTrauma : 0");
  });
});
