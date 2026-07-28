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

function selectStoneCell(dungeon: DungeonData, room: DungeonRoom, stoneIndex: number): GridCell {
  const candidates: GridCell[] = [];
  for (let y = room.y + 1; y < room.y + room.height - 1; y += 1) {
    for (let x = room.x + 1; x < room.x + room.width - 1; x += 1) {
      const cell = { x, y };
      if (dungeon.grid[y]?.[x] !== FLOOR || isAuthoredCellOccupied(dungeon, cell)) continue;
      candidates.push(cell);
    }
  }
  if (candidates.length === 0) return { ...room.center };
  const clearCandidates = candidates.filter((cell) => hasObjectiveClearance(dungeon, room, cell));
  const ranked = clearCandidates.length > 0 ? clearCandidates : candidates;
  ranked.sort((left, right) => {
    const leftDistance = Math.abs(left.x - room.center.x) + Math.abs(left.y - room.center.y);
    const rightDistance = Math.abs(right.x - room.center.x) + Math.abs(right.y - room.center.y);
    const leftRank = (left.x * 31 + left.y * 17 + room.id * 13 + stoneIndex * 47) % 997;
    const rightRank = (right.x * 31 + right.y * 17 + room.id * 13 + stoneIndex * 47) % 997;
    return leftDistance - rightDistance || leftRank - rightRank;
  });
  return ranked[0]!;
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

function isSpacedFromPlacements(
  cell: GridCell,
  placements: readonly MagicStonePlacement[],
): boolean {
  return placements.every(
    (placement) =>
      Math.max(Math.abs(placement.cell.x - cell.x), Math.abs(placement.cell.y - cell.y)) > 1,
  );
}

function fallbackStonePlacement(
  dungeon: DungeonData,
  stoneId: StoneId,
  stoneIndex: number,
  placed: readonly MagicStonePlacement[],
): MagicStonePlacement | null {
  const traversalDistances = objectiveDistances(dungeon);
  const exitDistance = objectiveDistance(dungeon, dungeon.exit);
  const targetDistance = Math.max(1, exitDistance) * [0.28, 0.48, 0.68, 0.88][stoneIndex]!;
  const rankedRooms = [...dungeon.rooms].sort((left, right) => {
    const leftRole = left.role === "room" ? 0 : 1;
    const rightRole = right.role === "room" ? 0 : 1;
    return leftRole - rightRole || roomDistance(dungeon, left) - roomDistance(dungeon, right);
  });
  const used = new Set(placed.map((placement) => cellKey(placement.cell)));
  const candidates: Array<{
    room: DungeonRoom;
    cell: GridCell;
    rolePenalty: number;
    clearancePenalty: number;
    spacingPenalty: number;
    distanceError: number;
    tieBreak: number;
  }> = [];

  for (const room of rankedRooms) {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        const cell = { x, y };
        if (
          used.has(cellKey(cell)) ||
          !isReachableObjectiveCell(dungeon, cell) ||
          isAuthoredCellOccupied(dungeon, cell)
        )
          continue;
        const distance = traversalDistances[y * dungeon.width + x] ?? -1;
        candidates.push({
          room,
          cell,
          rolePenalty: room.role === "room" ? 0 : 1,
          clearancePenalty: hasObjectiveClearance(dungeon, room, cell) ? 0 : 1,
          spacingPenalty: isSpacedFromPlacements(cell, placed) ? 0 : 1,
          distanceError: Math.abs(distance - targetDistance),
          tieBreak: (x * 31 + y * 17 + room.id * 13 + stoneIndex * 47) % 997,
        });
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
  const offsetX = stoneOffset(selected.room.id, stoneIndex);
  return {
    stoneId,
    room: selected.room,
    cell: selected.cell,
    offsetX,
    offsetZ: -offsetX * 0.6,
  };
}

/** Repairs missing, duplicate, blocked, or unreachable placements before Play starts. */
function finalizeMagicStonePlacements(
  dungeon: DungeonData,
  candidates: readonly MagicStonePlacement[],
): MagicStonePlacement[] {
  const byId = new Map(candidates.map((placement) => [placement.stoneId, placement]));
  const placed: MagicStonePlacement[] = [];
  for (const [stoneIndex, stoneId] of STONE_ORDER.entries()) {
    const candidate = byId.get(stoneId);
    const candidateRoom = candidate
      ? dungeon.rooms.find(
          (room) => room.id === candidate.room.id && roomContains(room, candidate.cell),
        )
      : undefined;
    const candidateValid =
      candidate &&
      candidateRoom &&
      isReachableObjectiveCell(dungeon, candidate.cell) &&
      !isAuthoredCellOccupied(dungeon, candidate.cell) &&
      isSpacedFromPlacements(candidate.cell, placed);
    if (candidateValid) {
      placed.push({ ...candidate, room: candidateRoom });
      continue;
    }
    const fallback = fallbackStonePlacement(dungeon, stoneId, stoneIndex, placed);
    if (!fallback) {
      // Small editor projections may intentionally omit playable traversal space.
      // StaticDungeonScene validates this result before Play and rejects any map
      // that cannot materialize all four distinct reachable objective stones.
      return [...candidates];
    }
    placed.push(fallback);
  }
  return placed;
}

export function hasValidMagicStonePlacementContract(
  dungeon: DungeonData,
  placements: readonly MagicStonePlacement[],
): boolean {
  if (placements.length !== STONE_ORDER.length) return false;
  if (placements.some((placement, index) => placement.stoneId !== STONE_ORDER[index])) return false;
  const cells = new Set<string>();
  for (const placement of placements) {
    if (!isReachableObjectiveCell(dungeon, placement.cell)) return false;
    if (
      !isSpacedFromPlacements(
        placement.cell,
        placements.filter((other) => other !== placement),
      )
    )
      return false;
    cells.add(cellKey(placement.cell));
  }
  return cells.size === STONE_ORDER.length;
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
      const offsetX = stoneOffset(room.id, index);
      return [
        {
          stoneId: placement.stoneId,
          room,
          cell: { x: placement.x, y: placement.y },
          offsetX,
          offsetZ: -offsetX * 0.6,
        },
      ];
    });
    return finalizeMagicStonePlacements(dungeon, placements);
  }
  const rankedRooms = dungeon.rooms
    .filter((room) => room.role === "room")
    .sort((left, right) => roomDistance(dungeon, left) - roomDistance(dungeon, right));
  if (rankedRooms.length === 0) return finalizeMagicStonePlacements(dungeon, []);

  const selected: DungeonRoom[] = [];
  const percentileIndices = [0.28, 0.48, 0.68, 0.88].map((percentile) =>
    Math.min(rankedRooms.length - 1, Math.max(0, Math.floor(rankedRooms.length * percentile))),
  );
  for (const index of percentileIndices) {
    const room = rankedRooms[index];
    if (room && !selected.includes(room)) selected.push(room);
  }
  for (const room of rankedRooms) {
    if (!selected.includes(room)) selected.push(room);
    if (selected.length >= STONE_ORDER.length) break;
  }

  const placements = STONE_ORDER.map((stoneId, index) => {
    const room = selected[index] ?? rankedRooms[index % rankedRooms.length]!;
    const cell = selectStoneCell(dungeon, room, index);
    const offsetX = stoneOffset(room.id, index);
    return {
      stoneId,
      room,
      cell,
      offsetX,
      offsetZ: -offsetX * 0.6,
    };
  });
  return finalizeMagicStonePlacements(dungeon, placements);
}
