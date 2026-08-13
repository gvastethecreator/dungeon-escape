import { describe, expect, test } from "bun:test";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import { FLOOR_SHOTGUN_MIN } from "../src/game/BiomeLootPlan";
import {
  collectCorridorFloorSeats,
  selectShotgunFloorSeats,
  SHOTGUN_FLOOR_MIN_SEPARATION,
  SHOTGUN_FLOOR_MIN_SPAWN_DISTANCE,
} from "../src/world/CorridorLootPlacement";
import type { GridCell } from "../src/dungeon/types";

function chebyshev(a: GridCell, b: GridCell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function inRoom(dungeon: ReturnType<typeof generateDungeon>, cell: GridCell): boolean {
  const index = cell.y * dungeon.width + cell.x;
  return (dungeon.topology?.roomIds[index] ?? -1) >= 0;
}

describe("shotgun floor spawn", () => {
  test("collects authored corridor tiles, including wide halls", () => {
    const narrow = generateDungeon("shotgun-hall-narrow", { roomTarget: 8, corridorRadius: 0 });
    const wide = generateDungeon("shotgun-hall-wide", { roomTarget: 10, corridorRadius: 1 });
    const narrowSeats = collectCorridorFloorSeats(narrow);
    const wideSeats = collectCorridorFloorSeats(wide);
    expect(narrowSeats.length).toBeGreaterThan(8);
    expect(wideSeats.length).toBeGreaterThan(8);
    expect(narrowSeats.every((cell) => !inRoom(narrow, cell))).toBe(true);
    expect(wideSeats.every((cell) => !inRoom(wide, cell))).toBe(true);
    expect(wideSeats.some((cell) => wide.topology?.corridors[cell.y * wide.width + cell.x])).toBe(
      true,
    );
  });

  test("places guaranteed floor shotguns along hallways, not chests", () => {
    const dungeon = generateDungeon("shotgun-route-spread", {
      roomTarget: 10,
      corridorRadius: 1,
    });
    const empty = { isOccupied: () => false };
    const seats = selectShotgunFloorSeats(dungeon, FLOOR_SHOTGUN_MIN, empty);
    expect(seats).toHaveLength(FLOOR_SHOTGUN_MIN);
    for (const seat of seats) {
      expect(inRoom(dungeon, seat)).toBe(false);
      expect(chebyshev(seat, dungeon.spawn)).toBeGreaterThanOrEqual(
        SHOTGUN_FLOOR_MIN_SPAWN_DISTANCE,
      );
    }
    expect(chebyshev(seats[0]!, seats[1]!)).toBeGreaterThanOrEqual(SHOTGUN_FLOOR_MIN_SEPARATION);
    const distances = seats.map(
      (seat) => dungeon.distances[seat.y * dungeon.width + seat.x] ?? -1,
    );
    expect(Math.min(...distances)).toBeGreaterThan(0);
    expect(Math.max(...distances) - Math.min(...distances)).toBeGreaterThanOrEqual(4);
  });

  test("falls back to rooms only when the hall is already taken", () => {
    const dungeon = generateDungeon("shotgun-room-fallback", { roomTarget: 8, corridorRadius: 0 });
    const hall = collectCorridorFloorSeats(dungeon);
    const occupied = {
      isOccupied: (x: number, y: number) => hall.some((cell) => cell.x === x && cell.y === y),
    };
    const roomSeat = dungeon.rooms.find((room) => room.role === "room")?.center;
    expect(roomSeat).toBeDefined();
    if (!roomSeat) return;
    const seats = selectShotgunFloorSeats(dungeon, 1, occupied, [roomSeat]);
    expect(seats).toHaveLength(1);
    expect(seats[0]).toEqual(roomSeat);
  });

  test("scene prefers the corridor shotgun selector", async () => {
    const scene = await Bun.file(new URL("../src/world/StaticDungeonScene.ts", import.meta.url)).text();
    expect(scene).toContain("selectShotgunFloorSeats");
    expect(scene).not.toContain("preferCorridor");
  });
});
