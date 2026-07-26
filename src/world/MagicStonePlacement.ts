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
    return forgePlacements.flatMap((placement, index) => {
      const room = roomById.get(placement.roomId);
      if (!room) return [];
      const offsetX = (((room.id * 17 + index * 31) % 5) - 2) * 0.035;
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
  }
  const rankedRooms = dungeon.rooms
    .filter((room) => room.role === "room")
    .sort((left, right) => roomDistance(dungeon, left) - roomDistance(dungeon, right));
  if (rankedRooms.length === 0) return [];

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

  return STONE_ORDER.map((stoneId, index) => {
    const room = selected[index] ?? rankedRooms[index % rankedRooms.length]!;
    const cell = selectStoneCell(dungeon, room, index);
    const offsetX = (((room.id * 17 + index * 31) % 5) - 2) * 0.035;
    return {
      stoneId,
      room,
      cell,
      offsetX,
      offsetZ: -offsetX * 0.6,
    };
  });
}
