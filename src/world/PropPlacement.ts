import { FLOOR, WALL } from "../dungeon/generateDungeon";
import type { DungeonData, DungeonRoom, GridCell } from "../dungeon/types";
import type { CellOccupancyQuery } from "./FloorOccupancyGrid";

const CARDINALS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** Props that read correctly only when their back sits on a wall. */
export const WALL_HUGGING_KINDS = new Set([
  "bookshelf",
  "lectern",
  "weapon-rack",
  "ossuary-cabinet",
  "urns",
  "coffin",
  "banner",
  "high-chair",
]);

/** Free-standing furniture that prefers open floor, not jammed into corners only. */
export const FLOOR_FURNITURE_KINDS = new Set([
  "table",
  "bench",
  "chair",
  "ritual-table",
  "crates",
  "barrels",
  "chest",
  "reliquary",
]);

export interface WallSeat {
  cell: GridCell;
  /** Unit direction from wall into the room (prop faces this way). */
  intoDx: number;
  intoDy: number;
}

export interface CornerSeat extends WallSeat {
  /** First wall normal, pointing from the wall into the room. */
  wallADx: number;
  wallADy: number;
  /** Second wall normal, pointing from the wall into the room. */
  wallBDx: number;
  wallBDy: number;
}

/**
 * Placement code consumes a numeric, floor-owned query.  The Set branch is a
 * compatibility overload for callers outside the live world build; it is
 * deliberately queried in place and never copied.
 */
export type PlacementOccupancyQuery = CellOccupancyQuery | ReadonlySet<string>;

export function isPlacementOccupied(occupancy: PlacementOccupancyQuery, cell: GridCell): boolean {
  if ("isOccupied" in occupancy) return occupancy.isOccupied(cell.x, cell.y);
  return occupancy.has(`${cell.x},${cell.y}`);
}

export function isProtectedTraversalCell(dungeon: DungeonData, cell: GridCell): boolean {
  if (
    (cell.x === dungeon.spawn.x && cell.y === dungeon.spawn.y) ||
    (cell.x === dungeon.exit.x && cell.y === dungeon.exit.y)
  )
    return true;
  const index = cell.y * dungeon.width + cell.x;
  if (
    dungeon.forge?.corridors[index] ||
    dungeon.forge?.doorways[index] ||
    dungeon.forge?.pools[index] ||
    dungeon.forge?.lakeMask[index] ||
    dungeon.forge?.spawns.some((spawn) => spawn.x === cell.x && spawn.y === cell.y)
  ) {
    return true;
  }
  // Procedural topology: doorway tile and the floor mouth in front of it.
  for (const doorway of dungeon.topology?.doorways ?? []) {
    if (doorway.cell.x === cell.x && doorway.cell.y === cell.y) return true;
    if (doorway.outside.x === cell.x && doorway.outside.y === cell.y) return true;
  }
  return false;
}

export function findNearestPropCell(
  dungeon: DungeonData,
  origin: GridCell,
  occupied: PlacementOccupancyQuery,
  maxRadius = 4,
  isExtraBlocked: (cell: GridCell) => boolean = () => false,
): GridCell | null {
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
        const cell = { x: origin.x + offsetX, y: origin.y + offsetY };
        if (dungeon.grid[cell.y]?.[cell.x] !== FLOOR) continue;
        if (
          isPlacementOccupied(occupied, cell) ||
          isProtectedTraversalCell(dungeon, cell) ||
          isExtraBlocked(cell)
        )
          continue;
        return cell;
      }
    }
  }
  return null;
}

/** Floor cells that touch masonry, with the direction the prop should face (into the room). */
export function collectRoomWallSeats(dungeon: DungeonData, room: DungeonRoom): WallSeat[] {
  const seats: WallSeat[] = [];
  // The nested loops visit each cell once and CARDINALS contains each normal
  // once, so a (cell, normal) pair is unique by construction. Do not add a
  // string-keyed Set here: classic dressing calls this for every room.
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      if (dungeon.grid[y]?.[x] !== FLOOR) continue;
      const cell = { x, y };
      if (isProtectedTraversalCell(dungeon, cell)) continue;
      for (const [wallDx, wallDy] of CARDINALS) {
        if (dungeon.grid[y + wallDy]?.[x + wallDx] !== WALL) continue;
        // Prefer seats that are not doorway mouths (floor beyond the wall cell's side).
        const intoDx = -wallDx;
        const intoDy = -wallDy;
        seats.push({ cell, intoDx, intoDy });
      }
    }
  }
  return seats;
}

