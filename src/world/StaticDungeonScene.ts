import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { createSeededRandom } from "../core/random";
import { MAX_DUNGEON_FLOORS } from "../dungeon/generateDungeonFloors";
import { FLOOR, WALL } from "../dungeon/generateDungeon";
import {
  createFloorDeckColliders,
  gridToWorld,
  worldToGrid,
  type WorldCollider,
} from "../dungeon/gridCollision";
import type {
  DungeonData,
  DungeonDoorway,
  DungeonRoom,
  ForgePropMetadata,
  GridCell,
} from "../dungeon/types";
import { AssetLibrary, type WallSpriteTextures } from "./AssetLibrary";
import { createVolumetricBeam } from "./VolumetricBeam";
import { createFloorCampfire } from "./FloorCampfireFactory";
import { createWallLantern, createWallTorch } from "./WallTorchFactory";
import {
  applyBiomeMapsToDungeonMaterials,
  applyMoodToDungeonMaterials,
  getDungeonMaterialVariant,
  type DungeonMaterials,
} from "./MaterialLibrary";
import { createDungeonArch, createDungeonDoor, doorwayPlacement } from "./DoorFactory";
import { createDungeonProp, propFamiliesForTheme, type PropFamily } from "./DungeonPropKit";
import { roomTheme } from "./RoomArtDirection";
import {
  applyBiomeMaps,
  applyMoodToSurfaceMaterials,
  type RoomSurfaceSet,
  type SceneTextureCloneSink,
  type SurfaceTheme,
} from "./RoomSurfaceMaterials";
import {
  createForgeChest,
  createForgeProp,
  getForgePropScale,
  type ForgeChestKit,
} from "./ForgePropFactory";
import { createLightingPropBase } from "./LightingPropFactory";
import {
  createNoiseFlame,
  FROST_NOISE_FLAME_PALETTE,
  isNoiseFlameMaterial,
  setNoiseFlameMoodPalette,
  WARM_NOISE_FLAME_PALETTE,
} from "./ProceduralFlameVfx";
import {
  batchDoorFramesForRuntime,
  batchForgeChestForRuntime,
  batchForgeChestsForRuntime,
  batchWallFireFixturesForRuntime,
  type RuntimeModelBatchingGeometryStrategy,
  type RuntimeWallFireFixture,
  type RuntimeWallFireFixtureHandle,
} from "./RuntimeModelBatching";
import {
  createResolveFlask,
  createAnnihilationPulseRelic,
  createCullBrandRelic,
  createDungeonMapPickup,
  createLuminousWardStone,
  createClarityPhial,
  createMobilityDraught,
  createCurseVessel,
  createPhoenixEggRelic,
  createTimeFreezeRelic,
  ANNIHILATION_PULSE_PICKUP_GLOW_OPACITY,
  ANNIHILATION_PULSE_PICKUP_LIGHT_INTENSITY,
  CULL_BRAND_PICKUP_GLOW_OPACITY,
  CULL_BRAND_PICKUP_LIGHT_INTENSITY,
  LUMINOUS_WARD_PICKUP_GLOW_OPACITY,
  LUMINOUS_WARD_PICKUP_LIGHT_INTENSITY,
  PHOENIX_EGG_PICKUP_GLOW_OPACITY,
  PHOENIX_EGG_PICKUP_LIGHT_INTENSITY,
  preparePickupOpacity,
  markPickupMaterialsShared,
  setPickupDormant,
  TIME_FREEZE_PICKUP_LIGHT_INTENSITY,
} from "./ItemFactory";
import { planCurseChestPlacements } from "../game/CurseChestPlan";
import {
  planBiomeLootBudget,
  spreadDepthFractions,
  type FloorFreePowerKind,
} from "../game/BiomeLootPlan";
import {
  OFFENSE_POWER_DEPTH_FRACTION,
  OFFENSE_POWER_SALT,
  planOffensePowerKind,
} from "../game/OffensePowerPlan";
import {
  createCobwebGeometry,
  createCobwebMaterial,
  createBonePile,
  createHanging,
  createRubblePile,
} from "./AtmospherePropsKit";
import type { DungeonMood } from "../systems/DungeonMood";
import { getDungeonMood } from "../systems/DungeonMood";
import {
  DYNAMIC_FIRE_LIGHTS_PER_FLOOR,
  FIRE_LIGHT_TUNING,
  MAX_DYNAMIC_FIRE_LIGHTS,
} from "../systems/LightTuning";
import { HazardTileSystem } from "./HazardTileSystem";

import {
  collectRoomCornerSeats,
  collectRoomInteriorSeats,
  collectRoomWallSeats,
  cornerHugWorldOffset,
  facingRotation,
  findNearestPropCell,
  FLOOR_FURNITURE_KINDS,
  isProtectedTraversalCell,
  pickSpreadSeats,
  selectPhoenixEggSeat,
  WALL_HUGGING_KINDS,
  wallHugWorldOffset,
} from "./PropPlacement";
import { createMagicStone } from "./MagicStoneKit";
import { createBiomeMagicPortal, magicPortalApproachYaw } from "./MagicPortalKit";
import {
  hasValidMagicStonePlacementContract,
  hasValidPortalPlacementContract,
  magicStoneClearanceCells,
  type MagicStonePlacement,
} from "./MagicStonePlacement";
import type { StoneId } from "../ui/copy";
import { selectDistributedTorchIndices } from "./TorchDistribution";
import { createLiquidSectionKit, type LiquidSectionKit } from "./LiquidSectionKit";
import { createSpecialRoomSignals } from "./SpecialRoomSignalKit";
import { getBiomeDecorationProfile } from "./BiomeDecorationProfile";
import { BIOME_CORNER_PROP_MAX_TURN, type BiomeSpritePlacement } from "./BiomeSpriteDecorKit";
import { biomeSpriteDecorCatalog } from "./BiomeSpriteDecorCatalogs.generated";
import {
  biomeSpriteDecorAtlasFrame,
  BIOME_SPRITE_DECOR_ATLAS_SIZE,
  type BiomeSpriteDecorDefinition,
  type BiomeSpriteDecorPlacement,
} from "./BiomeSpriteDecorContract";
import {
  balancedBiomeDecorItem,
  selectFairBiomeDecorPlacements,
} from "./BiomeSpriteDecorDistribution";
import {
  biomeSurfacePalette,
  type BiomeSurfacePaletteRole,
} from "./BiomeSurfacePalettes.generated";
import { buildStairFlight, DUNGEON_STAIR_STEP_COUNT, worldTreadColliders } from "./StaircaseKit";
import { floorSlabY } from "./StoryMetrics";
import { hasTaggedOwnedMaterialTextures, ThreeResourceDisposer } from "./ThreeResourceDisposer";
import { StaticResourceCatalog } from "./StaticResourceCatalog";
import { ResidentFloorRuntimeOwner, type ResidentFloorRuntime } from "./ResidentFloorRuntime";
import {
  createResidentMinimapProjection,
  type MinimapStairDto,
  type ResidentMinimapPickupBinding,
} from "../ui/projectMinimapFeatures";
import type {
  ChestRewardKind,
  StaticChestActor,
  StaticDoorActor,
  StaticPickupActor,
  StaticStairActor,
} from "./StaticDungeonActorTypes";
export type {
  ChestRewardKind,
  StaticChestActor,
  StaticDoorActor,
  StaticPickupActor,
  StaticPickupKind,
  StaticStairActor,
} from "./StaticDungeonActorTypes";
import {
  FloorOccupancyOverlay,
  createFloorOccupancyReport,
  FloorOccupancyBit,
  FloorOccupancyGrid,
  type CellOccupancyQuery,
  type FloorOccupancyReport,
} from "./FloorOccupancyGrid";
import {
  createResidentDungeonPlan,
  type ResidentDungeonFloorPlan,
  type ResidentDungeonPlan,
  type ResidentDungeonFreePickupPlan,
} from "./ResidentDungeonPlan";
import {
  ResidentDungeonRenderer,
  type ResidentDungeonRenderReceipt,
} from "./ResidentDungeonRenderer";

export interface StaticDungeonSceneStats {
  floorTiles: number;
  wallTiles: number;
  ceilingTiles: number;
  enemies: number;
  reserveEnemies: number;
  difficultyLevel: number;
  hazardTiles: number;
  pickups: number;
  beams: number;
  lights: number;
  props: number;
}

/** Coplanar tile faces meet edge-to-edge; overlap causes z-fighting grid seams. */
export const DUNGEON_SURFACE_TILE_SCALE = 1;

export function dungeonFloorUvOffset(cell: GridCell): readonly [number, number] {
  // BoxGeometry's top-face V axis runs against world +Z.
  return [cell.x, -cell.y] as const;
}

export function dungeonCeilingUvOffset(cell: GridCell): readonly [number, number] {
  return [cell.x, cell.y] as const;
}

export function dungeonWallUvOffset(
  cell: GridCell,
  intoDx: number,
  intoDy: number,
): readonly [number, number] {
  // Plane local +X flips on south/east-facing rotations.
  return [intoDy !== 0 ? cell.x * intoDy : cell.y * -intoDx, 0] as const;
}

export interface StaticFireEffect {
  root: THREE.Group;
  flame: THREE.Mesh;
  flameDetails: THREE.Object3D[];
  halos: THREE.Object3D[];
  light: THREE.PointLight | null;
  baseIntensity: number;
  baseY: number;
  baseFlameScaleY: number;
  currentLightFactor: number;
  cutoffDistance: number;
  phase: number;
  losOpen: boolean;
  losAge: number;
  runtimeFixture?: RuntimeWallFireFixtureHandle;
  audio?: boolean;
}

export interface StaticFloorBiomeSprite {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  baseOpacity: number;
  x: number;
  z: number;
  baseYaw: number;
  placement: BiomeSpritePlacement | BiomeSpriteDecorPlacement;
  maxWallTurn?: number;
  maxDistance?: number;
  hysteresis?: number;
  sharedMaterial?: boolean;
}

export interface StaticCeilingBiomeSprite {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  baseOpacity: number;
  x: number;
  z: number;
  baseYaw: number;
  maxDistance: number;
  hysteresis: number;
  sharedMaterial?: boolean;
  animationPhase: number;
  animationSpeed: number;
  swayAmplitude: number;
}

export interface StaticDungeonSceneHandles {
  doors: StaticDoorActor[];
  pickups: StaticPickupActor[];
  chests: StaticChestActor[];
  staircases: StaticStairActor[];
  fireEffects: StaticFireEffect[];
  solidCells: Map<string, GridCell>;
  objectOccupiedCells: Set<string>;
  solidColliders: WorldCollider[];
  objectiveClearanceCells: Set<string>;
  /** Active-floor compatibility alias. Read `allHazardCells` only for diagnostics. */
  hazardCells: ReadonlySet<string>;
  /** Aggregate diagnostic only; never a gameplay or placement source. */
  allHazardCells: Set<string>;
  floorBiomeSprites: StaticFloorBiomeSprite[];
  ceilingBiomeSprites: StaticCeilingBiomeSprite[];
  wallSpriteOccupiedCells: Set<string>;
  exitPosition: THREE.Vector3;
  portalRoot: THREE.Group | null;
  portalBeam: THREE.Mesh | null;
  portalLight: THREE.PointLight | null;
  stoneBeams: THREE.Mesh[];
  ambientBeams: THREE.Mesh[];
  liquidKit: LiquidSectionKit | null;
  hazardTiles: HazardTileSystem | null;
  stonePlacements: MagicStonePlacement[];
  /** Resident floor owners. Aggregate actor handles remain transitional adapters. */
  readonly residentFloors: readonly ResidentFloorRuntime[];
  /** Dense dungeon-local occupancy state, one grid for every resident floor. */
  readonly floorOccupancyGrids: readonly FloorOccupancyGrid[];
  /** Optional build diagnostics; no logging happens on the production path. */
  readonly occupancyReport: FloorOccupancyReport;
}

export interface StaticDungeonSceneOptions {
  group: THREE.Group;
  assets: AssetLibrary;
  materials: DungeonMaterials;
  surfaceMaterials: Record<SurfaceTheme, RoomSurfaceSet>;
  tileSize: number;
  wallHeight: number;
  stoneTextures: ReadonlyMap<StoneId, THREE.Texture>;
  resourceCatalog?: StaticResourceCatalog;
  textureSink?: SceneTextureCloneSink;
}

interface MutableStaticDungeonSceneHandles extends Omit<
  StaticDungeonSceneHandles,
  "residentFloors" | "floorOccupancyGrids" | "occupancyReport"
> {
  residentFloors: ResidentFloorRuntime[];
  floorOccupancyGrids: FloorOccupancyGrid[];
  occupancyReport: FloorOccupancyReport;
}

interface FloorBuildContext {
  floorIndex: number;
  runtime: ResidentFloorRuntimeOwner;
  occupancy: FloorOccupancyGrid;
  plan: ResidentDungeonFloorPlan;
}

type RoomWallSeat = { cell: GridCell; intoDx: number; intoDy: number };

interface PendingChestBatch {
  kit: ForgeChestKit;
  chest: StaticChestActor;
}

function createHandles(): MutableStaticDungeonSceneHandles {
  return {
    doors: [],
    pickups: [],
    chests: [],
    staircases: [],
    fireEffects: [],
    solidCells: new Map(),
    objectOccupiedCells: new Set(),
    solidColliders: [],
    objectiveClearanceCells: new Set(),
    hazardCells: new Set(),
    allHazardCells: new Set(),
    floorBiomeSprites: [],
    ceilingBiomeSprites: [],
    wallSpriteOccupiedCells: new Set(),
    exitPosition: new THREE.Vector3(),
    portalRoot: null,
    portalBeam: null,
    portalLight: null,
    stoneBeams: [],
    ambientBeams: [],
    liquidKit: null,
    hazardTiles: null,
    stonePlacements: [],
    residentFloors: [],
    floorOccupancyGrids: [],
    occupancyReport: createFloorOccupancyReport([]),
  };
}

export class StaticDungeonScene {
  readonly stats: StaticDungeonSceneStats = {
    floorTiles: 0,
    wallTiles: 0,
    ceilingTiles: 0,
    enemies: 0,
    reserveEnemies: 0,
    difficultyLevel: 1,
    hazardTiles: 0,
    pickups: 0,
    beams: 0,
    lights: 0,
    props: 0,
  };

  private readonly group: THREE.Group;
  private readonly assets: AssetLibrary;
  private readonly materials: DungeonMaterials;
  private readonly surfaceMaterials: Record<SurfaceTheme, RoomSurfaceSet>;
  private readonly tileSize: number;
  private readonly wallHeight: number;
  private readonly stoneTextures: ReadonlyMap<StoneId, THREE.Texture>;
  private readonly resourceCatalog: StaticResourceCatalog;
  private readonly ownsResourceCatalog: boolean;
  private readonly textureSink?: SceneTextureCloneSink;
  private torchFloorPoolTexture: THREE.Texture | null = null;
  private staticContactShadowTexture: THREE.Texture | null = null;
  private readonly buildRoots: THREE.Object3D[] = [];
  private readonly biomeWallDecalMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly biomeFloorSpriteMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly staticContactShadowPlacements: Array<{
    x: number;
    z: number;
    width: number;
    depth: number;
  }> = [];
  /** Seat topology is immutable for a generated dungeon; reuse it across
   * doors, objectives and atmosphere passes instead of rescanning each room. */
  private readonly roomWallSeatCache = new WeakMap<
    DungeonData,
    Map<number, readonly RoomWallSeat[]>
  >();
  private readonly roomInteriorSeatCache = new WeakMap<
    DungeonData,
    Map<number, readonly GridCell[]>
  >();
  private handles = createHandles();
  private activeMood: DungeonMood = getDungeonMood("ash");
  private decorDensity = 0.6;
  private dynamicFireLightCount = 0;
  private disposed = false;
  /** World Y offset for the floor slab currently being built (multi-floor stack). */
  private floorWorldY = 0;
  /** Dense occupancy for the floor currently passing through the build seams. */
  private activeFloorOccupancy: FloorOccupancyGrid | null = null;
  /** When true, only flights rooted on a lower slab are placed. */
  private stackBuildActive = false;
  /** Stable canonical lookup for resident floors. Never use adapter array scans at runtime. */
  private readonly residentFloorsByIndex = new Map<number, ResidentFloorRuntimeOwner>();
  /** Build-only owner for render roots and collider publication. */
  private currentResidentFloor: ResidentFloorRuntimeOwner | null = null;
  /** Last logical active floor, retained without scanning aggregate adapters. */
  private activeResidentFloor: ResidentFloorRuntimeOwner | null = null;
  /** Pure topology/shaft contract captured before Three.js commit. */
  private residentDungeonPlan: ResidentDungeonPlan | null = null;
  /** Scalar receipt proving the committed dungeon still matches the plan. */
  private residentDungeonRenderReceipt: ResidentDungeonRenderReceipt | null = null;
  /** Compatibility adapter while callers still inspect render groups directly. */
  private readonly floorRenderGroups: THREE.Group[] = [];
  private currentFloorRenderGroup: THREE.Group | null = null;
  private readonly tempPosition = new THREE.Vector3();
  private readonly tempScale = new THREE.Vector3();
  private readonly tempQuaternion = new THREE.Quaternion();
  private readonly tempEuler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly tempMatrix = new THREE.Matrix4();
  /** Pending source trees are committed only with other actors from their floor. */
  private readonly pendingChestBatchesByRuntime = new Map<
    ResidentFloorRuntimeOwner,
    PendingChestBatch[]
  >();
  private readonly pendingDoorActorsByRuntime = new Map<
    ResidentFloorRuntimeOwner,
    StaticDoorActor[]
  >();
  private runtimeChestTemplate: ForgeChestKit | null = null;
  private readonly runtimeChestTemplateBounds = new THREE.Box3();
  private readonly runtimeBoundsScratch = new THREE.Box3();
  private readonly runtimeDoorTemplates = new Map<string, THREE.Group>();
  private readonly runtimeDoorTemplateGeometries = new Set<THREE.BufferGeometry>();
  private readonly runtimeClassicPropBatches = new Map<
    string,
    readonly StaticPropTemplateBatch[]
  >();
  private readonly runtimeForgePropBatches = new Map<
    string,
    {
      bounds: THREE.Box3;
      batches: readonly StaticPropTemplateBatch[];
    }
  >();
  private readonly runtimeRewardTemplates = new Map<ChestRewardKind, THREE.Object3D>();
  private readonly runtimeClassicPropTemplates = new Map<
    string,
    {
      family: PropFamily;
      variant: number;
      template: THREE.Group | null;
      bounds: THREE.Box3;
    }
  >();
  private readonly runtimeWeaponRackBatches = new Map<string, readonly StaticPropTemplateBatch[]>();
  /** Atmosphere templates/batches are world-owned, so later resident floors
   * skip repeated merge and normalization work for identical prop families. */
  private readonly runtimeAtmosphereTemplates = new Map<string, THREE.Group>();
  private readonly runtimeAtmosphereBatches = new Map<string, readonly StaticPropTemplateBatch[]>();
  private readonly runtimeModelBatchingGeometryStrategy: RuntimeModelBatchingGeometryStrategy;
  private readonly pendingWallFireFixtures: Array<{
    fixture: RuntimeWallFireFixture;
    effect: StaticFireEffect;
  }> = [];

  private getRoomWallSeats(dungeon: DungeonData, room: DungeonRoom): readonly RoomWallSeat[] {
    let byRoom = this.roomWallSeatCache.get(dungeon);
    if (!byRoom) {
      byRoom = new Map();
      this.roomWallSeatCache.set(dungeon, byRoom);
    }
    const cached = byRoom.get(room.id);
    if (cached) return cached;
    const seats = collectRoomWallSeats(dungeon, room);
    byRoom.set(room.id, seats);
    return seats;
  }

  private getRoomInteriorSeats(dungeon: DungeonData, room: DungeonRoom): readonly GridCell[] {
    let byRoom = this.roomInteriorSeatCache.get(dungeon);
    if (!byRoom) {
      byRoom = new Map();
      this.roomInteriorSeatCache.set(dungeon, byRoom);
    }
    const cached = byRoom.get(room.id);
    if (cached) return cached;
    const seats = collectRoomInteriorSeats(dungeon, room);
    byRoom.set(room.id, seats);
    return seats;
  }

  constructor(options: StaticDungeonSceneOptions) {
    this.group = options.group;
    this.assets = options.assets;
    this.materials = options.materials;
    this.surfaceMaterials = options.surfaceMaterials;
    this.tileSize = options.tileSize;
    this.wallHeight = options.wallHeight;
    this.stoneTextures = options.stoneTextures;
    this.resourceCatalog = options.resourceCatalog ?? new StaticResourceCatalog();
    this.ownsResourceCatalog = options.resourceCatalog === undefined;
    this.textureSink = options.textureSink;
    this.runtimeModelBatchingGeometryStrategy = {
      borrowGeometry: (stableKey, factory, resourceType) =>
        this.resourceCatalog.borrowGeometry(stableKey, factory, resourceType),
      isBorrowedGeometry: (geometry) => this.isBorrowedStaticGeometry(geometry),
      materialKey: (material) => this.staticMaterialKey(material),
    };
  }

  private getTorchFloorPoolTexture(): THREE.Texture {
    if (!this.torchFloorPoolTexture) {
      this.torchFloorPoolTexture = createTorchFloorPoolTexture();
      if (this.torchFloorPoolTexture.image) this.textureSink?.register(this.torchFloorPoolTexture);
    }
    return this.torchFloorPoolTexture;
  }

  private getStaticContactShadowTexture(): THREE.Texture {
    if (!this.staticContactShadowTexture) {
      this.staticContactShadowTexture = createStaticContactShadowTexture();
      if (this.staticContactShadowTexture.image) {
        this.textureSink?.register(this.staticContactShadowTexture);
      }
    }
    return this.staticContactShadowTexture;
  }

  private isBorrowedStaticGeometry(geometry: THREE.BufferGeometry): boolean {
    return (
      this.resourceCatalog.ownsGeometry(geometry) ||
      this.runtimeDoorTemplateGeometries.has(geometry)
    );
  }

  static emptyHandles(): StaticDungeonSceneHandles {
    return createHandles();
  }

  get currentHandles(): StaticDungeonSceneHandles {
    return this.handles;
  }

  get floorOccupancyReport(): FloorOccupancyReport {
    return this.handles.occupancyReport;
  }

  private validateResidentStack(floors: readonly DungeonData[]): void {
    if (floors.length > MAX_DUNGEON_FLOORS) {
      throw new RangeError(
        `StaticDungeonScene buildStack supports at most ${MAX_DUNGEON_FLOORS} resident floors.`,
      );
    }

    const indices: number[] = [];
    for (const dungeon of floors) {
      const floor = dungeon.floor;
      if (!floor) {
        throw new Error(
          "StaticDungeonScene buildStack requires floor metadata for every resident floor.",
        );
      }
      if (!Number.isSafeInteger(floor.index)) {
        throw new Error(
          "StaticDungeonScene buildStack requires every floor index to be an integer.",
        );
      }
      if (!Number.isSafeInteger(floor.number) || floor.number !== floor.index + 1) {
        throw new Error(
          `StaticDungeonScene buildStack requires floor number ${floor.index + 1} for floor index ${floor.index}.`,
        );
      }
      if (
        !Number.isSafeInteger(floor.count) ||
        floor.count < 1 ||
        floor.count > MAX_DUNGEON_FLOORS
      ) {
        throw new Error(
          `StaticDungeonScene buildStack requires a supported floor count from 1 to ${MAX_DUNGEON_FLOORS}.`,
        );
      }
      if (floor.count !== floors.length) {
        throw new Error(
          `StaticDungeonScene buildStack requires floor count ${floors.length}; floor ${floor.index} declares ${floor.count}.`,
        );
      }
      indices.push(floor.index);
    }

    const expected = Array.from({ length: floors.length }, (_, index) => index);
    if (indices.some((floorIndex, position) => floorIndex !== expected[position])) {
      throw new Error(
        `StaticDungeonScene buildStack requires ordered contiguous floor indices 0..${floors.length - 1}; received [${indices.join(", ")}].`,
      );
    }
  }

  /** Register the owner before any floor content can allocate or mount roots. */
  private createFloorBuildContext(
    dungeon: DungeonData,
    slabY: number,
    plan: ResidentDungeonFloorPlan,
  ): FloorBuildContext {
    const floorIndex = dungeon.floor?.index ?? 0;
    if (this.residentFloorsByIndex.has(floorIndex)) {
      throw new Error("StaticDungeonScene cannot build two resident runtimes for one floor.");
    }
    const runtime = new ResidentFloorRuntimeOwner(floorIndex, dungeon.width, dungeon.height, slabY);
    this.group.add(runtime.root);
    this.residentFloorsByIndex.set(floorIndex, runtime);
    this.pendingChestBatchesByRuntime.set(runtime, []);
    this.pendingDoorActorsByRuntime.set(runtime, []);
    this.handles.residentFloors.push(runtime);
    this.handles.floorOccupancyGrids.push(runtime.occupancy);
    this.floorRenderGroups.push(runtime.root);
    return {
      floorIndex,
      runtime,
      occupancy: runtime.occupancy,
      plan,
    };
  }

  private refreshOccupancyReport(): void {
    this.handles.occupancyReport = createFloorOccupancyReport(this.handles.floorOccupancyGrids);
  }

  /**
   * A failed construction must leave this reusable scene in the same empty state
   * as a completed clear. Cleanup is deliberately best-effort here: a disposal
   * failure cannot replace the construction error that the caller needs to see.
   */
  private abortFailedBuild(): void {
    try {
      this.clear();
    } catch {
      // Preserve the original construction error even if best-effort cleanup fails.
    }
  }

  build(
    dungeon: DungeonData,
    mood: DungeonMood,
    decorDensity: number,
    preparedPlan?: ResidentDungeonPlan,
  ): StaticDungeonSceneHandles {
    if (this.disposed) throw new Error("StaticDungeonScene has been disposed.");
    const residentPlan =
      preparedPlan ??
      createResidentDungeonPlan([dungeon], undefined, {
        moodId: mood.id,
        decorDensity,
        phoenixArmed: this.pendingPhoenixArmed,
      });
    const residentReceipt = new ResidentDungeonRenderer(residentPlan).confirm([dungeon]);
    this.clear();
    let built = false;
    try {
      this.residentDungeonPlan = residentPlan;
      this.residentDungeonRenderReceipt = residentReceipt;
      // A one-floor build is an isolated compatibility path: metadata must not
      // turn its local presentation frame into a stacked world slab.
      this.floorWorldY = 0;
      this.stackBuildActive = false;
      this.applyMoodMaterials(mood, decorDensity);
      const floorPlan = residentPlan.floors[0];
      if (!floorPlan) throw new Error("StaticDungeonScene build lost its resident floor plan.");
      const floorBuild = this.createFloorBuildContext(dungeon, this.floorWorldY, floorPlan);
      this.currentResidentFloor = floorBuild.runtime;
      this.currentFloorRenderGroup = floorBuild.runtime.root;
      this.buildFloorContents(dungeon, mood, floorBuild);
      this.currentResidentFloor = null;
      this.currentFloorRenderGroup = null;
      this.commitResidentInteractiveBatches();
      this.setActiveFloor(floorBuild.floorIndex);
      this.refreshOccupancyReport();
      built = true;
      return this.handles;
    } finally {
      this.currentResidentFloor = null;
      this.currentFloorRenderGroup = null;
      this.floorWorldY = 0;
      this.stackBuildActive = false;
      if (!built) this.abortFailedBuild();
    }
  }

  /**
   * Build every campaign floor as stacked slabs in one scene.
   * Stair flights are placed once on the lower mouth of each shaft.
   */
  buildStack(
    floors: readonly DungeonData[],
    mood: DungeonMood,
    decorDensity: number,
    preparedPlan?: ResidentDungeonPlan,
  ): StaticDungeonSceneHandles {
    const steps = this.buildStackSteps(floors, mood, decorDensity, preparedPlan);
    let result = steps.next();
    while (!result.done) result = steps.next();
    return result.value;
  }

  /**
   * Same resident transaction as buildStack, split at floor boundaries so the
   * load cover and browser event loop can progress during a four-floor build.
   * Every floor is still fully committed before input is enabled.
   */
  async buildStackWithYield(
    floors: readonly DungeonData[],
    mood: DungeonMood,
    decorDensity: number,
    yieldToMain: () => Promise<void>,
    preparedPlan?: ResidentDungeonPlan,
  ): Promise<StaticDungeonSceneHandles> {
    const steps = this.buildStackSteps(floors, mood, decorDensity, preparedPlan);
    try {
      let result = steps.next();
      while (!result.done) {
        await yieldToMain();
        result = steps.next();
      }
      return result.value;
    } catch (error) {
      steps.return(this.handles);
      throw error;
    }
  }

