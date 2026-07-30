import type {
  LeaderboardEntry,
  PlayerBiomeStars,
  ValidLeaderboardSubmission,
} from "../src/leaderboard/contract";
import {
  hallPersistence,
  type HallBiomeStarRow,
  type HallEntryRow,
} from "../src/leaderboard/hallPersistence";
import type { LeaderboardRepository } from "../src/leaderboard/repository";

export class D1LeaderboardRepository implements LeaderboardRepository {
  constructor(private readonly database: D1Database) {}

  async list(limit: number): Promise<LeaderboardEntry[]> {
    const result = await this.database
      .prepare(hallPersistence.statements.list)
      .bind(limit)
      .all<HallEntryRow>();
    return hallPersistence.list(result.results);
  }

  async listBiomeStars(): Promise<PlayerBiomeStars> {
    const result = await this.database
      .prepare(hallPersistence.statements.listBiomeStars)
      .all<HallBiomeStarRow>();
    return hallPersistence.listBiomeStars(result.results);
  }

  async create(submission: ValidLeaderboardSubmission): Promise<LeaderboardEntry> {
    await this.database
      .prepare(hallPersistence.statements.create)
      .bind(...hallPersistence.createBindings(submission, "d1"))
      .run();

    const row = await this.database
      .prepare(hallPersistence.statements.createdEntry)
      .bind(submission.runId)
      .first<HallEntryRow>();
    return hallPersistence.create(row);
  }
}
