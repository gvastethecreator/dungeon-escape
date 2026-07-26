import { describe, expect, test } from "bun:test";

describe("Dungeon Creation interface", () => {
  test("uses one product name across the host and embedded editor", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const creation = await Bun.file(new URL("../forge.html", import.meta.url)).text();
    expect(host).toContain("DUNGEON CREATION");
    expect(host).toContain('id="forge-apply"');
    expect(host).toContain("forge-play-btn");
    expect(host).toMatch(/forge-play-btn__label">\s*Play\s*</);
    expect(creation).toContain("DUNGEON&nbsp;CREATION");
    expect(creation).toContain("FORGE&nbsp;DUNGEON");
    expect(`${host}\n${creation}`).not.toContain("CARGAR EN PLAY");
    expect(`${host}\n${creation}`).not.toContain("GENERAR&nbsp;DUNGEON");
  });
});