  private *buildStackSteps(
    floors: readonly DungeonData[],
    mood: DungeonMood,
    decorDensity: number,
    preparedPlan?: ResidentDungeonPlan,
  ): Generator<void, StaticDungeonSceneHandles, void> {
    if (this.disposed) throw new Error("StaticDungeonScene has been disposed.");
    if (floors.length === 0) throw new Error("buildStack requires at least one floor.");
    // Validate metadata-backed stacks before clear, including a one-floor
    // stack. A legacy single dungeon without floor metadata still uses build().
    if (floors.length > 1 || floors[0]!.floor) this.validateResidentStack(floors);
    if (floors.length === 1) {
      return this.build(floors[0]!, mood, decorDensity, preparedPlan);
    }

    // Freeze the pure plan and verify the generated topology before clearing a
    // valid scene. The renderer seam is intentionally Three.js-free here;
    // object/material allocation starts only after this contract is accepted.
    const residentPlan =
      preparedPlan ??
      createResidentDungeonPlan(floors, undefined, {
        moodId: mood.id,
        decorDensity,
        phoenixArmed: this.pendingPhoenixArmed,
      });
    const residentReceipt = new ResidentDungeonRenderer(residentPlan).confirm(floors);

    this.clear();
    let built = false;
    try {
      this.residentDungeonPlan = residentPlan;
      this.residentDungeonRenderReceipt = residentReceipt;
      this.applyMoodMaterials(mood, decorDensity);
      let totalFloorCells = 0;
      let totalWallCells = 0;
      for (const dungeon of floors) {
        const floorIndex = dungeon.floor!.index;
        this.floorWorldY = floorSlabY(floorIndex);
        const floorPlan = residentPlan.floors[floorIndex];
        if (!floorPlan) {
          throw new Error(`StaticDungeonScene build lost floor plan ${floorIndex}.`);
        }
        const floorBuild = this.createFloorBuildContext(dungeon, this.floorWorldY, floorPlan);
        this.currentResidentFloor = floorBuild.runtime;
        this.currentFloorRenderGroup = floorBuild.runtime.root;
        this.stackBuildActive = true;
        const counts = this.buildFloorContents(dungeon, mood, floorBuild);
        totalFloorCells += counts.floorCells;
        totalWallCells += counts.wallCells;
        yield;
      }
      this.currentResidentFloor = null;
      this.currentFloorRenderGroup = null;
      this.floorWorldY = 0;
      this.stackBuildActive = false;
      this.commitResidentInteractiveBatches();
      this.setActiveFloor(floors[0]!.floor!.index);
      this.stats.floorTiles = totalFloorCells;
      this.stats.wallTiles = totalWallCells;
      this.stats.ceilingTiles = totalFloorCells;
      this.stats.pickups = this.pickups.length;
      this.refreshOccupancyReport();
      built = true;
      return this.handles;
    } finally {
      this.currentResidentFloor = null;
      this.currentFloorRenderGroup = null;
      this.floorWorldY = 0;
      this.stackBuildActive = false;
      if (!built) this.abortFailedBuild();
    }
  }

  private applyMoodMaterials(mood: DungeonMood, decorDensity: number): void {
    this.activeMood = mood;
    this.decorDensity = decorDensity;
    const biomeSurfaces = this.assets.getBiomeSurfaces(mood.id);
    applyBiomeMaps(this.surfaceMaterials, biomeSurfaces, mood.id);
    applyBiomeMapsToDungeonMaterials(this.materials, biomeSurfaces, mood.id);
    applyMoodToSurfaceMaterials(
      this.surfaceMaterials,
      mood.surfaceTint,
      mood.surfaceStrength * 0.42,
      mood.albedoGain,
    );
    applyMoodToDungeonMaterials(
      this.materials,
      mood.surfaceTint,
      0.9 + mood.surfaceStrength * 0.25,
    );
  }

  private buildFloorContents(
    dungeon: DungeonData,
    mood: DungeonMood,
    floorBuild: FloorBuildContext,
  ): { floorCells: number; wallCells: number } {
    const previousOccupancy = this.activeFloorOccupancy;
    this.activeFloorOccupancy = floorBuild.occupancy;
    try {
      if (!hasValidPortalPlacementContract(dungeon)) {
        throw new Error("Dungeon cannot start Play without a reachable exit portal seat.");
      }
      const roomById = new Map(dungeon.rooms.map((room) => [room.id, room]));
      const allStonePlacements: MagicStonePlacement[] = floorBuild.plan.objectives.map(
        (objective) => {
          const room = roomById.get(objective.roomId);
          if (!room) {
            throw new Error(`Resident dungeon plan lost objective room ${objective.roomId}.`);
          }
          return {
            stoneId: objective.stoneId,
            room,
            cell: { ...objective.cell },
            offsetX: objective.offsetX,
            offsetZ: objective.offsetZ,
          };
        },
      );
      if (!hasValidMagicStonePlacementContract(dungeon, allStonePlacements)) {
        throw new Error("Dungeon cannot start Play without four distinct reachable magic stones.");
      }
      const stonePlacements =
        dungeon.floor && dungeon.floor.count > 1
          ? allStonePlacements.filter(
              (_, stoneIndex) => stoneIndex % dungeon.floor!.count === dungeon.floor!.index,
            )
          : allStonePlacements;
      this.handles.stonePlacements.push(...stonePlacements);
      for (const cell of magicStoneClearanceCells(dungeon, stonePlacements))
        this.reserveObjectiveClearanceCell(cell);
      for (const stair of dungeon.floor?.stairs ?? []) {
        this.reserveObjectiveClearanceCell(stair.cell, FloorOccupancyBit.Stair);
        for (const cell of stair.footprint ?? [])
          this.reserveObjectiveClearanceCell(cell, FloorOccupancyBit.Stair);
      }
      const floorCells: GridCell[] = [];
      for (let y = 0; y < dungeon.height; y += 1) {
        for (let x = 0; x < dungeon.width; x += 1) {
          if (dungeon.grid[y]?.[x] === FLOOR) floorCells.push({ x, y });
        }
      }
      const wallCells = collectBoundaryWalls(dungeon);
      this.addArchitecture(dungeon, floorCells, wallCells);
      const hazardExclusions = this.createHazardExclusionQuery(dungeon, floorBuild.occupancy);
      // Every resident slab owns its visual and traversal state. The old
      // plan-only upper floors leaked a flat hazard set and made same-XZ traps
      // indistinguishable at runtime.
      const hazardTiles = new HazardTileSystem(
        dungeon,
        mood,
        this.tileSize,
        hazardExclusions,
        this.textureSink,
      );
      floorBuild.runtime.setHazardTileSystem(hazardTiles);
      hazardTiles.placements.forEach((placement) => {
        const key = `${placement.cell.x},${placement.cell.y}`;
        floorBuild.runtime.registerHazardCell(key);
        this.handles.allHazardCells.add(key);
        this.reserveObjectiveClearanceCell(placement.cell, FloorOccupancyBit.Hazard);
      });
      this.add(hazardTiles.root);
      this.stats.hazardTiles += hazardTiles.placements.length;
      if (!dungeon.forge) {
        this.addCaveProps(dungeon);
        // Practical lights own their planned wall anchors. Claim them before
        // decorative atlas props so prioritising generated assets never
        // silently lowers the fire/light budget.
        this.addLightProps(dungeon, floorBuild.plan);
      }
      this.addDoorsAndRoomProps(dungeon, floorBuild, floorBuild.plan);
      // Gameplay, doors, practical lights, and authored furniture keep first
      // claim on their seats. The biome pass then fills every remaining room
      // from a much larger candidate pool without deleting playable content.
      if (dungeon.forge) {
        this.addLightProps(dungeon, floorBuild.plan);
      }
      this.commitStaticContactShadows();
      const specialSignals = createSpecialRoomSignals(dungeon, this.materials, this.tileSize);
      if (specialSignals) {
        this.add(specialSignals);
        this.stats.props += specialSignals.children.length;
        for (const signal of specialSignals.children) {
          const room = dungeon.rooms.find((candidate) => candidate.id === signal.userData.roomId);
          if (room) this.reserveObjectCell(room.center);
        }
      }
      this.commitWallFireBatches();
      this.addAmbientGodrays(dungeon, mood, floorBuild.plan);
      this.addMarkers(dungeon, mood, floorBuild.plan);
      this.addStaircases(dungeon, floorBuild.plan);
      this.addStaticObjectives(dungeon, stonePlacements, floorBuild.plan);
      const stonePickups = this.pickups.filter((pickup) => pickup.kind === "stone");
      // Stack builds accumulate stones across floors; only enforce on single-floor builds.
      if (this.floorWorldY === 0 && !this.stackBuildActive) {
        if (stonePickups.length !== stonePlacements.length) {
          throw new Error(
            `Dungeon completeness failed: expected ${stonePlacements.length} stone pickups, built ${stonePickups.length}.`,
          );
        }
        const finalFloor = !dungeon.floor || dungeon.floor.index === dungeon.floor.count - 1;
        if (finalFloor && !this.portalRoot) {
          throw new Error("Dungeon completeness failed: exit portal mesh was not created.");
        }
      }
      this.addAtmosphereProps(dungeon, floorBuild.plan);
      // Decorative density is resolved only after every playable object has
      // claimed its cell. The enlarged candidate pools still complete all 84
      // placements without trading away doors, objectives, or furniture.
      this.scatterBiomeSpriteProps(dungeon);
      this.applyMoodToPracticalLights(mood);
      this.cacheResidentMinimapProjection(dungeon, floorBuild.runtime);
      if (!this.stackBuildActive) {
        this.stats.floorTiles = floorCells.length;
        this.stats.wallTiles = wallCells.length;
        this.stats.ceilingTiles = floorCells.length;
        this.stats.pickups = this.pickups.length;
      }
      return { floorCells: floorCells.length, wallCells: wallCells.length };
    } finally {
      this.activeFloorOccupancy = previousOccupancy;
    }
  }

