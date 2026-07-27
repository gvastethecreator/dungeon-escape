import { describe, expect, test } from "bun:test";

describe("persistent leaderboard UI", () => {
  test("welcome exposes a live local ranking without blocking run actions", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="leaderboard-list"');
    expect(host).toContain('id="leaderboard-status"');
    expect(host).toContain('aria-labelledby="leaderboard-title"');
    expect(host).toContain('id="welcome-new"');
    expect(host).toContain('id="welcome-continue"');
  });

  test("victory captures a bounded name and presents the trusted score", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="end-score"');
    expect(host).toContain('id="end-leaderboard-form"');
    expect(host).toContain('id="leaderboard-name"');
    expect(host).toContain('maxlength="20"');
    expect(host).toContain('id="leaderboard-submit"');
  });

  test("client submits the completed run and refreshes the welcome ranking", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(source).toContain("prepareLeaderboardSubmission(");
    expect(source).toContain(
      "submitLeaderboardEntry({ ...pendingLeaderboardSubmission, playerName })",
    );
    expect(source).toContain("void refreshLeaderboard();");
    expect(source).toMatch(/mode === "dead"[\s\S]*elements\.leaderboardName/);
  });

  test("responsive styles stack the ranking and name form", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    expect(css).toContain(".welcome-leaderboard");
    expect(css).toContain(".leaderboard-list");
    expect(css).toContain(".end-leaderboard-form");
    expect(css).toMatch(/@media \(max-width: 900px\)[\s\S]*\.welcome-content/);
    expect(css).toMatch(/@media \(max-width: 560px\)[\s\S]*\.end-leaderboard-form > div/);
  });
});
