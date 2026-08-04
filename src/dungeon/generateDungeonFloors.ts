import { hashSeed } from "../core/random";
import { generateCompletableDungeon } from "./completeness";
import { refreshDungeonConnectivity } from "./generateDungeon";
import {
  applyStairShaftCarves,
  planStairShafts,
  type StairShaftPlan,
} from "./StairShaftPlan";
import type {
  DungeonData,
  DungeonFloorMetadata,
  DungeonOptions,
  DungeonStair,
  GridCell,
} from "./types";

/** Campaign stack resident ceiling for continuous multi-floor play. */
export const MAX_DUNGEON_FLOORS = 4;

export interface DungeonFloorSet {
  rootSeed: string;
  floors: DungeonData[];
  signature: string;
  shaftPlan: StairShaftPlan;
}

export type DungeonGenerator = (seed?: string, options?: DungeonOptions) => DungeonData;

/**
 * Campaign floor stack. Materializes every floor on first access so stair
 * shafts stay aligned across the resident set.
 */
export class DungeonFloorCampaign {
  readonly rootSeed: string;
  readonly count: number;
  private readonly cache = new Map<number, DungeonData>();
  private shaftPlan: StairShaftPlan = { links: [] };
  private materialized = false;
  private readonly initialFloor: DungeonData | undefined;

  constructor(
    seed = "BLACK-FLAG",
    private readonly options: DungeonOptions = {},
    requestedFloorCount = 1,
    private readonly generator: DungeonGenerator = generateCompletableDungeon,
    initialFloor?: DungeonData,
  ) {
    this.rootSeed = seed.trim() || "BLACK-FLAG";
    this.count = clampFloorCount(requestedFloorCount);
    if (initialFloor) {
      if (this.count === 1) {
        this.cache.set(0, withSingleFloorMetadata(initialFloor, this.rootSeed, 0, 1));
        this.materialized = true;
      } else {
        this.initialFloor = cloneDungeonGrid(initialFloor);
      }
    }
  }

  floor(index: number): DungeonData | null {
    const safeIndex = Math.trunc(index);
    if (safeIndex < 0 || safeIndex >= this.count) return null;
    this.ensureMaterialized();
    return this.cache.get(safeIndex) ?? null;
  }

  get cachedFloorCount(): number {
    return this.cache.size;
  }

  getShaftPlan(): StairShaftPlan {
    this.ensureMaterialized();
    return this.shaftPlan;
  }

  /** All floors of the stack in order. */
  allFloors(): DungeonData[] {
    this.ensureMaterialized();
    return Array.from({ length: this.count }, (_, index) => this.cache.get(index)!);
  }

  /** Generate and link the complete resident stack before Play can use it. */
  materialize(): this {
    this.ensureMaterialized();
    return this;
  }

  private ensureMaterialized(): void {
    if (this.materialized) return;
    const raw: DungeonData[] = [];
    for (let index = 0; index < this.count; index += 1) {
      const floorSeed = index === 0 ? this.rootSeed : `${this.rootSeed}:F${index + 1}`;
      raw.push(
        index === 0 && this.initialFloor
          ? cloneDungeonGrid(this.initialFloor)
          : cloneDungeonGrid(this.generator(floorSeed, this.options)),
      );
    }

    if (this.count > 1) {
      this.shaftPlan = planStairShafts(raw, this.rootSeed);
      applyStairShaftCarves(raw, this.shaftPlan);
      for (let index = 0; index < raw.length; index += 1) {
        raw[index] = refreshDungeonConnectivity(raw[index]!);
      }
    } else {
      this.shaftPlan = { links: [] };
    }

    raw.forEach((dungeon, index) => {
      this.cache.set(
        index,
        withStackFloorMetadata(dungeon, this.rootSeed, index, this.count, this.shaftPlan),
      );
    });
    this.materialized = true;
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
  ).materialize();
}

function clampFloorCount(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_DUNGEON_FLOORS, Math.max(1, Math.floor(value)));
}

