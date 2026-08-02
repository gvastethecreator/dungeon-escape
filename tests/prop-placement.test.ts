import { describe, expect, test } from "bun:test";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import {
  collectRoomInteriorSeats,
  collectRoomWallSeats,
  facingRotation,
  isProtectedTraversalCell,
  WALL_HUGGING_KINDS,
  wallHugWorldOffset,
} from "../src/world/PropPlacement";
import { WALL } from "../src/dungeon/generateDungeon";
import type { DungeonData, DungeonDoorway } from "../src/dungeon/types";

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
