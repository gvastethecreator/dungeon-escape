import { describe, expect, test } from "bun:test";

import { generateCompletableDungeon } from "../src/dungeon/completeness";
import { exportPlayDungeonToForgePresentation } from "../src/dungeon/exportPlayDungeonToForge";
import { FLOOR as PLAY_FLOOR } from "../src/dungeon/generateDungeon";

describe("export play dungeon to forge presentation", () => {
  test("preserves walkable topology for the isometric theater", () => {
    const dungeon = generateCompletableDungeon("ISO-MATCH-1", {
      roomTarget: 10,
      width: 51,
      height: 51,
      minRoomSize: 4,
      maxRoomSize: 7,
      roomPadding: 2,
      corridorRadius: 0,
    });
    const payload = exportPlayDungeonToForgePresentation(dungeon, "ancient");

    expect(payload.W).toBe(dungeon.width);
    expect(payload.H).toBe(dungeon.height);
    expect(payload.grid.length).toBe(dungeon.width * dungeon.height);
    expect(payload.params.themeKey).toBe("ancient");
    expect(payload.entrance).toBe(dungeon.entranceRoomId);
    expect(payload.boss).toBe(dungeon.exitRoomId);
    expect(payload.rooms.length).toBeGreaterThanOrEqual(dungeon.rooms.length);

    let playFloor = 0;
    let forgeFloor = 0;
    let forgeWall = 0;
    let forgeVoid = 0;
    for (let y = 0; y < dungeon.height; y += 1) {
      for (let x = 0; x < dungeon.width; x += 1) {
        const index = y * dungeon.width + x;
        if (dungeon.grid[y]![x] === PLAY_FLOOR) {
          playFloor += 1;
          // Forge floor constant is 1.
          expect(payload.grid[index]).toBe(1);
          forgeFloor += 1;
        } else {
          // Non-floor becomes WALL (2) only on the shell, else VOID (0).
          expect([0, 2]).toContain(payload.grid[index]);
          if (payload.grid[index] === 2) forgeWall += 1;
          else forgeVoid += 1;
        }
      }
    }
    expect(forgeFloor).toBe(playFloor);
    expect(playFloor).toBe(dungeon.stats.floorCount);
    expect(forgeWall).toBeGreaterThan(0);
    expect(forgeVoid).toBeGreaterThan(0);
    // Shell walls only — not a solid filled rectangle of walls.
    expect(forgeWall).toBeLessThan(playFloor * 3);
  });
});
