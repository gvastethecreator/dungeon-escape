import type { DungeonData } from "./types";
import { FLOOR as PLAY_FLOOR } from "./generateDungeon";

/** Forge grid constants (must match ForgeProceduralPrimitives). */
const FORGE_VOID = 0;
const FORGE_FLOOR = 1;
const FORGE_WALL = 2;

export interface ForgePresentationPayload {
  valid: boolean;
  seed: number;
  name: string;
  W: number;
  H: number;
  grid: Uint8Array;
  roomId: Int16Array;
  corridor: Uint8Array;
  doorway: Uint8Array;
  bfs: Int16Array;
  maxBfs: number;
  maxDepth: number;
  rooms: Array<{
    id: number;
    cx: number;
    cy: number;
    w: number;
    h: number;
    arch: "s" | "m" | "l";
    shape: "rect";
    type: "entrance" | "combat" | "boss";
    depth: number;
    difficulty: number;
    degree: number;
  }>;
  edges: Array<{ a: number; b: number; isLoop: boolean }>;
  entrance: number;
  boss: number;
  props: [];
  spawns: [];
  torches: [];
  pools: [];
  lakeCells: [];
  lakeMask: Uint8Array;
  arches: [];
  params: {
    roomCount: number;
    loopChance: number;
    decorDensity: number;
    themeKey: string;
  };
  stats: {
    rooms: number;
    edges: number;
    loops: number;
    critLen: number;
    floorTiles: number;
    genMs: number;
    attempts: number;
  };
}

function isPlayFloor(dungeon: DungeonData, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) return false;
  return dungeon.grid[y]?.[x] === PLAY_FLOOR;
}

/**
 * Project the first-person play layout into the Forge isometric payload so the
 * start theater can animate the exact dungeon topology the player will explore.
 *
 * Play only stores FLOOR/WALL. Forge paints VOID outside the carved structure
 * and WALL only on the shell that touches floor — same silhouette as a real map.
 */
export function exportPlayDungeonToForgePresentation(
  dungeon: DungeonData,
  themeKey: string,
): ForgePresentationPayload {
  const W = dungeon.width;
  const H = dungeon.height;
  const cellCount = W * H;
  const grid = new Uint8Array(cellCount);
  const roomId = new Int16Array(cellCount).fill(-1);
  const corridor = new Uint8Array(cellCount);
  const doorway = new Uint8Array(cellCount);
  const bfs = new Int16Array(cellCount).fill(-1);
  const lakeMask = new Uint8Array(cellCount);

  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const index = y * W + x;
      const dist = dungeon.distances[index] ?? -1;
      bfs[index] = dist > 32767 ? 32767 : dist < -1 ? -1 : dist;

      if (isPlayFloor(dungeon, x, y)) {
        grid[index] = FORGE_FLOOR;
        continue;
      }

      // Wall only when it borders a walkable cell; everything else stays void so
      // the isometric theater shows the real dungeon outline, not a filled slab.
      const touchesFloor =
        isPlayFloor(dungeon, x + 1, y) ||
        isPlayFloor(dungeon, x - 1, y) ||
        isPlayFloor(dungeon, x, y + 1) ||
        isPlayFloor(dungeon, x, y - 1) ||
        isPlayFloor(dungeon, x + 1, y + 1) ||
        isPlayFloor(dungeon, x - 1, y + 1) ||
        isPlayFloor(dungeon, x + 1, y - 1) ||
        isPlayFloor(dungeon, x - 1, y - 1);
      grid[index] = touchesFloor ? FORGE_WALL : FORGE_VOID;
    }
  }

  // Paint room ids from room rectangles (rooms overwrite corridors).
  for (const room of dungeon.rooms) {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const index = y * W + x;
        if (grid[index] !== FORGE_FLOOR) continue;
        roomId[index] = room.id;
      }
    }
  }

  // Floor cells outside any room are corridors.
  for (let index = 0; index < cellCount; index += 1) {
    if (grid[index] === FORGE_FLOOR && roomId[index] === -1) corridor[index] = 1;
  }

  const maxBfs = Math.max(0, dungeon.stats.exitDistance | 0);
  const degree = new Map<number, number>();
  for (const edge of dungeon.edges) {
    degree.set(edge.left, (degree.get(edge.left) ?? 0) + 1);
    degree.set(edge.right, (degree.get(edge.right) ?? 0) + 1);
  }

  const rooms = dungeon.rooms.map((room) => {
    const centerDist = dungeon.distances[room.center.y * W + room.center.x] ?? 0;
    const area = room.width * room.height;
    const arch: "s" | "m" | "l" = area <= 30 ? "s" : area <= 64 ? "m" : "l";
    const type =
      room.role === "entrance" ? ("entrance" as const) : room.role === "exit" ? ("boss" as const) : ("combat" as const);
    return {
      id: room.id,
      cx: room.center.x,
      cy: room.center.y,
      w: room.width,
      h: room.height,
      arch,
      shape: "rect" as const,
      type,
      depth: Math.max(0, centerDist),
      difficulty: maxBfs > 0 ? Math.min(1, Math.max(0, centerDist / maxBfs)) : 0.5,
      degree: degree.get(room.id) ?? 0,
    };
  });

  // buildScene indexes rooms[roomId[cell]] — array must be dense by room id.
  const byId = new Map(rooms.map((room) => [room.id, room]));
  const maxId = Math.max(0, ...rooms.map((room) => room.id));
  const denseRooms = Array.from({ length: maxId + 1 }, (_, id) => {
    const room = byId.get(id);
    if (room) return room;
    return {
      id,
      cx: 0,
      cy: 0,
      w: 1,
      h: 1,
      arch: "s" as const,
      shape: "rect" as const,
      type: "combat" as const,
      depth: 0,
      difficulty: 0,
      degree: 0,
    };
  });

  return {
    valid: true,
    seed: dungeon.seedHash >>> 0,
    name: dungeon.seed,
    W,
    H,
    grid,
    roomId,
    corridor,
    doorway,
    bfs,
    maxBfs,
    maxDepth: maxBfs,
    rooms: denseRooms,
    edges: dungeon.edges.map((edge) => ({
      a: edge.left,
      b: edge.right,
      isLoop: edge.kind === "loop",
    })),
    entrance: dungeon.entranceRoomId,
    boss: dungeon.exitRoomId,
    props: [],
    spawns: [],
    torches: [],
    pools: [],
    lakeCells: [],
    lakeMask,
    arches: [],
    params: {
      roomCount: dungeon.rooms.length,
      loopChance: dungeon.options.extraConnectionRate,
      decorDensity: 0.45,
      themeKey: themeKey || "ancient",
    },
    stats: {
      rooms: dungeon.stats.roomCount,
      edges: dungeon.stats.edgeCount,
      loops: dungeon.stats.loopCount,
      critLen: Math.max(1, dungeon.rooms.length),
      floorTiles: dungeon.stats.floorCount,
      genMs: 0,
      attempts: 1,
    },
  };
}
