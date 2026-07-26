import type { DungeonData, GridCell } from "../dungeon/types";

export type FootstepSurface = "stone" | "water";

/**
 * Resolve the audible floor under the player from the same Forge masks that
 * render connected liquids. Molten pools and frozen lakes keep a dry cue until
 * they gain their own traversal rules.
 */
export function footstepSurfaceAt(
  dungeon: DungeonData | null,
  cell: GridCell | null,
): FootstepSurface {
  const forge = dungeon?.forge;
  if (!dungeon || !forge || !cell) return "stone";
  if (cell.x < 0 || cell.y < 0 || cell.x >= dungeon.width || cell.y >= dungeon.height) {
    return "stone";
  }
  const theme = forge.themeKey.trim().toLowerCase();
  if (theme === "molten" || theme === "frost") return "stone";
  const index = cell.y * dungeon.width + cell.x;
  return forge.pools[index] || forge.lakeMask[index] ? "water" : "stone";
}
