import { describe, expect, test } from "bun:test";

import { importDungeonForge } from "../src/dungeon/importDungeonForge";
import { generateForgeDungeon } from "../src/forge/generateForgeDungeon";
import { STONE_ORDER } from "../src/ui/copy";
import {
  hasValidMagicStonePlacementContract,
  selectMagicStonePlacements,
} from "../src/world/MagicStonePlacement";

describe("magic stone placement resilience", () => {
  test("repairs a legacy Forge map with missing distances and one stale room reference", () => {
    const dungeon = importDungeonForge(
      generateForgeDungeon({
        seed: 989_898,
        roomCount: 9,
        loopChance: 0.28,
        decorDensity: 0.7,
        themeKey: "ancient",
      }),
    );
    const original = selectMagicStonePlacements(dungeon);
    const staleRoomId = original[1]!.room.id;

    dungeon.rooms = dungeon.rooms.filter((room) => room.id !== staleRoomId);
    dungeon.distances = new Int32Array(0);

    const repaired = selectMagicStonePlacements(dungeon);
    expect(repaired.map(({ stoneId }) => stoneId)).toEqual([...STONE_ORDER]);
    expect(repaired).toHaveLength(4);
    expect(new Set(repaired.map(({ cell }) => `${cell.x},${cell.y}`)).size).toBe(4);
    expect(repaired.some(({ room }) => room.id === staleRoomId)).toBe(false);
    expect(hasValidMagicStonePlacementContract(dungeon, repaired)).toBe(true);
  });
});
