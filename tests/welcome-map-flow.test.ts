import { describe, expect, test } from "bun:test";

describe("welcome and map flow", () => {
  test("loads with New Game, Continue, and Custom Run, without the redundant Enter button", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="welcome-screen"');
    expect(host).toContain('id="welcome-new"');
    expect(host).toContain('id="welcome-continue"');
    expect(host).toContain('id="welcome-custom"');
    expect(host).toContain("CUSTOM RUN");
    expect(host).toContain('class="welcome-art"');
    expect(host).toContain("/assets/ui/dungeon-cover-v1.webp");
    expect(host).toContain("Dungeon Escape");
    expect(host).not.toContain("Iron Ash");
    expect(host).not.toContain('id="pointer-lock"');
  });

  test("uses a full-frame generated cover without baking menu copy into the image", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    const art = Bun.file(new URL("../public/assets/ui/dungeon-cover-v1.webp", import.meta.url));
    expect(css).toMatch(/\.welcome-art\s*\{[\s\S]*object-fit:\s*cover/);
    expect(css).toContain(".welcome-screen::before");
    expect(css).toContain(".welcome-actions__span");
    expect(await art.exists()).toBe(true);
    expect(art.size).toBeLessThan(400_000);
  });

  test("routes New Game to play, Custom Run to Creation, and Continue to play", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(source).toMatch(
      /welcomeNew[\s\S]*freshSeed = makeSeed\(\)[\s\S]*buildDungeon\(freshSeed\)[\s\S]*setEngineMode\("play"/,
    );
    expect(source).toMatch(
      /welcomeCustom[\s\S]*setEngineMode\("editor"[\s\S]*setEditorSurface\("forge"\)/,
    );
    expect(source).toMatch(/welcomeContinue[\s\S]*setEngineMode\("play"/);
  });

  test("M uses the large map state and keeps the compact map available", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    expect(source).toContain('event.code === "KeyM"');
    expect(source).toContain('classList.toggle("is-expanded", mapExpanded)');
    expect(css).toContain(".map-panel.is-expanded");
    expect(css).not.toContain(".map-panel.is-collapsed");
  });
});
