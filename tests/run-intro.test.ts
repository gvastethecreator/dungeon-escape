import { describe, expect, test } from "bun:test";

describe("new-game map theater intro", () => {
  test("host markup includes fade and intro status surfaces", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="scene-fade"');
    expect(host).toContain('id="run-intro-status"');
    expect(host).toContain('class="scene-fade"');
  });

  test("startPlayWithSeed ships the real play dungeon into isometric Forge theater", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const forge = await Bun.file(new URL("../src/forge/main.js", import.meta.url)).text();
    expect(source).toContain("async function startPlayWithSeed");
    expect(source).toContain("setRunIntroActive(true");
    expect(source).toContain("setSceneFadeOpaque(true, { instant: true })");
    expect(source).toContain("buildPlayWorldForIntro");
    expect(source).toContain('setEditorSurface("forge")');
    expect(source).toContain("exportPlayDungeonToForgePresentation");
    expect(source).toContain("forgeFrameClient.startPresentation");
    expect(source).toContain("presentationSession?.stop()");
    expect(source).toContain("dungeon: presentationDungeon");
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

    const blackFirstAt = source.indexOf("setSceneFadeOpaque(true, { instant: true })");
    const introActiveAt = source.indexOf("setRunIntroActive(true", blackFirstAt);
    const buildAt = source.indexOf("buildPlayWorldForIntro(normalizedSeed, token)", introActiveAt);
    const presentAt = source.indexOf("exportPlayDungeonToForgePresentation", buildAt);
    const startPresentationAt = source.indexOf("forgeFrameClient.startPresentation", presentAt);
    const revealAt = source.indexOf("setSceneFadeOpaque(false", presentAt);
    expect(blackFirstAt).toBeGreaterThan(-1);
    expect(introActiveAt).toBeGreaterThan(blackFirstAt);
    expect(buildAt).toBeGreaterThan(introActiveAt);
    expect(presentAt).toBeGreaterThan(buildAt);
    expect(startPresentationAt).toBeGreaterThan(presentAt);
    expect(revealAt).toBeGreaterThan(startPresentationAt);
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
