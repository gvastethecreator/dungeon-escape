import { FLOOR, WALL } from "../dungeon/generateDungeon";
import type { DungeonData, GridCell } from "../dungeon/types";
import type { MinimapEnemy, MinimapFeatures, MinimapStone } from "./minimapFeatures";

/**
 * Iron-ash minimap palette: soot field, bone floor, exit mark, player mark.
 * Marker layer extends the soot/bone palette with desaturated grimdark hues
 * (rust ember, ash gold, cold cyan, moss green, dust violet).
 */
export const MINIMAP_COLORS = {
  field: "#07090b",
  floor: "#6e7168",
  floorEdge: "#4a4d48",
  /** Wall silhouettes adjacent to explored floors. */
  wall: "#1c1f1c",
  exit: "#d4cfc0",
  spawn: "#5a5d58",
  enemy: "#c2362e",
  fire: "#d68a2c",
  stone: "#3aa6a0",
  stoneCollected: "#1d2f30",
  pickup: "#6a9a4f",
  timeFreeze: "#72e7ef",
  luminousWard: "#b9e879",
  annihilationPulse: "#ff5d86",
  relic: "#8a4fb0",
  door: "#3a3d3a",
  player: "#f0ebe0",
  playerCore: "#121416",
} as const;

/** Alias kept for internal use; the const is exported for tests/extension. */
const COLORS = MINIMAP_COLORS;

/**
 * Precomputed minimap viewport. Pass this to drawMinimap to skip the per-call
 * getBoundingClientRect() (which forces a layout reflow) and devicePixelRatio
 * read. Caller is responsible for invalidating it on resize.
 */
export interface MinimapViewport {
  /** CSS pixel width of the canvas layout box. */
  width: number;
  /** CSS pixel height of the canvas layout box. */
  height: number;
  /** Pre-clamped device pixel ratio. */
  pixelRatio: number;
}

