import { isFloorCell } from "./generateDungeon";
import type { DungeonData, GridCell } from "./types";

export interface WorldPoint {
  x: number;
  z: number;
}

export interface WorldCollider {
  minX: number;
  maxX: number;
  /** World-space vertical bounds. Missing values keep legacy full-height blocking. */
  minY?: number;
  maxY?: number;
  minZ: number;
  maxZ: number;
}

export interface VerticalCollisionRange {
  minY: number;
  maxY: number;
}

type DungeonGrid = Pick<DungeonData, "width" | "height" | "grid">;
export type CellBlocker = (cell: GridCell) => boolean;

export interface CollisionResult {
  position: WorldPoint;
  blockedX: boolean;
  blockedZ: boolean;
}

// Hot-path scratch buffers. gridCollision runs for the player + every enemy each
// frame; these must never allocate. Single-threaded JS guarantees no reentrancy.
// Kept module-scoped so callers that hold the returned WorldPoint/GridCell briefly
// (read x/z immediately) are safe — long-lived retention must copy.
const scratchSampleCell: GridCell = { x: 0, y: 0 };
const scratchSamplePoint: WorldPoint = { x: 0, z: 0 };

export function overlapsWorldCollider(
  position: WorldPoint,
  radius: number,
  collider: WorldCollider,
): boolean {
  const nearestX = Math.max(collider.minX, Math.min(position.x, collider.maxX));
  const nearestZ = Math.max(collider.minZ, Math.min(position.z, collider.maxZ));
  const deltaX = position.x - nearestX;
  const deltaZ = position.z - nearestZ;
  return deltaX * deltaX + deltaZ * deltaZ <= radius * radius;
}

export function overlapsColliderHeight(
  collider: WorldCollider,
  verticalRange?: VerticalCollisionRange,
): boolean {
  if (!verticalRange) return true;
  const colliderMinY = collider.minY ?? Number.NEGATIVE_INFINITY;
  const colliderMaxY = collider.maxY ?? Number.POSITIVE_INFINITY;
  return verticalRange.maxY > colliderMinY && verticalRange.minY < colliderMaxY;
}

export function gridToWorld(dungeon: DungeonGrid, cell: GridCell, tileSize: number): WorldPoint {
  return {
    x: (cell.x - (dungeon.width - 1) / 2) * tileSize,
    z: (cell.y - (dungeon.height - 1) / 2) * tileSize,
  };
}

export function worldToGrid(
  dungeon: DungeonGrid,
  position: WorldPoint,
  tileSize: number,
): GridCell {
  return {
    x: Math.floor(position.x / tileSize + dungeon.width / 2),
    y: Math.floor(position.z / tileSize + dungeon.height / 2),
  };
}

/**
 * Alloc-free worldToGrid for hot paths. Writes the grid cell into `out` and
 * returns it. Use this inside per-frame loops; use `worldToGrid` when the caller
 * needs to retain the result across other grid calls.
 */
export function worldToGridInto(
  dungeon: DungeonGrid,
  position: WorldPoint,
  tileSize: number,
  out: GridCell,
): GridCell {
  out.x = Math.floor(position.x / tileSize + dungeon.width / 2);
  out.y = Math.floor(position.z / tileSize + dungeon.height / 2);
  return out;
}

export function canOccupy(
  dungeon: DungeonGrid,
  position: WorldPoint,
  tileSize: number,
  radius: number,
  isBlockedCell?: CellBlocker,
  colliders: readonly WorldCollider[] = [],
  verticalRange?: VerticalCollisionRange,
): boolean {
  const diagonal = radius * Math.SQRT1_2;
  const px = position.x;
  const pz = position.z;
  // Centre + 4 axis + 4 diagonal samples. Written inline (no offset array) so
  // the hot path stays allocation-free. Each sample reuses the module scratch
  // point + cell and reads them immediately.
  // Order matches the original: centre, +X, -X, +Z, -Z, then the 4 diagonals.
  const blocked = isBlockedCell ?? noopCellBlocker;
  // Centre.
  if (!sampleClear(dungeon, px, pz, tileSize, blocked)) return false;
  if (!sampleClear(dungeon, px + radius, pz, tileSize, blocked)) return false;
  if (!sampleClear(dungeon, px - radius, pz, tileSize, blocked)) return false;
  if (!sampleClear(dungeon, px, pz + radius, tileSize, blocked)) return false;
  if (!sampleClear(dungeon, px, pz - radius, tileSize, blocked)) return false;
  if (!sampleClear(dungeon, px + diagonal, pz + diagonal, tileSize, blocked)) return false;
  if (!sampleClear(dungeon, px - diagonal, pz + diagonal, tileSize, blocked)) return false;
  if (!sampleClear(dungeon, px + diagonal, pz - diagonal, tileSize, blocked)) return false;
  if (!sampleClear(dungeon, px - diagonal, pz - diagonal, tileSize, blocked)) return false;
  for (let i = 0; i < colliders.length; i += 1) {
    const collider = colliders[i]!;
    if (
      overlapsColliderHeight(collider, verticalRange) &&
      overlapsWorldCollider(position, radius, collider)
    )
      return false;
  }
  return true;
}

