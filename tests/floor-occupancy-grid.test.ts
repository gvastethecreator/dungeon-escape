import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import { generateDungeonFloorSet } from "../src/dungeon/generateDungeonFloors";
import { worldToGrid, type WorldCollider } from "../src/dungeon/gridCollision";
import type { DungeonData, DungeonStair, GridCell } from "../src/dungeon/types";
import { getDungeonMood } from "../src/systems/DungeonMood";
import type { AssetLibrary } from "../src/world/AssetLibrary";
import {
  createFloorOccupancyReport,
  FloorOccupancyBit,
  FloorOccupancyGrid,
  type FloorOccupancyPlacementChange,
} from "../src/world/FloorOccupancyGrid";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createRoomSurfaceMaterials } from "../src/world/RoomSurfaceMaterials";
import {
  StaticDungeonScene,
  type StaticDoorActor,
  type StaticStairActor,
} from "../src/world/StaticDungeonScene";
import { StaticResourceCatalog } from "../src/world/StaticResourceCatalog";
import { STORY_HEIGHT, STORY_STEP_COUNT } from "../src/world/StoryMetrics";

function installCanvasDocument(): () => void {
  const previous = globalThis.document;
  const context = {
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    set fillStyle(_value: string) {},
  };
  const image = () => ({
    addEventListener() {},
    removeEventListener() {},
    set src(_value: string) {},
    get src() {
      return "";
    },
  });
  globalThis.document = {
    createElementNS: () => image(),
    createElement: (name: string) =>
      name === "canvas" ? { width: 0, height: 0, getContext: () => context } : image(),
  } as unknown as Document;
  return () => {
    globalThis.document = previous;
  };
}

function createAssets(): AssetLibrary {
  const albedo = new THREE.Texture();
  const data = new THREE.Texture();
  const layer = { albedo, normal: data, rough: data, depth: data };
  const pbr = { albedo, normal: data, rough: data, depth: data };
  return {
    getBiomeSurfaces: () => ({ floor: layer, wall: layer, ceiling: layer }),
    biomeDoor: () => albedo,
    biomeSpriteProp: () => albedo,
    biomeSpriteDecorAtlas: () => albedo,
    uncannyWallAtlas: () => albedo,
    biomeWallDecorPbr: () => pbr,
    wallArtPbr: () => pbr,
  } as unknown as AssetLibrary;
}

function createScene(
  group: THREE.Group,
  resourceCatalog?: StaticResourceCatalog,
): StaticDungeonScene {
  const texture = new THREE.Texture();
  return new StaticDungeonScene({
    group,
    assets: createAssets(),
    materials: createDungeonMaterials(),
    surfaceMaterials: createRoomSurfaceMaterials({
      floor: texture,
      wall: texture,
      ceiling: texture,
      semanticFloors: {
        grave: texture,
        shrine: texture,
        treasure: texture,
        boss: texture,
      },
      semanticWalls: {
        grave: texture,
        shrine: texture,
        treasure: texture,
        elite: texture,
        boss: texture,
      },
    }),
    tileSize: 2.4,
    wallHeight: 4.4,
    stoneTextures: new Map(),
    resourceCatalog,
  });
}

interface OccupancySnapshotAllocationSample<T> {
  result: T;
  coordinateKeySetCopies: number;
  coordinateKeyEntries: number;
}

function isCoordinateKey(value: unknown): value is string {
  return typeof value === "string" && /^-?\d+,-?\d+$/.test(value);
}

/**
 * Runtime witness for the former aggregate occupancy bridge.  It only counts
 * Sets constructed from a complete iterable of serialized cell keys; unrelated
 * Sets (room ids, material slots, etc.) remain outside this assertion.
 */
function countOccupancySnapshotSetCopies<T>(run: () => T): OccupancySnapshotAllocationSample<T> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Set");
  if (!descriptor) throw new Error("Global Set descriptor is unavailable for instrumentation.");
  const NativeSet = globalThis.Set;
  let coordinateKeySetCopies = 0;
  let coordinateKeyEntries = 0;
  const InstrumentedSet = new Proxy(NativeSet, {
    construct(target, argumentsList, newTarget) {
      const source = argumentsList[0];
      const entries = Array.isArray(source)
        ? source
        : source instanceof NativeSet
          ? [...source]
          : [];
      if (entries.length > 0 && entries.every(isCoordinateKey)) {
        coordinateKeySetCopies += 1;
        coordinateKeyEntries += entries.length;
      }
      return Reflect.construct(target, argumentsList, newTarget);
    },
  });
  Object.defineProperty(globalThis, "Set", { ...descriptor, value: InstrumentedSet });
  try {
    return { result: run(), coordinateKeySetCopies, coordinateKeyEntries };
  } finally {
    Object.defineProperty(globalThis, "Set", descriptor);
  }
}

