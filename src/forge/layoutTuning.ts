export const FORGE_ROOM_BANDS = Object.freeze({
  small: Object.freeze({ min: 5, max: 7 }),
  medium: Object.freeze({ min: 7, max: 10 }),
  large: Object.freeze({ min: 10, max: 13 }),
});

/** Cell widths — mostly single-tile halls, critical routes stay two wide. */
export const FORGE_CORRIDOR_WIDTHS = Object.freeze({ branch: 1, standard: 1, critical: 2 });
export const FORGE_SCATTER_RADIUS = 4.25;

export interface ForgePacingCandidate {
  id: number;
  depth: number;
}

export interface ForgeGridTopology {
  width: number;
  height: number;
  grid: Uint8Array;
  corridors: Uint8Array;
  roomIds: Int16Array;
  floorValue?: number;
  preservedOpenings?: Set<number>;
}

export interface ForgeDoorwayDirection {
  dx: number;
  dy: number;
}

export type ForgeMagicStoneId = "ember" | "ash" | "crypt" | "verdant";

export interface ForgeMagicStonePlacement {
  stoneId: ForgeMagicStoneId;
  roomId: number;
  x: number;
  y: number;
}

export interface ForgeMagicStoneInput {
  width: number;
  height: number;
  grid: ArrayLike<number>;
  roomIds: ArrayLike<number>;
  corridors: ArrayLike<number>;
  doorways: ArrayLike<number>;
  pools: ArrayLike<number>;
  lakeMask: ArrayLike<number>;
  bfs: ArrayLike<number>;
  rooms: readonly { id: number; cx: number; cy: number; w: number; h: number }[];
  excludedRoomIds: ReadonlySet<number>;
  blockedCells?: readonly { x: number; y: number }[];
  /** Chebyshev radius kept clear around each objective. Defaults to one cell. */
  clearanceRadius?: number;
  floorValue?: number;
}

const FORGE_STONE_ORDER = Object.freeze([
  "ember",
  "ash",
  "crypt",
  "verdant",
] as const satisfies readonly ForgeMagicStoneId[]);

const CARDINAL_STEPS = Object.freeze([
  Object.freeze([1, 0]),
  Object.freeze([-1, 0]),
  Object.freeze([0, 1]),
  Object.freeze([0, -1]),
] as const);

function topologyIndex(topology: ForgeGridTopology, x: number, y: number): number {
  return y * topology.width + x;
}

function topologyContains(topology: ForgeGridTopology, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < topology.width && y < topology.height;
}

function isCorridorFloor(topology: ForgeGridTopology, x: number, y: number): boolean {
  if (!topologyContains(topology, x, y)) return false;
  const index = topologyIndex(topology, x, y);
  return topology.corridors[index] === 1 && topology.grid[index] === (topology.floorValue ?? 1);
}

/**
 * Returns the single room-facing direction for a framed opening. A corridor
 * that only brushes a room edge is not a doorway and must be sealed.
 */
export function getForgeDoorwayDirection(
  topology: ForgeGridTopology,
  x: number,
  y: number,
): ForgeDoorwayDirection | null {
  if (!isCorridorFloor(topology, x, y)) return null;
  let direction: ForgeDoorwayDirection | null = null;
  for (const [dx, dy] of CARDINAL_STEPS) {
    const roomX = x + dx;
    const roomY = y + dy;
    if (
      !topologyContains(topology, roomX, roomY) ||
      topology.roomIds[topologyIndex(topology, roomX, roomY)]! < 0 ||
      !isCorridorFloor(topology, x - dx, y - dy)
    ) {
      continue;
    }
    // A valid head-on continuation stays an opening even when a wide hall or
    // nearby junction also has tangent cells. Pure edge brushes have no cell
    // behind the candidate and were already rejected above.
    // Rounded and octagonal room corners may expose two cells from the same
    // room. Keep the first real head-on continuation; the corridor is still a
    // valid opening and only needs one stable frame direction.
    direction ??= { dx, dy };
  }
  if (!direction && topology.preservedOpenings?.has(topologyIndex(topology, x, y))) {
    for (const [dx, dy] of CARDINAL_STEPS) {
      const roomX = x + dx;
      const roomY = y + dy;
      if (
        topologyContains(topology, roomX, roomY) &&
        topology.roomIds[topologyIndex(topology, roomX, roomY)]! >= 0
      ) {
        return { dx, dy };
      }
    }
  }
  return direction;
}

