import type { DungeonParams } from "../domain/core";
import { listForgeBiomeIds } from "../systems/BiomeIdentity";
import {
  prepareDungeonForge,
  type ForgeDungeonPayload,
  type PreparedDungeonForge,
} from "./importDungeonForge";
import type {
  DungeonData,
  ForgeArchMetadata,
  ForgePropMetadata,
  ForgeRoomMetadata,
  ForgeSpawnMetadata,
  ForgeTorchMetadata,
  GridCell,
} from "./types";

const FORGE_DUNGEON_MESSAGE_TYPE = "black-flag:forge-dungeon";
const MAX_FORGE_DIMENSION = 1024;
const MAX_FORGE_CELL_COUNT = 1_048_576;
const MAX_FORGE_ROOM_COUNT = 80;
const MAX_FORGE_PROP_SCALE = 8;
const MAX_FORGE_SPAWN_TIER = 3;
const FORGE_BIOME_IDS = new Set<string>(listForgeBiomeIds());
const FORGE_FLOOR_CELL = 1;
const FORGE_WALL_CELL = 2;
const FORGE_POOL_CELL = 3;

export type ForgeIntakeErrorCode =
  | "invalid-envelope"
  | "unsupported-version"
  | "invalid-payload"
  | "invalid-params"
  | "invalid-topology"
  | "internal-error";

export type ForgeIntakeError = Readonly<{
  code: ForgeIntakeErrorCode;
  message: string;
  path?: string;
}>;

export type ForgeDungeonIntakeValue = Readonly<{
  dungeon: DungeonData;
  params: Readonly<DungeonParams>;
}>;

export type ForgeDungeonIntakeResult =
  | Readonly<{ kind: "ignored" }>
  | Readonly<{ kind: "rejected"; error: ForgeIntakeError }>
  | Readonly<{ kind: "accepted"; value: ForgeDungeonIntakeValue }>;

type ForgePayloadParse =
  | Readonly<{ ok: true; value: ForgeDungeonPayload }>
  | Readonly<{ ok: false; error: ForgeIntakeError }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return Number.isSafeInteger(value);
}

function isHalfInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isSafeInteger(value * 2);
}

function isCellInBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function isCardinalDirection(dx: number, dy: number): boolean {
  return Number.isSafeInteger(dx) && Number.isSafeInteger(dy) && Math.abs(dx) + Math.abs(dy) === 1;
}

function gridIndex(width: number, x: number, y: number): number {
  return y * width + x;
}

function maxArrayEntry(source: ArrayLike<number>): number {
  let maximum = -1;
  for (let index = 0; index < source.length; index += 1)
    maximum = Math.max(maximum, source[index]!);
  return maximum;
}

function isWalkableGridCell(grid: ArrayLike<number>, width: number, x: number, y: number): boolean {
  const value = grid[gridIndex(width, x, y)];
  return value === FORGE_FLOOR_CELL || value === FORGE_POOL_CELL;
}

function hasSingleWalkableComponent(
  grid: ArrayLike<number>,
  width: number,
  height: number,
): boolean {
  const cellCount = width * height;
  let start = -1;
  let walkableCount = 0;
  for (let index = 0; index < cellCount; index += 1) {
    const value = grid[index];
    if (value !== FORGE_FLOOR_CELL && value !== FORGE_POOL_CELL) continue;
    if (start < 0) start = index;
    walkableCount += 1;
  }
  if (start < 0) return false;

  const visited = new Uint8Array(cellCount);
  const queue = new Int32Array(walkableCount);
  let head = 0;
  let tail = 0;
  let reached = 1;
  visited[start] = 1;
  queue[tail++] = start;
  const enqueueWalkable = (next: number) => {
    if (visited[next]) return;
    const value = grid[next];
    if (value !== FORGE_FLOOR_CELL && value !== FORGE_POOL_CELL) return;
    visited[next] = 1;
    queue[tail++] = next;
    reached += 1;
  };
  while (head < tail) {
    const current = queue[head++]!;
    const x = current % width;
    if (x > 0) enqueueWalkable(current - 1);
    if (x < width - 1) enqueueWalkable(current + 1);
    if (current >= width) enqueueWalkable(current - width);
    if (current < cellCount - width) enqueueWalkable(current + width);
  }
  return reached === walkableCount;
}

