import type {
  DungeonDoorway,
  DungeonEdge,
  DungeonRoom,
  DungeonTopologyMetadata,
  GridCell,
} from "./types";

type RoomShape = Pick<DungeonRoom, "id" | "x" | "y" | "width" | "height" | "center">;

type DoorwayCandidate = {
  cell: GridCell;
  outside: GridCell;
  routeAnchor: GridCell;
  outDx: -1 | 0 | 1;
  outDy: -1 | 0 | 1;
  score: number;
  tie: number;
};

const CARDINALS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

function indexOf(width: number, x: number, y: number): number {
  return y * width + x;
}

function inside(width: number, height: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function smallHash(seed: number, a: number, b: number, c: number): number {
  let value = (seed ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b)) >>> 0;
  value ^= Math.imul(c + 13, 0xc2b2ae35);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return value >>> 0;
}

function createRoomIds(width: number, height: number, rooms: readonly RoomShape[]): Int16Array {
  const roomIds = new Int16Array(width * height).fill(-1);
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.height; y += 1) {
      for (let x = room.x; x < room.x + room.width; x += 1) {
        if (inside(width, height, x, y)) roomIds[indexOf(width, x, y)] = room.id;
      }
    }
  }
  return roomIds;
}

function routeAnchorIsClear(
  width: number,
  height: number,
  roomIds: Int16Array,
  cell: GridCell,
  radius: number,
): boolean {
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const x = cell.x + offsetX;
      const y = cell.y + offsetY;
      if (!inside(width, height, x, y)) return false;
      if ((roomIds[indexOf(width, x, y)] ?? -1) >= 0) return false;
    }
  }
  return true;
}

function candidateSeats(
  width: number,
  height: number,
  roomIds: Int16Array,
  room: RoomShape,
  target: RoomShape,
  radius: number,
  seedHash: number,
  edgeIndex: number,
  reserved: ReadonlySet<string>,
): DoorwayCandidate[] {
  const candidates: DoorwayCandidate[] = [];
  const deltaX = target.center.x - room.center.x;
  const deltaY = target.center.y - room.center.y;
  // Leave one untouched wall-adjacent ring between the narrow doorway neck
  // and the widened corridor. Otherwise a radius-1 square creates three
  // openings along the room wall even though its center is outside the room.
  const anchorDistance = radius + 2;
  const add = (x: number, y: number, outDx: -1 | 0 | 1, outDy: -1 | 0 | 1): void => {
    if (reserved.has(`${room.id}:${x},${y}`)) return;
    const outside = { x: x + outDx, y: y + outDy };
    const routeAnchor = {
      x: x + outDx * anchorDistance,
      y: y + outDy * anchorDistance,
    };
    if (!inside(width, height, outside.x, outside.y)) return;
    if ((roomIds[indexOf(width, outside.x, outside.y)] ?? -1) >= 0) return;
    for (let step = 1; step <= anchorDistance; step += 1) {
      const neckX = x + outDx * step;
      const neckY = y + outDy * step;
      if (
        !inside(width, height, neckX, neckY) ||
        (roomIds[indexOf(width, neckX, neckY)] ?? -1) >= 0
      ) {
        return;
      }
    }
    if (!routeAnchorIsClear(width, height, roomIds, routeAnchor, 1)) return;

    const alignment = outDx * deltaX + outDy * deltaY;
    const distance =
      Math.abs(routeAnchor.x - target.center.x) + Math.abs(routeAnchor.y - target.center.y);
    const centerOffset = outDx === 0 ? Math.abs(x - room.center.x) : Math.abs(y - room.center.y);
    candidates.push({
      cell: { x, y },
      outside,
      routeAnchor,
      outDx,
      outDy,
      // Facing the connected room dominates distance; centering keeps frames
      // away from corners and gives props usable wall spans.
      score: -alignment * 100 + distance * 4 + centerOffset,
      tie: smallHash(seedHash, room.id, edgeIndex, indexOf(width, x, y)),
    });
  };

  const minX = room.width > 2 ? room.x + 1 : room.x;
  const maxX = room.width > 2 ? room.x + room.width - 2 : room.x + room.width - 1;
  const minY = room.height > 2 ? room.y + 1 : room.y;
  const maxY = room.height > 2 ? room.y + room.height - 2 : room.y + room.height - 1;
  for (let x = minX; x <= maxX; x += 1) {
    add(x, room.y, 0, -1);
    add(x, room.y + room.height - 1, 0, 1);
  }
  for (let y = minY; y <= maxY; y += 1) {
    add(room.x, y, -1, 0);
    add(room.x + room.width - 1, y, 1, 0);
  }
  return candidates.sort((left, right) => left.score - right.score || left.tie - right.tie);
}

