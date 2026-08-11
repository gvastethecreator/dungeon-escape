import { DEFAULT_DUNGEON_PARAMS, normalizeDungeonParams } from "../domain/core";
import { createSeededRandom, hashSeed, type SeededRandom } from "../core/random";
import { carveDungeonTopology } from "./DungeonTopology";
import type {
  DungeonData,
  DungeonDoorway,
  DungeonEdge,
  DungeonOptions,
  DungeonRoom,
  GridCell,
  NormalizedDungeonOptions,
} from "./types";

export const WALL = 0 as const;
export const FLOOR = 1 as const;

const DEFAULTS: Readonly<NormalizedDungeonOptions> = Object.freeze({
  width: DEFAULT_DUNGEON_PARAMS.mapWidth,
  height: DEFAULT_DUNGEON_PARAMS.mapHeight,
  roomTarget: DEFAULT_DUNGEON_PARAMS.roomTarget,
  minRoomSize: DEFAULT_DUNGEON_PARAMS.minRoomSize,
  maxRoomSize: DEFAULT_DUNGEON_PARAMS.maxRoomSize,
  roomPadding: DEFAULT_DUNGEON_PARAMS.roomPadding,
  /** 0 = one cell wide (diameter 2r+1). Tighter default for first-person scale. */
  corridorRadius: DEFAULT_DUNGEON_PARAMS.corridorRadius,
  extraConnectionRate: DEFAULT_DUNGEON_PARAMS.loopRate / 100,
  placementAttemptsPerRoom: 220,
});

type RoomDraft = Omit<DungeonRoom, "role">;
type CandidateEdge = Omit<DungeonEdge, "kind">;

class DisjointSet {
  private readonly parents: number[];
  private readonly ranks: number[];

  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_, index) => index);
    this.ranks = Array.from({ length: size }, () => 0);
  }

  find(index: number): number {
    const parent = this.parents[index];
    if (parent === undefined) throw new Error(`Invalid disjoint-set index: ${index}.`);
    if (parent !== index) this.parents[index] = this.find(parent);
    return this.parents[index] as number;
  }

  join(left: number, right: number): boolean {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return false;

    const leftRank = this.ranks[leftRoot] ?? 0;
    const rightRank = this.ranks[rightRoot] ?? 0;
    if (leftRank < rightRank) {
      this.parents[leftRoot] = rightRoot;
    } else if (leftRank > rightRank) {
      this.parents[rightRoot] = leftRoot;
    } else {
      this.parents[rightRoot] = leftRoot;
      this.ranks[leftRoot] = leftRank + 1;
    }
    return true;
  }
}

function normalizeOptions(options: DungeonOptions = {}): NormalizedDungeonOptions {
  const params = normalizeDungeonParams(
    {
      roomTarget: options.roomTarget,
      loopRate:
        typeof options.extraConnectionRate === "number"
          ? options.extraConnectionRate * 100
          : undefined,
      mapWidth: options.width,
      mapHeight: options.height,
      minRoomSize: options.minRoomSize,
      maxRoomSize: options.maxRoomSize,
      corridorRadius: options.corridorRadius,
      roomPadding: options.roomPadding,
    },
    { profile: "generation-input" },
  );
  const placementAttempts =
    typeof options.placementAttemptsPerRoom === "number" &&
    Number.isFinite(options.placementAttemptsPerRoom)
      ? Math.max(1, Math.floor(options.placementAttemptsPerRoom))
      : DEFAULTS.placementAttemptsPerRoom;

  return {
    ...DEFAULTS,
    ...options,
    width: params.mapWidth,
    height: params.mapHeight,
    roomTarget: params.roomTarget,
    minRoomSize: params.minRoomSize,
    maxRoomSize: params.maxRoomSize,
    roomPadding: params.roomPadding,
    corridorRadius: params.corridorRadius,
    extraConnectionRate: params.loopRate / 100,
    placementAttemptsPerRoom: placementAttempts,
  };
}

function createGrid(width: number, height: number): Uint8Array[] {
  return Array.from({ length: height }, () => new Uint8Array(width).fill(WALL));
}

function isInside(grid: readonly Uint8Array[], x: number, y: number): boolean {
  const firstRow = grid[0];
  if (!firstRow) return false;
  return y >= 0 && y < grid.length && x >= 0 && x < firstRow.length;
}

