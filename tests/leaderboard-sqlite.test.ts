import { afterEach, describe, expect, test } from "bun:test";

import { parseLeaderboardSubmission } from "../src/leaderboard/contract";
import { SqliteLeaderboardRepository } from "../server/leaderboard/SqliteLeaderboardRepository";

const openRepositories: SqliteLeaderboardRepository[] = [];

async function repository(): Promise<SqliteLeaderboardRepository> {
  const store = await SqliteLeaderboardRepository.open({
    databasePath: ":memory:",
    storageSource: "test",
  });
  openRepositories.push(store);
  return store;
}

function submission(runId: string, playerName: string, durationMs: number) {
  const parsed = parseLeaderboardSubmission({
    runId,
    playerName,
    durationMs,
    distanceM: 320,
    stonesFound: 4,
    biome: "Molten",
    seed: "LEADERBOARD-TEST",
    difficultyValue: 0.5,
    roomCount: 28,
  });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.value;
}

afterEach(() => {
  for (const store of openRepositories.splice(0)) store.close();
});

describe("local SQLite leaderboard", () => {
  test("persists entries and ranks score then time", async () => {
    const store = await repository();
    await store.create(submission("run_slow_0001", "Slow Ash", 360_000));
    const fast = await store.create(submission("run_fast_0001", "Fast Ash", 180_000));
    const entries = await store.list(10);

    expect(fast.rank).toBe(1);
    expect(entries.map((entry) => entry.playerName)).toEqual(["Fast Ash", "Slow Ash"]);
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2]);
  });

  test("uses run id as an idempotency key", async () => {
    const store = await repository();
    const first = await store.create(submission("run_once_0001", "First Name", 180_000));
    const repeated = await store.create(submission("run_once_0001", "Changed Name", 120_000));

    expect(repeated.playerName).toBe(first.playerName);
    expect(await store.list(10)).toHaveLength(1);
  });

  test("aggregates biome stars from every saved escape", async () => {
    const store = await repository();
    await store.create(submission("run_star_a1", "Star Runner", 180_000));
    await store.create({
      ...submission("run_star_a2", "Star Runner", 200_000),
      biome: "Frost",
    });
    await store.create({
      ...submission("run_star_a3", "Star Runner", 190_000),
      biome: "Molten",
    });
    await store.create(submission("run_star_b1", "Other", 210_000));

    const stars = await store.listBiomeStars();
    expect(stars["Star Runner"]).toEqual({ Molten: 2, Frost: 1 });
    expect(stars.Other).toEqual({ Molten: 1 });
  });

  test("persists and returns custom chosen portraitIndex", async () => {
    const store = await repository();
    const entry = await store.create({
      ...submission("run_portrait_001", "Custom Avatar", 180_000),
      portraitIndex: 12,
    });

    expect(entry.portraitIndex).toBe(12);

    const entries = await store.list(10);
    expect(entries[0]!.portraitIndex).toBe(12);
  });
});
