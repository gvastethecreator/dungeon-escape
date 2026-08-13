import { isFloorCell, WALL } from "../dungeon/generateDungeon";
import { createSeededRandom } from "../core/random";
import {
  planBiomeLootBudget,
  spreadDepthFractions,
  type FloorFreePowerKind,
} from "../game/BiomeLootPlan";
import { planCurseChestPlacements } from "../game/CurseChestPlan";
import {
  OFFENSE_POWER_DEPTH_FRACTION,
  OFFENSE_POWER_SALT,
  planOffensePowerKind,
} from "../game/OffensePowerPlan";
import { roomTheme } from "./RoomArtDirection";
import { hasValidPortalPlacementContract, selectMagicStonePlacements } from "./MagicStonePlacement";
import type { StoneId } from "../ui/copy";
import type { ChestRewardKind } from "./StaticDungeonActorTypes";
import type {
  DungeonData,
  DungeonForgeMetadata,
  DungeonRoom,
  DungeonStair,
  GridCell,
} from "../dungeon/types";

export const RESIDENT_DUNGEON_PLAN_VERSION = "rdl17-v2";

export interface ResidentDungeonStairPlan {
  readonly id: string;
  readonly shaftId: string;
  readonly direction: "up" | "down";
  readonly targetFloor: number;
  readonly anchor: GridCell;
  readonly yaw: number;
  /** Linear cell indices; no Three.js values cross the planner seam. */
  readonly footprint: Uint32Array;
  readonly catalogKey: string;
}

export interface ResidentDungeonRoomPlan {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly center: GridCell;
  readonly role: DungeonRoom["role"];
  readonly themeKey: string;
  /** Stable seeds consumed by the presentation adapters. */
  readonly dressingSeed: string;
  readonly lightSeed: string;
  readonly atmosphereSeed: string;
}

export interface ResidentDungeonDoorwayPlan {
  readonly edgeIndex: number;
  readonly roomId: number;
  readonly connectedRoomId: number;
  readonly cell: GridCell;
  readonly outside: GridCell;
  readonly outDx: -1 | 0 | 1;
  readonly outDy: -1 | 0 | 1;
  readonly catalogKey: string;
}

/** Scalar Forge placement copied into the pure plan; no runtime object leaks in. */
export interface ResidentDungeonForgePropPlan {
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly roomId?: number;
  readonly rot?: number;
  readonly scale?: number;
  readonly variant?: number;
  readonly dx?: number;
  readonly dy?: number;
  readonly ice?: boolean;
  readonly catalogKey: string;
}

/** Pure wall-art recipe. Meshes are still created only during scene commit. */
export interface ResidentDungeonRoomWallArtPlan {
  readonly roomId: number;
  readonly mapIndex: number;
  readonly wall: GridCell;
  readonly angle: number;
  readonly catalogKey: string;
}

export interface ResidentDungeonLightPlan {
  readonly mode: "classic" | "forge" | "backrooms" | "unknown";
  readonly seed: string;
  readonly roomCount: number;
  readonly boundaryWallCount: number;
  /** Scalar fixture recipes selected before Three.js commit. */
  readonly fixtures: readonly ResidentDungeonLightFixturePlan[];
  readonly torchTarget: number;
  readonly floorFireTarget: number;
}

export interface ResidentDungeonLightFixturePlan {
  readonly kind: "classic-torch" | "classic-campfire" | "classic-brazier" | "backrooms";
  readonly cell: GridCell;
  readonly wall?: GridCell;
  readonly floor?: GridCell;
  readonly roomId?: number;
  readonly offsetX?: number;
  readonly offsetZ?: number;
  readonly phase: number;
  readonly catalogKey: string;
}

export interface ResidentDungeonAtmospherePlan {
  readonly seed: string;
  readonly ambientSeed: string;
  readonly roomCount: number;
  readonly floorCellCount: number;
  readonly boundaryWallCount: number;
  readonly profileKey: string;
}

export interface ResidentDungeonObjectivePlan {
  readonly kind: "stone";
  readonly stoneId: StoneId;
  readonly roomId: number;
  readonly cell: GridCell;
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly catalogKey: string;
}

export interface ResidentDungeonPortalPlan {
  readonly required: boolean;
  readonly cell: GridCell;
  readonly catalogKey: string;
}

export interface ResidentDungeonRewardSlotPlan {
  readonly id: string;
  readonly floorIndex: number;
  readonly kind: Exclude<ChestRewardKind, "resolve" | "phoenix-egg">;
  readonly depthFraction: number;
  readonly salt: number;
  readonly catalogKey: string;
}

export interface ResidentDungeonFreePickupPlan {
  readonly id: string;
  readonly floorIndex: number;
  readonly kind: Exclude<
    ChestRewardKind,
    "swarm-curse" | "slow-curse" | "frenzy-curse" | "gloom-curse" | "mirror-curse" | "spin-curse"
  >;
  readonly source: "phoenix" | "corridor-flask" | "room-flask" | "free-power";
  readonly catalogKey: string;
}

export interface ResidentDungeonRewardPlan {
  readonly slots: readonly ResidentDungeonRewardSlotPlan[];
  readonly healthDepths: readonly number[];
  readonly healthChestIds: readonly string[];
  readonly freePickups: readonly ResidentDungeonFreePickupPlan[];
  readonly freeFlasks: number;
  readonly corridorFlasks: number;
  readonly freePowers: readonly FloorFreePowerKind[];
  readonly placePhoenix: boolean;
}

export interface ResidentDungeonFloorPlan {
  readonly floorIndex: number;
  readonly width: number;
  readonly height: number;
  readonly spawn: GridCell;
  readonly exit: GridCell;
  readonly topologySignature: string;
  /** Floor cells used by architecture and collision commit. */
  readonly floorCells: Uint32Array;
  /** Boundary wall cells used by wall fixtures and atmosphere. */
  readonly boundaryWallCells: Uint32Array;
  readonly openVerticalCells: Uint32Array;
  readonly stairs: readonly ResidentDungeonStairPlan[];
  readonly rooms: readonly ResidentDungeonRoomPlan[];
  readonly doorways: readonly ResidentDungeonDoorwayPlan[];
  readonly roomWallArt: readonly ResidentDungeonRoomWallArtPlan[];
  readonly forgeProps: readonly ResidentDungeonForgePropPlan[];
  readonly forgeTorches: readonly ResidentDungeonForgePropPlan[];
  readonly light: ResidentDungeonLightPlan;
  readonly atmosphere: ResidentDungeonAtmospherePlan;
  readonly objectives: readonly ResidentDungeonObjectivePlan[];
  readonly portal: ResidentDungeonPortalPlan;
  readonly rewards: ResidentDungeonRewardPlan;
  readonly catalogKeys: readonly string[];
}

