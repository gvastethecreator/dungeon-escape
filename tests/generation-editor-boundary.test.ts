import { describe, expect, test } from "bun:test";

describe("generation and editor boundary", () => {
  test("keeps editor work out of dungeon activation and floor rebinding", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const activate = main.slice(
      main.indexOf("async function activateDungeon("),
      main.indexOf("async function buildDungeon("),
    );
    const build = main.slice(
      main.indexOf("async function buildDungeon("),
      main.indexOf("function setEditorSurface("),
    );
    const floorRebind = main.slice(
      main.indexOf("const nextIndex = activeFloorFromSupportY"),
      main.indexOf("const simulationActive ="),
    );

    expect(main).not.toContain('from "./editor/DungeonEditorView"');
    expect(main).toContain('from "./editor/LazyDungeonEditorView"');
    expect(activate).not.toContain("editorView");
    expect(build).toContain("generateDungeonBuild");
    expect(build).not.toContain("readEditorParams");
    expect(floorRebind).not.toContain("readEditorParams");
    expect(main).not.toContain("function readEditorParams");
    expect(main).toContain("loadEditor: false");
  });
});