function carveCell(grid: Uint8Array[], x: number, y: number): void {
  if (isInside(grid, x, y)) grid[y]![x] = FLOOR;
}

function carveRect(grid: Uint8Array[], room: RoomDraft): void {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) carveCell(grid, x, y);
  }
}

function carveSquare(grid: Uint8Array[], x: number, y: number, radius: number): void {
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1)
      carveCell(grid, x + offsetX, y + offsetY);
  }
}

function carveLine(grid: Uint8Array[], from: GridCell, to: GridCell, radius: number): void {
  const stepX = Math.sign(to.x - from.x);
  const stepY = Math.sign(to.y - from.y);
  let x = from.x;
  let y = from.y;
  carveSquare(grid, x, y, radius);

  while (x !== to.x || y !== to.y) {
    if (x !== to.x) x += stepX;
    if (y !== to.y) y += stepY;
    carveSquare(grid, x, y, radius);
  }
}

function roomsOverlap(left: RoomDraft, right: RoomDraft, padding: number): boolean {
  return !(
    left.x + left.width + padding <= right.x ||
    right.x + right.width + padding <= left.x ||
    left.y + left.height + padding <= right.y ||
    right.y + right.height + padding <= left.y
  );
}

function placeRooms(options: NormalizedDungeonOptions, random: SeededRandom): RoomDraft[] {
  const rooms: RoomDraft[] = [];
  const border = options.roomPadding + 1;
  const maximumAttempts = options.roomTarget * options.placementAttemptsPerRoom;

  for (
    let attempt = 0;
    attempt < maximumAttempts && rooms.length < options.roomTarget;
    attempt += 1
  ) {
    const width = random.integer(options.minRoomSize, options.maxRoomSize);
    const height = random.integer(options.minRoomSize, options.maxRoomSize);
    const room: RoomDraft = {
      id: rooms.length,
      x: random.integer(border, options.width - width - border),
      y: random.integer(border, options.height - height - border),
      width,
      height,
      center: { x: 0, y: 0 },
    };
    if (rooms.some((existing) => roomsOverlap(room, existing, options.roomPadding))) continue;
    room.center = {
      x: room.x + Math.floor(room.width / 2),
      y: room.y + Math.floor(room.height / 2),
    };
    rooms.push(room);
  }

  // Entrance + exit roles leave N-2 combat rooms. Need at least 4 combat seats so
  // the four magic stones can spread without collapsing onto one chamber.
  if (rooms.length < 7)
    throw new Error(`Unable to place a playable room set; placed ${rooms.length}.`);
  return rooms;
}

function makeCandidateEdges(rooms: readonly RoomDraft[]): CandidateEdge[] {
  const candidates: CandidateEdge[] = [];
  for (let left = 0; left < rooms.length; left += 1) {
    for (let right = left + 1; right < rooms.length; right += 1) {
      const leftRoom = rooms[left];
      const rightRoom = rooms[right];
      if (!leftRoom || !rightRoom) continue;
      const deltaX = leftRoom.center.x - rightRoom.center.x;
      const deltaY = leftRoom.center.y - rightRoom.center.y;
      candidates.push({ left, right, distance: deltaX * deltaX + deltaY * deltaY });
    }
  }
  return candidates.sort((a, b) => a.distance - b.distance || a.left - b.left || a.right - b.right);
}

