import { isFloorCell, WALL } from "../dungeon/generateDungeon";
import type { DungeonData, GridCell } from "../dungeon/types";
import { roomTheme } from "./RoomArtDirection";
import { hasValidPortalPlacementContract, selectMagicStonePlacements } from "./MagicStonePlacement";
import type {
  ResidentDungeonFloorPlan,
  ResidentDungeonPlan,
  ResidentDungeonStairPlan,
} from "./ResidentDungeonPlan";

export interface ResidentDungeonRenderFloorReceipt {
  readonly floorIndex: number;
  readonly floorCells: number;
  readonly boundaryWallCells: number;
  readonly openVerticalCells: number;
  readonly stairs: number;
  readonly rooms: number;
  readonly doorways: number;
  readonly forgeProps: number;
  readonly forgeTorches: number;
  readonly lightFixtures: number;
  readonly rewardSlots: number;
  readonly objectives: number;
  readonly portalRequired: boolean;
}

export interface ResidentDungeonRenderReceipt {
  readonly planHash: string;
  readonly floors: readonly ResidentDungeonRenderFloorReceipt[];
  readonly stairIds: readonly string[];
  readonly shaftCount: number;
}

function sameCell(left: GridCell, right: GridCell): boolean {
  return left.x === right.x && left.y === right.y;
}

function encodeCell(cell: GridCell, width: number): number {
  return cell.y * width + cell.x;
}

function assertEncodedCells(
  label: string,
  expected: Uint32Array,
  actual: readonly GridCell[],
  width: number,
  floorIndex: number,
): void {
  if (expected.length !== actual.length) {
    throw new Error(`ResidentDungeonRenderer floor ${floorIndex} ${label} cardinality changed.`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] !== encodeCell(actual[index]!, width)) {
      throw new Error(`ResidentDungeonRenderer floor ${floorIndex} ${label} changed.`);
    }
  }
}

function collectBoundaryWallCells(dungeon: DungeonData): GridCell[] {
  const cells: GridCell[] = [];
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      if (isFloorCell(dungeon, x, y)) continue;
      if (
        isFloorCell(dungeon, x - 1, y) ||
        isFloorCell(dungeon, x + 1, y) ||
        isFloorCell(dungeon, x, y - 1) ||
        isFloorCell(dungeon, x, y + 1)
      ) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function collectFloorCells(dungeon: DungeonData): GridCell[] {
  const cells: GridCell[] = [];
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      if (isFloorCell(dungeon, x, y)) cells.push({ x, y });
    }
  }
  return cells;
}

