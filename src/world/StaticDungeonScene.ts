import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { createSeededRandom } from "../core/random";
import { FLOOR, WALL } from "../dungeon/generateDungeon";
import { gridToWorld, worldToGrid, type WorldCollider } from "../dungeon/gridCollision";
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
  type DungeonMaterials,
} from "./MaterialLibrary";
import { createDungeonArch, createDungeonDoor, doorwayPlacement } from "./DoorFactory";
import { createDungeonProp, propFamiliesForTheme } from "./DungeonPropKit";
import { roomTheme } from "./RoomArtDirection";
import {
  applyBiomeMaps,
  applyMoodToSurfaceMaterials,
  type RoomSurfaceSet,
  type SurfaceTheme,
} from "./RoomSurfaceMaterials";
import { createForgeChest, createForgeProp, getForgePropScale } from "./ForgePropFactory";
import { createLightingPropBase } from "./LightingPropFactory";
import { createFlameTongueGeometry } from "./FlameGeometry";
import { batchForgeChestForRuntime } from "./RuntimeModelBatching";
import {
  createResolveFlask,
  createAnnihilationPulseRelic,
  createDungeonMapPickup,
  createLuminousWardStone,
  createMobilityDraught,
  createTimeFreezeRelic,
  ANNIHILATION_PULSE_PICKUP_GLOW_OPACITY,
  ANNIHILATION_PULSE_PICKUP_LIGHT_INTENSITY,
  LUMINOUS_WARD_PICKUP_GLOW_OPACITY,
  LUMINOUS_WARD_PICKUP_LIGHT_INTENSITY,
  preparePickupOpacity,
  setPickupDormant,
  TIME_FREEZE_PICKUP_LIGHT_INTENSITY,
} from "./ItemFactory";
import {
  createCobwebGeometry,
  createCobwebMaterial,
  createBonePile,
  createHanging,
  createRubblePile,
} from "./AtmospherePropsKit";
import type { DungeonMood } from "../systems/DungeonMood";
import { getDungeonMood } from "../systems/DungeonMood";
import { FIRE_LIGHT_TUNING, MAX_DYNAMIC_FIRE_LIGHTS } from "../systems/LightTuning";
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
  WALL_HUGGING_KINDS,
  wallHugWorldOffset,
} from "./PropPlacement";
import { createMagicStone } from "./MagicStoneKit";
import { createBiomeMagicPortal, magicPortalApproachYaw } from "./MagicPortalKit";
import {
  hasValidMagicStonePlacementContract,
  hasValidPortalPlacementContract,
  magicStoneClearanceCells,
  selectMagicStonePlacements,
  type MagicStonePlacement,
} from "./MagicStonePlacement";
import type { StoneId } from "../ui/copy";
import { selectDistributedTorchIndices } from "./TorchDistribution";
import {
  createLiquidSectionKit,
  disposeLiquidSectionKit,
  type LiquidSectionKit,
} from "./LiquidSectionKit";
import { createSpecialRoomSignals } from "./SpecialRoomSignalKit";
import { getBiomeDecorationProfile } from "./BiomeDecorationProfile";
import {
  BIOME_SPRITE_PROPS,
  BIOME_CORNER_PROP_MAX_TURN,
  biomeSpriteFloorGroundGap,
  type BiomeSpritePlacement,
  type BiomeSpritePropDefinition,
} from "./BiomeSpriteDecorKit";
import { createDungeonStaircase, DUNGEON_STAIR_STEP_COUNT } from "./StaircaseKit";
import { ThreeResourceDisposer } from "./ThreeResourceDisposer";

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

export interface StaticDoorActor {
  root: THREE.Group;
  left: THREE.Group;
  right: THREE.Group;
  openness: number;
  targetOpen: boolean;
}

export type StaticPickupKind =
  | "stone"
  | "resolve"
  | "time-freeze"
  | "luminous-ward"
  | "annihilation-pulse"
  | "map"
  | "mobility";

export interface StaticPickupActor {
  kind: StaticPickupKind;
  stoneId?: StoneId;
  object: THREE.Object3D;
  collected: boolean;
  collectTime: number;
  available: boolean;
  revealTime: number;
  baseY: number;
  baseScale: THREE.Vector3;
  autoCollect?: boolean;
  stoneSignal?: {
    light: THREE.PointLight;
    glow: THREE.Mesh;
    crown: THREE.Mesh;
    baseLightIntensity: number;
    baseGlowOpacity: number;
  };
  timeFreezeSignal?: {
    light: THREE.PointLight;
    baseIntensity: number;
  };
  luminousWardSignal?: {
    light: THREE.PointLight;
    glow: THREE.Mesh;
    baseIntensity: number;
    baseGlowOpacity: number;
  };
  annihilationPulseSignal?: {
    light: THREE.PointLight;
    glow: THREE.Mesh;
    baseIntensity: number;
    baseGlowOpacity: number;
  };
}

export interface StaticChestActor {
  id: string;
  root: THREE.Group;
  lid: THREE.Group;
  reward: StaticPickupActor;
  opened: boolean;
  openness: number;
}

export interface StaticStairActor {
  root: THREE.Group;
  direction: "up" | "down";
  targetFloor: number;
  cell: GridCell;
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
  audio?: boolean;
}

export interface StaticFloorBiomeSprite {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  baseOpacity: number;
  x: number;
  z: number;
  baseYaw: number;
  placement: BiomeSpritePlacement;
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
  hazardCells: Set<string>;
  floorBiomeSprites: StaticFloorBiomeSprite[];
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
}

export interface StaticDungeonSceneOptions {
  group: THREE.Group;
  assets: AssetLibrary;
  materials: DungeonMaterials;
  surfaceMaterials: Record<SurfaceTheme, RoomSurfaceSet>;
  tileSize: number;
  wallHeight: number;
  stoneTextures: ReadonlyMap<StoneId, THREE.Texture>;
}

function createHandles(): StaticDungeonSceneHandles {
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
    floorBiomeSprites: [],
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
  };
}