function connectRooms(
  rooms: readonly RoomDraft[],
  random: SeededRandom,
  loopRate: number,
): DungeonEdge[] {
  const candidates = makeCandidateEdges(rooms);
  const forest = new DisjointSet(rooms.length);
  const treeEdges: DungeonEdge[] = [];
  const treeKeys = new Set<string>();

  for (const candidate of candidates) {
    if (!forest.join(candidate.left, candidate.right)) continue;
    treeKeys.add(`${candidate.left}:${candidate.right}`);
    treeEdges.push({ ...candidate, kind: "tree" });
    if (treeEdges.length === rooms.length - 1) break;
  }

  const localNeighborKeys = new Set<string>();
  const localNeighborCounts = new Uint8Array(rooms.length);
  for (const candidate of candidates) {
    const leftIsLocal = (localNeighborCounts[candidate.left] ?? 0) < 4;
    const rightIsLocal = (localNeighborCounts[candidate.right] ?? 0) < 4;
    if (!leftIsLocal && !rightIsLocal) continue;
    localNeighborKeys.add(`${candidate.left}:${candidate.right}`);
    if (leftIsLocal) localNeighborCounts[candidate.left] += 1;
    if (rightIsLocal) localNeighborCounts[candidate.right] += 1;
  }
  const loops = candidates
    .filter((candidate) => !treeKeys.has(`${candidate.left}:${candidate.right}`))
    .filter((candidate) => localNeighborKeys.has(`${candidate.left}:${candidate.right}`))
    .filter(() => random.chance(loopRate))
    .map<DungeonEdge>((candidate) => ({ ...candidate, kind: "loop" }));
  return [...treeEdges, ...loops];
}

function carveManhattanSegment(
  grid: Uint8Array[],
  from: GridCell,
  to: GridCell,
  radius: number,
): void {
  // The rounded path is sampled on a grid. Resolve each sample with two
  // cardinal segments so a one-cell hall never relies on diagonal contact.
  const corner = { x: to.x, y: from.y };
  carveLine(grid, from, corner, radius);
  carveLine(grid, corner, to, radius);
}

export function carveRoundedCorridor(
  grid: Uint8Array[],
  from: GridCell,
  to: GridCell,
  radius: number,
  horizontalFirst: boolean,
): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (!dx || !dy) {
    carveLine(grid, from, to, radius);
    return;
  }

  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const turnRadius = Math.min(3, Math.max(1, Math.floor(Math.min(Math.abs(dx), Math.abs(dy)) / 3)));
  const startAngle = horizontalFirst ? -sy * (Math.PI / 2) : sx > 0 ? Math.PI : 0;
  const sweep = horizontalFirst ? sx * sy * (Math.PI / 2) : -sx * sy * (Math.PI / 2);
  const center = horizontalFirst
    ? { x: to.x - sx * turnRadius, y: from.y + sy * turnRadius }
    : { x: from.x + sx * turnRadius, y: to.y - sy * turnRadius };
  const entry = horizontalFirst
    ? { x: to.x - sx * turnRadius, y: from.y }
    : { x: from.x, y: to.y - sy * turnRadius };
  const exit = horizontalFirst
    ? { x: to.x, y: from.y + sy * turnRadius }
    : { x: from.x + sx * turnRadius, y: to.y };

  carveManhattanSegment(grid, from, entry, radius);
  let previous = entry;
  for (let step = 1; step <= 8; step += 1) {
    const angle = startAngle + (sweep * step) / 8;
    const point = {
      x: Math.round(center.x + Math.cos(angle) * turnRadius),
      y: Math.round(center.y + Math.sin(angle) * turnRadius),
    };
    carveManhattanSegment(grid, previous, point, radius);
    previous = point;
  }
  carveManhattanSegment(grid, previous, exit, radius);
  carveManhattanSegment(grid, exit, to, radius);
}

function cellIndex(width: number, x: number, y: number): number {
  return y * width + x;
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
  if (!isInside(grid, start.x, start.y) || grid[start.y]?.[start.x] !== FLOOR)
    return { distances, visited };

  queue[tail++] = cellIndex(width, start.x, start.y);
  distances[queue[0] as number] = 0;
  while (head < tail) {
    const current = queue[head++] as number;
    visited += 1;
    const x = current % width;
    const y = Math.floor(current / width);
    const nextDistance = (distances[current] ?? -1) + 1;
    if (x > 0) {
      const next = current - 1;
      if (grid[y]?.[x - 1] === FLOOR && (distances[next] ?? -1) < 0) {
        distances[next] = nextDistance;
        queue[tail++] = next;
      }
    }
    if (x + 1 < width) {
      const next = current + 1;
      if (grid[y]?.[x + 1] === FLOOR && (distances[next] ?? -1) < 0) {
        distances[next] = nextDistance;
        queue[tail++] = next;
      }
    }
    if (y > 0) {
      const next = current - width;
      if (grid[y - 1]?.[x] === FLOOR && (distances[next] ?? -1) < 0) {
        distances[next] = nextDistance;
        queue[tail++] = next;
      }
    }
    if (y + 1 < height) {
      const next = current + width;
      if (grid[y + 1]?.[x] === FLOOR && (distances[next] ?? -1) < 0) {
        distances[next] = nextDistance;
        queue[tail++] = next;
      }
    }
  }
  return { distances, visited };
}

