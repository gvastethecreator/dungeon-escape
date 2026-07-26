import { describe, expect, test } from "bun:test";

import { FLOOR, generateDungeon } from "../src/dungeon/generateDungeon";
import {
  magicStoneClearanceCells,
  selectMagicStonePlacements,
} from "../src/world/MagicStonePlacement";

describe("magic stone clearance", () => {
  test("selects four center-biased objective cells with a walkable ring across seeds", () => {
    for (let index = 0; index < 24; index += 1) {
      const dungeon = generateDungeon(`STONE-CLEAR-${index}`, { roomTarget: 16 });
      const placements = selectMagicStonePlacements(dungeon);
      expect(placements).toHaveLength(4);
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
  });
});