  clear(): void {
    const expired = this.handles;
    const resourceDisposer = new ThreeResourceDisposer((geometry) =>
      this.isBorrowedStaticGeometry(geometry),
    );
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
    this.currentFloorRenderGroup = null;
    this.currentResidentFloor = null;
    this.activeResidentFloor = null;
    this.residentDungeonPlan = null;
    this.residentDungeonRenderReceipt = null;
    this.floorWorldY = 0;
    this.stackBuildActive = false;
    this.activeFloorOccupancy = null;
    for (const runtime of this.residentFloorsByIndex.values()) {
      clean(() => runtime.dispose(resourceDisposer));
    }
    this.residentFloorsByIndex.clear();
    this.floorRenderGroups.length = 0;
    for (const root of this.buildRoots.splice(0)) {
      root.parent?.remove(root);
      clean(() => resourceDisposer.dispose(root));
    }
    for (const material of this.biomeWallDecalMaterials.values()) {
      clean(() => resourceDisposer.disposeOwnedMaterial(material));
    }
    for (const material of this.biomeFloorSpriteMaterials.values()) {
      clean(() => resourceDisposer.disposeOwnedMaterial(material));
    }
    this.biomeWallDecalMaterials.clear();
    this.biomeFloorSpriteMaterials.clear();
    expired.doors.length = 0;
    expired.pickups.length = 0;
    expired.chests.length = 0;
    expired.staircases.length = 0;
    expired.fireEffects.length = 0;
    expired.solidCells.clear();
    expired.objectOccupiedCells.clear();
    expired.solidColliders.length = 0;
    expired.objectiveClearanceCells.clear();
    expired.allHazardCells.clear();
    expired.hazardTiles = null;
    expired.hazardCells = new Set();
    expired.liquidKit = null;
    expired.floorBiomeSprites.length = 0;
    expired.ceilingBiomeSprites.length = 0;
    expired.wallSpriteOccupiedCells.clear();
    expired.exitPosition.set(0, 0, 0);
    expired.portalRoot = null;
    expired.portalBeam = null;
    expired.portalLight = null;
    expired.stoneBeams.length = 0;
    expired.ambientBeams.length = 0;
    expired.stonePlacements.length = 0;
    // Runtime disposal clears the grids and collider arrays. The aggregate
    // arrays are compatibility adapters, so clear them only after their owners.
    expired.residentFloors.length = 0;
    expired.floorOccupancyGrids.length = 0;
    this.staticContactShadowPlacements.length = 0;
    this.pendingChestBatchesByRuntime.clear();
    this.pendingDoorActorsByRuntime.clear();
    this.pendingWallFireFixtures.length = 0;
    this.dynamicFireLightCount = 0;
    this.resetStats();
    this.handles = createHandles();
    if (hasCleanupError) throw cleanupError;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    const resourceDisposer = new ThreeResourceDisposer((geometry) =>
      this.isBorrowedStaticGeometry(geometry),
    );
    for (const template of this.runtimeRewardTemplates.values()) {
      resourceDisposer.dispose(template);
      template.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) resourceDisposer.disposeOwnedMaterial(material);
      });
    }
    this.runtimeRewardTemplates.clear();
    for (const source of this.runtimeClassicPropTemplates.values()) {
      this.disposeClassicPropSource(source);
    }
    this.runtimeClassicPropTemplates.clear();
    this.runtimeClassicPropBatches.clear();
    for (const cached of this.runtimeForgePropBatches.values()) {
      for (const batch of cached.batches) {
        const materials = Array.isArray(batch.material) ? batch.material : [batch.material];
        for (const material of materials) {
          if (hasTaggedOwnedMaterialTextures(material)) {
            resourceDisposer.disposeOwnedMaterial(material);
          }
        }
      }
    }
    this.runtimeForgePropBatches.clear();
    for (const template of this.runtimeAtmosphereTemplates.values()) {
      disposeTemplateGeometries(template);
    }
    this.runtimeAtmosphereTemplates.clear();
    this.runtimeAtmosphereBatches.clear();
    this.runtimeWeaponRackBatches.clear();
    this.disposeRuntimeDoorTemplates();
    this.runtimeChestTemplate = null;
    this.runtimeChestTemplateBounds.makeEmpty();
    for (const texture of [this.torchFloorPoolTexture, this.staticContactShadowTexture]) {
      if (!texture) continue;
      this.textureSink?.unregister(texture);
      texture.dispose();
    }
    this.torchFloorPoolTexture = null;
    this.staticContactShadowTexture = null;
    if (this.ownsResourceCatalog) this.resourceCatalog.dispose();
    this.disposed = true;
  }

  getResidentFloorRuntime(floorIndex: number): ResidentFloorRuntime | null {
    return this.residentFloorsByIndex.get(floorIndex) ?? null;
  }

  get residentPlan(): ResidentDungeonPlan | null {
    return this.residentDungeonPlan;
  }

  get residentRenderReceipt(): ResidentDungeonRenderReceipt | null {
    return this.residentDungeonRenderReceipt;
  }

  getFloorOccupancyGrid(floorIndex: number): FloorOccupancyGrid | null {
    return this.getResidentFloorRuntime(floorIndex)?.occupancy ?? null;
  }

  isObjectiveClearanceCell(cell: GridCell, floorIndex?: number): boolean {
    const occupancy = this.occupancyForQuery(floorIndex);
    return occupancy?.hasAny(cell.x, cell.y, FloorOccupancyBit.Objective) ?? false;
  }

  /**
   * Keep the active slab and its direct neighbors renderable. All floor scene
   * graphs stay resident; the overlap keeps stair traversal visually seamless.
   */
  setActiveFloor(floorIndex: number): void {
    if (this.residentFloorsByIndex.size === 0) return;
    const requested = Number.isFinite(floorIndex) ? Math.floor(floorIndex) : 0;
    const active = this.residentFloorsByIndex.has(requested)
      ? requested
      : Math.min(this.residentFloorsByIndex.size - 1, Math.max(0, requested));
    const activeRuntime = this.residentFloorsByIndex.get(active);
    if (!activeRuntime) return;
    this.activeResidentFloor = activeRuntime;
    // Transitional scene handles are active-owner aliases, never a latest
    // build winner or a flat aggregate. The aggregate arrays remain outputs.
    this.handles.hazardTiles = activeRuntime.hazardTileSystem;
    this.handles.hazardCells = activeRuntime.hazardCells;
    this.handles.liquidKit = activeRuntime.liquidKit;
    for (const runtime of this.residentFloorsByIndex.values()) {
      const visible = Math.abs(runtime.floorIndex - activeRuntime.floorIndex) <= 1;
      if (runtime.root.visible !== visible) runtime.root.visible = visible;
    }
  }

  isObjectOccupiedCell(cell: GridCell, floorIndex?: number): boolean {
    const occupancy = this.occupancyForQuery(floorIndex);
    return (
      occupancy?.hasAny(
        cell.x,
        cell.y,
        FloorOccupancyBit.Object | FloorOccupancyBit.Solid | FloorOccupancyBit.WallDecoration,
      ) ?? false
    );
  }

  private resetStats(): void {
    this.stats.floorTiles = 0;
    this.stats.wallTiles = 0;
    this.stats.ceilingTiles = 0;
    this.stats.enemies = 0;
    this.stats.reserveEnemies = 0;
    this.stats.difficultyLevel = 1;
    this.stats.hazardTiles = 0;
    this.stats.pickups = 0;
    this.stats.beams = 0;
    this.stats.lights = 0;
    this.stats.props = 0;
  }

  private add(...objects: THREE.Object3D[]): void {
    const runtime = this.currentResidentFloor;
    (this.currentFloorRenderGroup ?? runtime?.root ?? this.group).add(...objects);
    if (!runtime) this.buildRoots.push(...objects);
  }

  /** Scene-owned effects without a resident owner stay outside floor roots. */
  private addGlobal(...objects: THREE.Object3D[]): void {
    this.group.add(...objects);
    this.buildRoots.push(...objects);
  }

  /** Publish one collider reference to its owner and the compatibility adapter. */
  private addSolidColliders(...colliders: WorldCollider[]): void {
    const runtime = this.requireCurrentResidentFloor("Collider registration");
    runtime.addColliders(colliders);
    this.handles.solidColliders.push(...colliders);
  }

  private requireCurrentResidentFloor(consumer: string): ResidentFloorRuntimeOwner {
    const runtime = this.currentResidentFloor;
    if (!runtime) throw new Error(`${consumer} requires a resident floor runtime.`);
    return runtime;
  }

  private worldY(localY: number): number {
    return localY + this.floorWorldY;
  }

  private markActiveFloorOccupancy(cell: GridCell, bits: number): void {
    this.activeFloorOccupancy?.mark(cell.x, cell.y, bits);
  }

  private reserveObjectiveClearanceCell(cell: GridCell, extraBit?: FloorOccupancyBit): void {
    // Legacy aggregate handles remain a public output only. Placement reads
    // below always query the active per-floor grid.
    this.handles.objectiveClearanceCells.add(`${cell.x},${cell.y}`);
    this.markActiveFloorOccupancy(cell, FloorOccupancyBit.Objective | (extraBit ?? 0));
  }

  private createHazardExclusionQuery(
    dungeon: DungeonData,
    occupancy: FloorOccupancyGrid,
  ): CellOccupancyQuery {
    const explicitExclusions = new FloorOccupancyOverlay(dungeon.width, dungeon.height);
    explicitExclusions.mark(dungeon.spawn.x, dungeon.spawn.y, FloorOccupancyBit.Object);
    explicitExclusions.mark(dungeon.exit.x, dungeon.exit.y, FloorOccupancyBit.Object);
    const reservationBits = FloorOccupancyBit.Objective | FloorOccupancyBit.Solid;
    return {
      isOccupied: (x, y) =>
        explicitExclusions.isOccupied(x, y) || occupancy.hasAny(x, y, reservationBits),
    };
  }

  private reserveObjectCell(cell: GridCell): void {
    this.handles.objectOccupiedCells.add(`${cell.x},${cell.y}`);
    this.markActiveFloorOccupancy(cell, FloorOccupancyBit.Object);
  }

  private reserveWallObjectCell(cell: GridCell): void {
    this.handles.wallSpriteOccupiedCells.add(`${cell.x},${cell.y}`);
    this.markActiveFloorOccupancy(cell, FloorOccupancyBit.WallDecoration);
    this.reserveObjectCell(cell);
  }

  private reserveCeilingObjectCell(cell: GridCell): void {
    this.markActiveFloorOccupancy(cell, FloorOccupancyBit.CeilingDecoration);
    this.reserveObjectCell(cell);
  }

  private occupancyForQuery(floorIndex?: number): FloorOccupancyGrid | null {
    if (floorIndex !== undefined) return this.getFloorOccupancyGrid(floorIndex);
    return this.activeFloorOccupancy ?? this.activeResidentFloor?.occupancy ?? null;
  }

  private requireActiveFloorOccupancy(consumer: string): FloorOccupancyGrid {
    if (this.activeFloorOccupancy) return this.activeFloorOccupancy;
    throw new Error(`${consumer} requires an active floor occupancy grid.`);
  }

  private get doors(): StaticDoorActor[] {
    return this.handles.doors;
  }

  private get pickups(): StaticPickupActor[] {
    return this.handles.pickups;
  }

  private get chests(): StaticChestActor[] {
    return this.handles.chests;
  }

  private get fireEffects(): StaticFireEffect[] {
    return this.handles.fireEffects;
  }

  /** Publish a floor-owned fire and retain the legacy aggregate as output only. */
  private registerFireEffect(effect: StaticFireEffect): void {
    // Direct scene-kit probes may build one fire without a resident slab. The
    // production build path always has an owner; keep this compatibility seam
    // isolated from stack ownership rather than fabricating a floor runtime.
    this.currentResidentFloor?.registerFire(effect);
    this.fireEffects.push(effect);
  }

  private get floorBiomeSprites(): StaticFloorBiomeSprite[] {
    return this.handles.floorBiomeSprites;
  }

  private registerFloorBiomeSprite(sprite: StaticFloorBiomeSprite): void {
    this.requireCurrentResidentFloor("Biome sprite registration").registerFloorBiomeSprite(sprite);
    this.floorBiomeSprites.push(sprite);
  }

  private get ceilingBiomeSprites(): StaticCeilingBiomeSprite[] {
    return this.handles.ceilingBiomeSprites;
  }

  private registerCeilingBiomeSprite(sprite: StaticCeilingBiomeSprite): void {
    this.requireCurrentResidentFloor(
      "Ceiling biome sprite registration",
    ).registerCeilingBiomeSprite(sprite);
    this.ceilingBiomeSprites.push(sprite);
  }

  private get exitPosition(): THREE.Vector3 {
    return this.handles.exitPosition;
  }

  private get portalRoot(): THREE.Group | null {
    return this.handles.portalRoot;
  }

  private set portalRoot(value: THREE.Group | null) {
    this.handles.portalRoot = value;
  }

  private get portalBeam(): THREE.Mesh | null {
    return this.handles.portalBeam;
  }

  private set portalBeam(value: THREE.Mesh | null) {
    this.handles.portalBeam = value;
  }

  private get portalLight(): THREE.PointLight | null {
    return this.handles.portalLight;
  }

  private set portalLight(value: THREE.PointLight | null) {
    this.handles.portalLight = value;
  }

  private get stoneBeams(): THREE.Mesh[] {
    return this.handles.stoneBeams;
  }

  private registerStoneBeam(beam: THREE.Mesh): void {
    this.requireCurrentResidentFloor("Stone beam registration").registerStoneBeam(beam);
    this.stoneBeams.push(beam);
  }

  private get ambientBeams(): THREE.Mesh[] {
    return this.handles.ambientBeams;
  }

  private registerAmbientBeam(beam: THREE.Mesh): void {
    this.requireCurrentResidentFloor("Ambient beam registration").registerAmbientBeam(beam);
    this.ambientBeams.push(beam);
  }

  /**
   * Build one minimap layer while actor positions are still resident-local.
   * Rebinding later swaps this object; it never projects every floor again.
   */
  private cacheResidentMinimapProjection(
    dungeon: DungeonData,
    runtime: ResidentFloorRuntimeOwner,
  ): void {
    const toCell = (position: THREE.Vector3Like): GridCell =>
      worldToGrid(dungeon, { x: position.x, z: position.z }, this.tileSize);
    const pickups: ResidentMinimapPickupBinding[] = runtime.pickups.map((pickup) => ({
      source: pickup,
      cell: toCell(pickup.object.position),
    }));
    const stairs: MinimapStairDto[] = runtime.staircases.map((stair) => ({
      cell: { ...stair.cell },
      direction: stair.direction,
    }));
    runtime.setMinimapProjection(
      createResidentMinimapProjection({
        doors: runtime.doors.map((door) => toCell(door.root.position)),
        fires: runtime.fires.map((fire) => toCell(fire.root.position)),
        hazards: runtime.hazardTileSystem?.placements.map((hazard) => ({ ...hazard.cell })) ?? [],
        pickups,
        stairs,
        spawn: { ...dungeon.spawn },
      }),
    );
  }

  private addArchitecture(
    dungeon: DungeonData,
    floorCells: readonly GridCell[],
    wallCells: readonly GridCell[],
  ): void {
    const floorFootprint = this.tileSize * DUNGEON_SURFACE_TILE_SCALE;
    const wallFaceWidth = this.tileSize * DUNGEON_SURFACE_TILE_SCALE;
    const floorTemplate = createFloorTileGeometry(floorFootprint);
    // Plane faces +Z; rotate to face down (-Y) so players look at the textured underside.
    const ceilingTemplate = new THREE.PlaneGeometry(floorFootprint, floorFootprint);
    const ceilingOrientation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.PI / 2, 0, 0),
    );
    const wallFaceTemplate = createWallFaceGeometry(wallFaceWidth, this.wallHeight, this.tileSize);

    // Clone only the base surface templates per theme (instance UV attrs differ).
    // makeInstance reuses scratch matrices so tile fills do not allocate per cell.
    // Shaft cells open ceilings on both ends, but floors only where a flight
    // arrives from the story below. Outgoing flights retain their lower deck.
    const floorIndex = dungeon.floor?.index ?? 0;
    // Floor and ceiling openings cannot share the public Stair bit: a lower
    // landing opens its ceiling while an arriving flight opens its deck.
    const openFloorCells = new FloorOccupancyOverlay(dungeon.width, dungeon.height);
    const openCeilingCells = new FloorOccupancyOverlay(dungeon.width, dungeon.height);
    for (const stair of dungeon.floor?.stairs ?? []) {
      const target = stair.targetFloor;
      const openings = stair.footprint;
      const targetMask =
        target < floorIndex ? openFloorCells : target > floorIndex ? openCeilingCells : null;
      if (!targetMask) continue;
      for (const cell of openings) targetMask.mark(cell.x, cell.y, FloorOccupancyBit.Stair);
    }
    for (const [theme, cells] of partitionCells(dungeon, floorCells)) {
      const floorSeats = cells.filter((cell) => !openFloorCells.isOccupied(cell.x, cell.y));
      const ceilingSeats = cells.filter((cell) => !openCeilingCells.isOccupied(cell.x, cell.y));
      if (floorSeats.length === 0 && ceilingSeats.length === 0) continue;

      if (floorSeats.length > 0) {
        const floorOffsets = new Float32Array(floorSeats.length * 2);
        const floorGeometry = floorTemplate.clone();
        floorSeats.forEach((cell, instance) => {
          const floorUv = dungeonFloorUvOffset(cell);
          floorOffsets[instance * 2] = floorUv[0];
          floorOffsets[instance * 2 + 1] = floorUv[1];
        });
        setTileUvOffsets(floorGeometry, floorOffsets);
        const floor = new THREE.InstancedMesh(
          floorGeometry,
          this.surfaceMaterials[theme].floor,
          floorSeats.length,
        );
        floor.name = `${theme} room floor`;
        floor.receiveShadow = true;
        floorSeats.forEach((cell, instance) => {
          const p = gridToWorld(dungeon, cell, this.tileSize);
          makeInstance(floor, instance, { x: p.x, y: -0.05, z: p.z });
        });
        floor.instanceMatrix.needsUpdate = true;
        this.add(floor);
      }

      if (ceilingSeats.length > 0) {
        const ceilingOffsets = new Float32Array(ceilingSeats.length * 2);
        const ceilingGeometry = ceilingTemplate.clone();
        ceilingSeats.forEach((cell, instance) => {
          const ceilingUv = dungeonCeilingUvOffset(cell);
          ceilingOffsets[instance * 2] = ceilingUv[0];
          ceilingOffsets[instance * 2 + 1] = ceilingUv[1];
        });
        setTileUvOffsets(ceilingGeometry, ceilingOffsets);
        const ceiling = new THREE.InstancedMesh(
          ceilingGeometry,
          this.surfaceMaterials[theme].ceiling,
          ceilingSeats.length,
        );
        ceiling.name = `${theme} room ceiling`;
        ceilingSeats.forEach((cell, instance) => {
          const p = gridToWorld(dungeon, cell, this.tileSize);
          makeInstance(
            ceiling,
            instance,
            { x: p.x, y: this.wallHeight - 0.01, z: p.z },
            { x: 1, y: 1, z: 1 },
            ceilingOrientation,
          );
        });
        ceiling.instanceMatrix.needsUpdate = true;
        this.add(ceiling);
      }
    }

    // The ground slab uses virtual support at Y=0. Raised slabs use compact
    // row spans so support queries do not carry one collider per floor cell.
    if (this.floorWorldY > 0) {
      this.addSolidColliders(
        ...createFloorDeckColliders(dungeon, this.tileSize, this.worldY(-0.06), this.worldY(0.02)),
      );
    }

    // Masonry as exposed face panels (not solid cubes) — kills the grid of vertical seams.
    const faces = collectExposedWallFaces(dungeon, wallCells);
    const facesByTheme = new Map<SurfaceTheme, WallFaceSeat[]>();
    for (const face of faces) {
      const list = facesByTheme.get(face.theme) ?? [];
      list.push(face);
      facesByTheme.set(face.theme, list);
    }
    const wallFaceAxis = new THREE.Vector3(0, 1, 0);
    const wallFaceQuaternion = new THREE.Quaternion();
    for (const [theme, themeFaces] of facesByTheme) {
      const wallOffsets = new Float32Array(themeFaces.length * 2);
      const wallGeometry = wallFaceTemplate.clone();
      themeFaces.forEach((face, instance) => {
        const uv = dungeonWallUvOffset(face.cell, face.intoDx, face.intoDy);
        wallOffsets[instance * 2] = uv[0];
        wallOffsets[instance * 2 + 1] = uv[1];
      });
      setTileUvOffsets(wallGeometry, wallOffsets);

      const walls = new THREE.InstancedMesh(
        wallGeometry,
        this.surfaceMaterials[theme].wall,
        themeFaces.length,
      );
      walls.name = `${theme} room masonry faces`;
      walls.castShadow = true;
      walls.receiveShadow = true;
      walls.frustumCulled = true;
      themeFaces.forEach((face, instance) => {
        const p = gridToWorld(dungeon, face.cell, this.tileSize);
        // Sit on the wall–floor plane, slightly into the room to avoid z-fight with colliders.
        const x = p.x + face.intoDx * this.tileSize * 0.5;
        const z = p.z + face.intoDy * this.tileSize * 0.5;
        const rotation = wallFaceQuaternion.setFromAxisAngle(
          wallFaceAxis,
          Math.atan2(face.intoDx, face.intoDy),
        );
        makeInstance(
          walls,
          instance,
          { x, y: this.wallHeight / 2, z },
          { x: 1, y: 1, z: 1 },
          rotation,
        );
      });
      walls.instanceMatrix.needsUpdate = true;
      this.add(walls);
    }

    // Thin solid fill inside wall cells so tops/corners don't show sky through masonry.
    this.addWallCellCaps(dungeon, wallCells);

    floorTemplate.dispose();
    ceilingTemplate.dispose();
    wallFaceTemplate.dispose();
  }

  /** Opaque wall volume that closes gaps behind the textured face panels. */
  private addWallCellCaps(dungeon: DungeonData, wallCells: readonly GridCell[]): void {
    if (wallCells.length === 0) return;
    // Cover the full cell with a tiny overlap. Exact-width or undersized cores
    // can expose light through concave and diagonal wall corners.
    const core = this.tileSize * 1.002;
    const geometry = new THREE.BoxGeometry(core, this.wallHeight, core);
    // Reuse the biome wall map so exposed caps and corners never become flat
    // black blocks. The darker multiplier keeps them behind the face panels.
    const material = this.materials.stone.clone();
    material.color.multiplyScalar(0.34);
    material.roughness = Math.max(0.92, material.roughness);
    material.metalness = 0.02;
    material.emissive.multiplyScalar(0.22);
    material.emissiveIntensity = Math.min(0.16, material.emissiveIntensity);
    material.userData.sharedDungeonMaterial = false;
    const mesh = new THREE.InstancedMesh(geometry, material, wallCells.length);
    mesh.name = "Wall core fill";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    wallCells.forEach((cell, instance) => {
      const p = gridToWorld(dungeon, cell, this.tileSize);
      makeInstance(mesh, instance, { x: p.x, y: this.wallHeight / 2, z: p.z });
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.add(mesh);
  }

  private addCaveProps(dungeon: DungeonData): void {
    const random = createSeededRandom(`${dungeon.seed}:props`);
    const occupancy = this.activeFloorOccupancy;
    const isCurrentFloorClearance = (cell: GridCell): boolean =>
      occupancy
        ? occupancy.hasAny(
            cell.x,
            cell.y,
            FloorOccupancyBit.Objective | FloorOccupancyBit.Hazard | FloorOccupancyBit.Stair,
          )
        : this.isObjectiveClearanceCell(cell);
    const rooms = dungeon.rooms.filter((room) => room.role === "room");
    const rockGeometry = new THREE.DodecahedronGeometry(0.3, 0);
    const rockCells = rooms.flatMap((room) => {
      const cells: GridCell[] = [];
      for (let y = room.y + 1; y < room.y + room.height - 1; y += 1)
        for (let x = room.x + 1; x < room.x + room.width - 1; x += 1) {
          const cell = { x, y };
          if (dungeon.grid[y]?.[x] === FLOOR && !isCurrentFloorClearance(cell)) cells.push(cell);
        }
      return cells;
    });
    const count = Math.min(
      rockCells.length,
      Math.max(4, Math.min(Math.round(rooms.length * 2 * this.decorDensity), 32)),
    );
    const availableRockCells = [...rockCells];
    const rocks = new THREE.InstancedMesh(rockGeometry, this.materials.darkStone, count);
    rocks.name = "Low-poly cave debris";
    for (let index = 0; index < count; index += 1) {
      const cellIndex = random.integer(0, availableRockCells.length - 1);
      const [cell] = availableRockCells.splice(cellIndex, 1);
      if (!cell) break;
      this.reserveObjectCell(cell);
      const p = gridToWorld(dungeon, cell, this.tileSize);
      const scale = 0.35 + random.next() * 0.65;
      const scaleX = scale * (0.78 + random.next() * 0.46);
      const scaleY = scale * (0.44 + random.next() * 0.24);
      const scaleZ = scale * (0.72 + random.next() * 0.52);
      makeInstance(
        rocks,
        index,
        {
          x: p.x + (random.next() - 0.5) * 0.8,
          y: 0.3 * scaleY + 0.012,
          z: p.z + (random.next() - 0.5) * 0.8,
        },
        { x: scaleX, y: scaleY, z: scaleZ },
      );
    }
    rocks.instanceMatrix.needsUpdate = true;
    this.add(rocks);
    this.stats.props += count;

    // Pebble scatter across all walkable floor — breaks clean-slab floors everywhere.
    const floorCells: GridCell[] = [];
    for (let y = 0; y < dungeon.height; y += 1) {
      for (let x = 0; x < dungeon.width; x += 1)
        if (dungeon.grid[y]?.[x] === FLOOR && !isCurrentFloorClearance({ x, y }))
          floorCells.push({ x, y });
    }
    if (floorCells.length > 0) {
      const pebbleGeometry = new THREE.DodecahedronGeometry(0.085, 0);
      const pebbleCount = Math.max(
        24,
        Math.min(Math.round(floorCells.length * 0.14 * this.decorDensity), 240),
      );
      const pebbles = new THREE.InstancedMesh(
        pebbleGeometry,
        this.materials.darkStone,
        pebbleCount,
      );
      pebbles.name = "Scattered floor pebbles";
      for (let index = 0; index < pebbleCount; index += 1) {
        const cell = random.pick(floorCells);
        const p = gridToWorld(dungeon, cell, this.tileSize);
        const scale = 0.4 + random.next() * 1.1;
        makeInstance(
          pebbles,
          index,
          {
            x: p.x + (random.next() - 0.5) * this.tileSize * 0.86,
            y: 0.032 * scale,
            z: p.z + (random.next() - 0.5) * this.tileSize * 0.86,
          },
          {
            x: scale * (0.7 + random.next() * 0.6),
            y: scale * 0.42,
            z: scale * (0.7 + random.next() * 0.6),
          },
        );
      }
      pebbles.instanceMatrix.needsUpdate = true;
      this.add(pebbles);
      this.stats.props += pebbleCount;
    }
  }

  private registerDoor(
    door: THREE.Group,
    position: { x: number; z: number },
    rotation: number,
  ): void {
    const left = door.getObjectByName("Door leaf hinge");
    const right = door.getObjectByName("Right door leaf hinge");
    if (!(left instanceof THREE.Group) || !(right instanceof THREE.Group)) return;
    door.position.set(position.x, 0, position.z);
    door.rotation.y = rotation;
    const runtime = this.requireCurrentResidentFloor("Door registration");
    const actor: StaticDoorActor = {
      root: door,
      left,
      right,
      openness: 0,
      targetOpen: false,
      runtimeBatch: null,
    };
    runtime.registerDoor(actor);
    this.doors.push(actor);
    const pending = this.pendingDoorActorsByRuntime.get(runtime);
    if (!pending) throw new Error("Door registration requires a pending resident batch.");
    pending.push(actor);
    this.add(door);
  }

  private createDoorAppearance() {
    const profile = getBiomeDecorationProfile(this.activeMood.id);
    const doorSurface = this.assets.biomeDoorSurface?.(this.activeMood.id) ?? {
      albedo: this.assets.biomeDoor(this.activeMood.id),
      normal: null,
      roughness: null,
      metalness: null,
    };
    const leafMaterial = getDungeonMaterialVariant(
      this.materials.wood,
      `door-leaf:${this.activeMood.id}:${profile.doorRoughness}`,
      (material) => {
        // Door plates replace wood role maps completely (albedo + PBR stack).
        material.map = doorSurface.albedo;
        material.normalMap = doorSurface.normal;
        material.roughnessMap = doorSurface.roughness;
        material.metalnessMap = doorSurface.metalness;
        material.bumpMap = null;
        material.aoMap = null;
        material.emissiveMap = null;
        material.emissive.setHex(0x000000);
        material.emissiveIntensity = 0;
        material.normalScale.set(0.72, 0.72);
        material.color.setHex(this.activeMood.id === "obsidian" ? 0x686b72 : 0xffffff);
        material.roughness = doorSurface.roughness ? 1 : profile.doorRoughness;
        material.metalness = doorSurface.metalness
          ? 1
          : this.activeMood.id === "iron"
            ? 0.42
            : 0.03;
        material.envMapIntensity = this.activeMood.id === "iron" ? 0.78 : 0.34;
        material.userData.sharedDungeonMaterial = false;
        material.userData.doorLeaf = true;
      },
    );
    // Hardware tint is profile-stable per mood; share one variant across doors.
    const hardwareMaterial = getDungeonMaterialVariant(
      this.materials.iron,
      `door-hardware:${this.activeMood.id}:${profile.hardwareTint.toString(16)}`,
      (material) => {
        material.color.setHex(profile.hardwareTint);
        material.userData.sharedDungeonMaterial = false;
        material.userData.doorHardware = true;
      },
    );
    return {
      style: profile.doorStyle,
      curvedArch: profile.curvedArch,
      frameMaterial: this.surfaceMaterials.corridor.wall,
      leafMaterial,
      hardwareMaterial,
    };
  }

  private createArchAppearance() {
    const profile = getBiomeDecorationProfile(this.activeMood.id);
    return {
      style: profile.doorStyle,
      curvedArch: profile.curvedArch,
      frameMaterial: this.surfaceMaterials.corridor.wall,
    };
  }

  private staticMaterialKey(material: THREE.Material): string {
    for (const [role, candidate] of Object.entries(this.materials)) {
      if (candidate === material) return `role:${role}`;
    }
    for (const [theme, surfaces] of Object.entries(this.surfaceMaterials)) {
      for (const [surface, candidate] of Object.entries(surfaces)) {
        if (candidate === material) return `surface:${theme}:${surface}`;
      }
    }
    const variantKey = material.userData.variantKey;
    if (typeof variantKey === "string") {
      const separator = variantKey.indexOf("::");
      return `variant:${separator >= 0 ? variantKey.slice(separator + 2) : variantKey}`;
    }
    const standard = material as THREE.MeshStandardMaterial;
    const color = standard.color instanceof THREE.Color ? standard.color.getHexString() : "none";
    return [
      "material",
      material.type,
      material.name || "unnamed",
      color,
      Number.isFinite(standard.roughness) ? standard.roughness.toFixed(4) : "na",
      Number.isFinite(standard.metalness) ? standard.metalness.toFixed(4) : "na",
      material.transparent ? "transparent" : "opaque",
    ].join(":");
  }

  private staticPropCatalogKey(family: "classic" | "forge", topology: string): string {
    return `static-prop/v2:family:${family}:bake:normalized:topology:${encodeURIComponent(topology)}`;
  }

  private runtimeChestCatalogKey(): string {
    return "rigid-prop/v2:family:forge-chest:topology:image-sculpted-iron-bound-treasure-chest-v2:bake:normalized";
  }

  private registerRuntimeDoorTemplateGeometry(template: THREE.Object3D): void {
    template.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        this.runtimeDoorTemplateGeometries.add(object.geometry);
      }
    });
  }

  private disposeRuntimeDoorTemplates(): void {
    for (const geometry of this.runtimeDoorTemplateGeometries) geometry.dispose();
    this.runtimeDoorTemplateGeometries.clear();
    this.runtimeDoorTemplates.clear();
  }

  private createRuntimeDoor(width: number): THREE.Group {
    const appearance = this.createDoorAppearance();
    const topology = [
      "door-frame/v2",
      `style:${appearance.style}`,
      `curved:${Number(appearance.curvedArch)}`,
      `width:${width.toFixed(4)}`,
      `height:${this.wallHeight.toFixed(4)}`,
      "opening:2.3500",
      "depth:0.4200",
    ].join(":");
    const key = `${this.activeMood.id}:${topology}`;
    let template = this.runtimeDoorTemplates.get(key);
    if (!template) {
      template = createDungeonDoor(this.materials, width, this.wallHeight, appearance);
      template.userData.staticDoorFrameTopology = topology;
      this.registerRuntimeDoorTemplateGeometry(template);
      this.runtimeDoorTemplates.set(key, template);
    }
    return template.clone(true);
  }

  private getClassicPropTemplateBatches(
    groupKey: string,
    source: {
      family: PropFamily;
      variant: number;
      template: THREE.Group | null;
    },
  ): readonly StaticPropTemplateBatch[] {
    const cacheKey = `classic:${groupKey}`;
    const cached = groupKey.startsWith("weapon-rack:")
      ? this.runtimeWeaponRackBatches.get(cacheKey)
      : this.runtimeClassicPropBatches.get(cacheKey);
    if (cached) return cached;

    const template =
      source.template ?? createDungeonProp(source.family, this.materials, source.variant);
    source.template = template;
    const batches = createStaticPropTemplateBatches(template, {
      resourceCatalog: this.resourceCatalog,
      catalogKey: this.staticPropCatalogKey(
        "classic",
        `${source.family}:variant:${Math.abs(source.variant) % 3}:group:${groupKey}`,
      ),
      materialKey: (material) => this.staticMaterialKey(material),
      resourceType: "classic-static-prop-batch-geometry/v2",
    });
    if (groupKey.startsWith("weapon-rack:")) this.runtimeWeaponRackBatches.set(cacheKey, batches);
    else this.runtimeClassicPropBatches.set(cacheKey, batches);
    return batches;
  }

  private getForgePropTemplateBatches(
    groupKey: string,
    source: ForgePropMetadata,
  ): { bounds: THREE.Box3; batches: readonly StaticPropTemplateBatch[] } | null {
    const cacheKey = `forge:${groupKey}`;
    const cached = this.runtimeForgePropBatches.get(cacheKey);
    if (cached) return cached;

    const template = createForgeProp(source, this.materials, this.textureSink);
    if (!template) return null;
    template.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(template);
    try {
      const batches = createStaticPropTemplateBatches(template, {
        resourceCatalog: this.resourceCatalog,
        catalogKey: this.staticPropCatalogKey(
          "forge",
          `${source.kind}:variant:${Math.abs(source.v ?? 0) % 3}:group:${groupKey}`,
        ),
        materialKey: (material) => this.staticMaterialKey(material),
        resourceType: "forge-static-prop-batch-geometry/v2",
      });
      const result = { bounds, batches };
      this.runtimeForgePropBatches.set(cacheKey, result);
      return result;
    } finally {
      // The catalog receives only normalized batch geometry, never this mutable recipe tree.
      disposeTemplateGeometries(template);
    }
  }

  private disposeClassicPropSource(source: { template: THREE.Group | null }): void {
    const template = source.template;
    if (!template) return;
    source.template = null;
    disposeTemplateGeometries(template);
  }

  private addDoorsAndRoomProps(
    dungeon: DungeonData,
    floorBuild?: FloorBuildContext,
    floorPlan?: ResidentDungeonFloorPlan,
  ): void {
    if (dungeon.forge) {
      this.addForgeDoorsAndProps(dungeon);
      return;
    }
    const random = createSeededRandom(
      floorPlan?.rooms[0]?.dressingSeed ?? `${dungeon.seed}:room-dressing`,
    );
    const occupancy = floorBuild?.occupancy ?? this.activeFloorOccupancy;
    if (!occupancy)
      throw new Error("Classic room dressing requires an active floor occupancy grid.");
    const occupiedBits =
      FloorOccupancyBit.Solid | FloorOccupancyBit.Object | FloorOccupancyBit.WallDecoration;
    const clearanceBits =
      FloorOccupancyBit.Objective | FloorOccupancyBit.Hazard | FloorOccupancyBit.Stair;
    const isOccupied = (cell: GridCell): boolean =>
      (occupancy.getMask(cell.x, cell.y) & occupiedBits) !== 0;
    const isClearance = (cell: GridCell): boolean =>
      (occupancy.getMask(cell.x, cell.y) & clearanceBits) !== 0;
    let heroReliquaryPlaced = false;
    const doorwaysByRoom = new Map<number, DungeonDoorway[]>();
    for (const doorway of floorPlan?.doorways ?? dungeon.topology?.doorways ?? []) {
      const roomDoorways = doorwaysByRoom.get(doorway.roomId) ?? [];
      roomDoorways.push(doorway);
      doorwaysByRoom.set(doorway.roomId, roomDoorways);
    }
    const classicPropPlacements = new Map<
      string,
      {
        source: {
          family: PropFamily;
          variant: number;
          template: THREE.Group | null;
          bounds: THREE.Box3;
        };
        bounds: THREE.Box3;
        matrices: THREE.Matrix4[];
      }
    >();
    const classicWallArtPlacements = new Map<number, THREE.Matrix4[]>();
    const plannedWallArtByRoom = new Map(
      (floorPlan?.roomWallArt ?? []).map((placement) => [placement.roomId, placement]),
    );

    for (const room of dungeon.rooms) {
      const theme = roomTheme(dungeon, room);
      const wallSeats = this.getRoomWallSeats(dungeon, room);
      const candidates = doorwaysByRoom.get(room.id) ?? [];
      for (const doorway of candidates) {
        if (
          (occupancy.getMask(doorway.cell.x, doorway.cell.y) & FloorOccupancyBit.Object) !== 0
        ) {
          continue;
        }
        const cellWorld = gridToWorld(dungeon, doorway.cell, this.tileSize);
        const placement = doorwayPlacement(cellWorld, doorway.outDx, doorway.outDy, this.tileSize);
        // Slightly wider than one tile so posts bite into the side masonry.
        const door = this.createRuntimeDoor(this.tileSize * 1.12);
        door.userData.roomId = room.id;
        door.userData.edgeIndex = doorway.edgeIndex;
        door.userData.connectedRoomId = doorway.connectedRoomId;
        this.registerDoor(door, placement, placement.rotation);
        occupancy.mark(doorway.cell.x, doorway.cell.y, FloorOccupancyBit.Object);
        this.stats.props += 1;
      }

      if (room.role === "entrance" || room.width < 5 || room.height < 5) continue;
      if (room.id % 2 === 0) {
        // Paintings share a shallow real frame and one instanced batch per map.
        const plannedWall = plannedWallArtByRoom.get(room.id);
        const north = { x: room.center.x, y: room.y - 1 };
        const south = { x: room.center.x, y: room.y + room.height };
        const west = { x: room.x - 1, y: room.center.y };
        const wall = plannedWall
          ? {
              cell: plannedWall.wall,
              angle: plannedWall.angle,
              offsetX: plannedWall.angle === Math.PI / 2 ? this.tileSize * 0.505 : 0,
              offsetZ:
                plannedWall.angle === 0
                  ? this.tileSize * 0.505
                  : plannedWall.angle === Math.PI
                    ? -this.tileSize * 0.505
                    : 0,
            }
          : dungeon.grid[north.y]?.[north.x] === WALL
            ? {
                cell: north,
                angle: 0,
                offsetX: 0,
                offsetZ: this.tileSize * 0.505,
              }
            : dungeon.grid[south.y]?.[south.x] === WALL
              ? {
                  cell: south,
                  angle: Math.PI,
                  offsetX: 0,
                  offsetZ: -this.tileSize * 0.505,
                }
              : dungeon.grid[west.y]?.[west.x] === WALL
                ? {
                    cell: west,
                    angle: Math.PI / 2,
                    offsetX: this.tileSize * 0.505,
                    offsetZ: 0,
                  }
                : null;
        if (wall) {
          const position = gridToWorld(dungeon, wall.cell, this.tileSize);
          this.tempEuler.set(0, wall.angle, 0, "YXZ");
          this.tempQuaternion.setFromEuler(this.tempEuler);
          const artMatrix = new THREE.Matrix4().compose(
            new THREE.Vector3(position.x + wall.offsetX, 2.05, position.z + wall.offsetZ),
            this.tempQuaternion.clone(),
            new THREE.Vector3(1, 1, 1),
          );
          const mapIndex = plannedWall?.mapIndex ?? Math.abs(room.id) % 4;
          const artMatrices = classicWallArtPlacements.get(mapIndex) ?? [];
          artMatrices.push(artMatrix);
          classicWallArtPlacements.set(mapIndex, artMatrices);
          for (const seat of wallSeats) {
            if (
              seat.cell.x - seat.intoDx === wall.cell.x &&
              seat.cell.y - seat.intoDy === wall.cell.y
            ) {
              this.reserveWallObjectCell(seat.cell);
            }
          }
          this.stats.props += 1;
        }
      }
      const families = propFamiliesForTheme(theme);
      const propCount = Math.max(
        2,
        Math.min(5, Math.round(((room.width * room.height) / 22) * this.decorDensity)),
      );
      const interiorSeats = this.getRoomInteriorSeats(dungeon, room);
      let wallCursor = 0;
      let floorCursor = 0;
      for (let index = 0; index < propCount; index += 1) {
        let family = families[(room.id + index) % families.length] ?? "crates";
        if (family === "reliquary" && (index > 0 || heroReliquaryPlaced)) family = "urns";
        const hugWall = WALL_HUGGING_KINDS.has(family);
        let cell: GridCell | null = null;
        let rotation = (random.integer(0, 3) * Math.PI) / 2;
        let offsetX = (random.next() - 0.5) * 0.12;
        let offsetZ = (random.next() - 0.5) * 0.12;

        if (hugWall && wallSeats.length > 0) {
          // Scan wall seats until one is free; bookcases/lecterns face into the room.
          for (let attempt = 0; attempt < wallSeats.length && !cell; attempt += 1) {
            const seat = wallSeats[(wallCursor + room.id * 3 + attempt) % wallSeats.length]!;
            if (
              isOccupied(seat.cell) ||
              dungeon.grid[seat.cell.y]?.[seat.cell.x] !== FLOOR ||
              isClearance(seat.cell)
            )
              continue;
            cell = seat.cell;
            rotation = facingRotation(seat.intoDx, seat.intoDy);
            const hug = wallHugWorldOffset(
              seat.intoDx,
              seat.intoDy,
              this.tileSize,
              family === "bookshelf" ? 0.32 : 0.28,
            );
            offsetX = hug.x;
            offsetZ = hug.z;
            wallCursor += attempt + 1;
          }
        } else if (FLOOR_FURNITURE_KINDS.has(family) && interiorSeats.length > 0) {
          for (let attempt = 0; attempt < interiorSeats.length && !cell; attempt += 1) {
            const seat = interiorSeats[(floorCursor + index * 2 + attempt) % interiorSeats.length]!;
            if (isOccupied(seat) || dungeon.grid[seat.y]?.[seat.x] !== FLOOR || isClearance(seat))
              continue;
            cell = seat;
            // Face roughly toward room center so chairs/tables read as usable.
            rotation = Math.atan2(room.center.x - seat.x, room.center.y - seat.y);
            floorCursor += attempt + 1;
          }
        }

        // Last resort: free corner floor (skip for wall-huggers — wrong orientation).
        if (!cell && !hugWall) {
          const fallback = {
            x: index % 2 === 0 ? room.x + 1 : room.x + room.width - 2,
            y: index < 2 ? room.y + 1 : room.y + room.height - 2,
          };
          if (
            dungeon.grid[fallback.y]?.[fallback.x] === FLOOR &&
            !isOccupied(fallback) &&
            !isProtectedTraversalCell(dungeon, fallback) &&
            !isClearance(fallback)
          ) {
            cell = fallback;
          }
        }
        if (!cell || isProtectedTraversalCell(dungeon, cell) || isClearance(cell)) continue;

        const variant = Math.abs(room.id + index) % 3;
        const groupKey = `${family}:${family === "reliquary" ? 0 : variant}`;
        let placementGroup = classicPropPlacements.get(groupKey);
        if (!placementGroup) {
          let cachedTemplate = this.runtimeClassicPropTemplates.get(groupKey);
          if (!cachedTemplate) {
            const template = createDungeonProp(family, this.materials, variant);
            template.updateMatrixWorld(true);
            cachedTemplate = {
              family,
              variant,
              template,
              bounds: new THREE.Box3().setFromObject(template),
            };
            this.runtimeClassicPropTemplates.set(groupKey, cachedTemplate);
          }
          placementGroup = {
            source: cachedTemplate,
            bounds: cachedTemplate.bounds,
            matrices: [],
          };
          classicPropPlacements.set(groupKey, placementGroup);
        }
        if (family === "reliquary") heroReliquaryPlaced = true;
        const position = gridToWorld(dungeon, cell, this.tileSize);
        const maxWidth = Math.max(1, Math.min(room.width, room.height));
        const scale = dressingPropScale(family, maxWidth);
        const rootMatrix = new THREE.Matrix4().compose(
          new THREE.Vector3(position.x + offsetX, 0, position.z + offsetZ),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
          new THREE.Vector3(scale, scale, scale),
        );
        placementGroup.matrices.push(rootMatrix);
        this.registerSolidBounds(
          placementGroup.bounds.clone().applyMatrix4(rootMatrix),
          cell,
          true,
        );
        this.stats.props += 1;
      }
    }

    const artGeometry = this.resourceCatalog.borrowGeometry(
      "rigid-prop/v2:family:classic-wall-art:topology:plane:width:2.3000:height:2.3000",
      () => new THREE.PlaneGeometry(2.3, 2.3),
      "classic-wall-art-geometry/v2",
    );
    const wallSpriteRoughness = getBiomeDecorationProfile(this.activeMood.id).doorRoughness + 0.04;
    for (const [mapIndex, matrices] of classicWallArtPlacements) {
      const material = createWallSpriteMaterial(
        this.assets.wallArtPbr(mapIndex),
        this.activeMood,
        wallSpriteRoughness,
      );
      const batch = new THREE.InstancedMesh(artGeometry, material, matrices.length);
      batch.name = `Room wall artwork ${mapIndex + 1}`;
      batch.castShadow = false;
      batch.receiveShadow = true;
      batch.frustumCulled = false;
      batch.userData.distanceLod = "disabled";
      matrices.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
      batch.instanceMatrix.needsUpdate = true;
      this.add(batch);
    }

    // Keep InstancedMesh per classic family:variant. Global material bake was
    // measured and raised mapLoadWorldMs (~+20%) for a modest draw reduction.
    // Shared finish variants (PERF-13) still cut unique materials/programs.
    for (const [groupKey, placement] of classicPropPlacements) {
      let templateBatches: readonly StaticPropTemplateBatch[];
      try {
        templateBatches = this.getClassicPropTemplateBatches(groupKey, placement.source);
      } finally {
        // Final normalized batches belong to the catalog. Source templates are recipes only.
        this.disposeClassicPropSource(placement.source);
      }
      for (const [partIndex, part] of templateBatches.entries()) {
        const batch = new THREE.InstancedMesh(
          part.geometry,
          part.material,
          placement.matrices.length,
        );
        batch.name = `Classic ${groupKey} batch ${partIndex + 1}`;
        batch.castShadow = part.castShadow;
        batch.receiveShadow = part.receiveShadow;
        placement.matrices.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
        batch.instanceMatrix.needsUpdate = true;
        batch.computeBoundingBox();
        batch.computeBoundingSphere();
        this.add(batch);
      }
    }
  }

  private addForgeDoorsAndProps(dungeon: DungeonData): void {
    const forge = dungeon.forge;
    if (!forge) return;
    const closedRoomIds = new Set<number>();
    const openArches: typeof forge.arches = [];
    const closedArches: Array<{ arch: (typeof forge.arches)[number]; roomId: number }> = [];
    const importantRoomTypes = new Set(["treasure", "shrine", "elite", "boss"]);
    const positionForArch = (arch: (typeof forge.arches)[number]) => {
      const position = gridToWorld(dungeon, { x: arch.x, y: arch.y }, this.tileSize);
      position.x += (arch.roomDx ?? 0) * this.tileSize * 0.5;
      position.z += (arch.roomDy ?? 0) * this.tileSize * 0.5;
      return position;
    };
    for (const arch of forge.arches) {
      const nearbyIds = new Set<number>();
      const minX = Math.floor(arch.x) - 1;
      const maxX = Math.ceil(arch.x) + 1;
      const minY = Math.floor(arch.y) - 1;
      const maxY = Math.ceil(arch.y) + 1;
      for (let y = minY; y <= maxY; y += 1)
        for (let x = minX; x <= maxX; x += 1) {
          if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) continue;
          const roomId = forge.roomIds[y * dungeon.width + x] ?? -1;
          if (roomId >= 0) nearbyIds.add(roomId);
        }
      const directedRoomId =
        typeof arch.roomDx === "number" && typeof arch.roomDy === "number"
          ? (forge.roomIds[
              Math.round(arch.y + arch.roomDy * 0.5) * dungeon.width +
                Math.round(arch.x + arch.roomDx * 0.5)
            ] ?? -1)
          : -1;
      const roomId =
        directedRoomId >= 0 &&
        importantRoomTypes.has(forge.roomTypes[directedRoomId]?.toLowerCase() ?? "")
          ? directedRoomId
          : [...nearbyIds].find((id) =>
              importantRoomTypes.has(forge.roomTypes[id]?.toLowerCase() ?? ""),
            );
      if (arch.len <= 3 && roomId !== undefined && !closedRoomIds.has(roomId)) {
        closedRoomIds.add(roomId);
        closedArches.push({ arch, roomId });
      } else openArches.push(arch);
    }
    const archesByLength = new Map<number, typeof forge.arches>();
    for (const arch of openArches) {
      const list = archesByLength.get(arch.len) ?? [];
      list.push(arch);
      archesByLength.set(arch.len, list);
    }
    for (const [length, arches] of archesByLength) {
      // +0.2 tiles so posts embed in the side wall cells and close the jamb.
      const width = (length + 0.2) * this.tileSize;
      const appearance = this.createArchAppearance();
      const materialLayout = staticPropMaterialLayout(appearance.frameMaterial, (material) =>
        this.staticMaterialKey(material),
      );
      const geometry = this.resourceCatalog.borrowGeometry(
        [
          "rigid-prop/v2",
          "family:creation-passable-arch",
          "topology:door-arch/v2",
          `width:${width.toFixed(4)}`,
          `height:${this.wallHeight.toFixed(4)}`,
          "opening:2.3500",
          "depth:0.4200",
          `style:${appearance.style}`,
          `curved:${Number(appearance.curvedArch)}`,
          "bake:factory-final",
          `layout:${materialLayout}`,
        ].join(":"),
        () => {
          const template = createDungeonArch(this.materials, {
            width,
            wallHeight: this.wallHeight,
            ...appearance,
          });
          const frame = template.getObjectByName("Joined stone door frame");
          if (!(frame instanceof THREE.Mesh)) {
            disposeTemplateGeometries(template);
            throw new Error(`Passable arch ${length} lost its joined frame geometry.`);
          }
          return frame.geometry;
        },
        `creation-passable-arch-geometry/v2:${materialLayout}`,
      );
      const batch = new THREE.InstancedMesh(geometry, appearance.frameMaterial, arches.length);
      batch.name = `Creation passable arch batch ${length}`;
      arches.forEach((arch, index) => {
        const position = positionForArch(arch);
        // px/py run along the doorway; frame spans that axis (rot 0 when run is X).
        batch.setMatrixAt(
          index,
          new THREE.Matrix4().compose(
            new THREE.Vector3(position.x, 0, position.z),
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              arch.px === 1 ? 0 : Math.PI / 2,
            ),
            new THREE.Vector3(1, 1, 1),
          ),
        );
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.castShadow = true;
      this.add(batch);
      this.stats.props += arches.length;
    }
    for (const { arch } of closedArches) {
      const position = positionForArch(arch);
      const door = this.createRuntimeDoor((arch.len + 0.2) * this.tileSize);
      this.registerDoor(door, position, arch.px === 1 ? 0 : Math.PI / 2);
      this.stats.props += 1;
    }
    this.addInstancedForgeProps(dungeon, [...forge.props, ...this.buildForgeRoomDressing(dungeon)]);
    this.addForgeLiquids(dungeon);
  }

  private buildForgeRoomDressing(dungeon: DungeonData): ForgePropMetadata[] {
    const forge = dungeon.forge;
    if (!forge) return [];
    const occupancy = this.requireActiveFloorOccupancy("Forge room dressing");
    const selected = new FloorOccupancyOverlay(dungeon.width, dungeon.height);
    const occupiedBits =
      FloorOccupancyBit.Object |
      FloorOccupancyBit.Solid |
      FloorOccupancyBit.WallDecoration |
      FloorOccupancyBit.Objective;
    const isOccupied = (x: number, y: number): boolean =>
      occupancy.hasAny(x, y, occupiedBits) || selected.isOccupied(x, y);
    const reserve = (x: number, y: number): void => {
      selected.mark(x, y, FloorOccupancyBit.Object);
    };
    forge.props.forEach((prop) => reserve(prop.x, prop.y));
    forge.spawns.forEach((spawn) => reserve(spawn.x, spawn.y));
    forge.torches.forEach((torch) => reserve(torch.x, torch.y));
    reserve(dungeon.spawn.x, dungeon.spawn.y);
    reserve(dungeon.exit.x, dungeon.exit.y);
    forge.doorways.forEach((value, index) => {
      if (value) reserve(index % dungeon.width, Math.floor(index / dungeon.width));
    });
    const dressing: ForgePropMetadata[] = [];
    const families: Record<string, readonly string[]> = {
      entrance: ["pillar", "bench", "high-chair", "bookshelf"],
      combat: ["weapon-rack", "crates", "ritual-table", "bench"],
      elite: ["weapon-rack", "coffin", "high-chair", "barrels"],
      treasure: ["barrels", "ossuary-cabinet", "ritual-table", "urns"],
      shrine: ["ritual-table", "urns", "bench", "ossuary-cabinet", "lectern"],
      boss: ["ossuary-cabinet", "pillar", "weapon-rack", "high-chair"],
      grave: ["grave", "ossuary-cabinet", "coffin", "high-chair"],
      lake: ["pillar", "debris", "bench"],
      library: ["bookshelf", "lectern", "table", "chair", "bookshelf"],
    };
    for (const room of dungeon.rooms) {
      const metadata = forge.rooms.find((candidate) => candidate.id === room.id);
      const theme = metadata?.lake
        ? "lake"
        : metadata?.grave
          ? "grave"
          : metadata?.type?.toLowerCase() === "library"
            ? "library"
            : (metadata?.type?.toLowerCase() ?? "combat");
      const roomFamilies = families[theme] ?? families.combat!;
      const wallSeats = this.getRoomWallSeats(dungeon, room);
      const interiorSeats = this.getRoomInteriorSeats(dungeon, room);
      const roomArea = room.width * room.height;
      const targetProps = roomArea <= 40 ? 2 : roomArea <= 70 ? 3 : 4;
      const wallPicks = pickSpreadSeats(wallSeats, targetProps, room.id * 11 + dungeon.seedHash);
      const floorPicks = pickSpreadSeats(
        interiorSeats,
        targetProps,
        room.id * 19 + dungeon.seedHash,
      );
      let wallIndex = 0;
      let floorIndex = 0;
      let placed = 0;
      for (let slot = 0; slot < targetProps; slot += 1) {
        const kind = roomFamilies[slot % roomFamilies.length]!;
        const hugWall = WALL_HUGGING_KINDS.has(kind);
        let x = 0;
        let y = 0;
        let rot = 0;
        let intoDx: number | undefined;
        let intoDy: number | undefined;
        let ok = false;
        if (hugWall) {
          // Only place wall-huggers on free wall seats — never float mid-room.
          while (wallIndex < wallPicks.length && !ok) {
            const seat = wallPicks[wallIndex++]!;
            const seatIndex = seat.cell.y * dungeon.width + seat.cell.x;
            if (
              isOccupied(seat.cell.x, seat.cell.y) ||
              dungeon.grid[seat.cell.y]?.[seat.cell.x] !== FLOOR ||
              forge.roomIds[seatIndex] !== room.id ||
              forge.corridors[seatIndex] ||
              forge.doorways[seatIndex] ||
              forge.lakeMask[seatIndex]
            ) {
              continue;
            }
            x = seat.cell.x;
            y = seat.cell.y;
            intoDx = seat.intoDx;
            intoDy = seat.intoDy;
            rot = facingRotation(seat.intoDx, seat.intoDy);
            ok = true;
          }
        } else {
          while (floorIndex < floorPicks.length && !ok) {
            const seat = floorPicks[floorIndex++]!;
            const seatIndex = seat.y * dungeon.width + seat.x;
            if (
              isOccupied(seat.x, seat.y) ||
              dungeon.grid[seat.y]?.[seat.x] !== FLOOR ||
              forge.roomIds[seatIndex] !== room.id ||
              forge.corridors[seatIndex] ||
              forge.doorways[seatIndex] ||
              forge.lakeMask[seatIndex]
            ) {
              continue;
            }
            x = seat.x;
            y = seat.y;
            rot = Math.atan2(room.center.x - x, room.center.y - y);
            ok = true;
          }
        }
        if (!ok) continue;
        const index = y * dungeon.width + x;
        if (
          dungeon.grid[y]?.[x] !== FLOOR ||
          forge.roomIds[index] !== room.id ||
          forge.corridors[index] ||
          forge.doorways[index] ||
          forge.lakeMask[index] ||
          isOccupied(x, y)
        )
          continue;
        dressing.push({
          kind,
          x,
          y,
          roomId: room.id,
          rot,
          scale:
            kind === "pillar"
              ? 0.9
              : kind === "reliquary"
                ? 0.78
                : kind === "table" || kind === "chair"
                  ? 1.06
                  : 1,
          v: Math.abs(room.id * 5 + placed * 3 + x + y) % 3,
          ...(typeof intoDx === "number" && typeof intoDy === "number"
            ? { dx: intoDx, dy: intoDy }
            : {}),
        });
        reserve(x, y);
        placed += 1;
      }
    }
    return dressing;
  }

  private addInstancedForgeProps(dungeon: DungeonData, props: readonly ForgePropMetadata[]): void {
    const groups = new Map<string, ForgePropMetadata[]>();
    const occupancy = this.requireActiveFloorOccupancy("Forge props");
    const selected = new FloorOccupancyOverlay(dungeon.width, dungeon.height);
    const occupiedBits =
      FloorOccupancyBit.Object | FloorOccupancyBit.Solid | FloorOccupancyBit.WallDecoration;
    const occupied: CellOccupancyQuery = {
      isOccupied: (x, y) => occupancy.hasAny(x, y, occupiedBits) || selected.isOccupied(x, y),
    };
    const isObjective = (cell: GridCell): boolean =>
      occupancy.hasAny(cell.x, cell.y, FloorOccupancyBit.Objective);
    for (const prop of props) {
      if (prop.kind === "brazier" || prop.kind === "candle" || prop.kind === "campfire") continue;
      const solid = SOLID_PROP_KINDS.has(prop.kind);
      const objectiveConflict = isObjective(prop);
      const protectedTraversal = isProtectedTraversalCell(dungeon, prop) || objectiveConflict;
      const needsRelocation =
        occupied.isOccupied(prop.x, prop.y) || objectiveConflict || (solid && protectedTraversal);
      const relocatedCell = needsRelocation
        ? findNearestPropCell(dungeon, prop, occupied, 4, (cell) => isObjective(cell))
        : null;
      if (needsRelocation && !relocatedCell) continue;
      const placedProp = relocatedCell ? { ...prop, ...relocatedCell } : prop;
      selected.mark(placedProp.x, placedProp.y, FloorOccupancyBit.Object);
      this.reserveObjectCell(placedProp);
      if (solid) {
        const cell = { x: placedProp.x, y: placedProp.y };
        this.handles.solidCells.set(`${cell.x},${cell.y}`, cell);
        this.markActiveFloorOccupancy(cell, FloorOccupancyBit.Solid);
        this.reserveObjectCell(cell);
      }
      if (placedProp.kind === "chest") {
        this.addInteractiveChest(dungeon, placedProp);
        continue;
      }
      const groupKey = `${placedProp.kind}:${Math.abs(placedProp.v ?? 0) % 3}`;
      const list = groups.get(groupKey) ?? [];
      list.push(placedProp);
      groups.set(groupKey, list);
    }
    let batchIndex = 0;
    for (const [, instances] of groups) {
      const groupKey = `${instances[0]!.kind}:${Math.abs(instances[0]!.v ?? 0) % 3}`;
      const template = this.getForgePropTemplateBatches(groupKey, instances[0]!);
      if (!template) continue;
      const instanceMatrices = instances.map((prop) => this.forgePropRootMatrix(dungeon, prop));
      for (const prop of instances) {
        if (
          !SOLID_PROP_KINDS.has(prop.kind) ||
          !occupancy.hasAny(prop.x, prop.y, FloorOccupancyBit.Solid)
        )
          continue;
        this.registerSolidBounds(
          template.bounds.clone().applyMatrix4(this.forgePropRootMatrix(dungeon, prop)),
          { x: prop.x, y: prop.y },
          true,
        );
      }
      for (const part of template.batches) {
        const batch = new THREE.InstancedMesh(part.geometry, part.material, instances.length);
        batch.name = `Forge static material batch ${batchIndex + 1}`;
        batch.castShadow = part.castShadow;
        batch.receiveShadow = part.receiveShadow;
        batch.frustumCulled = true;
        instanceMatrices.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
        batch.instanceMatrix.needsUpdate = true;
        batch.computeBoundingBox();
        batch.computeBoundingSphere();
        this.add(batch);
        batchIndex += 1;
      }
      this.stats.props += instances.length;
    }
  }

  private forgePropRootMatrix(dungeon: DungeonData, prop: ForgePropMetadata): THREE.Matrix4 {
    const position = gridToWorld(dungeon, { x: prop.x, y: prop.y }, this.tileSize);
    const onWallCell =
      typeof prop.dx === "number" &&
      typeof prop.dy === "number" &&
      dungeon.grid[prop.y]?.[prop.x] === WALL;
    const wallHugFloor =
      typeof prop.dx === "number" &&
      typeof prop.dy === "number" &&
      dungeon.grid[prop.y]?.[prop.x] === FLOOR &&
      WALL_HUGGING_KINDS.has(prop.kind);
    let rotation = prop.rot ?? 0;
    if (onWallCell) {
      const direction = new THREE.Vector3(prop.dx, 0, prop.dy).normalize();
      position.x += direction.x * this.tileSize * 0.505;
      position.z += direction.z * this.tileSize * 0.505;
      rotation = Math.atan2(direction.x, direction.z);
    } else if (wallHugFloor) {
      const hug = wallHugWorldOffset(
        prop.dx!,
        prop.dy!,
        this.tileSize,
        prop.kind === "bookshelf" ? 0.32 : 0.28,
      );
      position.x += hug.x;
      position.z += hug.z;
      rotation = prop.rot ?? facingRotation(prop.dx!, prop.dy!);
    }
    const scale = getForgePropScale(prop);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(position.x, 0, position.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation),
      new THREE.Vector3(scale, scale, scale),
    );
  }

  private addInteractiveChest(
    dungeon: DungeonData,
    prop: ForgePropMetadata,
    rewardKind: ChestRewardKind = "resolve",
    stableId?: string,
  ): void {
    const runtime = this.requireCurrentResidentFloor("Chest registration");
    const kit = this.createRuntimeChestKit();
    kit.root.name = `${rewardKind} chest ${prop.x},${prop.y}`;
    kit.root.userData.rewardKind = rewardKind;
    if (stableId) kit.root.userData.catalogKey = stableId;
    kit.root.userData.autoActivatesReward = chestRewardAutoActivates(rewardKind);
    this.forgePropRootMatrix(dungeon, prop).decompose(
      kit.root.position,
      kit.root.quaternion,
      kit.root.scale,
    );
    this.add(kit.root);
    kit.root.updateMatrix();
    this.registerSolidBounds(
      this.runtimeBoundsScratch.copy(this.runtimeChestTemplateBounds).applyMatrix4(kit.root.matrix),
      { x: prop.x, y: prop.y },
      true,
    );

    const anchor = new THREE.Vector3(0, 0.91, 0.02);
    kit.root.localToWorld(anchor);
    // Rewards mount beside the chest under the same resident root. Convert the
    // authored chest socket back to that local frame so upper slabs do not
    // bake their world height into the reward's transform.
    (this.currentFloorRenderGroup ?? this.currentResidentFloor?.root)?.worldToLocal(anchor);
    const item = this.createRewardObject(rewardKind);
    preparePickupOpacity(item);
    item.name = `${rewardKind} reward from chest`;
    item.userData.floorIndex = runtime.floorIndex;
    if (stableId) item.userData.catalogKey = stableId;
    const rewardScale = this.rewardScaleForKind(rewardKind);
    const baseScale = new THREE.Vector3(rewardScale, rewardScale, rewardScale);
    // Sit clearly above the open lid so idle rewards do not clip the chest.
    const baseY = anchor.y + 0.42;
    item.position.set(anchor.x, baseY - 0.34, anchor.z);
    // Keep the root and PointLights in the graph while dormant meshes stay out
    // of the render list until reveal.
    setPickupDormant(item, true);
    const reward: StaticPickupActor = {
      floorIndex: runtime.floorIndex,
      id: stableId ?? `${dungeon.seedHash}:floor:${runtime.floorIndex}:reward:${prop.x},${prop.y}`,
      kind: rewardKind,
      object: item,
      collected: false,
      collectTime: 0,
      collectOriginX: anchor.x,
      collectOriginY: baseY,
      collectOriginZ: anchor.z,
      available: false,
      revealTime: 0,
      baseY,
      baseScale,
      autoCollect: chestRewardAutoActivates(rewardKind),
    };
    if (rewardKind === "time-freeze") {
      const light = item.getObjectByName("Time freeze pickup light") as THREE.PointLight;
      light.intensity = 0;
      reward.timeFreezeSignal = {
        light,
        baseIntensity: TIME_FREEZE_PICKUP_LIGHT_INTENSITY,
      };
    } else if (rewardKind === "luminous-ward") {
      const light = item.getObjectByName("Luminous ward pickup light") as THREE.PointLight;
      light.intensity = 0;
      reward.luminousWardSignal = {
        light,
        glow: item.getObjectByName("Luminous ward pickup halo") as THREE.Mesh,
        baseIntensity: LUMINOUS_WARD_PICKUP_LIGHT_INTENSITY,
        baseGlowOpacity: LUMINOUS_WARD_PICKUP_GLOW_OPACITY,
      };
    } else if (rewardKind === "annihilation-pulse") {
      const light = item.getObjectByName("Annihilation pulse pickup light") as THREE.PointLight;
      light.intensity = 0;
      reward.annihilationPulseSignal = {
        light,
        glow: item.getObjectByName("Annihilation pulse pickup halo") as THREE.Mesh,
        baseIntensity: ANNIHILATION_PULSE_PICKUP_LIGHT_INTENSITY,
        baseGlowOpacity: ANNIHILATION_PULSE_PICKUP_GLOW_OPACITY,
      };
    } else if (rewardKind === "cull-brand") {
      const light = item.getObjectByName("Cull brand pickup light") as THREE.PointLight;
      light.intensity = 0;
      reward.cullBrandSignal = {
        light,
        glow: item.getObjectByName("Cull brand halo") as THREE.Mesh,
        baseIntensity: CULL_BRAND_PICKUP_LIGHT_INTENSITY,
        baseGlowOpacity: CULL_BRAND_PICKUP_GLOW_OPACITY,
      };
    } else if (rewardKind === "phoenix-egg") {
      const light = item.getObjectByName("Phoenix egg pickup light") as THREE.PointLight;
      light.intensity = 0;
      reward.phoenixEggSignal = {
        light,
        glow: item.getObjectByName("Phoenix egg halo") as THREE.Mesh,
        baseIntensity: PHOENIX_EGG_PICKUP_LIGHT_INTENSITY,
        baseGlowOpacity: PHOENIX_EGG_PICKUP_GLOW_OPACITY,
      };
    }
    runtime.registerPickup(reward);
    this.pickups.push(reward);
    const chest: StaticChestActor = {
      id: stableId ?? `${dungeon.seedHash}:floor:${runtime.floorIndex}:${prop.x},${prop.y}`,
      root: kit.root,
      lid: kit.lid,
      reward,
      opened: false,
      openness: 0,
      runtimeBatch: null,
    };
    runtime.registerChest(chest);
    this.chests.push(chest);
    const pending = this.pendingChestBatchesByRuntime.get(runtime);
    if (!pending) throw new Error("Chest registration requires a pending resident batch.");
    pending.push({ kit, chest });
    this.add(item);
    this.stats.props += 1;
  }

  /**
   * Clone a pre-merged five-mesh chest instead of rebuilding its authored
   * hundred-mesh carpentry tree for every reward seat in a resident stack.
   */
  private createRuntimeChestKit(): ForgeChestKit {
    if (!this.runtimeChestTemplate) {
      this.runtimeChestTemplate = createForgeChest(this.materials);
      batchForgeChestForRuntime(this.runtimeChestTemplate, {
        geometryStrategy: this.runtimeModelBatchingGeometryStrategy,
        geometryKeyPrefix: this.runtimeChestCatalogKey(),
      });
      const templateRoot = this.runtimeChestTemplate.root;
      const templatePosition = templateRoot.position.clone();
      const templateQuaternion = templateRoot.quaternion.clone();
      const templateScale = templateRoot.scale.clone();
      templateRoot.position.set(0, 0, 0);
      templateRoot.quaternion.identity();
      templateRoot.scale.set(1, 1, 1);
      templateRoot.updateMatrixWorld(true);
      this.runtimeChestTemplateBounds.setFromObject(templateRoot);
      templateRoot.position.copy(templatePosition);
      templateRoot.quaternion.copy(templateQuaternion);
      templateRoot.scale.copy(templateScale);
      templateRoot.updateMatrixWorld(true);
      const authoringRuntime = this.runtimeChestTemplate.root.userData.sculptRuntime as
        | Record<string, unknown>
        | undefined;
      if (authoringRuntime) {
        // These authoring maps point at the original mesh tree. Runtime uses the
        // preserved semantic groups and sockets directly, so cloning stale
        // Object3D references would add cost and expose the wrong nodes.
        delete authoringRuntime.nodes;
        delete authoringRuntime.meshes;
        delete authoringRuntime.sockets;
        delete authoringRuntime.parts;
      }
    }
    const root = this.runtimeChestTemplate.root.clone(true);
    const lid = root.getObjectByName(this.runtimeChestTemplate.lid.name);
    if (!(lid instanceof THREE.Group)) {
      throw new Error("Runtime chest template lost its lid hinge.");
    }
    return { root, lid };
  }

  /** Commit only source kits that share one resident-local coordinate frame. */
  private commitChestBatches(runtime: ResidentFloorRuntimeOwner): void {
    const pending = this.pendingChestBatchesByRuntime.get(runtime);
    if (!pending || pending.length === 0) return;
    const result = batchForgeChestsForRuntime(
      pending.map(({ kit }) => kit),
      runtime.root,
      {
        geometryStrategy: this.runtimeModelBatchingGeometryStrategy,
        geometryKeyPrefix: this.runtimeChestCatalogKey(),
      },
    );
    result.root.name = `Runtime chest floor ${runtime.floorIndex + 1} batches`;
    result.root.userData.floorIndex = runtime.floorIndex;
    result.root.userData.runtimeBatchOwner = "resident-chests";
    runtime.root.add(result.root);
    runtime.registerChestBatchRoot(result.root);
    result.handles.forEach((handle, index) => {
      const chest = pending[index]?.chest;
      if (chest) chest.runtimeBatch = handle;
    });
    pending.length = 0;
  }

  /** Commit only frame sources from one floor so no instance crosses a slab. */
  private commitDoorFrameBatches(runtime: ResidentFloorRuntimeOwner): void {
    const pending = this.pendingDoorActorsByRuntime.get(runtime);
    if (!pending || pending.length === 0) return;
    const result = batchDoorFramesForRuntime(pending, runtime.root, {
      geometryStrategy: this.runtimeModelBatchingGeometryStrategy,
      geometryKeyPrefix: "rigid-prop/v2:family:door-frame:bake:normalized",
      keyForDoor: (door) => String(door.root.userData.staticDoorFrameTopology ?? "unknown"),
    });
    result.root.name = `Runtime door frame floor ${runtime.floorIndex + 1} batches`;
    result.root.userData.floorIndex = runtime.floorIndex;
    result.root.userData.runtimeBatchOwner = "resident-door-frames";
    runtime.root.add(result.root);
    runtime.registerDoorBatchRoot(result.root);
    result.handles.forEach((handle, index) => {
      const door = pending[index];
      if (door) door.runtimeBatch = handle;
    });
    pending.length = 0;
  }

  private commitResidentInteractiveBatches(): void {
    for (const runtime of this.residentFloorsByIndex.values()) {
      this.commitDoorFrameBatches(runtime);
      this.commitChestBatches(runtime);
    }
  }

  private registerSolidBounds(
    bounds: THREE.Box3,
    cell: GridCell,
    boundsAreFloorLocal = false,
  ): void {
    if (bounds.isEmpty()) return;
    if (boundsAreFloorLocal && this.floorWorldY !== 0) {
      bounds.translate(this.tempPosition.set(0, this.floorWorldY, 0));
    }
    // Inset the solid slightly so decorative edges and fat AABBs do not glue the
    // player to a prop after a jump. Keep a usable core for low crates/benches.
    const inset = 0.05;
    let minX = bounds.min.x + inset;
    let maxX = bounds.max.x - inset;
    let minZ = bounds.min.z + inset;
    let maxZ = bounds.max.z - inset;
    if (maxX - minX < 0.14) {
      const cx = (bounds.min.x + bounds.max.x) * 0.5;
      minX = cx - 0.07;
      maxX = cx + 0.07;
    }
    if (maxZ - minZ < 0.14) {
      const cz = (bounds.min.z + bounds.max.z) * 0.5;
      minZ = cz - 0.07;
      maxZ = cz + 0.07;
    }
    const minY = bounds.min.y;
    // Slightly lower than visual max so feet clear the bulk of jumpable props.
    const maxY = Math.max(minY + 0.1, bounds.max.y - 0.05);
    this.handles.solidCells.set(`${cell.x},${cell.y}`, { ...cell });
    this.markActiveFloorOccupancy(cell, FloorOccupancyBit.Solid);
    this.reserveObjectCell(cell);
    this.addSolidColliders({
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ,
    });
    if (maxY > 0.14) {
      this.staticContactShadowPlacements.push({
        x: (minX + maxX) * 0.5,
        z: (minZ + maxZ) * 0.5,
        width: maxX - minX,
        depth: maxZ - minZ,
      });
    }
  }

  private commitStaticContactShadows(): void {
    const placements = this.staticContactShadowPlacements;
    if (placements.length === 0) return;
    const geometry = this.resourceCatalog.borrowGeometry(
      "rigid-prop/v2:family:contact-shadow:topology:circle:radius:0.5000:segments:18",
      () => new THREE.CircleGeometry(0.5, 18),
      "static-contact-shadow-geometry/v2",
    );
    const material = new THREE.MeshBasicMaterial({
      name: "Static prop contact shadow material",
      map: this.getStaticContactShadowTexture(),
      color: new THREE.Color(this.activeMood.surfaceTint).multiplyScalar(0.08),
      transparent: true,
      opacity: this.activeMood.id === "backrooms" ? 0.19 : 0.26,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const batch = new THREE.InstancedMesh(geometry, material, placements.length);
    batch.name = "Static prop contact shadows";
    batch.renderOrder = 1;
    const rotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      -Math.PI / 2,
    );
    placements.forEach((placement, index) => {
      this.tempMatrix.compose(
        new THREE.Vector3(placement.x, 0.032, placement.z),
        rotation,
        new THREE.Vector3(
          THREE.MathUtils.clamp(placement.width * 1.18, 0.48, 2.8),
          THREE.MathUtils.clamp(placement.depth * 1.18, 0.48, 2.8),
          1,
        ),
      );
      batch.setMatrixAt(index, this.tempMatrix);
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    this.add(batch);
  }

  private addLightProps(dungeon: DungeonData, floorPlan?: ResidentDungeonFloorPlan): void {
    if (this.activeMood.id === "backrooms") {
      this.addBackroomsLightProps(dungeon, floorPlan);
      return;
    }
    if (dungeon.forge) {
      this.addForgeLightProps(dungeon);
      return;
    }
    const random = createSeededRandom(floorPlan?.light.seed ?? `${dungeon.seed}:fire-props`);
    const candidates: Array<{ wall: GridCell; floor: GridCell }> = [];
    for (const wall of collectBoundaryWalls(dungeon)) {
      for (const [dx, dy] of CARDINAL_NEIGHBORS) {
        const floor = { x: wall.x + dx, y: wall.y + dy };
        if (
          dungeon.grid[floor.y]?.[floor.x] === FLOOR &&
          !this.isObjectiveClearanceCell(floor) &&
          !this.isObjectOccupiedCell(floor)
        ) {
          candidates.push({ wall, floor });
          break;
        }
      }
    }
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swap = random.integer(0, index);
      [candidates[index], candidates[swap]] = [candidates[swap]!, candidates[index]!];
    }
    // Even coverage across the map — no preferential ring around the player spawn.
    const target =
      floorPlan?.light.mode === "classic"
        ? floorPlan.light.torchTarget
        : Math.max(6, Math.round((8 + dungeon.rooms.length * 0.45) * this.decorDensity));
    const torches: typeof candidates = [];
    for (const candidate of candidates) {
      if (
        dungeon.grid[candidate.floor.y]?.[candidate.floor.x] !== FLOOR ||
        this.isObjectiveClearanceCell(candidate.floor) ||
        this.isObjectOccupiedCell(candidate.floor)
      ) {
        continue;
      }
      if (
        torches.some(
          (placed) =>
            Math.max(
              Math.abs(placed.wall.x - candidate.wall.x),
              Math.abs(placed.wall.y - candidate.wall.y),
            ) < 4,
        )
      )
        continue;
      torches.push(candidate);
      if (torches.length >= target) break;
    }

    torches.forEach((candidate, index) => {
      const wall = gridToWorld(dungeon, candidate.wall, this.tileSize);
      const floor = gridToWorld(dungeon, candidate.floor, this.tileSize);
      const direction = new THREE.Vector3(floor.x - wall.x, 0, floor.z - wall.z).normalize();
      const position = new THREE.Vector3(wall.x, 1.42, wall.z).addScaledVector(
        direction,
        this.tileSize * 0.505,
      );
      this.reserveWallObjectCell(candidate.floor);
      this.addFireProp("torch", position, true, index * 1.73, direction);
    });

    const rooms = dungeon.rooms.filter(
      (room) => room.role === "room" && !this.isObjectiveClearanceCell(room.center),
    );
    const campfireCount = Math.min(6, Math.round(rooms.length * 0.34 * this.decorDensity));
    let placedCampfires = 0;
    for (let index = 0; index < campfireCount; index += 1) {
      const room = rooms[(index * 3 + 1) % Math.max(1, rooms.length)];
      if (!room) continue;
      const p = gridToWorld(dungeon, room.center, this.tileSize);
      const position = {
        x: p.x + (random.next() - 0.5) * 1.1,
        z: p.z + (random.next() - 0.5) * 1.1,
      };
      const cell = worldToGrid(dungeon, position, this.tileSize);
      if (this.isObjectOccupiedCell(cell)) continue;
      this.reserveObjectCell(cell);
      // Slight offset from true center so the fire does not sit under the player spawn path.
      this.addFireProp(
        "campfire",
        new THREE.Vector3(position.x, 0, position.z),
        true,
        9 + index * 2.1,
      );
      placedCampfires += 1;
    }

    const farRooms = [...rooms]
      .sort((a, b) => roomDistance(dungeon, b) - roomDistance(dungeon, a))
      .slice(1, 3);
    let placedBraziers = 0;
    farRooms.forEach((room, index) => {
      const p = gridToWorld(dungeon, room.center, this.tileSize);
      const position = {
        x: p.x + 1.15,
        z: p.z - 0.8,
      };
      const cell = worldToGrid(dungeon, position, this.tileSize);
      if (this.isObjectOccupiedCell(cell)) return;
      this.reserveObjectCell(cell);
      this.addFireProp(
        "brazier",
        new THREE.Vector3(position.x, 0, position.z),
        true,
        20 + index * 2.7,
      );
      placedBraziers += 1;
    });
    this.stats.props += torches.length + placedCampfires + placedBraziers;
    this.stats.lights = this.fireEffects.filter((effect) => effect.light).length + 4;
  }

  /**
   * Replace fantasy fire with a fixed-budget fluorescent ceiling kit. Each
   * fixture uses the same distance/LOS light path as a torch, but stays silent.
   */
  private addBackroomsLightProps(dungeon: DungeonData, floorPlan?: ResidentDungeonFloorPlan): void {
    const plannedCells = floorPlan?.light.fixtures
      .filter((fixture) => fixture.kind === "backrooms")
      .map((fixture) => fixture.cell);
    const cells =
      plannedCells && plannedCells.length > 0
        ? plannedCells
        : [
            dungeon.spawn,
            dungeon.exit,
            ...dungeon.rooms.filter((room) => room.role === "room").map((room) => room.center),
          ];
    const seen = new Set<string>();
    const anchors = cells.filter((cell) => {
      const key = `${cell.x},${cell.y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return dungeon.grid[cell.y]?.[cell.x] === FLOOR;
    });
    // This budget belongs to the whole resident stack, not each visible slab.
    // A Backrooms campaign otherwise created ten detached practicals per floor.
    const stackFloorBudget = this.stackBuildActive
      ? Math.max(
          0,
          DYNAMIC_FIRE_LIGHTS_PER_FLOOR -
            (this.currentResidentFloor?.dynamicFireLights.length ?? 0),
        )
      : MAX_DYNAMIC_FIRE_LIGHTS;
    const target = Math.min(
      stackFloorBudget,
      Math.max(0, MAX_DYNAMIC_FIRE_LIGHTS - this.dynamicFireLightCount),
      anchors.length,
    );
    for (let index = 0; index < target; index += 1) {
      const cell = anchors[index]!;
      const plannedPhase = floorPlan?.light.fixtures.find(
        (fixture) =>
          fixture.kind === "backrooms" && fixture.cell.x === cell.x && fixture.cell.y === cell.y,
      )?.phase;
      const position = gridToWorld(dungeon, cell, this.tileSize);
      const root = new THREE.Group();
      root.name = "Backrooms fluorescent ceiling fixture";
      root.position.set(position.x, this.wallHeight - 0.04, position.z);
      root.rotation.y = index % 2 === 0 ? 0 : Math.PI / 2;

      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 0.48), this.materials.iron);
      frame.name = "Fluorescent fixture frame";
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.035, 0.31),
        new THREE.MeshStandardMaterial({
          color: 0xe7dfaa,
          emissive: 0xbcb36f,
          emissiveIntensity: 1.45,
          roughness: 0.48,
        }),
      );
      panel.name = "Fluorescent light panel glow";
      panel.position.y = -0.065;
      root.add(frame, panel);

      const baseIntensity = 86;
      const light = new THREE.PointLight(0xe5dda7, baseIntensity, 14, 1.94);
      light.name = "Fluorescent practical point light";
      light.position.set(0, -0.36, 0);
      root.add(light);
      this.add(root);
      const detachedLight = this.detachFireLight(root, light);
      this.registerFireEffect({
        root,
        flame: panel,
        flameDetails: [],
        halos: [],
        light: detachedLight,
        baseIntensity,
        baseY: panel.position.y,
        baseFlameScaleY: panel.scale.y,
        currentLightFactor: 1,
        cutoffDistance: 14,
        phase: plannedPhase ?? index * 2.47,
        losOpen: true,
        losAge: deterministicLosAge(plannedPhase ?? index * 2.47),
        audio: false,
      });
    }
    this.stats.props += target;
    this.stats.lights = this.dynamicFireLightCount + 4;
  }

  private addForgeLightProps(dungeon: DungeonData): void {
    const forge = dungeon.forge;
    if (!forge) return;
    // Reserve two slots for authored floor fires, then spread the remaining
    // fixed budget across the map. All other fires keep their visible flame.
    const fireProps: ForgePropMetadata[] = [];
    for (const prop of forge.props) {
      if (
        (prop.kind !== "candle" && prop.kind !== "campfire" && prop.kind !== "brazier") ||
        this.isObjectiveClearanceCell(prop) ||
        this.isObjectOccupiedCell(prop)
      )
        continue;
      this.reserveObjectCell(prop);
      fireProps.push(prop);
    }
    const floorLightBudget = Math.min(2, fireProps.length);
    const torchLightBudget = MAX_DYNAMIC_FIRE_LIGHTS - floorLightBudget;
    const roomCenters = dungeon.rooms
      .filter((room) => room.role === "room")
      .map((room) => room.center);
    const lit = selectDistributedTorchIndices(
      forge.torches,
      torchLightBudget,
      dungeon.spawn,
      dungeon.exit,
      roomCenters,
    );
    let placedTorches = 0;
    forge.torches.forEach((torch, index) => {
      const floorCell = { x: torch.x + torch.dx, y: torch.y + torch.dy };
      if (
        dungeon.grid[floorCell.y]?.[floorCell.x] === FLOOR &&
        this.isObjectOccupiedCell(floorCell)
      )
        return;
      const wall = gridToWorld(dungeon, { x: torch.x, y: torch.y }, this.tileSize);
      const direction = new THREE.Vector3(torch.dx, 0, torch.dy).normalize();
      const position = new THREE.Vector3(wall.x, 1.42, wall.z).addScaledVector(
        direction,
        this.tileSize * 0.505,
      );
      if (dungeon.grid[floorCell.y]?.[floorCell.x] === FLOOR) this.reserveWallObjectCell(floorCell);
      this.addFireProp("torch", position, true, index * 1.73, direction, lit.has(index));
      placedTorches += 1;
    });
    // Legacy forge JSON used `candle`; map both to the floor campfire assembly.
    fireProps.forEach((prop, index) => {
      const position = gridToWorld(dungeon, { x: prop.x, y: prop.y }, this.tileSize);
      const kind = prop.kind === "brazier" ? "brazier" : "campfire";
      this.addFireProp(
        kind,
        new THREE.Vector3(position.x, 0, position.z),
        true,
        19 + index * 2.1,
        undefined,
        index < floorLightBudget,
      );
    });
    this.stats.props += placedTorches + fireProps.length;
    this.stats.lights = this.fireEffects.filter((effect) => effect.light).length + 4;
  }

  private addFireProp(
    kind: "torch" | "campfire" | "candle" | "brazier",
    position: THREE.Vector3,
    lit: boolean,
    phase: number,
    facing?: THREE.Vector3,
    dynamicLight = lit,
  ): void {
    const stackFloorLightCount = this.currentResidentFloor?.dynamicFireLights.length ?? 0;
    const canAddDynamicLight =
      lit &&
      dynamicLight &&
      this.dynamicFireLightCount < MAX_DYNAMIC_FIRE_LIGHTS &&
      (!this.stackBuildActive || stackFloorLightCount < DYNAMIC_FIRE_LIGHTS_PER_FLOOR);
    if (kind === "torch" && facing) {
      const fixtureKind = Math.floor(phase * 10) % 4 === 0 ? "lantern" : "torch";
      const torch =
        fixtureKind === "lantern"
          ? createWallLantern(position, facing, lit, this.materials)
          : createWallTorch(position, facing, lit, this.materials);
      const keepDynamicLight = canAddDynamicLight;
      if (keepDynamicLight) {
        // Fake light pooling on the floor — LOD-faded with the other halos.
        const pool = createTorchFloorPool(position, facing, this.getTorchFloorPoolTexture());
        torch.halos.push(pool);
        this.add(pool);
      }
      this.add(torch.root);
      const light = keepDynamicLight
        ? this.detachFireLight(torch.root, torch.light)
        : this.removeFireLight(torch.root, torch.light, torch.halos);
      const effect: StaticFireEffect = {
        root: torch.root,
        flame: torch.flame,
        flameDetails: torch.flameDetails,
        halos: torch.halos,
        light,
        baseIntensity: torch.baseIntensity,
        baseY: torch.baseY,
        baseFlameScaleY: torch.flame.scale.y,
        currentLightFactor: light ? 1 : 0,
        cutoffDistance: FIRE_LIGHT_TUNING.wallRange,
        phase,
        losOpen: true,
        losAge: deterministicLosAge(phase),
      };
      this.registerFireEffect(effect);
      this.pendingWallFireFixtures.push({
        fixture: { kind: fixtureKind, root: torch.root },
        effect,
      });
      return;
    }
    if (kind === "campfire" || kind === "candle") {
      const campfire = createFloorCampfire(position, lit, this.materials, Math.floor(phase * 10));
      this.add(campfire.root);
      const keepDynamicLight = canAddDynamicLight;
      const light = keepDynamicLight
        ? this.detachFireLight(campfire.root, campfire.light)
        : this.removeFireLight(campfire.root, campfire.light, campfire.halos);
      this.registerFireEffect({
        root: campfire.root,
        flame: campfire.flame,
        flameDetails: campfire.flameDetails,
        halos: campfire.halos,
        light,
        baseIntensity: campfire.baseIntensity,
        baseY: campfire.baseY,
        baseFlameScaleY: campfire.flame.scale.y,
        currentLightFactor: light ? 1 : 0,
        cutoffDistance: FIRE_LIGHT_TUNING.candleRange,
        phase,
        losOpen: true,
        losAge: deterministicLosAge(phase),
      });
      return;
    }
    const root = createLightingPropBase("brazier", this.materials, Math.floor(phase * 10));
    root.position.copy(position);
    root.name = "brazier fire prop";
    const flameSocket = root.getObjectByName("Brazier flame socket");
    const flamePosition = flameSocket?.position ?? new THREE.Vector3(0, 1.19, 0);
    const flameY = flamePosition.y;
    const coldFlame = this.activeMood.id === "frost";
    const emberNodes = root.getObjectByName("Brazier restrained ember nodes");
    if (emberNodes instanceof THREE.InstancedMesh) {
      const emberMaterial = emberNodes.material;
      if (emberMaterial instanceof THREE.MeshStandardMaterial) {
        emberMaterial.color.setHex(coldFlame ? 0x44231d : 0x572619);
        emberMaterial.emissive.setHex(coldFlame ? 0xa94c2b : 0xb9471e);
        emberMaterial.emissiveIntensity = coldFlame ? 0.18 : 0.28;
        emberMaterial.userData.biomeAdjustedEmber = true;
      }
      emberNodes.scale.set(0.72, 0.58, 0.72);
    }
    const flameVfx = createNoiseFlame({
      name: "Brazier runtime procedural noise flame",
      width: 0.56,
      height: 0.76,
      phase,
      palette: coldFlame ? FROST_NOISE_FLAME_PALETTE : WARM_NOISE_FLAME_PALETTE,
      opacity: coldFlame ? 0.92 : 0.98,
      turbulence: 1.18,
      lean: -0.07,
      emberCount: 8,
    });
    const flame = flameVfx.flame;
    flame.position.copy(flamePosition);
    flame.rotation.y = phase * 0.17;
    flame.visible = lit;
    flame.userData.decorativeVfx = true;

    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(0.28, 14),
      new THREE.MeshBasicMaterial({
        color: coldFlame ? 0x547f9e : 0xa9683e,
        transparent: true,
        opacity: coldFlame ? 0.018 : 0.035,
        blending: THREE.NormalBlending,
        depthWrite: false,
      }),
    );
    halo.name = "Brazier restrained flame halo";
    halo.rotation.x = -Math.PI / 2;
    halo.position.copy(flamePosition).add(new THREE.Vector3(0, 0.018, 0));
    halo.visible = lit;
    halo.renderOrder = 3;
    halo.userData.decorativeVfx = true;
    root.add(flame, halo);
    const baseIntensity = coldFlame ? 6.5 : 18;
    const lightRange = coldFlame ? 5.5 : 8;
    const keepDynamicLight = canAddDynamicLight;
    const light = keepDynamicLight
      ? new THREE.PointLight(coldFlame ? 0x78a8c2 : 0xc98a50, baseIntensity, lightRange, 2.12)
      : null;
    if (light) {
      light.position.copy(flamePosition).add(new THREE.Vector3(0, 0.08, 0));
      root.add(light);
    }
    this.add(root);
    const detachedLight = this.detachFireLight(root, light);
    this.registerFireEffect({
      root,
      flame,
      flameDetails: flameVfx.details,
      halos: [halo],
      light: detachedLight,
      baseIntensity,
      baseY: flameY,
      baseFlameScaleY: flame.scale.y,
      currentLightFactor: detachedLight ? 1 : 0,
      cutoffDistance: lightRange,
      phase,
      losOpen: true,
      losAge: deterministicLosAge(phase),
    });
  }

  private commitWallFireBatches(): void {
    if (this.pendingWallFireFixtures.length === 0) return;
    const runtime = this.requireCurrentResidentFloor("Wall-fire batch registration");
    const result = batchWallFireFixturesForRuntime(
      this.pendingWallFireFixtures.map((entry) => entry.fixture),
      runtime.root,
    );
    result.root.name = `Runtime wall-fire floor ${runtime.floorIndex + 1} batches`;
    result.root.userData.floorIndex = runtime.floorIndex;
    result.root.userData.runtimeBatchOwner = "resident-wall-fire";
    // Matrices above are already relative to this resident root. Mounting the
    // batch here applies exactly one slab transform on upper floors.
    runtime.root.add(result.root);
    runtime.registerWallFireBatchRoot(result.root);
    result.handles.forEach((handle, index) => {
      const entry = this.pendingWallFireFixtures[index];
      if (entry) entry.effect.runtimeFixture = handle;
    });
    this.pendingWallFireFixtures.length = 0;
  }

  private detachFireLight(
    root: THREE.Group,
    light: THREE.PointLight | null,
  ): THREE.PointLight | null {
    if (!light) return null;
    const runtime = this.currentResidentFloor;
    root.updateWorldMatrix(true, true);
    light.getWorldPosition(this.tempPosition);
    light.removeFromParent();
    if (!runtime) {
      light.position.copy(this.tempPosition);
      light.visible = true;
      this.addGlobal(light);
      this.dynamicFireLightCount += 1;
      return light;
    }
    runtime.root.updateWorldMatrix(true, false);
    runtime.root.worldToLocal(this.tempPosition);
    // Preserve the authored world location while keeping the light owned by
    // the resident slab. This avoids both a global orphan and a double slab.
    light.position.copy(this.tempPosition);
    light.visible = true;
    runtime.root.add(light);
    runtime.registerDynamicFireLight(light);
    this.dynamicFireLightCount += 1;
    return light;
  }

  private removeFireLight(
    root: THREE.Group,
    light: THREE.PointLight | null,
    halos: THREE.Object3D[],
  ): null {
    light?.removeFromParent();
    const resourceDisposer = new ThreeResourceDisposer();
    for (const halo of halos) {
      halo.removeFromParent();
      resourceDisposer.dispose(halo);
    }
    halos.length = 0;
    root.updateMatrixWorld(true);
    return null;
  }

  /**
   * Ambient "life and decay" scatter: cobwebs in corners, bone piles, hanging
   * chains/vines from ceilings, and rubble drifts. Each kind is ONE InstancedMesh
   * (shared geometry + material), so hundreds of props cost a handful of draw
   * calls and add no per-frame GC pressure. Density is gated by decorDensity.
   * Runs for both forge and classic dungeons.
   */
  private addAtmosphereProps(dungeon: DungeonData, floorPlan?: ResidentDungeonFloorPlan): void {
    const random = createSeededRandom(floorPlan?.atmosphere.seed ?? `${dungeon.seed}:atmosphere`);
    this.scatterCobwebs(dungeon, random);
    // Restore the batched 3D ambience. This does not re-enable the retired 2D
    // wall atlas: chains, vines, bones and rubble are geometry-based families.
    this.scatterRoomAtmosphereProps(dungeon, random);
    void this.scatterWallDecor;
  }

  private getAtmosphereTemplate(key: string, factory: () => THREE.Group): THREE.Group {
    const existing = this.runtimeAtmosphereTemplates.get(key);
    if (existing) return existing;
    const template = factory();
    this.runtimeAtmosphereTemplates.set(key, template);
    return template;
  }

  /** Sparse ceiling shafts: one quiet light cue per large dungeon wing. */
  private addAmbientGodrays(
    dungeon: DungeonData,
    mood: DungeonMood,
    floorPlan?: ResidentDungeonFloorPlan,
  ): void {
    if (this.decorDensity < 0.18) return;
    const random = createSeededRandom(
      floorPlan?.atmosphere.ambientSeed ?? `${dungeon.seed}:ambient-godrays`,
    );
    const candidates = dungeon.rooms
      .filter(
        (room) =>
          room.role === "room" &&
          room.width >= 5 &&
          room.height >= 5 &&
          Math.hypot(room.center.x - dungeon.spawn.x, room.center.y - dungeon.spawn.y) >= 5,
      )
      .map((room) => ({ room, tie: random.next() }))
      .sort((left, right) => left.tie - right.tie);
    const count = Math.min(candidates.length, this.decorDensity >= 0.72 ? 3 : 2);
    const color = new THREE.Color(mood.keyColor)
      .lerp(new THREE.Color(mood.mistColor), 0.42)
      .getHex();
    for (let index = 0; index < count; index += 1) {
      const room = candidates[index]!.room;
      const center = gridToWorld(dungeon, room.center, this.tileSize);
      const beam = createVolumetricBeam(
        color,
        this.wallHeight - 0.18,
        Math.min(0.92, Math.max(0.58, Math.min(room.width, room.height) * 0.12)),
        0.1 + index * 0.012,
        {
          role: "ambient",
          blending: THREE.NormalBlending,
          fog: true,
          toneMapped: true,
        },
      );
      beam.name = `Ambient godray ${index + 1}`;
      beam.position.set(
        center.x + (random.next() - 0.5) * this.tileSize * 0.7,
        this.wallHeight - 0.06,
        center.z + (random.next() - 0.5) * this.tileSize * 0.7,
      );
      beam.rotation.y = random.next() * Math.PI;
      this.registerAmbientBeam(beam);
      this.add(beam);
      this.stats.beams += 1;
    }
  }

  /** Tint all authored light emitters once at build time; this adds no frame work or lights. */
  private applyMoodToPracticalLights(mood: DungeonMood): void {
    const lantern = new THREE.Color(mood.lanternColor);
    const core = lantern.clone().lerp(new THREE.Color(mood.keyColor), 0.42);
    const signalName = /(flame|glow|halo|beam|portal|crystal|light pool)/i;
    const tintMaterial = (material: THREE.Material, color: THREE.Color, strength: number): void => {
      if (material instanceof THREE.ShaderMaterial) {
        const uniform = material.uniforms.uColor;
        if (uniform?.value instanceof THREE.Color) uniform.value.lerp(color, strength);
        return;
      }
      if (
        material instanceof THREE.MeshBasicMaterial ||
        material instanceof THREE.MeshLambertMaterial ||
        material instanceof THREE.MeshPhongMaterial ||
        material instanceof THREE.MeshStandardMaterial
      ) {
        material.color.lerp(color, strength);
        if ("emissive" in material && material.emissive instanceof THREE.Color) {
          material.emissive.lerp(color, strength * 0.75);
        }
      }
    };
    const runtime = this.currentResidentFloor;
    (runtime?.root ?? this.group).traverse((object) => {
      if (object instanceof THREE.PointLight) {
        object.color.setHex(biomeTintedLightColor(object.color.getHex(), mood));
      }
      if (!(object instanceof THREE.Mesh) || !signalName.test(object.name)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) tintMaterial(material, lantern, 0.48);
    });
    for (const effect of runtime?.fires ?? this.fireEffects) {
      effect.light?.color.copy(lantern);
      const tintedFlameMaterials = new Set<THREE.Material>();
      const flameObjects: THREE.Object3D[] = [effect.flame, ...effect.flameDetails];
      for (const object of flameObjects) {
        if (!(object instanceof THREE.Mesh)) continue;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (tintedFlameMaterials.has(material)) continue;
          tintedFlameMaterials.add(material);
          if (isNoiseFlameMaterial(material)) {
            setNoiseFlameMoodPalette(material, lantern, core);
            continue;
          }
          const tintStrength =
            object === effect.flame ? 1 : object.userData.preserveWarmCore ? 0.12 : 0.86;
          tintMaterial(material, object === effect.flame ? lantern : core, tintStrength);
        }
      }
      for (const halo of effect.halos) {
        if (!(halo instanceof THREE.Mesh)) continue;
        const materials = Array.isArray(halo.material) ? halo.material : [halo.material];
        for (const material of materials) tintMaterial(material, lantern, 0.74);
      }
    }
  }

  /** Cobwebs in inside-corners (concave wall junctions) and ceiling drops. */
  private scatterCobwebs(
    dungeon: DungeonData,
    random: ReturnType<typeof createSeededRandom>,
  ): void {
    // Find inside-corners: WALL cells with FLOOR on two ADJACENT cardinals form a
    // concave corner the player can see — the classic cobweb spot.
    type Corner = { x: number; y: number; ax: number; ay: number; bx: number; by: number };
    const corners: Corner[] = [];
    for (let y = 1; y < dungeon.height - 1; y += 1) {
      for (let x = 1; x < dungeon.width - 1; x += 1) {
        if (dungeon.grid[y]?.[x] !== FLOOR) continue;
        const open: Array<[number, number]> = [];
        for (const [dx, dy] of CARDINAL_NEIGHBORS) {
          if (dungeon.grid[y + dy]?.[x + dx] === FLOOR) open.push([dx, dy]);
        }
        // An inside corner has open space on at most 2 adjacent cardinals and
        // walls on the other two (concave). Pick the wall-facing pair.
        if (open.length !== 2) continue;
        const [a, b] = open;
        if (!a || !b) continue;
        const adjacent = a[0] * b[0] + a[1] * b[1] === 0; // perpendicular = adjacent
        if (!adjacent) continue;
        corners.push({ x, y, ax: -a[0], ay: -a[1], bx: -b[0], by: -b[1] });
      }
    }
    if (corners.length === 0) return;

    // Density: a fraction of corners get a web, scaled by decorDensity. Min 4.
    const profile = getBiomeDecorationProfile(this.activeMood.id);
    const target = Math.max(
      4,
      Math.min(Math.round(corners.length * 0.4 * this.decorDensity * profile.webDensity), 210),
    );
    // Pick a well-spread subset.
    const chosen: Corner[] = [];
    const shuffled = [...corners];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = random.integer(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    for (const corner of shuffled) {
      if (chosen.length >= target) break;
      // Min Chebyshev separation so webs don't clump.
      if (chosen.some((c) => Math.max(Math.abs(c.x - corner.x), Math.abs(c.y - corner.y)) < 2))
        continue;
      chosen.push(corner);
    }
    if (chosen.length === 0) return;

    const geometry = createCobwebGeometry(0);
    const material = createCobwebMaterial(
      this.activeMood.dustColor,
      0.3 + this.decorDensity * 0.08,
      0,
    );
    const batch = new THREE.InstancedMesh(geometry, material, chosen.length);
    batch.name = "Corner cobwebs";
    batch.renderOrder = 3;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const basis = new THREE.Matrix4();
    const xAxis = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const zAxis = new THREE.Vector3();
    chosen.forEach((corner, index) => {
      const p = gridToWorld(dungeon, corner, this.tileSize);
      // Anchor at the physical wall intersection, then extend both sheets back
      // into the two open floor directions.
      position.set(
        p.x + (corner.ax + corner.bx) * this.tileSize * 0.5,
        this.wallHeight - 0.08,
        p.z + (corner.ay + corner.by) * this.tileSize * 0.5,
      );
      xAxis.set(-corner.ax, 0, -corner.ay);
      zAxis.set(-corner.bx, 0, -corner.by);
      if (xAxis.x * zAxis.z - xAxis.z * zAxis.x < 0) {
        const swapX = xAxis.x;
        const swapZ = xAxis.z;
        xAxis.copy(zAxis);
        zAxis.set(swapX, 0, swapZ);
      }
      basis.makeBasis(xAxis, yAxis, zAxis);
      quaternion.setFromRotationMatrix(basis);
      const sizeScale = 0.85 + random.next() * 0.5;
      scale.set(sizeScale, sizeScale, sizeScale);
      matrix.compose(position, quaternion, scale);
      batch.setMatrixAt(index, matrix);
    });
    batch.instanceMatrix.needsUpdate = true;
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    this.add(batch);
    this.stats.props += chosen.length;
  }

  /**
   * Lit wall sprites: two paintings, a fissure and a seal/stain. Each biome
   * owns a four-frame atlas; instances share one mesh/material per frame.
   */
  private scatterWallDecor(
    dungeon: DungeonData,
    random: ReturnType<typeof createSeededRandom>,
  ): void {
    const profile = getBiomeDecorationProfile(this.activeMood.id);
    const placements: Array<Array<{ seat: ReturnType<typeof collectRoomWallSeats>[number] }>> = [
      [],
      [],
      [],
      [],
    ];
    const occupancy = this.requireActiveFloorOccupancy("Wall decor");
    const placementOverlay = new FloorOccupancyOverlay(dungeon.width, dungeon.height);
    const occupiedBits =
      FloorOccupancyBit.Object |
      FloorOccupancyBit.Solid |
      FloorOccupancyBit.Objective |
      FloorOccupancyBit.WallDecoration;
    const isOccupied = (cell: GridCell): boolean =>
      occupancy.hasAny(cell.x, cell.y, occupiedBits) || placementOverlay.isOccupied(cell.x, cell.y);
    for (const room of dungeon.rooms) {
      if (room.role !== "room") continue;
      const seats = this.getRoomWallSeats(dungeon, room).filter((seat) => !isOccupied(seat.cell));
      if (seats.length === 0) continue;
      const area = room.width * room.height;
      const count = Math.min(
        3,
        Math.max(1, Math.round((area / 42) * this.decorDensity * profile.wallDecorDensity)),
      );
      const selectedSeats = pickSeparatedWallSeats(seats, count, dungeon.seedHash + room.id * 41);
      selectedSeats.forEach((seat, index) => {
        placementOverlay.mark(seat.cell.x, seat.cell.y, FloorOccupancyBit.WallDecoration);
        this.reserveWallObjectCell(seat.cell);
        const frame = Math.abs(room.id * 3 + index + Math.floor(random.next() * 4)) % 4;
        placements[frame]!.push({ seat });
      });
    }

    for (const [frame, cells] of placements.entries()) {
      if (cells.length === 0) continue;
      const textures = this.assets.biomeWallDecorPbr(this.activeMood.id, frame);
      const material = createWallSpriteMaterial(
        textures,
        this.activeMood,
        profile.doorRoughness + 0.04,
        frame < 2 ? 1 : 0.76,
      );
      material.polygonOffset = frame >= 2;
      material.polygonOffsetFactor = frame >= 2 ? -3 : 0;
      material.polygonOffsetUnits = frame >= 2 ? -3 : 0;
      const spriteSize = 1.72 * profile.wallDecorScale;
      const geometry = new THREE.PlaneGeometry(spriteSize, spriteSize);
      const batch = new THREE.InstancedMesh(geometry, material, cells.length);
      batch.name = `${this.activeMood.label} wall decor ${frame + 1}`;
      batch.castShadow = false;
      batch.receiveShadow = true;
      batch.frustumCulled = false;
      batch.userData.distanceLod = "disabled";
      cells.forEach(({ seat }, index) => {
        const p = gridToWorld(dungeon, seat.cell, this.tileSize);
        const offset = wallHugWorldOffset(
          seat.intoDx,
          seat.intoDy,
          this.tileSize,
          BIOME_WALL_DECAL_OFFSET,
        );
        this.tempPosition.set(p.x + offset.x, 1.75 + ((index + frame) % 3) * 0.12, p.z + offset.z);
        this.tempEuler.set(0, facingRotation(seat.intoDx, seat.intoDy), 0, "YXZ");
        this.tempQuaternion.setFromEuler(this.tempEuler);
        const spriteScale = 0.9 + random.next() * 0.2;
        this.tempScale.set(spriteScale, spriteScale, 1);
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        batch.setMatrixAt(index, this.tempMatrix);
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
      this.add(batch);
      this.stats.props += cells.length;
    }
  }

  private scatterBiomeSpriteProps(dungeon: DungeonData): void {
    if (this.decorDensity <= 0) return;

    const profile = getBiomeDecorationProfile(this.activeMood.id);
    const random = createSeededRandom(`${dungeon.seed}:biome-sprite-props`);
    const catalog = biomeSpriteDecorCatalog(this.activeMood.id);
    const atlas = this.assets.biomeSpriteDecorAtlas(this.activeMood.id);
    const wallDefinitions = catalog.props.filter((definition) => definition.surface === "wall");
    const floorDefinitions = catalog.props.filter((definition) => definition.surface === "floor");
    const ceilingDefinitions = catalog.props.filter(
      (definition) => definition.surface === "ceiling",
    );
    const occupancy = this.requireActiveFloorOccupancy("Biome sprite props");
    const occupiedBits =
      FloorOccupancyBit.Object |
      FloorOccupancyBit.Solid |
      FloorOccupancyBit.Objective |
      FloorOccupancyBit.WallDecoration |
      FloorOccupancyBit.Hazard |
      FloorOccupancyBit.Stair |
      FloorOccupancyBit.CeilingDecoration;
    const placementOverlay = new FloorOccupancyOverlay(dungeon.width, dungeon.height);
    const isOccupied = (cell: GridCell): boolean =>
      occupancy.hasAny(cell.x, cell.y, occupiedBits) || placementOverlay.isOccupied(cell.x, cell.y);
    const isWallOccupied = (cell: GridCell): boolean =>
      occupancy.hasAny(
        cell.x,
        cell.y,
        occupiedBits & ~FloorOccupancyBit.Object & ~FloorOccupancyBit.CeilingDecoration,
      ) || placementOverlay.isOccupied(cell.x, cell.y);
    const isCeilingOccupied = (cell: GridCell): boolean =>
      occupancy.hasAny(
        cell.x,
        cell.y,
        FloorOccupancyBit.Solid |
          FloorOccupancyBit.Objective |
          FloorOccupancyBit.Hazard |
          FloorOccupancyBit.Stair |
          FloorOccupancyBit.CeilingDecoration,
      );
    const rooms = dungeon.rooms.filter((room) => room.role === "room" || room.role === "entrance");
    const corridorCells = collectDecorCorridorCells(dungeon);
    const corridorRoomId = (cell: GridCell): number =>
      -1 -
      (Math.floor(cell.x / 6) + Math.floor(cell.y / 6) * Math.max(1, Math.ceil(dungeon.width / 6)));
    const entranceRoomId = rooms.find((room) => room.role === "entrance")?.id;
    const selectWithEntrance = <T extends { roomId: number; corridor: boolean }>(
      candidates: readonly T[],
      count: number,
      salt: number,
    ): T[] => {
      if (count <= 0 || candidates.length === 0) return [];
      const corridorTarget = Math.min(
        candidates.filter((candidate) => candidate.corridor).length,
        Math.max(2, Math.round(count * 0.24)),
      );
      const corridor = selectFairBiomeDecorPlacements(
        candidates.filter((candidate) => candidate.corridor),
        corridorTarget,
        salt + 7,
      );
      const corridorSet = new Set(corridor);
      const entranceCandidates =
        entranceRoomId === undefined
          ? []
          : candidates.filter(
              (candidate) => candidate.roomId === entranceRoomId && !corridorSet.has(candidate),
            );
      const entrance = selectFairBiomeDecorPlacements(entranceCandidates, 1, salt)[0];
      const remaining = candidates.filter(
        (candidate) => candidate !== entrance && !corridorSet.has(candidate),
      );
      const selected = selectFairBiomeDecorPlacements(
        remaining,
        count - corridor.length - (entrance ? 1 : 0),
        salt + 17,
      );
      return [...corridor, ...(entrance ? [entrance] : []), ...selected];
    };
    // Wall decals batch cheaply, while hanging cards remain individual animated
    // meshes. Bias density toward architecture without returning floor clutter.
    const copiesPerDefinition = Object.freeze({ wall: 5, floor: 3, ceiling: 4 });
    const wallBudget = wallDefinitions.length * copiesPerDefinition.wall;
    const floorBudget = floorDefinitions.length * copiesPerDefinition.floor;
    const ceilingBudget = ceilingDefinitions.length * copiesPerDefinition.ceiling;
    const maxProps = wallBudget + floorBudget + ceilingBudget;
    const wallCandidatesPerRoom = Math.ceil(wallBudget / Math.max(rooms.length, 1)) + 1;
    const floorCandidatesPerRoom = Math.ceil(floorBudget / Math.max(rooms.length, 1)) + 2;
    const ceilingCandidatesPerRoom = Math.ceil(ceilingBudget / Math.max(rooms.length, 1)) + 3;

    const wallCandidates: Array<{
      seat: ReturnType<typeof collectRoomWallSeats>[number];
      roomId: number;
      corridor: boolean;
    }> = [];
    for (const room of rooms) {
      const isEntrance = room.role === "entrance";
      const wallSeats = this.getRoomWallSeats(dungeon, room).filter(
        (seat) => !isWallOccupied(seat.cell) && !isProtectedTraversalCell(dungeon, seat.cell),
      );
      const wallCount = Math.min(wallSeats.length, wallCandidatesPerRoom);
      wallCandidates.push(
        ...pickSeparatedWallSeats(
          wallSeats,
          isEntrance ? Math.max(1, wallCount) : wallCount,
          dungeon.seedHash + room.id * 67,
        ).map((seat) => ({ seat, roomId: room.id, corridor: false })),
      );
    }
    for (const cell of corridorCells) {
      for (const [wallDx, wallDy] of CARDINAL_NEIGHBORS) {
        if (dungeon.grid[cell.y + wallDy]?.[cell.x + wallDx] !== WALL) continue;
        const seat = { cell, intoDx: -wallDx, intoDy: -wallDy };
        if (!isWallOccupied(cell)) {
          wallCandidates.push({ seat, roomId: corridorRoomId(cell), corridor: true });
        }
      }
    }
    const selectedWalls = selectWithEntrance(wallCandidates, wallBudget, dungeon.seedHash + 101);
    selectedWalls.forEach(({ seat }) =>
      placementOverlay.mark(seat.cell.x, seat.cell.y, FloorOccupancyBit.WallDecoration),
    );

    const cornerCandidates: Array<{
      seat: DungeonCornerSeat;
      roomId: number;
      corridor: boolean;
    }> = [];
    const floorCandidates: Array<{
      cell: GridCell;
      roomId: number;
      corridor: boolean;
      wallSeat?: DungeonWallSeat;
    }> = [];
    for (const room of rooms) {
      const isEntrance = room.role === "entrance";
      const floorCount = floorCandidatesPerRoom;
      const cornerSeats = collectRoomCornerSeats(dungeon, room).filter(
        (seat) => !isOccupied(seat.cell) && !isProtectedTraversalCell(dungeon, seat.cell),
      );
      const cornerCount =
        floorDefinitions.length > 0 &&
        cornerSeats.length > 0 &&
        (isEntrance || floorCount > 1 || room.id % 3 === 0)
          ? 1
          : 0;
      const reservedCornerCandidates = new Set<string>();
      for (const seat of pickSeparatedWallSeats(
        cornerSeats,
        cornerCount,
        dungeon.seedHash + room.id * 73,
      )) {
        if (isOccupied(seat.cell)) continue;
        reservedCornerCandidates.add(`${seat.cell.x},${seat.cell.y}`);
        cornerCandidates.push({ seat, roomId: room.id, corridor: false });
      }
      const edgeSeats = this.getRoomWallSeats(dungeon, room).filter(
        (seat) =>
          !isOccupied(seat.cell) &&
          !reservedCornerCandidates.has(`${seat.cell.x},${seat.cell.y}`) &&
          !isProtectedTraversalCell(dungeon, seat.cell),
      );
      const uniqueEdgeSeats = new Map<number, DungeonWallSeat>();
      for (const seat of edgeSeats) {
        uniqueEdgeSeats.set(seat.cell.y * dungeon.width + seat.cell.x, seat);
      }
      const selectedEdgeSeats = pickSeparatedWallSeats(
        [...uniqueEdgeSeats.values()],
        floorCount - cornerCount,
        dungeon.seedHash + room.id * 71,
      );
      for (const wallSeat of selectedEdgeSeats) {
        if (isOccupied(wallSeat.cell)) continue;
        floorCandidates.push({
          cell: wallSeat.cell,
          roomId: room.id,
          corridor: false,
          wallSeat,
        });
      }
    }
    // Corridors intentionally carry only wall and ceiling decoration. Floor
    // silhouettes narrow the route and are too easy to read as gameplay items.
    const desiredCornerBudget =
      cornerCandidates.length > 0 ? Math.max(1, Math.round(floorBudget * 0.24)) : 0;
    const selectedCorners = selectWithEntrance(
      cornerCandidates,
      Math.min(desiredCornerBudget, floorBudget),
      dungeon.seedHash + 211,
    );
    selectedCorners.forEach(({ seat }) =>
      placementOverlay.mark(seat.cell.x, seat.cell.y, FloorOccupancyBit.WallDecoration),
    );
    const selectedFloors = selectWithEntrance(
      floorCandidates.filter(({ cell }) => !isOccupied(cell)),
      floorBudget - selectedCorners.length,
      dungeon.seedHash + 223,
    );
    selectedFloors.forEach(({ cell }) =>
      placementOverlay.mark(cell.x, cell.y, FloorOccupancyBit.Object),
    );

    const ceilingCandidates: Array<{ cell: GridCell; roomId: number; corridor: boolean }> = [];
    for (const room of rooms) {
      const ceilingSeats = collectRoomInteriorSeats(dungeon, room, 1).filter(
        (cell) => !isCeilingOccupied(cell) && !isProtectedTraversalCell(dungeon, cell),
      );
      const ceilingCount = Math.min(ceilingSeats.length, ceilingCandidatesPerRoom);
      ceilingCandidates.push(
        ...pickSpreadSeats(
          ceilingSeats,
          room.role === "entrance" ? Math.max(1, ceilingCount) : ceilingCount,
          dungeon.seedHash + room.id * 79,
        ).map((cell) => ({ cell, roomId: room.id, corridor: false })),
      );
    }
    for (const cell of corridorCells) {
      if (!isCeilingOccupied(cell)) {
        ceilingCandidates.push({ cell, roomId: corridorRoomId(cell), corridor: true });
      }
    }
    const selectedCeilings = selectWithEntrance(
      ceilingCandidates,
      ceilingBudget,
      dungeon.seedHash + 307,
    );
    selectedCeilings.forEach(({ cell }) =>
      placementOverlay.mark(cell.x, cell.y, FloorOccupancyBit.CeilingDecoration),
    );

    const wallPlacements = selectedWalls.map((candidate, index) => ({
      ...candidate,
      definition: balancedBiomeDecorItem(wallDefinitions, index, dungeon.seedHash + 401),
    }));
    const cornerPlacements = selectedCorners.map((candidate, index) => ({
      ...candidate,
      definition: balancedBiomeDecorItem(floorDefinitions, index, dungeon.seedHash + 409),
    }));
    const floorPlacements = selectedFloors.map((candidate, index) => ({
      ...candidate,
      definition: balancedBiomeDecorItem(
        floorDefinitions,
        index + cornerPlacements.length,
        dungeon.seedHash + 409,
      ),
    }));
    const ceilingPlacements = selectedCeilings.map((candidate, index) => ({
      ...candidate,
      definition: balancedBiomeDecorItem(ceilingDefinitions, index, dungeon.seedHash + 431),
    }));

    wallPlacements.forEach(({ seat }) => this.reserveWallObjectCell(seat.cell));
    cornerPlacements.forEach(({ seat }) => this.reserveWallObjectCell(seat.cell));
    floorPlacements.forEach(({ cell }) => this.reserveObjectCell(cell));
    ceilingPlacements.forEach(({ cell }) => this.reserveCeilingObjectCell(cell));

    this.requireCurrentResidentFloor(
      "Biome decor diagnostics",
    ).root.userData.biomeSpriteDecorDistribution = {
      biome: this.activeMood.id,
      copiesPerDefinition,
      requestedTotal: maxProps,
      budget: { wall: wallBudget, floor: floorBudget, ceiling: ceilingBudget },
      placements: [
        ...wallPlacements.map(({ seat, roomId, corridor, definition }) => ({
          roomId,
          corridor,
          cell: { ...seat.cell },
          surface: "wall",
          slot: definition.slot,
          id: definition.id,
        })),
        ...cornerPlacements.map(({ seat, roomId, corridor, definition }) => ({
          roomId,
          corridor,
          cell: { ...seat.cell },
          surface: "floor",
          placement: "corner-standing",
          slot: definition.slot,
          id: definition.id,
        })),
        ...floorPlacements.map(({ cell, roomId, corridor, wallSeat, definition }) => ({
          roomId,
          corridor,
          nearWall: wallSeat !== undefined,
          cell: { ...cell },
          surface: "floor",
          placement: definition.placement,
          slot: definition.slot,
          id: definition.id,
        })),
        ...ceilingPlacements.map(({ cell, roomId, corridor, definition }) => ({
          roomId,
          corridor,
          cell: { ...cell },
          surface: "ceiling",
          slot: definition.slot,
          id: definition.id,
        })),
      ],
    };

    let added = 0;
    const wallBatches = new Map<
      string,
      { definition: BiomeSpriteDecorDefinition; matrices: THREE.Matrix4[] }
    >();
    for (const { seat, definition } of wallPlacements) {
      const p = gridToWorld(dungeon, seat.cell, this.tileSize);
      const scale = profile.wallDecorScale * (0.96 + random.next() * 0.08);
      const offset = wallHugWorldOffset(
        seat.intoDx,
        seat.intoDy,
        this.tileSize,
        Math.max(BIOME_WALL_DECAL_OFFSET, definition.mount.planeOffset),
      );
      const range = definition.mount.heightRange ?? [1.2, 2.4];
      const centerY = THREE.MathUtils.clamp(
        range[0] + random.next() * (range[1] - range[0]),
        definition.worldSize.height * scale * 0.5,
        this.wallHeight - definition.worldSize.height * scale * 0.5,
      );
      this.tempPosition.set(p.x + offset.x, centerY, p.z + offset.z);
      this.tempEuler.set(0, facingRotation(seat.intoDx, seat.intoDy), 0, "YXZ");
      this.tempQuaternion.setFromEuler(this.tempEuler);
      this.tempScale.set(scale, scale, scale);
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      // Five quads per definition are cheaper as one instanced draw than as
      // sparse spatial chunks. Their combined geometry is negligible, and the
      // batch still receives one conservative world-space bounding volume.
      const key = `${definition.slot}`;
      const batch = wallBatches.get(key) ?? { definition, matrices: [] };
      batch.matrices.push(this.tempMatrix.clone());
      wallBatches.set(key, batch);
    }
    for (const { definition, matrices } of wallBatches.values()) {
      const geometry = new THREE.PlaneGeometry(
        definition.worldSize.width,
        definition.worldSize.height,
      );
      geometry.translate(
        (0.5 - definition.anchor.x) * definition.worldSize.width,
        (definition.anchor.y - 0.5) * definition.worldSize.height,
        0,
      );
      applyBiomeDecorAtlasUv(geometry, definition.slot);
      const batch = new THREE.InstancedMesh(
        geometry,
        this.getBiomeWallDecalMaterial(atlas, catalog.runtime.occlusion.alphaTest),
        matrices.length,
      );
      batch.name = `${this.activeMood.label} ${definition.label} wall-mounted batch`;
      batch.renderOrder = 5;
      batch.castShadow = false;
      batch.receiveShadow = true;
      batch.frustumCulled = catalog.runtime.culling.frustum;
      const metadata = {
        biome: this.activeMood.id,
        id: definition.id,
        slot: definition.slot,
        surface: "wall",
        placement: definition.placement,
        orientation: definition.orientation,
        view: definition.view,
        anchor: definition.anchor,
        culling: catalog.runtime.culling,
        occlusion: catalog.runtime.occlusion,
        batched: true,
      };
      batch.userData.biomeSpriteDecor = metadata;
      batch.userData.biomeSpriteProp = metadata;
      matrices.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
      batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
      this.add(batch);
      added += matrices.length;
    }

    const addFloorSprite = (
      cell: GridCell,
      definition: BiomeSpriteDecorDefinition,
      corner?: DungeonCornerSeat,
      wallSeat?: DungeonWallSeat,
    ): void => {
      const p = gridToWorld(dungeon, cell, this.tileSize);
      const isCorner = corner !== undefined;
      const runtimePlacement: BiomeSpriteDecorPlacement = isCorner
        ? "corner-standing"
        : definition.placement;
      const scale = profile.wallDecorScale * (0.96 + random.next() * 0.08);
      const width = definition.worldSize.width * scale;
      const height = definition.worldSize.height * scale;
      const geometry = new THREE.PlaneGeometry(width, height);
      geometry.translate(
        (0.5 - definition.anchor.x) * width,
        (definition.anchor.y - 0.5) * height,
        0,
      );
      applyBiomeDecorAtlasUv(geometry, definition.slot);
      const material = this.getBiomeFloorSpriteMaterial(
        atlas,
        runtimePlacement,
        catalog.runtime.occlusion.alphaTest,
      );
      const sprite = new THREE.Mesh(geometry, material);
      const edgeSeat = corner ?? wallSeat;
      const baseYaw = edgeSeat ? facingRotation(edgeSeat.intoDx, edgeSeat.intoDy) : 0;
      const maxWallTurn =
        runtimePlacement === "corner-standing"
          ? (definition.maxYawTurn ?? BIOME_CORNER_PROP_MAX_TURN)
          : undefined;
      if (isCorner) {
        const offset = cornerHugWorldOffset(corner, this.tileSize, BIOME_CORNER_PROP_INSET);
        sprite.position.set(p.x + offset.x, definition.mount.planeOffset, p.z + offset.z);
      } else if (wallSeat) {
        const offset = wallHugWorldOffset(
          wallSeat.intoDx,
          wallSeat.intoDy,
          this.tileSize,
          BIOME_FLOOR_PROP_WALL_INSET,
        );
        sprite.position.set(p.x + offset.x, definition.mount.planeOffset, p.z + offset.z);
      } else {
        sprite.position.set(p.x, definition.mount.planeOffset, p.z);
      }
      sprite.rotation.order = "YXZ";
      sprite.rotation.y = baseYaw;
      sprite.name = `${this.activeMood.label} ${definition.label} ${edgeSeat ? "edge card" : "floor card"}`;
      sprite.castShadow = false;
      sprite.receiveShadow = true;
      sprite.renderOrder = isCorner ? 2 : 3;
      sprite.frustumCulled = catalog.runtime.culling.frustum;
      const metadata = {
        biome: this.activeMood.id,
        id: definition.id,
        slot: definition.slot,
        surface: "floor",
        placement: runtimePlacement,
        orientation: definition.orientation,
        view: definition.view,
        anchor: definition.anchor,
        culling: catalog.runtime.culling,
        occlusion: catalog.runtime.occlusion,
        ...(maxWallTurn !== undefined ? { maxWallTurn } : {}),
      };
      sprite.userData.biomeSpriteDecor = metadata;
      sprite.userData.biomeSpriteProp = metadata;
      this.registerFloorBiomeSprite({
        mesh: sprite,
        material,
        baseOpacity: material.opacity,
        x: sprite.position.x,
        z: sprite.position.z,
        baseYaw,
        placement: runtimePlacement,
        maxWallTurn,
        maxDistance: catalog.runtime.culling.maxDistance.floor,
        hysteresis: catalog.runtime.culling.hysteresis,
        sharedMaterial: true,
      });
      this.add(sprite);
      added += 1;
    };

    for (const placement of cornerPlacements) {
      addFloorSprite(placement.seat.cell, placement.definition, placement.seat);
    }
    for (const placement of floorPlacements) {
      addFloorSprite(placement.cell, placement.definition, undefined, placement.wallSeat);
    }

    for (const { cell, definition } of ceilingPlacements) {
      const p = gridToWorld(dungeon, cell, this.tileSize);
      const scale = profile.wallDecorScale * (0.96 + random.next() * 0.08);
      const width = definition.worldSize.width * scale;
      const height = definition.worldSize.height * scale;
      const geometry = new THREE.PlaneGeometry(width, height);
      geometry.translate(
        (0.5 - definition.anchor.x) * width,
        (definition.anchor.y - 0.5) * height,
        0,
      );
      applyBiomeDecorAtlasUv(geometry, definition.slot);
      const material = this.getBiomeFloorSpriteMaterial(
        atlas,
        definition.placement,
        catalog.runtime.occlusion.alphaTest,
      );
      const motion = biomeDecorMotion(this.activeMood, definition.slot, cell);
      const sprite = new THREE.Mesh(geometry, material);
      sprite.position.set(p.x, this.wallHeight - definition.mount.planeOffset, p.z);
      sprite.rotation.order = "YXZ";
      sprite.name = `${this.activeMood.label} ${definition.label} ceiling hanging`;
      sprite.castShadow = false;
      sprite.receiveShadow = true;
      sprite.renderOrder = 4;
      sprite.frustumCulled = catalog.runtime.culling.frustum;
      const metadata = {
        biome: this.activeMood.id,
        id: definition.id,
        slot: definition.slot,
        surface: "ceiling",
        placement: definition.placement,
        orientation: definition.orientation,
        view: definition.view,
        anchor: definition.anchor,
        culling: catalog.runtime.culling,
        occlusion: catalog.runtime.occlusion,
        animated: true,
        animation: "biome-sway",
      };
      sprite.userData.biomeSpriteDecor = metadata;
      sprite.userData.biomeSpriteProp = metadata;
      this.registerCeilingBiomeSprite({
        mesh: sprite,
        material,
        baseOpacity: material.opacity,
        x: sprite.position.x,
        z: sprite.position.z,
        baseYaw: 0,
        maxDistance: catalog.runtime.culling.maxDistance.ceiling,
        hysteresis: catalog.runtime.culling.hysteresis,
        sharedMaterial: true,
        animationPhase: motion.phase,
        animationSpeed: motion.speed,
        swayAmplitude: motion.amplitude,
      });
      this.add(sprite);
      added += 1;
    }
    this.stats.props += added;
  }

  private getBiomeWallDecalMaterial(
    texture: THREE.Texture,
    alphaTest: number,
  ): THREE.MeshStandardMaterial {
    const key = `${this.activeMood.id}:v2-wall:${alphaTest}`;
    const cached = this.biomeWallDecalMaterials.get(key);
    if (cached) return cached;
    const material = createBiomeWallDecalMaterial(texture, this.activeMood, alphaTest);
    material.name = `${this.activeMood.label} v2 biome wall props`;
    this.biomeWallDecalMaterials.set(key, material);
    return material;
  }

  private getBiomeFloorSpriteMaterial(
    texture: THREE.Texture,
    placement: BiomeSpritePlacement | BiomeSpriteDecorPlacement,
    alphaTest: number,
  ): THREE.MeshStandardMaterial {
    const key = `${this.activeMood.id}:v2:${placement}:${alphaTest}`;
    const cached = this.biomeFloorSpriteMaterials.get(key);
    if (cached) return cached;
    const material = createBiomeFloorSpriteMaterial(texture, this.activeMood, placement, alphaTest);
    material.name = `${this.activeMood.label} v2 ${placement} biome props`;
    this.biomeFloorSpriteMaterials.set(key, material);
    return material;
  }

  /**
   * Bone piles, rubble drifts, and hanging chains/vines, placed per room by
   * theme. Each kind is built once as a template and fanned out via InstancedMesh
   * (one batch per template part), matching the addInstancedForgeProps pattern.
   */
  private scatterRoomAtmosphereProps(
    dungeon: DungeonData,
    random: ReturnType<typeof createSeededRandom>,
  ): void {
    type Placement = {
      template: THREE.Group;
      cells: Array<{ cell: GridCell; rot: number; y: number; scaleY?: number }>;
    };
    const bonePlacements: Placement[] = [];
    const rubblePlacements: Placement[] = [];
    const hangingPlacements: Placement[] = [];
    let boneTemplate: THREE.Group | null = null;
    let rubbleTemplate: THREE.Group | null = null;
    const hangingTemplates = new Map<string, THREE.Group>();
    const profile = getBiomeDecorationProfile(this.activeMood.id);

    for (const room of dungeon.rooms) {
      if (room.role !== "room") continue;
      const theme = this.atmosphereRoomTheme(dungeon, room);
      const wallSeats = this.getRoomWallSeats(dungeon, room);
      const interior = this.getRoomInteriorSeats(dungeon, room);
      if (wallSeats.length === 0 && interior.length === 0) continue;

      // Skull/bone weight follows both room purpose and biome identity.
      const ritualRoom = theme === "crypt" || theme === "shrine" || theme === "treasure";
      if (ritualRoom || random.next() < 0.28 * profile.boneDensity * this.decorDensity) {
        const count = Math.max(
          1,
          Math.min(
            4,
            Math.round(
              ((room.width * room.height) / 22) *
                this.decorDensity *
                profile.boneDensity *
                (ritualRoom ? 1.25 : 0.62),
            ),
          ),
        );
        const cells = this.pickAtmosphereCells(dungeon, wallSeats, interior, count, random);
        if (cells.length > 0) {
          bonePlacements.push({
            template: (boneTemplate ??= this.getAtmosphereTemplate(
              `bone:${this.activeMood.id}:${profile.boneVariant}`,
              () => createBonePile(this.materials, profile.boneVariant),
            )),
            cells: cells.map((cell) => ({
              cell: cell.cell,
              rot: random.next() * Math.PI * 2,
              y: 0,
            })),
          });
        }
      }
      // Rubble drifts everywhere, denser in lake/grave.
      const rubbleBase =
        (theme === "lake" || theme === "grave" ? 0.58 : 0.34) * profile.rubbleDensity;
      const rubbleCount = Math.max(
        1,
        Math.min(5, Math.round(room.width * room.height * rubbleBase * this.decorDensity * 0.1)),
      );
      if (rubbleCount > 0) {
        const cells = this.pickAtmosphereCells(dungeon, wallSeats, interior, rubbleCount, random);
        if (cells.length > 0) {
          rubblePlacements.push({
            template: (rubbleTemplate ??= this.getAtmosphereTemplate(
              `rubble:${this.activeMood.id}:${profile.rubbleVariant}`,
              () => createRubblePile(this.materials, profile.rubbleVariant),
            )),
            cells: cells.map((cell) => ({
              cell: cell.cell,
              rot: random.next() * Math.PI * 2,
              y: 0,
            })),
          });
        }
      }
      // Hanging chains/vines from the ceiling. Most rooms get some; larger
      // rooms denser. Several length/style templates keep silhouettes varied.
      const hangingArea = room.width * room.height;
      if (hangingArea >= 9 || room.width >= 4 || room.height >= 4) {
        const count = Math.max(
          1,
          Math.min(
            10,
            Math.round(
              (hangingArea / 14) * this.decorDensity * 2.6 * profile.hangingDensity +
                (room.width >= 6 || room.height >= 6 ? 1.2 : 0.35),
            ),
          ),
        );
        const cells = this.pickAtmosphereCells(
          dungeon,
          wallSeats,
          interior,
          count,
          random,
          "ceiling",
        );
        if (cells.length > 0) {
          const hangPool = [...new Set([profile.hangingKind, ...profile.hangingKinds])].slice(0, 2);
          // Length varies per instance. Kind and style keep the useful shape
          // range without multiplying the draw calls by five length templates.
          const byTemplate = new Map<
            THREE.Group,
            Array<{ cell: GridCell; rot: number; y: number; scaleY?: number }>
          >();
          const lengthScales = [0.52, 0.72, 0.92, 1.12, 1.32];
          for (const seat of cells) {
            // Bias toward the primary kind, but mix the full biome hang pool.
            const kind =
              random.next() < 0.68
                ? profile.hangingKind
                : hangPool[random.integer(0, hangPool.length - 1)]!;
            let kindHash = 0;
            for (let index = 0; index < kind.length; index += 1) {
              kindHash = (kindHash * 31 + kind.charCodeAt(index)) >>> 0;
            }
            const style = kindHash % 2;
            const lengthScale = lengthScales[random.integer(0, lengthScales.length - 1)]!;
            const key = `${kind}:${style}`;
            let template = hangingTemplates.get(key);
            if (!template) {
              template = this.getAtmosphereTemplate(
                `hanging:${this.activeMood.id}:${kind}:${profile.hangingLength}:${style}`,
                () => createHanging(this.materials, kind, profile.hangingLength, style),
              );
              hangingTemplates.set(key, template);
            }
            const list = byTemplate.get(template) ?? [];
            list.push({
              cell: seat.cell,
              rot: random.next() * Math.PI * 2,
              y: this.wallHeight,
              scaleY: lengthScale,
            });
            byTemplate.set(template, list);
          }
          for (const [template, seats] of byTemplate) {
            hangingPlacements.push({ template, cells: seats });
          }
        }
      }
    }

    const corridorHangSeats = collectDecorCorridorCells(dungeon).filter(
      (cell) =>
        !this.requireActiveFloorOccupancy("Corridor hanging props").hasAny(
          cell.x,
          cell.y,
          FloorOccupancyBit.Solid |
            FloorOccupancyBit.Objective |
            FloorOccupancyBit.Hazard |
            FloorOccupancyBit.Stair |
            FloorOccupancyBit.CeilingDecoration,
        ),
    );
    const corridorHangCount = Math.min(
      12,
      Math.max(0, Math.round((corridorHangSeats.length / 8) * this.decorDensity)),
    );
    const selectedCorridorHangs = pickSpreadSeats(
      corridorHangSeats,
      corridorHangCount,
      dungeon.seedHash + 887,
    );
    if (selectedCorridorHangs.length > 0) {
      const kind = profile.hangingKind;
      const style = Math.abs(dungeon.seedHash) % 4;
      const template = this.getAtmosphereTemplate(
        `hanging:${this.activeMood.id}:${kind}:${profile.hangingLength}:${style}`,
        () => createHanging(this.materials, kind, profile.hangingLength, style),
      );
      for (const cell of selectedCorridorHangs) this.reserveCeilingObjectCell(cell);
      hangingPlacements.push({
        template,
        cells: selectedCorridorHangs.map((cell, index) => ({
          cell,
          rot: (index * 2.399963 + random.next() * 0.35) % (Math.PI * 2),
          y: this.wallHeight,
          scaleY: 0.62 + (index % 4) * 0.18,
        })),
      });
    }

    this.commitAtmosphereBatch(dungeon, bonePlacements);
    this.commitAtmosphereBatch(dungeon, rubblePlacements);
    this.commitAtmosphereBatch(dungeon, hangingPlacements);
  }

  /** Resolve the forge/classic room theme string used for atmosphere decisions. */
  private atmosphereRoomTheme(dungeon: DungeonData, room: DungeonRoom): string {
    if (dungeon.forge) {
      const index = room.y * dungeon.width + room.x;
      const roomId = dungeon.forge.roomIds[index];
      const metadata = dungeon.forge.rooms.find((candidate) => candidate.id === roomId);
      if (metadata?.lake) return "lake";
      if (metadata?.grave) return "grave";
      const type = metadata?.type?.toLowerCase();
      if (type === "library") return "library";
      return type ?? "combat";
    }
    return String(roomTheme(dungeon, room));
  }

  /** Pick N distinct cells from wall/interior seats, avoiding protected cells. */
  private pickAtmosphereCells(
    dungeon: DungeonData,
    wallSeats: ReadonlyArray<{ cell: GridCell; intoDx: number; intoDy: number }>,
    interior: ReadonlyArray<GridCell>,
    count: number,
    random: ReturnType<typeof createSeededRandom>,
    surface: "floor" | "ceiling" = "floor",
  ): Array<{ cell: GridCell }> {
    const occupancy = this.requireActiveFloorOccupancy("Atmosphere prop seats");
    const pool = [...wallSeats.map((s) => s.cell), ...interior].filter(
      (cell) =>
        !isProtectedTraversalCell(dungeon, cell) &&
        !this.isObjectiveClearanceCell(cell) &&
        (surface === "ceiling"
          ? !occupancy.hasAny(
              cell.x,
              cell.y,
              FloorOccupancyBit.Solid |
                FloorOccupancyBit.Objective |
                FloorOccupancyBit.Hazard |
                FloorOccupancyBit.Stair |
                FloorOccupancyBit.CeilingDecoration,
            )
          : !this.isObjectOccupiedCell(cell)),
    );
    const picked: GridCell[] = [];
    // `pool` is already a fresh array from filter; shuffle it in place to
    // avoid a second full copy for every room/family on the cold stack build.
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = random.integer(0, i);
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    for (const cell of pool) {
      if (picked.length >= count) break;
      if (picked.some((p) => Math.max(Math.abs(p.x - cell.x), Math.abs(p.y - cell.y)) < 2))
        continue;
      picked.push(cell);
      if (surface === "ceiling") this.reserveCeilingObjectCell(cell);
      else this.reserveObjectCell(cell);
    }
    return picked.map((cell) => ({ cell }));
  }

  /**
   * Fan a list of {template, cells} placements out into InstancedMesh batches —
   * one batch per template mesh-part across all instances. Mirrors
   * addInstancedForgeProps but takes pre-built templates and per-cell rotations.
   */
  private commitAtmosphereBatch(
    dungeon: DungeonData,
    placements: Array<{
      template: THREE.Group;
      cells: Array<{ cell: GridCell; rot: number; y: number; scaleY?: number }>;
    }>,
  ): void {
    if (placements.length === 0) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    const grouped = new Map<
      THREE.Group,
      Array<{ cell: GridCell; rot: number; y: number; scaleY?: number }>
    >();
    for (const placement of placements) {
      const cells = grouped.get(placement.template) ?? [];
      cells.push(...placement.cells);
      grouped.set(placement.template, cells);
    }

    // One canonical template per semantic family. The old per-room loop made
    // many tiny batches, turning ambient dressing into a draw-call cliff.
    for (const [template, cells] of grouped) {
      if (cells.length === 0) continue;
      const templateName = template.name;
      const batchKey = `${this.activeMood.id}:${templateName}`;
      let templateBatches = this.runtimeAtmosphereBatches.get(batchKey);
      if (!templateBatches) {
        templateBatches = createStaticPropTemplateBatches(template, {
          resourceCatalog: this.resourceCatalog,
          catalogKey: `atmosphere/v2:${encodeURIComponent(templateName)}`,
          materialKey: (material) => this.staticMaterialKey(material),
          resourceType: "atmosphere-static-prop-batch-geometry/v2",
        });
        this.runtimeAtmosphereBatches.set(batchKey, templateBatches);
      }
      const instanceCount = cells.length;
      for (const [partIndex, part] of templateBatches.entries()) {
        const batch = new THREE.InstancedMesh(part.geometry, part.material, instanceCount);
        batch.name = `Atmosphere ${templateName} batch ${partIndex + 1}`;
        batch.castShadow = part.castShadow;
        batch.receiveShadow = part.receiveShadow;
        cells.forEach((cell, index) => {
          const p = gridToWorld(dungeon, cell.cell, this.tileSize);
          position.set(p.x, cell.y, p.z);
          euler.set(0, cell.rot, 0, "YXZ");
          quaternion.setFromEuler(euler);
          scale.set(1, cell.scaleY ?? 1, 1);
          matrix.compose(position, quaternion, scale);
          batch.setMatrixAt(index, matrix);
        });
        batch.instanceMatrix.needsUpdate = true;
        this.add(batch);
      }
      this.stats.props += instanceCount;
    }
  }

  private addMarkers(
    dungeon: DungeonData,
    mood: DungeonMood,
    floorPlan?: ResidentDungeonFloorPlan,
  ): void {
    const entrance = gridToWorld(dungeon, dungeon.spawn, this.tileSize);
    const portalCell = floorPlan?.portal.cell ?? dungeon.exit;
    const exit = gridToWorld(dungeon, portalCell, this.tileSize);
    this.exitPosition.set(exit.x, this.floorWorldY, exit.z);

    const entranceRing = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.66, 8), this.materials.iron);
    entranceRing.rotation.x = -Math.PI / 2;
    entranceRing.position.set(entrance.x, 0.02, entrance.z);
    const entranceLight = new THREE.PointLight(0x777b7c, 7, 9, 2.4);
    entranceLight.position.set(entrance.x, 1.7, entrance.z);

    const finalFloor = !dungeon.floor || dungeon.floor.index === dungeon.floor.count - 1;
    const portalRequired = floorPlan?.portal.required ?? finalFloor;
    if (!finalFloor || !portalRequired) {
      this.add(entranceRing, entranceLight);
      return;
    }

    // Complete biome portal: full arch aperture, distinct frame/signature/seal,
    // profile-driven vortex and isolated materials for every dungeon mood.
    const magicPortal = createBiomeMagicPortal(mood.id, this.materials);
    const portal = magicPortal.root;
    portal.position.set(exit.x, 0, exit.z);
    portal.rotation.y = magicPortalApproachYaw(dungeon);
    portal.userData.catalogKey = floorPlan?.portal.catalogKey ?? "portal/v2:runtime";
    this.portalRoot = portal;

    const exitBeam = createVolumetricBeam(magicPortal.profile.beamColor, 4.15, 1.05, 0.18);
    exitBeam.position.set(exit.x, this.wallHeight - 0.02, exit.z);
    exitBeam.visible = false;
    this.portalBeam = exitBeam;
    const exitLight = new THREE.PointLight(magicPortal.profile.lightColor, 3, 12, 2.2);
    exitLight.position.set(exit.x, 2.4, exit.z);
    this.portalLight = exitLight;
    this.add(entranceRing, portal, exitBeam, exitLight, entranceLight);
    this.stats.beams += 1;
  }

  private addStaircases(dungeon: DungeonData, floorPlan?: ResidentDungeonFloorPlan): void {
    const stairs =
      floorPlan?.stairs.map((stair) => ({ ...stair, cell: stair.anchor })) ??
      dungeon.floor?.stairs ??
      [];
    for (const stair of stairs) {
      // Multi-slab stacks place one physical flight on the lower mouth only.
      if (this.stackBuildActive && stair.targetFloor <= (dungeon.floor?.index ?? 0)) continue;
      const position = gridToWorld(dungeon, stair.cell, this.tileSize);
      const flight = buildStairFlight(stair.direction, this.materials, this.tileSize);
      this.borrowStairFlightGeometries(flight);
      const root = flight.root;
      // The resident root owns slab height; flights stay in lower-slab local space.
      root.position.set(position.x, 0, position.z);
      root.rotation.y = stair.yaw;
      root.userData.stairId = stair.id;
      root.userData.targetFloor = stair.targetFloor;
      root.userData.shaftId = stair.shaftId;
      root.userData.walkable = true;
      this.add(root);
      const colliders = worldTreadColliders(
        flight.treadColliders,
        position.x,
        this.floorWorldY,
        position.z,
        stair.yaw,
      );
      this.addSolidColliders(...colliders);
      const actor: StaticStairActor = {
        root,
        direction: stair.direction,
        targetFloor: stair.targetFloor,
        cell: { ...stair.cell },
      };
      this.requireCurrentResidentFloor("Stair registration").registerStaircase(actor);
      this.handles.staircases.push(actor);
      this.reserveObjectiveClearanceCell(stair.cell, FloorOccupancyBit.Stair);
      this.stats.props += DUNGEON_STAIR_STEP_COUNT;
    }
  }

  /**
   * Stair flights are authored from the same three immutable primitive shapes
   * on every floor. Borrow them once per world while keeping each flight's
   * materials and transforms independent.
   */
  private borrowStairFlightGeometries(flight: ReturnType<typeof buildStairFlight>): void {
    const keyFor = (mesh: THREE.Mesh): string => {
      if (mesh.name.includes("stair tread")) {
        return [
          "staircase/v2",
          "tread",
          flight.stepWidth.toFixed(4),
          flight.stepRise.toFixed(4),
          flight.stepRun.toFixed(4),
        ].join(":");
      }
      if (mesh.name.includes("stair side rail")) {
        return [
          "staircase/v2",
          "rail",
          flight.stepWidth.toFixed(4),
          flight.stepRise.toFixed(4),
          flight.stepRun.toFixed(4),
          flight.stepCount,
        ].join(":");
      }
      if (mesh.name.includes("stair direction sigil")) {
        return ["staircase/v2", "landing", this.tileSize.toFixed(4)].join(":");
      }
      return "";
    };
    flight.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const key = keyFor(object);
      if (!key) return;
      const generated = object.geometry;
      const borrowed = this.resourceCatalog.borrowGeometry(
        key,
        () => generated,
        "staircase-static-geometry/v2",
      );
      if (borrowed !== generated) generated.dispose();
      object.geometry = borrowed;
    });
  }

  private addStaticObjectives(
    dungeon: DungeonData,
    stonePlacements: readonly MagicStonePlacement[],
    floorPlan?: ResidentDungeonFloorPlan,
  ): void {
    const runtime = this.requireCurrentResidentFloor("Static objective registration");
    const rankedRooms = dungeon.rooms
      .filter((room) => room.role === "room")
      .sort((left, right) => roomDistance(dungeon, left) - roomDistance(dungeon, right));
    // Shared editor/runtime placement keeps objective diamonds tied to the real rooms.
    const stoneRooms = stonePlacements.map((placement) => placement.room);
    stonePlacements.forEach((placement) => {
      const { stoneId } = placement;
      const stone = createMagicStone(stoneId, this.materials, this.stoneTextures.get(stoneId));
      preparePickupOpacity(stone.root);
      stone.root.userData.floorIndex = runtime.floorIndex;
      stone.root.userData.catalogKey = `floor:${runtime.floorIndex}:stone:${stoneId}`;
      const p = gridToWorld(dungeon, placement.cell, this.tileSize);
      stone.root.position.set(p.x + placement.offsetX, 0, p.z + placement.offsetZ);
      const pickup: StaticPickupActor = {
        floorIndex: runtime.floorIndex,
        id: `floor:${runtime.floorIndex}:stone:${stoneId}`,
        kind: "stone",
        stoneId,
        object: stone.root,
        collected: false,
        collectTime: 0,
        collectOriginX: stone.root.position.x,
        collectOriginY: 0,
        collectOriginZ: stone.root.position.z,
        available: true,
        revealTime: 1,
        baseY: 0,
        baseScale: new THREE.Vector3(1, 1, 1),
        autoCollect: false,
        stoneSignal: {
          light: stone.light,
          glow: stone.glow,
          crown: stone.crown,
          crystalAssembly: stone.crystalAssembly,
          effectColor: stone.effectColor,
          baseLightIntensity: stone.baseLightIntensity,
          baseGlowOpacity: stone.baseGlowOpacity,
        },
      };
      runtime.registerPickup(pickup);
      this.pickups.push(pickup);
      const beam = createVolumetricBeam(stone.effectColor, 3.8, 0.5, 0.095, {
        signalStyle: "objective",
        topRadius: 0.1,
      });
      beam.position.set(stone.root.position.x, this.wallHeight - 0.03, stone.root.position.z);
      beam.name = `${stoneId} magic stone beacon`;
      this.registerStoneBeam(beam);
      // PointLight stays parented to the pickup so its world position follows the stone.
      this.add(stone.root, beam);
      this.stats.beams += 1;
    });

    const stoneRoomSet = new Set(stoneRooms);
    const occupancy = this.requireActiveFloorOccupancy("Static objectives");
    const selected = new FloorOccupancyOverlay(dungeon.width, dungeon.height);
    const excludedBits =
      FloorOccupancyBit.Object |
      FloorOccupancyBit.Solid |
      FloorOccupancyBit.WallDecoration |
      FloorOccupancyBit.Hazard |
      FloorOccupancyBit.Objective;
    const pickupExcluded: CellOccupancyQuery = {
      isOccupied: (x, y) => occupancy.hasAny(x, y, excludedBits) || selected.isOccupied(x, y),
    };
    // Power chests: two time-freeze + two wards + one annihilation pulse, spread along route
    // depth so pressure relief is not stacked in one wing of the map.
    const usedPowerRooms = new Set<DungeonRoom>();
    const placePowerChest = (
      rewardKind: Exclude<ChestRewardKind, "resolve">,
      depthFraction: number,
      salt: number,
      stableId?: string,
    ): void => {
      const candidatesRooms = rankedRooms.filter(
        (room) => !stoneRoomSet.has(room) && !usedPowerRooms.has(room),
      );
      const room =
        candidatesRooms[Math.floor(candidatesRooms.length * depthFraction)] ??
        candidatesRooms[0] ??
        rankedRooms[Math.floor(rankedRooms.length * depthFraction)] ??
        rankedRooms[0];
      if (!room) return;

      let cell: GridCell | null = null;
      const seats = this.getRoomInteriorSeats(dungeon, room).filter(
        (seat) =>
          !pickupExcluded.isOccupied(seat.x, seat.y) && !isProtectedTraversalCell(dungeon, seat),
      );
      cell =
        pickSpreadSeats(seats, 1, dungeon.seedHash + room.id * salt)[0] ??
        findNearestPropCell(dungeon, room.center, pickupExcluded, 8);
      if (!cell) {
        for (let y = 0; y < dungeon.height && !cell; y += 1) {
          for (let x = 0; x < dungeon.width; x += 1) {
            const candidate = { x, y };
            if (dungeon.grid[y]?.[x] !== FLOOR) continue;
            if (pickupExcluded.isOccupied(x, y) || isProtectedTraversalCell(dungeon, candidate)) {
              continue;
            }
            cell = candidate;
            break;
          }
        }
      }
      if (!cell) return;

      usedPowerRooms.add(room);
      selected.mark(cell.x, cell.y, FloorOccupancyBit.Objective);
      this.reserveObjectiveClearanceCell(cell);
      this.addInteractiveChest(
        dungeon,
        {
          kind: "chest",
          x: cell.x,
          y: cell.y,
          roomId: room.id,
          rot: ((dungeon.seedHash + cell.x * 3 + cell.y * salt) % 4) * (Math.PI / 2),
          scale: 0.92,
          v: room.id % 3,
        },
        rewardKind,
        stableId,
      );
    };

    const legacyRewardSlots: Array<{
      kind: Exclude<ChestRewardKind, "resolve" | "phoenix-egg">;
      depthFraction: number;
      salt: number;
    }> = [
      { kind: "time-freeze", depthFraction: 0.28, salt: 43 },
      { kind: "time-freeze", depthFraction: 0.72, salt: 43 },
      { kind: "map", depthFraction: 0.18, salt: 37 },
      { kind: "mobility", depthFraction: 0.54, salt: 53 },
      { kind: "clarity", depthFraction: 0.36, salt: 71 },
      { kind: "luminous-ward", depthFraction: 0.42, salt: 61 },
      { kind: "luminous-ward", depthFraction: 0.88, salt: 61 },
      {
        kind: planOffensePowerKind(dungeon.seed),
        depthFraction: OFFENSE_POWER_DEPTH_FRACTION,
        salt: OFFENSE_POWER_SALT,
      },
      ...planCurseChestPlacements(dungeon.seed, this.activeMood.id),
    ];
    const rewardSlots = (floorPlan?.rewards.slots ?? legacyRewardSlots).filter(
      (slot) =>
        !dungeon.forge || !("catalogKey" in slot) || !slot.catalogKey.includes(":extra-support:"),
    );
    for (const slot of rewardSlots) {
      placePowerChest(slot.kind, slot.depthFraction, slot.salt, "id" in slot ? slot.id : undefined);
    }

    // Rank-scaled free loot + health: harder biomes get more recoverability.
    // Forge imports keep authored layout only (no free floor spray).
    if (!dungeon.forge) {
      const fallbackLoot = planBiomeLootBudget(this.activeMood.id, dungeon.seed, {
        // World may already hold a phoenix charge from a prior floor; skip spawn then.
        phoenixArmed: this.pendingPhoenixArmed,
      });
      const loot = floorPlan
        ? {
            healthChests: floorPlan.rewards.healthDepths.length,
            freeFlasks: floorPlan.rewards.freeFlasks,
            corridorFlasks: floorPlan.rewards.corridorFlasks,
            freePowers: floorPlan.rewards.freePowers,
            placePhoenix: floorPlan.rewards.placePhoenix,
          }
        : fallbackLoot;

      const healthRooms = rankedRooms.filter((room) => !stoneRoomSet.has(room));
      const healthDepths =
        floorPlan?.rewards.healthDepths ?? spreadDepthFractions(loot.healthChests, 0.15, 0.75);
      healthDepths.forEach((depth, index) => {
        const room =
          healthRooms[Math.floor(healthRooms.length * depth)] ?? healthRooms[index] ?? null;
        if (!room) return;
        const candidates = this.getRoomInteriorSeats(dungeon, room).filter(
          (cell) =>
            !pickupExcluded.isOccupied(cell.x, cell.y) && !isProtectedTraversalCell(dungeon, cell),
        );
        const cell = pickSpreadSeats(candidates, 1, dungeon.seedHash + room.id * 29)[0];
        if (!cell) return;
        this.addInteractiveChest(
          dungeon,
          {
            kind: "chest",
            x: cell.x,
            y: cell.y,
            roomId: room.id,
            rot: ((room.id + dungeon.seedHash) % 4) * (Math.PI / 2),
            scale: 0.92,
            v: room.id % 3,
          },
          "resolve",
          floorPlan?.rewards.healthChestIds[index],
        );
        selected.mark(cell.x, cell.y, FloorOccupancyBit.Objective);
      });

      const placeFloor = (
        kind: ChestRewardKind,
        cell: GridCell | undefined,
        plannedPickup?: ResidentDungeonFreePickupPlan,
      ): void => {
        if (!cell) return;
        if (pickupExcluded.isOccupied(cell.x, cell.y)) return;
        selected.mark(cell.x, cell.y, FloorOccupancyBit.Objective);
        this.reserveObjectiveClearanceCell(cell);
        this.addFloorPickup(dungeon, cell, kind, plannedPickup?.id);
      };

      // Phoenix first among free floor loot: claims a free corner far from spawn
      // so later flasks/powers cannot stack on the same cell.
      if (loot.placePhoenix) {
        const seat = selectPhoenixEggSeat(
          dungeon,
          healthRooms,
          pickupExcluded,
          dungeon.seedHash + 907,
        );
        placeFloor(
          "phoenix-egg",
          seat ?? undefined,
          floorPlan?.rewards.freePickups.find((pickup) => pickup.source === "phoenix"),
        );
      }

      const corridorCells = collectCorridorPickupSeats(dungeon, pickupExcluded);
      const roomFreeCells: GridCell[] = [];
      for (const room of healthRooms) {
        for (const seat of this.getRoomInteriorSeats(dungeon, room)) {
          if (
            pickupExcluded.isOccupied(seat.x, seat.y) ||
            isProtectedTraversalCell(dungeon, seat)
          ) {
            continue;
          }
          roomFreeCells.push(seat);
        }
      }

      const corridorFlaskCells = pickSpreadSeats(
        corridorCells,
        loot.corridorFlasks,
        dungeon.seedHash + 401,
      );
      const corridorPickups = floorPlan?.rewards.freePickups.filter(
        (pickup) => pickup.source === "corridor-flask",
      );
      corridorFlaskCells.forEach((cell, index) =>
        placeFloor("resolve", cell, corridorPickups?.[index]),
      );

      const remainingFlasks = Math.max(0, loot.freeFlasks - corridorFlaskCells.length);
      const roomFlaskCells = pickSpreadSeats(
        roomFreeCells.filter((cell) => !pickupExcluded.isOccupied(cell.x, cell.y)),
        remainingFlasks,
        dungeon.seedHash + 409,
      );
      const roomPickups = floorPlan?.rewards.freePickups.filter(
        (pickup) => pickup.source === "room-flask",
      );
      roomFlaskCells.forEach((cell, index) => placeFloor("resolve", cell, roomPickups?.[index]));

      const freePowerDepths = spreadDepthFractions(loot.freePowers.length, 0.22, 0.6);
      const freePowerPickups = floorPlan?.rewards.freePickups.filter(
        (pickup) => pickup.source === "free-power",
      );
      loot.freePowers.forEach((kind: FloorFreePowerKind, index) => {
        const depth = freePowerDepths[index] ?? 0.4;
        // Prefer corridors for free powers so they read as route finds.
        const fromCorridor = pickSpreadSeats(
          corridorCells.filter((cell) => !pickupExcluded.isOccupied(cell.x, cell.y)),
          1,
          dungeon.seedHash + 420 + index * 13,
        )[0];
        if (fromCorridor) {
          placeFloor(kind, fromCorridor, freePowerPickups?.[index]);
          return;
        }
        const room = healthRooms[Math.floor(healthRooms.length * depth)] ?? healthRooms[0] ?? null;
        if (!room) return;
        const seat = pickSpreadSeats(
          this.getRoomInteriorSeats(dungeon, room).filter(
            (cell) =>
              !pickupExcluded.isOccupied(cell.x, cell.y) &&
              !isProtectedTraversalCell(dungeon, cell),
          ),
          1,
          dungeon.seedHash + room.id * 51 + index,
        )[0];
        placeFloor(kind, seat, freePowerPickups?.[index]);
      });
    }
  }

  private pendingPhoenixArmed = false;

  /** When true, the next build skips spawning a phoenix egg (player already armed). */
  setPhoenixArmedForNextBuild(armed: boolean): void {
    this.pendingPhoenixArmed = armed === true;
  }

  private sanitizeRuntimeRewardTemplate(template: THREE.Object3D): void {
    template.traverse((object) => {
      const runtimeUserData: Record<string, unknown> = {};
      for (const key of ["pickupKind", "vfxOnly", "componentId", "closedProfile"] as const) {
        const value = object.userData[key];
        if (typeof value === "string" || typeof value === "boolean") runtimeUserData[key] = value;
      }
      object.userData = runtimeUserData;
    });
  }

  private cloneRuntimeRewardTemplate(template: THREE.Object3D): THREE.Object3D {
    const clone = template.clone(true);
    // Geometry and materials stay shared with the resident template until a
    // mutable opacity/glow path calls the explicit pickup COW seam.
    markPickupMaterialsShared(clone);
    return clone;
  }

  private createRewardObject(rewardKind: ChestRewardKind): THREE.Object3D {
    let template = this.runtimeRewardTemplates.get(rewardKind);
    if (!template) {
      if (rewardKind === "time-freeze") template = createTimeFreezeRelic(this.materials);
      else if (rewardKind === "luminous-ward") {
        template = createLuminousWardStone(this.materials, this.textureSink);
      } else if (rewardKind === "annihilation-pulse") {
        template = createAnnihilationPulseRelic(this.materials);
      } else if (rewardKind === "cull-brand") template = createCullBrandRelic(this.materials);
      else if (rewardKind === "phoenix-egg") template = createPhoenixEggRelic(this.materials);
      else if (rewardKind === "map") template = createDungeonMapPickup(this.materials);
      else if (rewardKind === "mobility") template = createMobilityDraught(this.materials);
      else if (rewardKind === "clarity") template = createClarityPhial(this.materials);
      else if (isCurseRewardKind(rewardKind)) {
        template = createCurseVessel(this.materials, rewardKind);
      } else template = createResolveFlask(this.materials);
      this.detachRewardTemplateMaterials(template);
      preparePickupOpacity(template);
      this.catalogRewardTemplateGeometries(rewardKind, template);
      this.sanitizeRuntimeRewardTemplate(template);
      markPickupMaterialsShared(template);
      this.runtimeRewardTemplates.set(rewardKind, template);
    }
    return this.cloneRuntimeRewardTemplate(template);
  }

  /** Keep reward templates isolated from the world material palette once. */
  private detachRewardTemplateMaterials(template: THREE.Object3D): void {
    template.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const clone = (material: THREE.Material): THREE.Material => {
        // Tagged materials own runtime textures through a non-enumerable
        // lifecycle seam. Three.js material.clone() does not copy that tag,
        // so cloning here would orphan those textures from the disposer. The
        // luminous-ward material is created per template and is already
        // detached from the shared palette; retain it as the explicit owner.
        if (hasTaggedOwnedMaterialTextures(material)) return material;
        const owned = material.clone();
        owned.userData.sharedDungeonMaterial = false;
        owned.userData.pickupSharedTemplate = false;
        return owned;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(clone)
        : clone(object.material);
    });
  }

  /** Catalog immutable reward geometry; runtime clones detach materials on write. */
  private catalogRewardTemplateGeometries(
    rewardKind: ChestRewardKind,
    template: THREE.Object3D,
  ): void {
    const seen = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
    let meshIndex = 0;
    template.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const generated = object.geometry;
      const existing = seen.get(generated);
      if (existing) {
        object.geometry = existing;
        return;
      }
      const key = [
        "pickup/v2",
        encodeURIComponent(rewardKind),
        "part",
        meshIndex,
        encodeURIComponent(object.name || "mesh"),
      ].join(":");
      meshIndex += 1;
      const borrowed = this.resourceCatalog.borrowGeometry(
        key,
        () => generated,
        "pickup-reward-geometry/v2",
      );
      if (borrowed !== generated) generated.dispose();
      seen.set(generated, borrowed);
      object.geometry = borrowed;
    });
  }

  private rewardScaleForKind(rewardKind: ChestRewardKind): number {
    if (rewardKind === "resolve") return 0.64;
    if (rewardKind === "map") return 0.62;
    if (rewardKind === "mobility" || rewardKind === "clarity") return 0.58;
    if (
      rewardKind === "time-freeze" ||
      rewardKind === "annihilation-pulse" ||
      rewardKind === "cull-brand" ||
      rewardKind === "phoenix-egg"
    ) {
      return 0.54;
    }
    if (isCurseRewardKind(rewardKind)) return 0.56;
    return 0.52;
  }

  private attachRewardSignals(
    reward: StaticPickupActor,
    rewardKind: ChestRewardKind,
    item: THREE.Object3D,
  ): void {
    if (rewardKind === "time-freeze") {
      const light = item.getObjectByName("Time freeze pickup light") as THREE.PointLight | null;
      if (!light) return;
      light.intensity = light.intensity || TIME_FREEZE_PICKUP_LIGHT_INTENSITY;
      reward.timeFreezeSignal = {
        light,
        baseIntensity: TIME_FREEZE_PICKUP_LIGHT_INTENSITY,
      };
    } else if (rewardKind === "luminous-ward") {
      const light = item.getObjectByName("Luminous ward pickup light") as THREE.PointLight | null;
      if (!light) return;
      reward.luminousWardSignal = {
        light,
        glow: item.getObjectByName("Luminous ward pickup halo") as THREE.Mesh,
        baseIntensity: LUMINOUS_WARD_PICKUP_LIGHT_INTENSITY,
        baseGlowOpacity: LUMINOUS_WARD_PICKUP_GLOW_OPACITY,
      };
    } else if (rewardKind === "annihilation-pulse") {
      const light = item.getObjectByName(
        "Annihilation pulse pickup light",
      ) as THREE.PointLight | null;
      if (!light) return;
      reward.annihilationPulseSignal = {
        light,
        glow: item.getObjectByName("Annihilation pulse pickup halo") as THREE.Mesh,
        baseIntensity: ANNIHILATION_PULSE_PICKUP_LIGHT_INTENSITY,
        baseGlowOpacity: ANNIHILATION_PULSE_PICKUP_GLOW_OPACITY,
      };
    } else if (rewardKind === "cull-brand") {
      const light = item.getObjectByName("Cull brand pickup light") as THREE.PointLight | null;
      if (!light) return;
      reward.cullBrandSignal = {
        light,
        glow: item.getObjectByName("Cull brand halo") as THREE.Mesh,
        baseIntensity: CULL_BRAND_PICKUP_LIGHT_INTENSITY,
        baseGlowOpacity: CULL_BRAND_PICKUP_GLOW_OPACITY,
      };
    } else if (rewardKind === "phoenix-egg") {
      const light = item.getObjectByName("Phoenix egg pickup light") as THREE.PointLight | null;
      if (!light) return;
      reward.phoenixEggSignal = {
        light,
        glow: item.getObjectByName("Phoenix egg halo") as THREE.Mesh,
        baseIntensity: PHOENIX_EGG_PICKUP_LIGHT_INTENSITY,
        baseGlowOpacity: PHOENIX_EGG_PICKUP_GLOW_OPACITY,
      };
    }
  }

  /** Floor-spawned pickup (no chest lid); collection is proximity-based. */
  private addFloorPickup(
    dungeon: DungeonData,
    cell: GridCell,
    rewardKind: ChestRewardKind,
    stableId?: string,
  ): void {
    const runtime = this.requireCurrentResidentFloor("Floor pickup registration");
    const world = gridToWorld(dungeon, cell, this.tileSize);
    const item = this.createRewardObject(rewardKind);
    preparePickupOpacity(item);
    item.name = `${rewardKind} floor pickup ${cell.x},${cell.y}`;
    item.userData.floorIndex = runtime.floorIndex;
    if (stableId) item.userData.catalogKey = stableId;
    const rewardScale = this.rewardScaleForKind(rewardKind) * 0.92;
    const baseScale = new THREE.Vector3(rewardScale, rewardScale, rewardScale);
    const baseY = rewardKind === "resolve" ? 0.42 : 0.48;
    item.position.set(world.x, baseY, world.z);
    item.scale.copy(baseScale);
    setPickupDormant(item, false);
    const reward: StaticPickupActor = {
      floorIndex: runtime.floorIndex,
      id: stableId ?? `${dungeon.seedHash}:floor:${runtime.floorIndex}:pickup:${cell.x},${cell.y}`,
      kind: rewardKind,
      object: item,
      collected: false,
      collectTime: 0,
      collectOriginX: world.x,
      collectOriginY: baseY,
      collectOriginZ: world.z,
      available: true,
      revealTime: 1,
      baseY,
      baseScale,
      // Loose map loot must be collected by walking over it.  `autoCollect`
      // is reserved for a chest reward after its explicit reveal; leaving it
      // enabled here makes DungeonWorld accept any horizontal distance and
      // pulls every free pickup to the player on the first frame.
      autoCollect: false,
    };
    this.attachRewardSignals(reward, rewardKind, item);
    // Floor free powers keep lights live; flasks stay unlit for budget.
    if (reward.timeFreezeSignal) {
      reward.timeFreezeSignal.light.intensity = reward.timeFreezeSignal.baseIntensity * 0.85;
    }
    if (reward.luminousWardSignal) {
      reward.luminousWardSignal.light.intensity = reward.luminousWardSignal.baseIntensity * 0.75;
    }
    if (reward.phoenixEggSignal) {
      reward.phoenixEggSignal.light.intensity = reward.phoenixEggSignal.baseIntensity * 0.9;
    }
    runtime.registerPickup(reward);
    this.pickups.push(reward);
    this.add(item);
    this.stats.props += 1;
  }

  private addForgeLiquids(dungeon: DungeonData): void {
    const liquidKit = createLiquidSectionKit(
      dungeon,
      this.materials,
      this.tileSize,
      this.textureSink,
    );
    if (!liquidKit) return;
    this.requireCurrentResidentFloor("Liquid section registration").setLiquidKit(liquidKit);
    this.add(liquidKit.root);
    this.stats.props += liquidKit.stats.cells + liquidKit.stats.boundaryEdges;
  }

  // STATIC_SCENE_METHODS
}

const CARDINAL_NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const BIOME_WALL_DECAL_OFFSET = 0.026;
const BIOME_CORNER_PROP_INSET = 0.66;
const BIOME_FLOOR_PROP_WALL_INSET = 0.58;

/** Corridor cells usable by scenery. Unlike pickup seats, Forge corridor tiles
 * are intentionally allowed; door mouths, stairs, spawn and exit remain clear. */
function collectDecorCorridorCells(dungeon: DungeonData): GridCell[] {
  const seats: GridCell[] = [];
  const blocked = new Uint8Array(dungeon.width * dungeon.height);
  const block = (cell: GridCell): void => {
    if (cell.x < 0 || cell.y < 0 || cell.x >= dungeon.width || cell.y >= dungeon.height) return;
    blocked[cell.y * dungeon.width + cell.x] = 1;
  };
  block(dungeon.spawn);
  block(dungeon.exit);
  for (const doorway of dungeon.topology?.doorways ?? []) {
    block(doorway.cell);
    block(doorway.outside);
  }
  for (const stair of dungeon.floor?.stairs ?? []) {
    block(stair.cell);
    for (const cell of stair.footprint) block(cell);
  }
  for (const cell of dungeon.floor?.openVerticalCells ?? []) block(cell);

  for (let y = 1; y < dungeon.height - 1; y += 1) {
    for (let x = 1; x < dungeon.width - 1; x += 1) {
      const index = y * dungeon.width + x;
      if (dungeon.grid[y]?.[x] !== FLOOR || blocked[index]) continue;
      if (dungeon.forge?.doorways[index] || dungeon.forge?.pools[index]) continue;
      const structuralRoomId =
        dungeon.forge?.roomIds[index] ?? dungeon.topology?.roomIds[index] ?? -1;
      if (structuralRoomId >= 0) continue;
      const authoredCorridor = Boolean(
        dungeon.forge?.corridors[index] || dungeon.topology?.corridors[index],
      );
      let floorNeighbors = 0;
      for (const [dx, dy] of CARDINAL_NEIGHBORS) {
        if (dungeon.grid[y + dy]?.[x + dx] === FLOOR) floorNeighbors += 1;
      }
      if (!authoredCorridor && (floorNeighbors === 0 || floorNeighbors > 2)) continue;
      seats.push({ x, y });
    }
  }
  return seats;
}

/**
 * Corridor-like floor seats for free pickups: forge corridor mask, or floor
 * tiles with few orthogonal floor neighbors (narrow runs).
 */
function collectCorridorPickupSeats(
  dungeon: DungeonData,
  excluded: CellOccupancyQuery,
): GridCell[] {
  const seats: GridCell[] = [];
  const width = dungeon.width;
  const height = dungeon.height;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (dungeon.grid[y]?.[x] !== FLOOR) continue;
      if (excluded.isOccupied(x, y)) continue;
      const cell = { x, y };
      if (isProtectedTraversalCell(dungeon, cell)) continue;
      const forgeCorridor = dungeon.forge?.corridors?.[y * width + x];
      let floorNeighbors = 0;
      for (const [dx, dy] of CARDINAL_NEIGHBORS) {
        if (dungeon.grid[y + dy]?.[x + dx] === FLOOR) floorNeighbors += 1;
      }
      const narrow = floorNeighbors > 0 && floorNeighbors <= 2;
      if (!forgeCorridor && !narrow) continue;
      seats.push(cell);
    }
  }
  return seats;
}

type DungeonWallSeat = ReturnType<typeof collectRoomWallSeats>[number];
type DungeonCornerSeat = ReturnType<typeof collectRoomCornerSeats>[number];

function pickSeparatedWallSeats<T extends DungeonWallSeat>(
  seats: readonly T[],
  count: number,
  seedSalt: number,
): T[] {
  if (seats.length === 0 || count <= 0) return [];
  const ordered = pickSpreadSeats(seats, seats.length, seedSalt);
  const picked: T[] = [];
  for (const seat of ordered) {
    if (picked.length >= count) break;
    const separated = picked.every(
      (other) => Math.hypot(seat.cell.x - other.cell.x, seat.cell.y - other.cell.y) >= 1.15,
    );
    if (separated) picked.push(seat);
  }
  return picked;
}

/** Per-world radial pool texture for fake light pooling under wall fires. */
function createTorchFloorPoolTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.Texture();
  }
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 63);
  gradient.addColorStop(0, "rgba(255, 196, 128, 0.5)");
  gradient.addColorStop(0.42, "rgba(214, 148, 84, 0.22)");
  gradient.addColorStop(1, "rgba(120, 70, 34, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStaticContactShadowTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.Texture();
  }
  const gradient = context.createRadialGradient(48, 48, 4, 48, 48, 47);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0.62)");
  gradient.addColorStop(0.54, "rgba(0, 0, 0, 0.28)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Cheap warm pool where torchlight lands on the floor — sells range without a real shadow pass. */
function createTorchFloorPool(
  position: THREE.Vector3,
  facing: THREE.Vector3,
  texture: THREE.Texture,
): THREE.Mesh {
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, 20),
    new THREE.MeshBasicMaterial({
      map: texture,
      color: 0xd89a58,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  pool.name = "Torch floor light pool";
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(position.x + facing.x * 0.5, 0.028, position.z + facing.z * 0.5);
  pool.renderOrder = 2;
  pool.userData.baseOpacity = 0.45;
  return pool;
}
const SOLID_PROP_KINDS = new Set([
  "table",
  "bench",
  "chair",
  "bookshelf",
  "crates",
  "barrels",
  "coffin",
  "sarco",
  "urns",
  "weapon-rack",
  "lectern",
  "reliquary",
  "chest",
  "pillar",
  "grave",
  "high-chair",
  "ritual-table",
  "ossuary-cabinet",
  "bossCrystal",
  "shrineCrystal",
]);
/** Free-standing adult furniture stays full metric size even in tight rooms. */
const FULL_SCALE_FURNITURE = new Set(["table", "bench", "chair", "lectern", "ritual-table"]);

/** Keep adult furniture at metric size; only oversized vertical props shrink in tiny rooms. */
export function dressingPropScale(family: string, maxRoomCells: number): number {
  if (family === "reliquary") return 0.78;
  if (FULL_SCALE_FURNITURE.has(family)) return 1;
  // Tall wall cases need a hair of shrink so they fit low ceilings / small libraries.
  if (family === "bookshelf" || family === "ossuary-cabinet") {
    return Math.min(1, Math.max(0.95, maxRoomCells / 4.5));
  }
  return Math.min(1, Math.max(0.92, maxRoomCells / 5));
}

const makeInstanceMatrix = new THREE.Matrix4();
const makeInstancePosition = new THREE.Vector3();
const makeInstanceScale = new THREE.Vector3();
const makeInstanceIdentity = new THREE.Quaternion();

function makeInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  position: THREE.Vector3Like,
  scale: THREE.Vector3Like = { x: 1, y: 1, z: 1 },
  quaternion: THREE.Quaternion = makeInstanceIdentity,
): void {
  makeInstancePosition.set(position.x, position.y, position.z);
  makeInstanceScale.set(scale.x, scale.y, scale.z);
  makeInstanceMatrix.compose(makeInstancePosition, quaternion, makeInstanceScale);
  mesh.setMatrixAt(index, makeInstanceMatrix);
}

/**
 * Exposed wall face (plane). U stays 0..1 across one tile so neighbor offsets of +1
 * meet exactly; V scales by wall height / tileSize for masonry aspect.
 * Slight width > tileSize overlaps posts without stretching UV past one unit.
 */
function createWallFaceGeometry(
  width: number,
  height: number,
  tileSize: number,
): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;
  const vScale = height / Math.max(0.001, tileSize);
  for (let i = 0; i < uv.count; i += 1) {
    // Keep U in 0..1 (do not scale by width) so aTileUvOffset steps stay continuous.
    uv.setY(i, uv.getY(i) * vScale);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Floor/ceiling tiles: UV 0..1 per cell; aTileUvOffset continues the pattern. */
function createFloorTileGeometry(footprint: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(footprint, 0.1, footprint);
}

function createWallSpriteMaterial(
  textures: WallSpriteTextures,
  mood: DungeonMood,
  roughness: number,
  opacity = 1,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: textures.albedo,
    normalMap: textures.normal,
    roughnessMap: textures.rough,
    color: new THREE.Color(mood.surfaceTint).lerp(new THREE.Color(0xffffff), 0.72),
    transparent: true,
    opacity: Math.min(opacity, 0.9),
    alphaTest: opacity < 1 ? 0.16 : 0.1,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: THREE.MathUtils.clamp(roughness, 0.78, 1),
    metalness: 0,
    envMapIntensity: THREE.MathUtils.clamp(mood.environmentIntensity * 1.1, 0.08, 0.32),
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  // Keep the sprite planar. Depth remains available for later parallax work.
  material.normalScale.set(0.24, 0.24);
  material.onBeforeCompile = muteBiomePropShader;
  material.customProgramCacheKey = () => "environment-sprite-muted-fog-v4";
  material.userData.depthTexture = textures.depth;
  material.userData.wallSpritePbr = true;
  material.userData.environmentSpriteTreatment = "muted-biome-fog-v4";
  return material;
}

/**
 * Mute bright atlas cells, then dissolve wall sprites into FogExp2 so distant
 * alpha-tested silhouettes do not punch through the exploration fog wall.
 */
function muteBiomePropShader(shader: { fragmentShader: string }): void {
  const mapChunk = "#include <map_fragment>";
  if (shader.fragmentShader.includes(mapChunk)) {
    shader.fragmentShader = shader.fragmentShader.replace(
      mapChunk,
      `${mapChunk}
      float biomePropLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb = mix(vec3(biomePropLuma), diffuseColor.rgb, 0.38);
      diffuseColor.rgb *= 0.78;`,
    );
  }
  const fogChunk = "#include <fog_fragment>";
  if (!shader.fragmentShader.includes(fogChunk)) return;
  // After stock fog, pull remaining color into the fog and soft-kill alpha so
  // hard alphaTest edges do not read as floating wall stickers at range.
  shader.fragmentShader = shader.fragmentShader.replace(
    fogChunk,
    `${fogChunk}
  #ifdef USE_FOG
    float biomePropFogVisibility = 1.0 - smoothstep(0.24, 0.62, fogFactor);
    gl_FragColor.a *= biomePropFogVisibility;
  #endif`,
  );
}

/** Remap a plane's local UVs into one slot of the shared v2 biome atlas. */
function applyBiomeDecorAtlasUv(geometry: THREE.BufferGeometry, slot: number): void {
  const uv = geometry.getAttribute("uv");
  if (!(uv instanceof THREE.BufferAttribute)) return;
  const frame = biomeSpriteDecorAtlasFrame(slot);
  const atlasWidth = BIOME_SPRITE_DECOR_ATLAS_SIZE[0];
  const atlasHeight = BIOME_SPRITE_DECOR_ATLAS_SIZE[1];
  const offsetX = frame.x / atlasWidth;
  const offsetY = 1 - (frame.y + frame.h) / atlasHeight;
  const repeatX = frame.w / atlasWidth;
  const repeatY = frame.h / atlasHeight;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(index, offsetX + uv.getX(index) * repeatX, offsetY + uv.getY(index) * repeatY);
  }
  uv.needsUpdate = true;
}

function biomeDecorTint(mood: DungeonMood, surface: BiomeSurfacePaletteRole): THREE.Color {
  return new THREE.Color(biomeSurfacePalette(mood.id, surface).propTint);
}

/** Distinct, restrained hanging motion for every biome without per-frame allocation. */
function biomeDecorMotion(
  mood: DungeonMood,
  slot: number,
  cell: GridCell,
): { phase: number; speed: number; amplitude: number } {
  let biomeHash = 0;
  for (let index = 0; index < mood.id.length; index += 1) {
    biomeHash = (biomeHash * 31 + mood.id.charCodeAt(index)) >>> 0;
  }
  return {
    phase: (slot * 2.399963 + cell.x * 0.37 + cell.y * 0.61) % (Math.PI * 2),
    speed: 0.42 + (biomeHash % 7) * 0.055,
    amplitude: 0.006 + (biomeHash % 4) * 0.002,
  };
}

/** Pull authored sprite color and value toward the extracted surface palette. */
function integrateBiomeDecorShader(shader: { fragmentShader: string }): void {
  const mapChunk = "#include <map_fragment>";
  if (shader.fragmentShader.includes(mapChunk)) {
    shader.fragmentShader = shader.fragmentShader.replace(
      mapChunk,
      `${mapChunk}
      float biomeDecorLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      float biomeDecorTintLuma = max(dot(diffuse, vec3(0.2126, 0.7152, 0.0722)), 0.001);
      float biomeDecorRelativeLuma = clamp(biomeDecorLuma / biomeDecorTintLuma, 0.0, 1.0);
      float biomeDecorSurfaceValue = mix(0.32, 0.82, smoothstep(0.08, 0.92, biomeDecorRelativeLuma));
      vec3 biomeDecorSurfaceTone = diffuse * biomeDecorSurfaceValue;
      diffuseColor.rgb = mix(biomeDecorSurfaceTone, diffuseColor.rgb, 0.28);
      diffuseColor.rgb *= 0.86;`,
    );
  }
  const fogChunk = "#include <fog_fragment>";
  if (shader.fragmentShader.includes(fogChunk)) {
    shader.fragmentShader = shader.fragmentShader.replace(
      fogChunk,
      `${fogChunk}
  #ifdef USE_FOG
    float biomeDecorFogVisibility = 1.0 - smoothstep(0.24, 0.62, fogFactor);
    gl_FragColor.a *= biomeDecorFogVisibility;
  #endif`,
    );
  }
}

/** Lit wall decal material. The shared flag keeps rebuilds from disposing cached maps. */
function createBiomeWallDecalMaterial(
  texture: THREE.Texture,
  mood: DungeonMood,
  alphaTest: number,
): THREE.MeshStandardMaterial {
  const palette = biomeSurfacePalette(mood.id, "wall");
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: biomeDecorTint(mood, "wall"),
    emissive: new THREE.Color(palette.base),
    emissiveMap: texture,
    emissiveIntensity: 0.045,
    transparent: true,
    opacity: 1,
    alphaTest,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: THREE.MathUtils.clamp(mood.environmentIntensity, 0.08, 0.28),
    fog: true,
  });
  material.toneMapped = true;
  material.onBeforeCompile = integrateBiomeDecorShader;
  material.customProgramCacheKey = () => "biome-prop-v2-wall-integrated-v6";
  material.userData.sharedDungeonMaterial = true;
  material.userData.biomeSpriteWallDecal = true;
  material.userData.authoredColorWeight = 0.28;
  material.userData.brightness = 0.86;
  material.userData.mapBlend = "authored-v2-biome-surface-tone-v6";
  material.userData.biomeMood = mood.id;
  material.userData.biomeSurfacePalette = palette;
  material.userData.biomeSurfacePaletteRole = "wall";
  material.userData.visibilityBoost = 0.06;
  return material;
}