function countFloorCells(grid: readonly Uint8Array[]): number {
  let count = 0;
  for (const row of grid) for (const cell of row) if (cell === FLOOR) count += 1;
  return count;
}

function selectEntrance(rooms: readonly RoomDraft[]): RoomDraft {
  const first = rooms[0];
  if (!first) throw new Error("Dungeon has no entrance room.");
  return rooms.reduce(
    (selected, room) =>
      room.center.x + room.center.y < selected.center.x + selected.center.y ? room : selected,
    first,
  );
}

function findRoomAt(rooms: readonly RoomDraft[], cell: GridCell): RoomDraft {
  const containing = rooms.find(
    (room) =>
      cell.x >= room.x &&
      cell.x < room.x + room.width &&
      cell.y >= room.y &&
      cell.y < room.y + room.height,
  );
  if (containing) return containing;
  const first = rooms[0];
  if (!first) throw new Error("Dungeon has no rooms.");
  return rooms.reduce((nearest, room) => {
    const roomDistance = (room.center.x - cell.x) ** 2 + (room.center.y - cell.y) ** 2;
    const nearestDistance = (nearest.center.x - cell.x) ** 2 + (nearest.center.y - cell.y) ** 2;
    return roomDistance < nearestDistance ? room : nearest;
  }, first);
}

function selectExit(rooms: readonly RoomDraft[], distances: Int32Array, width: number): RoomDraft {
  const first = rooms[0];
  if (!first) throw new Error("Dungeon has no exit room.");
  return rooms.reduce((selected, room) => {
    const roomDistance = distances[cellIndex(width, room.center.x, room.center.y)] ?? -1;
    const selectedDistance =
      distances[cellIndex(width, selected.center.x, selected.center.y)] ?? -1;
    return roomDistance > selectedDistance ? room : selected;
  }, first);
}

function topologySignature(
  rooms: readonly RoomDraft[],
  edges: readonly DungeonEdge[],
  entranceId: number,
  exitId: number,
  doorways: readonly DungeonDoorway[] = [],
): string {
  const roomSignature = rooms
    .map((room) => `${room.id}@${room.x},${room.y},${room.width},${room.height}`)
    .join("|");
  const edgeSignature = edges.map((edge) => `${edge.left}-${edge.right}-${edge.kind}`).join("|");
  const doorwaySignature = doorways
    .map(
      (doorway) =>
        `${doorway.edgeIndex}:${doorway.roomId}@${doorway.cell.x},${doorway.cell.y},${doorway.outDx},${doorway.outDy}`,
    )
    .join("|");
  return `${entranceId}>${exitId}:${roomSignature}:${edgeSignature}:${doorwaySignature}`;
}

function generateDungeonAttempt(
  normalizedSeed: string,
  options: NormalizedDungeonOptions,
  layoutSalt: number,
): DungeonData {
  const random = createSeededRandom(
    layoutSalt > 0 ? `${normalizedSeed}#layout${layoutSalt}` : normalizedSeed,
  );
  const rooms = placeRooms(options, random);
  const edges = connectRooms(rooms, random, options.extraConnectionRate);
  const grid = createGrid(options.width, options.height);
  rooms.forEach((room) => carveRect(grid, room));
  const seedHash = hashSeed(normalizedSeed);
  const topology = carveDungeonTopology(
    grid,
    options.width,
    options.height,
    rooms,
    edges,
    options.corridorRadius,
    seedHash ^ layoutSalt,
  );

  const entranceRoom = selectEntrance(rooms);
  const spawn = { ...entranceRoom.center };
  const initialFill = floodFill(grid, spawn);
  const exitRoom = selectExit(rooms, initialFill.distances, options.width);
  const exit = { ...exitRoom.center };
  const floorCount = countFloorCells(grid);
  const exitDistance = initialFill.distances[cellIndex(options.width, exit.x, exit.y)] ?? -1;

  return {
    seed: normalizedSeed,
    seedHash,
    options,
    grid,
    width: options.width,
    height: options.height,
    rooms: rooms.map((room) => ({
      ...room,
      role: room.id === entranceRoom.id ? "entrance" : room.id === exitRoom.id ? "exit" : "room",
    })),
    edges,
    spawn,
    exit,
    entranceRoomId: entranceRoom.id,
    exitRoomId: exitRoom.id,
    distances: initialFill.distances,
    topologySignature: topologySignature(
      rooms,
      edges,
      entranceRoom.id,
      exitRoom.id,
      topology.doorways,
    ),
    stats: {
      roomCount: rooms.length,
      floorCount,
      reachableFloorCount: initialFill.visited,
      edgeCount: edges.length,
      loopCount: edges.filter((edge) => edge.kind === "loop").length,
      exitDistance,
    },
    topology,
  };
}

