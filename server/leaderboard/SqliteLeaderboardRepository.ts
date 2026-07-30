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
    try {
      database.exec("ALTER TABLE leaderboard_entries ADD COLUMN portrait_index INTEGER;");
    } catch {
      // Column already exists.
    }
    return repository;
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
