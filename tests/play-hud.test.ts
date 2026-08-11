import { describe, expect, test } from "bun:test";

describe("Play HUD structure (Ash Binding)", () => {
  test("keeps health left, timer top-center, and stones bottom-right", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="play-objective"');
    expect(host).toContain('class="health-orb"');
    expect(host).toContain('id="resolve-fill"');
    expect(host).toContain('id="stamina-meter"');
    expect(host).toContain('id="stamina-fill"');
    expect(host).toContain("stamina-meter__track");
    expect(host).not.toContain("stamina-meter__label");
    expect(host).not.toContain(">STAMINA</span>");
    expect(host).toContain("health-orb__liquid");
    expect(host).toContain("health-orb__mount");
    expect(host).toContain("health-orb__meniscus");
    expect(host).toContain("health-orb__specular");
    expect(host).toContain("health-orb__splatter");
    expect(host).toContain('class="stone-sockets"');
    expect(host).toContain('class="play-progress"');
    expect(host).toContain('id="run-timer"');
    // Timer is a direct play-hud child so absolute top-center is viewport-relative.
    const timerIndex = host.indexOf('id="run-timer"');
    const progressIndex = host.indexOf('class="play-progress"');
    expect(timerIndex).toBeGreaterThanOrEqual(0);
    expect(progressIndex).toBeGreaterThan(timerIndex);
    expect(host).toContain('id="time-freeze-status"');
    expect(host).toContain('id="time-freeze-value"');
    expect(host).toContain('id="luminous-ward-status"');
    expect(host).toContain('id="luminous-ward-value"');
    expect(host).toContain('id="annihilation-pulse-status"');
    expect(host).toContain('id="annihilation-pulse-value"');
    expect(host).toContain('id="mobility-status"');
    expect(host).toContain('id="mobility-value"');
    expect(host).toContain("/assets/ui/pickup-icons/mobility.webp");
    expect(host).toContain("/assets/ui/stone-icons/ember.webp");
    expect(host).toContain('id="slow-curse-status"');
    expect(host).toContain('id="frenzy-curse-status"');
    expect(host).toContain('id="gloom-curse-status"');
    expect(host).toContain('id="swarm-curse-status"');
    expect(host).toContain('id="hazard-status"');
    expect(host).toContain('id="hazard-overlay"');
    expect(host).toContain('datetime="PT0S"');
    expect(host).toContain("stone-socket__empty");
    expect(host).toContain("stone-socket__gem");
    expect(host).toContain('data-stone="ember"');
    expect(host).toContain('data-stone="ash"');
    expect(host).toContain('data-stone="crypt"');
    expect(host).toContain('data-stone="verdant"');
    expect(host).not.toContain('class="map-head"');
    expect(host).toContain('id="map-toggle"');
    expect(host).toContain('aria-label="Expand map"');
    expect(host).not.toContain('id="pointer-lock"');
    expect(host).toContain("MAP TOOLS");
    expect(host).toContain('data-local-dev-only="true"');
    expect(host).toContain("SERVER RUNS");
    expect(host).toContain("PUSH TO SERVER");
    expect(host).toContain("CREATION");
    expect(host).not.toContain("RUN AUTHORITY");
    expect(host).not.toContain("PUSH BACKEND");
    expect(host).not.toContain('class="resolve-track"');
    expect(host).not.toContain("map-toggle-sr");
    expect(host).not.toContain("Kredit");
  });

  test("exposes named difficulty instead of raw enemy density", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(host).toContain("<span>DIFFICULTY</span>");
    expect(host).toContain('aria-valuetext="Standard"');
    expect(host).toContain(">STANDARD</output>");
    expect(source).toContain("syncDifficultyLabel()");
    expect(source).toContain("difficulty: { ...world.getDifficultyState() }");
  });

  test("copy exposes intro objective and map toggle labels", async () => {
    const { COPY } = await import("../src/ui/copy");
    expect(COPY.objective.intro).toBe("Find the four magic stones");
    expect(COPY.hud.mapExpand).toBe("EXPAND");
    expect(COPY.hud.mapShrink).toBe("SHRINK");
    expect(COPY.pickup.itemFound).toBe("ITEM FOUND");
    expect(COPY.pickup.curseFound).toBe("CURSE FOUND");
    expect(COPY.pickup.flask).toBe("Health Restored");
    expect(COPY.pickup.timeFreeze).toBe("Time Freeze");
    expect(COPY.status.timeFreeze).toContain("10 seconds");
    expect(COPY.pickup.luminousWard).toBe("Ward Stone");
    expect(COPY.status.luminousWard).toContain("15 seconds");
    expect(COPY.pickup.annihilationPulse).toBe("Pulse Relic");
    expect(COPY.status.annihilationPulse).toContain("13 seconds");
    expect(COPY.end.loseTitle).toBe("You Died");
    expect(COPY.end.winTitle).toBe("You escaped the dungeon");
    expect(COPY.status.won).toBe("You escaped the dungeon");
    expect(COPY.end.winLead).toBe("All four stones are bound. The exit is open.");
    expect(COPY.end.retry).toBe("Try again");
    expect(COPY.end.newDungeon).toBe("New dungeon");
    expect(COPY.hud.musicOn).toBe("ON");
    expect(COPY.hud.musicOff).toBe("OFF");
    expect(COPY.hud.audioOn).toBe("ON");
    expect(COPY.hud.crtOn).toBe("ON");
  });

  test("death offers the same layout and a new dungeon as separate actions", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(host).toContain('id="retry"');
    expect(host).toContain('id="new-dungeon"');
    expect(host).toContain('id="end-next-biome"');
    expect(host).toContain('role="dialog"');
    expect(host).toContain('aria-modal="true"');
    expect(source).toMatch(/audio\.play\("lose"\);[\s\S]*hideEndNextBiome\(\)/);
    expect(css).toMatch(/\.end-overlay\[data-end="dead"\]\s*\{[\s\S]*background:\s*#000;/);
    expect(css).toMatch(/\.end-overlay\[data-end="dead"\]\s+\.end-card h1/);
    expect(css).toContain("color: #e63838");
    expect(css).toContain("font-size: clamp(76px, 16vw, 196px)");
  });

  test("uses local Mek typefaces for project chrome and titles", async () => {
    const [html, css, editor, mekSans, mekzantine] = await Promise.all([
      Bun.file(new URL("../index.html", import.meta.url)).text(),
      Bun.file(new URL("../src/styles.css", import.meta.url)).text(),
      Bun.file(new URL("../src/editor/DungeonEditorView.ts", import.meta.url)).text(),
      Bun.file(new URL("../public/assets/fonts/mek-sans-regular.woff2", import.meta.url)),
      Bun.file(new URL("../public/assets/fonts/mekzantine-regular.woff2", import.meta.url)),
    ]);
    expect(html).not.toContain("fonts.googleapis.com");
    expect(css).toContain('font-family: "Mek Sans"');
    expect(css).toContain('font-family: "Mekzantine"');
    expect(css).toContain("/assets/fonts/mek-sans-regular.woff2");
    expect(css).toContain("/assets/fonts/mekzantine-regular.woff2");
    expect(editor).not.toContain("Pixelify Sans");
    expect(editor).toContain('"Mek Sans"');
    expect(await mekSans.exists()).toBe(true);
    expect(await mekzantine.exists()).toBe(true);
    expect(mekSans.size).toBeGreaterThan(10_000);
    expect(mekzantine.size).toBeGreaterThan(10_000);
  });

  test("victory has generated art and real run result fields", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    const art = Bun.file(
      new URL("../public/assets/ui/biome-screens/ancient-ending.webp", import.meta.url),
    );
    expect(host).toContain("/assets/ui/biome-screens/ancient-ending.webp");
    expect(host).toContain('data-biome-id="ancient"');
    expect(host).toContain('class="end-stage"');
    expect(host.indexOf('class="end-stage"')).toBeLessThan(host.indexOf('class="end-art"'));
    expect(host.indexOf('class="end-art"')).toBeLessThan(host.indexOf('id="end-particles"'));
    expect(await art.exists()).toBe(true);
    expect(art.size).toBeLessThan(400_000);
    for (const id of ["end-time", "end-stones", "end-distance", "end-biome", "end-seed"])
      expect(host).toContain(`id="${id}"`);
    expect(source).toContain("elements.endTime.textContent");
    expect(source).toContain("elements.endBiome.textContent");
    // Victory art must stay fully framed (contain) and never under the results card.
    expect(css).toMatch(/\.end-art\s*\{[\s\S]*object-fit:\s*contain/);
    expect(css).toMatch(
      /\.end-overlay\[data-end="won"\]\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    expect(css).toMatch(/\.end-overlay\[data-end="won"\]\s+\.end-stage\s*\{[\s\S]*display:\s*flex/);
    expect(css).not.toMatch(
      /\.end-overlay\[data-end="won"\]\s+\.end-art\s*\{[\s\S]*object-fit:\s*cover/,
    );
  });

  test("styles define layered health orb, socket fill, objective fade, faint reticle", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    expect(css).toContain(".health-orb__liquid");
    expect(css).toContain(".health-orb__meniscus");
    expect(css).toContain(".health-orb__specular");
    expect(css).toContain(".health-orb__fresnel");
    expect(css).toContain(".health-orb__mount");
    expect(css).toContain(".health-orb__splatter");
    expect(css).toContain("damage-red-wash");
    expect(css).toContain(".stone-socket.is-bound .stone-socket__gem");
    expect(css).toContain(".stamina-meter");
    expect(css).toContain(".stamina-meter__fill");
    expect(css).toContain(".stamina-meter.is-warn");
    expect(css).toContain(".stamina-meter.is-critical");
    expect(css).toContain(".stamina-meter.is-exhausted");
    expect(css).not.toContain(".stamina-meter__label");
    expect(css).toContain(".play-progress");
    expect(css).toContain(".run-timer");
    expect(css).toMatch(/\.run-timer\s*\{[\s\S]*left:\s*50%/);
    expect(css).toMatch(/\.run-timer\s*\{[\s\S]*transform:\s*translateX\(-50%\)/);
    expect(css).toContain(".status-chip");
    expect(css).toContain(".status-chip__icon");
    expect(css).toContain(".status-chip__value");
    expect(css).toContain(".time-freeze-status");
    expect(css).toContain(".status-chip[hidden]");
    expect(css).toContain("time-freeze-pulse");
    expect(css).toContain(".luminous-ward-status");
    expect(css).toContain("luminous-ward-pulse");
    expect(css).toContain(".annihilation-pulse-status");
    expect(css).toContain("annihilation-pulse-status-pulse");
    expect(css).toContain(".mobility-status");
    expect(css).toContain(".curse-status");
    expect(css).toContain(".curse-status--swarm");
    expect(css).toContain('.pickup-feedback[data-kind="swarm-curse"]');
    expect(css).toMatch(/\.stone-socket\.is-bound \.stone-socket__gem\s*\{[\s\S]*opacity:\s*1/);
    expect(css).toContain(".map-toggle");
    expect(css).toContain(".hazard-status");
    expect(css).toContain(".play-objective.is-visible");
    expect(css).toContain(".play-objective.is-fading");
    expect(css).toMatch(/\.reticle\s*\{[^}]*opacity:\s*0\.28/s);
  });

  test("copy mentions shift sprint", async () => {
    const { COPY } = await import("../src/ui/copy");
    expect(COPY.status.exploring.toLowerCase()).toContain("shift sprint");
    expect(COPY.status.enterPlay.toLowerCase()).toContain("hold click");
  });

  test("won end-card never enables a content scrollbar", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    const wonCard = css.match(/\.end-overlay\[data-end="won"\]\s+\.end-card\s*\{[^}]+\}/g);
    expect(wonCard?.length).toBeGreaterThan(0);
    for (const block of wonCard ?? []) {
      expect(block).not.toMatch(/overflow\s*:\s*auto/);
      expect(block).not.toMatch(/overflow-y\s*:\s*auto/);
    }
    expect(css).toMatch(
      /\.end-overlay\[data-end="won"\]\s+\.end-card\s*\{[\s\S]*?overflow\s*:\s*hidden/,
    );
  });

  test("maps hold-to-run touch input through PlayerAction on a 48px phone grid", async () => {
    const [host, controller, source, css] = await Promise.all([
      Bun.file(new URL("../index.html", import.meta.url)).text(),
      Bun.file(new URL("../src/player/FirstPersonController.ts", import.meta.url)).text(),
      Bun.file(new URL("../src/main.ts", import.meta.url)).text(),
      Bun.file(new URL("../src/styles.css", import.meta.url)).text(),
    ]);
    const touchControls = host.match(/<nav class="touch-controls"[\s\S]*?<\/nav>/)?.[0] ?? "";

    for (const action of [
      "forward",
      "left",
      "backward",
      "right",
      "turnLeft",
      "turnRight",
      "interact",
      "jump",
      "sprint",
    ]) {
      expect(touchControls).toContain(`data-move="${action}"`);
    }
    expect(touchControls).toContain('aria-label="Run: hold to sprint">RUN</button>');
    expect(controller).toContain('| "sprint"');
    expect(source).toContain("button.dataset.move as PlayerAction | undefined");
    expect(css).toMatch(
      /\.touch-move\s*\{[^}]*grid-template:\s*repeat\(2,\s*48px\)\s*\/\s*repeat\(3,\s*48px\);/s,
    );
    expect(css).toMatch(
      /\.touch-look\s*\{[^}]*grid-template:\s*repeat\(2,\s*48px\)\s*\/\s*repeat\(3,\s*48px\);/s,
    );
    expect(css).toMatch(
      /\.touch-controls button\s*\{[^}]*min-width:\s*48px;[^}]*min-height:\s*48px;/s,
    );
    expect(css).toMatch(
      /\.play-vitals\s*\{[^}]*bottom:\s*max\(120px,\s*calc\(env\(safe-area-inset-bottom\) \+ 112px\)\);/s,
    );
    expect(css).not.toContain("repeat(2, 46px)");
  });

  test("pauses touch play after clearing held actions and keeps resume touch-ready", async () => {
    const [host, source, css] = await Promise.all([
      Bun.file(new URL("../index.html", import.meta.url)).text(),
      Bun.file(new URL("../src/main.ts", import.meta.url)).text(),
      Bun.file(new URL("../src/styles.css", import.meta.url)).text(),
    ]);
    const pauseButton = host.match(/<button id="touch-pause"[\s\S]*?<\/button>/)?.[0] ?? "";
    const clearStart = source.indexOf("function clearTouchSession(): void {");
    const clearEnd = source.indexOf("\n}\n\nfunction resumePlay", clearStart);
    const pauseStart = source.indexOf("function pauseTouchPlay(): void {");
    const pauseEnd = source.indexOf("\n}\n\nfunction clearTouchSessionWhenHidden", pauseStart);
    const cleanup = source.slice(clearStart, clearEnd);
    const pause = source.slice(pauseStart, pauseEnd);

    expect(pauseButton).toContain('type="button"');
    expect(pauseButton).toContain('aria-label="Pause game"');
    expect(pauseButton).toContain("PAUSE");
    expect(css).toMatch(
      /\.touch-look \.touch-pause\s*\{[^}]*grid-row:\s*1;[^}]*grid-column:\s*2;/s,
    );
    expect(css).toMatch(/\.touch-controls \.touch-pause\s*\{[^}]*font-size:\s*9px;/s);
    expect(cleanup).toContain("controller.setVirtualAction(action, false);");
    expect(cleanup).toContain("uiInteractQueued = false;");
    expect(cleanup).toContain("touchSessionActive = false;");
    expect(pause.indexOf("clearTouchSession();")).toBeLessThan(
      pause.indexOf("setOptionsOpen(true);"),
    );
    expect(pause).toContain("resumeTouchControls = true;");
    expect(source).toContain('elements.touchPause.addEventListener("click", pauseTouchPlay);');
    expect(source).toContain('elements.optionsResume.addEventListener("click", resumePlay);');
    // Touch resume skips pointer lock; desktop resume requests it after closing pause.
    expect(source).toMatch(/if\s*\(\s*useTouchControls\s*\)\s*\{/);
    expect(source).toMatch(
      /if\s*\(\s*engineMode === "play"\s*&&\s*playRuntime\.state\(\)\.runMode === "playing"\s*\)\s*\{\s*controller\.requestPointerLock\(\);/,
    );
    expect(source).toContain("suppressPauseOnPointerUnlock");
    expect(source).toContain('window.addEventListener("pagehide", clearTouchSession);');
    expect(source).toContain(
      'document.addEventListener("visibilitychange", clearTouchSessionWhenHidden);',
    );
    expect(source).toContain('if (document.visibilityState === "hidden") clearTouchSession();');
    expect(source).toContain('window.addEventListener("pagehide", () => localRunSave.flush());');
  });

  test("pause menu puts resume first and keeps restart secondary", async () => {
    const [host, source, css, editorCss, copySource] = await Promise.all([
      Bun.file(new URL("../index.html", import.meta.url)).text(),
      Bun.file(new URL("../src/main.ts", import.meta.url)).text(),
      Bun.file(new URL("../src/styles.css", import.meta.url)).text(),
      Bun.file(new URL("../src/styles/editor.css", import.meta.url)).text(),
      Bun.file(new URL("../src/ui/copy.ts", import.meta.url)).text(),
    ]);
    const session = host.match(/<nav class="options-session"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const resumeIndex = host.indexOf('id="options-resume"');
    const sessionIndex = host.indexOf('class="options-session"');
    const modeIndex = host.indexOf('class="mode-switcher"');
    const fxIndex = host.indexOf('class="options-fx"');
    const homeIndex = host.indexOf('id="options-home"');
    const restartIndex = host.indexOf('id="options-restart"');

    expect(session).toContain('id="options-restart"');
    expect(session).toContain("RESTART MAP");
    expect(session).toContain('id="options-home"');
    expect(session).toContain("MAIN MENU");
    expect(resumeIndex).toBeGreaterThan(-1);
    // DOM order for play: resume → settings → session exits (home, then restart).
    expect(fxIndex).toBeGreaterThan(resumeIndex);
    expect(sessionIndex).toBeGreaterThan(fxIndex);
    expect(homeIndex).toBeGreaterThan(sessionIndex);
    expect(restartIndex).toBeGreaterThan(homeIndex);
    expect(modeIndex).toBeGreaterThan(-1);

    expect(css).toContain('.app-shell[data-engine-mode="play"] .options-session');
    expect(css).toMatch(
      /\.app-shell\[data-engine-mode="play"\] #options-resume\s*\{[^}]*order:\s*1;/s,
    );
    expect(css).toMatch(
      /\.app-shell\[data-engine-mode="play"\] \.options-fx\s*\{[^}]*order:\s*2;/s,
    );
    expect(css).toMatch(
      /\.app-shell\[data-engine-mode="play"\] \.options-session\s*\{[^}]*order:\s*3;/s,
    );
    expect(css).toContain(
      '.app-shell[data-local-dev-tools="false"][data-engine-mode="play"] .mode-switcher',
    );
    expect(css).toContain(
      '.app-shell[data-local-dev-tools="false"][data-engine-mode="play"] .options-status',
    );
    expect(css).toContain(".options-toggle");
    expect(editorCss).toContain(".options-session");
    expect(editorCss).toMatch(
      /\.app-shell\[data-engine-mode="editor"\] \.options-session[\s\S]*display:\s*none !important;/s,
    );

    expect(source).toContain("function restartCurrentMap(): void");
    expect(source).toContain("function returnToMainScreen(): void");
    expect(source).toContain('elements.optionsRestart.addEventListener("click"');
    expect(source).toContain('elements.optionsHome.addEventListener("click"');
    expect(source).toContain('elements.endHome.addEventListener("click"');
    expect(source).toContain("isPlayerFacingStatus");
    expect(source).toContain("COPY.pause.restarted");
    expect(source).toContain("COPY.pause.returnedHome");
    expect(source).toContain("localRunSave.flush()");
    expect(source).toContain("setWelcomeOpen(true)");
    expect(copySource).toContain('restartMap: "RESTART MAP"');
    expect(copySource).toContain('backToMain: "MAIN MENU"');
    expect(copySource).toContain("generationPlayer");
    expect(host).toContain('id="end-home"');
    expect(host).toContain('id="end-overlay"');
  });
});
