import type { DungeonData, DungeonRoom, GridCell } from "../dungeon/types";
import { FLOOR } from "../dungeon/generateDungeon";
import { selectForgeMagicStonePlacements } from "../forge/layoutTuning";
import { STONE_ORDER, type StoneId } from "../ui/copy";

export interface MagicStonePlacement {
  stoneId: StoneId;
  room: DungeonRoom;
  cell: GridCell;
  offsetX: number;
  offsetZ: number;
}

/** Preferred Chebyshev gap between stones (cell centers must not share a 3×3). */
const PREFERRED_STONE_SPACING = 2;
/** Absolute minimum: distinct cells only (still playable, better than softlock). */
const MINIMUM_STONE_SPACING = 1;

function roomDistance(dungeon: DungeonData, room: DungeonRoom): number {
  return dungeon.distances[room.center.y * dungeon.width + room.center.x] ?? -1;
}

function isAuthoredCellOccupied(dungeon: DungeonData, cell: GridCell): boolean {
  const forge = dungeon.forge;
  if (!forge) return false;
  const index = cell.y * dungeon.width + cell.x;
  return Boolean(
    forge.doorways[index] ||
    forge.corridors[index] ||
    forge.pools[index] ||
    forge.lakeMask[index] ||
    forge.props.some((prop) => prop.x === cell.x && prop.y === cell.y) ||
    forge.spawns.some((spawn) => spawn.x === cell.x && spawn.y === cell.y),
  );
}

function hasObjectiveClearance(dungeon: DungeonData, room: DungeonRoom, cell: GridCell): boolean {
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const sample = { x: cell.x + offsetX, y: cell.y + offsetY };
      if (
        sample.x < room.x ||
        sample.y < room.y ||
        sample.x >= room.x + room.width ||
        sample.y >= room.y + room.height ||
        dungeon.grid[sample.y]?.[sample.x] !== FLOOR ||
        isAuthoredCellOccupied(dungeon, sample)
      )
        return false;
    }
  }
  return true;
}

function selectStoneCell(
  dungeon: DungeonData,
  room: DungeonRoom,
  stoneIndex: number,
  used: ReadonlySet<string>,
): GridCell | null {
  const candidates: GridCell[] = [];
  for (let y = room.y + 1; y < room.y + room.height - 1; y += 1) {
    for (let x = room.x + 1; x < room.x + room.width - 1; x += 1) {
      const cell = { x, y };
      if (
        used.has(cellKey(cell)) ||
        dungeon.grid[y]?.[x] !== FLOOR ||
        isAuthoredCellOccupied(dungeon, cell) ||
        !isReachableObjectiveCell(dungeon, cell)
      )
        continue;
      candidates.push(cell);
    }
  }
  if (candidates.length === 0) {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        const cell = { x, y };
        if (
          used.has(cellKey(cell)) ||
          dungeon.grid[y]?.[x] !== FLOOR ||
          isAuthoredCellOccupied(dungeon, cell) ||
          !isReachableObjectiveCell(dungeon, cell)
        )
          continue;
        candidates.push(cell);
      }
    }
  }
  if (candidates.length === 0) return null;
  const clearCandidates = candidates.filter((cell) => hasObjectiveClearance(dungeon, room, cell));
  const ranked = clearCandidates.length > 0 ? clearCandidates : candidates;
  ranked.sort((left, right) => {
    const leftDistance = Math.abs(left.x - room.center.x) + Math.abs(left.y - room.center.y);
    const rightDistance = Math.abs(right.x - room.center.x) + Math.abs(right.y - room.center.y);
    const leftRank = (left.x * 31 + left.y * 17 + room.id * 13 + stoneIndex * 47) % 997;
    const rightRank = (right.x * 31 + right.y * 17 + room.id * 13 + stoneIndex * 47) % 997;
    return leftDistance - rightDistance || leftRank - rightRank;
  });
  return ranked[0] ?? null;
}

function stoneOffset(roomId: number, stoneIndex: number): number {
  return (((roomId * 17 + stoneIndex * 31) % 5) - 2) * 0.035;
}

function cellKey(cell: GridCell): string {
  return `${cell.x},${cell.y}`;
}

function roomContains(room: DungeonRoom, cell: GridCell): boolean {
  return (
    cell.x >= room.x &&
    cell.y >= room.y &&
    cell.x < room.x + room.width &&
    cell.y < room.y + room.height
  );
}

function roomAt(dungeon: DungeonData, cell: GridCell): DungeonRoom | undefined {
  return (
    dungeon.rooms.find((room) => roomContains(room, cell) && room.role === "room") ??
    dungeon.rooms.find((room) => roomContains(room, cell))
  );
}