/** Lit floor sprite plane; its orientation depends on the authored placement. */
function createBiomeFloorSpriteMaterial(
  texture: THREE.Texture,
  mood: DungeonMood,
  placement: BiomeSpritePlacement | BiomeSpriteDecorPlacement,
  alphaTest: number,
): THREE.MeshStandardMaterial {
  const isFloorDecal = placement === "floor-decal";
  const paletteRole: BiomeSurfacePaletteRole =
    placement === "ceiling-hanging" ? "ceiling" : "floor";
  const palette = biomeSurfacePalette(mood.id, paletteRole);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: biomeDecorTint(mood, paletteRole),
    emissive: new THREE.Color(palette.base),
    emissiveMap: texture,
    emissiveIntensity: 0.045,
    transparent: true,
    opacity: 1,
    alphaTest,
    depthWrite: false,
    depthTest: true,
    polygonOffset: isFloorDecal,
    polygonOffsetFactor: isFloorDecal ? -3 : 0,
    polygonOffsetUnits: isFloorDecal ? -3 : 0,
    side: THREE.DoubleSide,
    roughness: isFloorDecal ? 1 : 0.98,
    metalness: 0,
    envMapIntensity: THREE.MathUtils.clamp(mood.environmentIntensity * 0.8, 0.06, 0.22),
    fog: true,
  });
  material.toneMapped = true;
  material.onBeforeCompile = integrateBiomeDecorShader;
  material.customProgramCacheKey = () => `biome-prop-v2-${placement}-integrated-v6`;
  material.userData.sharedDungeonMaterial = true;
  material.userData.biomeSpritePlacement = placement;
  material.userData.biomeSpriteBillboard =
    placement === "floor-decal" ? "floor-fixed" : "yaw-to-player";
  material.userData.authoredColorWeight = 0.28;
  material.userData.brightness = 0.86;
  material.userData.mapBlend = "authored-v2-biome-surface-tone-v6";
  material.userData.biomeMood = mood.id;
  material.userData.biomeSurfacePalette = palette;
  material.userData.biomeSurfacePaletteRole = paletteRole;
  material.userData.visibilityBoost = 0.06;
  return material;
}

