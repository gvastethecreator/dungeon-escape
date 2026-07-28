import { describe, expect, test } from "bun:test";

describe("welcome and map flow", () => {
  test("loads with New Game, Continue, and Custom Run, without the redundant Enter button", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="welcome-screen"');
    expect(host).toContain('id="welcome-new"');
    expect(host).toContain('id="welcome-continue"');
    expect(host).toContain('id="welcome-custom"');
    expect(host).toContain("CUSTOM RUN");
    expect(host).toContain('id="welcome-biome-picker"');
    expect(host).toContain('id="biome-picker-grid"');
    expect(host).toContain("Choose biome");
    expect(host).toContain('id="boot-screen"');
    expect(host).toContain('class="is-booting"');
    expect(host).toContain('class="welcome-art"');
    expect(host).toContain("/assets/ui/biome-screens/ancient-main.webp");
    expect(host).toContain('data-biome-id="ancient"');
    expect(host).toContain("Dungeon Escape");
    expect(host).not.toContain("Iron Ash");
    expect(host).not.toContain('id="pointer-lock"');
  });

  test("boot screen covers the shell until main dismisses it", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(host).toContain('id="boot-fill"');
    expect(host).toContain('id="boot-status"');
    expect(css).toContain("body.is-booting");
    expect(css).toContain(".boot-screen");
    expect(main).toContain("dismissBootScreen");
    expect(main).toContain("waitForRendererWarmup");
    expect(main).toContain("setBootProgress");
  });

  test("uses a full-frame biome cover without baking menu copy into the image", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    const art = Bun.file(
      new URL("../public/assets/ui/biome-screens/ancient-main.webp", import.meta.url),
    );
    expect(css).toMatch(/\.welcome-art\s*\{[\s\S]*object-fit:\s*cover/);
    expect(css).toContain(".welcome-screen::before");
    expect(css).toContain(".welcome-menu");
    expect(css).toContain(".welcome-menu__item--primary");
    expect(css).toContain(".biome-picker-option__icon");
    expect(css).toContain("--biome-hover");
    expect(await art.exists()).toBe(true);
    expect(art.size).toBeLessThan(400_000);
  });

  test("routes New Game to biome pick, Custom Run to Creation, and Continue to play", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(source).toContain("showBiomePicker()");
    expect(source).toContain("startNewGameWithBiome(");
    expect(source).toContain("forcedPlayMoodId");
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
