import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseLeaderboardSubmission } from "../src/leaderboard/contract";
import { SqliteLeaderboardRepository } from "../server/leaderboard/SqliteLeaderboardRepository";

const openRepositories: SqliteLeaderboardRepository[] = [];
const temporaryDirectories: string[] = [];

async function repository(): Promise<SqliteLeaderboardRepository> {
  const store = await SqliteLeaderboardRepository.open({
    databasePath: ":memory:",
    storageSource: "test",
  });
  openRepositories.push(store);
  return store;
}

function submission(runId: string, playerName: string, durationMs: number, roomCount = 28) {
  const parsed = parseLeaderboardSubmission({
    runId,
    playerName,
    durationMs,
    distanceM: 320,
    stonesFound: 4,
    biome: "Molten",
    seed: "LEADERBOARD-TEST",
    difficultyValue: 0.5,
    roomCount,
  });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.value;
}

afterEach(() => {
  for (const store of openRepositories.splice(0)) store.close();
  for (const directory of temporaryDirectories.splice(0)) {
    if (!directory.startsWith(tmpdir())) throw new Error(`Refusing to remove ${directory}.`);
    rmSync(directory, { recursive: true, force: true });
  }
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

  test("applies the canonical local migration for minimum and Ancient room counts", async () => {
    const store = await repository();

    const minimum = await store.create(submission("run_rooms_0008", "Eight Rooms", 180_000, 8));
    const ancient = await store.create(submission("run_rooms_0010", "Ancient Rooms", 180_000, 10));

    expect(minimum.roomCount).toBe(8);
    expect(ancient.roomCount).toBe(10);
  });

  test("preserves chosen portraits while upgrading a legacy local schema", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dungeon-leaderboard-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "hall.sqlite");
    const first = await SqliteLeaderboardRepository.open({
      databasePath,
      migrationPath: "migrations/0001_leaderboard.sql",
      storageSource: "test",
    });
    openRepositories.push(first);
    const created = await first.create({
      ...submission("run_reopen_0028", "Reopen Runner", 180_000, 28),
      portraitIndex: 12,
    });
    expect(created.portraitIndex).toBe(12);
    first.close();
    openRepositories.splice(openRepositories.indexOf(first), 1);

    const reopened = await SqliteLeaderboardRepository.open({
      databasePath,
      storageSource: "test",
    });
    openRepositories.push(reopened);
    const minimum = await reopened.create(
      submission("run_reopen_0008", "Minimum Runner", 180_000, 8),
    );
    expect(minimum.roomCount).toBe(8);
    expect(await reopened.list(10)).toContainEqual(
      expect.objectContaining({ runId: "run_reopen_0028", roomCount: 28, portraitIndex: 12 }),
    );
  });

  test("closes a newly opened database when initialization fails", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dungeon-leaderboard-failed-open-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "failed.sqlite");

    await expect(
      SqliteLeaderboardRepository.open({
        databasePath,
        migrationPath: join(directory, "missing-migration.sql"),
        storageSource: "test",
      }),
    ).rejects.toThrow();

    expect(() => rmSync(databasePath)).not.toThrow();
  });
});
