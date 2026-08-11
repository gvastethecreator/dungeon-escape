import * as THREE from "three";

import type { WorldCollider } from "../dungeon/gridCollision";
import type { ResidentMinimapProjection } from "../ui/projectMinimapFeatures";
import { FixedSceneEffects } from "./FixedSceneEffects";
import { FloorOccupancyGrid } from "./FloorOccupancyGrid";
import type { HazardTileSystem } from "./HazardTileSystem";
import { disposeLiquidSectionKit, type LiquidSectionKit } from "./LiquidSectionKit";
import type {
  StaticChestActor,
  StaticDoorActor,
  StaticPickupActor,
  StaticStairActor,
} from "./StaticDungeonActorTypes";
import type {
  StaticCeilingBiomeSprite,
  StaticFireEffect,
  StaticFloorBiomeSprite,
} from "./StaticDungeonScene";
import type { ResidentEnemyRuntime } from "./ResidentEnemyRuntime";
import { ThreeResourceDisposer } from "./ThreeResourceDisposer";
import type { UncannyWallRuntime } from "./UncannyWallRuntime";

export interface ResidentFloorRuntime {
  readonly floorIndex: number;
  readonly root: THREE.Group;
  /** Expensive props and actors render only while this floor owns simulation. */
  readonly detailRoot: THREE.Group;
  readonly occupancy: FloorOccupancyGrid;
  readonly colliders: readonly WorldCollider[];
  readonly doors: readonly StaticDoorActor[];
  readonly chests: readonly StaticChestActor[];
  readonly pickups: readonly StaticPickupActor[];
  readonly staircases: readonly StaticStairActor[];
  /** Roots contain only immutable frame instances for this resident floor. */
  readonly doorBatchRoots: readonly THREE.Group[];
  /** Roots contain only immutable chest body and lid instances for this floor. */
  readonly chestBatchRoots: readonly THREE.Group[];
  /** Fires and related LOD/LOS state are authored and updated by one floor only. */
  readonly fires: readonly StaticFireEffect[];
  readonly floorBiomeSprites: readonly StaticFloorBiomeSprite[];
  readonly ceilingBiomeSprites: readonly StaticCeilingBiomeSprite[];
  readonly ambientBeams: readonly THREE.Mesh[];
  readonly stoneBeams: readonly THREE.Mesh[];
  readonly hazardCells: ReadonlySet<string>;
  readonly hazardTileSystem: HazardTileSystem | null;
  readonly liquidKit: LiquidSectionKit | null;
  readonly fixedSceneEffects: FixedSceneEffects;
  readonly uncannyWallRuntime: UncannyWallRuntime | null;
  readonly minimapProjection: ResidentMinimapProjection | null;
  /** Batches and selected lights stay in the resident-local slab frame. */
  readonly wallFireBatchRoots: readonly THREE.Group[];
  readonly dynamicFireLights: readonly THREE.PointLight[];
  /** Enemy seats and batches share this floor-local scene frame. */
  readonly enemyRuntime: ResidentEnemyRuntime | null;
}

/**
 * One resident dungeon slab. The scene keeps aggregate handles temporarily,
 * but this object owns the floor root, occupancy, colliders, and interactives.
 */
export class ResidentFloorRuntimeOwner implements ResidentFloorRuntime {
  readonly floorIndex: number;
  readonly root: THREE.Group;
  readonly detailRoot: THREE.Group;
  readonly occupancy: FloorOccupancyGrid;
  private readonly mutableColliders: WorldCollider[] = [];
  readonly colliders: readonly WorldCollider[] = this.mutableColliders;
  private readonly mutableDoors: StaticDoorActor[] = [];
  readonly doors: readonly StaticDoorActor[] = this.mutableDoors;
  private readonly mutableChests: StaticChestActor[] = [];
  readonly chests: readonly StaticChestActor[] = this.mutableChests;
  private readonly mutablePickups: StaticPickupActor[] = [];
  readonly pickups: readonly StaticPickupActor[] = this.mutablePickups;
  private readonly mutableStaircases: StaticStairActor[] = [];
  readonly staircases: readonly StaticStairActor[] = this.mutableStaircases;
  private readonly mutableDoorBatchRoots: THREE.Group[] = [];
  readonly doorBatchRoots: readonly THREE.Group[] = this.mutableDoorBatchRoots;
  private readonly mutableChestBatchRoots: THREE.Group[] = [];
  readonly chestBatchRoots: readonly THREE.Group[] = this.mutableChestBatchRoots;
  private readonly mutableFires: StaticFireEffect[] = [];
  readonly fires: readonly StaticFireEffect[] = this.mutableFires;
  private readonly mutableFloorBiomeSprites: StaticFloorBiomeSprite[] = [];
  readonly floorBiomeSprites: readonly StaticFloorBiomeSprite[] = this.mutableFloorBiomeSprites;
  private readonly mutableCeilingBiomeSprites: StaticCeilingBiomeSprite[] = [];
  readonly ceilingBiomeSprites: readonly StaticCeilingBiomeSprite[] =
    this.mutableCeilingBiomeSprites;
  private readonly mutableAmbientBeams: THREE.Mesh[] = [];
  readonly ambientBeams: readonly THREE.Mesh[] = this.mutableAmbientBeams;
  private readonly mutableStoneBeams: THREE.Mesh[] = [];
  readonly stoneBeams: readonly THREE.Mesh[] = this.mutableStoneBeams;
  private readonly mutableHazardCells = new Set<string>();
  readonly hazardCells: ReadonlySet<string> = this.mutableHazardCells;
  private mutableHazardTileSystem: HazardTileSystem | null = null;
  private mutableLiquidKit: LiquidSectionKit | null = null;
  readonly fixedSceneEffects = new FixedSceneEffects();
  private mutableUncannyWallRuntime: UncannyWallRuntime | null = null;
  private mutableMinimapProjection: ResidentMinimapProjection | null = null;
  private readonly mutableWallFireBatchRoots: THREE.Group[] = [];
  readonly wallFireBatchRoots: readonly THREE.Group[] = this.mutableWallFireBatchRoots;
  private readonly mutableDynamicFireLights: THREE.PointLight[] = [];
  readonly dynamicFireLights: readonly THREE.PointLight[] = this.mutableDynamicFireLights;
  private mutableEnemyRuntime: ResidentEnemyRuntime | null = null;
  private disposed = false;

