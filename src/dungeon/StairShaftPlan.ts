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
  // Flight runs from anchor along +yaw; landings pad both ends.
  for (let i = -metrics.landingCells; i < along - metrics.landingCells; i += 1) {
    for (let side = 0; side < across; side += 1) {
      const ox = -dy * side;
      const oy = dx * side;
      cells.push({ x: anchor.x + dx * i + ox, y: anchor.y + dy * i + oy });
    }
  }
  return cells;
}

function scoreFootprintCandidate(
  lower: DungeonData,
  upper: DungeonData,
  anchor: GridCell,
  rootSeed: string,
  linkIndex: number,
  yaw: number,
  metrics: StoryMetrics,
): number | null {
  const { dx, dy } = yawGridStep(yaw);
  const along = metrics.shaftCellsAlong + metrics.landingCells * 2;
  const across = Math.max(1, metrics.shaftCellsAcross);
  let floorCells = 0;
  let wallCells = 0;
  let protectedCellPenalty = 0;
  for (let i = -metrics.landingCells; i < along - metrics.landingCells; i += 1) {
    for (let side = 0; side < across; side += 1) {
      const x = anchor.x + dx * i - dy * side;
      const y = anchor.y + dy * i + dx * side;
      if (!inBounds(lower, x, y) || !inBounds(upper, x, y)) return null;
      if (isFloorCell(lower, x, y)) floorCells += 1;
      else wallCells += 1;
      if (isFloorCell(upper, x, y)) floorCells += 1;
      else wallCells += 1;
      if (x === lower.spawn.x && y === lower.spawn.y) protectedCellPenalty += 80;
      if (x === lower.exit.x && y === lower.exit.y) protectedCellPenalty += 40;
      if (x === upper.spawn.x && y === upper.spawn.y) protectedCellPenalty += 80;
      if (x === upper.exit.x && y === upper.exit.y) protectedCellPenalty += 40;
    }
  }
  // Prefer existing floors; penalize carves and spawn/exit collision.
  let score = floorCells * 4 - wallCells * 3 - protectedCellPenalty;
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

  const anchors: GridCell[] = [];
  for (const room of orderedRooms) {
    for (const cell of roomInteriorCandidates(room)) {
      if (!isFloorCell(dungeon, cell.x, cell.y)) continue;
      if (cell.x === dungeon.spawn.x && cell.y === dungeon.spawn.y) continue;
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
        }
      | null = null;

    for (const anchor of anchors) {
      for (const yaw of YAWS) {
        const score = scoreFootprintCandidate(
          lower,
          upper,
          anchor,
          rootSeed,
          lowerIndex,
          yaw,
          metrics,
        );
        if (score === null) continue;
        if (!best || score > best.score) {
          best = { score, anchor: { ...anchor }, yaw };
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
      footprint: buildFootprint(best.anchor, best.yaw, metrics),
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
