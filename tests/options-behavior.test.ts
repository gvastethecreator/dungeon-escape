import { describe, expect, test } from "bun:test";

describe("pause options behavior", () => {
  test("exposes persistent volume and texture controls", async () => {
    const html = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(html).toContain('id="music-volume"');
    expect(html).toContain('id="effects-volume"');
    expect(html).toContain('id="texture-smoothing-toggle"');
    expect(main).toContain("audio.setMusicVolume(userSettings.musicVolume)");
    expect(main).toContain("audio.setEffectsVolume(userSettings.effectsVolume)");
    expect(main).toContain("textureRegistry.setSmoothing(textureSmoothing)");
    expect(main).toContain("textureRegistry.diagnostics().registered");
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
    expect(handler.indexOf('event.code === "Escape"')).toBeGreaterThanOrEqual(0);
    expect(handler.indexOf('event.code === "Escape"')).toBeLessThan(
      handler.indexOf('event.target.closest("input, textarea, select")'),
    );
    expect(handler).toContain("if (optionsOpen) {");
    expect(handler).toContain("resumePlay();");
  });

  test("Escape resume does not reopen pause when pointer lock is refused", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("suppressPauseOnPointerUnlock");
    expect(main).toContain("suppressPauseOnPointerUnlock = true");
    expect(main).toContain("!suppressPauseOnPointerUnlock");
    expect(main).toContain("COPY.status.pointerFailed");
    // Intentional resume must not treat a failed re-lock as a fresh pause open.
    const onLock = main.slice(
      main.indexOf("onLockChange(locked, message)"),
      main.indexOf("const editorView = new DungeonEditorView"),
    );
    expect(onLock).toContain("!suppressPauseOnPointerUnlock");
    expect(onLock).toContain("setStatus(COPY.status.pointerFailed)");
  });

  test("auto-saves a completed campaign with the persisted player identity", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("queueMicrotask(() => void submitPreparedLeaderboardEntry())");
    expect(main).toContain("const hasSavedIdentity = playerProfile !== null");
    expect(main).toContain("elements.leaderboardName.disabled = hasSavedIdentity");
    expect(main).toContain('elements.leaderboardSubmit.textContent = "Retry save"');
  });
});
