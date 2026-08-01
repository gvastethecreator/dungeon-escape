import { describe, expect, test } from "bun:test";

describe("persistent leaderboard UI", () => {
  test("welcome reveals the local ranking only after the player's first finished game", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(host).toContain('id="welcome-leaderboard"');
    expect(host).toMatch(/id="welcome-leaderboard"[\s\S]*?hidden/);
    expect(host).toContain('id="leaderboard-list"');
    expect(host).toContain('id="leaderboard-status"');
    expect(host).toContain('aria-labelledby="leaderboard-title"');
    expect(host).toContain('id="welcome-new"');
    expect(host).toContain('id="welcome-continue"');
    expect(host).toContain('id="welcome-custom"');
    expect(source).toContain("playerProfile?.hasCompletedRun");
    expect(source).toContain("syncWelcomeLeaderboardVisibility()");
    expect(source).not.toContain("void refreshLeaderboard();\nconst localContinue");
  });

  test("victory captures a bounded name and presents the trusted score", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(host).toContain('id="end-score"');
    expect(host).toContain('id="end-leaderboard-comparison"');
    expect(host).toContain('id="end-leaderboard-rank"');
    expect(host).toContain('id="end-leaderboard-delta"');
    expect(host).toContain('id="end-leaderboard-form"');
    expect(host).toContain('id="end-leaderboard-note"');
    expect(host).toContain('id="leaderboard-name"');
    expect(host).toContain('maxlength="20"');
    expect(host).toContain('id="leaderboard-submit"');
    expect(source).toContain("compareLeaderboardScore(");
    expect(source).toContain("loadLeaderboard(END_LEADERBOARD_LIMIT)");
    expect(source).toContain("renderSavedLeaderboardRank(entry.rank, entry.score)");
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
    expect(source).toContain("leaderboard-body");
    expect(source).toContain("leaderboard-meta");
    expect(source).toContain("leaderboard-seed");
    expect(source).toContain("leaderboard-portrait");
    expect(source).toContain("leaderboard-frame");
    expect(source).toContain("frameForRank(");
    expect(source).toContain("portraitForIndex(");
    expect(source).toContain("formatTime(entry.durationMs / 1000)");
    expect(source).toContain('startPlayWithSeed(entry.seed, { runSource: "campaign" })');
    expect(source).toContain("startNewGameWithBiome(biomeId)");
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
});
