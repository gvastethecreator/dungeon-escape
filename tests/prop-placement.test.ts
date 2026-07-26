import { describe, expect, test } from "bun:test";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import {
  collectRoomInteriorSeats,
  collectRoomWallSeats,
  facingRotation,
  WALL_HUGGING_KINDS,
  wallHugWorldOffset,
} from "../src/world/PropPlacement";
import { WALL } from "../src/dungeon/generateDungeon";

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
});
