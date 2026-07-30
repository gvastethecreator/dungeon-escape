import { describe, expect, test } from "bun:test";

import { hallPersistence, type HallEntryRow } from "../src/leaderboard/hallPersistence";

const ROW: HallEntryRow = {
  run_id: "run_shared_0001",
  player_name: "Shared Runner",
  score: 123_456,
  score_version: 1,
  duration_ms: 180_000,
  distance_m: 320,
  stones_found: 4,
  biome: "Molten",
  seed: "SHARED-SEED",
  difficulty: "STANDARD",
  difficulty_value: 0.5,
  room_count: 28,
  portrait_index: 0,
  completed_at: "2026-07-30T12:00:00.000Z",
  rank: 3,
};

describe("Hall persistence contract", () => {
  test("maps the canonical persisted row without recomputing trusted fields", () => {
    expect(hallPersistence.list([ROW])).toEqual([
      {
        runId: "run_shared_0001",
        playerName: "Shared Runner",
        score: 123_456,
        scoreVersion: 1,
        durationMs: 180_000,
        distanceM: 320,
        stonesFound: 4,
        biome: "Molten",
        seed: "SHARED-SEED",
        difficulty: "STANDARD",
        difficultyValue: 0.5,
        roomCount: 28,
        portraitIndex: 0,
        completedAt: "2026-07-30T12:00:00.000Z",
        rank: 3,
      },
    ]);
  });

  test("omits an absent portrait and preserves the shared rank order", () => {
    const [entry] = hallPersistence.list([{ ...ROW, portrait_index: null }]);

    expect(entry).not.toHaveProperty("portraitIndex");
    expect(hallPersistence.statements.list).toContain(
      "ORDER BY score DESC, duration_ms ASC, completed_at ASC, run_id ASC",
    );
    expect(hallPersistence.statements.createdEntry).toContain("ranked.score > entry.score");
    expect(hallPersistence.statements.createdEntry).toContain("ranked.run_id < entry.run_id");
  });

  test("owns insert binding order including optional portrait and storage source", () => {
    expect(
      hallPersistence.createBindings(
        {
          runId: ROW.run_id,
          playerName: ROW.player_name,
          score: ROW.score,
          scoreVersion: 1,
          durationMs: ROW.duration_ms,
          distanceM: ROW.distance_m,
          stonesFound: 4,
          biome: ROW.biome,
          seed: ROW.seed,
          difficulty: ROW.difficulty,
          difficultyValue: ROW.difficulty_value,
          roomCount: ROW.room_count,
        },
        "d1",
      ),
    ).toEqual([
      "run_shared_0001",
      "Shared Runner",
      123_456,
      1,
      180_000,
      320,
      4,
      "Molten",
      "SHARED-SEED",
      "STANDARD",
      0.5,
      28,
      null,
      "d1",
    ]);
  });

  test("folds biome stars safely for player names that match object properties", () => {
    const stars = hallPersistence.listBiomeStars([
      { player_name: "constructor", biome: "Molten", stars: 2 },
      { player_name: "Other", biome: "Frost", stars: "1" },
    ]);

    expect(Object.getPrototypeOf(stars)).toBeNull();
    expect(Object.hasOwn(stars, "constructor")).toBe(true);
    expect(stars["constructor"]).toEqual({ Molten: 2 });
    expect(stars.Other).toEqual({ Frost: 1 });
  });

  test("keeps the existing failure when an inserted row cannot be read back", () => {
    expect(() => hallPersistence.create(null)).toThrow("Leaderboard entry was not stored.");
  });
});
