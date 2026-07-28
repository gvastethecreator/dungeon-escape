import { describe, expect, test } from "bun:test";

import { FLOOR, generateDungeon } from "../src/dungeon/generateDungeon";
import {
  hasValidMagicStonePlacementContract,
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
        expect(clearance.length).toBe(36);
      }
    }
  });
});
