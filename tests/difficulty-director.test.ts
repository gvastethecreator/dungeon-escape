import { describe, expect, test } from "bun:test";

import {
  DEFAULT_WAVE_SECONDS,
  ENEMY_DANGER_TIER,
  ENEMY_HARD_CAP,
  LEVEL_EVERY_WAVES,
  difficultyLabel,
  enemyDangerScore,
  enemyUnlockSeconds,
  formatRunClock,
  isEnemyKindUnlocked,
  resolveDifficultySnapshot,
  resolveDifficultyTuning,
  resolveEnemiesPerWave,
} from "../src/game/DifficultyDirector";

describe("progressive difficulty director", () => {
  test("standard fills five of every six rooms before later waves", () => {
    const start = resolveDifficultySnapshot(0.5, 0, 42, 0, 200);
    const firstWave = resolveDifficultySnapshot(0.5, DEFAULT_WAVE_SECONDS, 42, 53, 147);
    const minute = resolveDifficultySnapshot(0.5, 60, 42, 53, 147);
    const late = resolveDifficultySnapshot(0.5, 900, 42, 53, 147);
    const perWave = resolveEnemiesPerWave(42, 0.5);

    expect(start.label).toBe("STANDARD");
    expect(start.initialOccupiedRooms).toBe(35);
    expect(start.initialEnemies).toBe(53);
    expect(start.targetEnemies).toBe(53);
    expect(start.enemiesPerWave).toBe(perWave);
    expect(start.maxEnemies).toBeLessThanOrEqual(ENEMY_HARD_CAP);
    expect(start.waveSeconds).toBe(25);
    expect(firstWave.targetEnemies).toBe(53 + perWave);
    // ~1 enemy per room each pulse: after a minute a couple of full room waves land.
    expect(minute.targetEnemies).toBe(
      Math.min(start.maxEnemies, 53 + Math.floor(60 / DEFAULT_WAVE_SECONDS) * perWave),
    );
    expect(late.targetEnemies).toBe(start.maxEnemies);
    expect(late.targetEnemies).toBeLessThanOrEqual(ENEMY_HARD_CAP);
  });

  test("map size scales opening occupation, pulse size, and the later cap", () => {
    const small = resolveDifficultySnapshot(0.5, 600, 12, 0, 200);
    const large = resolveDifficultySnapshot(0.5, 600, 42, 0, 200);
    expect(small.initialOccupiedRooms).toBe(10);
    expect(small.initialEnemies).toBe(15);
    expect(large.initialEnemies).toBe(53);
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
    expect(merciful.initialEnemies).toBe(44);
    expect(relentless.initialEnemies).toBe(61);
    expect(merciful.waveSeconds).toBe(25);
    expect(relentless.waveSeconds).toBe(25);
    expect(merciful.enemiesPerWave).toBeLessThan(relentless.enemiesPerWave);
    // Large maps often share the hard instancing cap; smaller maps still diverge.
    const mercifulSmall = resolveDifficultyTuning(0, 12, 200);
    const relentlessSmall = resolveDifficultyTuning(1, 12, 200);
    expect(relentlessSmall.maxEnemies).toBeGreaterThan(mercifulSmall.maxEnemies);
    expect(relentless.safeSpawnDistance).toBeGreaterThanOrEqual(13);
    expect(difficultyLabel(0.5)).toBe("STANDARD");
  });

  test("pressure and families unlock every two reinforcement pulses", () => {
    const tuning = resolveDifficultyTuning(0.5, 42, 200);
    const wave = tuning.waveSeconds;
    const beforeLevel = resolveDifficultySnapshot(0.5, wave * LEVEL_EVERY_WAVES - 0.01, 42, 0, 200);
    const atLevel = resolveDifficultySnapshot(0.5, wave * LEVEL_EVERY_WAVES, 42, 0, 200);

    expect(LEVEL_EVERY_WAVES).toBe(2);
    expect(beforeLevel.pressureLevel).toBe(1);
    expect(atLevel.pressureLevel).toBe(2);
    expect(enemyUnlockSeconds("ratling", tuning)).toBe(0);
    expect(isEnemyKindUnlocked("ratling", 0, tuning)).toBe(true);
    expect(isEnemyKindUnlocked("goblin", 0, tuning)).toBe(false);
    // Phase 1 unlocks after two reinforcement pulses at standard danger scale.
    expect(enemyUnlockSeconds("goblin", tuning)).toBe(wave * 2);
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