/** Attach per-instance UV offsets (geometry must not be shared across meshes). */
function setTileUvOffsets(geometry: THREE.BufferGeometry, offsets: Float32Array): void {
  geometry.setAttribute("aTileUvOffset", new THREE.InstancedBufferAttribute(offsets, 2));
}

interface WallFaceSeat {
  cell: GridCell;
  /** Grid step from wall cell into the adjacent floor (face looks this way). */
  intoDx: number;
  intoDy: number;
  theme: SurfaceTheme;
}

interface StaticPropTemplateBatch {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  castShadow: boolean;
  receiveShadow: boolean;
}

/** Snapshot kept across scene rebuilds; callers always receive cloned geometries. */
interface CachedStaticPropTemplateBatch {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  castShadow: boolean;
  receiveShadow: boolean;
}

const staticPropTemplateBatchCache = new Map<string, CachedStaticPropTemplateBatch[]>();

export interface StaticPropTemplateBatchOptions {
  /** Legacy process-global clone cache for callers that own every returned geometry. */
  cacheKey?: string;
  /** Per-world owner for immutable final batches. Mutually exclusive with the clone cache. */
  resourceCatalog?: StaticResourceCatalog;
  /** Stable family/topology key; part index and material layout are appended here. */
  catalogKey?: string;
  /** Stable material role/layout token; do not return ephemeral material UUIDs. */
  materialKey?: (material: THREE.Material) => string;
  /** Diagnostic collision namespace for catalog entries. */
  resourceType?: string;
}

