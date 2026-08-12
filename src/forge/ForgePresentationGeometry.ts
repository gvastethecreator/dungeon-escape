export interface ForgeRoomPresentationInput {
  cx?: unknown;
  cy?: unknown;
  sx0?: unknown;
  sy0?: unknown;
  w?: unknown;
  h?: unknown;
}

export interface ForgeRoomPresentationRect {
  cx: number;
  cy: number;
  sx0: number;
  sy0: number;
  w: number;
  h: number;
}

export interface ForgeOverlayRoom {
  cx?: unknown;
  cy?: unknown;
}

export interface ForgeOverlayPair {
  a?: unknown;
  b?: unknown;
}

export interface ForgeOverlayPoint {
  x: number;
  y: number;
}

export interface ForgeOverlayRouteInput {
  width: number;
  height: number;
  grid: ArrayLike<number>;
  rooms: readonly ForgeOverlayRoom[];
  pairs: readonly ForgeOverlayPair[];
  routes: readonly (readonly ForgeOverlayPoint[] | undefined)[];
  floorValue?: number;
  walkableValues?: readonly number[];
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function positiveExtent(value: unknown): number {
  const extent = Math.abs(finiteNumber(value, 1));
  return extent > 0 ? extent : 1;
}

/**
 * Normalize host-owned room geometry before Forge writes it into a Three.js
 * position buffer. Older presentation payloads did not include sx0/sy0, so
 * their safe animation origin is the final room center.
 */
export function resolveForgeRoomPresentationRect(
  room: ForgeRoomPresentationInput,
): ForgeRoomPresentationRect {
  const cx = finiteNumber(room.cx, 0);
  const cy = finiteNumber(room.cy, 0);
  return {
    cx,
    cy,
    sx0: finiteNumber(room.sx0, cx),
    sy0: finiteNumber(room.sy0, cy),
    w: positiveExtent(room.w),
    h: positiveExtent(room.h),
  };
}

function integerCell(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function roomIndex(value: unknown, roomCount: number): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  return value >= 0 && value < roomCount ? value : null;
}

/**
 * Validate the edge-owned routes produced while corridors are carved. The
 * presentation must never infer a replacement path from the final floor map:
 * that can jump through unrelated rooms and misrepresent the graph edge.
 */
export function resolveForgeOverlayRoutes(input: ForgeOverlayRouteInput): ForgeOverlayPoint[][] {
  const width = Math.floor(input.width);
  const height = Math.floor(input.height);
  if (width <= 0 || height <= 0 || input.grid.length < width * height) {
    return input.pairs.map(() => []);
  }

  const floorValue = input.floorValue ?? 1;
  const walkableValues = new Set(input.walkableValues ?? [floorValue]);
  const indexOf = (x: number, y: number): number => y * width + x;
  const inBounds = (point: ForgeOverlayPoint): boolean =>
    point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;

  return input.pairs.map((pair, routeIndex) => {
    const leftIndex = roomIndex(pair.a, input.rooms.length);
    const rightIndex = roomIndex(pair.b, input.rooms.length);
    if (leftIndex === null || rightIndex === null) return [];
    const left = input.rooms[leftIndex];
    const right = input.rooms[rightIndex];
    const startX = integerCell(left?.cx);
    const startY = integerCell(left?.cy);
    const goalX = integerCell(right?.cx);
    const goalY = integerCell(right?.cy);
    if (startX === null || startY === null || goalX === null || goalY === null) return [];

    const start = { x: startX, y: startY };
    const goal = { x: goalX, y: goalY };
    if (!inBounds(start) || !inBounds(goal)) return [];
    const route = input.routes[routeIndex];
    if (!route || route.length < 2) return [];
    const normalized: ForgeOverlayPoint[] = [];
    for (const rawPoint of route) {
      const x = integerCell(rawPoint?.x);
      const y = integerCell(rawPoint?.y);
      if (x === null || y === null || x !== rawPoint.x || y !== rawPoint.y) return [];
      const point = { x, y };
      if (!inBounds(point) || !walkableValues.has(input.grid[indexOf(x, y)] ?? Number.NaN)) {
        return [];
      }
      const previous = normalized.at(-1);
      if (previous && Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y) !== 1) {
        return [];
      }
      normalized.push(point);
    }
    const first = normalized[0];
    const last = normalized.at(-1);
    if (first?.x !== start.x || first.y !== start.y || last?.x !== goal.x || last.y !== goal.y) {
      return [];
    }
    return normalized;
  });
}
