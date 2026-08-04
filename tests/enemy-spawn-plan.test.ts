import { describe, expect, test } from "bun:test";

import {
  MIN_SPAWN_CELL_SEPARATION,
  buildDistributedEnemySpawns,
  buildInitialRoomEnemyQuotas,
  roomEnemySeatCap,
  selectEnemyKindsForSpawns,
} from "../src/world/EnemySpawnPlan";
import { ENEMY_DANGER_TIER } from "../src/game/DifficultyDirector";
import { FloorOccupancyBit, FloorOccupancyGrid } from "../src/world/FloorOccupancyGrid";

describe("enemy spawn plan", () => {
  const tiers = [0, 0, 1, 1, 2, 2, 3, 3, 0, 1, 2];

  test("is deterministic for a saved map seed", () => {
    expect(selectEnemyKindsForSpawns("ROSTER-A", tiers)).toEqual(
      selectEnemyKindsForSpawns("ROSTER-A", tiers),
    );
  });

  test("keeps every selected creature inside the requested danger band when seats are ungrouped", () => {
    const selected = selectEnemyKindsForSpawns("ROSTER-FULL", tiers);
    expect(selected.map((kind) => ENEMY_DANGER_TIER[kind])).toEqual(tiers);
    expect(new Set(selected).size).toBeGreaterThan(6);
  });

  test("rotates equal-tier choices between map seeds", () => {
    expect(selectEnemyKindsForSpawns("ROSTER-A", tiers)).not.toEqual(
      selectEnemyKindsForSpawns("ROSTER-B", tiers),
    );
  });

  test("packs a room with different kinds instead of one clone army", () => {
    const seats = Array.from({ length: 8 }, () => ({ tier: 0, roomId: 3 }));
    const selected = selectEnemyKindsForSpawns("ROOM-VARIETY", seats);
    expect(selected).toHaveLength(8);
    // 11 roster kinds — 8 seats must all be unique.
    expect(new Set(selected).size).toBe(8);
    // First seats stay in the requested band until that band is spent.
    const tierZeroCount = selected.filter((kind) => ENEMY_DANGER_TIER[kind] === 0).length;
    expect(tierZeroCount).toBe(3);
  });

  test("does not assign the same kind twice in a room until the roster is exhausted", () => {
    const seats = Array.from({ length: 11 }, (_, index) => ({
      tier: index % 5,
      roomId: 9,
    }));
    const selected = selectEnemyKindsForSpawns("ROOM-FULL-ROSTER", seats);
    expect(new Set(selected).size).toBe(11);
    // 12th seat may repeat; 11 seats should cover the whole roster once.
    const withRepeat = selectEnemyKindsForSpawns(
      "ROOM-FULL-ROSTER",
      Array.from({ length: 12 }, (_, index) => ({ tier: index % 5, roomId: 9 })),
    );
    expect(new Set(withRepeat).size).toBe(11);
    expect(withRepeat).toHaveLength(12);
  });

  test("isolates variety per room so one hall does not steal another's picks", () => {
    const seats = [
      { tier: 0, roomId: 1 },
      { tier: 0, roomId: 1 },
      { tier: 0, roomId: 1 },
      { tier: 0, roomId: 2 },
      { tier: 0, roomId: 2 },
      { tier: 0, roomId: 2 },
    ];
    const selected = selectEnemyKindsForSpawns("ROOM-ISOLATE", seats);
    const room1 = selected.slice(0, 3);
    const room2 = selected.slice(3, 6);
    expect(new Set(room1).size).toBe(3);
    expect(new Set(room2).size).toBe(3);
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

  test("keeps spawn planning identical for a legacy exclusion Set and owning grid", () => {
    const rooms = [0, 1, 2].map((id) => ({
      id,
      x: id * 12,
      y: 0,
      width: 8,
      height: 8,
      center: { x: id * 12 + 4, y: 4 },
      role: "room" as const,
    }));
    const excludedCells = [
      { x: 3, y: 3 },
      { x: 16, y: 4 },
      { x: 28, y: 5 },
    ];
    const legacy = new Set(excludedCells.map((cell) => `${cell.x},${cell.y}`));
    const occupancy = new FloorOccupancyGrid(0, 36, 8);
    excludedCells.forEach((cell) => occupancy.mark(cell.x, cell.y, FloorOccupancyBit.Object));

    expect(buildDistributedEnemySpawns("GRID-EXCLUSIONS", rooms, 12, occupancy)).toEqual(
      buildDistributedEnemySpawns("GRID-EXCLUSIONS", rooms, 12, legacy),
    );
  });

  test("raises danger tiers every later reinforcement pass", () => {
    const rooms = [0, 1, 2, 3].map((id) => ({
      id,
      x: id * 18,
      y: 0,
      width: 14,
      height: 14,
      center: { x: id * 18 + 7, y: 7 },
      role: "room" as const,
    }));
    const spawns = buildDistributedEnemySpawns("TIER-PASS", rooms, 40);
    const byPass = new Map<number, number[]>();
    for (const spawn of spawns) {
      const list = byPass.get(spawn.pass) ?? [];
      list.push(spawn.tier);
      byPass.set(spawn.pass, list);
    }
    expect(byPass.get(0)?.every((tier) => tier === 0)).toBe(true);
    const pass1 = byPass.get(1) ?? [];
    const pass2 = byPass.get(2) ?? [];
    const pass4 = byPass.get(4) ?? [];
    expect(pass1.length).toBeGreaterThan(0);
    expect(pass2.length).toBeGreaterThan(0);
    expect(Math.min(...pass1)).toBeGreaterThanOrEqual(1);
    expect(Math.min(...pass2)).toBeGreaterThanOrEqual(2);
    if (pass4.length > 0) expect(Math.min(...pass4)).toBeGreaterThanOrEqual(4);
  });

  test("raises small-room seats and packs large halls denser", () => {
    expect(roomEnemySeatCap({ width: 5, height: 5 })).toBe(4);
    expect(roomEnemySeatCap({ width: 6, height: 6 })).toBe(6);
    expect(roomEnemySeatCap({ width: 8, height: 8 })).toBe(8);
    expect(roomEnemySeatCap({ width: 12, height: 12 })).toBe(15);

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
    const hall = {
      id: 3,
      x: 40,
      y: 0,
      width: 14,
      height: 14,
      center: { x: 47, y: 7 },
      role: "room" as const,
    };
    const spawns = buildDistributedEnemySpawns("SIZE-CAP", [tiny, small, mid, hall], 50);
    const counts = new Map<number, number>();
    for (const spawn of spawns) {
      counts.set(spawn.roomId, (counts.get(spawn.roomId) ?? 0) + 1);
    }
    expect(counts.get(0) ?? 0).toBeLessThanOrEqual(4);
    expect(counts.get(1) ?? 0).toBeLessThanOrEqual(6);
    expect(counts.get(2) ?? 0).toBeLessThanOrEqual(12);
    expect(counts.get(3) ?? 0).toBeGreaterThan(counts.get(2) ?? 0);
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
    // 4x4 outer → interior 2x2, small rooms still allow opening doubles.
    expect(roomEnemySeatCap(tinyRooms[0]!)).toBe(4);
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
