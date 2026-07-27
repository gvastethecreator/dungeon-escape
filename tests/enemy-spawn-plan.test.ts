import { describe, expect, test } from "bun:test";

import {
  buildDistributedEnemySpawns,
  selectEnemyKindsForSpawns,
} from "../src/world/EnemySpawnPlan";
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

  test("spreads a large reserve across rooms in stable shuffled passes", () => {
    const rooms = [0, 1, 2].map((id) => ({
      id,
      x: id * 12,
      y: 0,
      width: 8,
      height: 8,
      center: { x: id * 12 + 4, y: 4 },
      role: "room" as const,
    }));
    const first = buildDistributedEnemySpawns("MAP-A", rooms, 8);
    const repeated = buildDistributedEnemySpawns("MAP-A", rooms, 8);
    expect(first).toEqual(repeated);
    expect(first).toHaveLength(8);
    expect(new Set(first.map((spawn) => `${spawn.cell.x},${spawn.cell.y}`)).size).toBe(8);
    const firstPassRooms = first.slice(0, 3).map((spawn) => Math.floor(spawn.cell.x / 12));
    expect(new Set(firstPassRooms).size).toBe(3);
    expect(first.every((spawn) => spawn.tier >= 0 && spawn.tier <= 4)).toBe(true);
  });
});
