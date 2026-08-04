import * as THREE from "three";

import { createSeededRandom } from "../core/random";
import {
  gridToWorld,
  worldToGrid,
  WorldColliderSpatialIndex,
  type WorldCollider,
} from "../dungeon/gridCollision";
import type { DungeonData, DungeonRoom } from "../dungeon/types";
import {
  DEFAULT_DIFFICULTY,
  ENEMY_ACTIVATION_SPREAD,
  ENEMY_HARD_CAP,
  isEnemyKindUnlocked,
  resolveDifficultySnapshot,
  resolveDifficultyTuning,
  type DifficultySnapshot,
} from "../game/DifficultyDirector";
import type { DungeonMood } from "../systems/DungeonMood";
import { AssetLibrary } from "./AssetLibrary";
import {
  filterEnemyActivationCandidates,
  preferEnemyActivationPool,
  resolveSafeSpawnDistance,
} from "./EnemyActivation";
import {
  createEnemyBillboardMaterial,
  setEnemyBillboardFrame,
  setEnemyBillboardInstanceFrame,
} from "./EnemyBillboardMaterial";
import {
  enemyCeilingY,
  enemyGroundY,
  getEnemySpriteRenderMetrics,
  type EnemyKind,
} from "./EnemyArchetypes";
import {
  EnemyPresentation,
  type EnemyAnimationBatch,
  type EnemyPresentationActor,
} from "./EnemyPresentation";
import {
  buildDistributedEnemySpawns,
  buildInitialRoomEnemyQuotas,
  selectEnemyKindsForSpawns,
  totalEnemySeatBudget,
} from "./EnemySpawnPlan";
import { tickEnemySim, type EnemySimContext, type EnemySimResult } from "./EnemySim";
import { ENEMY_ROSTER, enemyAnimationSetsForMood } from "./EnemySpriteAtlas";
import {
  FloorOccupancyBit,
  FloorOccupancyOverlay,
  type CellOccupancyQuery,
} from "./FloorOccupancyGrid";
import { hasGridLineOfSight } from "./LightOcclusion";
import { swarmTargetEnemies } from "../game/SwarmCurse";
import type { ResidentFloorRuntime } from "./ResidentFloorRuntime";
import { ThreeResourceDisposer } from "./ThreeResourceDisposer";

export type ResidentEnemyActor = EnemyPresentationActor;

export interface ResidentEnemyRuntime {
  readonly floorIndex: number;
  readonly dungeon: DungeonData;
  readonly root: THREE.Group;
  readonly floorSlabY: number;
  readonly actors: readonly ResidentEnemyActor[];
  readonly reserveActors: readonly ResidentEnemyActor[];
  readonly billboardBatches: ReadonlySet<THREE.InstancedMesh>;
  readonly shadowBatches: ReadonlySet<THREE.InstancedMesh>;
  readonly visibilityAttributes: ReadonlySet<THREE.InstancedBufferAttribute>;
  readonly animationBatches: ReadonlyMap<EnemyKind, EnemyAnimationBatch>;
  readonly colliders: readonly WorldCollider[];
  readonly colliderIndex: WorldColliderSpatialIndex;
  readonly roomCount: number;
  readonly simulationElapsed: number;
  readonly animationElapsed: number;
  readonly difficultyElapsed: number;
  readonly biomeEventCycle: number;
  readonly difficultyState: Readonly<DifficultySnapshot>;
  readonly buildDurationMs: number;
  readonly seatCount: number;
  readonly activeCount: number;
  readonly reserveCount: number;
  readonly rawBatchCount: number;
  readonly isDisposed: boolean;
  localPlayerPosition(player: THREE.Vector3Like): THREE.Vector3;
  worldPositionInto(position: THREE.Vector3Like, target: THREE.Vector3): THREE.Vector3;
  dispose(resourceDisposer: ThreeResourceDisposer): void;
}

export interface ResidentEnemyActivationInput {
  readonly mode: "opening" | "play" | "resume";
  readonly difficulty: number;
  readonly stonesFound: number;
  readonly swarmCurseActive: boolean;
  readonly wardActive: boolean;
  readonly pulseActive: boolean;
  readonly wardRadius: number;
  readonly pulseRadius: number;
}

export interface ResidentEnemyPresentationInput {
  readonly player: THREE.Vector3Like;
  readonly delta: number;
  readonly revealSeconds: number;
  readonly frozen: boolean;
  readonly moodId: string;
  readonly trail: Parameters<EnemyPresentation["update"]>[0]["trail"];
}