function createCurvedBrazierFlameGeometry(
  radius: number,
  height: number,
  sides: number,
  lean: number,
  depthCurve: number,
  twist: number,
  depthScale: number,
): THREE.BufferGeometry {
  const geometry = createFlameTongueGeometry(radius, height, sides, lean);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    const t = THREE.MathUtils.clamp(y / height + 0.5, 0, 1);
    const sourceX = positions.getX(index);
    const sourceZ = positions.getZ(index) * depthScale;
    const angle = twist * t;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const curl = lean * Math.sin(Math.PI * t) * 0.44 + radius * Math.sin(t * 4.4 + twist) * 0.08;
    const x = sourceX * cos - sourceZ * sin + curl;
    const z = sourceX * sin + sourceZ * cos + depthCurve * t * t;
    positions.setXYZ(index, x, y + height * 0.5, z);

    const bodyLight = 0.58 + Math.pow(Math.sin(Math.PI * t), 0.62) * 0.42;
    const sideLight = 0.82 + 0.18 * THREE.MathUtils.clamp(x / Math.max(radius, 0.001), -1, 1);
    const value = THREE.MathUtils.clamp(bodyLight * sideLight, 0.48, 1);
    colors[index * 3] = value;
    colors[index * 3 + 1] = value;
    colors[index * 3 + 2] = value;
  }
  positions.needsUpdate = true;
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.name = "Curved three-dimensional low-poly brazier flame tongue";
  geometry.userData.sourceGeometry = "createFlameTongueGeometry";
  geometry.userData.curvedSilhouette = true;
  geometry.userData.depthCurve = depthCurve;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
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
  private readonly buildRoots: THREE.Object3D[] = [];
  private readonly biomeWallDecalMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly biomeFloorSpriteMaterials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly staticContactShadowPlacements: Array<{
    x: number;
    z: number;
    width: number;
    depth: number;
  }> = [];
  private handles = createHandles();
  private activeMood: DungeonMood = getDungeonMood("ash");
  private decorDensity = 0.6;
  private dynamicFireLightCount = 0;
  private disposed = false;
  private readonly tempPosition = new THREE.Vector3();
  private readonly tempScale = new THREE.Vector3();
  private readonly tempQuaternion = new THREE.Quaternion();
  private readonly tempEuler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly tempMatrix = new THREE.Matrix4();

  constructor(options: StaticDungeonSceneOptions) {
    this.group = options.group;
    this.assets = options.assets;
    this.materials = options.materials;
    this.surfaceMaterials = options.surfaceMaterials;
    this.tileSize = options.tileSize;
    this.wallHeight = options.wallHeight;
    this.stoneTextures = options.stoneTextures;
  }

  static emptyHandles(): StaticDungeonSceneHandles {
    return createHandles();
  }

  get currentHandles(): StaticDungeonSceneHandles {
    return this.handles;
  }

  build(dungeon: DungeonData, mood: DungeonMood, decorDensity: number): StaticDungeonSceneHandles {
    if (this.disposed) throw new Error("StaticDungeonScene has been disposed.");
    this.clear();
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
    if (!hasValidPortalPlacementContract(dungeon)) {
      throw new Error("Dungeon cannot start Play without a reachable exit portal seat.");
    }
    const allStonePlacements = selectMagicStonePlacements(dungeon);
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
    for (const cell of magicStoneClearanceCells(dungeon, stonePlacements)) {
      this.objectiveClearanceCells.add(`${cell.x},${cell.y}`);
    }
    for (const stair of dungeon.floor?.stairs ?? []) {
      this.objectiveClearanceCells.add(`${stair.cell.x},${stair.cell.y}`);
    }
    const floorCells: GridCell[] = [];
    for (let y = 0; y < dungeon.height; y += 1) {
      for (let x = 0; x < dungeon.width; x += 1) {
        if (dungeon.grid[y]?.[x] === FLOOR) floorCells.push({ x, y });
      }
    }
    const wallCells = collectBoundaryWalls(dungeon);
    this.addArchitecture(dungeon, floorCells, wallCells);
    const hazardExclusions = new Set([
      ...this.objectiveClearanceCells,
      ...this.solidCells.keys(),
      `${dungeon.spawn.x},${dungeon.spawn.y}`,
      `${dungeon.exit.x},${dungeon.exit.y}`,
    ]);
    this.hazardTiles = new HazardTileSystem(dungeon, mood, this.tileSize, hazardExclusions);
    this.hazardTiles.placements.forEach((placement) => {
      const key = `${placement.cell.x},${placement.cell.y}`;
      this.hazardCells.add(key);
      this.objectiveClearanceCells.add(key);
    });
    this.add(this.hazardTiles.root);
    this.stats.hazardTiles = this.hazardTiles.placements.length;
    if (!dungeon.forge) this.addCaveProps(dungeon);
    this.addDoorsAndRoomProps(dungeon);
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
    this.addLightProps(dungeon);
    this.addAtmosphereProps(dungeon);
    this.addAmbientGodrays(dungeon, mood);
    this.addMarkers(dungeon, mood);
    this.addStaircases(dungeon);
    this.addStaticObjectives(dungeon, stonePlacements);
    const stonePickups = this.pickups.filter((pickup) => pickup.kind === "stone");
    if (stonePickups.length !== stonePlacements.length) {
      throw new Error(
        `Dungeon completeness failed: expected ${stonePlacements.length} stone pickups, built ${stonePickups.length}.`,
      );
    }
    const finalFloor = !dungeon.floor || dungeon.floor.index === dungeon.floor.count - 1;
    if (finalFloor && !this.portalRoot) {
      throw new Error("Dungeon completeness failed: exit portal mesh was not created.");
    }
    this.applyMoodToPracticalLights(mood);
    this.stats.floorTiles = floorCells.length;
    this.stats.wallTiles = wallCells.length;
    this.stats.ceilingTiles = floorCells.length;
    this.stats.pickups = this.pickups.length;
    return this.handles;
  }

  clear(): void {
    const expired = this.handles;
    const separatelyDisposed = new Set<THREE.Object3D>();
    const resourceDisposer = new ThreeResourceDisposer();
    if (expired.liquidKit) {
      this.group.remove(expired.liquidKit.root);
      disposeLiquidSectionKit(expired.liquidKit);
      separatelyDisposed.add(expired.liquidKit.root);
      expired.liquidKit = null;
    }
    if (expired.hazardTiles) {
      this.group.remove(expired.hazardTiles.root);
      expired.hazardTiles.dispose();
      separatelyDisposed.add(expired.hazardTiles.root);
      expired.hazardTiles = null;
    }
    for (const root of this.buildRoots.splice(0)) {
      if (separatelyDisposed.has(root)) continue;
      this.group.remove(root);
      resourceDisposer.dispose(root);
    }
    for (const material of this.biomeWallDecalMaterials.values()) {
      resourceDisposer.disposeOwnedMaterial(material);
    }
    for (const material of this.biomeFloorSpriteMaterials.values()) {
      resourceDisposer.disposeOwnedMaterial(material);
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
    expired.hazardCells.clear();
    expired.floorBiomeSprites.length = 0;
    expired.wallSpriteOccupiedCells.clear();
    expired.exitPosition.set(0, 0, 0);
    expired.portalRoot = null;
    expired.portalBeam = null;
    expired.portalLight = null;
    expired.stoneBeams.length = 0;
    expired.ambientBeams.length = 0;
    expired.stonePlacements.length = 0;
    this.staticContactShadowPlacements.length = 0;
    this.dynamicFireLightCount = 0;
    this.resetStats();
    this.handles = createHandles();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
  }

  isObjectiveClearanceCell(cell: GridCell): boolean {
    return this.objectiveClearanceCells.has(`${cell.x},${cell.y}`);
  }

  isObjectOccupiedCell(cell: GridCell): boolean {
    const key = `${cell.x},${cell.y}`;
    return (
      this.objectOccupiedCells.has(key) ||
      this.solidCells.has(key) ||
      this.wallSpriteOccupiedCells.has(key)
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
    this.group.add(...objects);
    this.buildRoots.push(...objects);
  }

  private reserveObjectCell(cell: GridCell): void {
    this.objectOccupiedCells.add(`${cell.x},${cell.y}`);
  }

  private reserveWallObjectCell(cell: GridCell): void {
    this.wallSpriteOccupiedCells.add(`${cell.x},${cell.y}`);
    this.reserveObjectCell(cell);
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

  private get solidCells(): Map<string, GridCell> {
    return this.handles.solidCells;
  }

  private get objectOccupiedCells(): Set<string> {
    return this.handles.objectOccupiedCells;
  }

  private get solidColliders(): WorldCollider[] {
    return this.handles.solidColliders;
  }

  private get objectiveClearanceCells(): Set<string> {
    return this.handles.objectiveClearanceCells;
  }

  private get hazardCells(): Set<string> {
    return this.handles.hazardCells;
  }

  private get floorBiomeSprites(): StaticFloorBiomeSprite[] {
    return this.handles.floorBiomeSprites;
  }

  private get wallSpriteOccupiedCells(): Set<string> {
    return this.handles.wallSpriteOccupiedCells;
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

  private get ambientBeams(): THREE.Mesh[] {
    return this.handles.ambientBeams;
  }

  private get liquidKit(): LiquidSectionKit | null {
    return this.handles.liquidKit;
  }

  private set liquidKit(value: LiquidSectionKit | null) {
    this.handles.liquidKit = value;
  }

  private get hazardTiles(): HazardTileSystem | null {
    return this.handles.hazardTiles;
  }

  private set hazardTiles(value: HazardTileSystem | null) {
    this.handles.hazardTiles = value;
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

    for (const [theme, cells] of partitionCells(dungeon, floorCells)) {
      const floorOffsets = new Float32Array(cells.length * 2);
      const ceilingOffsets = new Float32Array(cells.length * 2);
      const floorGeometry = floorTemplate.clone();
      const ceilingGeometry = ceilingTemplate.clone();
      cells.forEach((cell, instance) => {
        const floorUv = dungeonFloorUvOffset(cell);
        const ceilingUv = dungeonCeilingUvOffset(cell);
        floorOffsets[instance * 2] = floorUv[0];
        floorOffsets[instance * 2 + 1] = floorUv[1];
        ceilingOffsets[instance * 2] = ceilingUv[0];
        ceilingOffsets[instance * 2 + 1] = ceilingUv[1];
      });
      setTileUvOffsets(floorGeometry, floorOffsets);
      setTileUvOffsets(ceilingGeometry, ceilingOffsets);

      const floor = new THREE.InstancedMesh(
        floorGeometry,
        this.surfaceMaterials[theme].floor,
        cells.length,
      );
      floor.name = `${theme} room floor`;
      floor.receiveShadow = true;
      const ceiling = new THREE.InstancedMesh(
        ceilingGeometry,
        this.surfaceMaterials[theme].ceiling,
        cells.length,
      );
      ceiling.name = `${theme} room ceiling`;
      cells.forEach((cell, instance) => {
        const p = gridToWorld(dungeon, cell, this.tileSize);
        makeInstance(floor, instance, { x: p.x, y: -0.05, z: p.z });
        makeInstance(
          ceiling,
          instance,
          { x: p.x, y: this.wallHeight - 0.01, z: p.z },
          { x: 1, y: 1, z: 1 },
          ceilingOrientation,
        );
      });
      floor.instanceMatrix.needsUpdate = true;
      ceiling.instanceMatrix.needsUpdate = true;
      this.add(floor, ceiling);
    }

    // Masonry as exposed face panels (not solid cubes) — kills the grid of vertical seams.
    const faces = collectExposedWallFaces(dungeon, wallCells);
    const facesByTheme = new Map<SurfaceTheme, WallFaceSeat[]>();
    for (const face of faces) {
      const list = facesByTheme.get(face.theme) ?? [];
      list.push(face);
      facesByTheme.set(face.theme, list);
    }
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
        const rotation = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
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
    // Slightly smaller than a tile so face panels fully cover the silhouette.
    const core = this.tileSize * 0.96;
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
    const rooms = dungeon.rooms.filter((room) => room.role === "room");
    const rockGeometry = new THREE.DodecahedronGeometry(0.3, 0);
    const rockCells = rooms.flatMap((room) => {
      const cells: GridCell[] = [];
      for (let y = room.y + 1; y < room.y + room.height - 1; y += 1)
        for (let x = room.x + 1; x < room.x + room.width - 1; x += 1) {
          const cell = { x, y };
          if (dungeon.grid[y]?.[x] === FLOOR && !this.isObjectiveClearanceCell(cell))
            cells.push(cell);
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
        if (dungeon.grid[y]?.[x] === FLOOR && !this.isObjectiveClearanceCell({ x, y }))
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
    this.doors.push({ root: door, left, right, openness: 0, targetOpen: false });
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
    const leafMaterial = new THREE.MeshStandardMaterial({
      map: doorSurface.albedo,
      normalMap: doorSurface.normal,
      roughnessMap: doorSurface.roughness,
      metalnessMap: doorSurface.metalness,
      normalScale: new THREE.Vector2(0.72, 0.72),
      color: this.activeMood.id === "obsidian" ? 0x686b72 : 0xffffff,
      roughness: doorSurface.roughness ? 1 : profile.doorRoughness,
      metalness: doorSurface.metalness ? 1 : this.activeMood.id === "iron" ? 0.42 : 0.03,
      envMapIntensity: this.activeMood.id === "iron" ? 0.78 : 0.34,
    });
    const hardwareMaterial = this.materials.iron.clone();
    hardwareMaterial.color.setHex(profile.hardwareTint);
    hardwareMaterial.userData = { ...hardwareMaterial.userData, sharedDungeonMaterial: false };
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

  private addDoorsAndRoomProps(dungeon: DungeonData): void {
    if (dungeon.forge) {
      this.addForgeDoorsAndProps(dungeon);
      return;
    }
    const random = createSeededRandom(`${dungeon.seed}:room-dressing`);
    const occupiedDoorCells = new Set<string>();
    let heroReliquaryPlaced = false;
    const doorwaysByRoom = new Map<number, DungeonDoorway[]>();
    for (const doorway of dungeon.topology?.doorways ?? []) {
      const roomDoorways = doorwaysByRoom.get(doorway.roomId) ?? [];
      roomDoorways.push(doorway);
      doorwaysByRoom.set(doorway.roomId, roomDoorways);
    }
    const classicPropPlacements = new Map<
      string,
      {
        template: THREE.Group;
        bounds: THREE.Box3;
        matrices: THREE.Matrix4[];
      }
    >();
    const classicWallArtPlacements = new Map<number, THREE.Matrix4[]>();

    for (const room of dungeon.rooms) {
      const theme = roomTheme(dungeon, room);
      const candidates = doorwaysByRoom.get(room.id) ?? [];
      const doorway =
        candidates[Math.abs(room.id * 7 + dungeon.seedHash) % Math.max(candidates.length, 1)];
      if (
        doorway &&
        !occupiedDoorCells.has(`${doorway.cell.x},${doorway.cell.y}`) &&
        room.role !== "entrance"
      ) {
        const cellWorld = gridToWorld(dungeon, doorway.cell, this.tileSize);
        const placement = doorwayPlacement(cellWorld, doorway.outDx, doorway.outDy, this.tileSize);
        // Slightly wider than one tile so posts bite into the side masonry.
        const door = createDungeonDoor(
          this.materials,
          this.tileSize * 1.12,
          this.wallHeight,
          this.createDoorAppearance(),
        );
        door.userData.roomId = room.id;
        door.userData.edgeIndex = doorway.edgeIndex;
        door.userData.connectedRoomId = doorway.connectedRoomId;
        this.registerDoor(door, placement, placement.rotation);
        occupiedDoorCells.add(`${doorway.cell.x},${doorway.cell.y}`);
        this.stats.props += 1;
      }

      if (room.role === "entrance" || room.width < 5 || room.height < 5) continue;
      if (room.id % 2 === 0) {
        // Paintings share a shallow real frame and one instanced batch per map.
        const north = { x: room.center.x, y: room.y - 1 };
        const south = { x: room.center.x, y: room.y + room.height };
        const west = { x: room.x - 1, y: room.center.y };
        const wall =
          dungeon.grid[north.y]?.[north.x] === WALL
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
          const mapIndex = Math.abs(room.id) % 4;
          const artMatrices = classicWallArtPlacements.get(mapIndex) ?? [];
          artMatrices.push(artMatrix);
          classicWallArtPlacements.set(mapIndex, artMatrices);
          for (const seat of collectRoomWallSeats(dungeon, room)) {
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
      const wallSeats = collectRoomWallSeats(dungeon, room);
      const interiorSeats = collectRoomInteriorSeats(dungeon, room);
      const occupied = new Set<string>([
        ...this.objectOccupiedCells,
        ...this.solidCells.keys(),
        ...this.wallSpriteOccupiedCells,
      ]);
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
            const key = `${seat.cell.x},${seat.cell.y}`;
            if (
              occupied.has(key) ||
              dungeon.grid[seat.cell.y]?.[seat.cell.x] !== FLOOR ||
              this.isObjectiveClearanceCell(seat.cell)
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
            const key = `${seat.x},${seat.y}`;
            if (
              occupied.has(key) ||
              dungeon.grid[seat.y]?.[seat.x] !== FLOOR ||
              this.isObjectiveClearanceCell(seat)
            )
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
            !occupied.has(`${fallback.x},${fallback.y}`) &&
            !isProtectedTraversalCell(dungeon, fallback) &&
            !this.isObjectiveClearanceCell(fallback)
          ) {
            cell = fallback;
          }
        }
        if (!cell || isProtectedTraversalCell(dungeon, cell) || this.isObjectiveClearanceCell(cell))
          continue;

        const variant = Math.abs(room.id + index) % 3;
        const groupKey = `${family}:${family === "reliquary" ? 0 : variant}`;
        let placementGroup = classicPropPlacements.get(groupKey);
        if (!placementGroup) {
          const template = createDungeonProp(family, this.materials, variant);
          template.updateMatrixWorld(true);
          placementGroup = {
            template,
            bounds: new THREE.Box3().setFromObject(template),
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
        this.registerSolidBounds(placementGroup.bounds.clone().applyMatrix4(rootMatrix), cell);
        occupied.add(`${cell.x},${cell.y}`);
        this.stats.props += 1;
      }
    }

    const artGeometry = new THREE.PlaneGeometry(2.3, 2.3);
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

    for (const [groupKey, placement] of classicPropPlacements) {
      const templateBatches = createStaticPropTemplateBatches(placement.template);
      disposeTemplateGeometries(placement.template);
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
      const template = createDungeonArch(this.materials, {
        width: (length + 0.2) * this.tileSize,
        wallHeight: this.wallHeight,
        ...this.createArchAppearance(),
      });
      const frame = template.getObjectByName("Joined stone door frame");
      if (!(frame instanceof THREE.Mesh)) continue;
      const batch = new THREE.InstancedMesh(frame.geometry, frame.material, arches.length);
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
      const door = createDungeonDoor(
        this.materials,
        (arch.len + 0.2) * this.tileSize,
        this.wallHeight,
        this.createDoorAppearance(),
      );
      this.registerDoor(door, position, arch.px === 1 ? 0 : Math.PI / 2);
      this.stats.props += 1;
    }
    this.addInstancedForgeProps(dungeon, [...forge.props, ...this.buildForgeRoomDressing(dungeon)]);
    this.addForgeLiquids(dungeon);
  }

  private buildForgeRoomDressing(dungeon: DungeonData): ForgePropMetadata[] {
    const forge = dungeon.forge;
    if (!forge) return [];
    const occupied = new Set<string>([
      ...this.objectOccupiedCells,
      ...this.solidCells.keys(),
      ...this.wallSpriteOccupiedCells,
    ]);
    const reserve = (x: number, y: number): void => {
      occupied.add(`${x},${y}`);
    };
    forge.props.forEach((prop) => reserve(prop.x, prop.y));
    forge.spawns.forEach((spawn) => reserve(spawn.x, spawn.y));
    forge.torches.forEach((torch) => reserve(torch.x, torch.y));
    reserve(dungeon.spawn.x, dungeon.spawn.y);
    reserve(dungeon.exit.x, dungeon.exit.y);
    forge.doorways.forEach((value, index) => {
      if (value) reserve(index % dungeon.width, Math.floor(index / dungeon.width));
    });
    this.objectiveClearanceCells.forEach((key) => occupied.add(key));
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
      const wallSeats = collectRoomWallSeats(dungeon, room);
      const interiorSeats = collectRoomInteriorSeats(dungeon, room);
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
            const key = `${seat.cell.x},${seat.cell.y}`;
            const seatIndex = seat.cell.y * dungeon.width + seat.cell.x;
            if (
              occupied.has(key) ||
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
            const key = `${seat.x},${seat.y}`;
            const seatIndex = seat.y * dungeon.width + seat.x;
            if (
              occupied.has(key) ||
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
          occupied.has(`${x},${y}`)
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
    const occupied = new Set([
      ...this.objectOccupiedCells,
      ...this.solidCells.keys(),
      ...this.wallSpriteOccupiedCells,
    ]);
    for (const prop of props) {
      if (prop.kind === "brazier" || prop.kind === "candle" || prop.kind === "campfire") continue;
      const solid = SOLID_PROP_KINDS.has(prop.kind);
      const propKey = `${prop.x},${prop.y}`;
      const objectiveConflict = this.isObjectiveClearanceCell(prop);
      const protectedTraversal = isProtectedTraversalCell(dungeon, prop) || objectiveConflict;
      const needsRelocation =
        occupied.has(propKey) || objectiveConflict || (solid && protectedTraversal);
      const relocatedCell = needsRelocation
        ? findNearestPropCell(dungeon, prop, occupied, 4, (cell) =>
            this.isObjectiveClearanceCell(cell),
          )
        : null;
      if (needsRelocation && !relocatedCell) continue;
      const placedProp = relocatedCell ? { ...prop, ...relocatedCell } : prop;
      if (relocatedCell) occupied.add(`${relocatedCell.x},${relocatedCell.y}`);
      const placedKey = `${placedProp.x},${placedProp.y}`;
      this.reserveObjectCell(placedProp);
      occupied.add(placedKey);
      if (solid) {
        const cell = { x: placedProp.x, y: placedProp.y };
        occupied.add(`${cell.x},${cell.y}`);
        this.solidCells.set(`${cell.x},${cell.y}`, cell);
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
    const mergedByMaterial = new Map<
      string,
      {
        material: THREE.Material;
        castShadow: boolean;
        receiveShadow: boolean;
        geometries: THREE.BufferGeometry[];
      }
    >();
    for (const [, instances] of groups) {
      const template = createForgeProp(instances[0]!, this.materials);
      if (!template) continue;
      template.updateMatrixWorld(true);
      const templateBounds = new THREE.Box3().setFromObject(template);
      const instanceMatrices = instances.map((prop) => this.forgePropRootMatrix(dungeon, prop));
      for (const prop of instances) {
        if (!SOLID_PROP_KINDS.has(prop.kind) || !this.solidCells.has(`${prop.x},${prop.y}`))
          continue;
        this.registerSolidBounds(
          templateBounds.clone().applyMatrix4(this.forgePropRootMatrix(dungeon, prop)),
          { x: prop.x, y: prop.y },
        );
      }
      const templateBatches = createStaticPropTemplateBatches(template);
      disposeTemplateGeometries(template);
      for (const part of templateBatches) {
        if (Array.isArray(part.material)) {
          const batch = new THREE.InstancedMesh(part.geometry, part.material, instances.length);
          batch.name = "Forge static multi-material batch";
          batch.castShadow = part.castShadow;
          batch.receiveShadow = part.receiveShadow;
          instanceMatrices.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
          batch.instanceMatrix.needsUpdate = true;
          this.add(batch);
          continue;
        }
        const key = `${part.material.uuid}:${Number(part.castShadow)}:${Number(part.receiveShadow)}`;
        const merged = mergedByMaterial.get(key) ?? {
          material: part.material,
          castShadow: part.castShadow,
          receiveShadow: part.receiveShadow,
          geometries: [],
        };
        instanceMatrices.forEach((matrix) => {
          merged.geometries.push(part.geometry.clone().applyMatrix4(matrix));
        });
        mergedByMaterial.set(key, merged);
        part.geometry.dispose();
      }
      this.stats.props += instances.length;
    }
    for (const [index, merged] of [...mergedByMaterial.values()].entries()) {
      const geometry =
        merged.geometries.length === 1
          ? merged.geometries[0]!
          : mergeGeometries(merged.geometries, false);
      if (!geometry) {
        merged.geometries.forEach((candidate, partIndex) => {
          const fallback = new THREE.Mesh(candidate, merged.material);
          fallback.name = `Forge static fallback ${index + 1}.${partIndex + 1}`;
          fallback.castShadow = merged.castShadow;
          fallback.receiveShadow = merged.receiveShadow;
          this.add(fallback);
        });
        continue;
      }
      if (merged.geometries.length > 1)
        merged.geometries.forEach((candidate) => candidate.dispose());
      const batch = new THREE.Mesh(geometry, merged.material);
      batch.name = `Forge static material batch ${index + 1}`;
      batch.castShadow = merged.castShadow;
      batch.receiveShadow = merged.receiveShadow;
      batch.frustumCulled = true;
      this.add(batch);
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
  ): void {
    const kit = createForgeChest(this.materials);
    batchForgeChestForRuntime(kit);
    kit.root.name = `${rewardKind} chest ${prop.x},${prop.y}`;
    kit.root.userData.rewardKind = rewardKind;
    kit.root.userData.autoActivatesReward = chestRewardAutoActivates(rewardKind);
    this.forgePropRootMatrix(dungeon, prop).decompose(
      kit.root.position,
      kit.root.quaternion,
      kit.root.scale,
    );
    this.add(kit.root);
    kit.root.updateWorldMatrix(true, true);
    this.registerSolidObject(kit.root, { x: prop.x, y: prop.y });

    const anchor = new THREE.Vector3(0, 0.91, 0.02);
    kit.root.localToWorld(anchor);
    const item =
      rewardKind === "time-freeze"
        ? createTimeFreezeRelic(this.materials)
        : rewardKind === "luminous-ward"
          ? createLuminousWardStone(this.materials)
          : rewardKind === "annihilation-pulse"
            ? createAnnihilationPulseRelic(this.materials)
            : rewardKind === "map"
              ? createDungeonMapPickup(this.materials)
              : rewardKind === "mobility"
                ? createMobilityDraught(this.materials)
                : createResolveFlask(this.materials);
    preparePickupOpacity(item);
    item.name = `${rewardKind} reward from chest`;
    const rewardScale =
      rewardKind === "resolve"
        ? 0.64
        : rewardKind === "map"
          ? 0.62
          : rewardKind === "mobility"
            ? 0.58
        : rewardKind === "time-freeze" || rewardKind === "annihilation-pulse"
          ? 0.54
          : 0.52;
    const baseScale = new THREE.Vector3(rewardScale, rewardScale, rewardScale);
    const baseY = anchor.y + 0.08;
    item.position.set(anchor.x, baseY - 0.34, anchor.z);
    // Stay in the scene graph (tiny scale) so reward PointLights keep a stable
    // count from world build through open, collect, and dormancy.
    setPickupDormant(item, true);
    const reward: StaticPickupActor = {
      kind: rewardKind,
      object: item,
      collected: false,
      collectTime: 0,
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
    }
    this.pickups.push(reward);
    this.chests.push({
      id: `${dungeon.seedHash}:${prop.x},${prop.y}`,
      root: kit.root,
      lid: kit.lid,
      reward,
      opened: false,
      openness: 0,
    });
    this.add(item);
    this.stats.props += 1;
  }

  private registerSolidObject(object: THREE.Object3D, cell: GridCell): void {
    object.updateWorldMatrix(true, true);
    this.registerSolidBounds(new THREE.Box3().setFromObject(object), cell);
  }

  private registerSolidBounds(bounds: THREE.Box3, cell: GridCell): void {
    if (bounds.isEmpty()) return;
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
    this.solidCells.set(`${cell.x},${cell.y}`, { ...cell });
    this.reserveObjectCell(cell);
    this.solidColliders.push({
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
    const geometry = new THREE.CircleGeometry(0.5, 18);
    const material = new THREE.MeshBasicMaterial({
      name: "Static prop contact shadow material",
      map: getStaticContactShadowTexture(),
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

  private addLightProps(dungeon: DungeonData): void {
    if (this.activeMood.id === "backrooms") {
      this.addBackroomsLightProps(dungeon);
      return;
    }
    if (dungeon.forge) {
      this.addForgeLightProps(dungeon);
      return;
    }
    const random = createSeededRandom(`${dungeon.seed}:fire-props`);
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
    const spawnWorld = gridToWorld(dungeon, dungeon.spawn, this.tileSize);
    const exitWorld = gridToWorld(dungeon, dungeon.exit, this.tileSize);
    const spawnForward = new THREE.Vector3(
      exitWorld.x - spawnWorld.x,
      0,
      exitWorld.z - spawnWorld.z,
    ).normalize();
    const entranceCandidates = [...candidates]
      .map((candidate) => {
        const floor = gridToWorld(dungeon, candidate.floor, this.tileSize);
        const offset = new THREE.Vector3(floor.x - spawnWorld.x, 0, floor.z - spawnWorld.z);
        const distance = offset.length();
        const forwardScore = distance > 0.001 ? offset.normalize().dot(spawnForward) : 0;
        return { candidate, score: distance - forwardScore * 3.2 };
      })
      .filter(
        ({ candidate }) =>
          Math.abs(candidate.wall.x - dungeon.spawn.x) +
            Math.abs(candidate.wall.y - dungeon.spawn.y) <=
          7,
      )
      .sort((left, right) => left.score - right.score)
      .map(({ candidate }) => candidate);
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swap = random.integer(0, index);
      [candidates[index], candidates[swap]] = [candidates[swap]!, candidates[index]!];
    }
    const torches: typeof candidates = [];
    for (const candidate of entranceCandidates) {
      if (
        torches.some(
          (placed) =>
            Math.max(
              Math.abs(placed.wall.x - candidate.wall.x),
              Math.abs(placed.wall.y - candidate.wall.y),
            ) < 3,
        )
      )
        continue;
      torches.push(candidate);
      if (torches.length >= 2) break;
    }
    const target = Math.max(6, Math.round((8 + dungeon.rooms.length * 0.45) * this.decorDensity));
    for (const candidate of candidates) {
      if (torches.includes(candidate)) continue;
      // Relaxed from 5 to 4 cells so corridors and medium rooms get denser warmth.
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
      const position = { x: p.x + 1.15, z: p.z - 0.8 };
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
  private addBackroomsLightProps(dungeon: DungeonData): void {
    const cells = [
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
    const target = Math.min(MAX_DYNAMIC_FIRE_LIGHTS, anchors.length);
    for (let index = 0; index < target; index += 1) {
      const cell = anchors[index]!;
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
      this.fireEffects.push({
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
        phase: index * 2.47,
        losOpen: true,
        losAge: deterministicLosAge(index * 2.47),
        audio: false,
      });
    }
    this.stats.props += target;
    this.stats.lights = target + 4;
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
    if (kind === "torch" && facing) {
      const torch =
        Math.floor(phase * 10) % 4 === 0
          ? createWallLantern(position, facing, lit, this.materials)
          : createWallTorch(position, facing, lit, this.materials);
      const keepDynamicLight = dynamicLight && this.dynamicFireLightCount < MAX_DYNAMIC_FIRE_LIGHTS;
      if (keepDynamicLight) {
        // Fake light pooling on the floor — LOD-faded with the other halos.
        const pool = createTorchFloorPool(position, facing);
        torch.halos.push(pool);
        this.add(pool);
      }
      this.add(torch.root);
      const light = keepDynamicLight
        ? this.detachFireLight(torch.root, torch.light)
        : this.removeFireLight(torch.root, torch.light, torch.halos);
      this.fireEffects.push({
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
      });
      return;
    }
    if (kind === "campfire" || kind === "candle") {
      const campfire = createFloorCampfire(position, lit, this.materials, Math.floor(phase * 10));
      this.add(campfire.root);
      const keepDynamicLight = dynamicLight && this.dynamicFireLightCount < MAX_DYNAMIC_FIRE_LIGHTS;
      const light = keepDynamicLight
        ? this.detachFireLight(campfire.root, campfire.light)
        : this.removeFireLight(campfire.root, campfire.light, campfire.halos);
      this.fireEffects.push({
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
    const outerGeometry = createCurvedBrazierFlameGeometry(
      0.058,
      0.27,
      7,
      -0.13,
      0.032,
      0.52,
      0.62,
    );
    const flame = new THREE.Mesh(
      outerGeometry,
      new THREE.MeshBasicMaterial({
        color: coldFlame ? 0x75a6bf : 0xe27c35,
        vertexColors: true,
        transparent: true,
        opacity: coldFlame ? 0.27 : 0.42,
        blending: THREE.NormalBlending,
        depthWrite: false,
      }),
    );
    flame.name = "Brazier runtime outer flame";
    flame.position.copy(flamePosition).add(new THREE.Vector3(-0.038, 0.004, 0.016));
    flame.rotation.set(0, 0.38, -0.1);
    flame.visible = lit;
    flame.renderOrder = 4;
    flame.userData.decorativeVfx = true;

    const coreGeometry = createCurvedBrazierFlameGeometry(
      0.034,
      0.16,
      7,
      0.018,
      -0.015,
      -0.38,
      0.78,
    );
    const core = new THREE.Mesh(
      coreGeometry,
      new THREE.MeshBasicMaterial({
        color: coldFlame ? 0xf2ac65 : 0xffc667,
        vertexColors: true,
        transparent: true,
        opacity: coldFlame ? 0.44 : 0.62,
        blending: THREE.NormalBlending,
        depthWrite: false,
      }),
    );
    core.name = "Brazier runtime flame core";
    core.position.copy(flamePosition).add(new THREE.Vector3(0.006, 0.004, -0.006));
    core.rotation.set(0, -0.55, 0.015);
    core.visible = lit;
    core.renderOrder = 5;
    core.userData.decorativeVfx = true;
    core.userData.preserveWarmCore = true;

    const leanGeometry = createCurvedBrazierFlameGeometry(
      0.043,
      0.205,
      6,
      0.045,
      0.03,
      0.55,
      0.66,
    );
    const lean = new THREE.Mesh(
      leanGeometry,
      new THREE.MeshBasicMaterial({
        color: coldFlame ? 0x5d8da8 : 0xef8b3e,
        vertexColors: true,
        transparent: true,
        opacity: coldFlame ? 0.22 : 0.34,
        blending: THREE.NormalBlending,
        depthWrite: false,
      }),
    );
    lean.name = "Brazier runtime leaning flame tongue";
    lean.position.copy(flamePosition).add(new THREE.Vector3(0.058, 0.002, -0.024));
    lean.rotation.set(0, 0.76, 0.13);
    lean.visible = lit;
    lean.renderOrder = 4;
    lean.userData.decorativeVfx = true;

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
    root.add(flame, core, lean, halo);
    const baseIntensity = coldFlame ? 6.5 : 18;
    const lightRange = coldFlame ? 5.5 : 8;
    const keepDynamicLight =
      lit && dynamicLight && this.dynamicFireLightCount < MAX_DYNAMIC_FIRE_LIGHTS;
    const light = keepDynamicLight
      ? new THREE.PointLight(coldFlame ? 0x78a8c2 : 0xc98a50, baseIntensity, lightRange, 2.12)
      : null;
    if (light) {
      light.position.copy(flamePosition).add(new THREE.Vector3(0, 0.08, 0));
      root.add(light);
    }
    this.add(root);
    const detachedLight = this.detachFireLight(root, light);
    this.fireEffects.push({
      root,
      flame,
      flameDetails: [core, lean],
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

  private detachFireLight(
    root: THREE.Group,
    light: THREE.PointLight | null,
  ): THREE.PointLight | null {
    if (!light) return null;
    root.updateWorldMatrix(true, true);
    light.getWorldPosition(this.tempPosition);
    light.removeFromParent();
    light.position.copy(this.tempPosition);
    light.visible = true;
    this.add(light);
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
  private addAtmosphereProps(dungeon: DungeonData): void {
    const random = createSeededRandom(`${dungeon.seed}:atmosphere`);
    this.scatterCobwebs(dungeon, random);
    this.scatterWallDecor(dungeon, random);
    this.scatterBiomeSpriteProps(dungeon);
    this.scatterRoomAtmosphereProps(dungeon, random);
  }

  /** Sparse ceiling shafts: one quiet light cue per large dungeon wing. */
  private addAmbientGodrays(dungeon: DungeonData, mood: DungeonMood): void {
    if (this.decorDensity < 0.18) return;
    const random = createSeededRandom(`${dungeon.seed}:ambient-godrays`);
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
        0.065 + index * 0.012,
      );
      beam.name = `Ambient godray ${index + 1}`;
      beam.position.set(
        center.x + (random.next() - 0.5) * this.tileSize * 0.7,
        this.wallHeight - 0.06,
        center.z + (random.next() - 0.5) * this.tileSize * 0.7,
      );
      beam.rotation.y = random.next() * Math.PI;
      this.ambientBeams.push(beam);
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
    this.group.traverse((object) => {
      if (object instanceof THREE.PointLight) {
        object.color.setHex(biomeTintedLightColor(object.color.getHex(), mood));
      }
      if (!(object instanceof THREE.Mesh) || !signalName.test(object.name)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) tintMaterial(material, lantern, 0.48);
    });
    for (const effect of this.fireEffects) {
      effect.light?.color.copy(lantern);
      const flameMaterial = Array.isArray(effect.flame.material)
        ? effect.flame.material
        : [effect.flame.material];
      for (const material of flameMaterial) tintMaterial(material, lantern, 1);
      for (const detail of effect.flameDetails) {
        if (!(detail instanceof THREE.Mesh)) continue;
        const materials = Array.isArray(detail.material) ? detail.material : [detail.material];
        const tintStrength = detail.userData.preserveWarmCore ? 0.12 : 0.86;
        for (const material of materials) tintMaterial(material, core, tintStrength);
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
    const occupied = new Set<string>([
      ...this.objectOccupiedCells,
      ...this.solidCells.keys(),
      ...this.objectiveClearanceCells,
      ...this.wallSpriteOccupiedCells,
    ]);
    for (const room of dungeon.rooms) {
      if (room.role !== "room") continue;
      const seats = collectRoomWallSeats(dungeon, room).filter(
        (seat) =>
          !occupied.has(`${seat.cell.x},${seat.cell.y}`) &&
          !this.isObjectiveClearanceCell(seat.cell),
      );
      if (seats.length === 0) continue;
      const area = room.width * room.height;
      const count = Math.min(
        3,
        Math.max(1, Math.round((area / 42) * this.decorDensity * profile.wallDecorDensity)),
      );
      const selected = pickSeparatedWallSeats(seats, count, dungeon.seedHash + room.id * 41);
      selected.forEach((seat, index) => {
        const key = `${seat.cell.x},${seat.cell.y}`;
        occupied.add(key);
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
    const definitions = BIOME_SPRITE_PROPS[this.activeMood.id];
    const wallDefinitions = definitions.filter(
      (definition) => definition.placement === "wall-decal",
    );
    const floorDefinitions = definitions.filter((definition) => definition.surface === "floor");
    const floorDecalDefinitions = floorDefinitions.filter(
      (definition) => definition.placement === "floor-decal",
    );
    const floorStandingDefinitions = floorDefinitions.filter(
      (definition) => definition.placement === "floor-standing",
    );
    const cornerDefinitions = floorDefinitions.filter(
      (definition) => definition.placement === "corner-standing",
    );
    const floorRenderableDefinitions = floorDefinitions.filter(
      (definition) => definition.placement !== "corner-standing",
    );
    const chooseDefinition = (
      candidates: readonly BiomeSpritePropDefinition[],
      roomId: number,
      index: number,
    ): BiomeSpritePropDefinition =>
      candidates[
        (roomId * 17 + index + Math.floor(random.next() * candidates.length)) % candidates.length
      ]!;
    const occupied = new Set<string>([
      ...this.objectOccupiedCells,
      ...this.solidCells.keys(),
      ...this.objectiveClearanceCells,
      ...this.wallSpriteOccupiedCells,
    ]);
    const wallPlacements: Array<{
      seat: ReturnType<typeof collectRoomWallSeats>[number];
      definition: BiomeSpritePropDefinition;
    }> = [];
    const cornerPlacements: Array<{
      seat: DungeonCornerSeat;
      definition: BiomeSpritePropDefinition;
    }> = [];
    const floorPlacements: Array<{
      cell: GridCell;
      definition: BiomeSpritePropDefinition;
    }> = [];

    for (const room of dungeon.rooms) {
      if (room.role !== "room") continue;
      const area = room.width * room.height;
      const wallSeats = collectRoomWallSeats(dungeon, room).filter(
        (seat) => !occupied.has(`${seat.cell.x},${seat.cell.y}`),
      );
      const wallCount = Math.min(
        2,
        Math.max(1, Math.round((area / 68) * this.decorDensity * profile.wallDecorDensity)),
      );
      for (const [index, seat] of pickSeparatedWallSeats(
        wallSeats,
        wallCount,
        dungeon.seedHash + room.id * 67,
      ).entries()) {
        const key = `${seat.cell.x},${seat.cell.y}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        this.reserveWallObjectCell(seat.cell);
        wallPlacements.push({
          seat,
          definition: chooseDefinition(wallDefinitions, room.id, index),
        });
      }

      const floorCount = Math.min(
        2,
        Math.max(1, Math.round((area / 78) * this.decorDensity * profile.wallDecorDensity)),
      );
      const cornerSeats = collectRoomCornerSeats(dungeon, room).filter(
        (seat) => !occupied.has(`${seat.cell.x},${seat.cell.y}`),
      );
      const cornerCount =
        cornerDefinitions.length > 0 &&
        cornerSeats.length > 0 &&
        (floorCount > 1 || room.id % 3 === 0)
          ? 1
          : 0;
      const cornerCellKeys = new Set<string>();
      for (const [index, seat] of pickSeparatedWallSeats(
        cornerSeats,
        cornerCount,
        dungeon.seedHash + room.id * 73,
      ).entries()) {
        const key = `${seat.cell.x},${seat.cell.y}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        cornerCellKeys.add(key);
        this.reserveWallObjectCell(seat.cell);
        cornerPlacements.push({
          seat,
          definition: chooseDefinition(cornerDefinitions, room.id, index),
        });
      }

      const floorSeats = collectRoomInteriorSeats(dungeon, room).filter((cell) => {
        const key = `${cell.x},${cell.y}`;
        return !occupied.has(key) && !cornerCellKeys.has(key);
      });
      for (const [index, cell] of pickSpreadSeats(
        floorSeats,
        floorCount - cornerCount,
        dungeon.seedHash + room.id * 71,
      ).entries()) {
        const key = `${cell.x},${cell.y}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        const preferFloorDecal = (room.id + index) % 2 === 0;
        const candidates =
          preferFloorDecal && floorDecalDefinitions.length > 0
            ? floorDecalDefinitions
            : floorStandingDefinitions.length > 0
              ? floorStandingDefinitions
              : floorRenderableDefinitions;
        floorPlacements.push({
          cell,
          definition: chooseDefinition(candidates, room.id, index),
        });
      }
    }

    const maxProps = Math.min(
      48,
      Math.max(8, Math.round(dungeon.rooms.length * 2.8 * this.decorDensity)),
    );
    let added = 0;

    // Batch the three wall frames. The same art and placements now cost at
    // most three draw calls instead of one call per decal.
    const wallBatches = new Map<number, THREE.Matrix4[]>();
    for (const { seat, definition } of wallPlacements) {
      if (added >= maxProps) break;
      const p = gridToWorld(dungeon, seat.cell, this.tileSize);
      const scale = 1.55 * profile.wallDecorScale * (0.92 + random.next() * 0.16);
      const offset = wallHugWorldOffset(
        seat.intoDx,
        seat.intoDy,
        this.tileSize,
        BIOME_WALL_DECAL_OFFSET,
      );
      this.tempPosition.set(p.x + offset.x, 1.72 + random.next() * 0.34, p.z + offset.z);
      this.tempEuler.set(0, facingRotation(seat.intoDx, seat.intoDy), 0, "YXZ");
      this.tempQuaternion.setFromEuler(this.tempEuler);
      this.tempScale.set(scale, scale, scale);
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      const matrices = wallBatches.get(definition.frame) ?? [];
      matrices.push(this.tempMatrix.clone());
      wallBatches.set(definition.frame, matrices);
      added += 1;
    }
    for (const [frame, matrices] of wallBatches) {
      const definition = definitions[frame]!;
      const texture = this.assets.biomeSpriteProp(this.activeMood.id, frame);
      const batch = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1),
        this.getBiomeWallDecalMaterial(frame, texture),
        matrices.length,
      );
      batch.name = `${this.activeMood.label} ${definition.label} wall decal batch`;
      batch.renderOrder = 5;
      batch.castShadow = false;
      batch.receiveShadow = true;
      batch.frustumCulled = false;
      batch.userData.biomeSpriteProp = {
        biome: this.activeMood.id,
        id: definition.id,
        frame,
        surface: "wall",
        placement: definition.placement,
        billboard: "wall-normal",
        distanceLod: "disabled",
        batched: true,
      };
      matrices.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
      batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      batch.instanceMatrix.needsUpdate = true;
      this.add(batch);
    }

    const addFloorSprite = (
      cell: GridCell,
      definition: BiomeSpritePropDefinition,
      corner?: DungeonCornerSeat,
    ): void => {
      if (added >= maxProps) return;
      const texture = this.assets.biomeSpriteProp(this.activeMood.id, definition.frame);
      const p = gridToWorld(dungeon, cell, this.tileSize);
      const isFloorDecal = definition.placement === "floor-decal";
      const isCorner = definition.placement === "corner-standing";
      const scale =
        (isFloorDecal ? 1.18 : isCorner ? 1.22 : 1.34) *
        profile.wallDecorScale *
        (0.92 + random.next() * 0.16);
      const geometry = new THREE.PlaneGeometry(1, 1);
      if (!isFloorDecal) geometry.translate(0, 0.5, 0);
      const material = this.getBiomeFloorSpriteMaterial(
        definition.frame,
        texture,
        definition.placement,
      ).clone();
      material.userData = {
        ...material.userData,
        sharedDungeonMaterial: false,
        biomeSpriteFloorFade: true,
      };
      const sprite = new THREE.Mesh(geometry, material);
      const groundGap = isFloorDecal
        ? 0
        : biomeSpriteFloorGroundGap(this.activeMood.id, definition.frame);
      const baseYaw =
        isCorner && corner
          ? facingRotation(corner.intoDx, corner.intoDy)
          : isFloorDecal
            ? random.next() * Math.PI * 2
            : 0;
      if (isFloorDecal) {
        sprite.position.set(p.x, 0.045, p.z);
        sprite.rotation.order = "YXZ";
        sprite.rotation.x = -Math.PI / 2;
        sprite.rotation.y = baseYaw;
      } else if (isCorner && corner) {
        const offset = cornerHugWorldOffset(corner, this.tileSize, BIOME_CORNER_PROP_INSET);
        sprite.position.set(p.x + offset.x, 0.02 - groundGap * scale, p.z + offset.z);
        sprite.rotation.order = "YXZ";
        sprite.rotation.y = baseYaw;
      } else {
        sprite.position.set(p.x, 0.02 - groundGap * scale, p.z);
      }
      sprite.scale.setScalar(scale);
      sprite.name = `${this.activeMood.label} ${definition.label} ${isFloorDecal ? "floor decal" : isCorner ? "corner card" : "floor card"}`;
      sprite.castShadow = false;
      sprite.receiveShadow = isFloorDecal;
      sprite.renderOrder = isFloorDecal ? 1 : isCorner ? 2 : 3;
      sprite.frustumCulled = false;
      sprite.userData.groundGap = groundGap;
      sprite.userData.biomeSpriteProp = {
        biome: this.activeMood.id,
        id: definition.id,
        frame: definition.frame,
        surface: "floor",
        placement: definition.placement,
        billboard: isFloorDecal
          ? "floor-fixed"
          : isCorner
            ? "yaw-to-player-constrained"
            : "yaw-to-player",
        distanceLod: "disabled",
        ...(isCorner ? { maxWallTurn: BIOME_CORNER_PROP_MAX_TURN } : {}),
      };
      this.floorBiomeSprites.push({
        mesh: sprite,
        material,
        baseOpacity: material.opacity,
        x: sprite.position.x,
        z: sprite.position.z,
        baseYaw,
        placement: definition.placement,
      });
      this.reserveObjectCell(cell);
      this.add(sprite);
      added += 1;
    };

    for (const placement of cornerPlacements) {
      if (added >= maxProps) break;
      addFloorSprite(placement.seat.cell, placement.definition, placement.seat);
    }
    for (const placement of floorPlacements) {
      if (added >= maxProps) break;
      addFloorSprite(placement.cell, placement.definition);
    }
    this.stats.props += added;
  }

  private getBiomeWallDecalMaterial(
    frame: number,
    texture: THREE.Texture,
  ): THREE.MeshStandardMaterial {
    const key = `${this.activeMood.id}:${frame}`;
    const cached = this.biomeWallDecalMaterials.get(key);
    if (cached) return cached;
    const material = createBiomeWallDecalMaterial(texture, this.activeMood);
    material.name = `${this.activeMood.label} biome wall decal ${frame + 1}`;
    this.biomeWallDecalMaterials.set(key, material);
    return material;
  }

  private getBiomeFloorSpriteMaterial(
    frame: number,
    texture: THREE.Texture,
    placement: BiomeSpritePlacement,
  ): THREE.MeshStandardMaterial {
    const key = `${this.activeMood.id}:${frame}:${placement}`;
    const cached = this.biomeFloorSpriteMaterials.get(key);
    if (cached) return cached;
    const material = createBiomeFloorSpriteMaterial(texture, this.activeMood, placement);
    material.name = `${this.activeMood.label} ${placement} biome prop ${frame + 1}`;
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
      const wallSeats = collectRoomWallSeats(dungeon, room);
      const interior = collectRoomInteriorSeats(dungeon, room);
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
            template: (boneTemplate ??= createBonePile(this.materials, profile.boneVariant)),
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
            template: (rubbleTemplate ??= createRubblePile(this.materials, profile.rubbleVariant)),
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
        const cells = this.pickAtmosphereCells(dungeon, wallSeats, interior, count, random);
        if (cells.length > 0) {
          const hangPool =
            profile.hangingKinds.length > 0 ? profile.hangingKinds : [profile.hangingKind];
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
              random.next() < 0.42
                ? profile.hangingKind
                : hangPool[random.integer(0, hangPool.length - 1)]!;
            const style = random.integer(0, 3);
            const lengthScale = lengthScales[random.integer(0, lengthScales.length - 1)]!;
            const key = `${kind}:${style}`;
            let template = hangingTemplates.get(key);
            if (!template) {
              template = createHanging(this.materials, kind, profile.hangingLength, style);
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
  ): Array<{ cell: GridCell }> {
    const pool = [...wallSeats.map((s) => s.cell), ...interior].filter(
      (cell) =>
        !isProtectedTraversalCell(dungeon, cell) &&
        !this.isObjectiveClearanceCell(cell) &&
        !this.isObjectOccupiedCell(cell),
    );
    const picked: GridCell[] = [];
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = random.integer(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    for (const cell of shuffled) {
      if (picked.length >= count) break;
      if (picked.some((p) => Math.max(Math.abs(p.x - cell.x), Math.abs(p.y - cell.y)) < 2))
        continue;
      picked.push(cell);
      this.reserveObjectCell(cell);
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
      const templateBatches = createStaticPropTemplateBatches(template);
      disposeTemplateGeometries(template);
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

  private addMarkers(dungeon: DungeonData, mood: DungeonMood): void {
    const entrance = gridToWorld(dungeon, dungeon.spawn, this.tileSize);
    const exit = gridToWorld(dungeon, dungeon.exit, this.tileSize);
    this.exitPosition.set(exit.x, 0, exit.z);

    const entranceRing = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.66, 8), this.materials.iron);
    entranceRing.rotation.x = -Math.PI / 2;
    entranceRing.position.set(entrance.x, 0.02, entrance.z);
    const entranceLight = new THREE.PointLight(0x777b7c, 7, 9, 2.4);
    entranceLight.position.set(entrance.x, 1.7, entrance.z);

    const finalFloor = !dungeon.floor || dungeon.floor.index === dungeon.floor.count - 1;
    if (!finalFloor) {
      this.add(entranceRing, entranceLight);
      return;
    }

    // Complete biome portal: full arch aperture, distinct frame/signature/seal,
    // profile-driven vortex and isolated materials for every dungeon mood.
    const magicPortal = createBiomeMagicPortal(mood.id, this.materials);
    const portal = magicPortal.root;
    portal.position.set(exit.x, 0, exit.z);
    portal.rotation.y = magicPortalApproachYaw(dungeon);
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

  private addStaircases(dungeon: DungeonData): void {
    for (const stair of dungeon.floor?.stairs ?? []) {
      const position = gridToWorld(dungeon, stair.cell, this.tileSize);
      const root = createDungeonStaircase(stair.direction, this.materials, this.tileSize);
      root.position.set(position.x, 0, position.z);
      root.rotation.y = stair.yaw;
      root.userData.stairId = stair.id;
      root.userData.targetFloor = stair.targetFloor;
      this.add(root);
      this.handles.staircases.push({
        root,
        direction: stair.direction,
        targetFloor: stair.targetFloor,
        cell: { ...stair.cell },
      });
      this.objectiveClearanceCells.add(`${stair.cell.x},${stair.cell.y}`);
      this.stats.props += DUNGEON_STAIR_STEP_COUNT;
    }
  }

  private addStaticObjectives(
    dungeon: DungeonData,
    stonePlacements: readonly MagicStonePlacement[],
  ): void {
    const rankedRooms = dungeon.rooms
      .filter((room) => room.role === "room")
      .sort((left, right) => roomDistance(dungeon, left) - roomDistance(dungeon, right));
    // Shared editor/runtime placement keeps objective diamonds tied to the real rooms.
    const stoneRooms = stonePlacements.map((placement) => placement.room);
    stonePlacements.forEach((placement) => {
      const { stoneId } = placement;
      const stone = createMagicStone(stoneId, this.materials, this.stoneTextures.get(stoneId));
      preparePickupOpacity(stone.root);
      const p = gridToWorld(dungeon, placement.cell, this.tileSize);
      stone.root.position.set(p.x + placement.offsetX, 0, p.z + placement.offsetZ);
      this.pickups.push({
        kind: "stone",
        stoneId,
        object: stone.root,
        collected: false,
        collectTime: 0,
        available: true,
        revealTime: 1,
        baseY: 0,
        baseScale: new THREE.Vector3(1, 1, 1),
        stoneSignal: {
          light: stone.light,
          glow: stone.glow,
          crown: stone.crown,
          baseLightIntensity: stone.baseLightIntensity,
          baseGlowOpacity: stone.baseGlowOpacity,
        },
      });
      const beam = createVolumetricBeam(stone.emissive, 3.8, 0.78, 0.2);
      beam.position.set(stone.root.position.x, this.wallHeight - 0.03, stone.root.position.z);
      beam.name = `${stoneId} magic stone beacon`;
      this.stoneBeams.push(beam);
      // PointLight stays parented to the pickup so its world position follows the stone.
      this.add(stone.root, beam);
      this.stats.beams += 1;
    });

    const stoneRoomSet = new Set(stoneRooms);

    const pickupExcluded = new Set([
      ...this.objectOccupiedCells,
      ...this.solidCells.keys(),
      ...this.wallSpriteOccupiedCells,
      ...this.hazardCells,
      ...this.objectiveClearanceCells,
      ...stonePlacements.map((placement) => `${placement.cell.x},${placement.cell.y}`),
    ]);
    // Power chests: two time-freeze + two wards + one annihilation pulse, spread along route
    // depth so pressure relief is not stacked in one wing of the map.
    const usedPowerRooms = new Set<DungeonRoom>();
    const placePowerChest = (
      rewardKind: Exclude<ChestRewardKind, "resolve">,
      depthFraction: number,
      salt: number,
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
      const seats = collectRoomInteriorSeats(dungeon, room).filter(
        (seat) =>
          !pickupExcluded.has(`${seat.x},${seat.y}`) && !isProtectedTraversalCell(dungeon, seat),
      );
      cell =
        pickSpreadSeats(seats, 1, dungeon.seedHash + room.id * salt)[0] ??
        findNearestPropCell(dungeon, room.center, pickupExcluded, 8);
      if (!cell) {
        for (let y = 0; y < dungeon.height && !cell; y += 1) {
          for (let x = 0; x < dungeon.width; x += 1) {
            const candidate = { x, y };
            if (dungeon.grid[y]?.[x] !== FLOOR) continue;
            if (pickupExcluded.has(`${x},${y}`) || isProtectedTraversalCell(dungeon, candidate)) {
              continue;
            }
            cell = candidate;
            break;
          }
        }
      }
      if (!cell) return;

      usedPowerRooms.add(room);
      pickupExcluded.add(`${cell.x},${cell.y}`);
      this.objectiveClearanceCells.add(`${cell.x},${cell.y}`);
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
      );
    };

    for (const fraction of [0.28, 0.72] as const) {
      placePowerChest("time-freeze", fraction, 43);
    }
    placePowerChest("map", 0.18, 37);
    placePowerChest("mobility", 0.54, 53);
    for (const fraction of [0.42, 0.88] as const) {
      placePowerChest("luminous-ward", fraction, 61);
    }
    placePowerChest("annihilation-pulse", 0.64, 83);

    // Place the classic bonus chests (health flasks) before enemy seats are
    // planned. Their reservations then participate in both distributed and
    // authored spawns. Cap is intentionally a bit generous so runs stay
    // recoverable under pressure.
    if (!dungeon.forge) {
      rankedRooms
        .filter((room) => !stoneRoomSet.has(room))
        .filter((_, index) => index % 3 === 0)
        .slice(0, 5)
        .forEach((room) => {
          const candidates = collectRoomInteriorSeats(dungeon, room).filter(
            (cell) =>
              !this.isObjectOccupiedCell(cell) &&
              !this.objectiveClearanceCells.has(`${cell.x},${cell.y}`) &&
              !isProtectedTraversalCell(dungeon, cell),
          );
          const cell = pickSpreadSeats(candidates, 1, dungeon.seedHash + room.id * 29)[0];
          if (!cell) return;
          this.addInteractiveChest(dungeon, {
            kind: "chest",
            x: cell.x,
            y: cell.y,
            roomId: room.id,
            rot: ((room.id + dungeon.seedHash) % 4) * (Math.PI / 2),
            scale: 0.92,
            v: room.id % 3,
          });
          pickupExcluded.add(`${cell.x},${cell.y}`);
        });
    }
  }

  private addForgeLiquids(dungeon: DungeonData): void {
    this.liquidKit = createLiquidSectionKit(dungeon, this.materials, this.tileSize);
    if (!this.liquidKit) return;
    this.add(this.liquidKit.root);
    this.stats.props += this.liquidKit.stats.cells + this.liquidKit.stats.boundaryEdges;
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

/** Shared radial pool texture for fake light pooling under wall fires. */
let torchFloorPoolTexture: THREE.Texture | null = null;
function getTorchFloorPoolTexture(): THREE.Texture {
  if (torchFloorPoolTexture) return torchFloorPoolTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) {
    torchFloorPoolTexture = new THREE.Texture();
    return torchFloorPoolTexture;
  }
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 63);
  gradient.addColorStop(0, "rgba(255, 196, 128, 0.5)");
  gradient.addColorStop(0.42, "rgba(214, 148, 84, 0.22)");
  gradient.addColorStop(1, "rgba(120, 70, 34, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  torchFloorPoolTexture = new THREE.CanvasTexture(canvas);
  torchFloorPoolTexture.colorSpace = THREE.SRGBColorSpace;
  return torchFloorPoolTexture;
}

let staticContactShadowTexture: THREE.Texture | null = null;
function getStaticContactShadowTexture(): THREE.Texture {
  if (staticContactShadowTexture) return staticContactShadowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (!context) {
    staticContactShadowTexture = new THREE.Texture();
    return staticContactShadowTexture;
  }
  const gradient = context.createRadialGradient(48, 48, 4, 48, 48, 47);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0.62)");
  gradient.addColorStop(0.54, "rgba(0, 0, 0, 0.28)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);
  staticContactShadowTexture = new THREE.CanvasTexture(canvas);
  staticContactShadowTexture.colorSpace = THREE.SRGBColorSpace;
  return staticContactShadowTexture;
}

/** Cheap warm pool where torchlight lands on the floor — sells range without a real shadow pass. */
function createTorchFloorPool(position: THREE.Vector3, facing: THREE.Vector3): THREE.Mesh {
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, 20),
    new THREE.MeshBasicMaterial({
      map: getTorchFloorPoolTexture(),
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

function makeInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  position: THREE.Vector3Like,
  scale: THREE.Vector3Like = { x: 1, y: 1, z: 1 },
  quaternion: THREE.Quaternion = new THREE.Quaternion(),
): void {
  const matrix = new THREE.Matrix4();
  matrix.compose(
    new THREE.Vector3(position.x, position.y, position.z),
    quaternion,
    new THREE.Vector3(scale.x, scale.y, scale.z),
  );
  mesh.setMatrixAt(index, matrix);
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
    opacity,
    alphaTest: opacity < 1 ? 0.16 : 0.1,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: THREE.MathUtils.clamp(roughness, 0.78, 1),
    metalness: 0,
    envMapIntensity: THREE.MathUtils.clamp(mood.environmentIntensity * 1.1, 0.08, 0.32),
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  // Keep the sprite planar. Depth remains available for later parallax work.
  material.normalScale.set(0.24, 0.24);
  material.onBeforeCompile = muteBiomePropShader;
  material.customProgramCacheKey = () => "environment-sprite-muted-v2";
  material.userData.depthTexture = textures.depth;
  material.userData.wallSpritePbr = true;
  material.userData.environmentSpriteTreatment = "muted-biome-v2";
  return material;
}

function muteBiomePropShader(shader: { fragmentShader: string }): void {
  const mapChunk = "#include <map_fragment>";
  if (!shader.fragmentShader.includes(mapChunk)) return;
  shader.fragmentShader = shader.fragmentShader.replace(
    mapChunk,
    `${mapChunk}
      float biomePropLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb = mix(vec3(biomePropLuma), diffuseColor.rgb, 0.38);
      diffuseColor.rgb *= 0.78;`,
  );
}

function biomePropTint(mood: DungeonMood): THREE.Color {
  return new THREE.Color(mood.surfaceTint).lerp(new THREE.Color(0xffffff), 0.58);
}

/** Lit wall decal material. The shared flag keeps rebuilds from disposing cached maps. */
function createBiomeWallDecalMaterial(
  texture: THREE.Texture,
  mood: DungeonMood,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: biomePropTint(mood),
    transparent: true,
    opacity: 0.76,
    alphaTest: 0.12,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
    roughness: 0.96,
    metalness: 0,
    fog: true,
  });
  material.toneMapped = true;
  material.onBeforeCompile = muteBiomePropShader;
  material.customProgramCacheKey = () => "biome-prop-wall-decal-muted-v3";
  material.userData.sharedDungeonMaterial = true;
  material.userData.biomeSpriteWallDecal = true;
  material.userData.saturation = 0.38;
  material.userData.brightness = 0.78;
  material.userData.mapBlend = "wall-muted-alpha";
  return material;
}

/** Lit floor sprite plane; its orientation depends on the authored placement. */
function createBiomeFloorSpriteMaterial(
  texture: THREE.Texture,
  mood: DungeonMood,
  placement: BiomeSpritePlacement,
): THREE.MeshStandardMaterial {
  const isFloorDecal = placement === "floor-decal";
  const isCorner = placement === "corner-standing";
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: biomePropTint(mood),
    transparent: true,
    opacity: isFloorDecal ? 0.56 : isCorner ? 0.72 : 0.76,
    alphaTest: isFloorDecal ? 0.08 : 0.12,
    depthWrite: false,
    depthTest: true,
    polygonOffset: isFloorDecal,
    polygonOffsetFactor: isFloorDecal ? -3 : 0,
    polygonOffsetUnits: isFloorDecal ? -3 : 0,
    side: THREE.DoubleSide,
    roughness: isFloorDecal ? 1 : 0.98,
    metalness: 0,
    envMapIntensity: 0.08,
    fog: true,
  });
  material.toneMapped = true;
  material.onBeforeCompile = muteBiomePropShader;
  material.customProgramCacheKey = () => `biome-prop-floor-${placement}-muted-v3`;
  material.userData.sharedDungeonMaterial = true;
  material.userData.biomeSpritePlacement = placement;
  material.userData.biomeSpriteBillboard =
    placement === "floor-decal" ? "floor-fixed" : "yaw-to-player";
  material.userData.saturation = 0.38;
  material.userData.brightness = 0.78;
  material.userData.mapBlend = isFloorDecal ? "floor-contact-alpha" : "floor-muted-alpha";
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

/**
 * Bake a static prop template into as few instanced parts as its materials allow.
 * Creation maps may reuse hundreds of props; one draw per source mesh caused the
 * full-width play view to exceed 600 calls even though the props were instanced.
 */
export function createStaticPropTemplateBatches(
  template: THREE.Object3D,
): StaticPropTemplateBatch[] {
  template.updateMatrixWorld(true);
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

export const CHEST_INTERACTION_DISTANCE = 1.9;
/** Default pickup grab radius (health flasks, power rewards). */
export const PICKUP_COLLECTION_DISTANCE = 1.18;
/** Magic stones get a wider grab so dense props near the seat cannot softlock a run. */
export const STONE_COLLECTION_DISTANCE = 1.55;
export type ChestRewardKind =
  | "resolve"
  | "time-freeze"
  | "luminous-ward"
  | "annihilation-pulse"
  | "map"
  | "mobility";

export function canInteractWithChest(distance: number, opened: boolean): boolean {
  return !opened && Number.isFinite(distance) && distance <= CHEST_INTERACTION_DISTANCE;
}

export function chestRewardAutoActivates(kind: ChestRewardKind): boolean {
  return kind !== "resolve";
}

export function canCollectPickup(
  distance: number,
  autoCollect = false,
  kind: StaticPickupKind | "other" = "other",
): boolean {
  if (autoCollect) return true;
  if (!Number.isFinite(distance)) return false;
  const limit = kind === "stone" ? STONE_COLLECTION_DISTANCE : PICKUP_COLLECTION_DISTANCE;
  return distance <= limit;
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
