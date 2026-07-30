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

type DungeonGenerator = (seed?: string, options?: DungeonOptions) => DungeonData;

/** Lazily materialized campaign floors; only the active floor pays generation cost. */
export class DungeonFloorCampaign {
  readonly rootSeed: string;
  readonly count: number;
  private readonly cache = new Map<number, DungeonData>();

  constructor(
    seed = "BLACK-FLAG",
    private readonly options: DungeonOptions = {},
    requestedFloorCount = 1,
    private readonly generator: DungeonGenerator = generateCompletableDungeon,
    initialFloor?: DungeonData,
  ) {
    this.rootSeed = seed.trim() || "BLACK-FLAG";
    this.count = clampFloorCount(requestedFloorCount);
    if (initialFloor)
      this.cache.set(0, withFloorMetadata(initialFloor, this.rootSeed, 0, this.count));
  }

  floor(index: number): DungeonData | null {
    const safeIndex = Math.trunc(index);
    if (safeIndex < 0 || safeIndex >= this.count) return null;
    const cached = this.cache.get(safeIndex);
    if (cached) return cached;
    const floorSeed = safeIndex === 0 ? this.rootSeed : `${this.rootSeed}:F${safeIndex + 1}`;
    const floor = withFloorMetadata(
      this.generator(floorSeed, this.options),
      this.rootSeed,
      safeIndex,
      this.count,
    );
    this.cache.set(safeIndex, floor);
    return floor;
  }

  get cachedFloorCount(): number {
    return this.cache.size;
  }
}

export function createDungeonFloorCampaign(
  seed = "BLACK-FLAG",
  options: DungeonOptions = {},
  requestedFloorCount = 1,
  initialFloor?: DungeonData,
): DungeonFloorCampaign {
  return new DungeonFloorCampaign(
    seed,
    options,
    requestedFloorCount,
    generateCompletableDungeon,
    initialFloor,
  );
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
  const campaign = createDungeonFloorCampaign(seed, options, requestedFloorCount);
  const rootSeed = campaign.rootSeed;
  const floors = Array.from({ length: campaign.count }, (_, index) => campaign.floor(index)!);
  return {
    rootSeed,
    floors,
    signature: floors.map((floor) => floor.topologySignature).join("||"),
  };
}
