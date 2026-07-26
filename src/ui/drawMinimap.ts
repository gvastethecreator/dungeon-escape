import { FLOOR } from "../dungeon/generateDungeon";
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
  exit: "#d4cfc0",
  spawn: "#5a5d58",
  enemy: "#c2362e",
  fire: "#d68a2c",
  stone: "#3aa6a0",
  stoneCollected: "#1d2f30",
  pickup: "#6a9a4f",
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

export function drawMinimap(
  canvas: HTMLCanvasElement,
  dungeon: DungeonData,
  playerCell: GridCell | null,
  features?: MinimapFeatures,
  viewport?: MinimapViewport,
): void {
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

  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      if (dungeon.grid[y]?.[x] !== FLOOR) continue;
      const px = originX + x * cellSize;
      const py = originY + y * cellSize;
      const size = Math.ceil(cellSize);
      context.fillStyle = COLORS.floor;
      context.fillRect(px, py, size, size);
    }
  }

  if (features) drawFeatures(context, features, cellCenter, cellSize);

  // Exit: bright bone square, always on top of furniture markers.
  const exitSize = Math.max(3, cellSize * 1.85);
  context.fillStyle = COLORS.exit;
  context.fillRect(
    originX + dungeon.exit.x * cellSize - exitSize / 2 + cellSize / 2,
    originY + dungeon.exit.y * cellSize - exitSize / 2 + cellSize / 2,
    exitSize,
    exitSize,
  );

  if (features) {
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
    const r = Math.max(2.4, cellSize * 0.78);
    context.beginPath();
    context.fillStyle = COLORS.playerCore;
    context.arc(cx, cy, r + 1.2, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.fillStyle = COLORS.player;
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fill();
  }
}

/** Renders every world-feature marker layer below the exit/player caps. */
function drawFeatures(
  context: CanvasRenderingContext2D,
  features: MinimapFeatures,
  cellCenter: (cell: { x: number; y: number }) => [number, number],
  cellSize: number,
): void {
  // Fires: small ember dots.
  context.fillStyle = COLORS.fire;
  const fireR = Math.max(1.2, cellSize * 0.3);
  for (const fire of features.fires) {
    const [cx, cy] = cellCenter(fire);
    context.beginPath();
    context.arc(cx, cy, fireR, 0, Math.PI * 2);
    context.fill();
  }

  // Resolve pickups: moss dots.
  context.fillStyle = COLORS.pickup;
  const pickupR = Math.max(1.2, cellSize * 0.32);
  for (const pickup of features.pickups) {
    const [cx, cy] = cellCenter(pickup);
    context.beginPath();
    context.arc(cx, cy, pickupR, 0, Math.PI * 2);
    context.fill();
  }

  // Enemies: rust dots, size scales with tier.
  for (const enemy of features.enemies) {
    drawEnemy(context, enemy, cellCenter, cellSize);
  }

  // Doors: crossed bars across the cell.
  context.strokeStyle = COLORS.door;
  context.lineWidth = Math.max(1, cellSize * 0.16);
  context.lineCap = "round";
  const doorHalf = Math.max(1, cellSize * 0.42);
  for (const door of features.doors) {
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
    drawStone(context, stone, cellCenter, cellSize);
  }

  // Relic: large violet diamond.
  if (features.relic) {
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