function createRouteMask(width: number, height: number, roomIds: Int16Array): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (routeAnchorIsClear(width, height, roomIds, { x, y }, 1)) {
        mask[indexOf(width, x, y)] = 1;
      }
    }
  }
  return mask;
}

function labelRouteComponents(width: number, height: number, routeMask: Uint8Array): Int32Array {
  const labels = new Int32Array(width * height).fill(-1);
  const queue = new Int32Array(width * height);
  let component = 0;
  for (let start = 0; start < routeMask.length; start += 1) {
    if (!routeMask[start] || labels[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = component;
    while (head < tail) {
      const current = queue[head++] as number;
      const x = current % width;
      const y = Math.floor(current / width);
      for (const direction of CARDINALS) {
        const nextX = x + direction.x;
        const nextY = y + direction.y;
        if (!inside(width, height, nextX, nextY)) continue;
        const next = indexOf(width, nextX, nextY);
        if (!routeMask[next] || labels[next] !== -1) continue;
        labels[next] = component;
        queue[tail++] = next;
      }
    }
    component += 1;
  }
  return labels;
}

type RouteWorkspace = {
  marks: Uint32Array;
  previous: Int32Array;
  queue: Int32Array;
  epoch: number;
};

function createRouteWorkspace(cellCount: number): RouteWorkspace {
  return {
    marks: new Uint32Array(cellCount),
    previous: new Int32Array(cellCount),
    queue: new Int32Array(cellCount),
    epoch: 0,
  };
}

function findRoute(
  width: number,
  height: number,
  routeMask: Uint8Array,
  from: GridCell,
  to: GridCell,
  axisBias: number,
  workspace: RouteWorkspace,
): GridCell[] | null {
  workspace.epoch += 1;
  if (workspace.epoch === 0xffffffff) {
    workspace.marks.fill(0);
    workspace.epoch = 1;
  }
  const epoch = workspace.epoch;
  const { marks, previous, queue } = workspace;
  const start = indexOf(width, from.x, from.y);
  const goal = indexOf(width, to.x, to.y);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  marks[start] = epoch;
  previous[start] = -1;
  // Neighbor priority only affects which equal-length route wins. Compute it
  // once instead of allocating and sorting four objects for every visited cell.
  const directions = [...CARDINALS].sort((left, right) => {
    const leftDistance = Math.abs(from.x + left.x - to.x) + Math.abs(from.y + left.y - to.y);
    const rightDistance = Math.abs(from.x + right.x - to.x) + Math.abs(from.y + right.y - to.y);
    const leftAxis = left.x === 0 ? axisBias : 1 - axisBias;
    const rightAxis = right.x === 0 ? axisBias : 1 - axisBias;
    return (
      leftDistance - rightDistance ||
      leftAxis - rightAxis ||
      CARDINALS.indexOf(left) - CARDINALS.indexOf(right)
    );
  });

  while (head < tail) {
    const current = queue[head++] as number;
    if (current === goal) break;
    const x = current % width;
    const y = Math.floor(current / width);
    for (const direction of directions) {
      const nextX = x + direction.x;
      const nextY = y + direction.y;
      if (!inside(width, height, nextX, nextY)) continue;
      const next = indexOf(width, nextX, nextY);
      if (marks[next] === epoch) continue;
      if (next !== goal && !routeMask[next]) continue;
      marks[next] = epoch;
      previous[next] = current;
      queue[tail++] = next;
    }
  }
  if (marks[goal] !== epoch) return null;

  const reversed: GridCell[] = [];
  for (let cursor = goal; cursor !== -1; cursor = previous[cursor] ?? -1) {
    reversed.push({ x: cursor % width, y: Math.floor(cursor / width) });
    if (cursor === start) break;
  }
  return reversed.reverse();
}

function carveCorridorCell(
  grid: Uint8Array[],
  corridors: Uint8Array,
  roomIds: Int16Array,
  width: number,
  height: number,
  x: number,
  y: number,
  protectRoomBoundary = false,
): void {
  if (!inside(width, height, x, y)) return;
  const index = indexOf(width, x, y);
  if ((roomIds[index] ?? -1) >= 0) return;
  if (
    protectRoomBoundary &&
    CARDINALS.some(({ x: dx, y: dy }) => {
      const neighborX = x + dx;
      const neighborY = y + dy;
      return (
        inside(width, height, neighborX, neighborY) &&
        (roomIds[indexOf(width, neighborX, neighborY)] ?? -1) >= 0
      );
    })
  ) {
    return;
  }
  grid[y]![x] = 1;
  corridors[index] = 1;
}

function carveWidePath(
  grid: Uint8Array[],
  corridors: Uint8Array,
  roomIds: Int16Array,
  width: number,
  height: number,
  path: readonly GridCell[],
  radius: number,
): void {
  for (const cell of path) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        carveCorridorCell(
          grid,
          corridors,
          roomIds,
          width,
          height,
          cell.x + offsetX,
          cell.y + offsetY,
          true,
        );
      }
    }
  }
}

