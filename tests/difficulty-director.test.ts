import { describe, expect, test } from "bun:test";

import {
  DEFAULT_WAVE_SECONDS,
  ENEMY_DANGER_TIER,
  ENEMY_HARD_CAP,
  LEVEL_EVERY_WAVES,
  difficultyLabel,
  enemyDangerScore,
  enemyUnlockSeconds,
  enemyUnlockWave,
  formatRunClock,
  isEnemyKindUnlocked,
  progressWaves,
  resolveDifficultySnapshot,
  resolveDifficultyTuning,
  resolveEnemiesPerWave,
  stoneEnemyPressureBonus,
  unlockedMaxTierForWaves,
} from "../src/game/DifficultyDirector";

describe("progressive difficulty director", () => {
  test("standard fills five of every six rooms before later waves", () => {
    const start = resolveDifficultySnapshot(0.5, 0, 42, 0, 200);
    const firstWave = resolveDifficultySnapshot(0.5, DEFAULT_WAVE_SECONDS, 42, 57, 143);
    const minute = resolveDifficultySnapshot(0.5, 60, 42, 53, 147);
    const late = resolveDifficultySnapshot(0.5, 900, 42, 53, 147);
    const perWave = resolveEnemiesPerWave(42, 0.5);

    expect(start.label).toBe("STANDARD");
    expect(start.initialOccupiedRooms).toBe(35);
    expect(start.initialEnemies).toBe(57);
    expect(start.targetEnemies).toBe(57);
    expect(start.enemiesPerWave).toBe(perWave);
    expect(start.maxEnemies).toBeLessThanOrEqual(ENEMY_HARD_CAP);
    expect(start.waveSeconds).toBe(25);
    expect(firstWave.targetEnemies).toBe(57 + perWave);
    expect(minute.targetEnemies).toBe(
      Math.min(start.maxEnemies, 57 + Math.floor(60 / DEFAULT_WAVE_SECONDS) * perWave),
    );
    expect(late.targetEnemies).toBe(start.maxEnemies);
    expect(late.targetEnemies).toBeLessThanOrEqual(ENEMY_HARD_CAP);
  });

  test("map size scales opening occupation, pulse size, and the later cap", () => {
    const small = resolveDifficultySnapshot(0.5, 600, 12, 0, 200);
    const large = resolveDifficultySnapshot(0.5, 600, 42, 0, 200);
    expect(small.initialOccupiedRooms).toBe(10);
    expect(small.initialEnemies).toBe(16);
    expect(large.initialEnemies).toBe(57);
    expect(small.enemiesPerWave).toBe(resolveEnemiesPerWave(12, 0.5));
    expect(large.enemiesPerWave).toBe(resolveEnemiesPerWave(42, 0.5));
    expect(small.enemiesPerWave).toBeLessThan(large.enemiesPerWave);
    expect(small.maxEnemies).toBeLessThan(large.maxEnemies);
  });

  test("difficulty changes how many occupied rooms begin with a second enemy", () => {
    const merciful = resolveDifficultyTuning(0, 42, 200);
    const relentless = resolveDifficultyTuning(1, 42, 200);

    expect(merciful.initialOccupiedRooms).toBe(35);
    expect(relentless.initialOccupiedRooms).toBe(35);
    expect(merciful.initialEnemies).toBe(47);
    expect(relentless.initialEnemies).toBe(67);
    expect(merciful.waveSeconds).toBe(25);
    expect(relentless.waveSeconds).toBe(25);
    expect(merciful.enemiesPerWave).toBeLessThan(relentless.enemiesPerWave);
    const mercifulSmall = resolveDifficultyTuning(0, 12, 200);
    const relentlessSmall = resolveDifficultyTuning(1, 12, 200);
    expect(relentlessSmall.maxEnemies).toBeGreaterThan(mercifulSmall.maxEnemies);
    expect(relentless.safeSpawnDistance).toBeGreaterThanOrEqual(11);
    expect(difficultyLabel(0.5)).toBe("STANDARD");
  });

  test("unlocks a new danger band every 25-second wave", () => {
    const tuning = resolveDifficultyTuning(0.5, 42, 200);
    const wave = tuning.waveSeconds;

    expect(LEVEL_EVERY_WAVES).toBe(1);
    expect(wave).toBe(25);
    expect(enemyUnlockWave("ratling")).toBe(0);
    expect(enemyUnlockWave("goblin")).toBe(1);
    expect(enemyUnlockWave("bone-slime")).toBe(2);
    expect(enemyUnlockWave("husk")).toBe(3);
    expect(enemyUnlockWave("zombie-orc")).toBe(4);
    expect(enemyUnlockSeconds("goblin", tuning)).toBe(wave);

    expect(isEnemyKindUnlocked("ratling", 0, tuning)).toBe(true);
    expect(isEnemyKindUnlocked("goblin", 0, tuning)).toBe(false);
    expect(isEnemyKindUnlocked("goblin", wave, tuning)).toBe(true);
    expect(isEnemyKindUnlocked("zombie-orc", wave * 3, tuning)).toBe(false);
    expect(isEnemyKindUnlocked("zombie-orc", wave * 4, tuning)).toBe(true);

    // Binding a stone counts as one wave of unlock progress immediately.
    expect(isEnemyKindUnlocked("goblin", 0, tuning, 1)).toBe(true);
    expect(isEnemyKindUnlocked("bone-slime", 0, tuning, 2)).toBe(true);

    expect(unlockedMaxTierForWaves(0)).toBe(0);
    expect(unlockedMaxTierForWaves(1)).toBe(1);
    expect(unlockedMaxTierForWaves(4)).toBe(4);
    expect(progressWaves(wave * 2, wave, 1)).toBe(3);

    const before = resolveDifficultySnapshot(0.5, wave - 0.01, 42, 0, 200);
    const atWave = resolveDifficultySnapshot(0.5, wave, 42, 0, 200);
    expect(before.pressureLevel).toBe(1);
    expect(atWave.pressureLevel).toBe(2);
    expect(atWave.unlockedMaxTier).toBe(1);
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

  test("each bound magic stone raises the active enemy target by one wave", () => {
    const base = resolveDifficultySnapshot(0.5, 0, 42, 0, 200, 0);
    const one = resolveDifficultySnapshot(0.5, 0, 42, 0, 200, 1);
    const four = resolveDifficultySnapshot(0.5, 0, 42, 0, 200, 4);
    const perWave = resolveEnemiesPerWave(42, 0.5);

    expect(stoneEnemyPressureBonus(1, perWave)).toBe(perWave);
    expect(stoneEnemyPressureBonus(4, perWave)).toBe(perWave * 4);
    expect(one.targetEnemies).toBe(base.targetEnemies + perWave);
    expect(four.targetEnemies).toBe(Math.min(base.maxEnemies, base.targetEnemies + perWave * 4));
  });
});