function cloneFloor(base: DungeonData, index: number, count: number): DungeonData {
  return {
    ...base,
    grid: base.grid.map((row) => new Uint8Array(row)),
    rooms: base.rooms.map((room) => ({ ...room, center: { ...room.center } })),
    edges: base.edges.map((edge) => ({ ...edge })),
    spawn: { ...base.spawn },
    exit: { ...base.exit },
    distances: new Int32Array(base.distances),
    floor: {
      index,
      number: index + 1,
      count,
      rootSeed: base.seed,
      stairs: [],
      openVerticalCells: [],
    },
  };
}

function rounded(value: number): number {
  const result = Math.round(value * 1_000_000) / 1_000_000;
  return result === 0 ? 0 : result;
}

function boxSnapshot(box: THREE.Box3 | null): readonly number[] | null {
  if (!box) return null;
  return [
    rounded(box.min.x),
    rounded(box.min.y),
    rounded(box.min.z),
    rounded(box.max.x),
    rounded(box.max.y),
    rounded(box.max.z),
  ];
}

function sphereSnapshot(sphere: THREE.Sphere | null): readonly number[] | null {
  if (!sphere) return null;
  return [
    rounded(sphere.center.x),
    rounded(sphere.center.y),
    rounded(sphere.center.z),
    rounded(sphere.radius),
  ];
}

function materialLayout(material: THREE.Material | THREE.Material[]): readonly string[] {
  const materials = Array.isArray(material) ? material : [material];
  return materials.map((entry) => {
    const standard = entry as THREE.MeshStandardMaterial;
    return [
      entry.type,
      entry.name,
      standard.color?.getHexString?.() ?? "",
      String(standard.roughness ?? ""),
      String(standard.metalness ?? ""),
    ].join("|");
  });
}

function classicRenderableSnapshot(root: THREE.Object3D, floorY: number) {
  root.updateMatrixWorld(true);
  const renderables: Array<{
    name: string;
    count: number;
    matrices: readonly (readonly number[])[];
    bounds: readonly number[] | null;
    sphere: readonly number[] | null;
    geometryBounds: readonly number[] | null;
    geometrySphere: readonly number[] | null;
    materialLayout: readonly string[];
    groups: readonly { start: number; count: number; materialIndex: number }[];
  }> = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    if (!object.name.startsWith("Classic ") && !object.name.startsWith("Room wall artwork ")) {
      return;
    }
    const local = new THREE.Matrix4();
    const matrices: number[][] = [];
    for (let index = 0; index < object.count; index += 1) {
      object.getMatrixAt(index, local);
      local.premultiply(object.matrixWorld);
      const normalized = local.elements.map(rounded);
      normalized[13] = rounded(normalized[13]! - floorY);
      matrices.push(normalized);
    }
    renderables.push({
      name: object.name,
      count: object.count,
      matrices,
      bounds: boxSnapshot(object.boundingBox),
      sphere: sphereSnapshot(object.boundingSphere),
      geometryBounds: boxSnapshot(object.geometry.boundingBox),
      geometrySphere: sphereSnapshot(object.geometry.boundingSphere),
      materialLayout: materialLayout(object.material),
      groups: object.geometry.groups.map(
        (group: { start: number; count: number; materialIndex: number }) => ({ ...group }),
      ),
    });
  });
  return renderables.sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function colliderSnapshot(colliders: readonly WorldCollider[], floorY: number) {
  return colliders.map((collider) => ({
    minX: rounded(collider.minX),
    maxX: rounded(collider.maxX),
    minY: rounded((collider.minY ?? 0) - floorY),
    maxY: rounded((collider.maxY ?? 0) - floorY),
    minZ: rounded(collider.minZ),
    maxZ: rounded(collider.maxZ),
  }));
}

function worldPositionSnapshot(object: THREE.Object3D, floorY: number): readonly number[] {
  const position = new THREE.Vector3();
  object.getWorldPosition(position);
  return [rounded(position.x), rounded(position.y - floorY), rounded(position.z)];
}

function worldQuaternionSnapshot(object: THREE.Object3D): readonly number[] {
  const quaternion = new THREE.Quaternion();
  object.getWorldQuaternion(quaternion);
  return [
    rounded(quaternion.x),
    rounded(quaternion.y),
    rounded(quaternion.z),
    rounded(quaternion.w),
  ];
}

function doorPlacementId(door: StaticDoorActor): string {
  return [
    door.root.userData.roomId ?? "",
    door.root.userData.edgeIndex ?? "",
    door.root.userData.connectedRoomId ?? "",
  ].join(":");
}

function doorSnapshot(doors: readonly StaticDoorActor[], floorY: number) {
  const snapshots: Array<{
    id: string;
    position: readonly number[];
    quaternion: readonly number[];
    leftHinge: readonly number[];
    rightHinge: readonly number[];
    openness: number;
    targetOpen: boolean;
  }> = [];
  for (const door of doors) {
    door.root.updateWorldMatrix(true, true);
    const position = worldPositionSnapshot(door.root, floorY);
    if (Math.abs(position[1] ?? 0) > 0.000001) continue;
    snapshots.push({
      id: doorPlacementId(door),
      position,
      quaternion: worldQuaternionSnapshot(door.root),
      leftHinge: worldPositionSnapshot(door.left, floorY),
      rightHinge: worldPositionSnapshot(door.right, floorY),
      openness: rounded(door.openness),
      targetOpen: door.targetOpen,
    });
  }
  return snapshots.sort((left, right) => left.id.localeCompare(right.id));
}

