import { hashSeed } from "../core/random";
import {
  DEFAULT_STORY_METRICS,
  type StoryMetrics,
} from "../world/StoryMetrics";
import { FLOOR, isFloorCell } from "./generateDungeon";
import type { DungeonData, DungeonRoom, GridCell } from "./types";

export interface StairShaftLink {
  shaftId: string;
  lowerFloor: number;
  upperFloor: number;
  /** Shared grid cell used as the lower landing / upper landing anchor. */
  anchor: GridCell;
  yaw: number;
  footprint: GridCell[];
}

export interface StairShaftPlan {
  links: StairShaftLink[];
}

const YAWS = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] as const;

function cellKey(cell: GridCell): string {
  return `${cell.x},${cell.y}`;
}

function inBounds(dungeon: DungeonData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < dungeon.width && y < dungeon.height;
}

/** Unit step on the dungeon grid for a cardinal stair yaw. */
export function yawGridStep(yaw: number): { dx: number; dy: number } {
  const quarter = ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
  if (quarter === 0) return { dx: 0, dy: 1 };
  if (quarter === 1) return { dx: 1, dy: 0 };
  if (quarter === 2) return { dx: 0, dy: -1 };
  return { dx: -1, dy: 0 };
}

function roomInteriorCandidates(room: DungeonRoom): GridCell[] {
  const insetX = room.width >= 5 ? 1 : 0;
  const insetY = room.height >= 5 ? 1 : 0;
  const cells: GridCell[] = [];
  for (let y = room.y + insetY; y < room.y + room.height - insetY; y += 1) {
    for (let x = room.x + insetX; x < room.x + room.width - insetX; x += 1) {
      cells.push({ x, y });
    }
  }
  if (cells.length === 0) cells.push({ ...room.center });
  return cells;
}

function buildFootprint(
  anchor: GridCell,
  yaw: number,
  metrics: StoryMetrics,
): GridCell[] {
  const { dx, dy } = yawGridStep(yaw);
  const along = metrics.shaftCellsAlong + metrics.landingCells * 2;
  const across = Math.max(1, metrics.shaftCellsAcross);
  const cells: GridCell[] = [];
  const seen = new Set<string>();
  // Flight runs from anchor along +yaw; landings pad both ends.
  for (let i = -metrics.landingCells; i < along - metrics.landingCells; i += 1) {
    for (let side = 0; side < across; side += 1) {
      const ox = -dy * side;
      const oy = dx * side;
      const cell = { x: anchor.x + dx * i + ox, y: anchor.y + dy * i + oy };
      const key = cellKey(cell);
      if (seen.has(key)) continue;
      seen.add(key);
      cells.push(cell);
    }
  }
  return cells;
}

function footprintFits(dungeons: readonly DungeonData[], footprint: readonly GridCell[]): boolean {
  return dungeons.every((dungeon) =>
    footprint.every((cell) => inBounds(dungeon, cell.x, cell.y)),
  );
}

function scoreFootprint(
  lower: DungeonData,
  upper: DungeonData,
  footprint: readonly GridCell[],
  rootSeed: string,
  linkIndex: number,
  yaw: number,
): number {
  let floorCells = 0;
  let wallCells = 0;
  for (const cell of footprint) {
    const lowerFloor = isFloorCell(lower, cell.x, cell.y);
    const upperFloor = isFloorCell(upper, cell.x, cell.y);
    if (lowerFloor) floorCells += 1;
    else wallCells += 1;
    if (upperFloor) floorCells += 1;
    else wallCells += 1;
  }
  // Prefer existing floors; penalize carves and spawn/exit collision.
  let score = floorCells * 4 - wallCells * 3;
  for (const dungeon of [lower, upper]) {
    for (const cell of footprint) {
      if (cell.x === dungeon.spawn.x && cell.y === dungeon.spawn.y) score -= 80;
      if (cell.x === dungeon.exit.x && cell.y === dungeon.exit.y) score -= 40;
    }
  }
  // Stable tie-break.
  score += (hashSeed(`${rootSeed}:shaft-score:${linkIndex}:${yaw}`) % 7) * 0.01;
  return score;
}

