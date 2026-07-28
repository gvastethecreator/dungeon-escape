import { describe, expect, test } from "bun:test";

describe("Play HUD structure (Ash Binding)", () => {
  test("keeps health left and groups timer with stone progress", async () => {
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
    expect(host).toContain('id="time-freeze-status"');
    expect(host).toContain('id="time-freeze-value"');
    expect(host).toContain('id="luminous-ward-status"');
    expect(host).toContain('id="luminous-ward-value"');
    expect(host).toContain('id="annihilation-pulse-status"');
    expect(host).toContain('id="annihilation-pulse-value"');
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
    expect(COPY.pickup.small).toBe("BOUND");
    expect(COPY.pickup.flask).toBe("HEALTH RESTORED");
    expect(COPY.pickup.timeFreeze).toBe("TIME FROZEN");
    expect(COPY.status.timeFreeze).toContain("20 seconds");
    expect(COPY.pickup.luminousWard).toBe("WARD STONE");
    expect(COPY.status.luminousWard).toContain("30 seconds");
    expect(COPY.pickup.annihilationPulse).toBe("PULSE RELIC");
    expect(COPY.status.annihilationPulse).toContain("26 seconds");
    expect(COPY.end.loseTitle).toBe("You Died");
    expect(COPY.end.winTitle).toBe("You escaped the dungeon");
    expect(COPY.status.won).toBe("You escaped the dungeon");
    expect(COPY.end.winLead).toBe("All four stones are bound. The exit is open.");
    expect(COPY.end.retry).toBe("Try again");
    expect(COPY.end.newDungeon).toBe("New dungeon");
    expect(COPY.hud.musicOn).toBe("MUSIC ON");
    expect(COPY.hud.musicOff).toBe("MUSIC OFF");
  });

  test("death offers the same layout and a new dungeon as separate actions", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="retry"');
    expect(host).toContain('id="new-dungeon"');
    expect(host).toContain('id="end-next-biome"');
    expect(host).toContain('role="dialog"');
    expect(host).toContain('aria-modal="true"');
  });

  test("victory has generated art and real run result fields", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const art = Bun.file(
      new URL("../public/assets/ui/biome-screens/ancient-ending.webp", import.meta.url),
    );
    expect(host).toContain("/assets/ui/biome-screens/ancient-ending.webp");
    expect(host).toContain('data-biome-id="ancient"');
    expect(await art.exists()).toBe(true);
    expect(art.size).toBeLessThan(400_000);
    for (const id of ["end-time", "end-stones", "end-distance", "end-biome", "end-seed"])
      expect(host).toContain(`id="${id}"`);
    expect(source).toContain("elements.endTime.textContent");
    expect(source).toContain("elements.endBiome.textContent");
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
    expect(css).toContain(".time-freeze-status");
    expect(css).toContain(".time-freeze-status[hidden]");
    expect(css).toContain("time-freeze-pulse");
    expect(css).toContain(".luminous-ward-status");
    expect(css).toContain(".luminous-ward-status[hidden]");
    expect(css).toContain("luminous-ward-pulse");
    expect(css).toContain(".annihilation-pulse-status");
    expect(css).toContain("annihilation-pulse-status-pulse");
    expect(css).toContain(".map-toggle");
    expect(css).toContain(".hazard-status");
    expect(css).toContain(".play-objective.is-visible");
    expect(css).toContain(".play-objective.is-fading");
    expect(css).toMatch(/\.reticle\s*\{[^}]*opacity:\s*0\.28/s);
  });

  test("copy mentions shift sprint", async () => {
    const { COPY } = await import("../src/ui/copy");
    expect(COPY.status.exploring.toLowerCase()).toContain("shift sprint");
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
      /\.play-vitals\s*\{[^}]*bottom:\s*max\(112px,\s*calc\(env\(safe-area-inset-bottom\) \+ 106px\)\);/s,
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
    expect(source).toMatch(
      /if\s*\(\s*!useTouchControls\s*&&\s*engineMode === "play"\s*&&\s*playRuntime\.state\(\)\.runMode === "playing"\s*\)/,
    );
    expect(source).toContain('window.addEventListener("pagehide", clearTouchSession);');
    expect(source).toContain(
      'document.addEventListener("visibilitychange", clearTouchSessionWhenHidden);',
    );
    expect(source).toContain('if (document.visibilityState === "hidden") clearTouchSession();');
    expect(source).toContain('window.addEventListener("pagehide", flushLocalRunSave);');
  });
});