function stairSnapshot(stairs: readonly StaticStairActor[], floorY: number) {
  const snapshots: Array<{
    id: string;
    shaftId: string;
    direction: "up" | "down";
    targetFloor: number;
    cell: GridCell;
    position: readonly number[];
    quaternion: readonly number[];
  }> = [];
  for (const stair of stairs) {
    stair.root.updateWorldMatrix(true, true);
    const position = worldPositionSnapshot(stair.root, floorY);
    if (Math.abs(position[1] ?? 0) > 0.000001) continue;
    snapshots.push({
      id: String(stair.root.userData.stairId ?? ""),
      shaftId: String(stair.root.userData.shaftId ?? ""),
      direction: stair.direction,
      targetFloor: stair.targetFloor,
      cell: { ...stair.cell },
      position,
      quaternion: worldQuaternionSnapshot(stair.root),
    });
  }
  return snapshots.sort((left, right) => left.id.localeCompare(right.id));
}

function orderedOccupancyMasks(grid: FloorOccupancyGrid): readonly number[] {
  const masks: number[] = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) masks.push(grid.getMask(x, y));
  }
  return masks;
}

interface TestFloorBuildContext {
  occupancy: FloorOccupancyGrid;
}

interface FloorReservationSnapshot {
  solidCells: readonly string[];
  objectOccupiedCells: readonly string[];
  objectiveClearanceCells: readonly string[];
  hazardCells: readonly string[];
  wallSpriteOccupiedCells: readonly string[];
}

interface StairColliderSnapshot {
  id: string;
  direction: "up" | "down";
  targetFloor: number;
  colliders: ReturnType<typeof colliderSnapshot>;
}

interface FloorBuildStateSnapshot {
  masks: readonly number[];
  reservations: FloorReservationSnapshot;
  classicColliders: ReturnType<typeof colliderSnapshot>;
  stairColliders: readonly StairColliderSnapshot[];
}

function reservationSnapshot(context: TestFloorBuildContext): FloorReservationSnapshot {
  const keysFor = (bits: number): readonly string[] => {
    const keys: string[] = [];
    for (let y = 0; y < context.occupancy.height; y += 1) {
      for (let x = 0; x < context.occupancy.width; x += 1) {
        if (context.occupancy.hasAny(x, y, bits)) keys.push(`${x},${y}`);
      }
    }
    return keys;
  };
  return {
    solidCells: keysFor(FloorOccupancyBit.Solid),
    objectOccupiedCells: keysFor(FloorOccupancyBit.Object),
    objectiveClearanceCells: keysFor(FloorOccupancyBit.Objective),
    hazardCells: keysFor(FloorOccupancyBit.Hazard),
    wallSpriteOccupiedCells: keysFor(FloorOccupancyBit.WallDecoration),
  };
}

function splitStairColliders(
  stairs: readonly DungeonStair[],
  colliders: ReturnType<typeof colliderSnapshot>,
): readonly StairColliderSnapshot[] {
  const snapshots: StairColliderSnapshot[] = [];
  let start = 0;
  for (const stair of stairs) {
    const end = start + STORY_STEP_COUNT;
    snapshots.push({
      id: stair.id,
      direction: stair.direction,
      targetFloor: stair.targetFloor,
      colliders: colliders.slice(start, end),
    });
    start = end;
  }
  if (start !== colliders.length) {
    throw new Error("RDL10 stair collider capture lost a physical flight boundary.");
  }
  return snapshots;
}

function recordFloorBuildState(
  scene: StaticDungeonScene,
  normalizeStackFloorY: boolean,
): Map<number, FloorBuildStateSnapshot> {
  const snapshots = new Map<number, FloorBuildStateSnapshot>();
  const classicColliders = new Map<number, ReturnType<typeof colliderSnapshot>>();
  const stairColliders = new Map<number, readonly StairColliderSnapshot[]>();
  const internals = sceneInternals(scene);
  const originalBuildFloorContents = internals.buildFloorContents;
  const originalAddDoorsAndRoomProps = internals.addDoorsAndRoomProps;
  const originalAddStaircases = internals.addStaircases;
  internals.addDoorsAndRoomProps = (dungeon, floorBuild) => {
    const start = scene.currentHandles.solidColliders.length;
    originalAddDoorsAndRoomProps.call(scene, dungeon, floorBuild);
    const floorIndex = dungeon.floor?.index ?? 0;
    const floorY = normalizeStackFloorY ? floorIndex * STORY_HEIGHT : 0;
    classicColliders.set(
      floorIndex,
      colliderSnapshot(scene.currentHandles.solidColliders.slice(start), floorY),
    );
  };
  internals.addStaircases = (dungeon) => {
    const start = scene.currentHandles.solidColliders.length;
    originalAddStaircases.call(scene, dungeon);
    const floorIndex = dungeon.floor?.index ?? 0;
    const floorY = normalizeStackFloorY ? floorIndex * STORY_HEIGHT : 0;
    const physicalStairs = (dungeon.floor?.stairs ?? []).filter(
      (stair) => !internals.stackBuildActive || stair.targetFloor > floorIndex,
    );
    stairColliders.set(
      floorIndex,
      splitStairColliders(
        physicalStairs,
        colliderSnapshot(scene.currentHandles.solidColliders.slice(start), floorY),
      ),
    );
  };
  internals.buildFloorContents = (dungeon, mood, floorBuild) => {
    const result = originalBuildFloorContents.call(scene, dungeon, mood, floorBuild);
    const floorIndex = dungeon.floor?.index ?? 0;
    const context = floorBuild as TestFloorBuildContext;
    snapshots.set(floorIndex, {
      masks: orderedOccupancyMasks(context.occupancy),
      reservations: reservationSnapshot(context),
      classicColliders: classicColliders.get(floorIndex) ?? [],
      stairColliders: stairColliders.get(floorIndex) ?? [],
    });
    return result;
  };
  return snapshots;
}

