import type { LeaderboardEntry, ValidLeaderboardSubmission } from "./contract";

export interface LeaderboardRepository {
  list(limit: number): Promise<LeaderboardEntry[]>;
  create(submission: ValidLeaderboardSubmission): Promise<LeaderboardEntry>;
}
