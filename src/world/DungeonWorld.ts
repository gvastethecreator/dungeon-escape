import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { CreatureVoice, DungeonAudioFrame } from "../audio/GameAudio";
import { createSeededRandom } from "../core/random";
import { FLOOR, WALL } from "../dungeon/generateDungeon";
import { gridToWorld, worldToGrid, type WorldCollider } from "../dungeon/gridCollision";
import type { DungeonData, DungeonRoom, ForgePropMetadata, GridCell } from "../dungeon/types";
import { AssetLibrary } from "./AssetLibrary";
import {
  ENEMY_ANIMATIONS,
  ENEMY_ROSTER,
  enemyAnimationFrameIndex,
  type EnemyAnimationDefinition,
} from "./EnemySpriteAtlas";
import { selectEnemyKindsForSpawns } from "./EnemySpawnPlan";
import { createVolumetricBeam, tickVolumetricBeamTime } from "./VolumetricBeam";
import { createFloorCampfire } from "./FloorCampfireFactory";
import { createWallLantern, createWallTorch } from "./WallTorchFactory";
import {
  applyBiomeMapsToDungeonMaterials,
  applyMoodToDungeonMaterials,
  createDungeonMaterials,
  disposeDungeonMaterials,
} from "./MaterialLibrary";
import { createDungeonArch, createDungeonDoor, doorwayPlacement } from "./DoorFactory";
import { createDungeonProp, propFamiliesForTheme } from "./DungeonPropKit";
import { roomTheme } from "./RoomArtDirection";
import {
  applyBiomeMaps,
  applyMoodToSurfaceMaterials,
  createRoomSurfaceMaterials,
  disposeRoomSurfaceMaterials,
  type SurfaceTheme,
} from "./RoomSurfaceMaterials";
import { createForgeChest, createForgeProp, getForgePropScale } from "./ForgePropFactory";
import { createResolveFlask, setPickupOpacity } from "./ItemFactory";
import {
  createCobwebGeometry,
  createCobwebMaterial,
  createBonePile,
  createHanging,
  createRubblePile,
} from "./AtmospherePropsKit";
import {
  ENEMY_ARCHETYPES,
  enemyGroundY,
  isLowProfileEnemy,
  type EnemyKind,
} from "./EnemyArchetypes";
import { computeTorchLod } from "./TorchLod";
import {
  createEnemyBillboardMaterial,
  createEnemyContactShadowMaterial,
  disposeEnemyContactShadowMaterial,
  setEnemyBillboardFrame,
} from "./EnemyBillboardMaterial";
import type { DungeonMood } from "../systems/DungeonMood";
import { getDungeonMood } from "../systems/DungeonMood";
import { FIRE_LIGHT_TUNING, MAX_DYNAMIC_FIRE_LIGHTS } from "../systems/LightTuning";
import { hasGridLineOfSight } from "./LightOcclusion";
import {
  collectRoomInteriorSeats,
  collectRoomWallSeats,
  facingRotation,
  findNearestPropCell,
  FLOOR_FURNITURE_KINDS,
  isProtectedTraversalCell,
  pickSpreadSeats,
  WALL_HUGGING_KINDS,
  wallHugWorldOffset,
} from "./PropPlacement";
import { createMagicStone, magicStoneIds } from "./MagicStoneKit";
import {
  magicStoneClearanceCells,
  selectMagicStonePlacements,
  type MagicStonePlacement,
} from "./MagicStonePlacement";
import type { StoneId } from "../ui/copy";
import { STONE_ORDER } from "../ui/copy";
import type { MinimapCell, MinimapFeatures } from "../ui/minimapFeatures";
import { selectDistributedTorchIndices } from "./TorchDistribution";
import { tickEnemySim, type EnemySimBody } from "./EnemySim";
import { WORLD_TILE_SIZE, WORLD_WALL_HEIGHT } from "./WorldMetrics";
import {
  createLiquidSectionKit,
  disposeLiquidSectionKit,
  tickLiquidSections,
  type LiquidSectionKit,
} from "./LiquidSectionKit";
import { createSpecialRoomSignals } from "./SpecialRoomSignalKit";
import { getBiomeDecorationProfile } from "./BiomeDecorationProfile";

export { knockbackAwayFrom } from "./knockback";

const CARDINAL_NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

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

interface EnemyActor {
  kind: EnemyKind;
  position: THREE.Vector3;
  batch: THREE.InstancedMesh;
  shadowBatch: THREE.InstancedMesh;
  instanceIndex: number;
  shadowInstanceIndex: number;
  hitCooldown: number;
  baseY: number;
  baseScale: THREE.Vector2;
  phase: number;
  attackPulse: number;
  scaleX: number;
  scaleY: number;
  roll: number;
  phaseEpoch: number;
  phaseVisibility: number;
  moving: boolean;
  visibilityAttribute: THREE.InstancedBufferAttribute;
  /** Threat tier 0-3; drives minimap marker size. */
  tier: number;
}

interface EnemyAnimationBatch {
  kind: EnemyKind;
  material: THREE.MeshStandardMaterial;
  animation: EnemyAnimationDefinition;
  frame: number;
  phaseOffset: number;
}

interface DoorActor {
  root: THREE.Group;
  left: THREE.Group;
  right: THREE.Group;
  openness: number;
  targetOpen: boolean;
}

interface PickupActor {
  kind: "stone" | "resolve";
  stoneId?: StoneId;
  object: THREE.Object3D;
  collected: boolean;
  collectTime: number;
  available: boolean;
  revealTime: number;
  baseY: number;
  baseScale: THREE.Vector3;
  stoneSignal?: {
    light: THREE.PointLight;
    glow: THREE.Mesh;
    crown: THREE.Mesh;
    baseLightIntensity: number;
    baseGlowOpacity: number;
  };
}

interface ChestActor {
  id: string;
  root: THREE.Group;
  lid: THREE.Group;
  potion: PickupActor;
  opened: boolean;
  openness: number;
}

interface PickupBurst {
  root: THREE.Group;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  sparks: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  age: number;
  duration: number;
}

interface FireEffect {
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
  /** Cached line-of-sight; refreshed on a throttle to cut grid ray cost. */
  losOpen: boolean;
  losAge: number;
  /** Fluorescent fixtures share light LOD without emitting fire crackle. */
  audio?: boolean;
}

export interface WorldUpdate {
  /** @deprecated use collectedStoneId — kept for domain bridge “all stones” */
  collectedRelic: boolean;
  collectedStoneId: StoneId | null;
  /** Position is kept for the presentation layer that plays the collection source. */
  collectedPickup: {
    kind: "stone" | "resolve";
    position: { x: number; y: number; z: number };
  } | null;
  stonesFound: number;
  stonesTotal: number;
  portalOpen: boolean;
  resolveGain: number;
  damage: number;
  damageSource: {
    position: { x: number; y: number; z: number };
    voice: CreatureVoice;
  } | null;
  doorSound: {
    kind: "open" | "close";
    position: { x: number; y: number; z: number };
  } | null;
  chestSound: { position: { x: number; y: number; z: number } } | null;
  interactionPrompt: "open-chest" | null;
  /** Unit XZ push away from the attacker(s); null when no hit this frame. */
  knockback: { x: number; z: number } | null;
  reachedLockedExit: boolean;
  reachedOpenExit: boolean;
  nearestThreat: number | null;
}

export function creatureVoiceForEnemy(kind: EnemyKind): CreatureVoice {
  if (kind === "ghost" || kind === "white-eyed-shadow") return "spectral";
  if (kind === "zombie-orc" || kind === "husk") return "undead";
  if (kind === "ratling") return "vermin";
  if (kind === "spider") return "insect";
  if (kind === "bone-slime") return "ooze";
  if (kind === "imp") return "demon";
  return "beast";
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

/** One beveled-looking picture frame merged into a single support geometry. */
function createPictureFrameGeometry(width: number, height: number): THREE.BufferGeometry {
  const rail = Math.min(width, height) * 0.035;
  const depth = 0.055;
  const parts = [
    new THREE.BoxGeometry(width + rail * 2, rail, depth).translate(0, height / 2 + rail / 2, 0),
    new THREE.BoxGeometry(width + rail * 2, rail, depth).translate(0, -height / 2 - rail / 2, 0),
    new THREE.BoxGeometry(rail, height, depth).translate(-width / 2 - rail / 2, 0, 0),
    new THREE.BoxGeometry(rail, height, depth).translate(width / 2 + rail / 2, 0, 0),
  ];
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => {
    if (part !== merged) part.dispose();
  });
  return merged ?? new THREE.BoxGeometry(width + rail * 2, height + rail * 2, depth);
}