function computeFloorDistances(
  grid: ArrayLike<number>,
  width: number,
  height: number,
  startX: number,
  startY: number,
): Int32Array | null {
  if (
    !isCellInBounds(startX, startY, width, height) ||
    grid[gridIndex(width, startX, startY)] !== FORGE_FLOOR_CELL
  )
    return null;
  const cellCount = width * height;
  const distances = new Int32Array(cellCount).fill(-1);
  const queue = new Int32Array(cellCount);
  let head = 0;
  let tail = 0;
  const start = gridIndex(width, startX, startY);
  distances[start] = 0;
  queue[tail++] = start;
  const enqueueFloor = (next: number, distance: number) => {
    if (distances[next] >= 0 || grid[next] !== FORGE_FLOOR_CELL) return;
    distances[next] = distance;
    queue[tail++] = next;
  };
  while (head < tail) {
    const current = queue[head++]!;
    const x = current % width;
    const distance = distances[current]! + 1;
    if (x > 0) enqueueFloor(current - 1, distance);
    if (x < width - 1) enqueueFloor(current + 1, distance);
    if (current >= width) enqueueFloor(current - width, distance);
    if (current < cellCount - width) enqueueFloor(current + width, distance);
  }
  return distances;
}

function isForgeBiomeId(value: unknown): value is string {
  return typeof value === "string" && FORGE_BIOME_IDS.has(value);
}

function reject(
  code: ForgeIntakeErrorCode,
  message: string,
  path?: string,
): ForgeDungeonIntakeResult {
  return { kind: "rejected", error: { code, message, path } };
}

function invalidPayload(message: string, path?: string): ForgePayloadParse {
  return { ok: false, error: { code: "invalid-payload", message, path } };
}

function invalidParams(message: string, path?: string): ForgePayloadParse {
  return { ok: false, error: { code: "invalid-params", message, path } };
}

function invalidTopology(message: string, path?: string): ForgePayloadParse {
  return { ok: false, error: { code: "invalid-topology", message, path } };
}

function parseUint8Array(
  value: unknown,
  path: string,
  expectedLength: number,
  maxValue = 255,
): Uint8Array | number[] | ForgeIntakeError {
  const source = value instanceof Uint8Array ? value : Array.isArray(value) ? value : null;
  if (!source)
    return { code: "invalid-payload", message: "Dungeon Creation grid data is invalid.", path };
  if (source.length !== expectedLength)
    return {
      code: "invalid-payload",
      message: "Dungeon Creation grid size does not match its bounds.",
      path,
    };
  if (!Array.from(source).every((cell) => isInteger(cell) && cell >= 0 && cell <= maxValue))
    return {
      code: "invalid-payload",
      message: "Dungeon Creation cell data has unsupported values.",
      path,
    };
  return source instanceof Uint8Array ? source.slice() : [...source];
}

function parseInt16Array(
  value: unknown,
  path: string,
  expectedLength: number,
): Int16Array | number[] | ForgeIntakeError {
  const source = value instanceof Int16Array ? value : Array.isArray(value) ? value : null;
  if (!source)
    return { code: "invalid-payload", message: "Dungeon Creation room ids are invalid.", path };
  if (source.length !== expectedLength)
    return {
      code: "invalid-payload",
      message: "Dungeon Creation room id size does not match its bounds.",
      path,
    };
  if (!Array.from(source).every((cell) => isInteger(cell) && cell >= -32768 && cell <= 32767))
    return {
      code: "invalid-payload",
      message: "Dungeon Creation room ids must be 16-bit integers.",
      path,
    };
  return source instanceof Int16Array ? source.slice() : [...source];
}

function parseBfsArray(
  value: unknown,
  path: string,
  expectedLength: number,
): Int16Array | Int32Array | number[] | ForgeIntakeError {
  const source =
    value instanceof Int16Array || value instanceof Int32Array
      ? value
      : Array.isArray(value)
        ? value
        : null;
  if (!source)
    return { code: "invalid-payload", message: "Dungeon Creation BFS data is invalid.", path };
  if (source.length !== expectedLength)
    return {
      code: "invalid-payload",
      message: "Dungeon Creation BFS size does not match its bounds.",
      path,
    };
  if (!Array.from(source).every((cell) => isInteger(cell) && cell >= -1 && cell < expectedLength))
    return {
      code: "invalid-payload",
      message: "Dungeon Creation BFS values are outside the grid distance range.",
      path,
    };
  if (source instanceof Int16Array || source instanceof Int32Array) return source.slice();
  return [...source];
}

function isIntakeError(value: unknown): value is ForgeIntakeError {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    (value.path === undefined || typeof value.path === "string")
  );
}

