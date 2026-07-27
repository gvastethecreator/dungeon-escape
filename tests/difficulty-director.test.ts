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
  test("standard fills five of every six rooms before later waves", () => {
    const start = resolveDifficultySnapshot(0.5, 0, 42, 0, 110);
    const minute = resolveDifficultySnapshot(0.5, 60, 42, 53, 57);
    const late = resolveDifficultySnapshot(0.5, 900, 42, 53, 57);

    expect(start.label).toBe("STANDARD");
    expect(start.initialOccupiedRooms).toBe(35);
    expect(start.initialEnemies).toBe(53);
    expect(start.targetEnemies).toBe(53);
    expect(start.maxEnemies).toBe(92);
    expect(start.waveSeconds).toBe(30);
    expect(minute.targetEnemies).toBe(59);
    expect(late.targetEnemies).toBe(92);
    expect(late.targetEnemies).toBeLessThanOrEqual(128);
  });

  test("map size scales both opening occupation and the later cap", () => {
    const small = resolveDifficultySnapshot(0.5, 600, 12, 0, 128);
    const large = resolveDifficultySnapshot(0.5, 600, 42, 0, 128);
    expect(small.initialOccupiedRooms).toBe(10);
    expect(small.initialEnemies).toBe(15);
    expect(large.initialEnemies).toBe(53);
    expect(small.maxEnemies).toBeLessThan(large.maxEnemies);
    expect(small.maxEnemies).toBe(26);
    expect(large.maxEnemies).toBe(92);
  });

  test("difficulty changes how many occupied rooms begin with a second enemy", () => {
    const merciful = resolveDifficultyTuning(0, 42, 128);
    const relentless = resolveDifficultyTuning(1, 42, 128);

    expect(merciful.initialOccupiedRooms).toBe(35);
    expect(relentless.initialOccupiedRooms).toBe(35);
    expect(merciful.initialEnemies).toBe(44);
    expect(relentless.initialEnemies).toBe(61);
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
