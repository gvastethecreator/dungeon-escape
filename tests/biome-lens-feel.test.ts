import { describe, expect, test } from "bun:test";

import {
  computeBiomeLensFeel,
  SUNKEN_WATER_WARP,
  SUNKEN_WATER_WARP_REDUCED,
} from "../src/systems/BiomeLensFeel";
import { listDungeonMoodIds } from "../src/systems/DungeonMood";

describe("biome lens feel", () => {
  test("only sunken authors a continuous underwater warp", () => {
    for (const id of listDungeonMoodIds()) {
      const feel = computeBiomeLensFeel(id);
      if (id === "sunken") {
        expect(feel.waterWarp).toBeCloseTo(SUNKEN_WATER_WARP, 5);
        expect(feel.waterWarp).toBeGreaterThan(0.1);
        expect(feel.waterWarp).toBeLessThan(0.35);
      } else {
        expect(feel.waterWarp).toBe(0);
      }
    }
    expect(computeBiomeLensFeel(null).waterWarp).toBe(0);
    expect(computeBiomeLensFeel(undefined).waterWarp).toBe(0);
  });

  test("reduced motion softens sunken warp without killing the hint", () => {
    const full = computeBiomeLensFeel("sunken", false);
    const soft = computeBiomeLensFeel("sunken", true);
    expect(soft.waterWarp).toBeCloseTo(SUNKEN_WATER_WARP_REDUCED, 5);
    expect(soft.waterWarp).toBeLessThan(full.waterWarp);
    expect(soft.waterWarp).toBeGreaterThan(0);
  });

  test("host wires biome lens into the post pass next to hazard feel", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("computeBiomeLensFeel");
    expect(main).toContain("setBiomeLensFeel");
    expect(main).toContain("biomeLens.waterWarp");
  });

  test("post pass owns water warp UV noise independent of heatwave", async () => {
    const source = await Bun.file(new URL("../src/systems/PovPostFx.ts", import.meta.url)).text();
    expect(source).toContain("uWaterWarp");
    expect(source).toContain("waterWarpOffset");
    expect(source).toContain("setBiomeLensFeel");
    expect(source).toContain("heat + water");
  });
});
