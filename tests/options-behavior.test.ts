import { describe, expect, test } from "bun:test";

describe("pause options behavior", () => {
  test("exposes persistent volume and texture controls", async () => {
    const [html, main, styles] = await Promise.all([
      Bun.file(new URL("../index.html", import.meta.url)).text(),
      Bun.file(new URL("../src/main.ts", import.meta.url)).text(),
      Bun.file(new URL("../src/styles.css", import.meta.url)).text(),
    ]);
    expect(html).toContain('id="music-volume"');
    expect(html).toContain('id="effects-volume"');
    expect(html).toContain('id="texture-smoothing-toggle"');
    expect(html).toContain('id="display-post-fx-lab"');
    expect(html).toContain('id="display-post-fx-layer"');
    expect(html).toContain('id="display-post-fx-launch"');
    expect(html).toContain('data-display-tuning="halation"');
    expect(html).toContain('data-display-tuning="phosphorMask"');
    expect(html).not.toContain('id="palette-effect"');
    expect(html).not.toContain('id="palette-dither"');
    expect(html).not.toContain('data-display-tuning="paletteBlend"');
    expect(html).not.toContain('data-display-tuning="paletteDitherScale"');
    expect(html).toContain('id="display-post-fx-copy"');
    expect(html).toContain('id="display-post-fx-reset"');
    expect(main).toContain("audio.setMusicVolume(userSettings.musicVolume)");
    expect(main).toContain("audio.setEffectsVolume(userSettings.effectsVolume)");
    expect(main).toContain("textureRegistry.setSmoothing(textureSmoothing)");
    expect(main).toContain("textureRegistry.diagnostics().registered");
    expect(main).not.toContain("setPaletteEffect(");
    expect(main).not.toContain("paletteDitherStrength");
    expect(main).not.toContain("palettePostEffectProfile");
    expect(main).toContain("povPost.setDisplayTuning(displayPostFxTuning)");
    expect(main).toContain("elements.displayPostFxLayer.append(elements.displayPostFxLab)");
    expect(main).toContain("elements.shell.dataset.displayLabOpen = String(nextOpen)");
    expect(main).toContain('elements.displayPostFxLaunch.addEventListener("click"');
    expect(styles).toContain('[data-display-lab-open="true"]');
    expect(styles).toContain(".display-post-fx-lab:not([open]) > summary");
    expect(main).toContain("if (!localDevTools) return;");
    expect(main).toContain("writeDisplayPostFxTuning(displayPostFxTuning)");
    expect(main).not.toContain("applyTextureSmoothing(");
    expect(main.indexOf("readUserSettings()")).toBeLessThan(
      main.indexOf("new SceneTextureRegistry("),
    );
    expect(main.indexOf("new SceneTextureRegistry(")).toBeLessThan(
      main.indexOf("new DungeonWorld("),
    );
  });

  test("handles Escape before editable controls can consume the pause shortcut", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const handler = main.slice(
      main.indexOf('document.addEventListener("keydown", (event) => {'),
      main.indexOf(
        "elements.touchButtons.forEach",
        main.indexOf('document.addEventListener("keydown"'),
      ),
    );
    expect(
      handler.indexOf('event.key === "Escape" || event.code === "Escape"'),
    ).toBeGreaterThanOrEqual(0);
    expect(handler.indexOf('event.key === "Escape" || event.code === "Escape"')).toBeLessThan(
      handler.indexOf('event.target.closest("input, textarea, select")'),
    );
    expect(handler).toContain("if (optionsOpen) {");
    expect(handler).toContain('dataset.pausePane === "settings"');
    expect(handler).toContain('setPausePane("menu")');
    expect(handler).toContain("if (elements.displayPostFxLab.open) {");
    expect(handler).toContain("setDisplayPostFxLabOpen(false);");
    expect(handler).toContain("resumePlay();");
    expect(handler).not.toContain("if (controller.getState().locked) return;");
    expect(handler).toContain('setOptionsOpen(true, "escape");');
  });

  test("Escape resume does not reopen pause when pointer lock is refused", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("suppressPauseOnPointerUnlock");
    expect(main).toContain("suppressPauseOnPointerUnlock = true");
    expect(main).toContain("!suppressPauseOnPointerUnlock");
    expect(main).toContain("COPY.status.pointerFailed");
    expect(main).toContain('setOptionsOpen(true, "pointer-unlock")');
    expect(main).toContain("optionsOpenByPointerUnlock");
    // Intentional resume must not treat a failed re-lock as a fresh pause open.
    const onLock = main.slice(
      main.indexOf("onLockChange(locked, message)"),
      main.indexOf("const editorView = new LazyDungeonEditorView"),
    );
    expect(onLock).toContain("!suppressPauseOnPointerUnlock");
    expect(onLock).toContain("setStatus(COPY.status.pointerFailed)");
  });

  test("re-arms gameplay input before pause and CRT Lab request pointer lock", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const options = main.slice(
      main.indexOf("function setOptionsOpen("),
      main.indexOf("function setDisplayPostFxLabOpen("),
    );
    const lab = main.slice(
      main.indexOf("function setDisplayPostFxLabOpen("),
      main.indexOf("function clearTouchSession("),
    );
    const resume = main.slice(
      main.indexOf("function resumePlay("),
      main.indexOf("let mapRebuildPending"),
    );

    expect(options).toContain("controller.setEnabled(false);");
    expect(options.indexOf("controller.setEnabled(canEnablePlayController());")).toBeGreaterThan(
      options.indexOf("} else {"),
    );
    expect(lab.indexOf("controller.setEnabled(canEnablePlayController());")).toBeLessThan(
      lab.indexOf("controller.requestPointerLock();"),
    );
    expect(resume.indexOf("setOptionsOpen(false);")).toBeLessThan(
      resume.indexOf("controller.requestPointerLock();"),
    );
  });

  test("auto-saves a completed campaign with the persisted player identity", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("queueMicrotask(() => void submitPreparedLeaderboardEntry())");
    expect(main).toContain("const hasSavedIdentity = playerProfile !== null");
    expect(main).toContain("elements.leaderboardName.disabled = hasSavedIdentity");
    expect(main).toContain('elements.leaderboardSubmit.textContent = "Retry save"');
  });
});
