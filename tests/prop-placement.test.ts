import { describe, expect, test } from "bun:test";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import {
  collectRoomCornerSeats,
  collectRoomInteriorSeats,
  collectRoomWallSeats,
  facingRotation,
  findNearestPropCell,
  isProtectedTraversalCell,
  PHOENIX_EGG_MIN_SPAWN_DISTANCE,
  selectPhoenixEggSeat,
  WALL_HUGGING_KINDS,
  wallHugWorldOffset,
} from "../src/world/PropPlacement";
import { WALL } from "../src/dungeon/generateDungeon";
import type { DungeonData, DungeonDoorway } from "../src/dungeon/types";
import { FloorOccupancyBit, FloorOccupancyGrid } from "../src/world/FloorOccupancyGrid";

function countSetAllocations<T>(run: () => T): { result: T; allocations: number } {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Set");
  if (!descriptor) throw new Error("Global Set descriptor is unavailable for instrumentation.");
  let allocations = 0;
  const InstrumentedSet = new Proxy(globalThis.Set, {
    construct(target, argumentsList, newTarget) {
      allocations += 1;
      return Reflect.construct(target, argumentsList, newTarget);
    },
  });
  Object.defineProperty(globalThis, "Set", { ...descriptor, value: InstrumentedSet });
  try {
    return { result: run(), allocations };
  } finally {
    Object.defineProperty(globalThis, "Set", descriptor);
  }
}

describe("prop placement seats", () => {
  test("wall seats always face a masonry cell and into the room", () => {
    const dungeon = generateDungeon("wall-seat-layout", { roomTarget: 8 });
    const room = dungeon.rooms.find(
      (candidate) => candidate.role === "room" && candidate.width >= 5 && candidate.height >= 5,
    );
    expect(room).toBeDefined();
    const seats = collectRoomWallSeats(dungeon, room!);
    expect(seats.length).toBeGreaterThan(0);
    for (const seat of seats) {
      const wallX = seat.cell.x - seat.intoDx;
      const wallY = seat.cell.y - seat.intoDy;
      expect(dungeon.grid[wallY]?.[wallX]).toBe(WALL);
      expect(Math.abs(seat.intoDx) + Math.abs(seat.intoDy)).toBe(1);
    }
  });

  test("keeps wall-seat traversal ordered without a string Set allocation", () => {
    const dungeon = generateDungeon("wall-seat-layout", { roomTarget: 8 });
    const room = dungeon.rooms.find(
      (candidate) => candidate.role === "room" && candidate.width >= 5 && candidate.height >= 5,
    );
    expect(room).toMatchObject({ id: 0, x: 17, y: 16, width: 8, height: 6 });

    const observed = countSetAllocations(() => collectRoomWallSeats(dungeon, room!));
    expect(observed.allocations).toBe(0);
    expect(
      observed.result.map((seat) => [seat.cell.x, seat.cell.y, seat.intoDx || 0, seat.intoDy || 0]),
    ).toEqual([
      [17, 16, 0, 1],
      [17, 16, 1, 0],
      [18, 16, 0, 1],
      [19, 16, 0, 1],
      [20, 16, 0, 1],
      [21, 16, 0, 1],
      [22, 16, 0, 1],
      [23, 16, 0, 1],
      [24, 16, 0, 1],
      [24, 16, -1, 0],
      [17, 17, 1, 0],
      [17, 18, 1, 0],
      [24, 18, -1, 0],
      [17, 19, 1, 0],
      [24, 19, -1, 0],
      [24, 20, -1, 0],
      [17, 21, 0, -1],
      [17, 21, 1, 0],
      [18, 21, 0, -1],
      [19, 21, 0, -1],
      [20, 21, 0, -1],
      [21, 21, 0, -1],
      [22, 21, 0, -1],
      [24, 21, -1, 0],
      [24, 21, 0, -1],
    ]);
  });

  test("interior seats exist for medium rooms and wall hug offset pushes toward masonry", () => {
    const dungeon = generateDungeon("interior-seat-layout", {
      roomTarget: 8,
      minRoomSize: 6,
      maxRoomSize: 10,
    });
    const room = dungeon.rooms.find(
      (candidate) => candidate.role === "room" && Math.min(candidate.width, candidate.height) >= 6,
    );
    expect(room).toBeDefined();
    const interior = collectRoomInteriorSeats(dungeon, room!);
    expect(interior.length).toBeGreaterThan(0);
    const offset = wallHugWorldOffset(0, 1, 2.4, 0.32);
    expect(offset.z).toBeLessThan(0);
    expect(WALL_HUGGING_KINDS.has("bookshelf")).toBe(true);
    expect(facingRotation(1, 0)).toBeCloseTo(Math.PI / 2);
  });

  test("protects topology doorway cell and outside mouth from prop/chest seats", () => {
    const dungeon = generateDungeon("doorway-protect-layout", { roomTarget: 8 });
    const doorway = dungeon.topology?.doorways[0];
    expect(doorway).toBeDefined();
    const opening = doorway as DungeonDoorway;
    expect(isProtectedTraversalCell(dungeon, opening.cell)).toBe(true);
    expect(isProtectedTraversalCell(dungeon, opening.outside)).toBe(true);

    const synthetic: DungeonData = {
      ...dungeon,
      spawn: { x: 0, y: 0 },
      exit: { x: 1, y: 0 },
      topology: {
        roomIds: dungeon.topology?.roomIds ?? new Int16Array(0),
        corridors: dungeon.topology?.corridors ?? new Uint8Array(0),
        doorways: [
          {
            edgeIndex: 0,
            roomId: 0,
            connectedRoomId: 1,
            cell: { x: 4, y: 4 },
            outside: { x: 4, y: 5 },
            outDx: 0,
            outDy: 1,
          },
        ],
      },
    };
    expect(isProtectedTraversalCell(synthetic, { x: 4, y: 4 })).toBe(true);
    expect(isProtectedTraversalCell(synthetic, { x: 4, y: 5 })).toBe(true);
    expect(isProtectedTraversalCell(synthetic, { x: 4, y: 6 })).toBe(false);
  });
});