  constructor(floorIndex: number, width: number, height: number, slabY = 0) {
    this.floorIndex = floorIndex;
    this.root = new THREE.Group();
    this.root.name = `Dungeon resident floor ${floorIndex + 1}`;
    this.root.userData.floorIndex = floorIndex;
    this.root.position.y = slabY;
    this.detailRoot = new THREE.Group();
    this.detailRoot.name = `Dungeon resident floor ${floorIndex + 1} active detail`;
    this.detailRoot.userData.floorIndex = floorIndex;
    this.root.add(this.detailRoot);
    this.occupancy = new FloorOccupancyGrid(floorIndex, width, height);
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get hazardTileSystem(): HazardTileSystem | null {
    return this.mutableHazardTileSystem;
  }

  get liquidKit(): LiquidSectionKit | null {
    return this.mutableLiquidKit;
  }

  get minimapProjection(): ResidentMinimapProjection | null {
    return this.mutableMinimapProjection;
  }

  get uncannyWallRuntime(): UncannyWallRuntime | null {
    return this.mutableUncannyWallRuntime;
  }

  get enemyRuntime(): ResidentEnemyRuntime | null {
    return this.mutableEnemyRuntime;
  }

  addCollider(collider: WorldCollider): void {
    this.assertActive();
    this.mutableColliders.push(collider);
  }

  addColliders(colliders: readonly WorldCollider[]): void {
    this.assertActive();
    this.mutableColliders.push(...colliders);
  }

  registerDoor(door: StaticDoorActor): void {
    this.assertActive();
    this.mutableDoors.push(door);
  }

  registerChest(chest: StaticChestActor): void {
    this.assertActive();
    this.mutableChests.push(chest);
  }

  registerPickup(pickup: StaticPickupActor): void {
    this.assertActive();
    this.mutablePickups.push(pickup);
  }

  registerStaircase(staircase: StaticStairActor): void {
    this.assertActive();
    this.mutableStaircases.push(staircase);
  }

  registerDoorBatchRoot(root: THREE.Group): void {
    this.assertActive();
    this.mutableDoorBatchRoots.push(root);
  }

  registerChestBatchRoot(root: THREE.Group): void {
    this.assertActive();
    this.mutableChestBatchRoots.push(root);
  }

  registerFire(fire: StaticFireEffect): void {
    this.assertActive();
    this.mutableFires.push(fire);
  }

  registerFloorBiomeSprite(sprite: StaticFloorBiomeSprite): void {
    this.assertActive();
    this.mutableFloorBiomeSprites.push(sprite);
  }

  registerCeilingBiomeSprite(sprite: StaticCeilingBiomeSprite): void {
    this.assertActive();
    this.mutableCeilingBiomeSprites.push(sprite);
  }

  registerAmbientBeam(beam: THREE.Mesh): void {
    this.assertActive();
    this.mutableAmbientBeams.push(beam);
  }

  registerStoneBeam(beam: THREE.Mesh): void {
    this.assertActive();
    this.mutableStoneBeams.push(beam);
  }

  registerHazardCell(cell: string): void {
    this.assertActive();
    this.mutableHazardCells.add(cell);
  }

  setHazardTileSystem(system: HazardTileSystem | null): void {
    this.assertActive();
    if (this.mutableHazardTileSystem && this.mutableHazardTileSystem !== system) {
      throw new Error("ResidentFloorRuntime already owns a hazard tile system.");
    }
    this.mutableHazardTileSystem = system;
  }

  setLiquidKit(kit: LiquidSectionKit | null): void {
    this.assertActive();
    if (this.mutableLiquidKit && this.mutableLiquidKit !== kit) {
      throw new Error("ResidentFloorRuntime already owns a liquid section kit.");
    }
    this.mutableLiquidKit = kit;
  }

  setMinimapProjection(projection: ResidentMinimapProjection): void {
    this.assertActive();
    if (this.mutableMinimapProjection && this.mutableMinimapProjection !== projection) {
      throw new Error("ResidentFloorRuntime already owns a minimap projection.");
    }
    this.mutableMinimapProjection = projection;
  }

  setUncannyWallRuntime(runtime: UncannyWallRuntime): void {
    this.assertActive();
    if (this.mutableUncannyWallRuntime && this.mutableUncannyWallRuntime !== runtime) {
      throw new Error("ResidentFloorRuntime already owns an uncanny wall runtime.");
    }
    this.mutableUncannyWallRuntime = runtime;
  }

  registerWallFireBatchRoot(root: THREE.Group): void {
    this.assertActive();
    this.mutableWallFireBatchRoots.push(root);
  }

  registerDynamicFireLight(light: THREE.PointLight): void {
    this.assertActive();
    this.mutableDynamicFireLights.push(light);
  }

  /** Attach the one enemy owner before it creates any floor-local batches. */
  attachEnemyRuntime(runtime: ResidentEnemyRuntime): void {
    this.assertActive();
    if (this.mutableEnemyRuntime && this.mutableEnemyRuntime !== runtime) {
      throw new Error("ResidentFloorRuntime already owns an enemy runtime.");
    }
    this.mutableEnemyRuntime = runtime;
    if (runtime.root.parent !== this.detailRoot) this.detailRoot.add(runtime.root);
  }

  /** Move non-architectural direct children behind one active-floor visibility switch. */
  partitionPresentation(keepsNeighborContinuity: (object: THREE.Object3D) => boolean): void {
    this.assertActive();
    const directChildren = this.root.children.slice();
    for (const object of directChildren) {
      if (object === this.detailRoot || keepsNeighborContinuity(object)) continue;
      this.detailRoot.add(object);
    }
  }

  /**
   * Detach and dispose this floor exactly once. The caller shares one ledger
   * across all floor and global roots so common Three resources release once.
   */
  dispose(resourceDisposer: ThreeResourceDisposer): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.parent?.remove(this.root);
    let cleanupError: unknown;
    let hasCleanupError = false;
    const clean = (operation: () => void): void => {
      try {
        operation();
      } catch (error) {
        if (!hasCleanupError) {
          hasCleanupError = true;
          cleanupError = error;
        }
      }
    };
    try {
      // Systems own registered textures and must unregister them before the
      // generic graph walk. Their roots are removed/cleared so no resource can
      // be disposed a second time by ThreeResourceDisposer.
      const liquidKit = this.mutableLiquidKit;
      this.mutableLiquidKit = null;
      if (liquidKit) {
        liquidKit.root.parent?.remove(liquidKit.root);
        clean(() => disposeLiquidSectionKit(liquidKit));
      }
      const hazardTileSystem = this.mutableHazardTileSystem;
      this.mutableHazardTileSystem = null;
      if (hazardTileSystem) {
        hazardTileSystem.root.parent?.remove(hazardTileSystem.root);
        clean(() => hazardTileSystem.dispose());
      }
      clean(() => this.fixedSceneEffects.dispose());
      const enemyRuntime = this.mutableEnemyRuntime;
      this.mutableEnemyRuntime = null;
      if (enemyRuntime) clean(() => enemyRuntime.dispose(resourceDisposer));
      clean(() => resourceDisposer.dispose(this.root));
    } finally {
      this.root.clear();
      this.occupancy.clear();
      this.mutableColliders.length = 0;
      this.mutableDoors.length = 0;
      this.mutableChests.length = 0;
      this.mutablePickups.length = 0;
      this.mutableStaircases.length = 0;
      this.mutableDoorBatchRoots.length = 0;
      this.mutableChestBatchRoots.length = 0;
      this.mutableFires.length = 0;
      this.mutableFloorBiomeSprites.length = 0;
      this.mutableCeilingBiomeSprites.length = 0;
      this.mutableUncannyWallRuntime = null;
      this.mutableAmbientBeams.length = 0;
      this.mutableStoneBeams.length = 0;
      this.mutableHazardCells.clear();
      clean(() => this.mutableMinimapProjection?.clear());
      this.mutableMinimapProjection = null;
      this.mutableWallFireBatchRoots.length = 0;
      this.mutableDynamicFireLights.length = 0;
    }
    if (hasCleanupError) throw cleanupError;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("ResidentFloorRuntime has been disposed.");
  }
}
