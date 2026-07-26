import { describe, expect, test } from "bun:test";

import { FLOOR, WALL } from "../src/dungeon/generateDungeon";
import type { DungeonData } from "../src/dungeon/types";
import {
  createDungeonEditorProjection,
  EDITOR_CELL_KIND,
} from "../src/editor/DungeonEditorProjection";
import { ENEMY_ROSTER } from "../src/world/EnemySpriteAtlas";

function makeForgeDungeon(): DungeonData {
  const width = 7;
  const height = 5;
  const at = (x: number, y: number) => y * width + x;
  const grid = Array.from({ length: height }, () => new Uint8Array(width).fill(WALL));
  for (let x = 1; x <= 5; x += 1) grid[2]![x] = FLOOR;
  grid[1]![4] = FLOOR;
  const roomIds = new Int16Array(width * height).fill(-1);
  roomIds[at(1, 2)] = 0;
  roomIds[at(2, 2)] = 0;
  roomIds[at(4, 2)] = 1;
  roomIds[at(5, 2)] = 1;
  roomIds[at(4, 1)] = 1;
  const corridors = new Uint8Array(width * height);
  corridors[at(3, 2)] = 1;
  const doorways = new Uint8Array(width * height);
  doorways[at(3, 2)] = 1;
  const pools = new Uint8Array(width * height);
  pools[at(3, 1)] = 1;
  const lakeMask = new Uint8Array(width * height);
  lakeMask[at(4, 1)] = 1;
  return {
    seed: "CREATION-42",
    seedHash: 42,
    options: {
      width,
      height,
      roomTarget: 2,
      minRoomSize: 1,
      maxRoomSize: 3,
      roomPadding: 1,
      corridorRadius: 0,
      extraConnectionRate: 0,
      placementAttemptsPerRoom: 1,
    },
    grid,
    width,
    height,
    rooms: [
      {
        id: 0,
        x: 1,
        y: 2,
        width: 2,
        height: 1,
        center: { x: 1, y: 2 },
        role: "entrance",
      },
      {
        id: 1,
        x: 4,
        y: 1,
        width: 2,
        height: 2,
        center: { x: 5, y: 2 },
        role: "exit",
      },
    ],
    edges: [{ left: 0, right: 1, distance: 16, kind: "tree" }],
    spawn: { x: 1, y: 2 },
    exit: { x: 5, y: 2 },
    entranceRoomId: 0,
    exitRoomId: 1,
    distances: new Int32Array(width * height),
    topologySignature: "forge-test",
    stats: {
      roomCount: 2,
      floorCount: 6,
      reachableFloorCount: 6,
      edgeCount: 1,
      loopCount: 0,
      exitDistance: 4,
    },
    forge: {
      name: "Test Forge",
      themeKey: "frost",
      roomTypes: { 0: "entrance", 1: "boss" },
      source: "dungeon-forge",
      seed: 42,
      decorDensity: 0.6,
      maxBfs: 4,
      maxDepth: 1,
      roomIds,
      corridors,
      doorways,
      bfs: new Int32Array(width * height),
      pools,
      lakeMask,
      rooms: [
        { id: 0, cx: 1, cy: 2, w: 2, h: 1, type: "entrance" },
        { id: 1, cx: 5, cy: 2, w: 2, h: 2, type: "boss", grave: true, lake: true },
      ],
      props: [{ kind: "bossCrystal", x: 5, y: 2, roomId: 1 }],
      spawns: [{ x: 4, y: 2, roomId: 1, tier: 3 }],
      torches: [{ x: 2, y: 2, dx: 1, dy: 0 }],
      arches: [{ x: 3, y: 2, px: 0, py: 1, len: 1 }],
    },
  };
}

describe("Dungeon editor projection", () => {
  test("preserves Forge topology and authored feature layers", () => {
    const dungeon = makeForgeDungeon();
    const projection = createDungeonEditorProjection(dungeon);
    const at = (x: number, y: number) => y * dungeon.width + x;

    expect(projection.cells[at(3, 2)]).toBe(EDITOR_CELL_KIND.door);
    expect(projection.cells[at(3, 1)]).toBe(EDITOR_CELL_KIND.pool);
    expect(projection.cells[at(4, 1)]).toBe(EDITOR_CELL_KIND.lake);
    expect(projection.torches).toEqual([{ x: 2, y: 2 }]);
    expect(projection.enemySpawns).toHaveLength(1);
    expect(projection.enemySpawns[0]).toMatchObject({ cell: { x: 4, y: 2 }, tier: 3 });
    expect(ENEMY_ROSTER).toContain(projection.enemySpawns[0]?.kind);
    expect(projection.keyProps).toEqual([{ cell: { x: 5, y: 2 }, kind: "bossCrystal" }]);
    expect(projection.rooms).toContainEqual(
      expect.objectContaining({ id: 1, kind: "lake", label: "LAKE · BOSS" }),
    );
  });
});