function collectClassicPlacementCells(
  dungeon: DungeonData,
  renderables: ReturnType<typeof classicRenderableSnapshot>,
): Map<string, GridCell> {
  const placements = new Map<string, GridCell>();
  for (const renderable of renderables) {
    renderable.matrices.forEach((matrix, index) => {
      placements.set(
        `${renderable.name}:${index}`,
        worldToGrid(dungeon, { x: matrix[12] ?? 0, z: matrix[14] ?? 0 }, 2.4),
      );
    });
  }
  return placements;
}

function collectDoorPlacementCells(
  dungeon: DungeonData,
  doors: readonly StaticDoorActor[],
  floorY: number,
): Map<string, GridCell> {
  const placements = new Map<string, GridCell>();
  for (const door of doors) {
    door.root.updateWorldMatrix(true, true);
    const position = worldPositionSnapshot(door.root, floorY);
    if (Math.abs(position[1] ?? 0) > 0.000001) continue;
    placements.set(
      `door:${doorPlacementId(door)}`,
      worldToGrid(dungeon, { x: position[0] ?? 0, z: position[2] ?? 0 }, 2.4),
    );
  }
  return placements;
}

function classicPlacementChanges(
  dungeon: DungeonData,
  floorIndex: number,
  actual: ReturnType<typeof classicRenderableSnapshot>,
  isolatedBaseline: ReturnType<typeof classicRenderableSnapshot>,
  actualDoors: readonly StaticDoorActor[],
  isolatedDoors: readonly StaticDoorActor[],
  actualFloorY: number,
): FloorOccupancyPlacementChange[] {
  const actualCells = collectClassicPlacementCells(dungeon, actual);
  const baselineCells = collectClassicPlacementCells(dungeon, isolatedBaseline);
  for (const [placementId, cell] of collectDoorPlacementCells(dungeon, actualDoors, actualFloorY)) {
    actualCells.set(placementId, cell);
  }
  for (const [placementId, cell] of collectDoorPlacementCells(dungeon, isolatedDoors, 0)) {
    baselineCells.set(placementId, cell);
  }
  const placementIds = new Set([...actualCells.keys(), ...baselineCells.keys()]);
  const changes: FloorOccupancyPlacementChange[] = [];
  for (const placementId of [...placementIds].sort()) {
    const actualCell = actualCells.get(placementId);
    const baselineCell = baselineCells.get(placementId);
    if (!actualCell && baselineCell) {
      changes.push({ floorIndex, placementId, kind: "removed", from: baselineCell });
      continue;
    }
    if (actualCell && !baselineCell) {
      changes.push({ floorIndex, placementId, kind: "added", to: actualCell });
      continue;
    }
    if (
      actualCell &&
      baselineCell &&
      (actualCell.x !== baselineCell.x || actualCell.y !== baselineCell.y)
    ) {
      changes.push({
        floorIndex,
        placementId,
        kind: "moved",
        from: baselineCell,
        to: actualCell,
      });
    }
  }
  return changes;
}

type TestBuildFloorContents = (dungeon: DungeonData, mood: unknown, floorBuild: unknown) => unknown;

interface TestSceneInternals {
  buildFloorContents: TestBuildFloorContents;
  addDoorsAndRoomProps(dungeon: DungeonData, floorBuild: unknown): void;
  addStaircases(dungeon: DungeonData): void;
  add(...objects: THREE.Object3D[]): void;
  clear(): void;
  activeFloorOccupancy: FloorOccupancyGrid | null;
  buildRoots: THREE.Object3D[];
  floorRenderGroups: THREE.Group[];
  currentFloorRenderGroup: THREE.Group | null;
  floorWorldY: number;
  stackBuildActive: boolean;
}

function sceneInternals(scene: StaticDungeonScene): TestSceneInternals {
  return scene as unknown as TestSceneInternals;
}