export interface DrawMinimapOptions {
  features?: MinimapFeatures;
  viewport?: MinimapViewport;
  /**
   * Keys `"x,y"` of revealed floor cells. When omitted, the full floor plan is
   * drawn (tests / editor). When provided, unexplored floors stay under fog.
   */
  explored?: ReadonlySet<string>;
  /**
   * Player look yaw in radians (FirstPersonController.lookYaw).
   * Forward maps to canvas (-sin(yaw), -cos(yaw)).
   */
  playerYaw?: number;
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Mark floor cells around a center for fog-of-war. Chebyshev radius keeps
 * corridors readable without dumping the whole map.
 */
export function collectExploredAround(
  dungeon: DungeonData,
  center: GridCell,
  radius: number,
  into: Set<string> = new Set(),
): Set<string> {
  const r = Math.max(0, Math.floor(radius));
  for (let y = center.y - r; y <= center.y + r; y += 1) {
    for (let x = center.x - r; x <= center.x + r; x += 1) {
      if (dungeon.grid[y]?.[x] !== FLOOR) continue;
      into.add(cellKey(x, y));
    }
  }
  return into;
}

/** Default vision radius used when the player steps onto a cell. */
export const MINIMAP_REVEAL_RADIUS = 2;

export function drawMinimap(
  canvas: HTMLCanvasElement,
  dungeon: DungeonData,
  playerCell: GridCell | null,
  featuresOrOptions?: MinimapFeatures | DrawMinimapOptions,
  viewportArg?: MinimapViewport,
  exploredArg?: ReadonlySet<string>,
  playerYawArg?: number,
): void {
  // Support both legacy positional args and the options bag (4th parameter).
  let features: MinimapFeatures | undefined;
  let viewport: MinimapViewport | undefined;
  let explored: ReadonlySet<string> | undefined;
  let playerYaw: number | undefined;
  if (featuresOrOptions && isOptionsBag(featuresOrOptions)) {
    features = featuresOrOptions.features;
    viewport = featuresOrOptions.viewport ?? viewportArg;
    explored = featuresOrOptions.explored ?? exploredArg;
    playerYaw = featuresOrOptions.playerYaw ?? playerYawArg;
  } else {
    features = featuresOrOptions;
    viewport = viewportArg;
    explored = exploredArg;
    playerYaw = playerYawArg;
  }

  // Hot path: use the caller-provided viewport to avoid getBoundingClientRect()
  // (forced reflow) on every cell change. Fall back to measuring for tests/legacy.
  let cssWidth: number;
  let cssHeight: number;
  let pixelRatio: number;
  if (viewport) {
    cssWidth = viewport.width;
    cssHeight = viewport.height;
    pixelRatio = viewport.pixelRatio;
  } else {
    const bounds = canvas.getBoundingClientRect();
    cssWidth = bounds.width;
    cssHeight = bounds.height;
    pixelRatio = Math.min((typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1, 2);
  }
  const width = Math.max(1, Math.floor(cssWidth * pixelRatio));
  const height = Math.max(1, Math.floor(cssHeight * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  context.fillStyle = COLORS.field;
  context.fillRect(0, 0, cssWidth, cssHeight);

  const padding = 8;
  const cellSize = Math.min(
    (cssWidth - padding * 2) / dungeon.width,
    (cssHeight - padding * 2) / dungeon.height,
  );
  const originX = (cssWidth - dungeon.width * cellSize) / 2;
  const originY = (cssHeight - dungeon.height * cellSize) / 2;
  const cellCenter = (cell: { x: number; y: number }): [number, number] => [
    originX + cell.x * cellSize + cellSize / 2,
    originY + cell.y * cellSize + cellSize / 2,
  ];
  const isExplored = (x: number, y: number): boolean => !explored || explored.has(cellKey(x, y));

  // Wall silhouettes next to explored floors (only under fog-of-war).
  if (explored) {
    context.fillStyle = COLORS.wall;
    for (const key of explored) {
      const sep = key.indexOf(",");
      const x = Number(key.slice(0, sep));
      const y = Number(key.slice(sep + 1));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const wx = x + dx;
          const wy = y + dy;
          if (dungeon.grid[wy]?.[wx] !== WALL) continue;
          const size = Math.ceil(cellSize);
          context.fillRect(originX + wx * cellSize, originY + wy * cellSize, size, size);
        }
      }
    }
  }

  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      if (dungeon.grid[y]?.[x] !== FLOOR) continue;
      if (!isExplored(x, y)) continue;
      const px = originX + x * cellSize;
      const py = originY + y * cellSize;
      const size = Math.ceil(cellSize);
      context.fillStyle = COLORS.floor;
      context.fillRect(px, py, size, size);
    }
  }

  if (features) {
    drawFeatures(context, features, cellCenter, cellSize, isExplored);
  }

  // Exit: only when its cell is known (or full-map mode with no fog).
  if (isExplored(dungeon.exit.x, dungeon.exit.y)) {
    const exitSize = Math.max(3, cellSize * 1.85);
    context.fillStyle = COLORS.exit;
    context.fillRect(
      originX + dungeon.exit.x * cellSize - exitSize / 2 + cellSize / 2,
      originY + dungeon.exit.y * cellSize - exitSize / 2 + cellSize / 2,
      exitSize,
      exitSize,
    );
  }

  if (features && isExplored(features.spawn.x, features.spawn.y)) {
    const [sx, sy] = cellCenter(features.spawn);
    const spawnR = Math.max(2, cellSize * 0.7);
    context.lineWidth = Math.max(1, cellSize * 0.18);
    context.strokeStyle = COLORS.spawn;
    context.beginPath();
    context.arc(sx, sy, spawnR, 0, Math.PI * 2);
    context.stroke();
  }

  if (playerCell) {
    const cx = originX + playerCell.x * cellSize + cellSize / 2;
    const cy = originY + playerCell.y * cellSize + cellSize / 2;
    drawPlayerMarker(context, cx, cy, cellSize, playerYaw ?? 0);
  }
}

