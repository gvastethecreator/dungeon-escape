import { describe, expect, test } from "bun:test";

import { FLOOR } from "../src/dungeon/generateDungeon";
import {
  importDungeonForge,
  isForgeDungeonMessage,
  type ForgeDungeonPayload,
} from "../src/dungeon/importDungeonForge";

const W = 7;
const H = 5;
const index = (x: number, y: number) => y * W + x;
const grid = new Uint8Array(W * H);
for (let x = 1; x <= 5; x += 1) grid[index(x, 2)] = 1;
grid[index(3, 1)] = 3;
const roomId = new Int16Array(W * H).fill(-1);
for (const x of [1, 2]) roomId[index(x, 2)] = 0;
for (const x of [4, 5]) roomId[index(x, 2)] = 1;
const corridor = new Uint8Array(W * H);
corridor[index(3, 2)] = 1;
const doorway = new Uint8Array(W * H);
doorway[index(3, 2)] = 1;

const payload: ForgeDungeonPayload = {
  valid: true,
  seed: 1337,
  name: "Test Crypt",
  W,
  H,
  grid,
  roomId,
  corridor,
  doorway,
  bfs: Int32Array.from({ length: W * H }, (_, cell) => (cell === index(3, 2) ? 2 : -1)),
  maxBfs: 4,
  maxDepth: 1,
  rooms: [
    {
      id: 0,
      cx: 1,
      cy: 2,
      w: 2,
      h: 1,
      type: "entrance",
      arch: "rect",
      shape: "wide",
      depth: 0,
      difficulty: 0,
      degree: 1,
    },
    {
      id: 1,
      cx: 5,
      cy: 2,
      w: 2,
      h: 1,
      type: "boss",
      arch: "apse",
      shape: "tall",
      depth: 1,
      difficulty: 3,
      degree: 1,
      grave: true,
    },
  ],
  edges: [{ a: 0, b: 1, isLoop: false }],
  entrance: 0,
  boss: 1,
  props: [{ kind: "banner", x: 4, y: 2, roomId: 1, dx: -1, dy: 0, scale: 1.2 }],
  spawns: [{ x: 4, y: 2, tier: 3, roomId: 1 }],
  torches: [{ x: 2, y: 2, dx: 0, dy: -1 }],
  pools: [{ x: 3, y: 1 }],
  lakeMask: Uint8Array.from({ length: W * H }, (_, cell) => (cell === index(4, 2) ? 1 : 0)),
  arches: [{ x: 3, y: 2, px: 0, py: 1, len: 1 }],
  params: { roomCount: 2, loopChance: 0.2, decorDensity: 0.7, themeKey: "grim" },
};

describe("Dungeon Forge import bridge", () => {
  test("accepts the versioned host message", () => {
    expect(
      isForgeDungeonMessage({ type: "black-flag:forge-dungeon", version: 1, dungeon: payload }),
    ).toBe(true);
    expect(
      isForgeDungeonMessage({ type: "black-flag:forge-dungeon", version: 2, dungeon: payload }),
    ).toBe(false);
  });

  test("preserves Forge water as a visible, walkable part of the navigation grid", () => {
    const dungeon = importDungeonForge(payload);
    expect(dungeon.options).toMatchObject({
      width: W,
      height: H,
      roomTarget: payload.rooms.length,
      minRoomSize: 1,
      maxRoomSize: 2,
    });
    expect(dungeon.grid[1]?.[3]).toBe(FLOOR);
    expect(dungeon.spawn).toEqual({ x: 1, y: 2 });
    expect(dungeon.exit).toEqual({ x: 5, y: 2 });
    expect(dungeon.stats.reachableFloorCount).toBe(6);
    expect(dungeon.stats.exitDistance).toBe(4);
    expect(dungeon.forge).toEqual(
      expect.objectContaining({ name: "Test Crypt", themeKey: "grim", seed: 1337, maxDepth: 1 }),
    );
    expect(dungeon.forge?.doorways[index(3, 2)]).toBe(1);
    expect(dungeon.forge?.pools[index(3, 1)]).toBe(1);
    expect(dungeon.forge?.lakeMask[index(4, 2)]).toBe(1);
    expect(dungeon.forge?.rooms[1]).toEqual(
      expect.objectContaining({ type: "boss", arch: "apse", grave: true }),
    );
    expect(dungeon.forge?.props).toEqual(payload.props);
    expect(dungeon.forge?.spawns).toEqual(payload.spawns);
    expect(dungeon.forge?.torches).toEqual(payload.torches);
    expect(dungeon.forge?.arches).toEqual(payload.arches);
  });

  test("rejects malformed grid and semantic dimensions", () => {
    expect(() => importDungeonForge({ ...payload, grid: new Uint8Array(2) })).toThrow("grid size");
    expect(() => importDungeonForge({ ...payload, doorway: new Uint8Array(2) })).toThrow(
      "doorway size",
    );
  });
});