function assertPresentationMatchesPlan(
  dungeon: DungeonData,
  floor: ResidentDungeonFloorPlan,
): void {
  if (floor.rooms.length !== dungeon.rooms.length) {
    throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} room count changed.`);
  }
  for (let index = 0; index < floor.rooms.length; index += 1) {
    const expected = floor.rooms[index]!;
    const actual = dungeon.rooms[index]!;
    if (
      expected.id !== actual.id ||
      expected.x !== actual.x ||
      expected.y !== actual.y ||
      expected.width !== actual.width ||
      expected.height !== actual.height ||
      expected.center.x !== actual.center.x ||
      expected.center.y !== actual.center.y ||
      expected.role !== actual.role ||
      expected.themeKey !== roomTheme(dungeon, actual) ||
      expected.dressingSeed !== `${dungeon.seed}:room-dressing` ||
      expected.lightSeed !== `${dungeon.seed}:fire-props` ||
      expected.atmosphereSeed !== `${dungeon.seed}:atmosphere`
    ) {
      throw new Error(
        `ResidentDungeonRenderer floor ${floor.floorIndex} room ${actual.id} changed.`,
      );
    }
  }

  const sourceDoorways = dungeon.topology?.doorways ?? [];
  if (floor.doorways.length !== sourceDoorways.length) {
    throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} doorway count changed.`);
  }
  for (let index = 0; index < floor.doorways.length; index += 1) {
    const expected = floor.doorways[index]!;
    const actual = sourceDoorways[index]!;
    if (
      expected.edgeIndex !== actual.edgeIndex ||
      expected.roomId !== actual.roomId ||
      expected.connectedRoomId !== actual.connectedRoomId ||
      !sameCell(expected.cell, actual.cell) ||
      !sameCell(expected.outside, actual.outside) ||
      expected.outDx !== actual.outDx ||
      expected.outDy !== actual.outDy
    ) {
      throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} doorway changed.`);
    }
  }

  const sourceProps = dungeon.forge?.props ?? [];
  if (floor.forgeProps.length !== sourceProps.length) {
    throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} Forge prop count changed.`);
  }
  for (let index = 0; index < floor.forgeProps.length; index += 1) {
    const expected = floor.forgeProps[index]!;
    const actual = sourceProps[index]!;
    if (
      expected.kind !== actual.kind ||
      expected.x !== actual.x ||
      expected.y !== actual.y ||
      expected.roomId !== actual.roomId ||
      expected.rot !== actual.rot ||
      expected.scale !== actual.scale ||
      expected.variant !== actual.v ||
      expected.dx !== actual.dx ||
      expected.dy !== actual.dy ||
      expected.ice !== actual.ice
    ) {
      throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} Forge prop changed.`);
    }
  }
  const sourceTorches = dungeon.forge?.torches ?? [];
  if (floor.forgeTorches.length !== sourceTorches.length) {
    throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} Forge torch count changed.`);
  }
  for (let index = 0; index < floor.forgeTorches.length; index += 1) {
    const expected = floor.forgeTorches[index]!;
    const actual = sourceTorches[index]!;
    if (
      expected.x !== actual.x ||
      expected.y !== actual.y ||
      expected.dx !== actual.dx ||
      expected.dy !== actual.dy
    ) {
      throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} Forge torch changed.`);
    }
  }

  if (
    floor.light.seed !== `${dungeon.seed}:fire-props` ||
    floor.light.roomCount !== dungeon.rooms.length ||
    floor.atmosphere.seed !== `${dungeon.seed}:atmosphere` ||
    floor.atmosphere.ambientSeed !== `${dungeon.seed}:ambient-godrays` ||
    floor.atmosphere.roomCount !== dungeon.rooms.length ||
    floor.atmosphere.floorCellCount !== floor.floorCells.length
  ) {
    throw new Error(
      `ResidentDungeonRenderer floor ${floor.floorIndex} presentation inputs changed.`,
    );
  }
  for (const fixture of floor.light.fixtures) {
    if (!fixture.catalogKey || !Number.isFinite(fixture.phase)) {
      throw new Error(
        `ResidentDungeonRenderer floor ${floor.floorIndex} light fixture metadata changed.`,
      );
    }
    if (fixture.kind === "backrooms") {
      if (!isFloorCell(dungeon, fixture.cell.x, fixture.cell.y)) {
        throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} light anchor changed.`);
      }
      continue;
    }
    if (fixture.kind === "classic-torch") {
      if (
        !fixture.wall ||
        !fixture.floor ||
        isFloorCell(dungeon, fixture.wall.x, fixture.wall.y) ||
        !isFloorCell(dungeon, fixture.floor.x, fixture.floor.y)
      ) {
        throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} torch fixture changed.`);
      }
      continue;
    }
    const room = dungeon.rooms.find((candidate) => candidate.id === fixture.roomId);
    if (!room || room.center.x !== fixture.cell.x || room.center.y !== fixture.cell.y) {
      throw new Error(
        `ResidentDungeonRenderer floor ${floor.floorIndex} floor light room changed.`,
      );
    }
  }
  if (
    floor.rewards.slots.length < 8 ||
    floor.rewards.healthDepths.some((depth) => !Number.isFinite(depth)) ||
    floor.rewards.healthDepths.length !== floor.rewards.healthChestIds.length
  ) {
    throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} reward plan changed.`);
  }
  const rewardKeys = new Set<string>();
  const itemIds = new Set<string>();
  for (const reward of floor.rewards.slots) {
    if (
      !reward.id ||
      itemIds.has(reward.id) ||
      reward.floorIndex !== floor.floorIndex ||
      !reward.catalogKey ||
      rewardKeys.has(reward.catalogKey) ||
      !Number.isFinite(reward.depthFraction) ||
      !Number.isFinite(reward.salt)
    ) {
      throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} reward slot changed.`);
    }
    itemIds.add(reward.id);
    rewardKeys.add(reward.catalogKey);
  }
  const pickupIds = new Set<string>();
  for (const pickup of floor.rewards.freePickups) {
    if (
      !pickup.id ||
      pickupIds.has(pickup.id) ||
      itemIds.has(pickup.id) ||
      pickup.floorIndex !== floor.floorIndex ||
      !pickup.catalogKey
    ) {
      throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} free pickup changed.`);
    }
    pickupIds.add(pickup.id);
    itemIds.add(pickup.id);
  }
  if (
    new Set(floor.rewards.healthChestIds).size !== floor.rewards.healthChestIds.length ||
    floor.rewards.healthChestIds.some((id) => !id || itemIds.has(id))
  ) {
    throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} health reward IDs changed.`);
  }
  floor.rewards.healthChestIds.forEach((id) => itemIds.add(id));
  const expectedWallArtRooms = dungeon.forge
    ? []
    : dungeon.rooms.filter((room) => {
        if (room.role === "entrance" || room.width < 5 || room.height < 5 || room.id % 2 !== 0) {
          return false;
        }
        return (
          dungeon.grid[room.y - 1]?.[room.center.x] === WALL ||
          dungeon.grid[room.y + room.height]?.[room.center.x] === WALL ||
          dungeon.grid[room.center.y]?.[room.x - 1] === WALL
        );
      });
  if (floor.roomWallArt.length !== expectedWallArtRooms.length) {
    throw new Error(
      `ResidentDungeonRenderer floor ${floor.floorIndex} room wall art count changed.`,
    );
  }
  for (const art of floor.roomWallArt) {
    const room = dungeon.rooms.find((candidate) => candidate.id === art.roomId);
    if (
      !room ||
      art.mapIndex !== Math.abs(room.id) % 4 ||
      dungeon.grid[art.wall.y]?.[art.wall.x] !== WALL ||
      !Number.isFinite(art.angle) ||
      !floor.catalogKeys.includes(art.catalogKey)
    ) {
      throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} room wall art changed.`);
    }
  }

  const sourceObjectives = selectMagicStonePlacements(dungeon);
  if (floor.objectives.length !== sourceObjectives.length) {
    throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} objective count changed.`);
  }
  for (let index = 0; index < floor.objectives.length; index += 1) {
    const expected = floor.objectives[index]!;
    const actual = sourceObjectives[index]!;
    if (
      expected.stoneId !== actual.stoneId ||
      expected.roomId !== actual.room.id ||
      !sameCell(expected.cell, actual.cell) ||
      expected.offsetX !== actual.offsetX ||
      expected.offsetZ !== actual.offsetZ
    ) {
      throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} objective changed.`);
    }
  }
  if (
    floor.portal.required !== hasValidPortalPlacementContract(dungeon) ||
    !sameCell(floor.portal.cell, dungeon.exit)
  ) {
    throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} portal changed.`);
  }
}

function assertFloorMatchesPlan(dungeon: DungeonData, floor: ResidentDungeonFloorPlan): void {
  if (dungeon.width !== floor.width || dungeon.height !== floor.height) {
    throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} dimensions changed.`);
  }
  if (!sameCell(dungeon.spawn, floor.spawn) || !sameCell(dungeon.exit, floor.exit)) {
    throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} spawn or exit changed.`);
  }
  if (dungeon.topologySignature !== floor.topologySignature) {
    throw new Error(`ResidentDungeonRenderer floor ${floor.floorIndex} topology changed.`);
  }
  assertEncodedCells(
    "floor cells",
    floor.floorCells,
    collectFloorCells(dungeon),
    floor.width,
    floor.floorIndex,
  );
  assertEncodedCells(
    "boundary wall cells",
    floor.boundaryWallCells,
    collectBoundaryWallCells(dungeon),
    floor.width,
    floor.floorIndex,
  );
  assertEncodedCells(
    "open vertical cells",
    floor.openVerticalCells,
    dungeon.floor?.openVerticalCells ?? [],
    floor.width,
    floor.floorIndex,
  );
  for (const stair of floor.stairs) {
    const source = (dungeon.floor?.stairs ?? []).find((candidate) => candidate.id === stair.id);
    if (
      !source ||
      source.targetFloor !== stair.targetFloor ||
      source.direction !== stair.direction ||
      source.shaftId !== stair.shaftId ||
      source.yaw !== stair.yaw
    ) {
      throw new Error(`ResidentDungeonRenderer stair ${stair.id} no longer matches the plan.`);
    }
    if (!sameCell(source.cell, stair.anchor)) {
      throw new Error(`ResidentDungeonRenderer stair ${stair.id} anchor changed.`);
    }
    assertEncodedCells(
      `stair ${stair.id} footprint`,
      stair.footprint,
      source.footprint,
      floor.width,
      floor.floorIndex,
    );
  }
}

/**
 * Expand-contract renderer seam. It confirms that the pure plan still matches
 * the generated dungeon before Three.js architecture/stair commit begins.
 * The receipt is scalar and safe to publish in the load trace.
 */
export class ResidentDungeonRenderer {
  constructor(readonly plan: ResidentDungeonPlan) {}

  confirm(floors: readonly DungeonData[]): ResidentDungeonRenderReceipt {
    if (floors.length !== this.plan.floorCount) {
      throw new Error(
        `ResidentDungeonRenderer expected ${this.plan.floorCount} floors, received ${floors.length}.`,
      );
    }
    const receipts: ResidentDungeonRenderFloorReceipt[] = [];
    const stairIds: string[] = [];
    floors.forEach((dungeon, index) => {
      const floor = this.plan.floors[index];
      const expectedFloorIndex = dungeon.floor?.index ?? index;
      if (!floor || floor.floorIndex !== expectedFloorIndex) {
        throw new Error(`ResidentDungeonRenderer missing plan floor ${index}.`);
      }
      assertFloorMatchesPlan(dungeon, floor);
      assertPresentationMatchesPlan(dungeon, floor);
      receipts.push({
        floorIndex: floor.floorIndex,
        floorCells: floor.floorCells.length,
        boundaryWallCells: floor.boundaryWallCells.length,
        openVerticalCells: floor.openVerticalCells.length,
        stairs: floor.stairs.length,
        rooms: floor.rooms.length,
        doorways: floor.doorways.length,
        forgeProps: floor.forgeProps.length,
        forgeTorches: floor.forgeTorches.length,
        lightFixtures: floor.light.fixtures.length,
        rewardSlots: floor.rewards.slots.length,
        objectives: floor.objectives.length,
        portalRequired: floor.portal.required,
      });
      stairIds.push(...floor.stairs.map((stair: ResidentDungeonStairPlan) => stair.id));
    });
    return Object.freeze({
      planHash: this.plan.hash,
      floors: Object.freeze(receipts),
      stairIds: Object.freeze(stairIds),
      shaftCount: this.plan.shafts.length,
    });
  }
}
