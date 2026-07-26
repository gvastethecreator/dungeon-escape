import { describe, expect, test } from "bun:test";

describe("Dungeon gothic typography", () => {
  test("loads both requested Jacquard Google Fonts on host and Creation", async () => {
    for (const path of ["../index.html", "../forge.html"]) {
      const html = await Bun.file(new URL(path, import.meta.url)).text();
      expect(html).toContain("family=Jacquard+12");
      expect(html).toContain("family=Jacquard+24");
      expect(html).not.toContain("UnifrakturMaguntia");
    }
  });

  test("gothic display text uses title case and compact labels use small caps", async () => {
    const styles = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    expect(styles).toContain('--font-gothic: "Jacquard 24"');
    expect(styles).toContain('--font-gothic-compact: "Jacquard 12"');
    expect(styles).toContain("font-variant-caps: small-caps");
    expect(styles).toContain("text-transform: capitalize");
  });
});
