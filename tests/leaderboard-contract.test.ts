import { describe, expect, test } from "bun:test";

import {
  computeLeaderboardScore,
  leaderboardLimit,
  normalizePlayerName,
  parseLeaderboardSubmission,
} from "../src/leaderboard/contract";

const completeRun = {
  runId: "run_01JTESTLEADERBOARD",
  playerName: "  Cristian   Ash  ",
  durationMs: 240_000,
  distanceM: 540,
  stonesFound: 4,
  biome: "Molten",
  seed: "ASH-TEST-17",
  difficultyValue: 0.5,
  roomCount: 42,
};

describe("leaderboard contract", () => {
  test("normalizes a readable player name and rejects markup", () => {
    expect(normalizePlayerName("  María   O'Neil ")).toBe("María O'Neil");
    expect(normalizePlayerName("<script>")).toBeNull();
    expect(normalizePlayerName("x".repeat(21))).toBeNull();
  });

  test("accepts a completed run and derives trusted rank fields", () => {
    const result = parseLeaderboardSubmission(completeRun);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.playerName).toBe("Cristian Ash");
    expect(result.value.difficulty).toBe("STANDARD");
    expect(result.value.score).toBeGreaterThan(0);
    expect(result.value.scoreVersion).toBe(1);
  });

  test("rejects incomplete and malformed runs", () => {
    expect(parseLeaderboardSubmission({ ...completeRun, stonesFound: 3 })).toEqual(
      expect.objectContaining({ ok: false, code: "INCOMPLETE_RUN" }),
    );
    expect(parseLeaderboardSubmission({ ...completeRun, durationMs: -1 })).toEqual(
      expect.objectContaining({ ok: false, code: "INVALID_DURATION" }),
    );
    expect(parseLeaderboardSubmission({ ...completeRun, roomCount: 200 })).toEqual(
      expect.objectContaining({ ok: false, code: "INVALID_MAP" }),
    );
  });

  test("rewards speed, difficulty and larger maps in bounded order", () => {
    const base = { durationMs: 300_000, difficultyValue: 0.5, roomCount: 28 };
    expect(computeLeaderboardScore({ ...base, durationMs: 150_000 })).toBeGreaterThan(
      computeLeaderboardScore(base),
    );
    expect(computeLeaderboardScore({ ...base, difficultyValue: 1 })).toBeGreaterThan(
      computeLeaderboardScore(base),
    );
    expect(computeLeaderboardScore({ ...base, roomCount: 56 })).toBeGreaterThan(
      computeLeaderboardScore(base),
    );
  });

  test("bounds list size", () => {
    expect(leaderboardLimit(null)).toBe(8);
    expect(leaderboardLimit("0")).toBe(1);
    expect(leaderboardLimit("999")).toBe(50);
  });
});