const noopCellBlocker: CellBlocker = () => false;

/** Hot-path sample: floors one offset into the shared scratch and tests it. */
function sampleClear(
  dungeon: DungeonGrid,
  x: number,
  z: number,
  tileSize: number,
  isBlockedCell: CellBlocker,
): boolean {
  scratchSamplePoint.x = x;
  scratchSamplePoint.z = z;
  worldToGridInto(dungeon, scratchSamplePoint, tileSize, scratchSampleCell);
  return (
    isFloorCell(dungeon as DungeonData, scratchSampleCell.x, scratchSampleCell.y) &&
    !isBlockedCell(scratchSampleCell)
  );
}

function moveAlongAxis(
  dungeon: DungeonGrid,
  start: WorldPoint,
  axis: "x" | "z",
  distance: number,
  tileSize: number,
  radius: number,
  isBlockedCell?: CellBlocker,
  colliders: readonly WorldCollider[] = [],
  verticalRange?: VerticalCollisionRange,
): { position: WorldPoint; blocked: boolean } {
  const steps = Math.max(1, Math.ceil(Math.abs(distance) / (tileSize * 0.25)));
  const increment = distance / steps;
  const position = { x: start.x, z: start.z };
  for (let step = 0; step < steps; step += 1) {
    if (axis === "x") position.x += increment;
    else position.z += increment;
    if (!canOccupy(dungeon, position, tileSize, radius, isBlockedCell, colliders, verticalRange)) {
      // A long frame used to return the previous broadphase step, leaving a
      // visible gap before a wall or prop. Refine the final safe fraction so
      // collision stays tight without reducing the fixed travel step.
      const safe = axis === "x" ? position.x - increment : position.z - increment;
      const attempted = axis === "x" ? position.x : position.z;
      let low = 0;
      let high = 1;
      for (let refine = 0; refine < 7; refine += 1) {
        const fraction = (low + high) * 0.5;
        if (axis === "x") position.x = safe + (attempted - safe) * fraction;
        else position.z = safe + (attempted - safe) * fraction;
        if (
          canOccupy(dungeon, position, tileSize, radius, isBlockedCell, colliders, verticalRange)
        ) {
          low = fraction;
        } else {
          high = fraction;
        }
      }
      if (axis === "x") position.x = safe + (attempted - safe) * low;
      else position.z = safe + (attempted - safe) * low;
      return { position, blocked: true };
    }
  }
  return { position, blocked: false };
}

export function moveWithCollision(
  dungeon: DungeonGrid,
  start: WorldPoint,
  delta: WorldPoint,
  tileSize: number,
  radius: number,
  isBlockedCell?: CellBlocker,
  colliders: readonly WorldCollider[] = [],
  verticalRange?: VerticalCollisionRange,
): CollisionResult {
  const horizontal = moveAlongAxis(
    dungeon,
    start,
    "x",
    delta.x,
    tileSize,
    radius,
    isBlockedCell,
    colliders,
    verticalRange,
  );
  const vertical = moveAlongAxis(
    dungeon,
    horizontal.position,
    "z",
    delta.z,
    tileSize,
    radius,
    isBlockedCell,
    colliders,
    verticalRange,
  );
  return { position: vertical.position, blockedX: horizontal.blocked, blockedZ: vertical.blocked };
}
