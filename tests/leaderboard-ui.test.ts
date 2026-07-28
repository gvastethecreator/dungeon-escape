import { describe, expect, test } from "bun:test";

describe("persistent leaderboard UI", () => {
  test("welcome exposes a live local ranking without blocking run actions", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="leaderboard-list"');
    expect(host).toContain('id="leaderboard-status"');
    expect(host).toContain('aria-labelledby="leaderboard-title"');
    expect(host).toContain('id="welcome-new"');
    expect(host).toContain('id="welcome-continue"');
    expect(host).toContain('id="welcome-custom"');
  });

  test("victory captures a bounded name and presents the trusted score", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="end-score"');
    expect(host).toContain('id="end-leaderboard-form"');
    expect(host).toContain('id="end-leaderboard-note"');
    expect(host).toContain('id="leaderboard-name"');
    expect(host).toContain('maxlength="20"');
    expect(host).toContain('id="leaderboard-submit"');
  });

  test("client submits the completed run and refreshes the welcome ranking", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const copy = await Bun.file(new URL("../src/ui/copy.ts", import.meta.url)).text();
    expect(source).toContain("prepareLeaderboardSubmission(");
    expect(source).toContain(
      "submitLeaderboardEntry({ ...pendingLeaderboardSubmission, playerName })",
    );
    expect(source).toContain("void refreshLeaderboard();");
    expect(source).toContain('runSource: "campaign"');
    expect(source).toContain("isLeaderboardEligible(runSource)");
    expect(source).toContain('setRunSource("custom"');
    expect(copy).toContain("Custom run · practice only");
    expect(source).toMatch(/mode === "dead"[\s\S]*elements\.leaderboardName/);
  });

  test("ranking rows expose escape time and a clickable seed replay", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(source).toContain("leaderboard-body");
    expect(source).toContain("leaderboard-meta");
    expect(source).toContain("leaderboard-seed");
    expect(source).toContain("leaderboard-portrait");
    expect(source).toContain("leaderboard-frame");
    expect(source).toContain("frameForRank(");
    expect(source).toContain("portraitForName(");
    expect(source).toContain("formatTime(entry.durationMs / 1000)");
    expect(source).toContain('startPlayWithSeed(entry.seed, { runSource: "campaign" })');
    expect(source).toContain(
      'startPlayWithSeed(makeSeed(), { refreshProcedural: true, runSource: "campaign" })',
    );
  });

  test("victory form previews the name-bound portrait in a wood frame", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="leaderboard-portrait-preview"');
    expect(host).toContain("/assets/ui/portraits/frames/frame-wood.png");
    expect(host).not.toContain('id="leaderboard-portrait-title"');
  });

  test("responsive styles stack the ranking and name form", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    expect(css).toContain(".welcome-leaderboard");
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
