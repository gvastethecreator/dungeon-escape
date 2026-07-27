import { describe, expect, test } from "bun:test";

import { nextProceduralSeed } from "../src/game/SeedFactory";

describe("procedural editor seed", () => {
  test("always changes even when entropy repeats the current seed", () => {
    expect(nextProceduralSeed(1_336, 1_337)).toBe(1_338);
  });

  test("keeps seeds inside the editor's numeric range", () => {
    expect(nextProceduralSeed(0)).toBe(1);
    expect(nextProceduralSeed(999_999)).toBe(1);
    expect(nextProceduralSeed(0xffff_ffff)).toBeGreaterThanOrEqual(1);
    expect(nextProceduralSeed(0xffff_ffff)).toBeLessThanOrEqual(999_999);
  });
});
