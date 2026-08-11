import { describe, expect, test } from "bun:test";

describe("persistent leaderboard UI", () => {
  test("welcome loads and reveals the ranking on the main screen", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const shell = await Bun.file(new URL("../src/shell.ts", import.meta.url)).text();
    expect(host).toContain('id="welcome-leaderboard"');
    expect(host).toMatch(/id="welcome-leaderboard"[\s\S]*?hidden/);
    expect(host).toContain('id="leaderboard-list"');
    expect(host).toContain('id="leaderboard-status"');
    expect(host).toContain('aria-labelledby="leaderboard-title"');
    expect(host).toContain('id="welcome-new"');
    expect(host).toContain('id="welcome-continue"');
    expect(host).toContain('id="welcome-custom"');
    expect(source).toMatch(
      /function syncWelcomeLeaderboardVisibility[\s\S]*const visible = welcomeOpen/,
    );
    expect(source).toContain("syncWelcomeLeaderboardVisibility()");
    expect(shell).toContain("await loadLeaderboard()");
    expect(shell).toContain("welcomeLeaderboard.hidden = false");
    expect(shell).toContain('welcomeContent.classList.add("is-ranked")');
    expect(shell).toContain("void refreshLeaderboard()");
    expect(source).not.toContain("void refreshLeaderboard();\nconst localContinue");
  });

  test("victory captures a bounded name and presents the trusted score", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const controller = await Bun.file(
      new URL("../src/ui/RoundResultsController.ts", import.meta.url),
    ).text();
    expect(host).toContain('id="end-score"');
    expect(host).toContain('id="end-leaderboard-comparison"');
    expect(host).toContain('id="end-leaderboard-rank"');
    expect(host).toContain('id="end-leaderboard-delta"');
    expect(host).toContain('id="end-leaderboard-form"');
    expect(host).toContain('id="end-leaderboard-note"');
    expect(host).toContain('id="leaderboard-name"');
    expect(host).toContain('maxlength="20"');
    expect(host).toContain('id="leaderboard-submit"');
    expect(controller).toContain("compareLeaderboardScore(");
    expect(source).toContain("new RoundResultsController((limit) => loadLeaderboard(limit))");
    expect(source).toContain("roundResults.save(entry.rank, entry.score");
  });

  test("client submits the completed run and refreshes the welcome ranking", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const copy = await Bun.file(new URL("../src/ui/copy.ts", import.meta.url)).text();
    expect(source).toContain("prepareLeaderboardSubmission(");
    expect(source).toContain("const { entry } = await submitLeaderboardEntry({");
    expect(source).toContain("queueMicrotask(() => void submitPreparedLeaderboardEntry())");
    expect(source).toContain("void refreshLeaderboard();");
    expect(source).toContain('runSource: "campaign"');
    expect(source).toContain("isLeaderboardEligible(runSource)");
    expect(source).toContain('setRunSource("custom"');
    expect(copy).toContain("Custom run · practice only");
    expect(source).toMatch(/mode === "dead"[\s\S]*elements\.leaderboardName/);
  });

  test("after Hall save, victory offers the next campaign biome", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const copy = await Bun.file(new URL("../src/ui/copy.ts", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    expect(host).toContain('id="end-next-biome"');
    expect(host).toContain('id="end-next-biome" type="button" disabled');
    expect(source).toContain("revealEndNextBiomeAfterSave()");
    expect(source).toContain("setEndNextBiomeDisabled(");
    expect(source).toContain("setEndNextBiomeEnabled(");
    expect(source).toContain("nextBiomeId(");
    expect(source).toContain("startNewGameWithBiome(biomeId)");
    expect(source).toContain("hideEndNextBiome()");
    expect(css).toContain("#end-next-biome:disabled");
    expect(copy).toContain("nextRun:");
    expect(copy).toContain("nextBiome:");
    expect(copy).toContain("finalBiomeSaved:");
  });

  test("ranking rows expose escape time and a clickable seed replay", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const renderer = await Bun.file(
      new URL("../src/leaderboard/render.ts", import.meta.url),
    ).text();
    expect(renderer).toContain("leaderboard-body");
    expect(renderer).toContain("leaderboard-meta");
    expect(renderer).toContain("leaderboard-seed");
    expect(renderer).toContain("leaderboard-portrait");
    expect(renderer).toContain("leaderboard-frame");
    expect(renderer).toContain("frameForRank(");
    expect(renderer).toContain("portraitForIndex(");
    expect(renderer).toContain("formatTime(entry.durationMs / 1000)");
    expect(source).toContain('startPlayWithSeed(entry.seed, { runSource: "campaign" })');
    expect(source).toContain("startNewGameWithBiome(biomeId)");
  });

  test("saved-game title uses only the biome in shell and runtime", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const shell = await Bun.file(new URL("../src/shell.ts", import.meta.url)).text();
    expect(source).toContain("return continueBiomeLabel(state, presentation)");
    expect(source).not.toContain("return `${seed} · ${continueBiomeLabel");
    expect(shell).toContain('element<HTMLElement>("welcome-save-title").textContent = biomeLabel');
    expect(shell).not.toContain("`${save.state.seed} · ${biomeLabel}`");
  });

  test("welcome hides the saved-game block when no save exists", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const shell = await Bun.file(new URL("../src/shell.ts", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    expect(host).toMatch(/id="welcome-save"[\s\S]*?hidden/);
    expect(host).not.toContain("No active descent");
    expect(source).toContain("elements.welcomeSave.hidden = state === null");
    expect(shell).toContain("welcomeSave.hidden = !canContinue");
    expect(css).toContain(".welcome-save[hidden]");
  });

  test("first-time profile setup still shows and loads the empty leaderboard", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const shell = await Bun.file(new URL("../src/shell.ts", import.meta.url)).text();
    expect(shell).toMatch(
      /function showProfile[\s\S]*welcomeLeaderboard\.hidden = false[\s\S]*classList\.add\("is-ranked"\)/,
    );
    expect(shell).toMatch(/hydrateWelcome\(\);\s*void refreshLeaderboard\(\);/);
    expect(source).toMatch(
      /setWelcomeOpen[\s\S]*showWelcomeHome\(\);\s*void refreshLeaderboard\(\);/,
    );
  });

  test("victory form previews the portrait in an interactive wood frame", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(host).toContain('id="leaderboard-portrait-preview-face"');
    expect(host).toContain('id="leaderboard-portrait-preview"');
    expect(host).toContain('role="button"');
    expect(host).toContain('title="Click to change portrait"');
    expect(host).toContain("/assets/ui/portraits/frames/frame-wood.webp");
    expect(source).toContain("cycleLeaderboardPortrait()");
  });

  test("responsive styles stack the ranking and name form", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    expect(css).toContain(".welcome-leaderboard");
    expect(css).toContain(".welcome-content.is-ranked");
    expect(css).toContain(".leaderboard-list");
    expect(css).toContain(".leaderboard-body");
    expect(css).toContain(".leaderboard-meta");
    expect(css).toContain(".leaderboard-seed");
    expect(css).toContain(".leaderboard-face");
    expect(css).toContain(".leaderboard-frame");
    expect(css).toContain(".leaderboard-portrait");
    expect(css).toContain(".leaderboard-entry.is-gold");
    expect(css).toContain("min-height: 0");
    expect(css).toContain(".end-leaderboard-form");
    expect(css).toContain(".end-leaderboard-preview");
    expect(css).toContain(".end-leaderboard-form__row");
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*\.welcome-content/);
    expect(css).toMatch(/@media \(max-width: 560px\)[\s\S]*\.end-leaderboard-form__row/);
  });

  test("home presents a saved descent and keeps the full hall behind an explicit reveal", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    expect(host).toContain('id="welcome-save-title"');
    expect(host).toContain('id="welcome-save-details"');
    expect(host).toContain('id="welcome-hall-toggle"');
    expect(host).toContain("VIEW HALL");
    expect(host).not.toContain("THE GATE");
    expect(host).not.toContain("THE LEDGER · TOP THREE");
    expect(host).not.toContain("LAST DESCENT");
    expect(host).not.toContain("ASH REMEMBERS EVERY FAILURE");
    expect(host).not.toContain("CONTINUE READY");
    expect(source).toContain("continueDomainState");
    expect(source).toContain("elements.welcomeContinue");
    expect(source).toContain("elements.welcomeNew");
    expect(source).toContain('elements.welcomeHallToggle.setAttribute("aria-expanded"');
    expect(css).toContain(".leaderboard-list > :nth-child(n + 4)");
    expect(css).toContain(".welcome-leaderboard.is-expanded .leaderboard-list > :nth-child(n + 4)");
    expect(css).toContain(".welcome-hall-toggle[hidden]");
  });
});
