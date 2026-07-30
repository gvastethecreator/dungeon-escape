import type { LeaderboardEntry, PlayerBiomeStars, ValidLeaderboardSubmission } from "./contract";

export type HallStorageSource = "local" | "test" | "d1";
export type HallSqlBinding = string | number | null;

export interface HallEntryRow {
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

export interface HallBiomeStarRow {
  player_name: string;
  biome: string;
  stars: number | string;
}

interface HallStatements {
  readonly list: string;
  readonly listBiomeStars: string;
  readonly create: string;
  readonly createdEntry: string;
}

export interface HallPersistenceContract {
  readonly statements: HallStatements;
  createBindings(
    submission: ValidLeaderboardSubmission,
    storageSource: HallStorageSource,
  ): readonly HallSqlBinding[];
  list(rows: readonly HallEntryRow[]): LeaderboardEntry[];
  listBiomeStars(rows: readonly HallBiomeStarRow[]): PlayerBiomeStars;
  create(row: HallEntryRow | null): LeaderboardEntry;
}

const ENTRY_COLUMNS = [
  "run_id",
  "player_name",
  "score",
  "score_version",
  "duration_ms",
  "distance_m",
  "stones_found",
  "biome",
  "seed",
  "difficulty",
  "difficulty_value",
  "room_count",
  "portrait_index",
  "completed_at",
] as const;

const RANK_ORDER = [
  { column: "score", direction: "DESC" },
  { column: "duration_ms", direction: "ASC" },
  { column: "completed_at", direction: "ASC" },
  { column: "run_id", direction: "ASC" },
] as const;

function columnList(alias?: string): string {
  const prefix = alias ? `${alias}.` : "";
  return ENTRY_COLUMNS.map((column) => `${prefix}${column}`).join(",\n           ");
}

function rankOrder(alias?: string): string {
  const prefix = alias ? `${alias}.` : "";
  return RANK_ORDER.map(({ column, direction }) => `${prefix}${column} ${direction}`).join(", ");
}

function rankPrecedence(candidateAlias: string, entryAlias: string): string {
  return RANK_ORDER.map(({ column, direction }, index) => {
    const equalEarlierTerms = RANK_ORDER.slice(0, index).map(
      (term) => `${candidateAlias}.${term.column} = ${entryAlias}.${term.column}`,
    );
    const comparison = `${candidateAlias}.${column} ${direction === "DESC" ? ">" : "<"} ${entryAlias}.${column}`;
    return `(${[...equalEarlierTerms, comparison].join(" AND ")})`;
  }).join("\n                OR ");
}

const statements: HallStatements = {
  list: `SELECT
           ${columnList()},
           ROW_NUMBER() OVER (ORDER BY ${rankOrder()}) AS rank
         FROM leaderboard_entries
         ORDER BY ${rankOrder()}
         LIMIT ?`,
  listBiomeStars: `SELECT player_name, biome, COUNT(*) AS stars
         FROM leaderboard_entries
         GROUP BY player_name, biome`,
  create: `INSERT OR IGNORE INTO leaderboard_entries (
           run_id, player_name, score, score_version, duration_ms, distance_m,
           stones_found, biome, seed, difficulty, difficulty_value, room_count, portrait_index, storage_source
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  createdEntry: `SELECT
           ${columnList("entry")},
           (
             SELECT COUNT(*) + 1
             FROM leaderboard_entries ranked
             WHERE ${rankPrecedence("ranked", "entry")}
           ) AS rank
         FROM leaderboard_entries entry
         WHERE entry.run_id = ?`,
};

function toEntry(row: HallEntryRow): LeaderboardEntry {
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

export const hallPersistence: HallPersistenceContract = {
  statements,

  createBindings(submission, storageSource) {
    return [
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
      storageSource,
    ];
  },

  list(rows) {
    return rows.map(toEntry);
  },

  listBiomeStars(rows) {
    const stars: PlayerBiomeStars = Object.create(null) as PlayerBiomeStars;
    for (const row of rows) {
      const player = Object.hasOwn(stars, row.player_name)
        ? stars[row.player_name]!
        : (stars[row.player_name] = Object.create(null) as Record<string, number>);
      player[row.biome] = Number(row.stars) || 0;
    }
    return stars;
  },

  create(row) {
    if (!row) throw new Error("Leaderboard entry was not stored.");
    return toEntry(row);
  },
};
