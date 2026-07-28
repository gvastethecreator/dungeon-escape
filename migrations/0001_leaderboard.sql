CREATE TABLE IF NOT EXISTS leaderboard_entries (
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
  room_count INTEGER NOT NULL CHECK(room_count BETWEEN 12 AND 80),
  portrait_index INTEGER CHECK(portrait_index IS NULL OR portrait_index BETWEEN 0 AND 71),
  storage_source TEXT NOT NULL DEFAULT 'local',
  completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS leaderboard_rank_idx
  ON leaderboard_entries(score DESC, duration_ms ASC, completed_at ASC, run_id ASC);

CREATE INDEX IF NOT EXISTS leaderboard_player_idx
  ON leaderboard_entries(player_name, score DESC);
