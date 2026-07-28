import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type {
  LeaderboardEntry,
  PlayerBiomeStars,
  ValidLeaderboardSubmission,
} from "../../src/leaderboard/contract";
import type { LeaderboardRepository } from "../../src/leaderboard/repository";

interface LeaderboardRow {
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
  completed_at
`;

const QUALIFIED_SELECT_FIELDS = `
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
  entry.completed_at
`;

function toEntry(row: LeaderboardRow): LeaderboardEntry {
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
    completedAt: row.completed_at,
    rank: row.rank,
  };
}

export interface SqliteLeaderboardOptions {
  databasePath?: string;
  migrationPath?: string;
  storageSource?: "local" | "test";
}

interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

interface SqliteDatabase {
  exec(source: string): unknown;
  prepare(source: string): SqliteStatement;
  close(): void;
}

async function openDatabase(path: string): Promise<SqliteDatabase> {
  if (process.versions.bun) {
    const moduleName = "bun:sqlite";
    const { Database } = (await import(moduleName)) as {
      Database: new (
        filename: string,
        options?: { create?: boolean },
      ) => {
        exec(source: string): unknown;
        query(source: string): SqliteStatement;
        close(): void;
      };
    };
    const database = new Database(path, { create: true });
    return {
      exec: (source) => database.exec(source),
      prepare: (source) => database.query(source),
      close: () => database.close(),
    };
  }
  const moduleName = "node:sqlite";
  const { DatabaseSync } = (await import(moduleName)) as {
    DatabaseSync: new (filename: string) => SqliteDatabase;
  };
  return new DatabaseSync(path);
}

export class SqliteLeaderboardRepository implements LeaderboardRepository {
  private constructor(
    private readonly database: SqliteDatabase,
    private readonly storageSource: "local" | "test",
  ) {}

  static async open(options: SqliteLeaderboardOptions = {}): Promise<SqliteLeaderboardRepository> {
    const databasePath = resolve(
      options.databasePath ?? process.env.DUNGEON_LEADERBOARD_DB ?? ".data/dungeon-escape.sqlite",
    );
    if (databasePath !== resolve(":memory:")) mkdirSync(dirname(databasePath), { recursive: true });
    const database = await openDatabase(
      options.databasePath === ":memory:" ? ":memory:" : databasePath,
    );
    const repository = new SqliteLeaderboardRepository(database, options.storageSource ?? "local");
    database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    if (options.databasePath !== ":memory:") database.exec("PRAGMA journal_mode = WAL;");
    const migrationPath = resolve(options.migrationPath ?? "migrations/0001_leaderboard.sql");
    database.exec(readFileSync(migrationPath, "utf8"));
    return repository;
  }

  async list(limit: number): Promise<LeaderboardEntry[]> {
    const rows = this.database
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
      .all(limit) as LeaderboardRow[];
    return rows.map(toEntry);
  }

  async listBiomeStars(): Promise<PlayerBiomeStars> {
    const rows = this.database
      .prepare(
        `SELECT player_name AS playerName, biome, COUNT(*) AS stars
         FROM leaderboard_entries
         GROUP BY player_name, biome`,
      )
      .all() as Array<{ playerName: string; biome: string; stars: number }>;
    const map: PlayerBiomeStars = {};
    for (const row of rows) {
      const player = map[row.playerName] ?? (map[row.playerName] = {});
      player[row.biome] = Number(row.stars) || 0;
    }
    return map;
  }

  async create(submission: ValidLeaderboardSubmission): Promise<LeaderboardEntry> {
    this.database
      .prepare(
        `INSERT OR IGNORE INTO leaderboard_entries (
           run_id, player_name, score, score_version, duration_ms, distance_m,
           stones_found, biome, seed, difficulty, difficulty_value, room_count, storage_source
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
        this.storageSource,
      );

    const row = this.database
      .prepare(
        `SELECT
           ${QUALIFIED_SELECT_FIELDS},
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
      .get(submission.runId) as LeaderboardRow | null;
    if (!row) throw new Error("Leaderboard entry was not stored.");
    return toEntry(row);
  }

  close(): void {
    this.database.close();
  }
}
