import { describe, expect, test } from "bun:test";

import { selectEnemyKindsForSpawns } from "../src/world/EnemySpawnPlan";
import { ENEMY_ROSTER } from "../src/world/EnemySpriteAtlas";

describe("enemy spawn plan", () => {
  const tiers = [0, 0, 1, 1, 2, 2, 3, 3, 0, 1, 2];

  test("is deterministic for a saved map seed", () => {
    expect(selectEnemyKindsForSpawns("ROSTER-A", tiers)).toEqual(
      selectEnemyKindsForSpawns("ROSTER-A", tiers),
    );
  });

  test("uses every production creature before repeating", () => {
    const selected = selectEnemyKindsForSpawns("ROSTER-FULL", tiers);
    expect(new Set(selected)).toEqual(new Set(ENEMY_ROSTER));
  });

  test("rotates equal-tier choices between map seeds", () => {
    expect(selectEnemyKindsForSpawns("ROSTER-A", tiers)).not.toEqual(
      selectEnemyKindsForSpawns("ROSTER-B", tiers),
    );
  });
});
