import { describe, expect, test } from "bun:test";

describe("map load cover and yields", () => {
  test("host yields under a visible cover instead of blocking the tab", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const world = await Bun.file(new URL("../src/world/DungeonWorld.ts", import.meta.url)).text();
    const scene = await Bun.file(
      new URL("../src/world/StaticDungeonScene.ts", import.meta.url),
    ).text();

    expect(main).toContain("function isMapLoadCovered");
    expect(main).toContain("function yieldToEventLoop");
    expect(main).toContain("generateDungeonBuildWithYield");
    expect(main).toContain("if (isMapLoadCovered()) await yieldMapLoadFrame()");
    expect(main).toContain("COPY.status.preparingDungeon");
    expect(world).toContain("finishDungeonPopulationWithYield");
    expect(world).toContain("this.buildResidentEnemyRuntime(floor)");
    expect(scene).toMatch(/yield;\s*this\.addArchitecture/);
  });

  test("welcome busy and scene loader share Please wait copy", async () => {
    const copy = await Bun.file(new URL("../src/ui/copy.ts", import.meta.url)).text();
    const html = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();

    expect(copy).toContain('pleaseWait: "Please wait"');
    expect(copy).toContain('preparingDungeon: "Preparing the dungeon…"');
    expect(html).toContain("Please wait");
    expect(html).toContain("Preparing the dungeon…");
    expect(css).toContain(".scene-loader__kicker");
    expect(css).toContain('.welcome-screen[aria-busy="true"]');
  });
});
