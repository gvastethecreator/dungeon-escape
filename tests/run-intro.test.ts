import { describe, expect, test } from "bun:test";

describe("new-game map theater intro", () => {
  test("host markup includes fade and intro status surfaces", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="scene-fade"');
    expect(host).toContain('id="run-intro-status"');
    expect(host).toContain('class="scene-fade"');
  });

  test("startPlayWithSeed overlaps play build with map theater for a short handoff", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(source).toContain("async function startPlayWithSeed");
    expect(source).toContain("setRunIntroActive(true");
    expect(source).toContain("postForgePresentation");
    expect(source).toContain("black-flag:forge-anim-complete");
    expect(source).toContain("waitForForgeAnimComplete");
    expect(source).toContain('setSceneFadeOpaque(true, { instant: true })');
    expect(source).toContain("buildPlayWorldForIntro");
    expect(source).toContain("Promise.all([mapDone, worldDone])");
    expect(source).toContain("SCENE_FADE_OUT_MS");
    expect(source).toContain("SCENE_FADE_IN_MS");
    expect(source).toContain("forgeFrameSrc(runIntroActive)");
    expect(source).toContain("readSkipRunIntroFromUrl");
    expect(source).toContain("ensureForgeFrameLoaded(8_000, { presentation: true })");

    const blackFirstAt = source.indexOf('setSceneFadeOpaque(true, { instant: true })');
    const introActiveAt = source.indexOf("setRunIntroActive(true", blackFirstAt);
    const parallelAt = source.indexOf("Promise.all([mapDone, worldDone])", introActiveAt);
    const blackAgainAt = source.indexOf("setSceneFadeOpaque(true", parallelAt);
    expect(blackFirstAt).toBeGreaterThan(-1);
    expect(introActiveAt).toBeGreaterThan(blackFirstAt);
    expect(parallelAt).toBeGreaterThan(introActiveAt);
    expect(blackAgainAt).toBeGreaterThan(parallelAt);
  });

  test("copy exposes forging and entering status lines", async () => {
    const copy = await Bun.file(new URL("../src/ui/copy.ts", import.meta.url)).text();
    expect(copy).toContain("forgingMap:");
    expect(copy).toContain("enteringDungeon:");
  });

  test("Forge publishes anim complete, centers presentation, and hides chrome", async () => {
    const forge = await Bun.file(new URL("../src/forge/main.js", import.meta.url)).text();
    const styles = await Bun.file(new URL("../src/forge/styles.css", import.meta.url)).text();
    const forgeHost = await Bun.file(new URL("../forge.html", import.meta.url)).text();
    expect(forge).toContain("black-flag:forge-anim-complete");
    expect(forge).toContain("black-flag:forge-presentation");
    expect(forge).toContain("setPresentationMode");
    expect(forge).toContain("publishAnimComplete");
    expect(forge).toContain("forceThemeKey");
    expect(forge).toContain("event.data.themeKey");
    expect(forge).toContain("if (presentationMode) return");
    expect(forge).toContain("if (!presentationMode && innerWidth > 700)");
    expect(forge).toContain("fitCameraToDungeon(D.W, D.H)");
    expect(styles).toContain('html[data-forge-presentation="true"]');
    expect(forgeHost).toContain("presentation=1");
    expect(forgeHost).toContain("dataset.forgePresentation");
  });

  test("host sends the campaign biome theme into map theater", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const profiles = await Bun.file(
      new URL("../src/forge/ForgeThemeProfiles.js", import.meta.url),
    ).text();
    expect(source).toContain("resolveIntroThemeKey");
    expect(source).toContain("themeKey: introThemeKey");
    expect(source).toContain("forcedPlayMoodId");
    expect(profiles).toContain("ash: {");
    expect(profiles).toContain("iron: {");
    expect(profiles).toContain('label: "ASH"');
    expect(profiles).toContain('label: "IRON"');
  });

  test("shell CSS keeps generation screen map-only over full black", async () => {
    const editorCss = await Bun.file(new URL("../src/styles/editor.css", import.meta.url)).text();
    const shellCss = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    expect(editorCss).toContain('.app-shell[data-run-intro="true"] .editor-workspace');
    expect(editorCss).toContain('.app-shell[data-run-intro="true"] .editor-toolbar');
    expect(editorCss).toContain("display: none !important");
    expect(shellCss).toContain(".scene-fade");
    expect(shellCss).toContain(".scene-fade.is-opaque");
    expect(shellCss).toContain(".scene-fade.is-instant");
    expect(shellCss).toContain(
      '.app-shell[data-run-intro="true"] > *:not(#editor-workspace):not(#scene-fade):not(#run-intro-status)',
    );
    expect(shellCss).toContain("clip: rect(0, 0, 0, 0)");
  });
});
