import { describe, expect, test } from "bun:test";

import { footstepSurfaceAt } from "../src/audio/FootstepSurface";
import { generateDungeon } from "../src/dungeon/generateDungeon";
import type { DungeonData, DungeonForgeMetadata } from "../src/dungeon/types";

function forgeDungeon(themeKey: string): DungeonData {
  const dungeon = generateDungeon(`SURFACE-${themeKey}`, { roomTarget: 8 });
  const length = dungeon.width * dungeon.height;
  const forge: DungeonForgeMetadata = {
    name: "Surface test",
    themeKey,
    roomTypes: {},
    source: "dungeon-forge",
    seed: 1,
    decorDensity: 0.5,
    maxBfs: 1,
    maxDepth: 1,
    roomIds: new Int16Array(length),
    corridors: new Uint8Array(length),
    doorways: new Uint8Array(length),
    bfs: new Int32Array(length),
    pools: new Uint8Array(length),
    lakeMask: new Uint8Array(length),
    rooms: [],
    props: [],
    spawns: [],
    torches: [],
    arches: [],
  };
  return { ...dungeon, forge };
}

describe("footstep surface", () => {
  test("uses the rendered Forge liquid masks for wet footsteps", () => {
    const dungeon = forgeDungeon("ancient");
    const cell = dungeon.spawn;
    dungeon.forge!.pools[cell.y * dungeon.width + cell.x] = 1;
    expect(footstepSurfaceAt(dungeon, cell)).toBe("water");
  });

  test("keeps molten and frozen surfaces dry until traversal supports them", () => {
    for (const theme of ["molten", "frost"]) {
      const dungeon = forgeDungeon(theme);
      const cell = dungeon.spawn;
      dungeon.forge!.lakeMask[cell.y * dungeon.width + cell.x] = 1;
      expect(footstepSurfaceAt(dungeon, cell)).toBe("stone");
    }
  });

  test("controller and play loop suppress airborne and landing footsteps", async () => {
    const controller = await Bun.file(
      new URL("../src/player/FirstPersonController.ts", import.meta.url),
    ).text();
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(controller).toContain("this.verticalState.grounded && !landed ? movedDistance : 0");
    expect(main).toContain("simulationActive && result.footstep");
    expect(main).not.toContain("result.footstep || result.landed");
  });
});