export interface ResidentDungeonShaftPlan {
  readonly shaftId: string;
  readonly lowerFloor: number;
  readonly upperFloor: number;
  readonly anchor: GridCell;
  readonly yaw: number;
  readonly footprint: Uint32Array;
}

export interface ResidentDungeonPlan {
  readonly version: typeof RESIDENT_DUNGEON_PLAN_VERSION;
  readonly rootSeed: string;
  readonly floorCount: number;
  readonly floors: readonly ResidentDungeonFloorPlan[];
  readonly shafts: readonly ResidentDungeonShaftPlan[];
  readonly hash: string;
}

export interface ResidentDungeonPlanOptions {
  readonly moodId?: string;
  readonly decorDensity?: number;
  readonly phoenixArmed?: boolean;
}

function encodeCell(cell: GridCell, width: number): number {
  return cell.y * width + cell.x;
}

function collectCells(
  dungeon: DungeonData,
  predicate: (x: number, y: number) => boolean,
): Uint32Array {
  const cells: number[] = [];
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      if (predicate(x, y)) cells.push(y * dungeon.width + x);
    }
  }
  return Uint32Array.from(cells);
}

function cellIsFloor(dungeon: DungeonData, x: number, y: number): boolean {
  return isFloorCell(dungeon, x, y);
}

function boundaryWallCells(dungeon: DungeonData): Uint32Array {
  return collectCells(dungeon, (x, y) => {
    if (cellIsFloor(dungeon, x, y)) return false;
    return (
      cellIsFloor(dungeon, x - 1, y) ||
      cellIsFloor(dungeon, x + 1, y) ||
      cellIsFloor(dungeon, x, y - 1) ||
      cellIsFloor(dungeon, x, y + 1)
    );
  });
}

function decodeCell(encoded: number, width: number): GridCell {
  return { x: encoded % width, y: Math.floor(encoded / width) };
}

function planRoomWallArt(dungeon: DungeonData): readonly ResidentDungeonRoomWallArtPlan[] {
  const placements: ResidentDungeonRoomWallArtPlan[] = [];
  for (const room of dungeon.rooms) {
    if (room.role === "entrance" || room.width < 5 || room.height < 5 || room.id % 2 !== 0) {
      continue;
    }
    const north = { x: room.center.x, y: room.y - 1 };
    const south = { x: room.center.x, y: room.y + room.height };
    const west = { x: room.x - 1, y: room.center.y };
    const candidate =
      dungeon.grid[north.y]?.[north.x] === WALL
        ? { cell: north, angle: 0 }
        : dungeon.grid[south.y]?.[south.x] === WALL
          ? { cell: south, angle: Math.PI }
          : dungeon.grid[west.y]?.[west.x] === WALL
            ? { cell: west, angle: Math.PI / 2 }
            : null;
    if (!candidate) continue;
    const mapIndex = Math.abs(room.id) % 4;
    placements.push({
      roomId: room.id,
      mapIndex,
      wall: { ...candidate.cell },
      angle: candidate.angle,
      catalogKey: `room-wall-art/v2:room:${room.id}:map:${mapIndex}`,
    });
  }
  return Object.freeze(placements);
}

function roomDistance(dungeon: DungeonData, room: DungeonRoom): number {
  return dungeon.distances[room.center.y * dungeon.width + room.center.x] ?? -1;
}

function planLightFixtures(
  dungeon: DungeonData,
  mode: ResidentDungeonLightPlan["mode"],
  boundaryCells: Uint32Array,
  decorDensity: number,
): {
  fixtures: readonly ResidentDungeonLightFixturePlan[];
  torchTarget: number;
  floorFireTarget: number;
} {
  if (mode === "backrooms") {
    const seen = new Set<string>();
    const fixtures: ResidentDungeonLightFixturePlan[] = [];
    const anchors = [
      dungeon.spawn,
      dungeon.exit,
      ...dungeon.rooms.filter((room) => room.role === "room").map((room) => room.center),
    ];
    anchors.forEach((cell) => {
      const key = `${cell.x},${cell.y}`;
      if (seen.has(key) || !isFloorCell(dungeon, cell.x, cell.y)) return;
      seen.add(key);
      fixtures.push({
        kind: "backrooms",
        cell: { ...cell },
        phase: (fixtures.length - 1) * 2.47,
        catalogKey: `light/v2:backrooms:${cell.x}:${cell.y}`,
      });
    });
    return { fixtures: Object.freeze(fixtures), torchTarget: fixtures.length, floorFireTarget: 0 };
  }

  if (mode !== "classic") {
    return { fixtures: Object.freeze([]), torchTarget: 0, floorFireTarget: 0 };
  }

  const random = createSeededRandom(`${dungeon.seed}:fire-props`);
  const candidates: Array<{ wall: GridCell; floor: GridCell }> = [];
  for (const encoded of boundaryCells) {
    const wall = decodeCell(encoded, dungeon.width);
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const floor = { x: wall.x + dx, y: wall.y + dy };
      if (isFloorCell(dungeon, floor.x, floor.y)) {
        candidates.push({ wall, floor });
        break;
      }
    }
  }
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swap = random.integer(0, index);
    [candidates[index], candidates[swap]] = [candidates[swap]!, candidates[index]!];
  }

  const torchTarget = Math.max(
    10,
    Math.round((12 + dungeon.rooms.length * 0.7) * Math.max(0, decorDensity)),
  );
  const fixtures: ResidentDungeonLightFixturePlan[] = candidates.map((candidate, index) => ({
    kind: "classic-torch",
    cell: { ...candidate.wall },
    wall: { ...candidate.wall },
    floor: { ...candidate.floor },
    phase: index * 1.73,
    catalogKey: `light/v2:classic-torch:${candidate.wall.x}:${candidate.wall.y}:${candidate.floor.x}:${candidate.floor.y}`,
  }));

  const rooms = dungeon.rooms.filter((room) => room.role === "room");
  const floorFireTarget = Math.min(8, Math.round(rooms.length * 0.48 * Math.max(0, decorDensity)));
  for (let index = 0; index < floorFireTarget; index += 1) {
    const room = rooms[(index * 3 + 1) % Math.max(1, rooms.length)];
    if (!room) continue;
    fixtures.push({
      kind: "classic-campfire",
      cell: { ...room.center },
      roomId: room.id,
      offsetX: (random.next() - 0.5) * 1.1,
      offsetZ: (random.next() - 0.5) * 1.1,
      phase: 9 + index * 2.1,
      catalogKey: `light/v2:classic-campfire:room:${room.id}:${index}`,
    });
  }

  const farRooms = [...rooms]
    .sort((left, right) => roomDistance(dungeon, right) - roomDistance(dungeon, left))
    .slice(1, 4);
  for (const [index, room] of farRooms.entries()) {
    fixtures.push({
      kind: "classic-brazier",
      cell: { ...room.center },
      roomId: room.id,
      offsetX: 1.15,
      offsetZ: -0.8,
      phase: 20 + index * 2.7,
      catalogKey: `light/v2:classic-brazier:room:${room.id}:${index}`,
    });
  }
  return {
    fixtures: Object.freeze(fixtures),
    torchTarget,
    floorFireTarget: floorFireTarget + farRooms.length,
  };
}

