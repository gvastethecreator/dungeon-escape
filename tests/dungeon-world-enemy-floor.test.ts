import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { worldToGrid } from "../src/dungeon/gridCollision";
import { generateDungeonFloorSet } from "../src/dungeon/generateDungeonFloors";
import type { DungeonData } from "../src/dungeon/types";
import { biomeCampaignParams } from "../src/systems/BiomeCampaign";
import { getDungeonMood } from "../src/systems/DungeonMood";
import { DungeonLoadTrace } from "../src/systems/DungeonLoadTrace";
import { DungeonWorld } from "../src/world/DungeonWorld";
import {
  StaticDungeonScene,
  type StaticDungeonSceneHandles,
} from "../src/world/StaticDungeonScene";
import type { ResidentEnemyRuntime } from "../src/world/ResidentEnemyRuntime";
import { floorSlabY } from "../src/world/StoryMetrics";
import { WORLD_TILE_SIZE } from "../src/world/WorldMetrics";

type EnemyActorSnapshot = {
  readonly pool: "active" | "reserve";
  readonly kind: string;
  readonly tier: number;
  readonly startsActive: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

type DungeonWorldEnemyInternals = {
  readonly enemies: readonly EnemyActor[];
  readonly enemyReserve: readonly EnemyActor[];
  readonly staticHandles: StaticDungeonSceneHandles;
  readonly staticScene: StaticDungeonScene;
  readonly activeFloorRuntime: StaticDungeonSceneHandles["residentFloors"][number] | null;
};

type EnemyActor = {
  readonly kind: string;
  readonly tier: number;
  readonly startsActive: boolean;
  readonly position: THREE.Vector3;
};

const ENEMY_FLOOR_FIXTURE = Object.freeze([
  {
    floorIndex: 0,
    count: 179,
    active: 55,
    reserve: 124,
    billboardKinds: 11,
    rawBatches: 12,
    hash: "bda4d0d2",
  },
  {
    floorIndex: 1,
    count: 188,
    active: 55,
    reserve: 133,
    billboardKinds: 11,
    rawBatches: 12,
    hash: "69259b67",
  },
  {
    floorIndex: 2,
    count: 156,
    active: 53,
    reserve: 103,
    billboardKinds: 11,
    rawBatches: 12,
    hash: "92e97e2c",
  },
  {
    floorIndex: 3,
    count: 172,
    active: 55,
    reserve: 117,
    billboardKinds: 11,
    rawBatches: 12,
    hash: "134023b5",
  },
]);

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

function backroomsOptions() {
  const params = biomeCampaignParams("backrooms");
  return {
    roomTarget: params.roomTarget,
    extraConnectionRate: params.loopRate / 100,
    width: params.mapWidth,
    height: params.mapHeight,
    minRoomSize: params.minRoomSize,
    maxRoomSize: params.maxRoomSize,
    corridorRadius: params.corridorRadius,
    roomPadding: params.roomPadding,
  };
}

function enemyInternals(world: DungeonWorld): DungeonWorldEnemyInternals {
  return world as unknown as DungeonWorldEnemyInternals;
}

function countArrayIterations<T>(values: readonly T[], onItem: () => void): readonly T[] {
  return new Proxy(values, {
    get(target, property, receiver) {
      if (property === Symbol.iterator) {
        return function* countedIterator(): IterableIterator<T> {
          for (const value of target) {
            onItem();
            yield value;
          }
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function replaceRuntimeArray<T>(
  runtime: object,
  key: "doors" | "chests" | "pickups",
  onItem: () => void,
): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(runtime, key);
  if (!descriptor) throw new Error(`Missing resident runtime ${key} array.`);
  const values = descriptor.value as readonly T[];
  Object.defineProperty(runtime, key, {
    ...descriptor,
    value: countArrayIterations(values, onItem),
  });
  return () => Object.defineProperty(runtime, key, descriptor);
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function enemySnapshotForRuntime(runtime: ResidentEnemyRuntime): EnemyActorSnapshot[] {
  const { actors: enemies, reserveActors: enemyReserve } = runtime;
  const toSnapshot = (pool: EnemyActorSnapshot["pool"], enemy: EnemyActor): EnemyActorSnapshot => ({
    pool,
    kind: enemy.kind,
    tier: enemy.tier,
    startsActive: enemy.startsActive,
    x: round6(enemy.position.x),
    y: round6(enemy.position.y),
    z: round6(enemy.position.z),
  });
  return [
    ...enemies.map((enemy) => toSnapshot("active", enemy)),
    ...enemyReserve.map((enemy) => toSnapshot("reserve", enemy)),
  ].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function enemySnapshot(world: DungeonWorld): EnemyActorSnapshot[] {
  const runtime = world.getActiveEnemyRuntime();
  return runtime ? enemySnapshotForRuntime(runtime) : [];
}

function enemySeatKeys(runtime: ResidentEnemyRuntime, dungeon: DungeonData): string[] {
  const { actors: enemies, reserveActors: enemyReserve } = runtime;
  return [...enemies, ...enemyReserve].map((enemy) => {
    const cell = worldToGrid(dungeon, enemy.position, WORLD_TILE_SIZE);
    return `${cell.x},${cell.y}`;
  });
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function snapshotHash(snapshot: readonly EnemyActorSnapshot[]): string {
  return fnv1a32(JSON.stringify(snapshot));
}

function residentFloorIndex(
  object: THREE.Object3D,
  handles: StaticDungeonSceneHandles,
): number | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const runtime = handles.residentFloors.find((candidate) => candidate.root === current);
    if (runtime) return runtime.floorIndex;
    current = current.parent;
  }
  return null;
}

function createWorld(): DungeonWorld {
  const world = new DungeonWorld(new THREE.Scene());
  // Freeze the tuned fixture instead of relying on mutable UI defaults.
  world.setDecorDensity(0.6);
  world.setEnemyDensity(0.5);
  return world;
}

describe("DungeonWorld per-floor enemy occupancy", () => {
  test("records the pure resident plan before the Three.js scene commit", () => {
    const restoreDocument = installCanvasDocument();
    const world = createWorld();
    try {
      const trace = new DungeonLoadTrace({ clock: () => 0, loadId: "RDL16-plan-trace" });
      const floorSet = generateDungeonFloorSet("RDL16-plan-trace", { roomTarget: 8 }, 2);
      world.setDungeon(floorSet.floors[0]!, getDungeonMood("ash"), {
        stack: floorSet.floors,
        loadTrace: trace,
      });
      const snapshot = trace.finish("error", "test-only snapshot");
      expect(snapshot?.plan).toBeDefined();
      expect(snapshot?.sceneCommit).toBeDefined();
      expect(snapshot?.plan?.startedAtMs).toBeLessThanOrEqual(
        snapshot?.sceneCommit?.startedAtMs ?? Number.POSITIVE_INFINITY,
      );
    } finally {
      world.dispose();
      restoreDocument();
    }
  });

  test("keeps Backrooms enemy seats floor-owned in stacked builds", () => {
    const restoreDocument = installCanvasDocument();
    const stackedWorld = createWorld();
    try {
      const floorSet = generateDungeonFloorSet("LOAD-PIPELINE-BACKROOMS-4", backroomsOptions(), 4);
      const mood = getDungeonMood("backrooms");
      stackedWorld.setDungeon(floorSet.floors[0]!, mood, { stack: floorSet.floors });
      const internals = enemyInternals(stackedWorld);
      const staticHandlesBeforeRebind = internals.staticHandles;
      const snapshots = new Map<number, EnemyActorSnapshot[]>();

      for (const expected of ENEMY_FLOOR_FIXTURE) {
        const dungeon = floorSet.floors[expected.floorIndex]!;
        expect(dungeon.floor?.index).toBe(expected.floorIndex);
        const runtime = stackedWorld.getResidentEnemyRuntime(expected.floorIndex)!;
        const floorRuntime = internals.staticHandles.residentFloors.find(
          (candidate) => candidate.floorIndex === expected.floorIndex,
        );
        expect(floorRuntime).toBeDefined();
        const isolatedWorld = createWorld();
        try {
          isolatedWorld.setDungeon(dungeon, mood);

          const stackedSnapshot = enemySnapshotForRuntime(runtime);
          const isolatedSnapshot = enemySnapshot(isolatedWorld);
          const stackedSeats = enemySeatKeys(runtime, dungeon);

          // Floors may reuse the same X/Z elsewhere in the stack, but enemy
          // planning and local state must stay inside their resident owner.
          expect(stackedSnapshot).toEqual(isolatedSnapshot);
          expect(stackedSnapshot).toHaveLength(expected.count);
          expect(snapshotHash(stackedSnapshot)).toBe(expected.hash);
          expect(new Set(stackedSeats).size).toBe(stackedSeats.length);
          expect(runtime.root.parent).toBe(floorRuntime!.root);
          expect(runtime.seatCount).toBe(expected.count);
          expect(runtime.activeCount).toBe(expected.active);
          expect(runtime.reserveCount).toBe(expected.reserve);
          expect(runtime.billboardBatches.size).toBe(expected.billboardKinds);
          expect(runtime.shadowBatches.size).toBe(1);
          expect(runtime.rawBatchCount).toBe(expected.rawBatches);
          snapshots.set(expected.floorIndex, stackedSnapshot);
        } finally {
          isolatedWorld.dispose();
        }
      }

      expect(stackedWorld.getResidentEnemyBuildDiagnostics()).toEqual(
        ENEMY_FLOOR_FIXTURE.map((expected) => ({
          floorIndex: expected.floorIndex,
          seats: expected.count,
          active: expected.active,
          reserve: expected.reserve,
          rawBatches: expected.rawBatches,
          buildDurationMs: expect.any(Number),
        })),
      );
      expect(
        stackedWorld
          .getResidentEnemyBuildDiagnostics()
          .reduce((total, runtime) => total + runtime.seats, 0),
      ).toBe(695);
      expect(
        stackedWorld
          .getResidentEnemyBuildDiagnostics()
          .reduce((total, runtime) => total + runtime.active, 0),
      ).toBe(218);

      const runtimeRoots = ENEMY_FLOOR_FIXTURE.map(
        ({ floorIndex }) => stackedWorld.getResidentEnemyRuntime(floorIndex)!.root,
      );
      const actorSeats = ENEMY_FLOOR_FIXTURE.map(
        ({ floorIndex }) => stackedWorld.getResidentEnemyRuntime(floorIndex)!.actors,
      );
      const billboardBatches = ENEMY_FLOOR_FIXTURE.map(
        ({ floorIndex }) => stackedWorld.getResidentEnemyRuntime(floorIndex)!.billboardBatches,
      );
      const objectPrototype = THREE.Object3D.prototype;
      const matrixPrototype = THREE.Matrix4.prototype;
      const originalAdd = objectPrototype.add;
      const originalCompose = matrixPrototype.compose;
      let addCalls = 0;
      let composeCalls = 0;
      objectPrototype.add = function (
        this: THREE.Object3D,
        ...objects: THREE.Object3D[]
      ): THREE.Object3D {
        addCalls += 1;
        return originalAdd.apply(this, objects);
      };
      matrixPrototype.compose = function (
        this: THREE.Matrix4,
        position: THREE.Vector3,
        quaternion: THREE.Quaternion,
        scale: THREE.Vector3,
      ): THREE.Matrix4 {
        composeCalls += 1;
        return originalCompose.call(this, position, quaternion, scale);
      };
      try {
        for (const floorIndex of [1, 3, 0]) {
          stackedWorld.rebindActiveDungeon(floorSet.floors[floorIndex]!);
          expect(enemySnapshot(stackedWorld)).toEqual(snapshots.get(floorIndex)!);
        }
      } finally {
        objectPrototype.add = originalAdd;
        matrixPrototype.compose = originalCompose;
      }
      expect(enemyInternals(stackedWorld).staticHandles).toBe(staticHandlesBeforeRebind);
      expect({ addCalls, composeCalls }).toEqual({ addCalls: 0, composeCalls: 0 });
      expect(
        ENEMY_FLOOR_FIXTURE.map(
          ({ floorIndex }) => stackedWorld.getResidentEnemyRuntime(floorIndex)!.root,
        ),
      ).toEqual(runtimeRoots);
      expect(
        ENEMY_FLOOR_FIXTURE.map(
          ({ floorIndex }) => stackedWorld.getResidentEnemyRuntime(floorIndex)!.actors,
        ),
      ).toEqual(actorSeats);
      expect(
        ENEMY_FLOOR_FIXTURE.map(
          ({ floorIndex }) => stackedWorld.getResidentEnemyRuntime(floorIndex)!.billboardBatches,
        ),
      ).toEqual(billboardBatches);
      expect(runtimeRoots.map((root) => root.visible)).toEqual([true, false, false, false]);
    } finally {
      stackedWorld.dispose();
      restoreDocument();
    }
  });

  test("rebinds, updates, and reveals an upper-slab chest in world coordinates", () => {
    const restoreDocument = installCanvasDocument();
    const world = createWorld();
    try {
      const floorSet = generateDungeonFloorSet("RDL12-runtime-map-fixture", { roomTarget: 8 }, 4);
      world.setDungeon(floorSet.floors[0]!, getDungeonMood("ash"), { stack: floorSet.floors });
      const handles = enemyInternals(world).staticHandles;
      const upperFloor = 1;
      world.rebindActiveDungeon(floorSet.floors[upperFloor]!);
      expect(handles.residentFloors.map((runtime) => runtime.root.visible)).toEqual([
        true,
        true,
        true,
        false,
      ]);

      const chest = handles.chests.find(
        (candidate) => residentFloorIndex(candidate.root, handles) === upperFloor,
      )!;
      const chestPosition = chest.root.getWorldPosition(new THREE.Vector3());
      const opening = world.update(0.016, chestPosition, false, true);
      expect(chest.opened).toBe(true);
      expect(opening.chestSound?.position).toMatchObject({
        x: chestPosition.x,
        y: chestPosition.y + 0.72,
        z: chestPosition.z,
      });

      world.update(0.6, chestPosition.clone().add(new THREE.Vector3(12, 0, 0)), false);
      expect(chest.reward.available).toBe(true);
      expect(chest.reward.object.position.y).toBeGreaterThan(chest.reward.baseY - 0.06);
      expect(chest.reward.object.position.y).toBeLessThan(chest.reward.baseY + 0.06);
      const rewardWorldY = chest.reward.object.getWorldPosition(new THREE.Vector3()).y;
      expect(rewardWorldY - chest.reward.object.position.y).toBeCloseTo(floorSlabY(upperFloor), 5);

      const upperFire = handles.fireEffects.find(
        (candidate) =>
          residentFloorIndex(candidate.root, handles) === upperFloor && candidate.light !== null,
      )!;
      const firePosition = upperFire.root.getWorldPosition(new THREE.Vector3());
      // Dynamic fire lights are no longer global orphans: their local
      // position gets one slab transform through the resident root.
      expect(residentFloorIndex(upperFire.light!, handles)).toBe(upperFloor);
      expect(upperFire.light!.position.y).toBeGreaterThan(0);
      expect(upperFire.light!.position.y).toBeLessThan(4.4);
      expect(upperFire.light!.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(
        floorSlabY(upperFloor) + upperFire.light!.position.y,
        5,
      );
      world.updateEffects(0.016, firePosition);
      const audio = world.getAudioFrame();
      expect(
        audio.fires.some(
          (anchor) =>
            Math.abs(anchor.x - firePosition.x) < 0.0001 &&
            Math.abs(anchor.z - firePosition.z) < 0.0001 &&
            Math.abs(anchor.y - (firePosition.y + upperFire.baseY)) < 0.0001,
        ),
      ).toBe(true);
    } finally {
      world.dispose();
      restoreDocument();
    }
  });

  test("keeps combat, audio, and timers scoped to the active resident enemy owner", () => {
    const restoreDocument = installCanvasDocument();
    const world = createWorld();
    try {
      const floorSet = generateDungeonFloorSet("RDL15-enemy-state-scope", { roomTarget: 8 }, 4);
      world.setDungeon(floorSet.floors[0]!, getDungeonMood("ash"), { stack: floorSet.floors });
      const floor0 = world.getResidentEnemyRuntime(0)!;
      const floor3 = world.getResidentEnemyRuntime(3)!;
      const actor0 = floor0.actors.find((actor) => actor.kind === "goblin") ?? floor0.actors[0]!;
      actor0.position.x = 1_000;
      actor0.position.z = 1_000;
      actor0.position.y = actor0.baseY;
      actor0.hitCooldown = 0;
      actor0.phaseVisibility = 1;
      for (const pickup of world.getActiveFloorRuntime()!.pickups) pickup.available = false;
      const contact = floor0.worldPositionInto(actor0.position, new THREE.Vector3());
      contact.y += 1.5;

      const activeHit = world.update(0, contact, false);
      expect(activeHit.damage).toBeGreaterThan(0);
      expect(world.getActiveEnemyRuntime()).toBe(floor0);

      world.update(0.25, new THREE.Vector3(10_000, 1.5, 10_000), false);
      const floor0Elapsed = floor0.simulationElapsed;
      expect(floor0Elapsed).toBeGreaterThan(0);

      // Put the same XZ under an inactive slab. Its state and audio must not
      // leak into the active floor's contact or enemy anchor projection.
      const actor3 = floor3.actors.find((actor) => actor.kind === actor0.kind) ?? floor3.actors[0]!;
      actor3.position.x = actor0.position.x;
      actor3.position.z = actor0.position.z;
      actor3.hitCooldown = 99;
      world.rebindActiveDungeon(floorSet.floors[3]!);
      for (const pickup of world.getActiveFloorRuntime()!.pickups) pickup.available = false;
      const upperPlayer = new THREE.Vector3(contact.x, floor3.floorSlabY + 1.5, contact.z);
      const inactiveFloorHit = world.update(0, upperPlayer, false);
      expect(inactiveFloorHit.damage).toBe(0);
      expect(world.getActiveEnemyRuntime()).toBe(floor3);
      expect(world.getAudioFrame().enemies.length).toBe(floor3.activeCount);
      expect(floor0.simulationElapsed).toBe(floor0Elapsed);

      world.update(0.25, new THREE.Vector3(10_000, floor3.floorSlabY + 1.5, 10_000), false);
      const floor3Elapsed = floor3.simulationElapsed;
      expect(floor3Elapsed).toBeGreaterThan(0);
      world.rebindActiveDungeon(floorSet.floors[0]!);
      expect(world.getActiveEnemyRuntime()).toBe(floor0);
      expect(floor0.simulationElapsed).toBe(floor0Elapsed);
      expect(floor3.simulationElapsed).toBe(floor3Elapsed);
    } finally {
      world.dispose();
      restoreDocument();
    }
  });

  test("scopes resident interactives to the active floor and rebinds without rebuilding", () => {
    const restoreDocument = installCanvasDocument();
    const world = createWorld();
    try {
      const floorSet = generateDungeonFloorSet("RDL12-runtime-map-fixture", { roomTarget: 8 }, 4);
      world.setDungeon(floorSet.floors[0]!, getDungeonMood("ash"), { stack: floorSet.floors });
      const internals = enemyInternals(world);
      const handles = internals.staticHandles;
      const floor0 = handles.residentFloors[0]!;
      const floor1 = handles.residentFloors[1]!;
      const floor3 = handles.residentFloors[3]!;

      expect(internals.activeFloorRuntime).toBe(floor0);
      expect({
        doors: floor0.doors.length,
        chests: floor0.chests.length,
        pickups: floor0.pickups.length,
      }).toEqual({
        doors: 7,
        chests: 13,
        pickups: 23,
      });

      let doorIterations = 0;
      let chestIterations = 0;
      let pickupIterations = 0;
      const restoreArrays = [
        replaceRuntimeArray(floor0, "doors", () => (doorIterations += 1)),
        replaceRuntimeArray(floor0, "chests", () => (chestIterations += 1)),
        replaceRuntimeArray(floor0, "pickups", () => (pickupIterations += 1)),
      ];
      try {
        world.update(0.016, new THREE.Vector3(10_000, 0, 10_000), false);
      } finally {
        restoreArrays.forEach((restore) => restore());
      }
      expect({ doorIterations, chestIterations, pickupIterations }).toEqual({
        doorIterations: 7,
        chestIterations: 13,
        pickupIterations: 23,
      });

      const lowerDoor = floor0.doors[0]!;
      const upperDoor = floor1.doors[0]!;
      const lowerChest = floor0.chests[0]!;
      const upperChest = floor1.chests[0]!;
      const lowerPickup = floor0.pickups.find((pickup) => pickup.kind === "stone")!;
      const upperPickup = floor1.pickups.find((pickup) => pickup.kind === "stone")!;
      upperDoor.root.position.x = lowerDoor.root.position.x;
      upperDoor.root.position.z = lowerDoor.root.position.z;
      upperChest.root.position.x = lowerChest.root.position.x;
      upperChest.root.position.z = lowerChest.root.position.z;
      upperPickup.object.position.x = lowerPickup.object.position.x;
      upperPickup.object.position.z = lowerPickup.object.position.z;

      const lowerDoorPosition = lowerDoor.root.getWorldPosition(new THREE.Vector3());
      world.update(0.016, lowerDoorPosition, false);
      expect(lowerDoor.targetOpen).toBe(true);
      expect(upperDoor.targetOpen).toBe(false);

      const lowerChestPosition = lowerChest.root.getWorldPosition(new THREE.Vector3());
      world.update(0.016, lowerChestPosition, false, true);
      expect(lowerChest.opened).toBe(true);
      expect(upperChest.opened).toBe(false);

      const lowerPickupPosition = lowerPickup.object.getWorldPosition(new THREE.Vector3());
      world.update(0.016, lowerPickupPosition, false);
      expect(lowerPickup.collected).toBe(true);
      expect(upperPickup.collected).toBe(false);

      world.rebindActiveDungeon(floorSet.floors[1]!);
      expect(internals.activeFloorRuntime).toBe(floor1);
      const upperChestPosition = upperChest.root.getWorldPosition(new THREE.Vector3());
      world.update(0.016, upperChestPosition, false, true);
      expect(upperChest.opened).toBe(true);

      const staticScene = internals.staticScene as unknown as {
        build: (...args: unknown[]) => unknown;
        buildStack: (...args: unknown[]) => unknown;
      };
      const originalBuild = staticScene.build;
      const originalBuildStack = staticScene.buildStack;
      const objectPrototype = THREE.Object3D.prototype;
      const matrixPrototype = THREE.Matrix4.prototype;
      const originalAdd = objectPrototype.add;
      const originalCompose = matrixPrototype.compose;
      let buildCalls = 0;
      let buildStackCalls = 0;
      let addCalls = 0;
      let composeCalls = 0;
      staticScene.build = (...args) => {
        buildCalls += 1;
        return originalBuild.apply(staticScene, args);
      };
      staticScene.buildStack = (...args) => {
        buildStackCalls += 1;
        return originalBuildStack.apply(staticScene, args);
      };
      objectPrototype.add = function (
        this: THREE.Object3D,
        ...objects: THREE.Object3D[]
      ): THREE.Object3D {
        addCalls += 1;
        return originalAdd.apply(this, objects);
      };
      matrixPrototype.compose = function (
        this: THREE.Matrix4,
        position: THREE.Vector3,
        quaternion: THREE.Quaternion,
        scale: THREE.Vector3,
      ): THREE.Matrix4 {
        composeCalls += 1;
        return originalCompose.call(this, position, quaternion, scale);
      };
      const floor0DoorBatch = floor0.doorBatchRoots[0]!;
      const floor0ChestBatch = floor0.chestBatchRoots[0]!;
      const colliderReferences = handles.solidColliders;
      try {
        world.rebindActiveDungeon(floorSet.floors[3]!);
        world.rebindActiveDungeon(floorSet.floors[0]!);
      } finally {
        staticScene.build = originalBuild;
        staticScene.buildStack = originalBuildStack;
        objectPrototype.add = originalAdd;
        matrixPrototype.compose = originalCompose;
      }
      expect({ buildCalls, buildStackCalls, addCalls, composeCalls }).toEqual({
        buildCalls: 0,
        buildStackCalls: 0,
        addCalls: 0,
        composeCalls: 0,
      });
      expect(internals.activeFloorRuntime).toBe(floor0);
      expect(handles.residentFloors.map((runtime) => runtime.root.visible)).toEqual([
        true,
        true,
        false,
        false,
      ]);
      expect(floor0.doorBatchRoots[0]).toBe(floor0DoorBatch);
      expect(floor0.chestBatchRoots[0]).toBe(floor0ChestBatch);
      expect(handles.solidColliders).toBe(colliderReferences);
      expect(lowerDoor.targetOpen).toBe(true);
      expect(lowerChest.opened).toBe(true);
      expect(lowerPickup.collected).toBe(true);
      expect(floor3.staircases).toHaveLength(0);
      expect(floor0.staircases[0]!.root.parent).toBe(floor0.root);
      expect(floor1.staircases[0]!.root.parent).toBe(floor1.root);
    } finally {
      world.dispose();
      restoreDocument();
    }
  });
});
