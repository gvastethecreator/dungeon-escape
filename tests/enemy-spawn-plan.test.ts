import { describe, expect, test } from "bun:test";

import {
  buildDistributedEnemySpawns,
  buildInitialRoomEnemyQuotas,
  selectEnemyKindsForSpawns,
} from "../src/world/EnemySpawnPlan";
import { ENEMY_DANGER_TIER } from "../src/game/DifficultyDirector";

describe("enemy spawn plan", () => {
  const tiers = [0, 0, 1, 1, 2, 2, 3, 3, 0, 1, 2];

  test("is deterministic for a saved map seed", () => {
    expect(selectEnemyKindsForSpawns("ROSTER-A", tiers)).toEqual(
      selectEnemyKindsForSpawns("ROSTER-A", tiers),
    );
  });

  test("keeps every selected creature inside the requested danger band", () => {
    const selected = selectEnemyKindsForSpawns("ROSTER-FULL", tiers);
    expect(selected.map((kind) => ENEMY_DANGER_TIER[kind])).toEqual(tiers);
    expect(new Set(selected).size).toBeGreaterThan(6);
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
    expect(new Set(first.slice(0, 3).map((spawn) => spawn.roomId)).size).toBe(3);
    expect(first.slice(0, 3).every((spawn) => spawn.pass === 0)).toBe(true);
    expect(first.slice(3, 6).every((spawn) => spawn.pass === 1)).toBe(true);
    expect(first.every((spawn) => spawn.tier >= 0 && spawn.tier <= 4)).toBe(true);
  });

  test("assigns one or two opening enemies while only one room in six stays empty", () => {
    const rooms = Array.from({ length: 12 }, (_, id) => ({
      id,
      x: id * 12,
      y: 0,
      width: 8,
      height: 8,
      center: { x: id * 12 + 4, y: 4 },
      role: "room" as const,
    }));
    const quotas = buildInitialRoomEnemyQuotas("MAP-OCCUPANCY", rooms, 15, 0);
    const values = [...quotas.values()];

    expect(quotas.get(0)).toBe(0);
    expect(values.filter((value) => value === 0)).toHaveLength(2);
    expect(values.filter((value) => value === 1)).toHaveLength(5);
    expect(values.filter((value) => value === 2)).toHaveLength(5);
    expect(values.reduce<number>((total, value) => total + value, 0)).toBe(15);
    expect(quotas).toEqual(buildInitialRoomEnemyQuotas("MAP-OCCUPANCY", rooms, 15, 0));
  });
});