function carveNeck(
  grid: Uint8Array[],
  corridors: Uint8Array,
  roomIds: Int16Array,
  width: number,
  height: number,
  candidate: DoorwayCandidate,
  radius: number,
): void {
  for (let step = 1; step <= radius + 2; step += 1) {
    carveCorridorCell(
      grid,
      corridors,
      roomIds,
      width,
      height,
      candidate.cell.x + candidate.outDx * step,
      candidate.cell.y + candidate.outDy * step,
    );
  }
}

function doorwayFromCandidate(
  candidate: DoorwayCandidate,
  edgeIndex: number,
  roomId: number,
  connectedRoomId: number,
): DungeonDoorway {
  return {
    edgeIndex,
    roomId,
    connectedRoomId,
    cell: candidate.cell,
    outside: candidate.outside,
    outDx: candidate.outDx,
    outDy: candidate.outDy,
  };
}

function appendCardinalLine(route: GridCell[], from: GridCell, to: GridCell): void {
  if (from.x !== to.x && from.y !== to.y) {
    throw new Error(
      `Overlay route segment must be cardinal: ${from.x},${from.y} -> ${to.x},${to.y}.`,
    );
  }
  let x = from.x;
  let y = from.y;
  const append = (): void => {
    const previous = route.at(-1);
    if (!previous || previous.x !== x || previous.y !== y) route.push({ x, y });
  };
  append();
  const stepX = Math.sign(to.x - from.x);
  const stepY = Math.sign(to.y - from.y);
  while (x !== to.x || y !== to.y) {
    x += stepX;
    y += stepY;
    append();
  }
}

function appendRoomDoorPath(
  route: GridCell[],
  room: RoomShape,
  doorway: DoorwayCandidate,
  towardDoorway: boolean,
): void {
  const turn =
    doorway.outDx !== 0
      ? { x: room.center.x, y: doorway.cell.y }
      : { x: doorway.cell.x, y: room.center.y };
  if (towardDoorway) {
    appendCardinalLine(route, room.center, turn);
    appendCardinalLine(route, turn, doorway.cell);
  } else {
    appendCardinalLine(route, doorway.cell, turn);
    appendCardinalLine(route, turn, room.center);
  }
}