export interface ResidentEnemyRuntimeBuildInput {
  readonly dungeon: DungeonData;
  readonly floorRuntime: ResidentFloorRuntime;
  readonly assets: AssetLibrary;
  readonly mood: DungeonMood;
  readonly shadowMaterial: THREE.MeshBasicMaterial;
  readonly tileSize: number;
  readonly wallHeight: number;
  readonly difficulty: number;
}

function roomDistance(dungeon: DungeonData, room: DungeonRoom): number {
  return dungeon.distances[room.center.y * dungeon.width + room.center.x] ?? -1;
}

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

/**
 * Owns the mutable enemy state for one resident dungeon slab. Its root uses
 * floor-local coordinates and attaches exactly once to the static floor root.
 */
export class ResidentEnemyRuntimeOwner implements ResidentEnemyRuntime {
  readonly floorIndex: number;
  readonly dungeon: DungeonData;
  readonly root = new THREE.Group();
  readonly floorSlabY: number;
  private readonly mutableActors: ResidentEnemyActor[] = [];
  readonly actors: readonly ResidentEnemyActor[] = this.mutableActors;
  private readonly mutableReserveActors: ResidentEnemyActor[] = [];
  readonly reserveActors: readonly ResidentEnemyActor[] = this.mutableReserveActors;
  private readonly mutableBillboardBatches = new Set<THREE.InstancedMesh>();
  readonly billboardBatches: ReadonlySet<THREE.InstancedMesh> = this.mutableBillboardBatches;
  private readonly mutableShadowBatches = new Set<THREE.InstancedMesh>();
  readonly shadowBatches: ReadonlySet<THREE.InstancedMesh> = this.mutableShadowBatches;
  private readonly mutableVisibilityAttributes = new Set<THREE.InstancedBufferAttribute>();
  readonly visibilityAttributes: ReadonlySet<THREE.InstancedBufferAttribute> =
    this.mutableVisibilityAttributes;
  private readonly mutableAnimationBatches = new Map<EnemyKind, EnemyAnimationBatch>();
  readonly animationBatches: ReadonlyMap<EnemyKind, EnemyAnimationBatch> =
    this.mutableAnimationBatches;
  readonly colliders: readonly WorldCollider[];
  readonly colliderIndex: WorldColliderSpatialIndex;
  readonly roomCount: number;
  readonly presentation = new EnemyPresentation();
  private readonly localPlayer = new THREE.Vector3();
  private activationRandom: ReturnType<typeof createSeededRandom>;
  private simulationElapsedValue = 0;
  private animationElapsedValue = 0;
  private difficultyElapsedValue = 0;
  private difficultySecond = -1;
  private biomeEventCycleValue = -1;
  private kindRotation = 0;
  private difficultyStateValue: DifficultySnapshot = resolveDifficultySnapshot(
    DEFAULT_DIFFICULTY,
    0,
    1,
    0,
    0,
  );
  private buildDurationMsValue = 0;
  private built = false;
  private disposed = false;

  constructor(private readonly input: ResidentEnemyRuntimeBuildInput) {
    this.floorIndex = input.floorRuntime.floorIndex;
    this.dungeon = input.dungeon;
    this.floorSlabY = input.floorRuntime.root.position.y;
    this.colliders = input.floorRuntime.colliders;
    this.colliderIndex = new WorldColliderSpatialIndex(this.colliders, input.tileSize * 2);
    this.roomCount = Math.max(1, input.dungeon.rooms.filter((room) => room.role === "room").length);
    this.activationRandom = createSeededRandom(`${input.dungeon.seed}:difficulty-activation`);
    this.root.name = `Dungeon resident enemies ${this.floorIndex + 1}`;
    this.root.userData.floorIndex = this.floorIndex;
    this.root.visible = false;
  }

  get simulationElapsed(): number {
    return this.simulationElapsedValue;
  }

  get animationElapsed(): number {
    return this.animationElapsedValue;
  }

  get difficultyElapsed(): number {
    return this.difficultyElapsedValue;
  }

  get biomeEventCycle(): number {
    return this.biomeEventCycleValue;
  }

  get difficultyState(): Readonly<DifficultySnapshot> {
    return this.difficultyStateValue;
  }

