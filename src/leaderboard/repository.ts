import type { LeaderboardEntry, PlayerBiomeStars, ValidLeaderboardSubmission } from "./contract";

export interface LeaderboardRepository {
  list(limit: number): Promise<LeaderboardEntry[]>;
  /** Count of saved completions per player name and biome label. */
  listBiomeStars(): Promise<PlayerBiomeStars>;
  create(submission: ValidLeaderboardSubmission): Promise<LeaderboardEntry>;
}
