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

  test("gothic display text keeps curated mixed case without forced caps", async () => {
    const styles = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    const editorStyles = await Bun.file(
      new URL("../src/styles/editor.css", import.meta.url),
    ).text();
    const forgeStyles = await Bun.file(new URL("../src/forge/styles.css", import.meta.url)).text();
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const shell = await Bun.file(new URL("../src/shell.ts", import.meta.url)).text();

    expect(styles).toContain('--font-gothic: "Jacquard 24"');
    expect(styles).toContain('--font-gothic-compact: "Jacquard 12"');
    for (const css of [styles, editorStyles, forgeStyles]) {
      const gothicBlocks = css.match(
        /[^{}]+\{[^{}]*font-family:\s*var\(--(?:font-gothic(?:-compact)?|serif)\);[^{}]*\}/g,
      );
      expect(gothicBlocks?.length).toBeGreaterThan(0);
      for (const block of gothicBlocks ?? []) {
        expect(block).not.toMatch(/text-transform:\s*uppercase/);
        expect(block).not.toMatch(/font-variant-caps:\s*small-caps/);
      }
    }
    expect(host).toContain('id="welcome-save-title"></strong>');
    expect(host).not.toContain("No active descent");
    expect(main).toContain("elements.welcomeSave.hidden = state === null");
    // Continue title is the biome in pixel font (not a gothic fantasy name).
    expect(main).toContain("continueDungeonLabel");
    expect(main).toContain("getBiomeIdentity");
    expect(shell).toContain("getBiomeIdentity");
    expect(styles).toMatch(/\.welcome-save\s*>\s*strong[\s\S]*font-family:\s*var\(--font-pixel\)/);
  });
});