function planRewards(
  dungeon: DungeonData,
  floorIndex: number,
  moodId: string | undefined,
  phoenixArmed: boolean,
): ResidentDungeonRewardPlan {
  const slots: ResidentDungeonRewardSlotPlan[] = [];
  const freePickups: ResidentDungeonFreePickupPlan[] = [];
  const addSlot = (
    kind: ResidentDungeonRewardSlotPlan["kind"],
    depthFraction: number,
    salt: number,
    source: string,
  ): void => {
    const ordinal = slots.length;
    slots.push({
      id: `floor:${floorIndex}:reward:${ordinal}`,
      floorIndex,
      kind,
      depthFraction,
      salt,
      catalogKey: `reward/v2:${source}:${kind}:${depthFraction.toFixed(3)}:${salt}`,
    });
  };
  addSlot("time-freeze", 0.28, 43, "power");
  addSlot("time-freeze", 0.72, 43, "power");
  addSlot("map", 0.18, 37, "power");
  addSlot("mobility", 0.54, 53, "power");
  addSlot("clarity", 0.36, 71, "power");
  addSlot("luminous-ward", 0.42, 61, "power");
  addSlot("luminous-ward", 0.88, 61, "power");
  addSlot(
    planOffensePowerKind(dungeon.seed),
    OFFENSE_POWER_DEPTH_FRACTION,
    OFFENSE_POWER_SALT,
    "offense",
  );
  for (const curse of planCurseChestPlacements(dungeon.seed, moodId)) {
    addSlot(curse.kind, curse.depthFraction, curse.salt, "curse");
  }

  const loot = planBiomeLootBudget(moodId, dungeon.seed, { phoenixArmed });
  for (const [index, kind] of loot.extraSupportChests.entries()) {
    addSlot(kind, 0.33 + index * 0.18, 131 + index * 17, "extra-support");
  }
  const addFreePickup = (
    kind: ResidentDungeonFreePickupPlan["kind"],
    source: ResidentDungeonFreePickupPlan["source"],
    ordinal: number,
  ): void => {
    const id = `floor:${floorIndex}:pickup:${source}:${ordinal}`;
    freePickups.push({
      id,
      floorIndex,
      kind,
      source,
      catalogKey: `pickup/v2:${source}:${kind}:${ordinal}`,
    });
  };
  if (loot.placePhoenix) addFreePickup("phoenix-egg", "phoenix", 0);
  for (let index = 0; index < loot.corridorFlasks; index += 1) {
    addFreePickup("resolve", "corridor-flask", index);
  }
  const roomFlasks = Math.max(0, loot.freeFlasks - loot.corridorFlasks);
  for (let index = 0; index < roomFlasks; index += 1) {
    addFreePickup("resolve", "room-flask", index);
  }
  for (const [index, kind] of loot.freePowers.entries()) {
    addFreePickup(kind, "free-power", index);
  }
  const healthDepths = spreadDepthFractions(loot.healthChests, 0.15, 0.75);
  return {
    slots: Object.freeze(slots),
    healthDepths: Object.freeze(healthDepths),
    healthChestIds: Object.freeze(
      healthDepths.map((_, index) => `floor:${floorIndex}:health-chest:${index}`),
    ),
    freePickups: Object.freeze(freePickups),
    freeFlasks: loot.freeFlasks,
    corridorFlasks: loot.corridorFlasks,
    freePowers: Object.freeze([...loot.freePowers]),
    placePhoenix: loot.placePhoenix,
  };
}

function copyStair(stair: DungeonStair, width: number): ResidentDungeonStairPlan {
  return {
    id: stair.id,
    shaftId: stair.shaftId,
    direction: stair.direction,
    targetFloor: stair.targetFloor,
    anchor: { ...stair.cell },
    yaw: stair.yaw,
    footprint: Uint32Array.from(stair.footprint.map((cell) => encodeCell(cell, width))),
    catalogKey: `staircase/v2:${stair.shaftId}:${stair.direction}`,
  };
}

function copyShaft(lowerFloor: number, stair: ResidentDungeonStairPlan): ResidentDungeonShaftPlan {
  return {
    shaftId: stair.shaftId,
    lowerFloor,
    upperFloor: stair.targetFloor,
    anchor: { ...stair.anchor },
    yaw: stair.yaw,
    footprint: new Uint32Array(stair.footprint),
  };
}

function copyRoom(dungeon: DungeonData, room: DungeonRoom): ResidentDungeonRoomPlan {
  return {
    id: room.id,
    x: room.x,
    y: room.y,
    width: room.width,
    height: room.height,
    center: { ...room.center },
    role: room.role,
    themeKey: roomTheme(dungeon, room),
    dressingSeed: `${dungeon.seed}:room-dressing`,
    lightSeed: `${dungeon.seed}:fire-props`,
    atmosphereSeed: `${dungeon.seed}:atmosphere`,
  };
}

function copyDoorway(
  doorway: NonNullable<DungeonData["topology"]>["doorways"][number],
): ResidentDungeonDoorwayPlan {
  return {
    edgeIndex: doorway.edgeIndex,
    roomId: doorway.roomId,
    connectedRoomId: doorway.connectedRoomId,
    cell: { ...doorway.cell },
    outside: { ...doorway.outside },
    outDx: doorway.outDx,
    outDy: doorway.outDy,
    catalogKey: `doorway/v2:edge:${doorway.edgeIndex}:room:${doorway.roomId}:connected:${doorway.connectedRoomId}`,
  };
}