function isOptionsBag(value: MinimapFeatures | DrawMinimapOptions): value is DrawMinimapOptions {
  return (
    "explored" in value ||
    "playerYaw" in value ||
    "viewport" in value ||
    ("features" in value && !("doors" in value))
  );
}

/**
 * Small heading arrow. Yaw 0 faces world -Z, which is up on the minimap.
 */
function drawPlayerMarker(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  cellSize: number,
  yaw: number,
): void {
  const dx = -Math.sin(yaw);
  const dy = -Math.cos(yaw);
  const len = Math.max(4.5, cellSize * 1.55);
  const halfW = Math.max(2.1, cellSize * 0.62);
  const px = -dy;
  const py = dx;

  const tipX = cx + dx * len * 0.62;
  const tipY = cy + dy * len * 0.62;
  const baseX = cx - dx * len * 0.42;
  const baseY = cy - dy * len * 0.42;
  const leftX = baseX + px * halfW;
  const leftY = baseY + py * halfW;
  const rightX = baseX - px * halfW;
  const rightY = baseY - py * halfW;

  // Dark underlay for contrast on bone floors.
  context.beginPath();
  context.moveTo(tipX + dx * 1.2, tipY + dy * 1.2);
  context.lineTo(leftX - px * 0.8 - dx * 0.4, leftY - py * 0.8 - dy * 0.4);
  context.lineTo(rightX + px * 0.8 - dx * 0.4, rightY + py * 0.8 - dy * 0.4);
  context.closePath();
  context.fillStyle = COLORS.playerCore;
  context.fill();

  context.beginPath();
  context.moveTo(tipX, tipY);
  context.lineTo(leftX, leftY);
  context.lineTo(rightX, rightY);
  context.closePath();
  context.fillStyle = COLORS.player;
  context.fill();
}

