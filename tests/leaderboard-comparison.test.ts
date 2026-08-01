import { describe, expect, test } from "bun:test";

import { compareLeaderboardScore } from "../src/leaderboard/comparison";
import type { LeaderboardEntry } from "../src/leaderboard/contract";

function entry(score: number, rank: number): LeaderboardEntry {
  return {
    runId: `run_comparison_${rank}`,
    playerName: `Runner ${rank}`,
    score,
    scoreVersion: 1,
    durationMs: 120_000 + rank,
    distanceM: 300,
    stonesFound: 4,
    biome: "Ancient",
    seed: `HALL-${rank}`,
    difficulty: "STANDARD",
    difficultyValue: 0.5,
    roomCount: 28,
    runSource: "campaign",
    completedAt: "2026-08-01T12:00:00.000Z",
    rank,
  };
}

describe("end-screen leaderboard comparison", () => {
  test("projects a new score after existing ties", () => {
    const comparison = compareLeaderboardScore(
      120_000,
      [entry(150_000, 1), entry(120_000, 2), entry(90_000, 3)],
      50,
    );
    expect(comparison).toEqual({ kind: "ranked", projectedRank: 3, leaderScore: 150_000 });
  });

  test("distinguishes an empty Hall and a score below the visible top", () => {
    expect(compareLeaderboardScore(120_000, [], 50)).toEqual({ kind: "empty" });
    const fullHall = Array.from({ length: 50 }, (_, index) => entry(200_000 - index, index + 1));
    expect(compareLeaderboardScore(100, fullHall, 50)).toEqual({
      kind: "outside",
      limit: 50,
      leaderScore: 200_000,
    });
  });
});