function parseRoom(value: unknown, path: string): ForgeRoomMetadata | ForgeIntakeError {
  if (!isRecord(value))
    return { code: "invalid-payload", message: "Dungeon Creation room data is invalid.", path };
  if (
    !isInteger(value.id) ||
    value.id < 0 ||
    value.id > 32767 ||
    !isInteger(value.cx) ||
    !isInteger(value.cy) ||
    !isInteger(value.w) ||
    value.w <= 0 ||
    !isInteger(value.h) ||
    value.h <= 0 ||
    typeof value.type !== "string" ||
    !value.type.trim()
  )
    return {
      code: "invalid-payload",
      message: "Dungeon Creation room fields are invalid.",
      path,
    };
  if (
    (value.arch !== undefined && typeof value.arch !== "string") ||
    (value.shape !== undefined && typeof value.shape !== "string") ||
    (value.depth !== undefined && (!isInteger(value.depth) || value.depth < 0)) ||
    (value.difficulty !== undefined &&
      (!isFiniteNumber(value.difficulty) || value.difficulty < 0 || value.difficulty > 1)) ||
    (value.degree !== undefined && (!isInteger(value.degree) || value.degree < 0)) ||
    (value.grave !== undefined && typeof value.grave !== "boolean") ||
    (value.lake !== undefined && typeof value.lake !== "boolean")
  )
    return {
      code: "invalid-payload",
      message: "Dungeon Creation room metadata is invalid.",
      path,
    };
  return {
    id: value.id,
    cx: value.cx,
    cy: value.cy,
    w: value.w,
    h: value.h,
    type: value.type,
    ...(typeof value.arch === "string" ? { arch: value.arch } : {}),
    ...(typeof value.shape === "string" ? { shape: value.shape } : {}),
    ...(isFiniteNumber(value.depth) ? { depth: value.depth } : {}),
    ...(isFiniteNumber(value.difficulty) ? { difficulty: value.difficulty } : {}),
    ...(isFiniteNumber(value.degree) ? { degree: value.degree } : {}),
    ...(typeof value.grave === "boolean" ? { grave: value.grave } : {}),
    ...(typeof value.lake === "boolean" ? { lake: value.lake } : {}),
  };
}

function parseEdge(
  value: unknown,
  path: string,
): { a: number; b: number; isLoop: boolean } | ForgeIntakeError {
  if (
    !isRecord(value) ||
    !isInteger(value.a) ||
    !isInteger(value.b) ||
    typeof value.isLoop !== "boolean"
  )
    return { code: "invalid-payload", message: "Dungeon Creation edge data is invalid.", path };
  return { a: value.a, b: value.b, isLoop: value.isLoop };
}

function parseCell(value: unknown, path: string): GridCell | ForgeIntakeError {
  if (!isRecord(value) || !isInteger(value.x) || !isInteger(value.y))
    return { code: "invalid-payload", message: "Dungeon Creation cell data is invalid.", path };
  return { x: value.x, y: value.y };
}

function parseProp(value: unknown, path: string): ForgePropMetadata | ForgeIntakeError {
  if (
    !isRecord(value) ||
    typeof value.kind !== "string" ||
    !value.kind.trim() ||
    !isInteger(value.x) ||
    !isInteger(value.y)
  )
    return { code: "invalid-payload", message: "Dungeon Creation prop data is invalid.", path };
  if (
    (value.roomId !== undefined && !isInteger(value.roomId)) ||
    (value.rot !== undefined && !isFiniteNumber(value.rot)) ||
    (value.scale !== undefined &&
      (!isFiniteNumber(value.scale) || value.scale <= 0 || value.scale > MAX_FORGE_PROP_SCALE)) ||
    (value.v !== undefined && (!isInteger(value.v) || value.v < 0 || value.v > 2)) ||
    ((value.dx !== undefined || value.dy !== undefined) &&
      (!isInteger(value.dx) || !isInteger(value.dy) || !isCardinalDirection(value.dx, value.dy))) ||
    (value.ice !== undefined &&
      typeof value.ice !== "boolean" &&
      value.ice !== 0 &&
      value.ice !== 1)
  )
    return {
      code: "invalid-payload",
      message: "Dungeon Creation prop metadata is invalid.",
      path,
    };
  return {
    kind: value.kind,
    x: value.x,
    y: value.y,
    ...(isInteger(value.roomId) ? { roomId: value.roomId } : {}),
    ...(isFiniteNumber(value.rot) ? { rot: value.rot } : {}),
    ...(isFiniteNumber(value.scale) ? { scale: value.scale } : {}),
    ...(isFiniteNumber(value.v) ? { v: value.v } : {}),
    ...(isFiniteNumber(value.dx) ? { dx: value.dx } : {}),
    ...(isFiniteNumber(value.dy) ? { dy: value.dy } : {}),
    ...(value.ice !== undefined ? { ice: Boolean(value.ice) } : {}),
  };
}

function parseSpawn(value: unknown, path: string): ForgeSpawnMetadata | ForgeIntakeError {
  if (
    !isRecord(value) ||
    !isInteger(value.x) ||
    !isInteger(value.y) ||
    !isInteger(value.tier) ||
    value.tier < 1 ||
    value.tier > MAX_FORGE_SPAWN_TIER ||
    !isInteger(value.roomId)
  )
    return { code: "invalid-payload", message: "Dungeon Creation spawn data is invalid.", path };
  return { x: value.x, y: value.y, tier: value.tier, roomId: value.roomId };
}

