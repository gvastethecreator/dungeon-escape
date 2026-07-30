import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type {
  LeaderboardEntry,
  PlayerBiomeStars,
  ValidLeaderboardSubmission,
} from "../../src/leaderboard/contract.ts";
import {
  hallPersistence,
  type HallBiomeStarRow,
  type HallEntryRow,
} from "../../src/leaderboard/hallPersistence.ts";
import type { LeaderboardRepository } from "../../src/leaderboard/repository.ts";

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

const CANONICAL_MIGRATION_PATH = "migrations/0004_canonical_leaderboard.sql";

function hasCanonicalRoomFloor(database: SqliteDatabase): boolean {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get("leaderboard_entries") as { sql?: unknown } | null;
  return (
    typeof row?.sql === "string" &&
    /room_count\s+INTEGER[^,]*BETWEEN\s+8\s+AND\s+80/i.test(row.sql)
  );
}

function applyCanonicalMigration(database: SqliteDatabase, source: string): void {
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(source);
    database.exec("COMMIT;");
  } catch (error) {
    try {
      database.exec("ROLLBACK;");
    } catch {
      // Keep the original migration failure when rollback cannot run.
    }
    throw error;
  }
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
    try {
      database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
      if (options.databasePath !== ":memory:") database.exec("PRAGMA journal_mode = WAL;");
      const migrationPath = resolve(options.migrationPath ?? "migrations/0001_leaderboard.sql");
      database.exec(readFileSync(migrationPath, "utf8"));
      try {
        database.exec("ALTER TABLE leaderboard_entries ADD COLUMN portrait_index INTEGER;");
      } catch {
        // Column already exists.
      }
      if (options.migrationPath === undefined && !hasCanonicalRoomFloor(database)) {
        applyCanonicalMigration(
          database,
          readFileSync(resolve(CANONICAL_MIGRATION_PATH), "utf8"),
        );
      }
      return new SqliteLeaderboardRepository(database, options.storageSource ?? "local");
    } catch (error) {
      try {
        database.close();
      } catch {
        // Preserve the initialization error if close also fails.
      }
      throw error;
    }
  }

  async list(limit: number): Promise<LeaderboardEntry[]> {
    const rows = this.database
      .prepare(hallPersistence.statements.list)
      .all(limit) as HallEntryRow[];
    return hallPersistence.list(rows);
  }

  async listBiomeStars(): Promise<PlayerBiomeStars> {
    const rows = this.database
      .prepare(hallPersistence.statements.listBiomeStars)
      .all() as HallBiomeStarRow[];
    return hallPersistence.listBiomeStars(rows);
  }

  async create(submission: ValidLeaderboardSubmission): Promise<LeaderboardEntry> {
    this.database
      .prepare(hallPersistence.statements.create)
      .run(...hallPersistence.createBindings(submission, this.storageSource));

    const row = this.database
      .prepare(hallPersistence.statements.createdEntry)
      .get(submission.runId) as HallEntryRow | null;
    return hallPersistence.create(row);
  }

  close(): void {
    this.database.close();
  }
}