/**
 * Floor cells tucked into two adjacent walls. The bisector points into the
 * open part of the room and gives corner sprites a safe forward direction.
 */
export function collectRoomCornerSeats(dungeon: DungeonData, room: DungeonRoom): CornerSeat[] {
  const seats: CornerSeat[] = [];
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      if (dungeon.grid[y]?.[x] !== FLOOR) continue;
      const cell = { x, y };
      if (isProtectedTraversalCell(dungeon, cell)) continue;
      const inward = CARDINALS.filter(
        ([wallDx, wallDy]) => dungeon.grid[y + wallDy]?.[x + wallDx] === WALL,
      ).map(([wallDx, wallDy]) => [-wallDx, -wallDy] as const);
      for (let first = 0; first < inward.length; first += 1) {
        for (let second = first + 1; second < inward.length; second += 1) {
          const [wallADx, wallADy] = inward[first]!;
          const [wallBDx, wallBDy] = inward[second]!;
          if (wallADx * wallBDx + wallADy * wallBDy !== 0) continue;
          // `inward` preserves the four cardinal order, so each pair is
          // emitted once by the ordered first/second loops.
          seats.push({
            cell,
            intoDx: wallADx + wallBDx,
            intoDy: wallADy + wallBDy,
            wallADx,
            wallADy,
            wallBDx,
            wallBDy,
          });
        }
      }
    }
  }
  return seats;
}

/** Open floor seats away from walls for tables/chairs (keeps circulation clear). */
export function collectRoomInteriorSeats(
  dungeon: DungeonData,
  room: DungeonRoom,
  margin = 1,
): GridCell[] {
  const seats: GridCell[] = [];
  const minX = room.x + margin;
  const maxX = room.x + room.width - 1 - margin;
  const minY = room.y + margin;
  const maxY = room.y + room.height - 1 - margin;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (dungeon.grid[y]?.[x] !== FLOOR) continue;
      const cell = { x, y };
      if (isProtectedTraversalCell(dungeon, cell)) continue;
      // Skip pure wall-flush cells so tables don't sit inside bookcases.
      const wallTouch = CARDINALS.some(([dx, dy]) => dungeon.grid[y + dy]?.[x + dx] === WALL);
      if (wallTouch && room.width > 5 && room.height > 5) continue;
      seats.push(cell);
    }
  }
  // Fallback: if room is tiny, allow edge-adjacent floor.
  if (seats.length === 0) {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        if (dungeon.grid[y]?.[x] !== FLOOR) continue;
        const cell = { x, y };
        if (!isProtectedTraversalCell(dungeon, cell)) seats.push(cell);
      }
    }
  }
  return seats;
}

/** Yaw so a prop that faces +Z looks into the room. */
export function facingRotation(intoDx: number, intoDy: number): number {
  return Math.atan2(intoDx, intoDy);
}

/**
 * Shift a wall prop toward the masonry so its back sits on the wall plane.
 * `depth` is half the prop's front-to-back size in meters.
 */
export function wallHugWorldOffset(
  intoDx: number,
  intoDy: number,
  tileSize: number,
  depth = 0.28,
): { x: number; z: number } {
  const towardWall = tileSize * 0.5 - depth;
  return {
    x: -intoDx * towardWall,
    z: -intoDy * towardWall,
  };
}

/** Shift a corner prop toward two adjacent walls while leaving a safe inset. */
export function cornerHugWorldOffset(
  corner: Pick<CornerSeat, "wallADx" | "wallADy" | "wallBDx" | "wallBDy">,
  tileSize: number,
  depth = 0.22,
): { x: number; z: number } {
  const towardWall = tileSize * 0.5 - depth;
  return {
    x: -(corner.wallADx + corner.wallBDx) * towardWall,
    z: -(corner.wallADy + corner.wallBDy) * towardWall,
  };
}

