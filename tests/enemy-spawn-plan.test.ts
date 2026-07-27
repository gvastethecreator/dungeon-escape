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

  test("raises danger tiers every two later reinforcement passes", () => {
    const rooms = [0, 1, 2, 3].map((id) => ({
      id,
      x: id * 14,
      y: 0,
      width: 10,
      height: 10,
      center: { x: id * 14 + 5, y: 5 },
      role: "room" as const,
    }));
    // 4 rooms × 6 passes → enough seats to climb pass tiers.
    const spawns = buildDistributedEnemySpawns("TIER-PASS", rooms, 24);
    const byPass = new Map<number, number[]>();
    for (const spawn of spawns) {
      const list = byPass.get(spawn.pass) ?? [];
      list.push(spawn.tier);
      byPass.set(spawn.pass, list);
    }
    expect(byPass.get(0)?.every((tier) => tier === 0)).toBe(true);
    expect(byPass.get(1)?.every((tier) => tier === 0)).toBe(true);
    const pass2 = byPass.get(2) ?? [];
    const pass4 = byPass.get(4) ?? [];
    expect(pass2.length).toBeGreaterThan(0);
    expect(pass4.length).toBeGreaterThan(0);
    expect(Math.min(...pass2)).toBeGreaterThanOrEqual(1);
    expect(Math.min(...pass4)).toBeGreaterThanOrEqual(2);
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
