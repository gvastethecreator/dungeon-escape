/**
 * Campaign runs (New Game / Hall seed replay) may enter the leaderboard.
 * Custom runs (Custom Run, Forge, Map Tools) stay playable but never rank.
 */

export type RunSource = "campaign" | "custom";

export function isRunSource(value: unknown): value is RunSource {
  return value === "campaign" || value === "custom";
}

export function isLeaderboardEligible(source: RunSource): boolean {
  return source === "campaign";
}

/** Forge maps are always custom — never Hall of Escapes material. */
export function runSourceForDungeon(intended: RunSource, hasForgeMetadata: boolean): RunSource {
  return hasForgeMetadata ? "custom" : intended;
}
