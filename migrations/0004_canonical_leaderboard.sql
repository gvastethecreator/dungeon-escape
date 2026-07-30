-- Reconcile the current Hall contract without dropping chosen portraits.
-- D1 reaches this after 0002/0003; the local SQLite bootstrap may reach it
-- directly from the legacy 0001 shape.

CREATE TABLE leaderboard_entries_v4 (
  run_id TEXT PRIMARY KEY NOT NULL,
  player_name TEXT NOT NULL CHECK(length(player_name) BETWEEN 1 AND 20),
  score INTEGER NOT NULL CHECK(score > 0),
  score_version INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL CHECK(duration_ms >= 1000),
  distance_m INTEGER NOT NULL CHECK(distance_m >= 0),
  stones_found INTEGER NOT NULL CHECK(stones_found = 4),
  biome TEXT NOT NULL,
  seed TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  difficulty_value REAL NOT NULL CHECK(difficulty_value BETWEEN 0 AND 1),
  room_count INTEGER NOT NULL CHECK(room_count BETWEEN 8 AND 80),
  portrait_index INTEGER CHECK(portrait_index IS NULL OR portrait_index BETWEEN 0 AND 71),
  storage_source TEXT NOT NULL DEFAULT 'local',
  completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO leaderboard_entries_v4 (
  run_id, player_name, score, score_version, duration_ms, distance_m,
  stones_found, biome, seed, difficulty, difficulty_value, room_count,
  portrait_index, storage_source, completed_at
)
SELECT
  run_id, player_name, score, score_version, duration_ms, distance_m,
  stones_found, biome, seed, difficulty, difficulty_value, room_count,
  portrait_index, storage_source, completed_at
FROM leaderboard_entries;

DROP TABLE leaderboard_entries;

ALTER TABLE leaderboard_entries_v4 RENAME TO leaderboard_entries;

CREATE INDEX IF NOT EXISTS leaderboard_rank_idx
  ON leaderboard_entries(score DESC, duration_ms ASC, completed_at ASC, run_id ASC);

CREATE INDEX IF NOT EXISTS leaderboard_player_idx
  ON leaderboard_entries(player_name, score DESC);
