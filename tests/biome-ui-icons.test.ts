import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { listBiomeIds } from "../src/systems/BiomeIdentity";
import { biomeHoverColor, biomeIconSrc, expandBiomeStars } from "../src/systems/BiomeUi";

const iconRoot = join(import.meta.dir, "../public/assets/ui/biome-icons");

describe("biome picker icons", () => {
  test("ships a transparent icon for every biome identity", () => {
    for (const id of listBiomeIds()) {
      expect(existsSync(join(iconRoot, `${id}.png`))).toBe(true);
      expect(biomeIconSrc(id)).toBe(`/assets/ui/biome-icons/${id}.png`);
      expect(biomeHoverColor(id).startsWith("#")).toBe(true);
    }
  });

  test("ships black and transparent spritesheets", () => {
    expect(existsSync(join(iconRoot, "biome-icons-sheet-black.png"))).toBe(true);
    expect(existsSync(join(iconRoot, "biome-icons-sheet.png"))).toBe(true);
    expect(existsSync(join(iconRoot, "manifest.json"))).toBe(true);
  });

  test("picker render wires icon and hover color", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(source).toContain("biomeIconSrc(");
    expect(source).toContain("biomeHoverColor(");
    expect(source).toContain("biome-picker-option__icon");
    expect(source).toContain("--biome-hover");
  });

  test("expands biome star counts into a colored row", () => {
    const stars = expandBiomeStars({ Molten: 2, Frost: 1, Ancient: 1 });
    expect(stars).toHaveLength(4);
    expect(stars.map((star) => star.label)).toEqual(["Ancient", "Molten", "Molten", "Frost"]);
    expect(new Set(stars.map((star) => star.color)).size).toBe(3);
    expect(stars[1]?.color).toBe(biomeHoverColor("molten"));
    expect(stars[2]?.color).toBe(biomeHoverColor("molten"));
    expect(stars[3]?.color).toBe(biomeHoverColor("frost"));
  });
});
