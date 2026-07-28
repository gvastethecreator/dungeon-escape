import { FLOOR, WALL } from "../dungeon/generateDungeon";
import type { DungeonData, DungeonRoom, GridCell } from "../dungeon/types";

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

export function isProtectedTraversalCell(dungeon: DungeonData, cell: GridCell): boolean {
  if (
    (cell.x === dungeon.spawn.x && cell.y === dungeon.spawn.y) ||
    (cell.x === dungeon.exit.x && cell.y === dungeon.exit.y)
  )
    return true;
  const index = cell.y * dungeon.width + cell.x;
  return Boolean(
    dungeon.forge?.corridors[index] ||
    dungeon.forge?.doorways[index] ||
    dungeon.forge?.pools[index] ||
    dungeon.forge?.lakeMask[index] ||
    dungeon.forge?.spawns.some((spawn) => spawn.x === cell.x && spawn.y === cell.y),
  );
}

export function findNearestPropCell(
  dungeon: DungeonData,
  origin: GridCell,
  occupied: ReadonlySet<string>,
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
          occupied.has(`${cell.x},${cell.y}`) ||
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
  const seen = new Set<string>();
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
        const key = `${x},${y}:${intoDx},${intoDy}`;
        if (seen.has(key)) continue;
        seen.add(key);
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
  const seen = new Set<string>();
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
          const key = `${x},${y}:${wallADx},${wallADy}:${wallBDx},${wallBDy}`;
          if (seen.has(key)) continue;
          seen.add(key);
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