function buildEdgeRoute(
  leftRoom: RoomShape,
  rightRoom: RoomShape,
  selected: { left: DoorwayCandidate; right: DoorwayCandidate; path: readonly GridCell[] },
): GridCell[] {
  const route: GridCell[] = [];
  appendRoomDoorPath(route, leftRoom, selected.left, true);
  appendCardinalLine(route, selected.left.cell, selected.left.routeAnchor);
  for (const cell of selected.path) {
    const previous = route.at(-1);
    if (!previous || previous.x !== cell.x || previous.y !== cell.y) route.push({ ...cell });
  }
  appendCardinalLine(route, selected.right.routeAnchor, selected.right.cell);
  appendRoomDoorPath(route, rightRoom, selected.right, false);
  return route;
}

/**
 * Carve graph edges through void, with a one-cell neck at every room boundary.
 * Wide corridors only expand after that neck, so room walls cannot gain
 * accidental side openings when a route grazes them.
 */
export function carveDungeonTopology(
  grid: Uint8Array[],
  width: number,
  height: number,
  rooms: readonly RoomShape[],
  edges: readonly DungeonEdge[],
  corridorRadius: number,
  seedHash: number,
): DungeonTopologyMetadata {
  const radius = Math.max(0, Math.floor(corridorRadius));
  const roomIds = createRoomIds(width, height, rooms);
  const corridors = new Uint8Array(width * height);
  const doorways: DungeonDoorway[] = [];
  const routes: GridCell[][] = [];
  const reserved = new Set<string>();
  // Room geometry is immutable during routing. Cache its clearance field and
  // components once so candidate pairs do not each run a full failed BFS.
  const routeMask = createRouteMask(width, height, roomIds);
  const routeComponents = labelRouteComponents(width, height, routeMask);
  const routeWorkspace = createRouteWorkspace(width * height);

  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    const edge = edges[edgeIndex];
    const leftRoom = edge ? rooms[edge.left] : undefined;
    const rightRoom = edge ? rooms[edge.right] : undefined;
    if (!edge || !leftRoom || !rightRoom) {
      throw new Error(`Dungeon edge ${edgeIndex} references a missing room.`);
    }
    const leftCandidates = candidateSeats(
      width,
      height,
      roomIds,
      leftRoom,
      rightRoom,
      radius,
      seedHash,
      edgeIndex,
      reserved,
    );
    const rightCandidates = candidateSeats(
      width,
      height,
      roomIds,
      rightRoom,
      leftRoom,
      radius,
      seedHash,
      edgeIndex,
      reserved,
    );

    let selected: { left: DoorwayCandidate; right: DoorwayCandidate; path: GridCell[] } | undefined;
    for (const left of leftCandidates) {
      const leftComponent = routeComponents[indexOf(width, left.routeAnchor.x, left.routeAnchor.y)];
      if (leftComponent === undefined || leftComponent < 0) continue;
      for (const right of rightCandidates) {
        const rightComponent =
          routeComponents[indexOf(width, right.routeAnchor.x, right.routeAnchor.y)];
        if (rightComponent !== leftComponent) continue;
        const path = findRoute(
          width,
          height,
          routeMask,
          left.routeAnchor,
          right.routeAnchor,
          smallHash(seedHash, edgeIndex, left.cell.x, right.cell.y) & 1,
          routeWorkspace,
        );
        if (!path) continue;
        selected = { left, right, path };
        break;
      }
      if (selected) break;
    }
    if (!selected) {
      throw new Error(
        `Unable to route sealed corridor ${edge.left}-${edge.right} at radius ${radius}.`,
      );
    }

    carveWidePath(grid, corridors, roomIds, width, height, selected.path, radius);
    carveNeck(grid, corridors, roomIds, width, height, selected.left, radius);
    carveNeck(grid, corridors, roomIds, width, height, selected.right, radius);
    reserved.add(`${leftRoom.id}:${selected.left.cell.x},${selected.left.cell.y}`);
    reserved.add(`${rightRoom.id}:${selected.right.cell.x},${selected.right.cell.y}`);
    routes[edgeIndex] = buildEdgeRoute(leftRoom, rightRoom, selected);
    doorways.push(
      doorwayFromCandidate(selected.left, edgeIndex, leftRoom.id, rightRoom.id),
      doorwayFromCandidate(selected.right, edgeIndex, rightRoom.id, leftRoom.id),
    );
  }

  return { roomIds, corridors, doorways, routes };
}
