import { describe, expect, test } from "bun:test";

import {
  ENEMY_DANGER_TIER,
  difficultyLabel,
  enemyDangerScore,
  enemyUnlockSeconds,
  formatRunClock,
  isEnemyKindUnlocked,
  resolveDifficultySnapshot,
  resolveDifficultyTuning,
} from "../src/game/DifficultyDirector";

describe("progressive difficulty director", () => {
  test("standard starts sparse and reaches a bounded large-map cap", () => {
    const start = resolveDifficultySnapshot(0.5, 0, 42, 0, 53);
    const minute = resolveDifficultySnapshot(0.5, 60, 42, 3, 50);
    const late = resolveDifficultySnapshot(0.5, 900, 42, 3, 50);

    expect(start.label).toBe("STANDARD");
    expect(start.initialEnemies).toBe(3);
    expect(start.targetEnemies).toBe(3);
    expect(start.maxEnemies).toBe(40);
    expect(start.waveSeconds).toBe(30);
    expect(minute.targetEnemies).toBe(9);
    expect(late.targetEnemies).toBe(40);
    expect(late.targetEnemies).toBeLessThanOrEqual(72);
  });

  test("map size scales the cap without crowding the opening", () => {
    const small = resolveDifficultySnapshot(0.5, 600, 12, 0, 64);
    const large = resolveDifficultySnapshot(0.5, 600, 42, 0, 64);
    expect(small.initialEnemies).toBe(large.initialEnemies);
    expect(small.maxEnemies).toBeLessThan(large.maxEnemies);
    expect(small.maxEnemies).toBe(15);
    expect(large.maxEnemies).toBe(40);
  });

  test("difficulty changes pace and cap without making the opening crowded", () => {
    const merciful = resolveDifficultyTuning(0, 42, 60);
    const relentless = resolveDifficultyTuning(1, 42, 60);

    expect(merciful.initialEnemies).toBe(2);
    expect(relentless.initialEnemies).toBe(4);
    expect(merciful.waveSeconds).toBe(30);
    expect(relentless.waveSeconds).toBe(30);
    expect(relentless.maxEnemies).toBeGreaterThan(merciful.maxEnemies);
    expect(relentless.safeSpawnDistance).toBeGreaterThanOrEqual(13);
    expect(difficultyLabel(0.5)).toBe("STANDARD");
  });

  test("enemy families unlock in readable phases", () => {
    const tuning = resolveDifficultyTuning(0.5, 42, 60);
    expect(enemyUnlockSeconds("ratling", tuning)).toBe(0);
    expect(isEnemyKindUnlocked("ratling", 0, tuning)).toBe(true);
    expect(isEnemyKindUnlocked("goblin", 0, tuning)).toBe(false);
    expect(enemyUnlockSeconds("goblin", tuning)).toBe(60);
    expect(enemyUnlockSeconds("husk", tuning)).toBeGreaterThan(enemyUnlockSeconds("ghost", tuning));
    expect(enemyUnlockSeconds("zombie-orc", tuning)).toBeGreaterThan(
      enemyUnlockSeconds("ghost", tuning),
    );
  });

  test("orders the roster by combat risk before unlocking heavy threats", () => {
    expect(ENEMY_DANGER_TIER.ratling).toBe(0);
    expect(ENEMY_DANGER_TIER["carrion-stalker"]).toBe(2);
    expect(ENEMY_DANGER_TIER.husk).toBe(3);
    expect(ENEMY_DANGER_TIER["zombie-orc"]).toBe(4);
    expect(enemyDangerScore("zombie-orc")).toBeGreaterThan(enemyDangerScore("ratling"));
  });

  test("clock is fixed-width and ignores invalid negative time", () => {
    expect(formatRunClock(-8)).toBe("00:00");
    expect(formatRunClock(65.9)).toBe("01:05");
    expect(formatRunClock(6_005)).toBe("100:05");
  });
});
