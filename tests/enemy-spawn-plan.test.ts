import { describe, expect, test } from "bun:test";

import {
  MIN_SPAWN_CELL_SEPARATION,
  buildDistributedEnemySpawns,
  buildInitialRoomEnemyQuotas,
  roomEnemySeatCap,
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
    for (let index = 0; index < first.length; index += 1) {
      for (let other = index + 1; other < first.length; other += 1) {
        const a = first[index]!.cell;
        const b = first[other]!.cell;
        const chebyshev = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        expect(chebyshev).toBeGreaterThanOrEqual(MIN_SPAWN_CELL_SEPARATION);
      }
    }
  });

  test("raises danger tiers every two later reinforcement passes", () => {
    const rooms = [0, 1, 2, 3].map((id) => ({
      id,
      x: id * 18,
      y: 0,
      width: 14,
      height: 14,
      center: { x: id * 18 + 7, y: 7 },
      role: "room" as const,
    }));
    // Large rooms (cap 6) leave enough seats to climb pass tiers.
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

  test("caps small rooms so they never stack an abusive seat pile", () => {
    expect(roomEnemySeatCap({ width: 5, height: 5 })).toBe(2);
    expect(roomEnemySeatCap({ width: 6, height: 6 })).toBe(3);
    expect(roomEnemySeatCap({ width: 8, height: 8 })).toBe(4);
    expect(roomEnemySeatCap({ width: 12, height: 12 })).toBe(6);

    const tiny = {
      id: 0,
      x: 0,
      y: 0,
      width: 5,
      height: 5,
      center: { x: 2, y: 2 },
      role: "room" as const,
    };
    const small = {
      id: 1,
      x: 10,
      y: 0,
      width: 6,
      height: 6,
      center: { x: 13, y: 3 },
      role: "room" as const,
    };
    const mid = {
      id: 2,
      x: 20,
      y: 0,
      width: 10,
      height: 10,
      center: { x: 25, y: 5 },
      role: "room" as const,
    };
    const spawns = buildDistributedEnemySpawns("SIZE-CAP", [tiny, small, mid], 20);
    const counts = new Map<number, number>();
    for (const spawn of spawns) {
      counts.set(spawn.roomId, (counts.get(spawn.roomId) ?? 0) + 1);
    }
    expect(counts.get(0) ?? 0).toBeLessThanOrEqual(2);
    expect(counts.get(1) ?? 0).toBeLessThanOrEqual(3);
    expect(counts.get(2) ?? 0).toBeLessThanOrEqual(5);
    expect(counts.get(2) ?? 0).toBeGreaterThan(counts.get(0) ?? 0);
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

  test("opening doubles only land where the room seat cap allows two threats", () => {
    const tinyRooms = Array.from({ length: 6 }, (_, id) => ({
      id,
      x: id * 8,
      y: 0,
      width: 4,
      height: 4,
      center: { x: id * 8 + 2, y: 2 },
      role: "room" as const,
    }));
    // 4x4 outer → interior 2x2, cap 2, so doubles are still legal.
    expect(roomEnemySeatCap(tinyRooms[0]!)).toBe(2);
    const tinyQuotas = buildInitialRoomEnemyQuotas("TINY-OPENING", tinyRooms, 12, 0);
    expect([...tinyQuotas.values()].some((value) => value === 2)).toBe(true);

    const midRooms = Array.from({ length: 6 }, (_, id) => ({
      id,
      x: id * 12,
      y: 0,
      width: 8,
      height: 8,
      center: { x: id * 12 + 4, y: 4 },
      role: "room" as const,
    }));
    const midQuotas = buildInitialRoomEnemyQuotas("MID-OPENING", midRooms, 10, 0);
    expect([...midQuotas.values()].filter((value) => value === 2).length).toBeGreaterThan(0);
  });
});