/** Test/helper: drop cached template batches (does not dispose live scene meshes). */
export function clearStaticPropTemplateBatchCache(): void {
  for (const batches of staticPropTemplateBatchCache.values()) {
    for (const batch of batches) batch.geometry.dispose();
  }
  staticPropTemplateBatchCache.clear();
}

export function staticPropTemplateBatchCacheSize(): number {
  return staticPropTemplateBatchCache.size;
}

function cloneStaticPropTemplateBatches(
  batches: readonly CachedStaticPropTemplateBatch[],
): StaticPropTemplateBatch[] {
  return batches.map((batch) => ({
    geometry: batch.geometry.clone(),
    material: batch.material,
    castShadow: batch.castShadow,
    receiveShadow: batch.receiveShadow,
  }));
}

function cloneCachedStaticPropTemplateBatches(cacheKey: string): StaticPropTemplateBatch[] | null {
  const cached = staticPropTemplateBatchCache.get(cacheKey);
  return cached ? cloneStaticPropTemplateBatches(cached) : null;
}

function staticPropMaterialLayout(
  material: THREE.Material | THREE.Material[],
  materialKey: ((material: THREE.Material) => string) | undefined,
): string {
  const role = (candidate: THREE.Material) =>
    encodeURIComponent(
      materialKey?.(candidate) ?? `${candidate.type}:${candidate.name || "unnamed"}`,
    );
  return Array.isArray(material)
    ? `array:${material.length}:${material.map(role).join(",")}`
    : `single:${role(material)}`;
}

