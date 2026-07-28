import type {
  LeaderboardEntry,
  PlayerBiomeStars,
  ValidLeaderboardSubmission,
} from "../src/leaderboard/contract";
import type { LeaderboardRepository } from "../src/leaderboard/repository";

interface D1LeaderboardRow {
  run_id: string;
  player_name: string;
  score: number;
  score_version: number;
  duration_ms: number;
  distance_m: number;
  stones_found: number;
  biome: string;
  seed: string;
  difficulty: ValidLeaderboardSubmission["difficulty"];
  difficulty_value: number;
  room_count: number;
  portrait_index: number | null;
  completed_at: string;
  rank: number;
}

const SELECT_FIELDS = `
  run_id,
  player_name,
  score,
  score_version,
  duration_ms,
  distance_m,
  stones_found,
  biome,
  seed,
  difficulty,
  difficulty_value,
  room_count,
  portrait_index,
  completed_at
`;

function toEntry(row: D1LeaderboardRow): LeaderboardEntry {
  return {
    runId: row.run_id,
    playerName: row.player_name,
    score: row.score,
    scoreVersion: row.score_version as 1,
    durationMs: row.duration_ms,
    distanceM: row.distance_m,
    stonesFound: row.stones_found as 4,
    biome: row.biome,
    seed: row.seed,
    difficulty: row.difficulty,
    difficultyValue: row.difficulty_value,
    roomCount: row.room_count,
    ...(row.portrait_index !== null && row.portrait_index !== undefined
      ? { portraitIndex: row.portrait_index }
      : {}),
    completedAt: row.completed_at,
    rank: row.rank,
  };
}

export class D1LeaderboardRepository implements LeaderboardRepository {
  constructor(private readonly database: D1Database) {}

  async list(limit: number): Promise<LeaderboardEntry[]> {
    const result = await this.database
      .prepare(
        `SELECT
           ${SELECT_FIELDS},
           ROW_NUMBER() OVER (
             ORDER BY score DESC, duration_ms ASC, completed_at ASC, run_id ASC
           ) AS rank
         FROM leaderboard_entries
         ORDER BY score DESC, duration_ms ASC, completed_at ASC, run_id ASC
         LIMIT ?`,
      )
      .bind(limit)
      .all<D1LeaderboardRow>();
    return result.results.map(toEntry);
  }

  async listBiomeStars(): Promise<PlayerBiomeStars> {
    const result = await this.database
      .prepare(
        `SELECT player_name AS playerName, biome, COUNT(*) AS stars
         FROM leaderboard_entries
         GROUP BY player_name, biome`,
      )
      .all<{ playerName: string; biome: string; stars: number }>();
    const map: PlayerBiomeStars = {};
    for (const row of result.results) {
      const player = map[row.playerName] ?? (map[row.playerName] = {});
      player[row.biome] = Number(row.stars) || 0;
    }
    return map;
  }

  async create(submission: ValidLeaderboardSubmission): Promise<LeaderboardEntry> {
    await this.database
      .prepare(
        `INSERT OR IGNORE INTO leaderboard_entries (
           run_id, player_name, score, score_version, duration_ms, distance_m,
           stones_found, biome, seed, difficulty, difficulty_value, room_count, portrait_index, storage_source
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'd1')`,
      )
      .bind(
        submission.runId,
        submission.playerName,
        submission.score,
        submission.scoreVersion,
        submission.durationMs,
        submission.distanceM,
        submission.stonesFound,
        submission.biome,
        submission.seed,
        submission.difficulty,
        submission.difficultyValue,
        submission.roomCount,
        submission.portraitIndex ?? null,
      )
      .run();

    const row = await this.database
      .prepare(
        `SELECT
           entry.run_id,
           entry.player_name,
           entry.score,
           entry.score_version,
           entry.duration_ms,
           entry.distance_m,
           entry.stones_found,
           entry.biome,
           entry.seed,
           entry.difficulty,
           entry.difficulty_value,
           entry.room_count,
           entry.portrait_index,
           entry.completed_at,
           (
             SELECT COUNT(*) + 1
             FROM leaderboard_entries ranked
             WHERE ranked.score > entry.score
                OR (ranked.score = entry.score AND ranked.duration_ms < entry.duration_ms)
                OR (
                  ranked.score = entry.score
                  AND ranked.duration_ms = entry.duration_ms
                  AND ranked.completed_at < entry.completed_at
                )
                OR (
                  ranked.score = entry.score
                  AND ranked.duration_ms = entry.duration_ms
                  AND ranked.completed_at = entry.completed_at
                  AND ranked.run_id < entry.run_id
                )
           ) AS rank
         FROM leaderboard_entries entry
         WHERE entry.run_id = ?`,
      )
      .bind(submission.runId)
      .first<D1LeaderboardRow>();
    if (!row) throw new Error("Leaderboard entry was not stored.");
    return toEntry(row);
  }
}
