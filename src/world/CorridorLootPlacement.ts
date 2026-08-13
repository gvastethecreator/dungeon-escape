import { FLOOR } from "../dungeon/generateDungeon";
import type { DungeonData, GridCell } from "../dungeon/types";
import { spreadDepthFractions } from "../game/BiomeLootPlan";
import type { CellOccupancyQuery } from "./FloorOccupancyGrid";
import { isPlacementOccupied, type PlacementOccupancyQuery } from "./PropPlacement";

const CARDINALS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Keep floor shotguns off the first hallway tiles beside spawn. */
export const SHOTGUN_FLOOR_MIN_SPAWN_DISTANCE = 5;
/** Chebyshev gap between two floor shotguns so they do not share one short hall. */
export const SHOTGUN_FLOOR_MIN_SEPARATION = 7;

function chebyshev(a: GridCell, b: GridCell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function pathDistance(dungeon: DungeonData, cell: GridCell): number {
  return dungeon.distances[cell.y * dungeon.width + cell.x] ?? -1;
}

function blockTraversalCell(dungeon: DungeonData, blocked: Uint8Array, cell: GridCell): void {
  if (cell.x < 0 || cell.y < 0 || cell.x >= dungeon.width || cell.y >= dungeon.height) return;
  blocked[cell.y * dungeon.width + cell.x] = 1;
}

function isAuthoredCorridor(dungeon: DungeonData, index: number): boolean {
  return Boolean(dungeon.forge?.corridors[index] || dungeon.topology?.corridors[index]);
}

function floorNeighborCount(dungeon: DungeonData, x: number, y: number): number {
  let count = 0;
  for (const [dx, dy] of CARDINALS) {
    if (dungeon.grid[y + dy]?.[x + dx] === FLOOR) count += 1;
  }
  return count;
}

/**
 * Walkable corridor tiles for floor loot and hall scenery. Door mouths, spawn,
 * exit, stairs, and room interiors stay clear. Forge and topology corridors
 * are allowed even when they are wider than one cell.
 */
export function collectCorridorFloorSeats(dungeon: DungeonData): GridCell[] {
  const seats: GridCell[] = [];
  const blocked = new Uint8Array(dungeon.width * dungeon.height);
  blockTraversalCell(dungeon, blocked, dungeon.spawn);
  blockTraversalCell(dungeon, blocked, dungeon.exit);
  for (const doorway of dungeon.topology?.doorways ?? []) {
    blockTraversalCell(dungeon, blocked, doorway.cell);
    blockTraversalCell(dungeon, blocked, doorway.outside);
  }
  for (const stair of dungeon.floor?.stairs ?? []) {
    blockTraversalCell(dungeon, blocked, stair.cell);
    for (const cell of stair.footprint) blockTraversalCell(dungeon, blocked, cell);
  }
  for (const cell of dungeon.floor?.openVerticalCells ?? []) {
    blockTraversalCell(dungeon, blocked, cell);
  }

  for (let y = 1; y < dungeon.height - 1; y += 1) {
    for (let x = 1; x < dungeon.width - 1; x += 1) {
      const index = y * dungeon.width + x;
      if (dungeon.grid[y]?.[x] !== FLOOR || blocked[index]) continue;
      if (dungeon.forge?.doorways[index] || dungeon.forge?.pools[index]) continue;
      const structuralRoomId =
        dungeon.forge?.roomIds[index] ?? dungeon.topology?.roomIds[index] ?? -1;
      if (structuralRoomId >= 0) continue;
      const authored = isAuthoredCorridor(dungeon, index);
      const neighbors = floorNeighborCount(dungeon, x, y);
      if (!authored && (neighbors === 0 || neighbors > 2)) continue;
      seats.push({ x, y });
    }
  }
  return seats;
}

export function collectCorridorPickupSeats(
  dungeon: DungeonData,
  excluded: CellOccupancyQuery,
): GridCell[] {
  return collectCorridorFloorSeats(dungeon).filter((cell) => !excluded.isOccupied(cell.x, cell.y));
}

function sortByRoute(dungeon: DungeonData, seats: readonly GridCell[]): GridCell[] {
  return [...seats].sort((left, right) => {
    const distance = pathDistance(dungeon, left) - pathDistance(dungeon, right);
    if (distance !== 0) return distance;
    return left.y - right.y || left.x - right.x;
  });
}

function isSeparated(cell: GridCell, picked: readonly GridCell[], minSeparation: number): boolean {
  return picked.every((other) => chebyshev(cell, other) >= minSeparation);
}

function pickAlongRoute(
  dungeon: DungeonData,
  seats: readonly GridCell[],
  count: number,
  already: readonly GridCell[],
  minSeparation: number,
): GridCell[] {
  if (seats.length === 0 || count <= 0) return [];
  const ordered = sortByRoute(dungeon, seats);
  const depths = spreadDepthFractions(count, 0.2, 0.62);
  const picked: GridCell[] = [...already];
  const chosen: GridCell[] = [];
  const used = new Set(already.map((cell) => cell.y * dungeon.width + cell.x));

  const tryClaim = (gap: number): void => {
    for (const depth of depths) {
      if (chosen.length >= count) return;
      const target = Math.min(
        ordered.length - 1,
        Math.max(0, Math.round(depth * (ordered.length - 1))),
      );
      for (let radius = 0; radius < ordered.length; radius += 1) {
        const indexes =
          radius === 0
            ? [target]
            : [target + radius, target - radius].filter(
                (index) => index >= 0 && index < ordered.length,
              );
        let claimed = false;
        for (const index of indexes) {
          const seat = ordered[index]!;
          const key = seat.y * dungeon.width + seat.x;
          if (used.has(key) || pathDistance(dungeon, seat) < 0) continue;
          if (!isSeparated(seat, picked, gap)) continue;
          used.add(key);
          picked.push(seat);
          chosen.push(seat);
          claimed = true;
          break;
        }
        if (claimed) break;
      }
    }
  };

  tryClaim(minSeparation);
  if (chosen.length < count) tryClaim(Math.max(3, Math.floor(minSeparation / 2)));
  if (chosen.length < count) tryClaim(1);
  return chosen;
}

/**
 * Prefer corridor tiles spread along the spawn-to-exit route. Rooms are only
 * a fallback when the hall has too few free seats.
 */
export function selectShotgunFloorSeats(
  dungeon: DungeonData,
  count: number,
  occupied: PlacementOccupancyQuery,
  roomFallbackSeats: readonly GridCell[] = [],
): GridCell[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const corridor = collectCorridorFloorSeats(dungeon).filter((cell) => {
    if (isPlacementOccupied(occupied, cell)) return false;
    if (chebyshev(cell, dungeon.spawn) < SHOTGUN_FLOOR_MIN_SPAWN_DISTANCE) return false;
    return pathDistance(dungeon, cell) >= 0;
  });
  const fromHall = pickAlongRoute(dungeon, corridor, n, [], SHOTGUN_FLOOR_MIN_SEPARATION);
  if (fromHall.length >= n) return fromHall;
  const used = new Set(fromHall.map((cell) => `${cell.x},${cell.y}`));
  const fallback = roomFallbackSeats.filter((cell) => {
    if (used.has(`${cell.x},${cell.y}`)) return false;
    if (isPlacementOccupied(occupied, cell)) return false;
    if (chebyshev(cell, dungeon.spawn) < SHOTGUN_FLOOR_MIN_SPAWN_DISTANCE) return false;
    return pathDistance(dungeon, cell) >= 0;
  });
  const fromRooms = pickAlongRoute(
    dungeon,
    fallback,
    n - fromHall.length,
    fromHall,
    SHOTGUN_FLOOR_MIN_SEPARATION,
  );
  return [...fromHall, ...fromRooms];
}