const objectiveDistanceCache = new WeakMap<DungeonData, Int32Array>();

/** Independent traversal proof so imported/legacy Forge payloads cannot omit objective reachability. */
function objectiveDistances(dungeon: DungeonData): Int32Array {
  const cached = objectiveDistanceCache.get(dungeon);
  if (cached) return cached;
  const distances = new Int32Array(dungeon.width * dungeon.height);
  distances.fill(-1);
  const spawnIndex = dungeon.spawn.y * dungeon.width + dungeon.spawn.x;
  if (dungeon.grid[dungeon.spawn.y]?.[dungeon.spawn.x] !== FLOOR) {
    objectiveDistanceCache.set(dungeon, distances);
    return distances;
  }
  const queue: GridCell[] = [{ ...dungeon.spawn }];
  distances[spawnIndex] = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const currentDistance = distances[current.y * dungeon.width + current.x]!;
    for (const next of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      if (dungeon.grid[next.y]?.[next.x] !== FLOOR) continue;
      const index = next.y * dungeon.width + next.x;
      if (distances[index] >= 0) continue;
      distances[index] = currentDistance + 1;
      queue.push(next);
    }
  }
  objectiveDistanceCache.set(dungeon, distances);
  return distances;
}

function objectiveDistance(dungeon: DungeonData, cell: GridCell): number {
  return objectiveDistances(dungeon)[cell.y * dungeon.width + cell.x] ?? -1;
}

function isReachableObjectiveCell(dungeon: DungeonData, cell: GridCell): boolean {
  if (dungeon.grid[cell.y]?.[cell.x] !== FLOOR) return false;
  if (
    (cell.x === dungeon.spawn.x && cell.y === dungeon.spawn.y) ||
    (cell.x === dungeon.exit.x && cell.y === dungeon.exit.y)
  )
    return false;
  return objectiveDistance(dungeon, cell) >= 0;
}

function chebyshev(left: GridCell, right: GridCell): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function isSpacedFromPlacements(
  cell: GridCell,
  placements: readonly MagicStonePlacement[],
  minDistance = PREFERRED_STONE_SPACING,
): boolean {
  return placements.every((placement) => chebyshev(placement.cell, cell) >= minDistance);
}

function makePlacement(
  stoneId: StoneId,
  stoneIndex: number,
  room: DungeonRoom,
  cell: GridCell,
): MagicStonePlacement {
  const offsetX = stoneOffset(room.id, stoneIndex);
  return {
    stoneId,
    room,
    cell: { ...cell },
    offsetX,
    offsetZ: -offsetX * 0.6,
  };
}

/**
 * Progressive search for one stone seat.
 * Prefer spaced room interiors with clearance; never leave a stone unplaced while
 * any free reachable floor remains (corridors and entrance/exit rooms included).
 */
function fallbackStonePlacement(
  dungeon: DungeonData,
  stoneId: StoneId,
  stoneIndex: number,
  placed: readonly MagicStonePlacement[],
  minSpacing: number,
  allowOccupiedAuthored: boolean,
): MagicStonePlacement | null {
  const traversalDistances = objectiveDistances(dungeon);
  const exitDistance = objectiveDistance(dungeon, dungeon.exit);
  const targetDistance = Math.max(1, exitDistance) * [0.28, 0.48, 0.68, 0.88][stoneIndex]!;
  const used = new Set(placed.map((placement) => cellKey(placement.cell)));
  const rankedRooms = [...dungeon.rooms].sort((left, right) => {
    const leftRole = left.role === "room" ? 0 : 1;
    const rightRole = right.role === "room" ? 0 : 1;
    return leftRole - rightRole || roomDistance(dungeon, left) - roomDistance(dungeon, right);
  });

  type Candidate = {
    room: DungeonRoom;
    cell: GridCell;
    rolePenalty: number;
    clearancePenalty: number;
    spacingPenalty: number;
    distanceError: number;
    tieBreak: number;
  };
  const candidates: Candidate[] = [];

  const pushCell = (room: DungeonRoom, cell: GridCell): void => {
    if (used.has(cellKey(cell)) || !isReachableObjectiveCell(dungeon, cell)) return;
    if (!allowOccupiedAuthored && isAuthoredCellOccupied(dungeon, cell)) return;
    if (!isSpacedFromPlacements(cell, placed, minSpacing)) return;
    const distance = traversalDistances[cell.y * dungeon.width + cell.x] ?? -1;
    candidates.push({
      room,
      cell,
      rolePenalty: room.role === "room" ? 0 : 1,
      clearancePenalty: hasObjectiveClearance(dungeon, room, cell) ? 0 : 1,
      spacingPenalty: isSpacedFromPlacements(cell, placed, PREFERRED_STONE_SPACING) ? 0 : 1,
      distanceError: Math.abs(distance - targetDistance),
      tieBreak: (cell.x * 31 + cell.y * 17 + room.id * 13 + stoneIndex * 47) % 997,
    });
  };

  for (const room of rankedRooms) {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        pushCell(room, { x, y });
      }
    }
  }

  // Global floor scan: pure corridor tiles are valid last seats (beats softlock).
  if (candidates.length === 0) {
    for (let y = 0; y < dungeon.height; y += 1) {
      for (let x = 0; x < dungeon.width; x += 1) {
        if (dungeon.grid[y]?.[x] !== FLOOR) continue;
        const cell = { x, y };
        const room = roomAt(dungeon, cell) ?? rankedRooms[0];
        if (!room) continue;
        pushCell(room, cell);
      }
    }
  }

  candidates.sort(
    (left, right) =>
      left.spacingPenalty - right.spacingPenalty ||
      left.rolePenalty - right.rolePenalty ||
      left.clearancePenalty - right.clearancePenalty ||
      left.distanceError - right.distanceError ||
      left.tieBreak - right.tieBreak,
  );
  const selected = candidates[0];
  if (!selected) return null;
  return makePlacement(stoneId, stoneIndex, selected.room, selected.cell);
}