function corridorTouchesRoom(topology: ForgeGridTopology, x: number, y: number): boolean {
  return CARDINAL_STEPS.some(([dx, dy]) => {
    const roomX = x + dx;
    const roomY = y + dy;
    return (
      topologyContains(topology, roomX, roomY) &&
      topology.roomIds[topologyIndex(topology, roomX, roomY)]! >= 0
    );
  });
}

/**
 * Seal tangent corridor cuts beside rooms. We repeat because sealing one bad
 * cell can expose another cell whose corridor continuation no longer exists.
 * The generator's BFS rejects and retries a seed if this closes a needed path.
 */
export function sealInvalidForgeRoomOpenings(topology: ForgeGridTopology): number {
  const floorValue = topology.floorValue ?? 1;
  const preserved = (topology.preservedOpenings ??= new Set<number>());
  const canRemoveWithoutSplitting = (index: number): boolean => {
    const x = index % topology.width;
    const y = Math.floor(index / topology.width);
    const neighbors = CARDINAL_STEPS.map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
      .filter(({ x: nx, y: ny }) => topologyContains(topology, nx, ny))
      .map(({ x: nx, y: ny }) => topologyIndex(topology, nx, ny))
      .filter((neighbor) => topology.grid[neighbor] === floorValue);
    if (neighbors.length <= 1) return true;

    const previousGrid = topology.grid[index]!;
    const previousCorridor = topology.corridors[index]!;
    topology.grid[index] = 0;
    topology.corridors[index] = 0;
    const visited = new Uint8Array(topology.width * topology.height);
    const queue = new Int32Array(topology.width * topology.height);
    let head = 0;
    let tail = 0;
    queue[tail++] = neighbors[0]!;
    visited[neighbors[0]!] = 1;
    while (head < tail) {
      const current = queue[head++]!;
      const currentX = current % topology.width;
      const currentY = Math.floor(current / topology.width);
      for (const [dx, dy] of CARDINAL_STEPS) {
        const nextX = currentX + dx;
        const nextY = currentY + dy;
        if (!topologyContains(topology, nextX, nextY)) continue;
        const next = topologyIndex(topology, nextX, nextY);
        if (visited[next] || topology.grid[next] !== floorValue) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    const connected = neighbors.every((neighbor) => visited[neighbor] === 1);
    topology.grid[index] = previousGrid;
    topology.corridors[index] = previousCorridor;
    return connected;
  };

  let sealed = 0;
  for (;;) {
    const pending: number[] = [];
    for (let y = 0; y < topology.height; y += 1) {
      for (let x = 0; x < topology.width; x += 1) {
        if (!isCorridorFloor(topology, x, y) || !corridorTouchesRoom(topology, x, y)) continue;
        if (preserved.has(topologyIndex(topology, x, y))) continue;
        if (getForgeDoorwayDirection(topology, x, y)) continue;
        pending.push(topologyIndex(topology, x, y));
      }
    }
    if (pending.length === 0) return sealed;
    let changed = false;
    for (const index of pending) {
      if (!canRemoveWithoutSplitting(index)) {
        preserved.add(index);
        continue;
      }
      topology.grid[index] = 0;
      topology.corridors[index] = 0;
      changed = true;
      sealed += 1;
    }
    if (!changed) return sealed;
  }
}

/** Shared cell selection for Creation and Play so all four 3D stones agree. */
export function selectForgeMagicStonePlacements(
  input: ForgeMagicStoneInput,
): ForgeMagicStonePlacement[] {
  const floorValue = input.floorValue ?? 1;
  const clearanceRadius = Math.max(0, Math.trunc(input.clearanceRadius ?? 1));
  const blocked = new Set(
    (input.blockedCells ?? []).map((cell) => `${Math.round(cell.x)},${Math.round(cell.y)}`),
  );
  const hasClearance = (x: number, y: number, roomId: number): boolean => {
    for (let offsetY = -clearanceRadius; offsetY <= clearanceRadius; offsetY += 1) {
      for (let offsetX = -clearanceRadius; offsetX <= clearanceRadius; offsetX += 1) {
        const sampleX = x + offsetX;
        const sampleY = y + offsetY;
        if (sampleX < 0 || sampleY < 0 || sampleX >= input.width || sampleY >= input.height)
          return false;
        const index = sampleY * input.width + sampleX;
        if (
          input.grid[index] !== floorValue ||
          input.roomIds[index] !== roomId ||
          input.corridors[index] ||
          input.doorways[index] ||
          input.pools[index] ||
          input.lakeMask[index] ||
          blocked.has(`${sampleX},${sampleY}`)
        )
          return false;
      }
    }
    return true;
  };
  const distanceAt = (x: number, y: number): number =>
    Number(input.bfs[Math.round(y) * input.width + Math.round(x)] ?? -1);
  const rankedRooms = input.rooms
    .filter((room) => !input.excludedRoomIds.has(room.id))
    .sort((left, right) => distanceAt(left.cx, left.cy) - distanceAt(right.cx, right.cy));
  if (rankedRooms.length === 0) return [];

  const selected: (typeof rankedRooms)[number][] = [];
  for (const percentile of [0.28, 0.48, 0.68, 0.88]) {
    const index = Math.min(
      rankedRooms.length - 1,
      Math.max(0, Math.floor(rankedRooms.length * percentile)),
    );
    const room = rankedRooms[index];
    if (room && !selected.includes(room)) selected.push(room);
  }
  for (const room of rankedRooms) {
    if (!selected.includes(room)) selected.push(room);
    if (selected.length >= FORGE_STONE_ORDER.length) break;
  }

  return FORGE_STONE_ORDER.map((stoneId, stoneIndex) => {
    const room = selected[stoneIndex] ?? rankedRooms[stoneIndex % rankedRooms.length]!;
    const candidates: Array<{ x: number; y: number }> = [];
    const fallbackCandidates: Array<{ x: number; y: number }> = [];
    const minX = Math.max(0, Math.floor(room.cx - room.w / 2) + 1);
    const maxX = Math.min(input.width - 1, Math.ceil(room.cx + room.w / 2) - 1);
    const minY = Math.max(0, Math.floor(room.cy - room.h / 2) + 1);
    const maxY = Math.min(input.height - 1, Math.ceil(room.cy + room.h / 2) - 1);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const index = y * input.width + x;
        if (
          input.grid[index] !== floorValue ||
          input.roomIds[index] !== room.id ||
          input.corridors[index] ||
          input.doorways[index] ||
          input.pools[index] ||
          input.lakeMask[index] ||
          blocked.has(`${x},${y}`)
        ) {
          continue;
        }
        fallbackCandidates.push({ x, y });
        if (hasClearance(x, y, room.id)) candidates.push({ x, y });
      }
    }
    const sortCandidates = (left: { x: number; y: number }, right: { x: number; y: number }) => {
      const leftDistance = Math.abs(left.x - room.cx) + Math.abs(left.y - room.cy);
      const rightDistance = Math.abs(right.x - room.cx) + Math.abs(right.y - room.cy);
      const leftRank = (left.x * 31 + left.y * 17 + room.id * 13 + stoneIndex * 47) % 997;
      const rightRank = (right.x * 31 + right.y * 17 + room.id * 13 + stoneIndex * 47) % 997;
      return leftDistance - rightDistance || leftRank - rightRank;
    };
    candidates.sort(sortCandidates);
    fallbackCandidates.sort(sortCandidates);
    const cell = candidates[0] ??
      fallbackCandidates[0] ?? { x: Math.round(room.cx), y: Math.round(room.cy) };
    for (let offsetY = -clearanceRadius; offsetY <= clearanceRadius; offsetY += 1)
      for (let offsetX = -clearanceRadius; offsetX <= clearanceRadius; offsetX += 1)
        blocked.add(`${cell.x + offsetX},${cell.y + offsetY}`);
    return { stoneId, roomId: room.id, x: cell.x, y: cell.y };
  });
}