function copyForgeProp(
  prop: DungeonForgeMetadata["props"][number],
  family: "prop" | "torch",
): ResidentDungeonForgePropPlan {
  const catalogKey = `${family}/v2:${prop.kind}:${prop.x}:${prop.y}:${prop.roomId ?? -1}:${prop.v ?? 0}`;
  return {
    kind: prop.kind,
    x: prop.x,
    y: prop.y,
    ...(prop.roomId === undefined ? {} : { roomId: prop.roomId }),
    ...(prop.rot === undefined ? {} : { rot: prop.rot }),
    ...(prop.scale === undefined ? {} : { scale: prop.scale }),
    ...(prop.v === undefined ? {} : { variant: prop.v }),
    ...(prop.dx === undefined ? {} : { dx: prop.dx }),
    ...(prop.dy === undefined ? {} : { dy: prop.dy }),
    ...(prop.ice === undefined ? {} : { ice: prop.ice }),
    catalogKey,
  };
}

function copyForgeTorch(
  torch: DungeonForgeMetadata["torches"][number],
): ResidentDungeonForgePropPlan {
  return {
    kind: "torch",
    x: torch.x,
    y: torch.y,
    dx: torch.dx,
    dy: torch.dy,
    catalogKey: `torch/v2:${torch.x}:${torch.y}:${torch.dx}:${torch.dy}`,
  };
}

function lightMode(dungeon: DungeonData, moodId?: string): ResidentDungeonLightPlan["mode"] {
  if (moodId === "backrooms") return "backrooms";
  if (dungeon.forge) return "forge";
  if (moodId) return "classic";
  return "unknown";
}