function cloneDungeonGrid(dungeon: DungeonData): DungeonData {
  return {
    ...dungeon,
    grid: dungeon.grid.map((row) => new Uint8Array(row)),
    rooms: dungeon.rooms.map((room) => ({
      ...room,
      center: { ...room.center },
    })),
    edges: dungeon.edges.map((edge) => ({ ...edge })),
    spawn: { ...dungeon.spawn },
    exit: { ...dungeon.exit },
    distances: new Int32Array(dungeon.distances),
  };
}

function stairYaw(seed: string): number {
  return ((hashSeed(seed) % 4) * Math.PI) / 2;
}

function withSingleFloorMetadata(
  dungeon: DungeonData,
  rootSeed: string,
  index: number,
  count: number,
): DungeonData {
  const floor: DungeonFloorMetadata = {
    index,
    number: index + 1,
    count,
    rootSeed,
    stairs: [],
    openVerticalCells: [],
  };
  return {
    ...dungeon,
    floor,
    topologySignature: `${dungeon.topologySignature}:floor=${index + 1}/${count}`,
  };
}

function withStackFloorMetadata(
  dungeon: DungeonData,
  rootSeed: string,
  index: number,
  count: number,
  plan: StairShaftPlan,
): DungeonData {
  const stairs: DungeonStair[] = [];
  const openVerticalCells: GridCell[] = [];
  const openSeen = new Set<string>();

  for (const link of plan.links) {
    if (link.lowerFloor === index || link.upperFloor === index) {
      for (const cell of link.footprint) {
        const key = `${cell.x},${cell.y}`;
        if (openSeen.has(key)) continue;
        openSeen.add(key);
        openVerticalCells.push({ ...cell });
      }
    }

    if (link.lowerFloor === index) {
      stairs.push({
        id: `${link.shaftId}-up`,
        direction: "up",
        cell: { ...link.anchor },
        targetFloor: link.upperFloor,
        yaw: link.yaw,
        shaftId: link.shaftId,
        footprint: link.footprint.map((cell) => ({ ...cell })),
      });
    }
    if (link.upperFloor === index) {
      stairs.push({
        id: `${link.shaftId}-down`,
        direction: "down",
        cell: { ...link.anchor },
        targetFloor: link.lowerFloor,
        yaw: link.yaw + Math.PI,
        shaftId: link.shaftId,
        footprint: link.footprint.map((cell) => ({ ...cell })),
      });
    }
  }

  // Single-floor campaigns keep empty stairs; multi-floor without a link is an error upstream.
  if (count === 1 && stairs.length === 0) {
    // no-op
  }

  const floor: DungeonFloorMetadata = {
    index,
    number: index + 1,
    count,
    rootSeed,
    stairs,
    openVerticalCells,
  };

  const shaftSig = plan.links
    .map(
      (link) =>
        `${link.shaftId}@${link.anchor.x},${link.anchor.y}:${link.yaw.toFixed(3)}`,
    )
    .join("|");

  return {
    ...dungeon,
    floor,
    topologySignature: `${dungeon.topologySignature}:floor=${index + 1}/${count}:shafts=${shaftSig || "none"}`,
  };
}

/**
 * Materialize a full deterministic floor stack with aligned walkable shafts.
 */
export function generateDungeonFloorSet(
  seed = "BLACK-FLAG",
  options: DungeonOptions = {},
  requestedFloorCount = 1,
): DungeonFloorSet {
  const campaign = createDungeonFloorCampaign(seed, options, requestedFloorCount);
  const floors = campaign.allFloors();
  return {
    rootSeed: campaign.rootSeed,
    floors,
    signature: floors.map((floor) => floor.topologySignature).join("||"),
    shaftPlan: campaign.getShaftPlan(),
  };
}

/** @deprecated Prefer stack shafts; kept for tests that only need yaw hashing. */
export function debugStairYaw(seed: string): number {
  return stairYaw(seed);
}