/**
 * Picks special rooms across the route instead of clustering all rewards near
 * the farthest leaves. Preferred ids receive a small score gain, useful for
 * recovery rooms one edge away from the critical path.
 */
export function selectDepthSpreadRoomIds(
  candidates: readonly ForgePacingCandidate[],
  maxDepth: number,
  targetFractions: readonly number[],
  preferredIds: ReadonlySet<number> = new Set(),
): number[] {
  const remaining = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const depthScale = Math.max(1, maxDepth);
  const selected: number[] = [];
  for (const rawTarget of targetFractions) {
    const target = Math.max(0, Math.min(1, rawTarget));
    let best: ForgePacingCandidate | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of remaining.values()) {
      const depthError = Math.abs(candidate.depth / depthScale - target);
      const score = depthError + (preferredIds.has(candidate.id) ? -0.16 : 0);
      if (score > bestScore) continue;
      if (score === bestScore && best && candidate.id > best.id) continue;
      best = candidate;
      bestScore = score;
    }
    if (!best) break;
    selected.push(best.id);
    remaining.delete(best.id);
  }
  return selected;
}

export function roomBandMeters(
  band: keyof typeof FORGE_ROOM_BANDS,
  tileSize: number,
): { min: number; max: number } {
  return { min: FORGE_ROOM_BANDS[band].min * tileSize, max: FORGE_ROOM_BANDS[band].max * tileSize };
}
