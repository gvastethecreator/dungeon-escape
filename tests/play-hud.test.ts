import { describe, expect, test } from "bun:test";

describe("Play HUD structure (Ash Binding)", () => {
  test("keeps health left and groups timer with stone progress", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="play-objective"');
    expect(host).toContain('class="health-orb"');
    expect(host).toContain('id="resolve-fill"');
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
    expect(host).toContain('id="hazard-status"');
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
    expect(host).toContain("RUN AUTHORITY");
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
    expect(COPY.end.loseTitle).toBe("You Died");
    expect(COPY.end.winLead).toBe("All four stones are bound. The exit is open.");
    expect(COPY.end.retry).toBe("Try again");
    expect(COPY.end.newDungeon).toBe("New dungeon");
  });

  test("death offers the same layout and a new dungeon as separate actions", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="retry"');
    expect(host).toContain('id="new-dungeon"');
    expect(host).toContain('role="dialog"');
    expect(host).toContain('aria-modal="true"');
  });

  test("victory has generated art and real run result fields", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const art = Bun.file(
      new URL("../public/assets/ui/dungeon-victory-results-v1.webp", import.meta.url),
    );
    expect(host).toContain("/assets/ui/dungeon-victory-results-v1.webp");
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
    expect(css).toContain(".play-progress");
    expect(css).toContain(".run-timer");
    expect(css).toContain(".time-freeze-status");
    expect(css).toContain("time-freeze-pulse");
    expect(css).toContain(".map-toggle");
    expect(css).toContain(".hazard-status");
    expect(css).toContain(".play-objective.is-visible");
    expect(css).toContain(".play-objective.is-fading");
    expect(css).toMatch(/\.reticle\s*\{[^}]*opacity:\s*0\.28/s);
  });
});