function parseTorch(value: unknown, path: string): ForgeTorchMetadata | ForgeIntakeError {
  if (
    !isRecord(value) ||
    !isInteger(value.x) ||
    !isInteger(value.y) ||
    !isInteger(value.dx) ||
    !isInteger(value.dy) ||
    !isCardinalDirection(value.dx, value.dy)
  )
    return { code: "invalid-payload", message: "Dungeon Creation torch data is invalid.", path };
  return { x: value.x, y: value.y, dx: value.dx, dy: value.dy };
}

function parseArch(value: unknown, path: string): ForgeArchMetadata | ForgeIntakeError {
  if (
    !isRecord(value) ||
    !isHalfInteger(value.x) ||
    !isHalfInteger(value.y) ||
    !isInteger(value.px) ||
    !isInteger(value.py) ||
    !isInteger(value.len) ||
    value.len < 1 ||
    value.len > 3 ||
    !isCardinalDirection(value.px, value.py) ||
    ((value.roomDx !== undefined || value.roomDy !== undefined) &&
      (!isInteger(value.roomDx) ||
        !isInteger(value.roomDy) ||
        !isCardinalDirection(value.roomDx, value.roomDy)))
  )
    return { code: "invalid-payload", message: "Dungeon Creation arch data is invalid.", path };
  return {
    x: value.x,
    y: value.y,
    px: value.px,
    py: value.py,
    len: value.len,
    ...(isFiniteNumber(value.roomDx) ? { roomDx: value.roomDx } : {}),
    ...(isFiniteNumber(value.roomDy) ? { roomDy: value.roomDy } : {}),
  };
}

function parseArray<T>(
  value: unknown,
  path: string,
  parser: (entry: unknown, entryPath: string) => T | ForgeIntakeError,
  maxLength = Number.POSITIVE_INFINITY,
): T[] | ForgeIntakeError {
  if (!Array.isArray(value))
    return { code: "invalid-payload", message: "Dungeon Creation list data is invalid.", path };
  if (value.length > maxLength)
    return { code: "invalid-payload", message: "Dungeon Creation list is too large.", path };
  const parsed: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = parser(value[index], `${path}[${index}]`);
    if (isIntakeError(entry)) return entry;
    parsed.push(entry);
  }
  return parsed;
}

function parseOptionalArray<T>(
  value: unknown,
  path: string,
  parser: (entry: unknown, entryPath: string) => T | ForgeIntakeError,
  maxLength = Number.POSITIVE_INFINITY,
): T[] | undefined | ForgeIntakeError {
  if (value === undefined) return undefined;
  return parseArray(value, path, parser, maxLength);
}

