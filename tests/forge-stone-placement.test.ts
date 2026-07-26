import { describe, expect, test } from "bun:test";

import { selectForgeMagicStonePlacements } from "../src/forge/layoutTuning";

describe("Creation magic stone placement", () => {
  test("places the four named stones in distinct valid rooms and cells", () => {
    const width = 32;
    const height = 8;
    const size = width * height;
    const grid = new Uint8Array(size);
    const roomIds = new Int16Array(size).fill(-1);
    const bfs = new Int16Array(size).fill(-1);
    const rooms = Array.from({ length: 6 }, (_, id) => ({
      id,
      cx: 3 + id * 5,
      cy: 4,
      w: 5,
      h: 5,
    }));
    for (const room of rooms) {
      for (let y = 2; y <= 6; y += 1) {
        for (let x = room.cx - 2; x <= room.cx + 2; x += 1) {
          const index = y * width + x;
          grid[index] = 1;
          roomIds[index] = room.id;
          bfs[index] = room.id * 10 + Math.abs(x - room.cx) + Math.abs(y - room.cy);
        }
      }
    }
    const empty = new Uint8Array(size);

    const placements = selectForgeMagicStonePlacements({
      width,
      height,
      grid,
      roomIds,
      corridors: empty,
      doorways: empty,
      pools: empty,
      lakeMask: empty,
      bfs,
      rooms,
      excludedRoomIds: new Set([0, 5]),
    });

    expect(placements.map((placement) => placement.stoneId)).toEqual([
      "ember",
      "ash",
      "crypt",
      "verdant",
    ]);
    expect(new Set(placements.map((placement) => placement.roomId)).size).toBe(4);
    expect(new Set(placements.map((placement) => `${placement.x},${placement.y}`)).size).toBe(4);
    placements.forEach((placement) => {
      const index = placement.y * width + placement.x;
      expect(grid[index]).toBe(1);
      expect(roomIds[index]).toBe(placement.roomId);
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const clearanceIndex = (placement.y + offsetY) * width + placement.x + offsetX;
          expect(grid[clearanceIndex]).toBe(1);
          expect(roomIds[clearanceIndex]).toBe(placement.roomId);
        }
      }
    });
  });
});