function expectFailedBuildCleanup(scene: StaticDungeonScene, group: THREE.Group): void {
  const handles = scene.currentHandles;
  const internals = sceneInternals(scene);
  expect(group.children).toHaveLength(0);
  expect(internals.buildRoots).toHaveLength(0);
  expect(internals.floorRenderGroups).toHaveLength(0);
  expect(internals.currentFloorRenderGroup).toBeNull();
  expect(internals.activeFloorOccupancy).toBeNull();
  expect(internals.floorWorldY).toBe(0);
  expect(internals.stackBuildActive).toBe(false);
  expect(handles.doors).toHaveLength(0);
  expect(handles.pickups).toHaveLength(0);
  expect(handles.chests).toHaveLength(0);
  expect(handles.staircases).toHaveLength(0);
  expect(handles.fireEffects).toHaveLength(0);
  expect(handles.solidCells.size).toBe(0);
  expect(handles.objectOccupiedCells.size).toBe(0);
  expect(handles.solidColliders).toHaveLength(0);
  expect(handles.objectiveClearanceCells.size).toBe(0);
  expect(handles.hazardCells.size).toBe(0);
  expect(handles.floorBiomeSprites).toHaveLength(0);
  expect(handles.wallSpriteOccupiedCells.size).toBe(0);
  expect(handles.stoneBeams).toHaveLength(0);
  expect(handles.ambientBeams).toHaveLength(0);
  expect(handles.stonePlacements).toHaveLength(0);
  expect(handles.floorOccupancyGrids).toHaveLength(0);
  expect(handles.occupancyReport).toEqual({
    legacyFlatKeyCollisions: [],
    placementChanges: [],
    perFloor: [],
    memoryBytes: 0,
  });
}

