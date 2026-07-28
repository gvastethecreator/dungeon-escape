import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  LEADERBOARD_PORTRAIT_COUNT,
  LEADERBOARD_PORTRAIT_SEED_PREFIX,
  LEADERBOARD_PORTRAITS,
  frameForRank,
  frameKindForRank,
  portraitForName,
  portraitIndexForName,
} from "../src/leaderboard/portraits";

const portraitRoot = join(import.meta.dir, "../public/assets/ui/portraits");

describe("leaderboard portraits", () => {
  test("keeps a fixed roster with unique slugs", () => {
    expect(LEADERBOARD_PORTRAITS).toHaveLength(LEADERBOARD_PORTRAIT_COUNT);
    expect(LEADERBOARD_PORTRAIT_COUNT).toBe(72);
    const slugs = LEADERBOARD_PORTRAITS.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("maps the same name to the same face", () => {
    expect(portraitIndexForName("Cristian")).toBe(portraitIndexForName("  cristian "));
    expect(portraitForName("Cristian").id).toBe(portraitIndexForName("Cristian"));
    expect(portraitForName("Ada").id).not.toBe(portraitForName("Bob").id);
  });

  test("uses the active seed rotation prefix", () => {
    expect(LEADERBOARD_PORTRAIT_SEED_PREFIX).toBe("portrait-v4:");
  });

  test("covers goblins, orcs, mages and low-fi archetype nods", () => {
    const slugs = new Set(LEADERBOARD_PORTRAITS.map((entry) => entry.slug));
    for (const slug of [
      "goblin-scout",
      "orc-bruiser",
      "fire-mage",
      "ice-mage",
      "ring-courier",
      "white-staff-elder",
      "iron-helm-lord",
      "red-capped-goblin",
    ]) {
      expect(slugs.has(slug)).toBe(true);
    }
  });

  test("uses podium frames for top three and wood for the rest", () => {
    expect(frameKindForRank(1)).toBe("gold");
    expect(frameKindForRank(2)).toBe("silver");
    expect(frameKindForRank(3)).toBe("bronze");
    expect(frameKindForRank(4)).toBe("wood");
    expect(frameKindForRank(12)).toBe("wood");
    expect(frameForRank(1).src).toContain("frame-gold.png");
    expect(frameForRank(8).src).toContain("frame-wood.png");
  });

  test("ships portrait and frame assets", () => {
    for (const entry of LEADERBOARD_PORTRAITS) {
      expect(existsSync(join(portraitRoot, `${entry.slug}.png`))).toBe(true);
    }
    for (const kind of ["wood", "gold", "silver", "bronze"] as const) {
      expect(existsSync(join(portraitRoot, "frames", `frame-${kind}.png`))).toBe(true);
    }
  });
});
