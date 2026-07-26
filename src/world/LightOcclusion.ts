import { FLOOR } from "../dungeon/generateDungeon";
import { worldToGrid, type WorldPoint } from "../dungeon/gridCollision";
import type { DungeonData } from "../dungeon/types";

export function hasGridLineOfSight(
  dungeon: DungeonData,
  from: WorldPoint,
  to: WorldPoint,
  tileSize: number,
): boolean {
  const start = worldToGrid(dungeon, from, tileSize);
  const end = worldToGrid(dungeon, to, tileSize);
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const stepX = start.x < end.x ? 1 : -1;
  const stepY = start.y < end.y ? 1 : -1;
  let error = dx - dy;
  while (x !== end.x || y !== end.y) {
    const previousX = x;
    const previousY = y;
    const doubleError = error * 2;
    const advancesX = doubleError > -dy;
    const advancesY = doubleError < dx;
    if (advancesX) {
      error -= dy;
      x += stepX;
    }
    if (advancesY) {
      error += dx;
      y += stepY;
    }
    if (advancesX && advancesY) {
      if (dungeon.grid[previousY]?.[previousX + stepX] !== FLOOR) return false;
      if (dungeon.grid[previousY + stepY]?.[previousX] !== FLOOR) return false;
    }
    if (x === end.x && y === end.y) break;
    if (dungeon.grid[y]?.[x] !== FLOOR) return false;
  }
  return true;
}