function parsePayload(raw: unknown): ForgePayloadParse {
  if (!isRecord(raw)) return invalidPayload("Dungeon Creation payload is missing.", "dungeon");
  if (raw.valid !== true)
    return invalidPayload("Dungeon Creation returned an unresolved dungeon.", "dungeon.valid");
  if (!isInteger(raw.seed) || raw.seed < 0 || raw.seed > 0xffffffff)
    return invalidPayload("Dungeon Creation seed is invalid.", "dungeon.seed");
  if (typeof raw.name !== "string" || !raw.name.trim())
    return invalidPayload("Dungeon Creation name is invalid.", "dungeon.name");
  if (
    !isInteger(raw.W) ||
    !isInteger(raw.H) ||
    raw.W < 3 ||
    raw.H < 3 ||
    raw.W > MAX_FORGE_DIMENSION ||
    raw.H > MAX_FORGE_DIMENSION
  )
    return invalidPayload("Dungeon Creation returned invalid bounds.", "dungeon.bounds");
  const cellCount = raw.W * raw.H;
  if (!Number.isSafeInteger(cellCount) || cellCount < 1 || cellCount > MAX_FORGE_CELL_COUNT)
    return invalidPayload("Dungeon Creation bounds are too large.", "dungeon.bounds");
  if (!isInteger(raw.entrance) || !isInteger(raw.boss))
    return invalidPayload("Dungeon Creation entrance or boss room is invalid.", "dungeon.entrance");
  if (!isRecord(raw.params))
    return invalidPayload("Dungeon Creation parameters are missing.", "dungeon.params");
  if (
    !isInteger(raw.params.roomCount) ||
    raw.params.roomCount < 2 ||
    raw.params.roomCount > MAX_FORGE_ROOM_COUNT ||
    !isFiniteNumber(raw.params.loopChance) ||
    raw.params.loopChance < 0 ||
    raw.params.loopChance > 1 ||
    !isFiniteNumber(raw.params.decorDensity) ||
    raw.params.decorDensity < 0 ||
    raw.params.decorDensity > 1
  )
    return invalidParams("Dungeon Creation parameters are invalid.", "dungeon.params");
  if (!isForgeBiomeId(raw.params.themeKey))
    return invalidParams(
      "Dungeon Creation theme is not supported by Forge.",
      "dungeon.params.themeKey",
    );

  const grid = parseUint8Array(raw.grid, "dungeon.grid", cellCount, 3);
  if (isIntakeError(grid)) return { ok: false, error: grid };
  if (!hasSingleWalkableComponent(grid, raw.W, raw.H))
    return invalidTopology(
      "Dungeon Creation walkable cells must form one connected component.",
      "dungeon.grid",
    );
  const roomId =
    raw.roomId === undefined ? undefined : parseInt16Array(raw.roomId, "dungeon.roomId", cellCount);
  if (isIntakeError(roomId)) return { ok: false, error: roomId };
  const corridor =
    raw.corridor === undefined
      ? undefined
      : parseUint8Array(raw.corridor, "dungeon.corridor", cellCount, 1);
  if (isIntakeError(corridor)) return { ok: false, error: corridor };
  const doorway =
    raw.doorway === undefined
      ? undefined
      : parseUint8Array(raw.doorway, "dungeon.doorway", cellCount, 1);
  if (isIntakeError(doorway)) return { ok: false, error: doorway };
  const bfs = raw.bfs === undefined ? undefined : parseBfsArray(raw.bfs, "dungeon.bfs", cellCount);
  if (isIntakeError(bfs)) return { ok: false, error: bfs };
  const lakeMask =
    raw.lakeMask === undefined
      ? undefined
      : parseUint8Array(raw.lakeMask, "dungeon.lakeMask", cellCount, 1);
  if (isIntakeError(lakeMask)) return { ok: false, error: lakeMask };

  const rooms = parseArray(raw.rooms, "dungeon.rooms", parseRoom, MAX_FORGE_ROOM_COUNT);
  if (isIntakeError(rooms)) return { ok: false, error: rooms };
  if (rooms.length < 2)
    return invalidPayload("Dungeon Creation returned too few rooms.", "dungeon.rooms");
  if (raw.params.roomCount !== rooms.length)
    return invalidParams(
      "Dungeon Creation room count does not match its room metadata.",
      "dungeon.params.roomCount",
    );
  const roomIds = new Set(rooms.map((room) => room.id));
  if (roomIds.size !== rooms.length)
    return invalidTopology("Dungeon Creation room ids must be unique.", "dungeon.rooms");
  for (const [index, room] of rooms.entries()) {
    if (room.depth !== undefined && room.depth > rooms.length - 1)
      return invalidTopology(
        "Dungeon Creation room depth exceeds its room graph.",
        `dungeon.rooms[${index}].depth`,
      );
    if (room.degree !== undefined && room.degree > rooms.length - 1)
      return invalidTopology(
        "Dungeon Creation room degree exceeds its room graph.",
        `dungeon.rooms[${index}].degree`,
      );
  }
  if (!roomIds.has(raw.entrance) || !roomIds.has(raw.boss))
    return invalidTopology(
      "Dungeon Creation entrance or boss room is missing.",
      "dungeon.entrance",
    );
  if (raw.entrance === raw.boss)
    return invalidTopology(
      "Dungeon Creation entrance and boss must be different rooms.",
      "dungeon.boss",
    );
  const entranceRoom = rooms.find((room) => room.id === raw.entrance)!;
  const bossRoom = rooms.find((room) => room.id === raw.boss)!;
  if (entranceRoom.cx === bossRoom.cx && entranceRoom.cy === bossRoom.cy)
    return invalidTopology(
      "Dungeon Creation entrance and boss centers must be distinct.",
      "dungeon.rooms",
    );
  if (bfs) {
    const expectedBfs = computeFloorDistances(grid, raw.W, raw.H, entranceRoom.cx, entranceRoom.cy);
    if (!expectedBfs)
      return invalidTopology(
        "Dungeon Creation BFS must start on the entrance floor.",
        "dungeon.bfs",
      );
    for (let index = 0; index < bfs.length; index += 1) {
      if (bfs[index] === expectedBfs[index]) continue;
      return invalidTopology(
        "Dungeon Creation BFS does not match its floor distances.",
        `dungeon.bfs[${index}]`,
      );
    }
  }
  if (roomId) {
    for (let index = 0; index < roomId.length; index += 1) {
      const id = roomId[index]!;
      if (id !== -1 && !roomIds.has(id))
        return invalidTopology(
          "Dungeon Creation room id raster points to an unknown room.",
          `dungeon.roomId[${index}]`,
        );
      if (id !== -1) {
        const x = index % raw.W;
        const y = Math.floor(index / raw.W);
        if (!isWalkableGridCell(grid, raw.W, x, y))
          return invalidTopology(
            "Dungeon Creation room id raster must point to walkable terrain.",
            `dungeon.roomId[${index}]`,
          );
      }
    }
  }
  for (const [index, room] of rooms.entries()) {
    const centerIndex = gridIndex(raw.W, room.cx, room.cy);
    if (!isWalkableGridCell(grid, raw.W, room.cx, room.cy))
      return invalidTopology(
        "Dungeon Creation room center must be walkable.",
        `dungeon.rooms[${index}]`,
      );
    if (roomId && roomId[centerIndex] !== room.id)
      return invalidTopology(
        "Dungeon Creation room center does not match its room id raster.",
        `dungeon.rooms[${index}]`,
      );
  }

  const edges = parseArray(
    raw.edges,
    "dungeon.edges",
    parseEdge,
    (MAX_FORGE_ROOM_COUNT * (MAX_FORGE_ROOM_COUNT - 1)) / 2,
  );
  if (isIntakeError(edges)) return { ok: false, error: edges };
  const edgeKeys = new Set<string>();
  const degreeByRoom = new Map(rooms.map((room) => [room.id, 0]));
  const adjacentRooms = new Map(rooms.map((room) => [room.id, [] as number[]]));
  for (const [index, edge] of edges.entries()) {
    if (!roomIds.has(edge.a) || !roomIds.has(edge.b))
      return invalidTopology(
        "Dungeon Creation edge points to an unknown room.",
        `dungeon.edges[${index}]`,
      );
    if (edge.a === edge.b)
      return invalidTopology(
        "Dungeon Creation edges cannot link a room to itself.",
        `dungeon.edges[${index}]`,
      );
    const edgeKey = edge.a < edge.b ? `${edge.a}:${edge.b}` : `${edge.b}:${edge.a}`;
    if (edgeKeys.has(edgeKey))
      return invalidTopology("Dungeon Creation edges must be unique.", `dungeon.edges[${index}]`);
    edgeKeys.add(edgeKey);
    degreeByRoom.set(edge.a, degreeByRoom.get(edge.a)! + 1);
    degreeByRoom.set(edge.b, degreeByRoom.get(edge.b)! + 1);
    adjacentRooms.get(edge.a)!.push(edge.b);
    adjacentRooms.get(edge.b)!.push(edge.a);
  }
  const graphDepth = new Map<number, number>([[raw.entrance, 0]]);
  const graphQueue = [raw.entrance];
  for (let head = 0; head < graphQueue.length; head += 1) {
    const current = graphQueue[head]!;
    const nextDepth = graphDepth.get(current)! + 1;
    for (const next of adjacentRooms.get(current)!) {
      if (graphDepth.has(next)) continue;
      graphDepth.set(next, nextDepth);
      graphQueue.push(next);
    }
  }
  if (graphDepth.size !== rooms.length)
    return invalidTopology("Dungeon Creation room graph must be connected.", "dungeon.edges");
  for (const [index, room] of rooms.entries()) {
    if (room.degree !== undefined && room.degree !== degreeByRoom.get(room.id))
      return invalidTopology(
        "Dungeon Creation room degree does not match its edges.",
        `dungeon.rooms[${index}].degree`,
      );
    if (room.depth !== undefined && room.depth !== graphDepth.get(room.id))
      return invalidTopology(
        "Dungeon Creation room depth does not match its graph distance.",
        `dungeon.rooms[${index}].depth`,
      );
  }

  const pools = parseOptionalArray(raw.pools, "dungeon.pools", parseCell, cellCount);
  if (isIntakeError(pools)) return { ok: false, error: pools };
  const lakeCells = parseOptionalArray(raw.lakeCells, "dungeon.lakeCells", parseCell, cellCount);
  if (isIntakeError(lakeCells)) return { ok: false, error: lakeCells };
  const props = parseOptionalArray(raw.props, "dungeon.props", parseProp, cellCount);
  if (isIntakeError(props)) return { ok: false, error: props };
  const spawns = parseOptionalArray(raw.spawns, "dungeon.spawns", parseSpawn, cellCount);
  if (isIntakeError(spawns)) return { ok: false, error: spawns };
  const torches = parseOptionalArray(raw.torches, "dungeon.torches", parseTorch, cellCount);
  if (isIntakeError(torches)) return { ok: false, error: torches };
  const arches = parseOptionalArray(raw.arches, "dungeon.arches", parseArch, cellCount);
  if (isIntakeError(arches)) return { ok: false, error: arches };
  for (const [index, room] of rooms.entries()) {
    if (!isCellInBounds(room.cx, room.cy, raw.W, raw.H) || room.w > raw.W || room.h > raw.H)
      return invalidPayload(
        "Dungeon Creation room lies outside its bounds.",
        `dungeon.rooms[${index}]`,
      );
  }
  for (const [path, cells] of [
    ["dungeon.pools", pools],
    ["dungeon.lakeCells", lakeCells],
  ] as const) {
    for (const [index, entry] of (cells ?? []).entries()) {
      if (!isCellInBounds(entry.x, entry.y, raw.W, raw.H))
        return invalidPayload(
          "Dungeon Creation cell lies outside its bounds.",
          `${path}[${index}]`,
        );
    }
  }
  for (const [path, entries] of [
    ["dungeon.props", props],
    ["dungeon.spawns", spawns],
    ["dungeon.torches", torches],
  ] as const) {
    for (const [index, entry] of (entries ?? []).entries()) {
      if (!isCellInBounds(entry.x, entry.y, raw.W, raw.H))
        return invalidPayload(
          "Dungeon Creation object lies outside its bounds.",
          `${path}[${index}]`,
        );
    }
  }
  for (const [index, prop] of (props ?? []).entries()) {
    if (prop.roomId !== undefined && prop.roomId !== -1 && !roomIds.has(prop.roomId))
      return invalidTopology(
        "Dungeon Creation prop points to an unknown room.",
        `dungeon.props[${index}].roomId`,
      );
    if (prop.roomId !== undefined && !isWalkableGridCell(grid, raw.W, prop.x, prop.y))
      return invalidTopology(
        "Dungeon Creation prop room metadata must point to a walkable cell.",
        `dungeon.props[${index}]`,
      );
    if (
      prop.roomId !== undefined &&
      roomId &&
      roomId[gridIndex(raw.W, prop.x, prop.y)] !== prop.roomId
    )
      return invalidTopology(
        "Dungeon Creation prop room does not match its grid cell.",
        `dungeon.props[${index}].roomId`,
      );
  }
  for (const [index, spawn] of (spawns ?? []).entries()) {
    if (!roomIds.has(spawn.roomId))
      return invalidTopology(
        "Dungeon Creation spawn points to an unknown room.",
        `dungeon.spawns[${index}].roomId`,
      );
    if (!isWalkableGridCell(grid, raw.W, spawn.x, spawn.y))
      return invalidTopology(
        "Dungeon Creation spawn must use a walkable cell.",
        `dungeon.spawns[${index}]`,
      );
    if (roomId && roomId[gridIndex(raw.W, spawn.x, spawn.y)] !== spawn.roomId)
      return invalidTopology(
        "Dungeon Creation spawn room does not match its grid cell.",
        `dungeon.spawns[${index}].roomId`,
      );
  }
  for (const [index, torch] of (torches ?? []).entries()) {
    const targetX = torch.x + torch.dx;
    const targetY = torch.y + torch.dy;
    if (
      grid[gridIndex(raw.W, torch.x, torch.y)] !== FORGE_WALL_CELL ||
      !isCellInBounds(targetX, targetY, raw.W, raw.H) ||
      !isWalkableGridCell(grid, raw.W, targetX, targetY)
    )
      return invalidTopology(
        "Dungeon Creation torch must face a walkable cell from a wall.",
        `dungeon.torches[${index}]`,
      );
  }
  for (const [path, mask] of [
    ["dungeon.corridor", corridor],
    ["dungeon.doorway", doorway],
    ["dungeon.lakeMask", lakeMask],
  ] as const) {
    if (!mask) continue;
    for (let index = 0; index < mask.length; index += 1) {
      if (mask[index] !== 1) continue;
      const x = index % raw.W;
      const y = Math.floor(index / raw.W);
      if (!isWalkableGridCell(grid, raw.W, x, y))
        return invalidTopology(
          "Dungeon Creation cell mask must point to walkable terrain.",
          `${path}[${index}]`,
        );
    }
  }
  for (const [index, pool] of (pools ?? []).entries()) {
    if (grid[gridIndex(raw.W, pool.x, pool.y)] !== FORGE_POOL_CELL)
      return invalidTopology(
        "Dungeon Creation pool metadata must point to a pool cell.",
        `dungeon.pools[${index}]`,
      );
  }
  for (const [index, lakeCell] of (lakeCells ?? []).entries()) {
    if (!isWalkableGridCell(grid, raw.W, lakeCell.x, lakeCell.y))
      return invalidTopology(
        "Dungeon Creation lake metadata must point to a walkable cell.",
        `dungeon.lakeCells[${index}]`,
      );
  }
  for (const [index, arch] of (arches ?? []).entries()) {
    const halfSpan = (arch.len - 1) / 2;
    const startX = arch.x - arch.px * halfSpan;
    const startY = arch.y - arch.py * halfSpan;
    const endX = arch.x + arch.px * halfSpan;
    const endY = arch.y + arch.py * halfSpan;
    if (!isCellInBounds(startX, startY, raw.W, raw.H) || !isCellInBounds(endX, endY, raw.W, raw.H))
      return invalidPayload(
        "Dungeon Creation arch lies outside its bounds.",
        `dungeon.arches[${index}]`,
      );
  }
  const derivedMaxBfs = bfs ? maxArrayEntry(bfs) : -1;
  const derivedMaxDepth = rooms.reduce((maximum, room) => Math.max(maximum, room.depth ?? 0), 0);
  if (
    (raw.maxBfs !== undefined && !bfs) ||
    (raw.maxBfs !== undefined &&
      (!isInteger(raw.maxBfs) || raw.maxBfs < 0 || raw.maxBfs >= cellCount)) ||
    (raw.maxDepth !== undefined &&
      (!isInteger(raw.maxDepth) || raw.maxDepth < 0 || raw.maxDepth > rooms.length - 1))
  )
    return invalidPayload("Dungeon Creation metrics are invalid.", "dungeon.metrics");
  if (raw.maxBfs !== undefined && bfs && raw.maxBfs !== derivedMaxBfs)
    return invalidTopology(
      "Dungeon Creation maximum BFS distance does not match its distance field.",
      "dungeon.maxBfs",
    );
  if (raw.maxDepth !== undefined && raw.maxDepth !== derivedMaxDepth)
    return invalidTopology(
      "Dungeon Creation maximum room depth does not match its room graph.",
      "dungeon.maxDepth",
    );

  return {
    ok: true,
    value: {
      valid: true,
      seed: raw.seed,
      name: raw.name,
      W: raw.W,
      H: raw.H,
      grid,
      ...(roomId ? { roomId } : {}),
      ...(corridor ? { corridor } : {}),
      ...(doorway ? { doorway } : {}),
      ...(bfs ? { bfs } : {}),
      ...(isFiniteNumber(raw.maxBfs) ? { maxBfs: raw.maxBfs } : {}),
      ...(isFiniteNumber(raw.maxDepth) ? { maxDepth: raw.maxDepth } : {}),
      rooms,
      edges,
      entrance: raw.entrance,
      boss: raw.boss,
      ...(props ? { props } : {}),
      ...(spawns ? { spawns } : {}),
      ...(torches ? { torches } : {}),
      ...(pools ? { pools } : {}),
      ...(lakeCells ? { lakeCells } : {}),
      ...(lakeMask ? { lakeMask } : {}),
      ...(arches ? { arches } : {}),
      params: {
        roomCount: raw.params.roomCount,
        loopChance: raw.params.loopChance,
        decorDensity: raw.params.decorDensity,
        themeKey: raw.params.themeKey,
      },
    },
  };
}