describe("phoenix egg seat", () => {
  test("prefers a free corner far from spawn and never reuses excluded cells", () => {
    const dungeon = generateDungeon("phoenix-egg-corner-seat", {
      roomTarget: 12,
      minRoomSize: 5,
      maxRoomSize: 9,
    });
    const rooms = dungeon.rooms.filter((room) => room.role === "room");
    expect(rooms.length).toBeGreaterThan(2);

    const excluded = new Set<string>([
      `${dungeon.spawn.x},${dungeon.spawn.y}`,
      `${dungeon.exit.x},${dungeon.exit.y}`,
    ]);
    // Occupy one corner in a mid room so the picker must skip it.
    const midRoom = rooms[Math.floor(rooms.length * 0.5)] ?? rooms[0]!;
    const midCorners = collectRoomCornerSeats(dungeon, midRoom);
    if (midCorners[0]) {
      excluded.add(`${midCorners[0].cell.x},${midCorners[0].cell.y}`);
    }

    const seat = selectPhoenixEggSeat(dungeon, rooms, excluded, dungeon.seedHash + 907);
    expect(seat).not.toBeNull();
    const key = `${seat!.x},${seat!.y}`;
    expect(excluded.has(key)).toBe(false);
    expect(isProtectedTraversalCell(dungeon, seat!)).toBe(false);
    expect(
      Math.max(Math.abs(seat!.x - dungeon.spawn.x), Math.abs(seat!.y - dungeon.spawn.y)),
    ).toBeGreaterThanOrEqual(PHOENIX_EGG_MIN_SPAWN_DISTANCE);

    // Prefer true corner geometry when any free corner exists in candidate rooms.
    const allFreeCorners = rooms.flatMap((room) =>
      collectRoomCornerSeats(dungeon, room)
        .map((entry) => entry.cell)
        .filter((cell) => {
          const cellKey = `${cell.x},${cell.y}`;
          if (excluded.has(cellKey) || isProtectedTraversalCell(dungeon, cell)) return false;
          return (
            Math.max(Math.abs(cell.x - dungeon.spawn.x), Math.abs(cell.y - dungeon.spawn.y)) >=
            PHOENIX_EGG_MIN_SPAWN_DISTANCE
          );
        }),
    );
    if (allFreeCorners.length > 0) {
      const isCorner = allFreeCorners.some((cell) => cell.x === seat!.x && cell.y === seat!.y);
      expect(isCorner).toBe(true);
    }

    // Deterministic for the same seed/exclusion set.
    const again = selectPhoenixEggSeat(dungeon, rooms, excluded, dungeon.seedHash + 907);
    expect(again).toEqual(seat);
  });

  test("returns null when every free seat is excluded or beside spawn", () => {
    const dungeon = generateDungeon("phoenix-egg-no-seat", { roomTarget: 6 });
    const rooms = dungeon.rooms.filter((room) => room.role === "room");
    const excluded = new Set<string>();
    for (const room of rooms) {
      for (const seat of collectRoomCornerSeats(dungeon, room)) {
        excluded.add(`${seat.cell.x},${seat.cell.y}`);
      }
      for (const seat of collectRoomWallSeats(dungeon, room)) {
        excluded.add(`${seat.cell.x},${seat.cell.y}`);
      }
      for (const cell of collectRoomInteriorSeats(dungeon, room, 0)) {
        excluded.add(`${cell.x},${cell.y}`);
      }
    }
    expect(selectPhoenixEggSeat(dungeon, rooms, excluded, 1)).toBeNull();
  });

  test("keeps prop and phoenix seat searches equivalent on a floor-owned query", () => {
    const dungeon = generateDungeon("phoenix-grid-query", { roomTarget: 10 });
    const rooms = dungeon.rooms.filter((room) => room.role === "room");
    const room = rooms[0]!;
    const excludedCells = [
      dungeon.spawn,
      dungeon.exit,
      ...collectRoomCornerSeats(dungeon, room)
        .slice(0, 1)
        .map((seat) => seat.cell),
    ];
    const legacy = new Set(excludedCells.map((cell) => `${cell.x},${cell.y}`));
    const occupancy = new FloorOccupancyGrid(0, dungeon.width, dungeon.height);
    excludedCells.forEach((cell) => occupancy.mark(cell.x, cell.y, FloorOccupancyBit.Object));

    expect(findNearestPropCell(dungeon, room.center, occupancy, 6)).toEqual(
      findNearestPropCell(dungeon, room.center, legacy, 6),
    );
    expect(selectPhoenixEggSeat(dungeon, rooms, occupancy, dungeon.seedHash + 907)).toEqual(
      selectPhoenixEggSeat(dungeon, rooms, legacy, dungeon.seedHash + 907),
    );
  });
});