/** Renders every world-feature marker layer below the exit/player caps. */
function drawFeatures(
  context: CanvasRenderingContext2D,
  features: MinimapFeatures,
  cellCenter: (cell: { x: number; y: number }) => [number, number],
  cellSize: number,
  isExplored: (x: number, y: number) => boolean,
): void {
  // Fires: small ember dots.
  context.fillStyle = COLORS.fire;
  const fireR = Math.max(1.2, cellSize * 0.3);
  for (const fire of features.fires) {
    if (!isExplored(fire.x, fire.y)) continue;
    const [cx, cy] = cellCenter(fire);
    context.beginPath();
    context.arc(cx, cy, fireR, 0, Math.PI * 2);
    context.fill();
  }

  // Resolve pickups: moss dots.
  context.fillStyle = COLORS.pickup;
  const pickupR = Math.max(1.2, cellSize * 0.32);
  for (const pickup of features.pickups) {
    if (!isExplored(pickup.x, pickup.y)) continue;
    const [cx, cy] = cellCenter(pickup);
    context.beginPath();
    context.arc(cx, cy, pickupR, 0, Math.PI * 2);
    context.fill();
  }

  if (features.timeFreeze && isExplored(features.timeFreeze.x, features.timeFreeze.y)) {
    const [cx, cy] = cellCenter(features.timeFreeze);
    const r = Math.max(2, cellSize * 0.52);
    context.fillStyle = COLORS.timeFreeze;
    context.beginPath();
    context.moveTo(cx, cy - r);
    context.lineTo(cx + r * 0.72, cy);
    context.lineTo(cx, cy + r);
    context.lineTo(cx - r * 0.72, cy);
    context.closePath();
    context.fill();
  }

  if (features.luminousWard && isExplored(features.luminousWard.x, features.luminousWard.y)) {
    const [cx, cy] = cellCenter(features.luminousWard);
    const r = Math.max(2, cellSize * 0.58);
    context.strokeStyle = COLORS.luminousWard;
    context.lineWidth = Math.max(1, cellSize * 0.16);
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = COLORS.luminousWard;
    context.beginPath();
    context.arc(cx, cy, Math.max(1.2, r * 0.34), 0, Math.PI * 2);
    context.fill();
  }

  if (
    features.annihilationPulse &&
    isExplored(features.annihilationPulse.x, features.annihilationPulse.y)
  ) {
    const [cx, cy] = cellCenter(features.annihilationPulse);
    const r = Math.max(2, cellSize * 0.62);
    context.strokeStyle = COLORS.annihilationPulse;
    context.lineWidth = Math.max(1, cellSize * 0.14);
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = COLORS.annihilationPulse;
    context.beginPath();
    context.moveTo(cx, cy - r * 0.52);
    context.lineTo(cx + r * 0.52, cy);
    context.lineTo(cx, cy + r * 0.52);
    context.lineTo(cx - r * 0.52, cy);
    context.closePath();
    context.fill();
  }

  // Enemies: rust dots, size scales with tier.
  for (const enemy of features.enemies) {
    if (!isExplored(enemy.cell.x, enemy.cell.y)) continue;
    drawEnemy(context, enemy, cellCenter, cellSize);
  }

  // Doors: crossed bars across the cell.
  context.strokeStyle = COLORS.door;
  context.lineWidth = Math.max(1, cellSize * 0.16);
  context.lineCap = "round";
  const doorHalf = Math.max(1, cellSize * 0.42);
  for (const door of features.doors) {
    if (!isExplored(door.x, door.y)) continue;
    const [cx, cy] = cellCenter(door);
    context.beginPath();
    context.moveTo(cx - doorHalf, cy - doorHalf);
    context.lineTo(cx + doorHalf, cy + doorHalf);
    context.moveTo(cx + doorHalf, cy - doorHalf);
    context.lineTo(cx - doorHalf, cy + doorHalf);
    context.stroke();
  }

  // Stones: cyan diamonds; collected ones fade.
  for (const stone of features.stones) {
    if (!isExplored(stone.cell.x, stone.cell.y)) continue;
    drawStone(context, stone, cellCenter, cellSize);
  }

  // Relic: large violet diamond.
  if (features.relic && isExplored(features.relic.x, features.relic.y)) {
    const [cx, cy] = cellCenter(features.relic);
    const r = Math.max(2, cellSize * 0.6);
    context.fillStyle = COLORS.relic;
    context.beginPath();
    context.moveTo(cx, cy - r);
    context.lineTo(cx + r, cy);
    context.lineTo(cx, cy + r);
    context.lineTo(cx - r, cy);
    context.closePath();
    context.fill();
  }
}

function drawEnemy(
  context: CanvasRenderingContext2D,
  enemy: MinimapEnemy,
  cellCenter: (cell: { x: number; y: number }) => [number, number],
  cellSize: number,
): void {
  const [cx, cy] = cellCenter(enemy.cell);
  // Tier 0 → 0.32, tier 3 → 0.5; bigger threat, bigger dot.
  const tierScale = 0.32 + Math.max(0, Math.min(3, enemy.tier)) * 0.06;
  const r = Math.max(1.4, cellSize * tierScale);
  context.fillStyle = COLORS.enemy;
  context.beginPath();
  context.arc(cx, cy, r, 0, Math.PI * 2);
  context.fill();
}

function drawStone(
  context: CanvasRenderingContext2D,
  stone: MinimapStone,
  cellCenter: (cell: { x: number; y: number }) => [number, number],
  cellSize: number,
): void {
  const [cx, cy] = cellCenter(stone.cell);
  const r = Math.max(2, cellSize * 0.48);
  context.fillStyle = stone.collected ? COLORS.stoneCollected : COLORS.stone;
  context.beginPath();
  context.moveTo(cx, cy - r);
  context.lineTo(cx + r, cy);
  context.lineTo(cx, cy + r);
  context.lineTo(cx - r, cy);
  context.closePath();
  context.fill();
}
