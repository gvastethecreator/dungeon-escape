import { validateDungeonParams, type DungeonParams } from "../domain/core";
import { hashSeed } from "../core/random";
import { FLOOR, WALL } from "./generateDungeon";
import type {
  DungeonData,
  DungeonEdge,
  DungeonRoom,
  ForgeArchMetadata,
  ForgePropMetadata,
  ForgeRoomMetadata,
  ForgeSpawnMetadata,
  ForgeTorchMetadata,
  GridCell,
  NormalizedDungeonOptions,
} from "./types";

type ForgeRoom = ForgeRoomMetadata;

interface ForgeEdge {
  a: number;
  b: number;
  isLoop: boolean;
}

export interface ForgeDungeonPayload {
  valid: boolean;
  seed: number;
  name: string;
  W: number;
  H: number;
  grid: Uint8Array | number[];
  roomId?: Int16Array | number[];
  corridor?: Uint8Array | number[];
  doorway?: Uint8Array | number[];
  bfs?: Int32Array | number[];
  maxBfs?: number;
  maxDepth?: number;
  rooms: ForgeRoom[];
  edges: ForgeEdge[];
  entrance: number;
  boss: number;
  props?: ForgePropMetadata[];
  spawns?: ForgeSpawnMetadata[];
  torches?: ForgeTorchMetadata[];
  pools?: GridCell[];
  lakeCells?: GridCell[];
  lakeMask?: Uint8Array | number[];
  arches?: ForgeArchMetadata[];
  params: {
    roomCount: number;
    loopChance: number;
    decorDensity: number;
    themeKey: string;
  };
}

/**
 * Convert the Creation DTO into the shared build contract. This deliberately
 * starts from contract defaults, never from the host form, so an imported map
 * carries its own reproducible settings.
 */
export function normalizeForgeDungeonParams(payload: ForgeDungeonPayload): DungeonParams {
  const roomDimensions = payload.rooms.flatMap((room) =>
    [room.w, room.h].filter((value) => Number.isFinite(value) && value > 0),
  );
  if (roomDimensions.length !== payload.rooms.length * 2) {
    throw new Error("Dungeon Creation room dimensions are invalid.");
  }
  const validation = validateDungeonParams(
    {
      roomTarget: payload.rooms.length,
      loopRate: Math.round(payload.params.loopChance * 100),
      decorDensity: Math.round(payload.params.decorDensity * 100),
      mapWidth: payload.W,
      mapHeight: payload.H,
      minRoomSize: Math.min(...roomDimensions),
      maxRoomSize: Math.max(...roomDimensions),
      profile: payload.params.themeKey,
    },
    { profile: "observed-build" },
  );
  if (!validation.ok) {
    throw new Error(`Dungeon Creation parameters are invalid: ${validation.message}.`);
  }
  return validation.params;
}

function normalizeUint8(
  source: Uint8Array | number[] | undefined,
  length: number,
  label: string,
): Uint8Array {
  if (!source) return new Uint8Array(length);
  if (source.length !== length)
    throw new Error(`Dungeon Creation: ${label} size does not match its bounds.`);
  return source instanceof Uint8Array ? source.slice() : Uint8Array.from(source);
}

function normalizeInt16(
  source: Int16Array | number[] | undefined,
  length: number,
  label: string,
): Int16Array {
  if (!source) return new Int16Array(length).fill(-1);
  if (source.length !== length)
    throw new Error(`Dungeon Creation: ${label} size does not match its bounds.`);
  return source instanceof Int16Array ? source.slice() : Int16Array.from(source);
}

function normalizeInt32(
  source: Int32Array | number[] | undefined,
  length: number,
  label: string,
): Int32Array {
  if (!source) return new Int32Array(length).fill(-1);
  if (source.length !== length)
    throw new Error(`Dungeon Creation: ${label} size does not match its bounds.`);
  return source instanceof Int32Array ? source.slice() : Int32Array.from(source);
}

function cellsToMask(
  cells: readonly GridCell[] | undefined,
  width: number,
  height: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const cell of cells ?? []) {
    if (
      !Number.isInteger(cell.x) ||
      !Number.isInteger(cell.y) ||
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= width ||
      cell.y >= height
    )
      continue;
    mask[cell.y * width + cell.x] = 1;
  }
  return mask;
}

