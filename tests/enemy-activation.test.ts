import { describe, expect, test } from "bun:test";
import {
  filterEnemyActivationCandidates,
  preferEnemyActivationPool,
  type EnemyActivationSeat,
} from "../src/world/EnemyActivation";

function seat(
  kind: string,
  tier: number,
  x: number,
  z: number,
  startsActive = true,
): EnemyActivationSeat {
  return { kind, tier, startsActive, position: { x, y: 0, z } };
}

describe("EnemyActivation", () => {
  test("filters by mode, tier, distance, and LOS", () => {
    const reserve = [
      seat("ratling", 0, 10, 0, true),
      seat("goblin", 2, 1, 0, true),
      seat("husk", 1, 12, 0, false),
    ];
    const play = filterEnemyActivationCandidates(reserve, {
      mode: "play",
      player: { x: 0, z: 0 },
      unlockedMaxTier: 1,
      safeSpawnDistance: 4,
      minSpread: 3,
      isKindUnlocked: () => true,
      isObjectOccupied: () => false,
      hasLineOfSight: (position) => position.x === 10,
    });
    // goblin too close; ratling has LOS; husk is far enough and tier-ok but not startsActive-gated in play
    expect(play).toEqual([2]);

    const opening = filterEnemyActivationCandidates(reserve, {
      mode: "opening",
      player: { x: 0, z: 0 },
      unlockedMaxTier: 2,
      safeSpawnDistance: 4,
      minSpread: 3,
      isKindUnlocked: () => true,
      isObjectOccupied: () => false,
      hasLineOfSight: () => false,
    });
    // opening requires startsActive; husk is cold-reserve only
    expect(opening).toEqual([0, 1]);

    const resume = filterEnemyActivationCandidates(reserve, {
      mode: "resume",
      player: { x: 0, z: 0 },
      unlockedMaxTier: 2,
      safeSpawnDistance: 4,
      minSpread: 3,
      isKindUnlocked: () => true,
      isObjectOccupied: () => false,
      hasLineOfSight: () => true,
    });
    expect(resume).toEqual([0, 2]);
  });

  test("prefers newest tier with spread", () => {
    const reserve = [
      seat("ratling", 0, 0, 0),
      seat("goblin", 2, 8, 0),
      seat("husk", 2, 8.5, 0),
    ];
    const pool = preferEnemyActivationPool(
      reserve,
      [0, 1, 2],
      [],
      [{ x: 8, z: 0 }],
      2,
      3,
    );
    // index 1 is too close to pulse; newest tier that remains is index 2? 
    // 8.5 to 8 = 0.5 < 3 so both newest fail spread → fall back to candidates
    expect(pool.length).toBeGreaterThan(0);
    expect(pool).toContain(0);
  });
});
