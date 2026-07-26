import { FLOOR, WALL } from "../dungeon/generateDungeon";
import type { DungeonData, GridCell } from "../dungeon/types";
import type { StoneId } from "../ui/copy";
import { selectMagicStonePlacements } from "../world/MagicStonePlacement";
import { selectEnemyKindsForSpawns } from "../world/EnemySpawnPlan";
import type { EnemyKind } from "../world/EnemyArchetypes";
import { roomTheme } from "../world/RoomArtDirection";
import {
  resolveSpecialRoomIdentity,
  specialRoomLabel,
  type SpecialRoomIdentity,
} from "../world/SpecialRoomIdentity";

export const EDITOR_CELL_KIND = Object.freeze({
  empty: 0,
  wall: 1,
  floor: 2,
  corridor: 3,
  pool: 4,
  lake: 5,
  door: 6,
});

export interface EditorProjectionRoom {
  id: number;
  cell: GridCell;
  bounds: { x: number; y: number; width: number; height: number };
  kind: string;
  identity: SpecialRoomIdentity | null;
  label: string;
}

export interface EditorProjectionEnemy {
  cell: GridCell;
  tier: number;
  kind: EnemyKind;
}

export interface EditorProjectionProp {
  cell: GridCell;
  kind: string;
}

export interface EditorProjectionStone {
  cell: GridCell;
  id: StoneId;
}

export interface DungeonEditorProjection {
  width: number;
  height: number;
  cells: Uint8Array;
  rooms: EditorProjectionRoom[];
  torches: GridCell[];
  enemySpawns: EditorProjectionEnemy[];
  keyProps: EditorProjectionProp[];
  stones: EditorProjectionStone[];
}

const KEY_PROP_KINDS = new Set([
  "bossCrystal",
  "shrineCrystal",
  "chest",
  "reliquary",
  "grave",
  "brazier",
  "campfire",
]);

function isVisibleNeighbor(cells: Uint8Array, x: number, y: number, width: number, height: number) {
  if (x < 0 || y < 0 || x >= width || y >= height) return false;
  const kind = cells[y * width + x];
  return kind !== EDITOR_CELL_KIND.empty && kind !== EDITOR_CELL_KIND.wall;
}

export function createDungeonEditorProjection(dungeon: DungeonData): DungeonEditorProjection {
  const cells = new Uint8Array(dungeon.width * dungeon.height);
  const forge = dungeon.forge;

  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      const index = y * dungeon.width + x;
      if (forge?.pools[index]) {
        cells[index] = EDITOR_CELL_KIND.pool;
      } else if (forge?.lakeMask[index]) {
        cells[index] = EDITOR_CELL_KIND.lake;
      } else if (dungeon.grid[y]?.[x] === FLOOR) {
        cells[index] = forge?.corridors[index] ? EDITOR_CELL_KIND.corridor : EDITOR_CELL_KIND.floor;
      }
    }
  }

  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      const index = y * dungeon.width + x;
      if (dungeon.grid[y]?.[x] !== WALL || cells[index] !== EDITOR_CELL_KIND.empty) continue;
      if (
        isVisibleNeighbor(cells, x - 1, y, dungeon.width, dungeon.height) ||
        isVisibleNeighbor(cells, x + 1, y, dungeon.width, dungeon.height) ||
        isVisibleNeighbor(cells, x, y - 1, dungeon.width, dungeon.height) ||
        isVisibleNeighbor(cells, x, y + 1, dungeon.width, dungeon.height)
      )
        cells[index] = EDITOR_CELL_KIND.wall;
    }
  }

  if (forge) {
    forge.doorways.forEach((value, index) => {
      if (value) cells[index] = EDITOR_CELL_KIND.door;
    });
  }

  const rooms = dungeon.rooms.map<EditorProjectionRoom>((room) => {
    const fallback = roomTheme(dungeon, room);
    const identity = resolveSpecialRoomIdentity(dungeon, room);
    return {
      id: room.id,
      cell: { ...room.center },
      bounds: { x: room.x, y: room.y, width: room.width, height: room.height },
      kind: identity ?? fallback,
      identity,
      label: specialRoomLabel(dungeon, room, fallback),
    };
  });
  const torches = (forge?.torches ?? []).map((torch) => ({ x: torch.x, y: torch.y }));
  const sourceSpawns = forge?.spawns ?? [];
  const selectedKinds = selectEnemyKindsForSpawns(
    dungeon.seed,
    sourceSpawns.map((spawn) => spawn.tier),
  );
  const enemySpawns = sourceSpawns.map((spawn, index) => ({
    cell: { x: spawn.x, y: spawn.y },
    tier: spawn.tier,
    kind: selectedKinds[index] ?? "goblin",
  }));
  const keyProps = (forge?.props ?? [])
    .filter((prop) => KEY_PROP_KINDS.has(prop.kind))
    .map((prop) => ({ cell: { x: prop.x, y: prop.y }, kind: prop.kind }));
  const stones = selectMagicStonePlacements(dungeon).map((placement) => ({
    cell: { ...placement.cell },
    id: placement.stoneId,
  }));

  return {
    width: dungeon.width,
    height: dungeon.height,
    cells,
    rooms,
    torches,
    enemySpawns,
    keyProps,
    stones,
  };
}