function candidateAnchors(dungeon: DungeonData): GridCell[] {
  const exitRoom =
    dungeon.rooms.find((room) => room.id === dungeon.exitRoomId) ?? dungeon.rooms.at(-1);
  const entranceRoom =
    dungeon.rooms.find((room) => room.id === dungeon.entranceRoomId) ?? dungeon.rooms[0];
  const orderedRooms = [
    exitRoom,
    ...dungeon.rooms.filter(
      (room) => room.id !== exitRoom?.id && room.id !== entranceRoom?.id,
    ),
    entranceRoom,
  ].filter((room): room is DungeonRoom => Boolean(room));

  const seen = new Set<string>();
  const anchors: GridCell[] = [];
  for (const room of orderedRooms) {
    for (const cell of roomInteriorCandidates(room)) {
      if (!isFloorCell(dungeon, cell.x, cell.y)) continue;
      if (cell.x === dungeon.spawn.x && cell.y === dungeon.spawn.y) continue;
      const key = cellKey(cell);
      if (seen.has(key)) continue;
      seen.add(key);
      anchors.push(cell);
    }
  }
  return anchors;
}

/**
 * Plan aligned stair shafts between consecutive floors of a stack.
 * Footprints share grid cells so world XZ matches after gridToWorld.
 */
export function planStairShafts(
  floors: readonly DungeonData[],
  rootSeed: string,
  metrics: StoryMetrics = DEFAULT_STORY_METRICS,
): StairShaftPlan {
  if (floors.length < 2) return { links: [] };
  const links: StairShaftLink[] = [];

  for (let lowerIndex = 0; lowerIndex < floors.length - 1; lowerIndex += 1) {
    const lower = floors[lowerIndex]!;
    const upper = floors[lowerIndex + 1]!;
    if (lower.width !== upper.width || lower.height !== upper.height) {
      throw new Error(
        `Floor stack size mismatch: ${lower.width}x${lower.height} vs ${upper.width}x${upper.height}.`,
      );
    }

    const anchors = candidateAnchors(lower);
    let best:
      | {
          score: number;
          anchor: GridCell;
          yaw: number;
          footprint: GridCell[];
        }
      | null = null;

    for (const anchor of anchors) {
      for (const yaw of YAWS) {
        const footprint = buildFootprint(anchor, yaw, metrics);
        if (!footprintFits([lower, upper], footprint)) continue;
        const score = scoreFootprint(lower, upper, footprint, rootSeed, lowerIndex, yaw);
        if (!best || score > best.score) {
          best = { score, anchor: { ...anchor }, yaw, footprint };
        }
      }
    }

    if (!best) {
      throw new Error(
        `Could not place an aligned stair shaft between floors ${lowerIndex} and ${lowerIndex + 1} for seed "${rootSeed}".`,
      );
    }

    links.push({
      shaftId: `shaft-${lowerIndex}-${lowerIndex + 1}`,
      lowerFloor: lowerIndex,
      upperFloor: lowerIndex + 1,
      anchor: best.anchor,
      yaw: best.yaw,
      footprint: best.footprint,
    });
  }

  return { links };
}

/** Carve footprint cells to floor on both linked dungeons (mutates grids). */
export function applyStairShaftCarves(
  floors: DungeonData[],
  plan: StairShaftPlan,
): void {
  for (const link of plan.links) {
    for (const floorIndex of [link.lowerFloor, link.upperFloor]) {
      const dungeon = floors[floorIndex];
      if (!dungeon) continue;
      for (const cell of link.footprint) {
        if (!inBounds(dungeon, cell.x, cell.y)) continue;
        dungeon.grid[cell.y]![cell.x] = FLOOR;
      }
    }
  }
}