export function pickSpreadSeats<T>(seats: readonly T[], count: number, seedSalt: number): T[] {
  if (seats.length === 0 || count <= 0) return [];
  const ordered = seats.map((seat, index) => ({ seat, rank: (index * 17 + seedSalt * 13) % 997 }));
  ordered.sort((a, b) => a.rank - b.rank);
  const picked: T[] = [];
  const step = Math.max(1, Math.floor(ordered.length / count));
  for (let i = 0; i < ordered.length && picked.length < count; i += step) {
    picked.push(ordered[i]!.seat);
  }
  // Fill remaining if step skipped too many.
  for (const entry of ordered) {
    if (picked.length >= count) break;
    if (!picked.includes(entry.seat)) picked.push(entry.seat);
  }
  return picked;
}

/**
 * Minimum Chebyshev gap from player spawn for the phoenix egg.
 * Keeps the relic off the starting tile neighborhood so it never spawns "next to" the player.
 */
export const PHOENIX_EGG_MIN_SPAWN_DISTANCE = 8;

function chebyshevDistance(a: GridCell, b: GridCell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function roomPathDistance(dungeon: DungeonData, room: DungeonRoom): number {
  return dungeon.distances[room.center.y * dungeon.width + room.center.x] ?? -1;
}

function isFreePhoenixSeat(
  dungeon: DungeonData,
  cell: GridCell,
  excluded: PlacementOccupancyQuery,
  minSpawnDistance: number,
): boolean {
  if (isPlacementOccupied(excluded, cell)) return false;
  if (isProtectedTraversalCell(dungeon, cell)) return false;
  if (chebyshevDistance(cell, dungeon.spawn) < minSpawnDistance) return false;
  return true;
}

function uniqueFreeCells(dungeon: DungeonData, cells: readonly GridCell[]): GridCell[] {
  const seen = new Set<number>();
  const unique: GridCell[] = [];
  for (const cell of cells) {
    const key = cell.y * dungeon.width + cell.x;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(cell);
  }
  return unique;
}

/**
 * Floor-only phoenix egg seat: prefer a free room corner, never beside spawn,
 * never on occupied/objective cells. Falls back to wall seats, then far interior.
 */
export function selectPhoenixEggSeat(
  dungeon: DungeonData,
  rooms: readonly DungeonRoom[],
  excluded: PlacementOccupancyQuery,
  seedSalt: number,
  minSpawnDistance = PHOENIX_EGG_MIN_SPAWN_DISTANCE,
): GridCell | null {
  const ranked = [...rooms]
    .filter((room) => room.role === "room")
    .sort((left, right) => roomPathDistance(dungeon, left) - roomPathDistance(dungeon, right));
  if (ranked.length === 0) return null;

  // Prefer mid/late route rooms so the egg reads as a hidden find, not a lobby gift.
  const startIndex = Math.min(ranked.length - 1, Math.floor(ranked.length * 0.4));
  const preferred = ranked.slice(startIndex);
  const roomBands = preferred.length > 0 ? [preferred, ranked] : [ranked];

  for (const band of roomBands) {
    const corners: GridCell[] = [];
    for (const room of band) {
      for (const seat of collectRoomCornerSeats(dungeon, room)) {
        if (isFreePhoenixSeat(dungeon, seat.cell, excluded, minSpawnDistance)) {
          corners.push(seat.cell);
        }
      }
    }
    const cornerPick = pickSpreadSeats(uniqueFreeCells(dungeon, corners), 1, seedSalt)[0];
    if (cornerPick) return cornerPick;

    const walls: GridCell[] = [];
    for (const room of band) {
      for (const seat of collectRoomWallSeats(dungeon, room)) {
        if (isFreePhoenixSeat(dungeon, seat.cell, excluded, minSpawnDistance)) {
          walls.push(seat.cell);
        }
      }
    }
    const wallPick = pickSpreadSeats(uniqueFreeCells(dungeon, walls), 1, seedSalt + 11)[0];
    if (wallPick) return wallPick;

    const interiors: GridCell[] = [];
    for (const room of band) {
      for (const cell of collectRoomInteriorSeats(dungeon, room, 0)) {
        if (isFreePhoenixSeat(dungeon, cell, excluded, minSpawnDistance)) {
          interiors.push(cell);
        }
      }
    }
    const interiorPick = pickSpreadSeats(uniqueFreeCells(dungeon, interiors), 1, seedSalt + 23)[0];
    if (interiorPick) return interiorPick;
  }

  return null;
}