function borrowStaticPropTemplateBatches(
  batches: readonly StaticPropTemplateBatch[],
  options: StaticPropTemplateBatchOptions,
): StaticPropTemplateBatch[] {
  const catalog = options.resourceCatalog;
  const catalogKey = options.catalogKey?.trim();
  if (!catalog || !catalogKey) return [...batches];

  const resourceType = options.resourceType?.trim() || "static-prop-template-batch/v2";
  const borrowed: StaticPropTemplateBatch[] = [];
  const released = new Set<THREE.BufferGeometry>();
  try {
    for (const [partIndex, part] of batches.entries()) {
      const layout = staticPropMaterialLayout(part.material, options.materialKey);
      const geometry = catalog.borrowGeometry(
        `${catalogKey}:part:${partIndex}:layout:${layout}`,
        () => part.geometry,
        `${resourceType}:${layout}`,
      );
      if (geometry !== part.geometry) {
        part.geometry.dispose();
        released.add(part.geometry);
      }
      borrowed.push({ ...part, geometry });
    }
  } catch (error) {
    for (const part of batches) {
      if (!catalog.ownsGeometry(part.geometry) && !released.has(part.geometry)) {
        part.geometry.dispose();
      }
    }
    throw error;
  }
  return borrowed;
}

function prepareStaticPropGeometry(part: THREE.Mesh): THREE.BufferGeometry {
  const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
  geometry.applyMatrix4(part.matrixWorld);
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  if (!geometry.getAttribute("uv")) {
    geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(
        new Float32Array(geometry.getAttribute("position").count * 2),
        2,
      ),
    );
  }
  // Stock primitives sometimes carry extra attributes or mixed index modes.
  // Static props only need this common surface contract; normalizing it lets
  // wood, iron, brass, and bone parts merge into one draw each.
  for (const attribute of Object.keys(geometry.attributes)) {
    if (attribute !== "position" && attribute !== "normal" && attribute !== "uv")
      geometry.deleteAttribute(attribute);
  }
  geometry.clearGroups();
  return geometry;
}