function placeOneStone(
  dungeon: DungeonData,
  stoneId: StoneId,
  stoneIndex: number,
  placed: readonly MagicStonePlacement[],
  preferred: MagicStonePlacement | undefined,
): MagicStonePlacement {
  const preferredRoom = preferred
    ? dungeon.rooms.find(
        (room) => room.id === preferred.room.id && roomContains(room, preferred.cell),
      )
    : undefined;
  const preferredValid =
    preferred &&
    preferredRoom &&
    isReachableObjectiveCell(dungeon, preferred.cell) &&
    !isAuthoredCellOccupied(dungeon, preferred.cell) &&
    isSpacedFromPlacements(preferred.cell, placed, PREFERRED_STONE_SPACING);
  if (preferredValid && preferredRoom) {
    return makePlacement(stoneId, stoneIndex, preferredRoom, preferred.cell);
  }

  const attempts: Array<{ spacing: number; allowOccupied: boolean }> = [
    { spacing: PREFERRED_STONE_SPACING, allowOccupied: false },
    { spacing: MINIMUM_STONE_SPACING, allowOccupied: false },
    { spacing: PREFERRED_STONE_SPACING, allowOccupied: true },
    { spacing: MINIMUM_STONE_SPACING, allowOccupied: true },
  ];
  for (const attempt of attempts) {
    const seat = fallbackStonePlacement(
      dungeon,
      stoneId,
      stoneIndex,
      placed,
      attempt.spacing,
      attempt.allowOccupied,
    );
    if (seat) return seat;
  }

  throw new Error(
    `Dungeon completeness failed: cannot place magic stone "${stoneId}" (${stoneIndex + 1}/${STONE_ORDER.length}) on a reachable floor cell.`,
  );
}

/** Repairs missing, duplicate, blocked, or unreachable placements before Play starts. */
function finalizeMagicStonePlacements(
  dungeon: DungeonData,
  candidates: readonly MagicStonePlacement[],
): MagicStonePlacement[] {
  const byId = new Map(candidates.map((placement) => [placement.stoneId, placement]));
  const placed: MagicStonePlacement[] = [];
  for (const [stoneIndex, stoneId] of STONE_ORDER.entries()) {
    placed.push(placeOneStone(dungeon, stoneId, stoneIndex, placed, byId.get(stoneId)));
  }
  return placed;
}

/**
 * Play contract: four ordered stones on distinct reachable floor cells, never
 * on spawn/exit. Spacing is preferred at placement time; adjacent seats still
 * count so small maps never softlock.
 */
export function hasValidMagicStonePlacementContract(
  dungeon: DungeonData,
  placements: readonly MagicStonePlacement[],
): boolean {
  if (placements.length !== STONE_ORDER.length) return false;
  if (placements.some((placement, index) => placement.stoneId !== STONE_ORDER[index])) return false;
  const cells = new Set<string>();
  for (const placement of placements) {
    // Authored props may share a cell only as a last-resort seat; reachability
    // and uniqueness are the hard completeness rules that prevent softlocks.
    if (!isReachableObjectiveCell(dungeon, placement.cell)) return false;
    cells.add(cellKey(placement.cell));
  }
  return cells.size === STONE_ORDER.length;
}