describe("FloorOccupancyGrid", () => {
  test("stores every semantic bit densely, reports overlaps, and keeps reads bounded", () => {
    const grid = new FloorOccupancyGrid(3, 4, 3);
    const bits = Object.values(FloorOccupancyBit);
    bits.forEach((bit, index) => grid.mark(index % 4, Math.floor(index / 4), bit));
    grid.mark(0, 2, FloorOccupancyBit.Solid | FloorOccupancyBit.Object);
    grid.mark(0, 2, FloorOccupancyBit.Hazard | FloorOccupancyBit.Objective);

    bits.forEach((bit, index) => {
      expect(grid.has(index % 4, Math.floor(index / 4), bit)).toBe(true);
    });
    expect(grid.hasAny(0, 2, FloorOccupancyBit.Solid | FloorOccupancyBit.Stair)).toBe(true);
    expect(grid.has(0, 2, FloorOccupancyBit.Solid | FloorOccupancyBit.Object)).toBe(true);
    expect(grid.unmark(0, 2, FloorOccupancyBit.Object)).toBe(true);
    expect(grid.has(0, 2, FloorOccupancyBit.Object)).toBe(false);
    expect(grid.has(0, 2, FloorOccupancyBit.Solid)).toBe(true);
    expect(grid.memoryBytes).toBe(12);
    const diagnostics = grid.diagnostics();
    expect(diagnostics).toMatchObject({
      floorIndex: 3,
      width: 4,
      height: 3,
      memoryBytes: 12,
      occupiedCells: 8,
      overlapCells: 1,
    });
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.bitCounts)).toBe(true);
    expect(Reflect.ownKeys(grid)).not.toContain("cells");
    expect(() => grid.mark(-1, 0, FloorOccupancyBit.Solid)).toThrow(RangeError);
    expect(() => grid.unmark(4, 0, FloorOccupancyBit.Solid)).toThrow(RangeError);
    expect(grid.has(-1, 0, FloorOccupancyBit.Solid)).toBe(false);
    expect(grid.hasAny(0, 3, FloorOccupancyBit.Solid)).toBe(false);
  });

  test("keeps identical XZ cells independent between floors and separates a legacy collision from a placement change", () => {
    const floor0 = new FloorOccupancyGrid(0, 5, 5);
    const floor1 = new FloorOccupancyGrid(1, 5, 5);
    floor0.mark(2, 3, FloorOccupancyBit.Solid | FloorOccupancyBit.Object);
    floor1.mark(2, 3, FloorOccupancyBit.Solid | FloorOccupancyBit.Object);
    floor1.mark(1, 1, FloorOccupancyBit.Hazard | FloorOccupancyBit.Objective);

    const report = createFloorOccupancyReport(
      [floor1, floor0],
      [
        {
          floorIndex: 1,
          placementId: "moved-only-when-output-differs",
          kind: "moved",
          from: { x: 1, y: 1 },
          to: { x: 2, y: 1 },
        },
      ],
    );

    expect(floor0.has(2, 3, FloorOccupancyBit.Solid)).toBe(true);
    expect(floor1.has(2, 3, FloorOccupancyBit.Solid)).toBe(true);
    expect(report.legacyFlatKeyCollisions).toEqual([
      { category: "object", x: 2, y: 3, floorIndices: [0, 1] },
      { category: "solid", x: 2, y: 3, floorIndices: [0, 1] },
    ]);
    expect(report.placementChanges).toHaveLength(1);
    expect(report.memoryBytes).toBe(50);
  });

  test("cleans an early build failure and keeps external catalog resources resident", () => {
    const restoreDocument = installCanvasDocument();
    const group = new THREE.Group();
    const catalog = new StaticResourceCatalog();
    const persistentGeometry = catalog.borrowGeometry(
      "rdl10-transaction-persistent-probe",
      () => new THREE.BoxGeometry(1, 1, 1),
      "test-probe",
    );
    let persistentGeometryDisposals = 0;
    persistentGeometry.addEventListener("dispose", () => {
      persistentGeometryDisposals += 1;
    });
    const scene = createScene(group, catalog);
    const internals = sceneInternals(scene);
    const originalBuildFloorContents = internals.buildFloorContents;
    const dungeon = generateDungeon("RDL10-transaction-early", { roomTarget: 7 });
    try {
      scene.build(dungeon, getDungeonMood("ash"), 0.6);
      const catalogBeforeFailure = catalog.snapshot();
      const constructionError = new Error("RDL10 early construction failure");
      internals.buildFloorContents = () => {
        throw constructionError;
      };

      let thrown: unknown;
      try {
        scene.build(dungeon, getDungeonMood("ash"), 0.6);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBe(constructionError);
      expectFailedBuildCleanup(scene, group);
      expect(catalog.snapshot()).toEqual(catalogBeforeFailure);
      expect(persistentGeometryDisposals).toBe(0);

      internals.buildFloorContents = originalBuildFloorContents;
      const rebuilt = scene.build(dungeon, getDungeonMood("ash"), 0.6);
      expect(rebuilt.floorOccupancyGrids).toHaveLength(1);
      expect(group.children.length).toBeGreaterThan(0);
    } finally {
      internals.buildFloorContents = originalBuildFloorContents;
      scene.dispose();
      catalog.dispose();
      restoreDocument();
    }
  });

  test("cleans a late stack failure without replacing its original error", () => {
    const restoreDocument = installCanvasDocument();
    const group = new THREE.Group();
    const catalog = new StaticResourceCatalog();
    const persistentGeometry = catalog.borrowGeometry(
      "rdl10-transaction-stack-probe",
      () => new THREE.BoxGeometry(1, 1, 1),
      "test-probe",
    );
    let persistentGeometryDisposals = 0;
    persistentGeometry.addEventListener("dispose", () => {
      persistentGeometryDisposals += 1;
    });
    let catalogDisposeCalls = 0;
    const disposeCatalog = catalog.dispose.bind(catalog);
    catalog.dispose = () => {
      catalogDisposeCalls += 1;
      disposeCatalog();
    };
    const scene = createScene(group, catalog);
    const internals = sceneInternals(scene);
    const originalBuildFloorContents = internals.buildFloorContents;
    const floors = generateDungeonFloorSet("RDL10-transaction-stack", { roomTarget: 7 }, 3).floors;
    try {
      scene.build(floors[0]!, getDungeonMood("ash"), 0.55);
      const constructionError = new Error("RDL10 late construction failure");
      const cleanupError = new Error("RDL10 cleanup failure");
      let cleanupDisposeCalls = 0;
      let completedFloors = 0;
      internals.buildFloorContents = (dungeon, mood, floorBuild) => {
        const result = originalBuildFloorContents.call(scene, dungeon, mood, floorBuild);
        completedFloors += 1;
        if (completedFloors === 2) {
          const cleanupRoot = new THREE.Group();
          const cleanupMaterial = new THREE.MeshBasicMaterial();
          const disposeCleanupMaterial = cleanupMaterial.dispose.bind(cleanupMaterial);
          cleanupMaterial.dispose = () => {
            cleanupDisposeCalls += 1;
            disposeCleanupMaterial();
            throw cleanupError;
          };
          cleanupRoot.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cleanupMaterial));
          internals.add(cleanupRoot);
          throw constructionError;
        }
        return result;
      };

      let thrown: unknown;
      try {
        scene.buildStack(floors, getDungeonMood("ash"), 0.55);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBe(constructionError);
      expect(cleanupDisposeCalls).toBe(1);
      expectFailedBuildCleanup(scene, group);
      expect(catalogDisposeCalls).toBe(0);
      expect(persistentGeometryDisposals).toBe(0);
      expect(
        catalog.borrowGeometry(
          "rdl10-transaction-stack-probe",
          () => new THREE.BoxGeometry(1, 1, 1),
          "test-probe",
        ),
      ).toBe(persistentGeometry);

      internals.buildFloorContents = originalBuildFloorContents;
      const rebuilt = scene.buildStack(floors, getDungeonMood("ash"), 0.55);
      expect(rebuilt.floorOccupancyGrids).toHaveLength(3);
      expect(
        group.children.filter((child) => child.name.startsWith("Dungeon resident floor ")),
      ).toHaveLength(3);
    } finally {
      internals.buildFloorContents = originalBuildFloorContents;
      scene.dispose();
      catalog.dispose();
      restoreDocument();
    }
  });

  test("keeps a four-floor classic stack equivalent to four isolated floors", () => {
    const restoreDocument = installCanvasDocument();
    const stackScene = createScene(new THREE.Group());
    const isolatedScenes: StaticDungeonScene[] = [];
    try {
      const base = generateDungeon("RDL10-SAME-XZ-CLASSIC", { roomTarget: 9 });
      const floors = Array.from({ length: 4 }, (_, index) => cloneFloor(base, index, 4));
      const stackGroup = (stackScene as unknown as { group: THREE.Group }).group;
      const stackFloorBuildStates = recordFloorBuildState(stackScene, true);
      const occupancyAllocationSample = countOccupancySnapshotSetCopies(() =>
        stackScene.buildStack(floors, getDungeonMood("ash"), 0.63),
      );
      const stacked = occupancyAllocationSample.result;
      const placementChanges: FloorOccupancyPlacementChange[] = [];

      expect(occupancyAllocationSample.coordinateKeySetCopies).toBe(0);
      expect(occupancyAllocationSample.coordinateKeyEntries).toBe(0);

      expect(stacked.floorOccupancyGrids).toHaveLength(4);
      expect(
        stacked.floorOccupancyGrids.map((grid) => ({
          floorIndex: grid.floorIndex,
          width: grid.width,
          height: grid.height,
        })),
      ).toEqual(
        floors.map((floor) => ({
          floorIndex: floor.floor!.index,
          width: floor.width,
          height: floor.height,
        })),
      );
      expect(stacked.occupancyReport.memoryBytes).toBe(base.width * base.height * 4);
      expect(stacked.occupancyReport.legacyFlatKeyCollisions.length).toBeGreaterThan(0);
      expect(stacked.occupancyReport.placementChanges).toEqual([]);
      const sameXzSolid = stacked.occupancyReport.legacyFlatKeyCollisions.find(
        (collision) => collision.category === "solid" && collision.floorIndices.length === 4,
      );
      expect(sameXzSolid).toBeDefined();
      for (const grid of stacked.floorOccupancyGrids) {
        expect(grid.has(sameXzSolid!.x, sameXzSolid!.y, FloorOccupancyBit.Solid)).toBe(true);
      }

      for (const floor of floors) {
        const floorIndex = floor.floor!.index;
        const residentFloor = stackGroup.children.find(
          (child) => child.userData.floorIndex === floorIndex,
        );
        expect(residentFloor).toBeDefined();
        const isolatedGroup = new THREE.Group();
        const isolatedScene = createScene(isolatedGroup);
        isolatedScenes.push(isolatedScene);
        const isolatedFloorBuildStates = recordFloorBuildState(isolatedScene, false);
        const isolated = isolatedScene.build(floor, getDungeonMood("ash"), 0.63);

        const stackedRenderables = classicRenderableSnapshot(
          residentFloor!,
          floorIndex * STORY_HEIGHT,
        );
        const isolatedRenderables = classicRenderableSnapshot(isolatedGroup, 0);
        placementChanges.push(
          ...classicPlacementChanges(
            floor,
            floorIndex,
            stackedRenderables,
            isolatedRenderables,
            stacked.doors,
            isolated.doors,
            floorIndex * STORY_HEIGHT,
          ),
        );
        expect(stackedRenderables).toEqual(isolatedRenderables);
        expect(doorSnapshot(stacked.doors, floorIndex * STORY_HEIGHT)).toEqual(
          doorSnapshot(isolated.doors, 0),
        );
        const stackedState = stackFloorBuildStates.get(floorIndex);
        const isolatedState = isolatedFloorBuildStates.get(floorIndex);
        expect(stackedState).toBeDefined();
        expect(isolatedState).toBeDefined();
        expect(stackedState!.masks).toEqual(isolatedState!.masks);
        expect(stackedState!.reservations).toEqual(isolatedState!.reservations);
        expect(stackedState!.classicColliders).toEqual(isolatedState!.classicColliders);
        expect(stackedState!.stairColliders).toEqual(isolatedState!.stairColliders);
        expect(stacked.floorOccupancyGrids[floorIndex]!.diagnostics()).toEqual(
          isolated.floorOccupancyGrids[0]!.diagnostics(),
        );
      }

      const parityReport = createFloorOccupancyReport(
        stacked.floorOccupancyGrids,
        placementChanges,
      );
      expect(parityReport.legacyFlatKeyCollisions).toEqual(
        stacked.occupancyReport.legacyFlatKeyCollisions,
      );
      expect(parityReport.placementChanges).toEqual([]);

      const gridsBeforeSwitch = stacked.floorOccupancyGrids;
      stackScene.setActiveFloor(2);
      expect(stacked.floorOccupancyGrids).toBe(gridsBeforeSwitch);
      stackScene.clear();
      expect(stacked.floorOccupancyGrids).toHaveLength(0);
    } finally {
      stackScene.dispose();
      isolatedScenes.forEach((scene) => scene.dispose());
      restoreDocument();
    }
  });

  test("keeps real stair-bearing floors equivalent to isolated resident outputs", () => {
    const restoreDocument = installCanvasDocument();
    const stackGroup = new THREE.Group();
    const stackScene = createScene(stackGroup);
    const isolatedScenes: StaticDungeonScene[] = [];
    try {
      const floors = generateDungeonFloorSet(
        "RDL10-REAL-STAIR-PARITY",
        { roomTarget: 7 },
        3,
      ).floors;
      expect(floors).toHaveLength(3);
      expect(floors.every((floor) => (floor.floor?.stairs.length ?? 0) > 0)).toBe(true);

      const stackFloorBuildStates = recordFloorBuildState(stackScene, true);
      const stacked = stackScene.buildStack(floors, getDungeonMood("ash"), 0.58);
      const placementChanges: FloorOccupancyPlacementChange[] = [];

      for (const floor of floors) {
        const floorIndex = floor.floor!.index;
        const residentFloor = stackGroup.children.find(
          (child) => child.userData.floorIndex === floorIndex,
        );
        expect(residentFloor).toBeDefined();

        const isolatedGroup = new THREE.Group();
        const isolatedScene = createScene(isolatedGroup);
        isolatedScenes.push(isolatedScene);
        const isolatedFloorBuildStates = recordFloorBuildState(isolatedScene, false);
        const isolated = isolatedScene.build(floor, getDungeonMood("ash"), 0.58);
        const stackedState = stackFloorBuildStates.get(floorIndex);
        const isolatedState = isolatedFloorBuildStates.get(floorIndex);
        expect(stackedState).toBeDefined();
        expect(isolatedState).toBeDefined();

        const stackedRenderables = classicRenderableSnapshot(
          residentFloor!,
          floorIndex * STORY_HEIGHT,
        );
        const isolatedRenderables = classicRenderableSnapshot(isolatedGroup, 0);
        placementChanges.push(
          ...classicPlacementChanges(
            floor,
            floorIndex,
            stackedRenderables,
            isolatedRenderables,
            stacked.doors,
            isolated.doors,
            floorIndex * STORY_HEIGHT,
          ),
        );
        expect(stackedRenderables).toEqual(isolatedRenderables);
        expect(doorSnapshot(stacked.doors, floorIndex * STORY_HEIGHT)).toEqual(
          doorSnapshot(isolated.doors, 0),
        );
        expect(stackedState!.masks).toEqual(isolatedState!.masks);
        expect(stackedState!.reservations).toEqual(isolatedState!.reservations);
        expect(stackedState!.classicColliders).toEqual(isolatedState!.classicColliders);

        for (const stair of floor.floor!.stairs) {
          for (const cell of [stair.cell, ...stair.footprint]) {
            expect(
              stacked.floorOccupancyGrids[floorIndex]!.has(cell.x, cell.y, FloorOccupancyBit.Stair),
            ).toBe(true);
          }
        }

        const outgoingIds = new Set(
          floor
            .floor!.stairs.filter((stair) => stair.targetFloor > floorIndex)
            .map((stair) => stair.id),
        );
        expect(stackedState!.stairColliders).toEqual(
          isolatedState!.stairColliders.filter((stair) => outgoingIds.has(stair.id)),
        );
        expect(stairSnapshot(stacked.staircases, floorIndex * STORY_HEIGHT)).toEqual(
          stairSnapshot(isolated.staircases, 0).filter((stair) => outgoingIds.has(stair.id)),
        );
      }

      expect(
        createFloorOccupancyReport(stacked.floorOccupancyGrids, placementChanges).placementChanges,
      ).toEqual([]);
    } finally {
      stackScene.dispose();
      isolatedScenes.forEach((scene) => scene.dispose());
      restoreDocument();
    }
  });

  test("keeps occupancy hot paths free of cell strings and room-sized set clones", () => {
    const gridSource = readFileSync("src/world/FloorOccupancyGrid.ts", "utf8");
    const sceneSource = readFileSync("src/world/StaticDungeonScene.ts", "utf8");
    const start = sceneSource.indexOf("private addDoorsAndRoomProps");
    const end = sceneSource.indexOf("private addForgeDoorsAndProps", start);
    const classicSource = sceneSource.slice(start, end);

    expect(gridSource).not.toContain("`${");
    expect(gridSource).not.toContain("new Set");
    expect(gridSource).not.toContain("new Map");
    expect(classicSource).not.toContain("new Set");
    expect(classicSource).not.toContain("...this.objectOccupiedCells");
    expect(classicSource).not.toContain("...this.solidCells.keys()");
    expect(classicSource.match(/getRoomWallSeats\(dungeon, room\)/g) ?? []).toHaveLength(1);
    const seatCacheStart = sceneSource.indexOf("private getRoomWallSeats");
    const seatCacheEnd = sceneSource.indexOf("private getRoomInteriorSeats", seatCacheStart);
    expect(sceneSource.slice(seatCacheStart, seatCacheEnd)).toContain(
      "collectRoomWallSeats(dungeon, room)",
    );
  });
});
