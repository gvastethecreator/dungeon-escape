import { describe, expect, test } from "bun:test";

describe("new-game map theater intro", () => {
  test("host markup includes fade and intro status surfaces", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="scene-fade"');
    expect(host).toContain('id="run-intro-status"');
    expect(host).toContain('class="scene-fade"');
  });

  test("main delegates New Game and Hall seeds to the run intro director", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const forge = await Bun.file(new URL("../src/forge/main.js", import.meta.url)).text();
    const director = await Bun.file(
      new URL("../src/game/RunIntroDirector.ts", import.meta.url),
    ).text();
    expect(source).toContain("const runIntroDirector = new RunIntroDirector");
    expect(source).toContain("return runIntroDirector.start");
    expect(source).toContain('startPlayWithSeed(entry.seed, { runSource: "campaign" })');
    expect(source).not.toContain("runIntroToken");
    expect(source).not.toContain("buildPlayWorldForIntro");
    expect(director).toContain("exportPlayDungeonToForgePresentation");
    expect(director).toContain("startPresentation");
    expect(source).toContain("generateCompletableDungeon");
    expect(forge).toContain("black-flag:forge-presentation");
    expect(forge).toContain("hostDungeon");
    expect(forge).toContain("buildScene(hostDungeon)");
    expect(forge).toContain("resolveForgeRoomPresentationRect");
    expect(forge).toContain("dataset.forgeRoomGeometry");
    expect(forge).toContain("editorDungeonBeforePresentation");
    expect(forge).toContain("restoreEditorDungeonAfterPresentation");

    const presentationHandlerAt = forge.indexOf(
      'event.data?.type === "black-flag:forge-presentation"',
    );
    const preserveEditorAt = forge.indexOf(
      "if (!editorDungeonBeforePresentation && D) editorDungeonBeforePresentation = D",
      presentationHandlerAt,
    );
    const inspectHostDungeonAt = forge.indexOf(
      "const hostDungeon = event.data.dungeon",
      presentationHandlerAt,
    );
    expect(presentationHandlerAt).toBeGreaterThan(-1);
    expect(preserveEditorAt).toBeGreaterThan(presentationHandlerAt);
    expect(inspectHostDungeonAt).toBeGreaterThan(preserveEditorAt);

    expect(director).toContain('"forge-fallback"');
    expect(director).toContain("restorePlayInputAndFocus");
  });

  test("copy exposes forging and entering status lines", async () => {
    const copy = await Bun.file(new URL("../src/ui/copy.ts", import.meta.url)).text();
    expect(copy).toContain("forgingMap:");
    expect(copy).toContain("enteringDungeon:");
  });

  test("shell CSS keeps generation screen map-only over full black", async () => {
    const editorCss = await Bun.file(new URL("../src/styles/editor.css", import.meta.url)).text();
    const shellCss = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    expect(editorCss).toContain('.app-shell[data-run-intro="true"] .editor-workspace');
    expect(editorCss).toContain('.app-shell[data-run-intro="true"] .editor-toolbar');
    expect(editorCss).toContain("display: none !important");
    expect(editorCss).toContain('.app-shell[data-run-intro="true"] #editor-forge-surface');
    expect(shellCss).toContain(".scene-fade");
    expect(shellCss).toContain(".scene-fade.is-opaque");
    expect(shellCss).toMatch(
      /\.app-shell\[data-run-intro="true"\]\s*>\s*\*:not\(#editor-workspace\):not\(#scene-fade\):not\(#run-intro-status\)/,
    );
  });
});