function mapPrepareError(error: unknown): ForgeIntakeError {
  const message =
    error instanceof Error ? error.message : "Dungeon Creation preview could not be validated.";
  if (message.startsWith("Dungeon Creation parameters are invalid:"))
    return { code: "invalid-params", message };
  if (
    message.includes("has no walkable cell") ||
    message.includes("entrance or boss room is missing") ||
    message.includes("cannot reach its boss room") ||
    message.includes("edge points to an unknown room")
  )
    return { code: "invalid-topology", message };
  if (
    message.includes("returned an unresolved dungeon") ||
    message.includes("invalid bounds") ||
    message.includes("grid size") ||
    message.includes("too few rooms") ||
    message.includes("size does not match its bounds") ||
    message.includes("room dimensions are invalid")
  )
    return { code: "invalid-payload", message };
  return {
    code: "internal-error",
    message: "Dungeon Creation preview could not be validated.",
  };
}

/**
 * Validate one Forge v1 postMessage and produce an isolated game-ready value.
 * Browser origin and source checks stay with the window listener that owns them.
 */
export function parseForgeDungeonMessage(input: unknown): ForgeDungeonIntakeResult {
  try {
    if (!isRecord(input) || input.type !== FORGE_DUNGEON_MESSAGE_TYPE) return { kind: "ignored" };
    if (!Object.hasOwn(input, "version") || !Object.hasOwn(input, "dungeon"))
      return reject(
        "invalid-envelope",
        "Dungeon Creation message must include a version and dungeon payload.",
      );
    if (!isInteger(input.version))
      return reject("invalid-envelope", "Dungeon Creation message version is invalid.", "version");
    if (input.version !== 1)
      return reject(
        "unsupported-version",
        `Dungeon Creation message version ${input.version} is unsupported.`,
        "version",
      );

    const payload = parsePayload(input.dungeon);
    if (!payload.ok) return { kind: "rejected", error: payload.error };
    const prepared: PreparedDungeonForge = prepareDungeonForge(payload.value);
    return {
      kind: "accepted",
      value: { dungeon: prepared.dungeon, params: Object.freeze({ ...prepared.params }) },
    };
  } catch (error) {
    return { kind: "rejected", error: mapPrepareError(error) };
  }
}