export interface ForgeDungeonMessage {
  type: "black-flag:forge-dungeon";
  version: 1;
  dungeon: ForgeDungeonPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isForgeDungeonMessage(value: unknown): value is ForgeDungeonMessage {
  if (
    !isRecord(value) ||
    value.type !== "black-flag:forge-dungeon" ||
    value.version !== 1 ||
    !isRecord(value.dungeon)
  )
    return false;
  const dungeon = value.dungeon;
  return (
    dungeon.valid === true &&
    Number.isInteger(dungeon.W) &&
    Number.isInteger(dungeon.H) &&
    Number(dungeon.W) > 0 &&
    Number(dungeon.H) > 0 &&
    Array.isArray(dungeon.rooms) &&
    Array.isArray(dungeon.edges) &&
    (dungeon.grid instanceof Uint8Array || Array.isArray(dungeon.grid))
  );
}

function cellIndex(width: number, cell: GridCell): number {
  return cell.y * width + cell.x;
}

function floodFill(
  grid: readonly Uint8Array[],
  start: GridCell,
): { distances: Int32Array; visited: number } {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const distances = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  let visited = 0;
  if (grid[start.y]?.[start.x] !== FLOOR) return { distances, visited };
  queue[tail++] = cellIndex(width, start);
  distances[cellIndex(width, start)] = 0;
  while (head < tail) {
    const current = queue[head++] as number;
    visited += 1;
    const x = current % width;
    const y = Math.floor(current / width);
    const nextDistance = (distances[current] ?? -1) + 1;
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (grid[ny]?.[nx] !== FLOOR) continue;
      const next = ny * width + nx;
      if ((distances[next] ?? -1) >= 0) continue;
      distances[next] = nextDistance;
      queue[tail++] = next;
    }
  }
  return { distances, visited };
}

function roomBounds(
  payload: ForgeDungeonPayload,
  sourceRoom: ForgeRoom,
): Pick<DungeonRoom, "x" | "y" | "width" | "height"> {
  const ids = payload.roomId;
  let minX = payload.W;
  let minY = payload.H;
  let maxX = -1;
  let maxY = -1;
  if (ids && ids.length === payload.W * payload.H) {
    for (let index = 0; index < ids.length; index += 1) {
      if (ids[index] !== sourceRoom.id) continue;
      const x = index % payload.W;
      const y = Math.floor(index / payload.W);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX >= minX && maxY >= minY)
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const x = Math.max(0, Math.floor(sourceRoom.cx - sourceRoom.w / 2));
  const y = Math.max(0, Math.floor(sourceRoom.cy - sourceRoom.h / 2));
  return {
    x,
    y,
    width: Math.min(payload.W - x, Math.ceil(sourceRoom.w)),
    height: Math.min(payload.H - y, Math.ceil(sourceRoom.h)),
  };
}

function roomCenter(
  payload: ForgeDungeonPayload,
  room: ForgeRoom,
  grid: readonly Uint8Array[],
): GridCell {
  const preferred = { x: Math.round(room.cx), y: Math.round(room.cy) };
  if (grid[preferred.y]?.[preferred.x] === FLOOR) return preferred;
  const bounds = roomBounds(payload, room);
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1)
      if (grid[y]?.[x] === FLOOR) return { x, y };
  }
  throw new Error(`Dungeon Creation room ${room.id} has no walkable cell.`);
}