function transformedGeometry(
  geometry: THREE.BufferGeometry,
  position: THREE.Vector3Like,
  rotation: THREE.Euler = new THREE.Euler(),
  scale: THREE.Vector3Like = { x: 1, y: 1, z: 1 },
): THREE.BufferGeometry {
  return geometry.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(position.x, position.y, position.z),
      new THREE.Quaternion().setFromEuler(rotation),
      new THREE.Vector3(scale.x, scale.y, scale.z),
    ),
  );
}

function mergePropGeometry(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => {
    if (part !== merged) part.dispose();
  });
  return merged ?? new THREE.BoxGeometry(0.1, 0.1, 0.1);
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

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const material of materials)
      if (!material.userData.sharedDungeonMaterial) material.dispose();
  });
}

function roomDistance(dungeon: DungeonData, room: DungeonRoom): number {
  return dungeon.distances[room.center.y * dungeon.width + room.center.x] ?? -1;
}

function horizontalDistance(left: THREE.Vector3, right: THREE.Vector3): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

export const CHEST_INTERACTION_DISTANCE = 1.9;

export function canInteractWithChest(distance: number, opened: boolean): boolean {
  return !opened && Number.isFinite(distance) && distance <= CHEST_INTERACTION_DISTANCE;
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

export class DungeonWorld {
  readonly stats = {
    floorTiles: 0,
    wallTiles: 0,
    ceilingTiles: 0,
    enemies: 0,
    pickups: 0,
    beams: 0,
    lights: 0,
    props: 0,
  };
  private readonly scene: THREE.Scene;
  private readonly tileSize: number;
  private readonly wallHeight: number;
  private readonly group = new THREE.Group();
  private readonly assets = new AssetLibrary();
  private readonly materials = createDungeonMaterials({
    compact: typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches,
  });
  private readonly surfaceMaterials = createRoomSurfaceMaterials({
    floor: this.assets.floor,
    wall: this.assets.wall,
    ceiling: this.assets.ceiling,
    semanticFloors: {
      grave: this.assets.floorCrypt,
      shrine: this.assets.floorShrine,
      treasure: this.assets.floorTreasure,
      boss: this.assets.floorBoss,
    },
    semanticWalls: {
      grave: this.assets.wallCrypt,
      shrine: this.assets.wallShrine,
      treasure: this.assets.wallTreasure,
      elite: this.assets.wallBoss,
      boss: this.assets.wallBoss,
    },
  });
  private readonly enemies: EnemyActor[] = [];
  private readonly enemyBatches = new Set<THREE.InstancedMesh>();
  private readonly enemyShadowBatches = new Set<THREE.InstancedMesh>();
  private readonly enemyVisibilityAttributes = new Set<THREE.InstancedBufferAttribute>();
  private readonly enemyAnimationBatches = new Map<EnemyKind, EnemyAnimationBatch>();
  private readonly movingEnemyKinds = new Set<EnemyKind>();
  private readonly enemyShadowMaterial = createEnemyContactShadowMaterial();
  private readonly doors: DoorActor[] = [];
  private readonly pickups: PickupActor[] = [];
  private readonly chests: ChestActor[] = [];
  private readonly pickupBursts: PickupBurst[] = [];
  private readonly fireEffects: FireEffect[] = [];
  private dynamicFireLightCount = 0;
  private readonly solidCells = new Map<string, GridCell>();
  private readonly solidColliders: WorldCollider[] = [];
  private readonly objectiveClearanceCells = new Set<string>();
  private readonly staticContactShadowPlacements: Array<{
    x: number;
    z: number;
    width: number;
    depth: number;
  }> = [];
  private readonly exitPosition = new THREE.Vector3();
  private dungeon: DungeonData | null = null;
  private readonly collectedStones = new Set<StoneId>();
  private portalOpen = false;
  private portalRoot: THREE.Group | null = null;
  private portalBeam: THREE.Mesh | null = null;
  private portalLight: THREE.PointLight | null = null;
  private readonly stoneBeams: THREE.Mesh[] = [];
  private liquidKit: LiquidSectionKit | null = null;
  private readonly audioFrame: DungeonAudioFrame = {
    fires: [],
    magicStones: [],
    enemies: [],
    portal: null,
  };
  private lockedExitCooldown = 0;
  private elapsed = 0;
  private enemyAnimationElapsed = 0;
  private readonly stoneTextures = new Map<StoneId, THREE.Texture>();
  private activeMood: DungeonMood = getDungeonMood("ash");
  private decorDensity = 0.6;
  private enemyDensity = 0.5;
  private readonly tempPosition = new THREE.Vector3();
  private readonly tempScale = new THREE.Vector3();
  private readonly tempQuaternion = new THREE.Quaternion();
  private readonly tempEuler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly tempMatrix = new THREE.Matrix4();
  private readonly tempAxisX = new THREE.Vector3(1, 0, 0);

  constructor(
    scene: THREE.Scene,
    { tileSize = WORLD_TILE_SIZE, wallHeight = WORLD_WALL_HEIGHT } = {},
  ) {
    this.scene = scene;
    this.tileSize = tileSize;
    this.wallHeight = wallHeight;
    this.group.name = "Dungeon Escape world";
    this.scene.add(this.group);
  }

  setDungeon(dungeon: DungeonData, mood: DungeonMood = getDungeonMood("ash")): void {
    this.clear();
    this.dungeon = dungeon;
    this.activeMood = mood;
    this.collectedStones.clear();
    this.portalOpen = false;
    this.lockedExitCooldown = 0;
    this.elapsed = 0;
    this.enemyAnimationElapsed = 0;
    this.ensureStoneTextures();
    const biomeSurfaces = this.assets.getBiomeSurfaces(mood.id);
    applyBiomeMaps(this.surfaceMaterials, biomeSurfaces, mood.id);
    applyBiomeMapsToDungeonMaterials(this.materials, biomeSurfaces, mood.id);
    // Tint for room variation + albedoGain for bright biome maps (frost ice ~2×).
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
    const stonePlacements = selectMagicStonePlacements(dungeon);
    for (const cell of magicStoneClearanceCells(dungeon, stonePlacements))
      this.objectiveClearanceCells.add(`${cell.x},${cell.y}`);
    const floorCells: GridCell[] = [];
    for (let y = 0; y < dungeon.height; y += 1) {
      for (let x = 0; x < dungeon.width; x += 1)
        if (dungeon.grid[y]?.[x] === FLOOR) floorCells.push({ x, y });
    }
    const wallCells = collectBoundaryWalls(dungeon);
    this.addArchitecture(dungeon, floorCells, wallCells);
    if (!dungeon.forge) this.addCaveProps(dungeon);
    this.addDoorsAndRoomProps(dungeon);
    this.commitStaticContactShadows();
    const specialSignals = createSpecialRoomSignals(dungeon, this.materials, this.tileSize);
    if (specialSignals) {
      this.group.add(specialSignals);
      this.stats.props += specialSignals.children.length;
    }
    this.addLightProps(dungeon);
    this.addAtmosphereProps(dungeon);
    this.addMarkers(dungeon);
    this.addActors(dungeon, stonePlacements);
    this.applyMoodToPracticalLights(mood);
    this.stats.floorTiles = floorCells.length;
    this.stats.wallTiles = wallCells.length;
    this.stats.ceilingTiles = floorCells.length;
    this.stats.enemies = this.enemies.length;
    this.stats.pickups = this.pickups.length;
  }

  setDecorDensity(value: number): void {
    this.decorDensity = THREE.MathUtils.clamp(value, 0, 1);
  }
  setEnemyDensity(value: number): void {
    this.enemyDensity = THREE.MathUtils.clamp(value, 0, 1);
  }

  private isObjectiveClearanceCell(cell: GridCell): boolean {
    return this.objectiveClearanceCells.has(`${cell.x},${cell.y}`);
  }

  update(
    delta: number,
    player: THREE.Vector3,
    atExit: boolean,
    interactPressed = false,
  ): WorldUpdate {
    this.lockedExitCooldown = Math.max(0, this.lockedExitCooldown - delta);
    this.enemyAnimationElapsed += Math.max(0, delta);
    let resolveGain = 0;
    let collectedStoneId: StoneId | null = null;
    let collectedPickup: WorldUpdate["collectedPickup"] = null;
    let doorSound: WorldUpdate["doorSound"] = null;
    let chestSound: WorldUpdate["chestSound"] = null;
    let interactionPrompt: WorldUpdate["interactionPrompt"] = null;

    // Combat + locomotion (sim) separate from instanced matrix writes (view).
    const sim = tickEnemySim(this.enemies as EnemySimBody[], {
      delta,
      elapsed: this.elapsed,
      player,
      dungeon: this.dungeon,
      solidColliders: this.solidColliders,
      tileSize: this.tileSize,
    });
    const damage = sim.damage;
    const nearestThreat = sim.nearestThreat;
    const knockX = sim.knockX;
    const knockZ = sim.knockZ;
    const knockHits = sim.knockHits;
    const damageSource: WorldUpdate["damageSource"] = sim.attacker
      ? {
          position: {
            x: sim.attacker.position.x,
            y: sim.attacker.position.y,
            z: sim.attacker.position.z,
          },
          voice: creatureVoiceForEnemy(sim.attacker.kind),
        }
      : null;
    this.updateEnemyAnimationFrames();

    for (const enemy of this.enemies) {
      const archetype = ENEMY_ARCHETYPES[enemy.kind];
      const yaw = Math.atan2(player.x - enemy.position.x, player.z - enemy.position.z);
      this.tempEuler.set(0, yaw, enemy.roll);
      this.tempQuaternion.setFromEuler(this.tempEuler);
      this.tempScale.set(enemy.scaleX, enemy.scaleY, 1);
      enemy.visibilityAttribute.setX(enemy.instanceIndex, enemy.phaseVisibility);
      enemy.batch.setMatrixAt(
        enemy.instanceIndex,
        this.tempMatrix.compose(enemy.position, this.tempQuaternion, this.tempScale),
      );
      this.tempPosition.set(enemy.position.x, 0.024, enemy.position.z);
      this.tempQuaternion.setFromAxisAngle(this.tempAxisX, -Math.PI / 2);
      const lowBody = isLowProfileEnemy(enemy.kind);
      const contactWidth = archetype.width * (lowBody ? 0.78 : 0.56);
      this.tempScale.set(
        contactWidth * enemy.phaseVisibility,
        contactWidth * (lowBody ? 0.62 : 0.4) * enemy.phaseVisibility,
        1,
      );
      enemy.shadowBatch.setMatrixAt(
        enemy.shadowInstanceIndex,
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale),
      );
    }
    for (const batch of this.enemyBatches) batch.instanceMatrix.needsUpdate = true;
    for (const batch of this.enemyShadowBatches) batch.instanceMatrix.needsUpdate = true;
    for (const attribute of this.enemyVisibilityAttributes) attribute.needsUpdate = true;

    for (const door of this.doors) {
      const distance = horizontalDistance(door.root.position, player);
      const targetOpen =
        distance < ((door.root.userData.openDistance as number) ?? 2.65)
          ? true
          : distance > 3.7
            ? false
            : door.targetOpen;
      if (targetOpen !== door.targetOpen) {
        door.targetOpen = targetOpen;
        if (!doorSound) {
          doorSound = {
            kind: targetOpen ? "open" : "close",
            position: {
              x: door.root.position.x,
              y: door.root.position.y + 1.2,
              z: door.root.position.z,
            },
          };
        }
      }
      const target = door.targetOpen ? 1 : 0;
      door.openness = THREE.MathUtils.damp(
        door.openness,
        target,
        target > door.openness ? 9 : 3.2,
        delta,
      );
      door.left.rotation.y = (door.left.userData.openRotation as number) * door.openness;
      door.right.rotation.y = (door.right.userData.openRotation as number) * door.openness;
      door.root.userData.passable = door.openness > 0.82;
      door.root.userData.closed = door.openness < 0.08;
    }

    let nearestChest: ChestActor | null = null;
    let nearestChestDistance = Number.POSITIVE_INFINITY;
    for (const chest of this.chests) {
      const distance = horizontalDistance(chest.root.position, player);
      if (canInteractWithChest(distance, chest.opened) && distance < nearestChestDistance) {
        nearestChest = chest;
        nearestChestDistance = distance;
      }
      chest.openness = THREE.MathUtils.damp(
        chest.openness,
        chest.opened ? 1 : 0,
        chest.opened ? 7.5 : 5,
        delta,
      );
      chest.lid.rotation.x = -1.18 * chest.openness;
      if (!chest.opened || chest.potion.available || chest.potion.collected) continue;
      chest.potion.revealTime += delta;
      const reveal = THREE.MathUtils.clamp(chest.potion.revealTime / 0.52, 0, 1);
      const eased = 1 - Math.pow(1 - reveal, 3);
      chest.potion.object.visible = true;
      chest.potion.object.position.y = chest.potion.baseY - 0.34 + eased * 0.34;
      chest.potion.object.rotation.y += delta * (2.2 + reveal * 2.4);
      chest.potion.object.scale
        .copy(chest.potion.baseScale)
        .multiplyScalar(0.62 + eased * 0.38 + Math.sin(reveal * Math.PI) * 0.16);
      if (reveal >= 1) {
        chest.potion.available = true;
        chest.potion.object.scale.copy(chest.potion.baseScale);
      }
    }
    if (nearestChest) {
      interactionPrompt = "open-chest";
      if (interactPressed) {
        nearestChest.opened = true;
        nearestChest.potion.revealTime = 0;
        nearestChest.potion.object.visible = true;
        nearestChest.potion.object.position.y = nearestChest.potion.baseY - 0.34;
        chestSound = {
          position: {
            x: nearestChest.root.position.x,
            y: nearestChest.root.position.y + 0.72,
            z: nearestChest.root.position.z,
          },
        };
        interactionPrompt = null;
      }
    }

    for (const pickup of this.pickups) {
      if (pickup.collected) {
        pickup.collectTime += delta;
        const progress = THREE.MathUtils.clamp(pickup.collectTime / 0.38, 0, 1);
        const lift = 1 - Math.pow(1 - progress, 3);
        const pop = 1 + Math.sin(progress * Math.PI) * 0.34;
        pickup.object.position.y = pickup.baseY + lift * 1.08;
        pickup.object.scale.copy(pickup.baseScale).multiplyScalar(pop);
        pickup.object.rotation.y += delta * (2.8 + progress * 5);
        setPickupOpacity(pickup.object, 1 - progress);
        if (progress >= 1) pickup.object.visible = false;
        continue;
      }
      if (!pickup.available) continue;
      pickup.object.position.y =
        pickup.baseY + Math.sin(this.elapsed * 2.4 + pickup.object.id) * 0.08;
      pickup.object.rotation.y += delta * 0.72;
      if (pickup.stoneSignal) {
        const pulse = 0.88 + Math.sin(this.elapsed * 2.9 + pickup.object.id) * 0.12;
        pickup.stoneSignal.light.intensity = pickup.stoneSignal.baseLightIntensity * pulse;
        const glowMaterial = pickup.stoneSignal.glow.material;
        if (glowMaterial instanceof THREE.MeshBasicMaterial) {
          glowMaterial.opacity = pickup.stoneSignal.baseGlowOpacity * (0.86 + pulse * 0.2);
        }
        pickup.stoneSignal.crown.scale.setScalar(0.96 + pulse * 0.08);
      }
      if (horizontalDistance(pickup.object.position, player) > 1.18) continue;
      pickup.collected = true;
      pickup.collectTime = 0;
      this.spawnPickupBurst(pickup.object.position, pickup.kind);
      collectedPickup = {
        kind: pickup.kind,
        position: {
          x: pickup.object.position.x,
          y: pickup.object.position.y,
          z: pickup.object.position.z,
        },
      };
      if (pickup.kind === "stone" && pickup.stoneId) {
        this.collectedStones.add(pickup.stoneId);
        collectedStoneId = pickup.stoneId;
        if (this.collectedStones.size >= STONE_ORDER.length) this.openPortal();
      } else {
        resolveGain += 28;
      }
    }

    this.updatePickupBursts(delta);

    if (this.portalRoot) {
      if (this.portalLight) {
        this.portalLight.intensity = this.portalOpen ? 16 + Math.sin(this.elapsed * 4.2) * 3 : 2.5;
      }
      if (this.portalBeam) this.portalBeam.visible = this.portalOpen;
      const veil = this.portalRoot.getObjectByName("Portal veil");
      if (veil instanceof THREE.Mesh && this.portalOpen) {
        const mat = veil.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.22 + Math.sin(this.elapsed * 3.1) * 0.05;
      }
    }

    const reachedLockedExit = atExit && !this.portalOpen && this.lockedExitCooldown === 0;
    if (reachedLockedExit) this.lockedExitCooldown = 1.5;
    let knockback: WorldUpdate["knockback"] = null;
    if (knockHits > 0) {
      const len = Math.hypot(knockX, knockZ);
      knockback = len > 1e-4 ? { x: knockX / len, z: knockZ / len } : { x: 0, z: 1 };
    }
    return {
      collectedRelic: this.collectedStones.size >= STONE_ORDER.length && collectedStoneId !== null,
      collectedStoneId,
      collectedPickup,
      stonesFound: this.collectedStones.size,
      stonesTotal: STONE_ORDER.length,
      portalOpen: this.portalOpen,
      resolveGain,
      damage,
      damageSource,
      doorSound,
      chestSound,
      interactionPrompt,
      knockback,
      reachedLockedExit,
      reachedOpenExit: atExit && this.portalOpen,
      nearestThreat: Number.isFinite(nearestThreat) ? nearestThreat : null,
    };
  }

  private spawnPickupBurst(position: THREE.Vector3, kind: PickupActor["kind"]): void {
    const color = kind === "resolve" ? 0xb52a3d : 0xc9b97b;
    const root = new THREE.Group();
    root.name = `${kind} pickup burst`;
    root.position.copy(position);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.21, 18),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    ring.name = "Pickup expanding ring";
    ring.rotation.x = -Math.PI / 2;
    const positions = new Float32Array(14 * 3);
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2 + position.x * 0.17 + position.z * 0.11;
      const radius = 0.12 + (index % 4) * 0.035;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = 0.04 + (index % 5) * 0.035;
      positions[index * 3 + 2] = Math.sin(angle) * radius;
    }
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const sparks = new THREE.Points(
      sparkGeometry,
      new THREE.PointsMaterial({
        color,
        size: kind === "resolve" ? 0.075 : 0.06,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    sparks.name = "Pickup rising sparks";
    root.add(ring, sparks);
    this.group.add(root);
    this.pickupBursts.push({ root, ring, sparks, age: 0, duration: 0.56 });
  }

  private updatePickupBursts(delta: number): void {
    for (let index = this.pickupBursts.length - 1; index >= 0; index -= 1) {
      const burst = this.pickupBursts[index]!;
      burst.age += delta;
      const progress = THREE.MathUtils.clamp(burst.age / burst.duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 2);
      burst.root.scale.setScalar(0.72 + eased * 1.9);
      burst.root.position.y += delta * (0.34 + progress * 0.26);
      burst.ring.material.opacity = (1 - progress) * 0.72;
      burst.sparks.material.opacity = (1 - progress) * 0.88;
      if (progress < 1) continue;
      this.group.remove(burst.root);
      disposeObject(burst.root);
      this.pickupBursts.splice(index, 1);
    }
  }

  private updateEnemyAnimationFrames(): void {
    this.movingEnemyKinds.clear();
    for (const enemy of this.enemies) if (enemy.moving) this.movingEnemyKinds.add(enemy.kind);
    for (const batch of this.enemyAnimationBatches.values()) {
      const frame = enemyAnimationFrameIndex(
        batch.kind,
        this.enemyAnimationElapsed,
        batch.phaseOffset,
        this.movingEnemyKinds.has(batch.kind),
      );
      if (frame === batch.frame) continue;
      setEnemyBillboardFrame(batch.material, batch.animation, frame);
      batch.frame = frame;
    }
  }

  updateEffects(delta: number, viewerPosition?: THREE.Vector3Like): void {
    this.elapsed += delta;
    const losInterval = 0.12; // ~8 Hz LOS refresh — enough for occlusion feel, cheap on large forge maps
    for (const effect of this.fireEffects) {
      const distance = viewerPosition
        ? Math.hypot(
            effect.root.position.x - viewerPosition.x,
            effect.root.position.z - viewerPosition.z,
          )
        : 0;
      const releaseDistance = effect.cutoffDistance + 7;
      // Far fires: skip grid LOS entirely (dominant cost when dozens of torches).
      if (viewerPosition && this.dungeon && distance <= releaseDistance) {
        effect.losAge += delta;
        if (effect.losAge >= losInterval) {
          effect.losAge = 0;
          effect.losOpen = hasGridLineOfSight(
            this.dungeon,
            viewerPosition,
            effect.root.position,
            this.tileSize,
          );
        }
      } else if (!viewerPosition || !this.dungeon) {
        effect.losOpen = true;
      } else {
        effect.losOpen = false;
      }
      const lineOfSight = effect.losOpen;
      const lod = computeTorchLod(distance, effect.cutoffDistance);
      effect.root.visible = lod.rootVisible;
      // Keep flame/halo tied to the soft light factor so they fade with the
      // light instead of hard-toggling the same frame the point light enables.
      const fxFactor = lineOfSight ? Math.max(lod.lightFactor, effect.currentLightFactor) : 0;
      const showFlame = fxFactor > 0.02;
      const showHalo = fxFactor > 0.08 && distance < Math.min(15, effect.cutoffDistance);
      effect.flame.visible = showFlame;
      for (const detail of effect.flameDetails) detail.visible = showFlame;
      const fade = THREE.MathUtils.clamp(fxFactor, 0, 1);
      for (const halo of effect.halos) {
        halo.visible = showHalo;
        if (!(halo instanceof THREE.Mesh)) continue;
        const mat = halo.material;
        if (mat instanceof THREE.ShaderMaterial && mat.uniforms.uStrength) {
          const baseStrength =
            (halo.userData.baseStrength as number | undefined) ??
            (mat.uniforms.uStrength.value as number);
          if (halo.userData.baseStrength === undefined) halo.userData.baseStrength = baseStrength;
          mat.uniforms.uStrength.value = baseStrength * fade;
          tickVolumetricBeamTime(halo as THREE.Mesh, this.elapsed + effect.phase);
          continue;
        }
        if (mat && !Array.isArray(mat) && "opacity" in mat) {
          const base =
            (halo.userData.baseOpacity as number | undefined) ??
            (mat as THREE.MeshBasicMaterial).opacity;
          if (halo.userData.baseOpacity === undefined) halo.userData.baseOpacity = base;
          (mat as THREE.MeshBasicMaterial).opacity = base * fade;
        }
      }
      const pulse =
        0.86 +
        Math.sin(this.elapsed * 9 + effect.phase) *
          Math.sin(this.elapsed * 4.7 + effect.phase * 1.7) *
          0.14;
      effect.flame.scale.y = effect.baseFlameScaleY * (0.92 + pulse * 0.08);
      effect.flame.position.y = effect.baseY + Math.sin(this.elapsed * 7 + effect.phase) * 0.018;
      if (effect.light) {
        const targetFactor = lineOfSight ? lod.lightFactor : 0;
        // Slower ramp-up softens the first lit contribution; faster decay cuts fill.
        const lambda = targetFactor > effect.currentLightFactor ? 3.6 : 10;
        effect.currentLightFactor = THREE.MathUtils.damp(
          effect.currentLightFactor,
          targetFactor,
          lambda,
          delta,
        );
        // Keep the PointLight in the scene graph. Toggling visibility changes
        // the renderer's light count and can compile a new shader while moving.
        effect.light.intensity = effect.baseIntensity * pulse * effect.currentLightFactor;
      }
    }
    // Portal / stone beams share the same soft grit clock.
    if (this.portalBeam) tickVolumetricBeamTime(this.portalBeam, this.elapsed);
    for (const beam of this.stoneBeams) tickVolumetricBeamTime(beam, this.elapsed);
    if (this.liquidKit) tickLiquidSections(this.liquidKit.surfaces, this.elapsed);
  }

  /** True when all four magic stones are bound (portal open). */
  get hasRelic(): boolean {
    return this.portalOpen;
  }
  get stonesFound(): number {
    return this.collectedStones.size;
  }
  get stonesTotal(): number {
    return STONE_ORDER.length;
  }
  get isPortalOpen(): boolean {
    return this.portalOpen;
  }

  restoreSession(foundStoneIds: readonly StoneId[]): void {
    const restored = new Set(foundStoneIds.filter((id) => STONE_ORDER.includes(id)));
    this.collectedStones.clear();
    for (const id of restored) this.collectedStones.add(id);
    for (const pickup of this.pickups) {
      if (pickup.kind !== "stone" || !pickup.stoneId) continue;
      const collected = restored.has(pickup.stoneId);
      pickup.collected = collected;
      pickup.collectTime = collected ? 1 : 0;
      pickup.object.visible = !collected;
      pickup.object.position.y = pickup.baseY;
      pickup.object.scale.copy(pickup.baseScale);
      setPickupOpacity(pickup.object, 1);
    }
    this.setPortalOpen(restored.size === STONE_ORDER.length);
  }

  getSolidCells(): GridCell[] {
    return [...this.solidCells.values()].map((cell) => ({ ...cell }));
  }

  getSolidColliders(): WorldCollider[] {
    return this.solidColliders.map((collider) => ({ ...collider }));
  }

  /**
   * Read-only snapshot of placed world entities for minimap rendering.
   * Door/fire/enemy/pickup positions come from the live actors; spawn from
   * the dungeon grid so the entrance is shown even before actors populate.
   * Stones and relic are derived from pickups + collected-stone state.
   */
  getMinimapFeatures(): MinimapFeatures {
    const dungeon = this.dungeon;
    const toCell = (position: THREE.Vector3): MinimapCell => {
      if (!dungeon) return { x: 0, y: 0 };
      return worldToGrid(dungeon, { x: position.x, z: position.z }, this.tileSize);
    };
    const doors = this.doors.map((door) => toCell(door.root.position));
    const fires = this.fireEffects.map((fire) => toCell(fire.root.position));
    const enemies = this.enemies
      .filter((enemy) => enemy.scaleX > 0.001 && enemy.scaleY > 0.001)
      .map((enemy) => ({ cell: toCell(enemy.position), tier: enemy.tier }));
    const stones = this.pickups
      .filter(
        (pickup): pickup is PickupActor & { kind: "stone"; stoneId: StoneId } =>
          pickup.kind === "stone" && pickup.stoneId !== undefined,
      )
      .map((pickup) => ({
        cell: toCell(pickup.object.position),
        collected: pickup.collected,
        id: pickup.stoneId,
      }));
    const pickups = this.pickups
      .filter((pickup) => pickup.kind === "resolve" && pickup.available && !pickup.collected)
      .map((pickup) => toCell(pickup.object.position));
    return {
      doors,
      fires,
      enemies,
      stones,
      pickups,
      spawn: dungeon ? { x: dungeon.spawn.x, y: dungeon.spawn.y } : { x: 0, y: 0 },
    };
  }

  /** Positions for HRTF sound placement; no simulation state leaves this adapter. */
  getAudioFrame(): DungeonAudioFrame {
    let fireCount = 0;
    for (const fire of this.fireEffects) {
      if (fire.audio === false) continue;
      const anchor = this.audioFrame.fires[fireCount] ?? {
        id: `fire-${fireCount}`,
        x: 0,
        y: 0,
        z: 0,
      };
      anchor.x = fire.root.position.x;
      anchor.y = fire.root.position.y + fire.baseY;
      anchor.z = fire.root.position.z;
      this.audioFrame.fires[fireCount++] = anchor;
    }
    this.audioFrame.fires.length = fireCount;

    let stoneCount = 0;
    for (const pickup of this.pickups) {
      if (pickup.kind !== "stone" || pickup.collected || !pickup.stoneId) continue;
      const anchor = this.audioFrame.magicStones[stoneCount] ?? {
        id: `stone-${pickup.stoneId}`,
        x: 0,
        y: 0,
        z: 0,
      };
      anchor.id = `stone-${pickup.stoneId}`;
      anchor.x = pickup.object.position.x;
      anchor.y = pickup.object.position.y;
      anchor.z = pickup.object.position.z;
      this.audioFrame.magicStones[stoneCount++] = anchor;
    }
    this.audioFrame.magicStones.length = stoneCount;

    let enemyCount = 0;
    for (const enemy of this.enemies) {
      if (enemy.scaleX <= 0.001 || enemy.scaleY <= 0.001) continue;
      const anchor = this.audioFrame.enemies[enemyCount] ?? {
        id: `enemy-${enemy.kind}-${enemy.instanceIndex}`,
        x: 0,
        y: 0,
        z: 0,
        voice: creatureVoiceForEnemy(enemy.kind),
      };
      anchor.id = `enemy-${enemy.kind}-${enemy.instanceIndex}`;
      anchor.voice = creatureVoiceForEnemy(enemy.kind);
      anchor.x = enemy.position.x;
      anchor.y = enemy.position.y + ENEMY_ARCHETYPES[enemy.kind].height * 0.5;
      anchor.z = enemy.position.z;
      this.audioFrame.enemies[enemyCount++] = anchor;
    }
    this.audioFrame.enemies.length = enemyCount;

    if (this.portalRoot) {
      const portal = this.audioFrame.portal ?? { id: "exit-portal", x: 0, y: 0, z: 0 };
      portal.x = this.portalRoot.position.x;
      portal.y = this.portalRoot.position.y + 1.7;
      portal.z = this.portalRoot.position.z;
      this.audioFrame.portal = portal;
    } else {
      this.audioFrame.portal = null;
    }
    return this.audioFrame;
  }

  dispose(): void {
    this.clear();
    disposeRoomSurfaceMaterials(this.surfaceMaterials);
    disposeDungeonMaterials(this.materials);
    disposeEnemyContactShadowMaterial(this.enemyShadowMaterial);
    this.assets.dispose();
    this.scene.remove(this.group);
  }

  private addArchitecture(
    dungeon: DungeonData,
    floorCells: readonly GridCell[],
    wallCells: readonly GridCell[],
  ): void {
    // Tiny geometric overlap only — UV stays 0..1 per tile so offsets of +1 meet cleanly.
    const floorFootprint = this.tileSize * 1.004;
    const wallFaceWidth = this.tileSize * 1.02;
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
        // Continuous UV field: neighbor cells continue the pattern (seamless wrap).
        floorOffsets[instance * 2] = cell.x;
        floorOffsets[instance * 2 + 1] = cell.y;
        ceilingOffsets[instance * 2] = cell.x;
        ceilingOffsets[instance * 2 + 1] = cell.y;
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
      this.group.add(floor, ceiling);
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
        // U runs along the wall; N/S faces use cell.x, E/W faces use cell.y.
        const alongU = face.intoDy !== 0 ? face.cell.x : face.cell.y;
        wallOffsets[instance * 2] = alongU;
        wallOffsets[instance * 2 + 1] = 0;
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
      this.group.add(walls);
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
    this.group.add(mesh);
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
    const rocks = new THREE.InstancedMesh(rockGeometry, this.materials.darkStone, count);
    rocks.name = "Low-poly cave debris";
    for (let index = 0; index < count; index += 1) {
      const cell = random.pick(rockCells);
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
    this.group.add(rocks);
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
      this.group.add(pebbles);
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
    this.group.add(door);
  }

  private createDoorAppearance() {
    const profile = getBiomeDecorationProfile(this.activeMood.id);
    const leafMaterial = new THREE.MeshStandardMaterial({
      map: this.assets.biomeDoor(this.activeMood.id),
      color: 0xffffff,
      roughness: profile.doorRoughness,
      metalness: this.activeMood.id === "iron" ? 0.42 : 0.03,
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
    const roomAt = (cell: GridCell): DungeonRoom | undefined =>
      dungeon.rooms.find(
        (room) =>
          cell.x >= room.x &&
          cell.x < room.x + room.width &&
          cell.y >= room.y &&
          cell.y < room.y + room.height,
      );
    const occupiedDoorCells = new Set<string>();
    let heroReliquaryPlaced = false;
    let doorsPlaced = 0;
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
      const candidates: Array<{ cell: GridCell; outDx: number; outDy: number }> = [];
      for (let x = room.x; x < room.x + room.width; x += 1) {
        for (const y of [room.y, room.y + room.height - 1]) {
          if (dungeon.grid[y]?.[x] !== FLOOR) continue;
          const outDy = y === room.y ? -1 : 1;
          const outside = { x, y: y + outDy };
          if (dungeon.grid[outside.y]?.[outside.x] === FLOOR && roomAt(outside)?.id !== room.id) {
            candidates.push({ cell: { x, y }, outDx: 0, outDy });
          }
        }
      }
      for (let y = room.y; y < room.y + room.height; y += 1) {
        for (const x of [room.x, room.x + room.width - 1]) {
          if (dungeon.grid[y]?.[x] !== FLOOR) continue;
          const outDx = x === room.x ? -1 : 1;
          const outside = { x: x + outDx, y };
          if (dungeon.grid[outside.y]?.[outside.x] === FLOOR && roomAt(outside)?.id !== room.id) {
            candidates.push({ cell: { x, y }, outDx, outDy: 0 });
          }
        }
      }
      const doorway =
        candidates[Math.abs(room.id * 7 + dungeon.seedHash) % Math.max(candidates.length, 1)];
      if (
        doorway &&
        doorsPlaced < 7 &&
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
        this.registerDoor(door, placement, placement.rotation);
        occupiedDoorCells.add(`${doorway.cell.x},${doorway.cell.y}`);
        doorsPlaced += 1;
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
      const occupied = new Set<string>();
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

    const artGeometry = new THREE.PlaneGeometry(2.15, 2.45);
    for (const [mapIndex, matrices] of classicWallArtPlacements) {
      const material = new THREE.MeshStandardMaterial({
        map: this.assets.wallArt(mapIndex),
        color: new THREE.Color(this.activeMood.surfaceTint).lerp(new THREE.Color(0xffffff), 0.66),
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0.01,
        envMapIntensity: 0.22,
      });
      const batch = new THREE.InstancedMesh(artGeometry, material, matrices.length);
      batch.name = `Room wall artwork ${mapIndex + 1}`;
      batch.castShadow = true;
      batch.receiveShadow = true;
      matrices.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
      batch.instanceMatrix.needsUpdate = true;
      this.group.add(batch);
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
        this.group.add(batch);
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
      this.group.add(batch);
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
    const occupied = new Set<string>();
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
    const occupied = new Set(this.solidCells.keys());
    for (const prop of props) {
      if (prop.kind === "brazier" || prop.kind === "candle" || prop.kind === "campfire") continue;
      const solid = SOLID_PROP_KINDS.has(prop.kind);
      const objectiveConflict = this.isObjectiveClearanceCell(prop);
      const protectedTraversal = isProtectedTraversalCell(dungeon, prop) || objectiveConflict;
      const needsRelocation = objectiveConflict || (solid && protectedTraversal);
      const relocatedCell = needsRelocation
        ? findNearestPropCell(dungeon, prop, occupied, 4, (cell) =>
            this.isObjectiveClearanceCell(cell),
          )
        : null;
      if (needsRelocation && !relocatedCell) continue;
      const placedProp = relocatedCell ? { ...prop, ...relocatedCell } : prop;
      if (relocatedCell) occupied.add(`${relocatedCell.x},${relocatedCell.y}`);
      if (solid) {
        const cell = { x: placedProp.x, y: placedProp.y };
        occupied.add(`${cell.x},${cell.y}`);
        this.solidCells.set(`${cell.x},${cell.y}`, cell);
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
          this.group.add(batch);
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
          this.group.add(fallback);
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
      this.group.add(batch);
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

  private addInteractiveChest(dungeon: DungeonData, prop: ForgePropMetadata): void {
    const kit = createForgeChest(this.materials);
    kit.root.name = `Potion chest ${prop.x},${prop.y}`;
    this.forgePropRootMatrix(dungeon, prop).decompose(
      kit.root.position,
      kit.root.quaternion,
      kit.root.scale,
    );
    this.group.add(kit.root);
    kit.root.updateWorldMatrix(true, true);
    this.registerSolidObject(kit.root, { x: prop.x, y: prop.y });

    const anchor = new THREE.Vector3(0, 0.91, 0.02);
    kit.root.localToWorld(anchor);
    const item = createResolveFlask(this.materials);
    item.name = "Resolve flask from chest";
    const baseScale = new THREE.Vector3(0.64, 0.64, 0.64);
    const baseY = anchor.y + 0.08;
    item.position.set(anchor.x, baseY - 0.34, anchor.z);
    item.scale.copy(baseScale);
    item.visible = false;
    const potion: PickupActor = {
      kind: "resolve",
      object: item,
      collected: false,
      collectTime: 0,
      available: false,
      revealTime: 0,
      baseY,
      baseScale,
    };
    this.pickups.push(potion);
    this.chests.push({
      id: `${dungeon.seedHash}:${prop.x},${prop.y}`,
      root: kit.root,
      lid: kit.lid,
      potion,
      opened: false,
      openness: 0,
    });
    this.group.add(item);
    this.stats.props += 1;
  }

  private registerSolidObject(object: THREE.Object3D, cell: GridCell): void {
    object.updateWorldMatrix(true, true);
    this.registerSolidBounds(new THREE.Box3().setFromObject(object), cell);
  }

  private registerSolidBounds(bounds: THREE.Box3, cell: GridCell): void {
    if (bounds.isEmpty()) return;
    this.solidCells.set(`${cell.x},${cell.y}`, { ...cell });
    this.solidColliders.push({
      minX: bounds.min.x,
      maxX: bounds.max.x,
      minY: bounds.min.y,
      maxY: bounds.max.y,
      minZ: bounds.min.z,
      maxZ: bounds.max.z,
    });
    if (bounds.max.y > 0.14) {
      this.staticContactShadowPlacements.push({
        x: (bounds.min.x + bounds.max.x) * 0.5,
        z: (bounds.min.z + bounds.max.z) * 0.5,
        width: bounds.max.x - bounds.min.x,
        depth: bounds.max.z - bounds.min.z,
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
    this.group.add(batch);
  }

  private addForgeLiquids(dungeon: DungeonData): void {
    this.liquidKit = createLiquidSectionKit(dungeon, this.materials, this.tileSize);
    if (!this.liquidKit) return;
    this.group.add(this.liquidKit.root);
    this.stats.props += this.liquidKit.stats.cells + this.liquidKit.stats.boundaryEdges;
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
        if (dungeon.grid[floor.y]?.[floor.x] === FLOOR && !this.isObjectiveClearanceCell(floor)) {
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
      this.addFireProp("torch", position, true, index * 1.73, direction);
    });

    const rooms = dungeon.rooms.filter(
      (room) => room.role === "room" && !this.isObjectiveClearanceCell(room.center),
    );
    const campfireCount = Math.min(6, Math.round(rooms.length * 0.34 * this.decorDensity));
    for (let index = 0; index < campfireCount; index += 1) {
      const room = rooms[(index * 3 + 1) % Math.max(1, rooms.length)];
      if (!room) continue;
      const p = gridToWorld(dungeon, room.center, this.tileSize);
      // Slight offset from true center so the fire does not sit under the player spawn path.
      this.addFireProp(
        "campfire",
        new THREE.Vector3(p.x + (random.next() - 0.5) * 1.1, 0, p.z + (random.next() - 0.5) * 1.1),
        true,
        9 + index * 2.1,
      );
    }

    const farRooms = [...rooms]
      .sort((a, b) => roomDistance(dungeon, b) - roomDistance(dungeon, a))
      .slice(1, 3);
    farRooms.forEach((room, index) => {
      const p = gridToWorld(dungeon, room.center, this.tileSize);
      this.addFireProp(
        "brazier",
        new THREE.Vector3(p.x + 1.15, 0, p.z - 0.8),
        true,
        20 + index * 2.7,
      );
    });
    this.stats.props += torches.length + campfireCount + farRooms.length;
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
      this.group.add(root);
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
    const fireProps = forge.props.filter(
      (prop) =>
        (prop.kind === "candle" || prop.kind === "campfire" || prop.kind === "brazier") &&
        !this.isObjectiveClearanceCell(prop),
    );
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
    forge.torches.forEach((torch, index) => {
      const wall = gridToWorld(dungeon, { x: torch.x, y: torch.y }, this.tileSize);
      const direction = new THREE.Vector3(torch.dx, 0, torch.dy).normalize();
      const position = new THREE.Vector3(wall.x, 1.42, wall.z).addScaledVector(
        direction,
        this.tileSize * 0.505,
      );
      this.addFireProp("torch", position, true, index * 1.73, direction, lit.has(index));
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
    this.stats.props += forge.torches.length + fireProps.length;
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
        this.group.add(pool);
      }
      this.group.add(torch.root);
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
      this.group.add(campfire.root);
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
    const root = new THREE.Group();
    root.position.copy(position);
    root.name = "brazier fire prop";
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.3, 8), this.materials.iron);
    bowl.position.y = 0.72;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.16, 0.62, 6),
      this.materials.iron,
    );
    stem.position.y = 0.38;
    root.add(bowl, stem);
    const flameY = 1.0;
    const flame = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.2, 0),
      new THREE.MeshBasicMaterial({
        color: 0xc5a56e,
        transparent: true,
        opacity: 0.86,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    flame.position.y = flameY;
    flame.scale.y = 1.8;
    root.add(flame);
    const baseIntensity = 54;
    const keepDynamicLight =
      lit && dynamicLight && this.dynamicFireLightCount < MAX_DYNAMIC_FIRE_LIGHTS;
    const light = keepDynamicLight
      ? new THREE.PointLight(0xc18a50, baseIntensity, FIRE_LIGHT_TUNING.brazierRange, 2.12)
      : null;
    if (light) {
      light.position.set(0, flameY + 0.1, 0);
      root.add(light);
    }
    this.group.add(root);
    const detachedLight = this.detachFireLight(root, light);
    this.fireEffects.push({
      root,
      flame,
      flameDetails: [],
      halos: [],
      light: detachedLight,
      baseIntensity,
      baseY: flameY,
      baseFlameScaleY: flame.scale.y,
      currentLightFactor: detachedLight ? 1 : 0,
      cutoffDistance: FIRE_LIGHT_TUNING.brazierRange,
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
    this.group.add(light);
    this.dynamicFireLightCount += 1;
    return light;
  }

  private removeFireLight(
    root: THREE.Group,
    light: THREE.PointLight | null,
    halos: THREE.Object3D[],
  ): null {
    light?.removeFromParent();
    for (const halo of halos) {
      halo.removeFromParent();
      disposeObject(halo);
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
    this.scatterRoomAtmosphereProps(dungeon, random);
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
        for (const material of materials) tintMaterial(material, core, 0.86);
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
    this.group.add(batch);
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
    const occupied = new Set<string>();
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
      const selected = pickSpreadSeats(seats, count, dungeon.seedHash + room.id * 41);
      selected.forEach((seat, index) => {
        occupied.add(`${seat.cell.x},${seat.cell.y}`);
        const frame = Math.abs(room.id * 3 + index + Math.floor(random.next() * 4)) % 4;
        placements[frame]!.push({ seat });
      });
    }

    for (const [frame, cells] of placements.entries()) {
      if (cells.length === 0) continue;
      const map = this.assets.biomeWallDecor(this.activeMood.id, frame);
      const material = new THREE.MeshStandardMaterial({
        map,
        color: new THREE.Color(this.activeMood.surfaceTint).lerp(new THREE.Color(0xffffff), 0.76),
        transparent: true,
        opacity: frame < 2 ? 1 : 0.76,
        alphaTest: frame < 2 ? 0.1 : 0.16,
        depthWrite: frame < 2,
        side: THREE.DoubleSide,
        roughness: 0.9,
        metalness: 0.01,
        envMapIntensity: 0.22,
        polygonOffset: frame >= 2,
        polygonOffsetFactor: frame >= 2 ? -3 : 0,
        polygonOffsetUnits: frame >= 2 ? -3 : 0,
      });
      const geometry = new THREE.PlaneGeometry(
        1.55 * profile.wallDecorScale,
        1.72 * profile.wallDecorScale,
      );
      const batch = new THREE.InstancedMesh(geometry, material, cells.length);
      batch.name = `${this.activeMood.label} wall decor ${frame + 1}`;
      batch.castShadow = frame < 2;
      batch.receiveShadow = true;
      const frameMatrices: THREE.Matrix4[] = [];
      cells.forEach(({ seat }, index) => {
        const p = gridToWorld(dungeon, seat.cell, this.tileSize);
        const offset = wallHugWorldOffset(seat.intoDx, seat.intoDy, this.tileSize, 0.055);
        this.tempPosition.set(p.x + offset.x, 1.75 + ((index + frame) % 3) * 0.12, p.z + offset.z);
        this.tempEuler.set(0, facingRotation(seat.intoDx, seat.intoDy), 0, "YXZ");
        this.tempQuaternion.setFromEuler(this.tempEuler);
        const scaleX = 0.88 + random.next() * 0.24;
        const scaleY = 0.88 + random.next() * 0.24;
        this.tempScale.set(scaleX, scaleY, 1);
        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        batch.setMatrixAt(index, this.tempMatrix);
        if (frame < 2) {
          frameMatrices.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(
                this.tempPosition.x - seat.intoDx * 0.042,
                this.tempPosition.y,
                this.tempPosition.z - seat.intoDy * 0.042,
              ),
              this.tempQuaternion.clone(),
              new THREE.Vector3(scaleX, scaleY, 1),
            ),
          );
        }
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
      this.group.add(batch);
      if (frameMatrices.length > 0) {
        const frames = new THREE.InstancedMesh(
          createPictureFrameGeometry(1.55 * profile.wallDecorScale, 1.72 * profile.wallDecorScale),
          this.materials.wood,
          frameMatrices.length,
        );
        frames.name = `${this.activeMood.label} wall decor dimensional frames`;
        frames.castShadow = true;
        frames.receiveShadow = true;
        frameMatrices.forEach((matrix, index) => frames.setMatrixAt(index, matrix));
        frames.instanceMatrix.needsUpdate = true;
        frames.computeBoundingBox();
        frames.computeBoundingSphere();
        this.group.add(frames);
      }
      this.stats.props += cells.length;
    }
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
      cells: Array<{ cell: GridCell; rot: number; y: number }>;
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
      // Hanging chains/vines in tall-enough rooms (≥6 cells on a side).
      if (room.width >= 6 || room.height >= 6) {
        const count = Math.max(
          1,
          Math.min(3, Math.round(this.decorDensity * 1.7 * profile.hangingDensity)),
        );
        const cells = this.pickAtmosphereCells(dungeon, wallSeats, interior, count, random);
        if (cells.length > 0) {
          const kind = profile.hangingKind;
          let template = hangingTemplates.get(kind);
          if (!template) {
            template = createHanging(
              this.materials,
              kind,
              profile.hangingLength,
              profile.rubbleVariant,
            );
            hangingTemplates.set(kind, template);
          }
          hangingPlacements.push({
            template,
            cells: cells.map((cell) => ({
              cell: cell.cell,
              rot: random.next() * Math.PI * 2,
              y: this.wallHeight,
            })),
          });
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
      (cell) => !isProtectedTraversalCell(dungeon, cell) && !this.isObjectiveClearanceCell(cell),
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
      cells: Array<{ cell: GridCell; rot: number; y: number }>;
    }>,
  ): void {
    if (placements.length === 0) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    const grouped = new Map<THREE.Group, Array<{ cell: GridCell; rot: number; y: number }>>();
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
          matrix.compose(position, quaternion, scale);
          batch.setMatrixAt(index, matrix);
        });
        batch.instanceMatrix.needsUpdate = true;
        this.group.add(batch);
      }
      this.stats.props += instanceCount;
    }
  }

  private addMarkers(dungeon: DungeonData): void {
    const entrance = gridToWorld(dungeon, dungeon.spawn, this.tileSize);
    const exit = gridToWorld(dungeon, dungeon.exit, this.tileSize);
    this.exitPosition.set(exit.x, 0, exit.z);

    const entranceRing = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.66, 8), this.materials.iron);
    entranceRing.rotation.x = -Math.PI / 2;
    entranceRing.position.set(entrance.x, 0.02, entrance.z);

    // Special portal zone at the dungeon exit — full-height frame always;
    // sealed state hides the active veil instead of squashing the gate.
    const portal = new THREE.Group();
    portal.name = "Escape portal gate";
    const frameParts: THREE.BufferGeometry[] = [];
    for (const offset of [-0.92, 0.92]) {
      frameParts.push(
        transformedGeometry(new THREE.CylinderGeometry(0.2, 0.24, 2.48, 8), {
          x: offset,
          y: 1.28,
          z: 0,
        }),
        transformedGeometry(new THREE.CylinderGeometry(0.34, 0.38, 0.2, 8), {
          x: offset,
          y: 0.1,
          z: 0,
        }),
        transformedGeometry(new THREE.CylinderGeometry(0.31, 0.24, 0.22, 8), {
          x: offset,
          y: 2.52,
          z: 0,
        }),
      );
    }
    frameParts.push(
      transformedGeometry(new THREE.TorusGeometry(0.93, 0.19, 7, 28, Math.PI), {
        x: 0,
        y: 2.52,
        z: 0,
      }),
      transformedGeometry(
        new THREE.BoxGeometry(0.28, 0.28, 0.34),
        { x: 0, y: 3.43, z: 0 },
        new THREE.Euler(0, 0, Math.PI / 4),
      ),
    );
    const frame = new THREE.Mesh(mergePropGeometry(frameParts), this.materials.darkStone);
    frame.name = "Faceted escape portal arch";
    frame.castShadow = true;
    frame.receiveShadow = true;
    portal.add(frame);
    // Sealed bars across the opening (visible while closed).
    const barParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i += 1) {
      const x = -0.7 + i * 0.35;
      barParts.push(
        transformedGeometry(new THREE.CylinderGeometry(0.045, 0.05, 2.36, 6), {
          x,
          y: 1.37,
          z: 0.06,
        }),
        transformedGeometry(new THREE.ConeGeometry(0.09, 0.22, 6), {
          x,
          y: 2.66,
          z: 0.06,
        }),
      );
    }
    barParts.push(
      transformedGeometry(new THREE.BoxGeometry(1.68, 0.1, 0.11), {
        x: 0,
        y: 1.48,
        z: 0.08,
      }),
      transformedGeometry(new THREE.BoxGeometry(1.46, 0.08, 0.1), {
        x: 0,
        y: 0.72,
        z: 0.08,
      }),
    );
    const bars = new THREE.Mesh(mergePropGeometry(barParts), this.materials.iron);
    bars.name = "Portal sealed bars";
    bars.castShadow = true;
    bars.receiveShadow = true;
    portal.add(bars);
    const portalArchMaterial = this.materials.iron.clone();
    portalArchMaterial.color.setHex(0x2a2e32);
    portalArchMaterial.emissive.setHex(0x121820);
    portalArchMaterial.emissiveIntensity = 0.25;
    portalArchMaterial.metalness = 0.55;
    portalArchMaterial.roughness = 0.55;
    const archRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.08, 8, 28), portalArchMaterial);
    archRing.position.y = 1.65;
    portal.add(archRing);
    const veil = new THREE.Mesh(
      new THREE.CircleGeometry(0.88, 24),
      new THREE.MeshBasicMaterial({
        color: 0x6a8898,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    veil.name = "Portal veil";
    veil.position.y = 1.65;
    veil.visible = false;
    portal.add(veil);
    portal.position.set(exit.x, 0, exit.z);
    this.portalRoot = portal;

    const exitBeam = createVolumetricBeam(0x7a9098, 4.15, 1.05, 0.18);
    exitBeam.position.set(exit.x, this.wallHeight - 0.02, exit.z);
    exitBeam.visible = false;
    this.portalBeam = exitBeam;
    const exitLight = new THREE.PointLight(0x7a9098, 3, 12, 2.2);
    exitLight.position.set(exit.x, 2.4, exit.z);
    this.portalLight = exitLight;
    const entranceLight = new THREE.PointLight(0x777b7c, 7, 9, 2.4);
    entranceLight.position.set(entrance.x, 1.7, entrance.z);
    this.group.add(entranceRing, portal, exitBeam, exitLight, entranceLight);
    this.stats.beams += 1;
  }

  private openPortal(): void {
    this.setPortalOpen(true);
  }

  private setPortalOpen(open: boolean): void {
    this.portalOpen = open;
    if (this.portalBeam) this.portalBeam.visible = open;
    if (this.portalLight) this.portalLight.intensity = open ? 18 : 3;
    if (this.portalRoot) {
      const bars = this.portalRoot.getObjectByName("Portal sealed bars");
      if (bars) bars.visible = !open;
      const veil = this.portalRoot.getObjectByName("Portal veil");
      if (veil instanceof THREE.Mesh) {
        veil.visible = open;
        const mat = veil.material as THREE.MeshBasicMaterial;
        mat.opacity = open ? 0.28 : 0;
        if (open) mat.color.setHex(0x8a9aa4);
      }
    }
  }

  private ensureStoneTextures(): void {
    if (this.stoneTextures.size > 0) return;
    const loader = new THREE.TextureLoader();
    for (const id of magicStoneIds()) {
      const texture = loader.load(`/assets/textures/stones/${id}-albedo.jpg`);
      texture.colorSpace = THREE.SRGBColorSpace;
      // Pixel-art grimdark: hard texels, no bilinear mush.
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);
      this.stoneTextures.set(id, texture);
    }
  }

  private addActors(dungeon: DungeonData, stonePlacements: readonly MagicStonePlacement[]): void {
    const rankedRooms = dungeon.rooms
      .filter((room) => room.role === "room")
      .sort((left, right) => roomDistance(dungeon, left) - roomDistance(dungeon, right));
    // Shared editor/runtime placement keeps objective diamonds tied to the real rooms.
    const stoneRooms = stonePlacements.map((placement) => placement.room);
    stonePlacements.forEach((placement) => {
      const { stoneId } = placement;
      const stone = createMagicStone(stoneId, this.materials, this.stoneTextures.get(stoneId));
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
      this.group.add(stone.root, beam);
      this.stats.beams += 1;
    });

    const random = createSeededRandom(`${dungeon.seed}:actors`);
    const stoneRoomSet = new Set(stoneRooms);
    const enemyRooms = rankedRooms
      .filter((room) => !stoneRoomSet.has(room))
      .filter((_, index) => index % 2 === 1)
      .slice(0, 7);
    const kinds: readonly EnemyKind[] = ENEMY_ROSTER;

    const rawSpawns = dungeon.forge?.spawns.length
      ? dungeon.forge.spawns
          .filter((spawn) => !this.isObjectiveClearanceCell(spawn))
          .map((spawn) => ({
            cell: { x: spawn.x, y: spawn.y },
            tier: spawn.tier,
          }))
      : enemyRooms.map((room, tier) => ({ cell: room.center, tier: tier % 4 }));
    // Forge maps: enemyDensity 1.0 keeps authored spawn list; runtime uses host slider.
    const densityScale = dungeon.forge
      ? Math.max(this.enemyDensity, 0.99)
      : 0.35 + this.enemyDensity * 0.9;
    const maxActors = Math.max(0, Math.round(rawSpawns.length * densityScale));
    const spawnRecords = rawSpawns.slice(0, Math.max(this.enemyDensity <= 0 ? 0 : 1, maxActors));
    const selectedKinds = selectEnemyKindsForSpawns(
      dungeon.seed,
      spawnRecords.map((spawn) => spawn.tier),
    );
    const actorSpecs = spawnRecords.map((spawn, index) => {
      const kind = selectedKinds[index] ?? kinds[index % kinds.length] ?? "goblin";
      const archetype = ENEMY_ARCHETYPES[kind];
      const width = archetype.width;
      const height = archetype.height;
      const p = gridToWorld(dungeon, spawn.cell, this.tileSize);
      const spawnY =
        kind === "imp" ? this.wallHeight - archetype.height / 2 - 0.38 : enemyGroundY(kind);
      return {
        kind,
        width,
        height,
        tier: spawn.tier,
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
            this.enemyShadowMaterial,
            actorSpecs.length,
          )
        : null;
    if (sharedShadowBatch) {
      sharedShadowBatch.name = "Enemy shared contact shadow batch";
      sharedShadowBatch.renderOrder = 1;
      sharedShadowBatch.frustumCulled = true;
    }
    for (const kind of kinds) {
      const specs = actorSpecs.filter((spec) => spec.kind === kind);
      if (specs.length === 0) continue;
      const kindArchetype = ENEMY_ARCHETYPES[kind];
      const animation = ENEMY_ANIMATIONS[kind];
      const texture = this.assets.enemyAnimation(animation);
      const material = createEnemyBillboardMaterial(texture);
      setEnemyBillboardFrame(material, animation, 0);
      this.enemyAnimationBatches.set(kind, {
        kind,
        material,
        animation,
        frame: 0,
        phaseOffset: this.enemyAnimationBatches.size * 0.03125,
      });
      const billboardGeometry = new THREE.PlaneGeometry(1, 1);
      const visibilityAttribute = new THREE.InstancedBufferAttribute(
        new Float32Array(specs.length).fill(1),
        1,
      );
      billboardGeometry.setAttribute("aEnemyVisibility", visibilityAttribute);
      this.enemyVisibilityAttributes.add(visibilityAttribute);
      const batch = new THREE.InstancedMesh(billboardGeometry, material, specs.length);
      batch.name = `Enemy billboard batch ${kind}`;
      batch.renderOrder = 2;
      batch.frustumCulled = true;
      specs.forEach((spec, instanceIndex) => {
        if (!sharedShadowBatch) return;
        const actor: EnemyActor = {
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
          phaseEpoch: -1,
          phaseVisibility: 1,
          moving: false,
          visibilityAttribute,
          tier: spec.tier,
        };
        this.enemies.push(actor);
        batch.setMatrixAt(
          instanceIndex,
          new THREE.Matrix4().compose(
            actor.position,
            new THREE.Quaternion(),
            new THREE.Vector3(actor.scaleX, actor.scaleY, 1),
          ),
        );
        const lowBody = isLowProfileEnemy(kind);
        const contactWidth = kindArchetype.width * (lowBody ? 0.78 : 0.56);
        sharedShadowBatch.setMatrixAt(
          spec.shadowInstanceIndex,
          new THREE.Matrix4().compose(
            new THREE.Vector3(actor.position.x, 0.024, actor.position.z),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
            new THREE.Vector3(contactWidth, contactWidth * (lowBody ? 0.62 : 0.4), 1),
          ),
        );
      });
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingSphere();
      // Inflate sphere so culled batches still cover movement within a room.
      if (batch.boundingSphere)
        batch.boundingSphere.radius = Math.max(batch.boundingSphere.radius, 24);
      this.enemyBatches.add(batch);
      this.group.add(batch);
    }
    if (sharedShadowBatch) {
      sharedShadowBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      sharedShadowBatch.instanceMatrix.needsUpdate = true;
      sharedShadowBatch.computeBoundingSphere();
      if (sharedShadowBatch.boundingSphere)
        sharedShadowBatch.boundingSphere.radius = Math.max(
          sharedShadowBatch.boundingSphere.radius,
          24,
        );
      this.enemyShadowBatches.add(sharedShadowBatch);
      this.group.add(sharedShadowBatch);
    }

    if (!dungeon.forge) {
      rankedRooms
        .filter((room) => !stoneRoomSet.has(room))
        .filter((_, index) => index % 4 === 0)
        .slice(0, 3)
        .forEach((room) => {
          const candidates = collectRoomInteriorSeats(dungeon, room).filter(
            (cell) =>
              !this.solidCells.has(`${cell.x},${cell.y}`) &&
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
        });
    }
  }

  private clear(): void {
    this.enemies.length = 0;
    this.enemyBatches.clear();
    this.enemyShadowBatches.clear();
    this.enemyVisibilityAttributes.clear();
    this.enemyAnimationBatches.clear();
    this.movingEnemyKinds.clear();
    this.enemyAnimationElapsed = 0;
    this.doors.length = 0;
    this.pickups.length = 0;
    this.chests.length = 0;
    this.pickupBursts.length = 0;
    this.fireEffects.length = 0;
    this.dynamicFireLightCount = 0;
    this.solidCells.clear();
    this.solidColliders.length = 0;
    this.objectiveClearanceCells.clear();
    this.staticContactShadowPlacements.length = 0;
    this.portalRoot = null;
    this.portalBeam = null;
    this.portalLight = null;
    this.stoneBeams.length = 0;
    if (this.liquidKit) {
      this.group.remove(this.liquidKit.root);
      disposeLiquidSectionKit(this.liquidKit);
      this.liquidKit = null;
    }
    this.collectedStones.clear();
    this.portalOpen = false;
    this.stats.beams = 0;
    this.stats.lights = 0;
    this.stats.props = 0;
    while (this.group.children.length > 0) {
      const child = this.group.children[0] as THREE.Object3D;
      this.group.remove(child);
      disposeObject(child);
    }
  }
}