function copyObjective(
  placement: ReturnType<typeof selectMagicStonePlacements>[number],
): ResidentDungeonObjectivePlan {
  return {
    kind: "stone",
    stoneId: placement.stoneId,
    roomId: placement.room.id,
    cell: { ...placement.cell },
    offsetX: placement.offsetX,
    offsetZ: placement.offsetZ,
    catalogKey: `objective/v2:stone:${placement.stoneId}:room:${placement.room.id}`,
  };
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function appendTyped(values: Uint32Array, target: string[]): void {
  // Typed-array stringification already emits a comma-delimited deterministic
  // sequence; avoid allocating one JS string per cell while hashing large
  // 121×121 resident floors.
  target.push(values.toString());
}

function computePlanHash(
  plan: Pick<ResidentDungeonPlan, "version" | "rootSeed" | "floorCount" | "floors" | "shafts">,
): string {
  const hashParts: string[] = [plan.version, plan.rootSeed, String(plan.floorCount)];
  for (const floor of plan.floors) {
    hashParts.push(
      `${floor.floorIndex}:${floor.width}:${floor.height}:${floor.spawn.x},${floor.spawn.y}:${floor.exit.x},${floor.exit.y}:${floor.topologySignature}`,
    );
    appendTyped(floor.floorCells, hashParts);
    appendTyped(floor.boundaryWallCells, hashParts);
    appendTyped(floor.openVerticalCells, hashParts);
    hashParts.push(
      `rooms:${floor.rooms.length}:doorways:${floor.doorways.length}:forgeProps:${floor.forgeProps.length}:forgeTorches:${floor.forgeTorches.length}`,
      `roomWallArt:${floor.roomWallArt.length}`,
      `light:${floor.light.mode}:${floor.light.seed}:${floor.light.roomCount}:${floor.light.boundaryWallCount}`,
      `lightTargets:${floor.light.torchTarget}:${floor.light.floorFireTarget}:fixtures:${floor.light.fixtures.length}`,
      `atmosphere:${floor.atmosphere.seed}:${floor.atmosphere.ambientSeed}:${floor.atmosphere.roomCount}:${floor.atmosphere.floorCellCount}:${floor.atmosphere.boundaryWallCount}:${floor.atmosphere.profileKey}`,
      `portal:${floor.portal.required}:${floor.portal.cell.x},${floor.portal.cell.y}:${floor.portal.catalogKey}`,
      `rewards:${floor.rewards.slots.length}:${floor.rewards.healthDepths.length}:${floor.rewards.freeFlasks}:${floor.rewards.corridorFlasks}:${floor.rewards.placePhoenix}:${floor.rewards.freePowers.join(",")}`,
      `healthIds:${floor.rewards.healthChestIds.join(",")}:freePickups:${floor.rewards.freePickups.length}`,
    );
    for (const fixture of floor.light.fixtures) {
      hashParts.push(
        `fixture:${fixture.catalogKey}:${fixture.kind}:${fixture.cell.x},${fixture.cell.y}:${fixture.wall?.x ?? ""},${fixture.wall?.y ?? ""}:${fixture.floor?.x ?? ""},${fixture.floor?.y ?? ""}:${fixture.roomId ?? -1}:${fixture.offsetX ?? 0}:${fixture.offsetZ ?? 0}:${fixture.phase}`,
      );
    }
    for (const room of floor.rooms) {
      hashParts.push(
        `room:${room.id}:${room.x},${room.y}:${room.width}x${room.height}:${room.center.x},${room.center.y}:${room.role}:${room.themeKey}:${room.dressingSeed}:${room.lightSeed}:${room.atmosphereSeed}`,
      );
    }
    for (const doorway of floor.doorways) {
      hashParts.push(
        `doorway:${doorway.catalogKey}:${doorway.cell.x},${doorway.cell.y}:${doorway.outside.x},${doorway.outside.y}:${doorway.outDx},${doorway.outDy}`,
      );
    }
    for (const art of floor.roomWallArt) {
      hashParts.push(
        `roomWallArt:${art.catalogKey}:${art.roomId}:${art.mapIndex}:${art.wall.x},${art.wall.y}:${art.angle}`,
      );
    }
    for (const prop of [...floor.forgeProps, ...floor.forgeTorches]) {
      hashParts.push(
        `forge:${prop.catalogKey}:${prop.kind}:${prop.x},${prop.y}:${prop.roomId ?? -1}:${prop.rot ?? 0}:${prop.scale ?? 0}:${prop.variant ?? 0}:${prop.dx ?? 0},${prop.dy ?? 0}:${prop.ice ?? false}`,
      );
    }
    for (const objective of floor.objectives) {
      hashParts.push(
        `objective:${objective.catalogKey}:${objective.stoneId}:${objective.roomId}:${objective.cell.x},${objective.cell.y}:${objective.offsetX}:${objective.offsetZ}`,
      );
    }
    for (const reward of floor.rewards.slots) {
      hashParts.push(
        `reward:${reward.id}:${reward.floorIndex}:${reward.catalogKey}:${reward.kind}:${reward.depthFraction}:${reward.salt}`,
      );
    }
    hashParts.push(floor.rewards.healthDepths.join(","));
    for (const pickup of floor.rewards.freePickups) {
      hashParts.push(
        `pickup:${pickup.id}:${pickup.floorIndex}:${pickup.catalogKey}:${pickup.kind}:${pickup.source}`,
      );
    }
    for (const stair of floor.stairs) {
      hashParts.push(
        `${stair.id}:${stair.shaftId}:${stair.direction}:${stair.targetFloor}:${stair.anchor.x},${stair.anchor.y}:${stair.yaw.toFixed(6)}`,
      );
      appendTyped(stair.footprint, hashParts);
    }
  }
  for (const shaft of plan.shafts) {
    const lower = plan.floors[shaft.lowerFloor];
    const upper = plan.floors[shaft.upperFloor];
    const lowerStair = lower?.stairs.find(
      (stair) => stair.shaftId === shaft.shaftId && stair.direction === "up",
    );
    const upperStair = upper?.stairs.find(
      (stair) => stair.shaftId === shaft.shaftId && stair.direction === "down",
    );
    if (!lowerStair || !upperStair) {
      throw new Error(`ResidentDungeonPlan shaft ${shaft.shaftId} is not walkable on both floors.`);
    }
    if (
      upperStair.targetFloor !== shaft.lowerFloor ||
      lowerStair.targetFloor !== shaft.upperFloor ||
      upperStair.footprint.length !== shaft.footprint.length ||
      upperStair.footprint.some((cell, index) => cell !== shaft.footprint[index])
    ) {
      throw new Error(`ResidentDungeonPlan shaft ${shaft.shaftId} lost aligned stair metadata.`);
    }
    hashParts.push(
      `${shaft.shaftId}:${shaft.lowerFloor}:${shaft.upperFloor}:${shaft.anchor.x},${shaft.anchor.y}:${shaft.yaw.toFixed(6)}`,
    );
    appendTyped(shaft.footprint, hashParts);
  }
  return fnv1a32(hashParts.join("|"));
}

/**
 * Build a serializable architecture/stair plan for an already generated
 * resident stack. It copies only scalar metadata and typed cell indices; no
 * Three.js resource, scene node, material, or geometry can enter this object.
 */
export function createResidentDungeonPlan(
  floors: readonly DungeonData[],
  rootSeed = floors[0]?.floor?.rootSeed ?? floors[0]?.seed ?? "BLACK-FLAG",
  options: ResidentDungeonPlanOptions = {},
): ResidentDungeonPlan {
  if (floors.length === 0) throw new Error("ResidentDungeonPlan requires at least one floor.");
  const expectedCount = floors.length;
  const normalizedRootSeed = rootSeed.trim() || "BLACK-FLAG";
  const plans: ResidentDungeonFloorPlan[] = [];
  const shafts: ResidentDungeonShaftPlan[] = [];
  const shaftIds = new Set<string>();

  floors.forEach((dungeon, position) => {
    const floorIndex = dungeon.floor?.index ?? position;
    if (floors.length > 1 && floorIndex !== position) {
      throw new Error(`ResidentDungeonPlan requires contiguous floor index ${position}.`);
    }
    if (floors.length > 1 && dungeon.floor && dungeon.floor.count !== expectedCount) {
      throw new Error(`ResidentDungeonPlan floor ${floorIndex} declares ${dungeon.floor.count}.`);
    }
    const stairs = (dungeon.floor?.stairs ?? []).map((stair) => copyStair(stair, dungeon.width));
    for (const stair of stairs) {
      if (floors.length === 1 || stair.direction !== "up") continue;
      if (shaftIds.has(stair.shaftId)) {
        throw new Error(`ResidentDungeonPlan duplicated shaft ${stair.shaftId}.`);
      }
      shaftIds.add(stair.shaftId);
      shafts.push(copyShaft(floorIndex, stair));
    }
    const floorCells = collectCells(dungeon, (x, y) => cellIsFloor(dungeon, x, y));
    const boundaryCells = boundaryWallCells(dungeon);
    const openVerticalCells = Uint32Array.from(
      (dungeon.floor?.openVerticalCells ?? []).map((cell) => encodeCell(cell, dungeon.width)),
    );
    const rooms = dungeon.rooms.map((room) => copyRoom(dungeon, room));
    const doorways = (dungeon.topology?.doorways ?? []).map(copyDoorway);
    const roomWallArt: readonly ResidentDungeonRoomWallArtPlan[] = dungeon.forge
      ? Object.freeze([])
      : planRoomWallArt(dungeon);
    const forgeProps = (dungeon.forge?.props ?? []).map((prop) => copyForgeProp(prop, "prop"));
    const forgeTorches = (dungeon.forge?.torches ?? []).map(copyForgeTorch);
    const objectivePlacements = selectMagicStonePlacements(dungeon).map(copyObjective);
    const portal = {
      required: hasValidPortalPlacementContract(dungeon),
      cell: { ...dungeon.exit },
      catalogKey: `portal/v2:exit:${dungeon.exit.x}:${dungeon.exit.y}`,
    } satisfies ResidentDungeonPortalPlan;
    const rewards = planRewards(dungeon, floorIndex, options.moodId, options.phoenixArmed === true);
    const plannedLights = planLightFixtures(
      dungeon,
      lightMode(dungeon, options.moodId),
      boundaryCells,
      options.decorDensity ?? 0.6,
    );
    const light = {
      mode: lightMode(dungeon, options.moodId),
      seed: `${dungeon.seed}:fire-props`,
      roomCount: dungeon.rooms.length,
      boundaryWallCount: boundaryCells.length,
      fixtures: plannedLights.fixtures,
      torchTarget: plannedLights.torchTarget,
      floorFireTarget: plannedLights.floorFireTarget,
    } satisfies ResidentDungeonLightPlan;
    const atmosphere = {
      seed: `${dungeon.seed}:atmosphere`,
      ambientSeed: `${dungeon.seed}:ambient-godrays`,
      roomCount: dungeon.rooms.length,
      floorCellCount: floorCells.length,
      boundaryWallCount: boundaryCells.length,
      profileKey: options.moodId ?? "runtime",
    } satisfies ResidentDungeonAtmospherePlan;
    plans.push({
      floorIndex,
      width: dungeon.width,
      height: dungeon.height,
      spawn: { ...dungeon.spawn },
      exit: { ...dungeon.exit },
      topologySignature: dungeon.topologySignature,
      floorCells,
      boundaryWallCells: boundaryCells,
      openVerticalCells,
      stairs,
      rooms: Object.freeze(rooms),
      doorways: Object.freeze(doorways),
      roomWallArt,
      forgeProps: Object.freeze(forgeProps),
      forgeTorches: Object.freeze(forgeTorches),
      light,
      atmosphere,
      objectives: Object.freeze(objectivePlacements),
      portal,
      rewards,
      catalogKeys: Object.freeze([
        `surface/v2:floor:${dungeon.width}x${dungeon.height}`,
        `surface/v2:wall:${dungeon.width}x${dungeon.height}`,
        ...stairs.map((stair) => stair.catalogKey),
        ...roomWallArt.map((art) => art.catalogKey),
      ]),
    });
  });

  const plan = {
    version: RESIDENT_DUNGEON_PLAN_VERSION,
    rootSeed: normalizedRootSeed,
    floorCount: expectedCount,
    floors: Object.freeze(plans),
    shafts: Object.freeze(shafts),
  } satisfies Omit<ResidentDungeonPlan, "hash">;
  return Object.freeze({ ...plan, hash: computePlanHash(plan) });
}

/** JSON-safe copy for worker/adapter boundaries without Three.js values. */
export function serializeResidentDungeonPlan(plan: ResidentDungeonPlan): string {
  return JSON.stringify({
    ...plan,
    floors: plan.floors.map((floor) => ({
      ...floor,
      floorCells: Array.from(floor.floorCells),
      boundaryWallCells: Array.from(floor.boundaryWallCells),
      openVerticalCells: Array.from(floor.openVerticalCells),
      stairs: floor.stairs.map((stair) => ({ ...stair, footprint: Array.from(stair.footprint) })),
    })),
    shafts: plan.shafts.map((shaft) => ({ ...shaft, footprint: Array.from(shaft.footprint) })),
  });
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`ResidentDungeonPlan ${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`ResidentDungeonPlan ${label} must be an array.`);
  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`ResidentDungeonPlan ${label} must be a string.`);
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`ResidentDungeonPlan ${label} must be finite.`);
  }
  return value;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`ResidentDungeonPlan ${label} must be boolean.`);
  return value;
}

function asCell(value: unknown, label: string): GridCell {
  const record = asRecord(value, label);
  return { x: asNumber(record.x, `${label}.x`), y: asNumber(record.y, `${label}.y`) };
}

function asTypedCells(value: unknown, label: string): Uint32Array {
  const values = asArray(value, label).map((entry, index) => {
    const number = asNumber(entry, `${label}[${index}]`);
    if (!Number.isInteger(number) || number < 0) {
      throw new Error(`ResidentDungeonPlan ${label}[${index}] must be a non-negative integer.`);
    }
    return number;
  });
  return Uint32Array.from(values);
}

/** Reconstruct a plan at a Worker/adapter boundary and reject tampered hashes. */
export function deserializeResidentDungeonPlan(serialized: string): ResidentDungeonPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("ResidentDungeonPlan payload is not valid JSON.");
  }
  const root = asRecord(parsed, "root");
  if (root.version !== RESIDENT_DUNGEON_PLAN_VERSION) {
    throw new Error("ResidentDungeonPlan payload version is unsupported.");
  }
  const floorValues = asArray(root.floors, "floors");
  const shaftValues = asArray(root.shafts, "shafts");
  const floors = floorValues.map((entry, floorIndex) => {
    const value = asRecord(entry, `floors[${floorIndex}]`);
    const stairs = asArray(value.stairs, `floors[${floorIndex}].stairs`).map((entry, index) => {
      const stair = asRecord(entry, `floors[${floorIndex}].stairs[${index}]`);
      return {
        id: asString(stair.id, "stair.id"),
        shaftId: asString(stair.shaftId, "stair.shaftId"),
        direction: asString(stair.direction, "stair.direction") as "up" | "down",
        targetFloor: asNumber(stair.targetFloor, "stair.targetFloor"),
        anchor: asCell(stair.anchor, "stair.anchor"),
        yaw: asNumber(stair.yaw, "stair.yaw"),
        footprint: asTypedCells(stair.footprint, "stair.footprint"),
        catalogKey: asString(stair.catalogKey, "stair.catalogKey"),
      } satisfies ResidentDungeonStairPlan;
    });
    const rooms = asArray(value.rooms, `floors[${floorIndex}].rooms`).map((entry, index) => {
      const room = asRecord(entry, `floors[${floorIndex}].rooms[${index}]`);
      return {
        id: asNumber(room.id, "room.id"),
        x: asNumber(room.x, "room.x"),
        y: asNumber(room.y, "room.y"),
        width: asNumber(room.width, "room.width"),
        height: asNumber(room.height, "room.height"),
        center: asCell(room.center, "room.center"),
        role: asString(room.role, "room.role") as DungeonRoom["role"],
        themeKey: asString(room.themeKey, "room.themeKey"),
        dressingSeed: asString(room.dressingSeed, "room.dressingSeed"),
        lightSeed: asString(room.lightSeed, "room.lightSeed"),
        atmosphereSeed: asString(room.atmosphereSeed, "room.atmosphereSeed"),
      } satisfies ResidentDungeonRoomPlan;
    });
    const doorways = asArray(value.doorways, `floors[${floorIndex}].doorways`).map(
      (entry, index) => {
        const doorway = asRecord(entry, `floors[${floorIndex}].doorways[${index}]`);
        return {
          edgeIndex: asNumber(doorway.edgeIndex, "doorway.edgeIndex"),
          roomId: asNumber(doorway.roomId, "doorway.roomId"),
          connectedRoomId: asNumber(doorway.connectedRoomId, "doorway.connectedRoomId"),
          cell: asCell(doorway.cell, "doorway.cell"),
          outside: asCell(doorway.outside, "doorway.outside"),
          outDx: asNumber(doorway.outDx, "doorway.outDx") as -1 | 0 | 1,
          outDy: asNumber(doorway.outDy, "doorway.outDy") as -1 | 0 | 1,
          catalogKey: asString(doorway.catalogKey, "doorway.catalogKey"),
        } satisfies ResidentDungeonDoorwayPlan;
      },
    );
    const roomWallArt = asArray(value.roomWallArt, `floors[${floorIndex}].roomWallArt`).map(
      (entry, index) => {
        const art = asRecord(entry, `floors[${floorIndex}].roomWallArt[${index}]`);
        return {
          roomId: asNumber(art.roomId, "roomWallArt.roomId"),
          mapIndex: asNumber(art.mapIndex, "roomWallArt.mapIndex"),
          wall: asCell(art.wall, "roomWallArt.wall"),
          angle: asNumber(art.angle, "roomWallArt.angle"),
          catalogKey: asString(art.catalogKey, "roomWallArt.catalogKey"),
        } satisfies ResidentDungeonRoomWallArtPlan;
      },
    );
    const forgeProp = (entry: unknown, label: string): ResidentDungeonForgePropPlan => {
      const prop = asRecord(entry, label);
      return {
        kind: asString(prop.kind, `${label}.kind`),
        x: asNumber(prop.x, `${label}.x`),
        y: asNumber(prop.y, `${label}.y`),
        ...(prop.roomId === undefined ? {} : { roomId: asNumber(prop.roomId, `${label}.roomId`) }),
        ...(prop.rot === undefined ? {} : { rot: asNumber(prop.rot, `${label}.rot`) }),
        ...(prop.scale === undefined ? {} : { scale: asNumber(prop.scale, `${label}.scale`) }),
        ...(prop.variant === undefined
          ? {}
          : { variant: asNumber(prop.variant, `${label}.variant`) }),
        ...(prop.dx === undefined ? {} : { dx: asNumber(prop.dx, `${label}.dx`) }),
        ...(prop.dy === undefined ? {} : { dy: asNumber(prop.dy, `${label}.dy`) }),
        ...(prop.ice === undefined ? {} : { ice: asBoolean(prop.ice, `${label}.ice`) }),
        catalogKey: asString(prop.catalogKey, `${label}.catalogKey`),
      };
    };
    const objectives = asArray(value.objectives, `floors[${floorIndex}].objectives`).map(
      (entry, index) => {
        const objective = asRecord(entry, `floors[${floorIndex}].objectives[${index}]`);
        return {
          kind: "stone",
          stoneId: asString(objective.stoneId, "objective.stoneId") as StoneId,
          roomId: asNumber(objective.roomId, "objective.roomId"),
          cell: asCell(objective.cell, "objective.cell"),
          offsetX: asNumber(objective.offsetX, "objective.offsetX"),
          offsetZ: asNumber(objective.offsetZ, "objective.offsetZ"),
          catalogKey: asString(objective.catalogKey, "objective.catalogKey"),
        } satisfies ResidentDungeonObjectivePlan;
      },
    );
    const light = asRecord(value.light, `floors[${floorIndex}].light`);
    const fixtures: ResidentDungeonLightFixturePlan[] = asArray(
      light.fixtures,
      `floors[${floorIndex}].light.fixtures`,
    ).map((entry, index) => {
      const fixture = asRecord(entry, `floors[${floorIndex}].light.fixtures[${index}]`);
      const kind = asString(fixture.kind, "light.fixture.kind");
      if (
        kind !== "classic-torch" &&
        kind !== "classic-campfire" &&
        kind !== "classic-brazier" &&
        kind !== "backrooms"
      ) {
        throw new Error(`ResidentDungeonPlan light fixture kind ${kind} is unsupported.`);
      }
      return {
        kind: kind as ResidentDungeonLightFixturePlan["kind"],
        cell: asCell(fixture.cell, "light.fixture.cell"),
        ...(fixture.wall === undefined ? {} : { wall: asCell(fixture.wall, "light.fixture.wall") }),
        ...(fixture.floor === undefined
          ? {}
          : { floor: asCell(fixture.floor, "light.fixture.floor") }),
        ...(fixture.roomId === undefined
          ? {}
          : { roomId: asNumber(fixture.roomId, "light.fixture.roomId") }),
        ...(fixture.offsetX === undefined
          ? {}
          : { offsetX: asNumber(fixture.offsetX, "light.fixture.offsetX") }),
        ...(fixture.offsetZ === undefined
          ? {}
          : { offsetZ: asNumber(fixture.offsetZ, "light.fixture.offsetZ") }),
        phase: asNumber(fixture.phase, "light.fixture.phase"),
        catalogKey: asString(fixture.catalogKey, "light.fixture.catalogKey"),
      };
    });
    const atmosphere = asRecord(value.atmosphere, `floors[${floorIndex}].atmosphere`);
    const portal = asRecord(value.portal, `floors[${floorIndex}].portal`);
    const rewards = asRecord(value.rewards, `floors[${floorIndex}].rewards`);
    const rewardSlots: ResidentDungeonRewardSlotPlan[] = asArray(
      rewards.slots,
      `floors[${floorIndex}].rewards.slots`,
    ).map((entry, index) => {
      const slot = asRecord(entry, `rewards.slots[${index}]`);
      const kind = asString(slot.kind, `rewards.slots[${index}].kind`);
      const allowedKinds = [
        "time-freeze",
        "luminous-ward",
        "annihilation-pulse",
        "cull-brand",
        "shotgun",
        "map",
        "mobility",
        "clarity",
        "swarm-curse",
        "slow-curse",
        "frenzy-curse",
        "gloom-curse",
        "mirror-curse",
        "spin-curse",
      ] as const;
      if (!(allowedKinds as readonly string[]).includes(kind)) {
        throw new Error(`ResidentDungeonPlan reward kind ${kind} is not a slot reward.`);
      }
      return {
        id: asString(slot.id, `rewards.slots[${index}].id`),
        floorIndex: asNumber(slot.floorIndex, `rewards.slots[${index}].floorIndex`),
        kind: kind as ResidentDungeonRewardSlotPlan["kind"],
        depthFraction: asNumber(slot.depthFraction, `rewards.slots[${index}].depthFraction`),
        salt: asNumber(slot.salt, `rewards.slots[${index}].salt`),
        catalogKey: asString(slot.catalogKey, `rewards.slots[${index}].catalogKey`),
      };
    });
    const freePickups: ResidentDungeonFreePickupPlan[] = asArray(
      rewards.freePickups,
      `floors[${floorIndex}].rewards.freePickups`,
    ).map((entry, index) => {
      const pickup = asRecord(entry, `rewards.freePickups[${index}]`);
      const kind = asString(pickup.kind, `rewards.freePickups[${index}].kind`);
      const allowedKinds = [
        "resolve",
        "time-freeze",
        "luminous-ward",
        "annihilation-pulse",
        "cull-brand",
        "shotgun",
        "phoenix-egg",
        "map",
        "mobility",
        "clarity",
      ] as const;
      if (!(allowedKinds as readonly string[]).includes(kind)) {
        throw new Error(`ResidentDungeonPlan free pickup kind ${kind} is unsupported.`);
      }
      const source = asString(pickup.source, `rewards.freePickups[${index}].source`);
      if (
        !("phoenix corridor-flask room-flask free-power".split(" ") as readonly string[]).includes(
          source,
        )
      ) {
        throw new Error(`ResidentDungeonPlan free pickup source ${source} is unsupported.`);
      }
      return {
        id: asString(pickup.id, `rewards.freePickups[${index}].id`),
        floorIndex: asNumber(pickup.floorIndex, `rewards.freePickups[${index}].floorIndex`),
        kind: kind as ResidentDungeonFreePickupPlan["kind"],
        source: source as ResidentDungeonFreePickupPlan["source"],
        catalogKey: asString(pickup.catalogKey, `rewards.freePickups[${index}].catalogKey`),
      };
    });
    return {
      floorIndex: asNumber(value.floorIndex, "floorIndex"),
      width: asNumber(value.width, "width"),
      height: asNumber(value.height, "height"),
      spawn: asCell(value.spawn, "spawn"),
      exit: asCell(value.exit, "exit"),
      topologySignature: asString(value.topologySignature, "topologySignature"),
      floorCells: asTypedCells(value.floorCells, "floorCells"),
      boundaryWallCells: asTypedCells(value.boundaryWallCells, "boundaryWallCells"),
      openVerticalCells: asTypedCells(value.openVerticalCells, "openVerticalCells"),
      stairs: Object.freeze(stairs),
      rooms: Object.freeze(rooms),
      doorways: Object.freeze(doorways),
      roomWallArt: Object.freeze(roomWallArt),
      forgeProps: Object.freeze(
        asArray(value.forgeProps, `floors[${floorIndex}].forgeProps`).map((entry, index) =>
          forgeProp(entry, `forgeProps[${index}]`),
        ),
      ),
      forgeTorches: Object.freeze(
        asArray(value.forgeTorches, `floors[${floorIndex}].forgeTorches`).map((entry, index) =>
          forgeProp(entry, `forgeTorches[${index}]`),
        ),
      ),
      light: {
        mode: (() => {
          const mode = asString(light.mode, "light.mode");
          if (!(["classic", "forge", "backrooms", "unknown"] as readonly string[]).includes(mode)) {
            throw new Error(`ResidentDungeonPlan light mode ${mode} is unsupported.`);
          }
          return mode as ResidentDungeonLightPlan["mode"];
        })(),
        seed: asString(light.seed, "light.seed"),
        roomCount: asNumber(light.roomCount, "light.roomCount"),
        boundaryWallCount: asNumber(light.boundaryWallCount, "light.boundaryWallCount"),
        fixtures: Object.freeze(fixtures),
        torchTarget: asNumber(light.torchTarget, "light.torchTarget"),
        floorFireTarget: asNumber(light.floorFireTarget, "light.floorFireTarget"),
      },
      atmosphere: {
        seed: asString(atmosphere.seed, "atmosphere.seed"),
        ambientSeed: asString(atmosphere.ambientSeed, "atmosphere.ambientSeed"),
        roomCount: asNumber(atmosphere.roomCount, "atmosphere.roomCount"),
        floorCellCount: asNumber(atmosphere.floorCellCount, "atmosphere.floorCellCount"),
        boundaryWallCount: asNumber(atmosphere.boundaryWallCount, "atmosphere.boundaryWallCount"),
        profileKey: asString(atmosphere.profileKey, "atmosphere.profileKey"),
      },
      objectives: Object.freeze(objectives),
      portal: {
        required: asBoolean(portal.required, "portal.required"),
        cell: asCell(portal.cell, "portal.cell"),
        catalogKey: asString(portal.catalogKey, "portal.catalogKey"),
      },
      rewards: {
        slots: Object.freeze(rewardSlots),
        healthDepths: Object.freeze(
          asArray(rewards.healthDepths, `rewards.healthDepths`).map((entry, index) =>
            asNumber(entry, `rewards.healthDepths[${index}]`),
          ),
        ),
        healthChestIds: Object.freeze(
          asArray(rewards.healthChestIds, `rewards.healthChestIds`).map((entry, index) =>
            asString(entry, `rewards.healthChestIds[${index}]`),
          ),
        ),
        freePickups: Object.freeze(freePickups),
        freeFlasks: asNumber(rewards.freeFlasks, "rewards.freeFlasks"),
        corridorFlasks: asNumber(rewards.corridorFlasks, "rewards.corridorFlasks"),
        freePowers: Object.freeze(
          asArray(rewards.freePowers, `rewards.freePowers`).map(
            (entry, index) => asString(entry, `rewards.freePowers[${index}]`) as FloorFreePowerKind,
          ),
        ),
        placePhoenix: asBoolean(rewards.placePhoenix, "rewards.placePhoenix"),
      },
      catalogKeys: Object.freeze(
        asArray(value.catalogKeys, `floors[${floorIndex}].catalogKeys`).map((entry, index) =>
          asString(entry, `catalogKeys[${index}]`),
        ),
      ),
    } satisfies ResidentDungeonFloorPlan;
  });
  const shafts = shaftValues.map((entry, index) => {
    const shaft = asRecord(entry, `shafts[${index}]`);
    return {
      shaftId: asString(shaft.shaftId, "shaft.shaftId"),
      lowerFloor: asNumber(shaft.lowerFloor, "shaft.lowerFloor"),
      upperFloor: asNumber(shaft.upperFloor, "shaft.upperFloor"),
      anchor: asCell(shaft.anchor, "shaft.anchor"),
      yaw: asNumber(shaft.yaw, "shaft.yaw"),
      footprint: asTypedCells(shaft.footprint, "shaft.footprint"),
    } satisfies ResidentDungeonShaftPlan;
  });
  const plan = {
    version: RESIDENT_DUNGEON_PLAN_VERSION,
    rootSeed: asString(root.rootSeed, "rootSeed"),
    floorCount: asNumber(root.floorCount, "floorCount"),
    floors: Object.freeze(floors),
    shafts: Object.freeze(shafts),
  } satisfies Omit<ResidentDungeonPlan, "hash">;
  if (plan.floorCount !== floors.length)
    throw new Error("ResidentDungeonPlan floor count changed.");
  const hash = asString(root.hash, "hash");
  if (hash !== computePlanHash(plan)) throw new Error("ResidentDungeonPlan hash mismatch.");
  return Object.freeze({ ...plan, hash });
}