/**
 * @param rngSalt — when > 0, layout RNG is re-derived so completeness retries
 *   can reshape the map while keeping the public seed / seedHash stable.
 */
export function generateDungeon(
  seed = "BLACK-FLAG",
  inputOptions: DungeonOptions = {},
  rngSalt = 0,
): DungeonData {
  const options = normalizeOptions(inputOptions);
  const normalizedSeed = seed.trim() || "BLACK-FLAG";
  const safeSalt = Number.isFinite(rngSalt) ? Math.max(0, Math.floor(rngSalt)) : 0;
  const attemptsPerSalt = 8;
  let lastError: unknown;
  for (let attempt = 0; attempt < attemptsPerSalt; attempt += 1) {
    try {
      return generateDungeonAttempt(normalizedSeed, options, safeSalt * attemptsPerSalt + attempt);
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : "unknown routing failure";
  throw new Error(`Unable to generate a sealed dungeon for "${normalizedSeed}". ${detail}`);
}

export function isExitReachable(dungeon: DungeonData): boolean {
  return (dungeon.distances[cellIndex(dungeon.width, dungeon.exit.x, dungeon.exit.y)] ?? -1) >= 0;
}

/** Refresh connectivity derived from a grid after structural floor edits. */
export function refreshDungeonConnectivity(dungeon: DungeonData): DungeonData {
  const fill = floodFill(dungeon.grid, dungeon.spawn);
  const exitDistance =
    fill.distances[cellIndex(dungeon.width, dungeon.exit.x, dungeon.exit.y)] ?? -1;
  return {
    ...dungeon,
    distances: fill.distances,
    stats: {
      ...dungeon.stats,
      floorCount: countFloorCells(dungeon.grid),
      reachableFloorCount: fill.visited,
      exitDistance,
    },
  };
}

export function isFloorCell(dungeon: Pick<DungeonData, "grid">, x: number, y: number): boolean {
  return isInside(dungeon.grid, x, y) && dungeon.grid[y]?.[x] === FLOOR;
}

export function setDungeonSpawn(dungeon: DungeonData, spawn: GridCell): DungeonData {
  if (!isFloorCell(dungeon, spawn.x, spawn.y))
    throw new Error("Spawn must be placed on a floor cell.");
  const entranceRoom = findRoomAt(dungeon.rooms, spawn);
  const fill = floodFill(dungeon.grid, spawn);
  const exitRoom = selectExit(dungeon.rooms, fill.distances, dungeon.width);
  const exit = { ...exitRoom.center };
  const exitDistance = fill.distances[cellIndex(dungeon.width, exit.x, exit.y)] ?? -1;
  return {
    ...dungeon,
    spawn: { ...spawn },
    exit,
    entranceRoomId: entranceRoom.id,
    exitRoomId: exitRoom.id,
    rooms: dungeon.rooms.map((room) => ({
      ...room,
      role: room.id === entranceRoom.id ? "entrance" : room.id === exitRoom.id ? "exit" : "room",
    })),
    distances: fill.distances,
    topologySignature: topologySignature(
      dungeon.rooms,
      dungeon.edges,
      entranceRoom.id,
      exitRoom.id,
      dungeon.topology?.doorways,
    ),
    stats: { ...dungeon.stats, reachableFloorCount: fill.visited, exitDistance },
  };
}
