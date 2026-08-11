import { describe, expect, test } from "bun:test";

import { FLOOR, generateDungeon } from "../src/dungeon/generateDungeon";
import {
  hasValidMagicStonePlacementContract,
  hasValidPortalPlacementContract,
  magicStoneClearanceCells,
  selectMagicStonePlacements,
} from "../src/world/MagicStonePlacement";

describe("magic stone clearance", () => {
  test("selects four reachable objective cells across room sizes and seeds", () => {
    for (const roomTarget of [2, 4, 8, 16, 24, 32, 48]) {
      for (let index = 0; index < 12; index += 1) {
        const dungeon = generateDungeon(`STONE-CLEAR-${roomTarget}-${index}`, { roomTarget });
        const placements = selectMagicStonePlacements(dungeon);
        expect(placements).toHaveLength(4);
        expect(hasValidMagicStonePlacementContract(dungeon, placements)).toBe(true);
        expect(new Set(placements.map(({ cell }) => `${cell.x},${cell.y}`)).size).toBe(4);
        for (const placement of placements) {
          for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
            for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
              expect(dungeon.grid[placement.cell.y + offsetY]?.[placement.cell.x + offsetX]).toBe(
                FLOOR,
              );
            }
          }
        }
        const clearance = magicStoneClearanceCells(dungeon, placements);
        // Prefer 3×3 pads (36 when disjoint); adjacent seats may share clearance cells.
        expect(clearance.length).toBeGreaterThanOrEqual(4);
        for (const placement of placements) {
          expect(
            clearance.some((cell) => cell.x === placement.cell.x && cell.y === placement.cell.y),
          ).toBe(true);
        }
      }
    }
  });

  test("always materializes four stones and a reachable portal on thin corridors", () => {
    // spawn + exit + four free seats is the minimum complete objective budget.
    const width = 20;
    const height = 5;
    const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => 0));
    for (let x = 1; x <= 6; x += 1) grid[2]![x] = 1;
    const spawn = { x: 1, y: 2 };
    const exit = { x: 6, y: 2 };
    const distances = new Int32Array(width * height).fill(-1);
    const queue = [spawn];
    distances[spawn.y * width + spawn.x] = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const next = { x: current.x + dx, y: current.y + dy };
        if (grid[next.y]?.[next.x] !== 1) continue;
        const index = next.y * width + next.x;
        if (distances[index]! >= 0) continue;
        distances[index] = distances[current.y * width + current.x]! + 1;
        queue.push(next);
      }
    }
    const dungeon = {
      seed: "thin-corridor",
      seedHash: 1,
      width,
      height,
      grid: grid.map((row) => Uint8Array.from(row)),
      rooms: [
        {
          id: 0,
          x: 1,
          y: 2,
          width: 6,
          height: 1,
          center: { x: 3, y: 2 },
          role: "room" as const,
        },
      ],
      edges: [],
      spawn,
      exit,
      entranceRoomId: 0,
      exitRoomId: 0,
      distances,
      topologySignature: "thin",
      stats: {
        roomCount: 1,
        floorCount: 6,
        reachableFloorCount: 6,
        edgeCount: 0,
        loopCount: 0,
        exitDistance: 5,
      },
    };
    const placements = selectMagicStonePlacements(dungeon as never);
    expect(placements).toHaveLength(4);
    expect(hasValidMagicStonePlacementContract(dungeon as never, placements)).toBe(true);
    expect(hasValidPortalPlacementContract(dungeon as never)).toBe(true);
  });
});