  get buildDurationMs(): number {
    return this.buildDurationMsValue;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get seatCount(): number {
    return this.mutableActors.length + this.mutableReserveActors.length;
  }

  get rawBatchCount(): number {
    return this.mutableBillboardBatches.size + this.mutableShadowBatches.size;
  }

  get activeCount(): number {
    return this.mutableActors.length;
  }

  get reserveCount(): number {
    return this.mutableReserveActors.length;
  }

  /** Build immutable batches and all mutable enemy seats once for this floor. */
  build(): void {
    this.assertActive();
    if (this.built) throw new Error("ResidentEnemyRuntime cannot build twice.");
    const startedAt = nowMs();
    try {
      const { dungeon, assets, mood, shadowMaterial, tileSize, wallHeight, difficulty } =
        this.input;
      const random = createSeededRandom(`${dungeon.seed}:actors`);
      const enemyRooms = dungeon.rooms
        .filter((room) => room.role === "room")
        .sort((left, right) => roomDistance(dungeon, left) - roomDistance(dungeon, right));
      const kinds: readonly EnemyKind[] = ENEMY_ROSTER;
      const authoredSpawns = dungeon.forge?.spawns.length
        ? dungeon.forge.spawns
            .filter(
              (spawn) =>
                !this.input.floorRuntime.occupancy.hasAny(
                  spawn.x,
                  spawn.y,
                  FloorOccupancyBit.Objective,
                ) &&
                !this.input.floorRuntime.occupancy.hasAny(
                  spawn.x,
                  spawn.y,
                  FloorOccupancyBit.Object |
                    FloorOccupancyBit.Solid |
                    FloorOccupancyBit.WallDecoration,
                ),
            )
            .map((spawn) => {
              const room = enemyRooms.find(
                (candidate) =>
                  spawn.x >= candidate.x &&
                  spawn.x < candidate.x + candidate.width &&
                  spawn.y >= candidate.y &&
                  spawn.y < candidate.y + candidate.height,
              );
              return {
                cell: { x: spawn.x, y: spawn.y },
                tier: spawn.tier,
                roomId: room?.id ?? -1,
                pass: 2,
              };
            })
        : [];
      const seatBudget = Math.max(enemyRooms.length * 2, totalEnemySeatBudget(enemyRooms));
      const distributedTarget = Math.min(
        ENEMY_HARD_CAP,
        Math.max(seatBudget, Math.round(seatBudget * (0.9 + difficulty * 0.35))),
      );
      const maxPool = Math.min(ENEMY_HARD_CAP + 32, distributedTarget + authoredSpawns.length);
      const explicitExclusions = new FloorOccupancyOverlay(dungeon.width, dungeon.height);
      explicitExclusions.mark(dungeon.spawn.x, dungeon.spawn.y, FloorOccupancyBit.Object);
      explicitExclusions.mark(dungeon.exit.x, dungeon.exit.y, FloorOccupancyBit.Object);
      authoredSpawns.forEach((spawn) =>
        explicitExclusions.mark(spawn.cell.x, spawn.cell.y, FloorOccupancyBit.Object),
      );
      const excludedBits =
        FloorOccupancyBit.Object |
        FloorOccupancyBit.Solid |
        FloorOccupancyBit.WallDecoration |
        FloorOccupancyBit.Hazard |
        FloorOccupancyBit.Objective;
      const excludedSpawnCells: CellOccupancyQuery = {
        isOccupied: (x, y) =>
          this.input.floorRuntime.occupancy.hasAny(x, y, excludedBits) ||
          explicitExclusions.isOccupied(x, y),
      };
      const distributedSpawns = buildDistributedEnemySpawns(
        dungeon.seed,
        enemyRooms,
        distributedTarget,
        excludedSpawnCells,
      );
      const spawnRecords = [...distributedSpawns, ...authoredSpawns].slice(0, maxPool);
      const entranceRoom = enemyRooms.find(
        (room) =>
          dungeon.spawn.x >= room.x &&
          dungeon.spawn.x < room.x + room.width &&
          dungeon.spawn.y >= room.y &&
          dungeon.spawn.y < room.y + room.height,
      );
      const openingTuning = resolveDifficultyTuning(
        difficulty,
        enemyRooms.length,
        spawnRecords.length,
      );
      const openingQuotas = buildInitialRoomEnemyQuotas(
        dungeon.seed,
        enemyRooms,
        openingTuning.initialEnemies,
        entranceRoom?.id,
      );
      const usedOpeningSlots = new Map<number, number>();
      const plannedSpawns = spawnRecords.map((spawn) => {
        const used = usedOpeningSlots.get(spawn.roomId) ?? 0;
        const quota = openingQuotas.get(spawn.roomId) ?? 0;
        const startsActive = used < quota;
        if (startsActive) usedOpeningSlots.set(spawn.roomId, used + 1);
        return { ...spawn, tier: startsActive ? 0 : spawn.tier, startsActive };
      });
      this.activationRandom = createSeededRandom(`${dungeon.seed}:difficulty-activation`);
      this.kindRotation = 0;
      const selectedKinds = selectEnemyKindsForSpawns(
        dungeon.seed,
        plannedSpawns.map((spawn) => ({ tier: spawn.tier, roomId: spawn.roomId })),
      );
      const actorSpecs = plannedSpawns.map((spawn, index) => {
        const kind = selectedKinds[index] ?? kinds[index % kinds.length] ?? "goblin";
        const sprite = getEnemySpriteRenderMetrics(kind, mood.id);
        const p = gridToWorld(dungeon, spawn.cell, tileSize);
        const spawnY =
          kind === "imp"
            ? enemyCeilingY(kind, wallHeight, 0.38, mood.id)
            : enemyGroundY(kind, mood.id);
        return {
          kind,
          width: sprite.planeWidth,
          height: sprite.planeHeight,
          tier: spawn.tier,
          startsActive: spawn.startsActive,
          position: new THREE.Vector3(
            p.x + (random.next() - 0.5) * 0.56,
            spawnY,
            p.z + (random.next() - 0.5) * 0.56,
          ),
          phase: index * 1.37 + 1.1,
          shadowInstanceIndex: index,
        };
      });
      const sharedShadowBatch =
        actorSpecs.length > 0
          ? new THREE.InstancedMesh(
              new THREE.PlaneGeometry(1, 1),
              shadowMaterial,
              actorSpecs.length,
            )
          : null;
      if (sharedShadowBatch) {
        sharedShadowBatch.name = `Enemy shared contact shadow batch floor ${this.floorIndex + 1}`;
        sharedShadowBatch.renderOrder = 1;
        sharedShadowBatch.frustumCulled = true;
      }
      const moodAnimationSets = enemyAnimationSetsForMood(mood.id);
      for (const kind of kinds) {
        const specs = actorSpecs.filter((spec) => spec.kind === kind);
        if (specs.length === 0) continue;
        const animations = moodAnimationSets[kind];
        const animation = animations.movement;
        const texture = assets.enemyAnimation(animation);
        const material = createEnemyBillboardMaterial(texture, mood);
        setEnemyBillboardFrame(material, animation, 0);
        const atlasFrameAttribute = new THREE.InstancedBufferAttribute(
          new Float32Array(specs.length * 4),
          4,
        );
        atlasFrameAttribute.setUsage(THREE.DynamicDrawUsage);
        this.mutableAnimationBatches.set(kind, {
          kind,
          material,
          animation,
          attackAnimation: animations.attack,
          atlasFrameAttribute,
          frame: 0,
          phaseOffset: this.mutableAnimationBatches.size * 0.03125,
        });
        const billboardGeometry = new THREE.PlaneGeometry(1, 1);
        const visibilityAttribute = new THREE.InstancedBufferAttribute(
          new Float32Array(specs.length),
          1,
        );
        billboardGeometry.setAttribute("aEnemyVisibility", visibilityAttribute);
        billboardGeometry.setAttribute("aEnemyAtlasFrame", atlasFrameAttribute);
        this.mutableVisibilityAttributes.add(visibilityAttribute);
        const batch = new THREE.InstancedMesh(billboardGeometry, material, specs.length);
        batch.name = `Enemy billboard batch ${kind} floor ${this.floorIndex + 1}`;
        batch.renderOrder = 2;
        batch.frustumCulled = true;
        specs.forEach((spec, instanceIndex) => {
          setEnemyBillboardInstanceFrame(atlasFrameAttribute, instanceIndex, animation, 0);
          if (!sharedShadowBatch) return;
          const actor: ResidentEnemyActor = {
            kind,
            position: spec.position,
            batch,
            shadowBatch: sharedShadowBatch,
            instanceIndex,
            shadowInstanceIndex: spec.shadowInstanceIndex,
            hitCooldown: 0,
            baseY: spec.position.y,
            baseScale: new THREE.Vector2(spec.width, spec.height),
            phase: spec.phase,
            attackPulse: 0,
            scaleX: spec.width,
            scaleY: spec.height,
            roll: 0,
            yaw: 0,
            phaseEpoch: -1,
            phaseVisibility: 1,
            spawnReveal: 0,
            startsActive: spec.startsActive,
            moving: false,
            visibilityAttribute,
            tier: spec.tier,
            defeated: false,
          };
          this.mutableReserveActors.push(actor);
          batch.setMatrixAt(
            instanceIndex,
            new THREE.Matrix4().compose(
              actor.position,
              new THREE.Quaternion(),
              new THREE.Vector3(actor.scaleX, actor.scaleY, 1),
            ),
          );
          if (actor.startsActive) {
            this.presentation.writeContactShadow(actor, 1, mood.id);
          } else {
            sharedShadowBatch.setMatrixAt(
              spec.shadowInstanceIndex,
              new THREE.Matrix4().compose(
                new THREE.Vector3(actor.position.x, 0.028, actor.position.z),
                new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
                new THREE.Vector3(0, 0, 1),
              ),
            );
          }
        });
        batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        batch.instanceMatrix.needsUpdate = true;
        batch.computeBoundingSphere();
        if (batch.boundingSphere)
          batch.boundingSphere.radius = Math.max(batch.boundingSphere.radius, 24);
        this.mutableBillboardBatches.add(batch);
        this.root.add(batch);
      }
      if (sharedShadowBatch) {
        sharedShadowBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        sharedShadowBatch.instanceMatrix.needsUpdate = true;
        sharedShadowBatch.computeBoundingSphere();
        if (sharedShadowBatch.boundingSphere) {
          sharedShadowBatch.boundingSphere.radius = Math.max(
            sharedShadowBatch.boundingSphere.radius,
            24,
          );
        }
        this.mutableShadowBatches.add(sharedShadowBatch);
        this.root.add(sharedShadowBatch);
      }
      const entrance = gridToWorld(dungeon, dungeon.spawn, tileSize);
      this.activateEnemiesToTarget(entrance, {
        mode: "opening",
        difficulty,
        stonesFound: 0,
        swarmCurseActive: false,
        wardActive: false,
        pulseActive: false,
        wardRadius: 0,
        pulseRadius: 0,
      });
      this.built = true;
    } finally {
      this.buildDurationMsValue = Math.max(0, nowMs() - startedAt);
    }
  }

  setActive(active: boolean): void {
    this.assertActive();
    this.root.visible = active;
  }

  localPlayerPosition(player: THREE.Vector3Like): THREE.Vector3 {
    return this.localPlayer.set(player.x, player.y - this.floorSlabY, player.z);
  }

  worldPositionInto(position: THREE.Vector3Like, target: THREE.Vector3): THREE.Vector3 {
    return target.set(position.x, position.y + this.floorSlabY, position.z);
  }

  advanceTimers(delta: number, frozen: boolean): void {
    this.assertActive();
    if (frozen) return;
    const safeDelta = Math.max(0, delta);
    this.animationElapsedValue += safeDelta;
    this.simulationElapsedValue += safeDelta;
    this.difficultyElapsedValue += safeDelta;
  }

  refreshDifficulty(difficulty: number, stonesFound: number): Readonly<DifficultySnapshot> {
    this.assertActive();
    this.difficultyStateValue = resolveDifficultySnapshot(
      difficulty,
      this.difficultyElapsedValue,
      this.roomCount,
      this.mutableActors.length,
      this.mutableReserveActors.length,
      stonesFound,
    );
    return this.difficultyStateValue;
  }

  updateDifficulty(
    player: { x: number; z: number },
    input: Omit<ResidentEnemyActivationInput, "mode">,
  ): void {
    this.assertActive();
    const second = Math.floor(this.difficultyElapsedValue);
    if (second === this.difficultySecond) return;
    this.difficultySecond = second;
    this.activateEnemiesToTarget(player, { ...input, mode: "play" });
  }

  activateEnemiesToTarget(
    player: { x: number; z: number },
    input: ResidentEnemyActivationInput,
  ): void {
    this.assertActive();
    const difficultyState = this.refreshDifficulty(input.difficulty, input.stonesFound);
    const target = Math.min(
      ENEMY_HARD_CAP,
      swarmTargetEnemies(difficultyState.targetEnemies, input.swarmCurseActive),
    );
    const safeSpawnDistance = resolveSafeSpawnDistance({
      base: difficultyState.safeSpawnDistance,
      wardActive: input.wardActive,
      pulseActive: input.pulseActive,
      wardRadius: input.wardRadius,
      pulseRadius: input.pulseRadius,
    });
    const activatedThisPulse: THREE.Vector3[] = [];
    const unlockedMaxTier = difficultyState.unlockedMaxTier;
    while (this.mutableActors.length < target) {
      const candidates = filterEnemyActivationCandidates(this.mutableReserveActors, {
        mode: input.mode,
        player,
        unlockedMaxTier,
        safeSpawnDistance,
        minSpread: ENEMY_ACTIVATION_SPREAD,
        isKindUnlocked: (kind) =>
          isEnemyKindUnlocked(
            kind as EnemyKind,
            this.difficultyElapsedValue,
            difficultyState,
            input.stonesFound,
          ),
        isObjectOccupied: (position) => {
          const cell = worldToGrid(this.dungeon, position, this.input.tileSize);
          return this.input.floorRuntime.occupancy.hasAny(
            cell.x,
            cell.y,
            FloorOccupancyBit.Object | FloorOccupancyBit.Solid | FloorOccupancyBit.WallDecoration,
          );
        },
        hasLineOfSight: (position) =>
          hasGridLineOfSight(this.dungeon, player, position, this.input.tileSize),
      });
      if (candidates.length === 0) break;
      const pool = preferEnemyActivationPool(
        this.mutableReserveActors,
        candidates,
        this.mutableActors.map((enemy) => enemy.position),
        activatedThisPulse,
        unlockedMaxTier,
        ENEMY_ACTIVATION_SPREAD,
      );
      const selectedIndex = pool[this.activationRandom.integer(0, pool.length - 1)]!;
      const [enemy] = this.mutableReserveActors.splice(selectedIndex, 1);
      if (!enemy) break;
      enemy.spawnReveal = input.mode === "play" ? 0 : 1;
      enemy.hitCooldown =
        input.mode === "play"
          ? Math.max(enemy.hitCooldown, difficultyState.revealSeconds)
          : enemy.hitCooldown;
      this.kindRotation += 1;
      this.mutableActors.push(enemy);
      activatedThisPulse.push(enemy.position);
    }
    this.refreshDifficulty(input.difficulty, input.stonesFound);
  }

  tick(
    input: Omit<EnemySimContext, "elapsed" | "dungeon" | "solidColliders" | "solidColliderIndex">,
  ): EnemySimResult {
    this.assertActive();
    return tickEnemySim(this.mutableActors, {
      ...input,
      elapsed: this.simulationElapsedValue,
      dungeon: this.dungeon,
      solidColliders: this.colliders,
      solidColliderIndex: this.colliderIndex,
    });
  }

  present(input: ResidentEnemyPresentationInput): void {
    this.assertActive();
    this.presentation.update({
      actors: this.mutableActors,
      billboardBatches: this.mutableBillboardBatches,
      shadowBatches: this.mutableShadowBatches,
      visibilityAttributes: this.mutableVisibilityAttributes,
      animationBatches: this.mutableAnimationBatches,
      animationElapsed: this.animationElapsedValue,
      revealSeconds: input.revealSeconds,
      frozen: input.frozen,
      player: input.player,
      delta: input.delta,
      moodId: input.moodId,
      trail: input.trail,
    });
  }

  defeat(actor: ResidentEnemyActor): void {
    this.assertActive();
    actor.defeated = true;
    actor.scaleX = 0;
    actor.scaleY = 0;
    actor.phaseVisibility = 0;
    actor.spawnReveal = 0;
    actor.moving = false;
  }

  restoreDifficultyElapsed(value: number): void {
    this.assertActive();
    this.difficultyElapsedValue = Math.max(0, value);
    this.difficultySecond = Math.floor(this.difficultyElapsedValue);
  }

  setBiomeEventCycle(cycle: number): void {
    this.assertActive();
    this.biomeEventCycleValue = Number.isFinite(cycle) ? Math.floor(cycle) : -1;
  }

  dispose(resourceDisposer: ThreeResourceDisposer): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.parent?.remove(this.root);
    try {
      resourceDisposer.dispose(this.root);
    } finally {
      this.root.clear();
      this.mutableActors.length = 0;
      this.mutableReserveActors.length = 0;
      this.mutableBillboardBatches.clear();
      this.mutableShadowBatches.clear();
      this.mutableVisibilityAttributes.clear();
      this.mutableAnimationBatches.clear();
    }
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("ResidentEnemyRuntime has been disposed.");
  }
}
