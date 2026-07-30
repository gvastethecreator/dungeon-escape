import { hashSeed } from "../core/random";
import { generateCompletableDungeon } from "./completeness";
import type {
  DungeonData,
  DungeonFloorMetadata,
  DungeonOptions,
  DungeonRoom,
  DungeonStair,
  GridCell,
} from "./types";

export const MAX_DUNGEON_FLOORS = 4;

export interface DungeonFloorSet {
  rootSeed: string;
  floors: DungeonData[];
  signature: string;
}

function clampFloorCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_DUNGEON_FLOORS, Math.max(1, Math.floor(value)));
}

function roomInteriorCandidates(room: DungeonRoom): GridCell[] {
  const insetX = room.width >= 5 ? 1 : 0;
  const insetY = room.height >= 5 ? 1 : 0;
  return [
    { x: room.x + insetX, y: room.y + insetY },
    { x: room.x + room.width - 1 - insetX, y: room.y + insetY },
    {
      x: room.x + room.width - 1 - insetX,
      y: room.y + room.height - 1 - insetY,
    },
    { x: room.x + insetX, y: room.y + room.height - 1 - insetY },
    { ...room.center },
  ];
}

function selectStairCell(
  dungeon: DungeonData,
  room: DungeonRoom,
  salt: string,
  avoid?: GridCell,
): GridCell {
  const candidates = roomInteriorCandidates(room).filter(
    (cell) =>
      dungeon.grid[cell.y]?.[cell.x] === 1 &&
      (avoid === undefined || cell.x !== avoid.x || cell.y !== avoid.y),
  );
  const selected = candidates[hashSeed(`${dungeon.seed}:${salt}`) % Math.max(1, candidates.length)];
  return selected ? { ...selected } : { ...room.center };
}

function stairYaw(seed: string): number {
  return ((hashSeed(seed) % 4) * Math.PI) / 2;
}

function withFloorMetadata(
  dungeon: DungeonData,
  rootSeed: string,
  index: number,
  count: number,
): DungeonData {
  const entrance =
    dungeon.rooms.find((room) => room.id === dungeon.entranceRoomId) ?? dungeon.rooms[0];
  const exit = dungeon.rooms.find((room) => room.id === dungeon.exitRoomId) ?? dungeon.rooms.at(-1);
  if (!entrance || !exit) throw new Error("A dungeon floor requires entrance and exit rooms.");

  const stairs: DungeonStair[] = [];
  let upCell: GridCell | undefined;
  if (index > 0) {
    upCell = selectStairCell(dungeon, entrance, "stairs-up");
    stairs.push({
      id: `floor-${index + 1}-up`,
      direction: "up",
      cell: upCell,
      targetFloor: index - 1,
      yaw: stairYaw(`${dungeon.seed}:up`),
    });
  }
  if (index < count - 1) {
    const downCell = selectStairCell(dungeon, exit, "stairs-down", upCell);
    stairs.push({
      id: `floor-${index + 1}-down`,
      direction: "down",
      cell: downCell,
      targetFloor: index + 1,
      yaw: stairYaw(`${dungeon.seed}:down`),
    });
  }
  const floor: DungeonFloorMetadata = {
    index,
    number: index + 1,
    count,
    rootSeed,
    stairs,
  };
  return {
    ...dungeon,
    floor,
    topologySignature: `${dungeon.topologySignature}:floor=${index + 1}/${count}`,
  };
}

/**
 * A campaign level owns a deterministic set of sibling 2D floors. DungeonWorld
 * still receives one active floor, keeping collision, editor, Forge, and old
 * save consumers compatible while the runtime changes floors at stair anchors.
 */
export function generateDungeonFloorSet(
  seed = "BLACK-FLAG",
  options: DungeonOptions = {},
  requestedFloorCount = 1,
): DungeonFloorSet {
  const rootSeed = seed.trim() || "BLACK-FLAG";
  const count = clampFloorCount(requestedFloorCount);
  const floors = Array.from({ length: count }, (_, index) => {
    const floorSeed = index === 0 ? rootSeed : `${rootSeed}:F${index + 1}`;
    return withFloorMetadata(
      generateCompletableDungeon(floorSeed, options),
      rootSeed,
      index,
      count,
    );
  });
  return {
    rootSeed,
    floors,
    signature: floors.map((floor) => floor.topologySignature).join("||"),
  };
}
