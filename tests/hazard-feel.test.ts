import { describe, expect, test } from "bun:test";

import {
  computeHazardFeel,
  decayHazardHitBoost,
  resolveDamageWashKind,
} from "../src/systems/HazardFeel";

describe("hazard feel — damage wash routing", () => {
  test("surface damage uses the hazard color, not enemy blood red", () => {
    expect(resolveDamageWashKind("toxin", 3)).toBe("toxin");
    expect(resolveDamageWashKind("fire", 5)).toBe("fire");
    expect(resolveDamageWashKind("ice", 0)).toBe("enemy");
    expect(resolveDamageWashKind(null, 0)).toBe("enemy");
    expect(resolveDamageWashKind("spikes", 14)).toBe("spikes");
  });
});

describe("hazard feel — continuous lens response", () => {
  test("toxin grades green without heatwave", () => {
    const feel = computeHazardFeel("toxin");
    expect(feel.toxinGreen).toBeGreaterThan(0.2);
    expect(feel.heatwave).toBe(0);
    expect(feel.iceBlue).toBe(0);
  });

  test("fire drives heatwave and hit boost raises it further", () => {
    const base = computeHazardFeel("fire", 0);
    const hit = computeHazardFeel("fire", 1);
    expect(base.heatwave).toBeGreaterThan(0.4);
    expect(hit.heatwave).toBeGreaterThan(base.heatwave);
    expect(base.toxinGreen).toBe(0);
  });

  test("ice and spikes stay on their own channels", () => {
    const ice = computeHazardFeel("ice");
    const spikes = computeHazardFeel("spikes", 1);
    expect(ice.iceBlue).toBeGreaterThan(0.15);
    expect(ice.heatwave).toBe(0);
    expect(spikes.spikeEdge).toBeGreaterThan(0.4);
    expect(spikes.toxinGreen).toBe(0);
  });

  test("reduced motion softens animated heat and spike pulse", () => {
    const full = computeHazardFeel("fire", 1, false);
    const soft = computeHazardFeel("fire", 1, true);
    expect(soft.heatwave).toBeLessThan(full.heatwave);
  });

  test("hit boost decays over less than a second", () => {
    expect(decayHazardHitBoost(1, 0.4)).toBeCloseTo(1 - 0.4 / 0.85, 5);
    expect(decayHazardHitBoost(0.1, 1)).toBe(0);
  });
});

describe("hazard feel — host wiring and styles", () => {
  test("main routes surface damage into wash kind and post hazard feel", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("resolveDamageWashKind");
    expect(main).toContain("computeHazardFeel");
    expect(main).toContain("setHazardFeel");
    expect(main).toContain("hazardHitBoost");
    expect(main).toContain("elements.hazardOverlay");
  });

  test("host exposes hazard overlay and damage vignette kinds", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    expect(host).toContain('id="hazard-overlay"');
    expect(host).toContain('id="damage-vignette"');
    expect(css).toContain('.damage-vignette[data-kind="toxin"]');
    expect(css).toContain('.damage-vignette[data-kind="fire"]');
    expect(css).toContain("hazard-heat-drift");
    expect(css).toContain('.hazard-overlay[data-hazard="toxin"]');
    expect(css).toContain('.hazard-overlay[data-hazard="fire"]');
  });

  test("post pass owns heatwave UV warp and toxin grade", async () => {
    const source = await Bun.file(new URL("../src/systems/PovPostFx.ts", import.meta.url)).text();
    expect(source).toContain("uHeatwave");
    expect(source).toContain("uToxinGreen");
    expect(source).toContain("uIceBlue");
    expect(source).toContain("heatwaveOffset");
    expect(source).toContain("setHazardFeel");
  });
});