function buildStaticPropTemplateBatches(template: THREE.Object3D): StaticPropTemplateBatch[] {
  const groups = new Map<
    string,
    {
      material: THREE.Material;
      castShadow: boolean;
      receiveShadow: boolean;
      meshes: THREE.Mesh[];
    }
  >();
  const unmerged: THREE.Mesh[] = [];
  template.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (Array.isArray(child.material)) {
      unmerged.push(child);
      return;
    }
    const key = `${child.material.uuid}:${Number(child.castShadow)}:${Number(child.receiveShadow)}`;
    const group = groups.get(key) ?? {
      material: child.material,
      castShadow: child.castShadow,
      receiveShadow: child.receiveShadow,
      meshes: [] as THREE.Mesh[],
    };
    group.meshes.push(child);
    groups.set(key, group);
  });

  const batches: StaticPropTemplateBatch[] = [];
  for (const group of groups.values()) {
    const geometries = group.meshes.map(prepareStaticPropGeometry);
    const geometry = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries, false);
    if (geometry) {
      if (geometries.length > 1) geometries.forEach((candidate) => candidate.dispose());
      batches.push({
        geometry,
        material: group.material,
        castShadow: group.castShadow,
        receiveShadow: group.receiveShadow,
      });
      continue;
    }
    geometries.forEach((candidate) =>
      batches.push({
        geometry: candidate,
        material: group.material,
        castShadow: group.castShadow,
        receiveShadow: group.receiveShadow,
      }),
    );
  }
  for (const part of unmerged) {
    batches.push({
      geometry: prepareStaticPropGeometry(part),
      material: part.material,
      castShadow: part.castShadow,
      receiveShadow: part.receiveShadow,
    });
  }
  return batches;
}

/**
 * Bake a static prop template into as few instanced parts as its materials allow.
 * Creation maps may reuse hundreds of props; one draw per source mesh caused the
 * full-width play view to exceed 600 calls even though the props were instanced.
 * Optional cacheKey reuses merge work across dungeon rebuilds; each caller still
 * owns a geometry clone it may dispose freely.
 */
export function createStaticPropTemplateBatches(
  template: THREE.Object3D,
  options?: StaticPropTemplateBatchOptions,
): StaticPropTemplateBatch[] {
  const cacheKey = options?.cacheKey?.trim() || "";
  const catalogKey = options?.catalogKey?.trim() || "";
  if (options?.resourceCatalog && !catalogKey) {
    throw new Error("Static prop catalog consumers require a stable catalogKey.");
  }
  if (cacheKey && options?.resourceCatalog) {
    throw new Error(
      "Static prop batches cannot use the clone cache and a resource catalog together.",
    );
  }
  if (cacheKey) {
    const hit = cloneCachedStaticPropTemplateBatches(cacheKey);
    if (hit) return hit;
  }

  template.updateMatrixWorld(true);
  const built = buildStaticPropTemplateBatches(template);
  const batches = options?.resourceCatalog
    ? borrowStaticPropTemplateBatches(built, options)
    : built;
  if (cacheKey) {
    staticPropTemplateBatchCache.set(
      cacheKey,
      batches.map((batch) => ({
        geometry: batch.geometry.clone(),
        material: batch.material,
        castShadow: batch.castShadow,
        receiveShadow: batch.receiveShadow,
      })),
    );
  }
  return batches;
}

function disposeTemplateGeometries(template: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  template.traverse((child) => {
    if (child instanceof THREE.Mesh) geometries.add(child.geometry);
  });
  geometries.forEach((geometry) => geometry.dispose());
}

/** One plane per wall-to-floor adjacency — no cube grid lines on masonry. */
function collectExposedWallFaces(
  dungeon: DungeonData,
  wallCells: readonly GridCell[],
): WallFaceSeat[] {
  const faces: WallFaceSeat[] = [];
  for (const cell of wallCells) {
    for (const [intoDx, intoDy] of CARDINAL_NEIGHBORS) {
      const floor = { x: cell.x + intoDx, y: cell.y + intoDy };
      if (dungeon.grid[floor.y]?.[floor.x] !== FLOOR) continue;
      faces.push({
        cell,
        intoDx,
        intoDy,
        theme: surfaceThemeForCell(dungeon, floor),
      });
    }
  }
  return faces;
}

function collectBoundaryWalls(dungeon: DungeonData): GridCell[] {
  const walls: GridCell[] = [];
  for (let y = 0; y < dungeon.height; y += 1) {
    for (let x = 0; x < dungeon.width; x += 1) {
      if (dungeon.grid[y]?.[x] !== WALL) continue;
      if (dungeon.forge?.pools[y * dungeon.width + x]) continue;
      if (
        CARDINAL_NEIGHBORS.some(
          ([offsetX, offsetY]) => dungeon.grid[y + offsetY]?.[x + offsetX] === FLOOR,
        )
      )
        walls.push({ x, y });
    }
  }
  return walls;
}

function roomDistance(dungeon: DungeonData, room: DungeonRoom): number {
  return dungeon.distances[room.center.y * dungeon.width + room.center.x] ?? -1;
}

/** Expand-contract re-exports: ownership lives in InteractionReach. */
export {
  canCollectPickup,
  canCollectPickupAt,
  canInteractWithChest,
  canInteractWithChestAt,
  CHEST_INTERACTION_DISTANCE,
  PICKUP_COLLECTION_DISTANCE,
  STONE_COLLECTION_DISTANCE,
} from "./InteractionReach";

export function chestRewardAutoActivates(kind: ChestRewardKind): boolean {
  // Phoenix arms a charge without firing; still auto-collects on contact.
  return kind !== "resolve";
}

function isCurseRewardKind(
  kind: ChestRewardKind,
): kind is
  | "swarm-curse"
  | "slow-curse"
  | "frenzy-curse"
  | "gloom-curse"
  | "mirror-curse"
  | "spin-curse" {
  return (
    kind === "swarm-curse" ||
    kind === "slow-curse" ||
    kind === "frenzy-curse" ||
    kind === "gloom-curse" ||
    kind === "mirror-curse" ||
    kind === "spin-curse"
  );
}

function deterministicLosAge(phase: number): number {
  const noise = Math.sin(phase * 12.9898) * 43758.5453;
  return (noise - Math.floor(noise)) * 0.12;
}

/** Blend an authored practical light into the active biome without flattening its source identity. */
export function biomeTintedLightColor(base: number, mood: DungeonMood, strength = 0.62): number {
  return new THREE.Color(base)
    .lerp(new THREE.Color(mood.lanternColor), THREE.MathUtils.clamp(strength, 0, 1))
    .getHex();
}

/** Unit XZ direction from source toward target (push away from attacker). */
function surfaceThemeForCell(dungeon: DungeonData, cell: GridCell): SurfaceTheme {
  const index = cell.y * dungeon.width + cell.x;
  if (dungeon.forge) {
    if (dungeon.forge.corridors[index]) return "corridor";
    const roomId = dungeon.forge.roomIds[index];
    const metadata = dungeon.forge.rooms.find((room) => room.id === roomId);
    if (metadata?.lake) return "lake";
    if (metadata?.grave) return "grave";
    const type = metadata?.type?.toLowerCase();
    if (type && ["entrance", "combat", "elite", "treasure", "shrine", "boss"].includes(type))
      return type as SurfaceTheme;
  }
  const room = dungeon.rooms.find(
    (candidate) =>
      cell.x >= candidate.x &&
      cell.x < candidate.x + candidate.width &&
      cell.y >= candidate.y &&
      cell.y < candidate.y + candidate.height,
  );
  const theme = room ? roomTheme(dungeon, room) : "corridor";
  return ["entrance", "combat", "elite", "treasure", "shrine", "boss"].includes(theme)
    ? (theme as SurfaceTheme)
    : theme === "crypt"
      ? "grave"
      : "corridor";
}

function partitionCells(
  dungeon: DungeonData,
  cells: readonly GridCell[],
  walls = false,
): Map<SurfaceTheme, GridCell[]> {
  const batches = new Map<SurfaceTheme, GridCell[]>();
  for (const cell of cells) {
    let theme: SurfaceTheme = "corridor";
    if (walls) {
      const neighbor = CARDINAL_NEIGHBORS.map(([dx, dy]) => ({
        x: cell.x + dx,
        y: cell.y + dy,
      })).find((candidate) => dungeon.grid[candidate.y]?.[candidate.x] === FLOOR);
      if (neighbor) theme = surfaceThemeForCell(dungeon, neighbor);
    } else theme = surfaceThemeForCell(dungeon, cell);
    const batch = batches.get(theme) ?? [];
    batch.push(cell);
    batches.set(theme, batch);
  }
  return batches;
}
// STATIC_SCENE_HELPERS