export function importDungeonForge(payload: ForgeDungeonPayload): DungeonData {
  if (!payload.valid) throw new Error("Dungeon Creation returned an unresolved dungeon.");
  if (
    !Number.isInteger(payload.W) ||
    !Number.isInteger(payload.H) ||
    payload.W < 3 ||
    payload.H < 3
  )
    throw new Error("Dungeon Creation returned invalid bounds.");
  if (payload.grid.length !== payload.W * payload.H)
    throw new Error("Dungeon Creation grid size does not match its bounds.");
  if (payload.rooms.length < 2) throw new Error("Dungeon Creation returned too few rooms.");

  const params = normalizeForgeDungeonParams(payload);
  const cellCount = payload.W * payload.H;
  const roomIds = normalizeInt16(payload.roomId, cellCount, "roomId");
  const corridors = normalizeUint8(payload.corridor, cellCount, "corridor");
  const doorways = normalizeUint8(payload.doorway, cellCount, "doorway");
  const sourceBfs = normalizeInt32(payload.bfs, cellCount, "bfs");
  const poolMask = cellsToMask(payload.pools, payload.W, payload.H);
  for (let index = 0; index < payload.grid.length; index += 1)
    if (payload.grid[index] === 3) poolMask[index] = 1;
  const lakeMask = payload.lakeMask
    ? normalizeUint8(payload.lakeMask, cellCount, "lakeMask")
    : cellsToMask(payload.lakeCells, payload.W, payload.H);

  const grid = Array.from({ length: payload.H }, (_, y) => {
    const row = new Uint8Array(payload.W).fill(WALL);
    for (let x = 0; x < payload.W; x += 1) {
      const value = payload.grid[y * payload.W + x];
      // Forge POOL cells are shallow water: the liquid kit renders their surface,
      // while the navigation grid keeps them walkable. Rendering and collision
      // must describe the same traversable space.
      if (value === FLOOR || value === 3) row[x] = FLOOR;
    }
    return row;
  });
  const entranceRoom = payload.rooms.find((room) => room.id === payload.entrance);
  const exitRoom = payload.rooms.find((room) => room.id === payload.boss);
  if (!entranceRoom || !exitRoom)
    throw new Error("Dungeon Creation entrance or boss room is missing.");
  const spawn = roomCenter(payload, entranceRoom, grid);
  const exit = roomCenter(payload, exitRoom, grid);
  const fill = floodFill(grid, spawn);
  const exitDistance = fill.distances[cellIndex(payload.W, exit)] ?? -1;
  if (exitDistance < 0) throw new Error("Dungeon Creation entrance cannot reach its boss room.");

  const rooms: DungeonRoom[] = payload.rooms.map((room) => ({
    id: room.id,
    ...roomBounds(payload, room),
    center: roomCenter(payload, room, grid),
    role: room.id === payload.entrance ? "entrance" : room.id === payload.boss ? "exit" : "room",
  }));
  const edges: DungeonEdge[] = payload.edges.map((edge) => {
    const left = rooms.find((room) => room.id === edge.a);
    const right = rooms.find((room) => room.id === edge.b);
    if (!left || !right) throw new Error("Dungeon Creation edge points to an unknown room.");
    return {
      left: edge.a,
      right: edge.b,
      distance: (left.center.x - right.center.x) ** 2 + (left.center.y - right.center.y) ** 2,
      kind: edge.isLoop ? "loop" : "tree",
    };
  });
  const seed = `CREATION-${payload.seed}`;
  const options: NormalizedDungeonOptions = {
    width: params.mapWidth,
    height: params.mapHeight,
    roomTarget: params.roomTarget,
    minRoomSize: params.minRoomSize,
    maxRoomSize: params.maxRoomSize,
    roomPadding: params.roomPadding,
    corridorRadius: params.corridorRadius,
    extraConnectionRate: params.loopRate / 100,
    placementAttemptsPerRoom: 300,
  };
  let floorCount = 0;
  grid.forEach((row) =>
    row.forEach((cell) => {
      if (cell === FLOOR) floorCount += 1;
    }),
  );
  const edgeSignature = edges.map((edge) => `${edge.left}-${edge.right}-${edge.kind}`).join("|");
  return {
    seed,
    seedHash: hashSeed(seed),
    options,
    grid,
    width: payload.W,
    height: payload.H,
    rooms,
    edges,
    spawn,
    exit,
    entranceRoomId: payload.entrance,
    exitRoomId: payload.boss,
    distances: fill.distances,
    topologySignature: `${payload.entrance}>${payload.boss}:${edgeSignature}`,
    stats: {
      roomCount: rooms.length,
      floorCount,
      reachableFloorCount: fill.visited,
      edgeCount: edges.length,
      loopCount: edges.filter((edge) => edge.kind === "loop").length,
      exitDistance,
    },
    forge: {
      name: payload.name,
      themeKey: params.profile,
      roomTypes: Object.fromEntries(payload.rooms.map((room) => [room.id, room.type])),
      source: "dungeon-forge",
      seed: payload.seed,
      decorDensity: params.decorDensity / 100,
      maxBfs: payload.maxBfs ?? Math.max(...sourceBfs),
      maxDepth: payload.maxDepth ?? Math.max(...payload.rooms.map((room) => room.depth ?? 0)),
      roomIds,
      corridors,
      doorways,
      bfs: sourceBfs,
      pools: poolMask,
      lakeMask,
      rooms: payload.rooms.map((room) => ({ ...room })),
      props: (payload.props ?? []).map((prop) => ({ ...prop })),
      spawns: (payload.spawns ?? []).map((spawn) => ({ ...spawn })),
      torches: (payload.torches ?? []).map((torch) => ({ ...torch })),
      arches: (payload.arches ?? []).map((arch) => ({ ...arch })),
    },
  };
}

export type PreparedDungeonForge = {
  dungeon: DungeonData;
  params: DungeonParams;
};

/** Fully import and validate the graph before the host commits any domain state. */
export function prepareDungeonForge(payload: ForgeDungeonPayload): PreparedDungeonForge {
  const dungeon = importDungeonForge(payload);
  return { dungeon, params: normalizeForgeDungeonParams(payload) };
}