/** True when the exit portal seat is a reachable floor cell from spawn. */
export function hasValidPortalPlacementContract(dungeon: DungeonData): boolean {
  if (dungeon.grid[dungeon.exit.y]?.[dungeon.exit.x] !== FLOOR) return false;
  if (dungeon.exit.x === dungeon.spawn.x && dungeon.exit.y === dungeon.spawn.y) return false;
  return objectiveDistance(dungeon, dungeon.exit) >= 0;
}

/** Floor cells reserved around the four objective stones for access and clear staging. */
export function magicStoneClearanceCells(
  dungeon: DungeonData,
  placements: readonly MagicStonePlacement[],
  radius = 1,
): GridCell[] {
  const cells = new Map<string, GridCell>();
  const safeRadius = Math.max(0, Math.trunc(radius));
  for (const placement of placements) {
    for (let offsetY = -safeRadius; offsetY <= safeRadius; offsetY += 1) {
      for (let offsetX = -safeRadius; offsetX <= safeRadius; offsetX += 1) {
        const cell = { x: placement.cell.x + offsetX, y: placement.cell.y + offsetY };
        if (dungeon.grid[cell.y]?.[cell.x] !== FLOOR) continue;
        cells.set(`${cell.x},${cell.y}`, cell);
      }
    }
  }
  return [...cells.values()];
}

/**
 * Shared objective placement contract. Editor and runtime consume this exact
 * ordered result so the four map diamonds point to the rooms used in play.
 * Always returns four distinct reachable seats or throws.
 */
export function selectMagicStonePlacements(dungeon: DungeonData): MagicStonePlacement[] {
  if (dungeon.forge) {
    const flatGrid = new Uint8Array(dungeon.width * dungeon.height);
    dungeon.grid.forEach((row, y) => flatGrid.set(row, y * dungeon.width));
    const forgePlacements = selectForgeMagicStonePlacements({
      width: dungeon.width,
      height: dungeon.height,
      grid: flatGrid,
      roomIds: dungeon.forge.roomIds,
      corridors: dungeon.forge.corridors,
      doorways: dungeon.forge.doorways,
      pools: dungeon.forge.pools,
      lakeMask: dungeon.forge.lakeMask,
      bfs: dungeon.forge.bfs,
      rooms: dungeon.forge.rooms,
      excludedRoomIds: new Set([dungeon.entranceRoomId, dungeon.exitRoomId]),
      blockedCells: [...dungeon.forge.props, ...dungeon.forge.spawns],
      floorValue: FLOOR,
    });
    const roomById = new Map(dungeon.rooms.map((room) => [room.id, room]));
    const placements = forgePlacements.flatMap((placement, index) => {
      const room = roomById.get(placement.roomId);
      if (!room) return [];
      return [makePlacement(placement.stoneId, index, room, { x: placement.x, y: placement.y })];
    });
    return finalizeMagicStonePlacements(dungeon, placements);
  }

  const rankedRooms = dungeon.rooms
    .filter((room) => room.role === "room")
    .sort((left, right) => roomDistance(dungeon, left) - roomDistance(dungeon, right));
  // Prefer regular rooms; fall back to entrance/exit seats when the map is tiny.
  const roomPool =
    rankedRooms.length > 0
      ? rankedRooms
      : [...dungeon.rooms].sort(
          (left, right) => roomDistance(dungeon, left) - roomDistance(dungeon, right),
        );
  if (roomPool.length === 0) return finalizeMagicStonePlacements(dungeon, []);

  const selected: DungeonRoom[] = [];
  const percentileIndices = [0.28, 0.48, 0.68, 0.88].map((percentile) =>
    Math.min(roomPool.length - 1, Math.max(0, Math.floor(roomPool.length * percentile))),
  );
  for (const index of percentileIndices) {
    const room = roomPool[index];
    if (room && !selected.includes(room)) selected.push(room);
  }
  for (const room of roomPool) {
    if (!selected.includes(room)) selected.push(room);
    if (selected.length >= STONE_ORDER.length) break;
  }

  const used = new Set<string>();
  const placements: MagicStonePlacement[] = [];
  for (const [index, stoneId] of STONE_ORDER.entries()) {
    const room = selected[index] ?? roomPool[index % roomPool.length]!;
    const cell = selectStoneCell(dungeon, room, index, used);
    if (!cell) continue;
    used.add(cellKey(cell));
    placements.push(makePlacement(stoneId, index, room, cell));
  }
  return finalizeMagicStonePlacements(dungeon, placements);
}
