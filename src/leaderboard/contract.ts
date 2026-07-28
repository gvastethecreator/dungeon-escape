import { difficultyLabel, type DifficultyLabel } from "../game/DifficultyDirector";

export const LEADERBOARD_SCORE_VERSION = 1;
export const PLAYER_NAME_MAX_LENGTH = 20;
export const LEADERBOARD_DEFAULT_LIMIT = 8;
export const LEADERBOARD_MAX_LIMIT = 50;
/** Matches campaign generation floor (Ancient = 10 rooms; editor min target = 8). */
export const LEADERBOARD_MIN_ROOM_COUNT = 8;
export const LEADERBOARD_MAX_ROOM_COUNT = 80;

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const PLAYER_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u;
const BIOME_PATTERN = /^[A-Za-z][A-Za-z -]{1,31}$/;
const SEED_PATTERN = /^[\p{L}\p{N}._:-]{1,80}$/u;

/** Only campaign escapes may enter the Hall. Custom runs are client-play only. */
export type LeaderboardRunSource = "campaign" | "custom";

export interface LeaderboardSubmissionInput {
  runId: string;
  playerName: string;
  durationMs: number;
  distanceM: number;
  stonesFound: number;
  biome: string;
  seed: string;
  difficultyValue: number;
  roomCount: number;
  /** Required for ranked posts. Custom is always rejected. */
  runSource?: LeaderboardRunSource;
}

export interface ValidLeaderboardSubmission extends LeaderboardSubmissionInput {
  playerName: string;
  durationMs: number;
  distanceM: number;
  stonesFound: 4;
  difficultyValue: number;
  roomCount: number;
  difficulty: DifficultyLabel;
  score: number;
  scoreVersion: typeof LEADERBOARD_SCORE_VERSION;
}

export interface LeaderboardEntry extends ValidLeaderboardSubmission {
  completedAt: string;
  rank: number;
}

/** Completions per player name and biome label (one star per saved escape). */
export type PlayerBiomeStars = Record<string, Record<string, number>>;

export interface LeaderboardListResponse {
  entries: LeaderboardEntry[];
  /** Aggregate stars from every saved escape, not only the ranked page. */
  playerBiomeStars: PlayerBiomeStars;
  generatedAt: string;
}

export function emptyPlayerBiomeStars(): PlayerBiomeStars {
  return {};
}

export function totalBiomeStars(stars: Record<string, number> | undefined): number {
  if (!stars) return 0;
  return Object.values(stars).reduce((sum, value) => sum + value, 0);
}

export function starsForBiome(
  stars: Record<string, number> | undefined,
  biomeLabel: string,
): number {
  if (!stars) return 0;
  return stars[biomeLabel] ?? 0;
}

export interface LeaderboardCreateResponse {
  entry: LeaderboardEntry;
}

export interface LeaderboardErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export type LeaderboardSubmissionResult =
  | { ok: true; value: ValidLeaderboardSubmission }
  | { ok: false; code: string; message: string };

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boundedInteger(value: unknown, min: number, max: number): number | null {
  const number = finiteNumber(value);
  if (number === null || !Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

export function normalizePlayerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > PLAYER_NAME_MAX_LENGTH) return null;
  if (!PLAYER_NAME_PATTERN.test(name)) return null;
  return name;
}

/**
 * Comparable score across generated map sizes. Larger and harder maps earn
 * more points; faster escapes earn a bounded pace bonus.
 */
export function computeLeaderboardScore(input: {
  durationMs: number;
  difficultyValue: number;
  roomCount: number;
}): number {
  const durationSeconds = Math.max(1, input.durationMs / 1000);
  const difficulty = Math.min(1, Math.max(0, input.difficultyValue));
  const rooms = Math.min(
    LEADERBOARD_MAX_ROOM_COUNT,
    Math.max(LEADERBOARD_MIN_ROOM_COUNT, input.roomCount),
  );
  const targetSeconds = 60 + rooms * 5;
  const paceFactor = Math.min(1.65, Math.max(0.35, targetSeconds / durationSeconds));
  const difficultyFactor = 0.75 + difficulty * 0.5;
  const sizeFactor = Math.sqrt(rooms / 28);
  return Math.max(1, Math.round(100_000 * paceFactor * difficultyFactor * sizeFactor));
}

export function parseLeaderboardSubmission(input: unknown): LeaderboardSubmissionResult {
  if (!input || typeof input !== "object") {
    return { ok: false, code: "INVALID_BODY", message: "Run data is required." };
  }
  const data = input as Partial<LeaderboardSubmissionInput>;
  const playerName = normalizePlayerName(data.playerName);
  if (!playerName) {
    return {
      ok: false,
      code: "INVALID_NAME",
      message: `Use 1-${PLAYER_NAME_MAX_LENGTH} letters, numbers, spaces or . _ ' -`,
    };
  }
  if (typeof data.runId !== "string" || !RUN_ID_PATTERN.test(data.runId)) {
    return { ok: false, code: "INVALID_RUN", message: "Run id is invalid." };
  }
  const durationMs = boundedInteger(data.durationMs, 1_000, 86_400_000);
  if (durationMs === null) {
    return { ok: false, code: "INVALID_DURATION", message: "Run time is invalid." };
  }
  const distanceM = boundedInteger(data.distanceM, 0, 1_000_000);
  if (distanceM === null) {
    return { ok: false, code: "INVALID_DISTANCE", message: "Run distance is invalid." };
  }
  if (data.stonesFound !== 4) {
    return { ok: false, code: "INCOMPLETE_RUN", message: "Only completed escapes can rank." };
  }
  // Custom runs stay playable in the shell but never enter the Hall.
  if (data.runSource === "custom") {
    return {
      ok: false,
      code: "CUSTOM_RUN",
      message: "Custom runs do not enter the Hall of Escapes.",
    };
  }
  if (data.runSource !== undefined && data.runSource !== "campaign") {
    return { ok: false, code: "INVALID_SOURCE", message: "Run source is invalid." };
  }
  if (typeof data.biome !== "string" || !BIOME_PATTERN.test(data.biome)) {
    return { ok: false, code: "INVALID_BIOME", message: "Biome is invalid." };
  }
  if (typeof data.seed !== "string" || !SEED_PATTERN.test(data.seed)) {
    return { ok: false, code: "INVALID_SEED", message: "Seed is invalid." };
  }
  const difficultyValue = finiteNumber(data.difficultyValue);
  if (difficultyValue === null || difficultyValue < 0 || difficultyValue > 1) {
    return { ok: false, code: "INVALID_DIFFICULTY", message: "Difficulty is invalid." };
  }
  const roomCount = boundedInteger(
    data.roomCount,
    LEADERBOARD_MIN_ROOM_COUNT,
    LEADERBOARD_MAX_ROOM_COUNT,
  );
  if (roomCount === null) {
    return { ok: false, code: "INVALID_MAP", message: "Map size is invalid." };
  }
  return {
    ok: true,
    value: {
      runId: data.runId,
      playerName,
      durationMs,
      distanceM,
      stonesFound: 4,
      biome: data.biome,
      seed: data.seed,
      difficultyValue,
      roomCount,
      difficulty: difficultyLabel(difficultyValue),
      score: computeLeaderboardScore({ durationMs, difficultyValue, roomCount }),
      scoreVersion: LEADERBOARD_SCORE_VERSION,
    },
  };
}

export function leaderboardLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return LEADERBOARD_DEFAULT_LIMIT;
  return Math.min(LEADERBOARD_MAX_LIMIT, Math.max(1, parsed));
}
