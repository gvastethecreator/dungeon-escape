import type { LeaderboardEntry } from "./contract";

export type LeaderboardScoreComparison =
  | { kind: "empty" }
  | { kind: "ranked"; projectedRank: number; leaderScore: number }
  | { kind: "outside"; limit: number; leaderScore: number };

/**
 * Places an unsaved score after existing ties. The server remains the source
 * of truth and replaces this projection with the saved rank after submission.
 */
export function compareLeaderboardScore(
  score: number,
  entries: readonly LeaderboardEntry[],
  limit: number,
): LeaderboardScoreComparison {
  if (entries.length === 0) return { kind: "empty" };

  const leaderScore = Math.max(...entries.map((entry) => entry.score));
  const projectedRank = entries.filter((entry) => entry.score >= score).length + 1;
  if (entries.length >= limit && projectedRank > limit) {
    return { kind: "outside", limit, leaderScore };
  }
  return { kind: "ranked", projectedRank, leaderScore };
}
