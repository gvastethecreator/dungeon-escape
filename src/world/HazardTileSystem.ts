import * as THREE from "three";
import type { SceneTextureSink } from "../systems/SceneTextureRegistry";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { createSeededRandom } from "../core/random";
import { gridToWorld } from "../dungeon/gridCollision";
import type { DungeonData, DungeonRoom, GridCell } from "../dungeon/types";
import type { DungeonMood, DungeonMoodId } from "../systems/DungeonMood";
import {
  FloorOccupancyBit,
  FloorOccupancyOverlay,
  type CellOccupancyQuery,
} from "./FloorOccupancyGrid";
import {
  HAZARD_CONTACT_RADIUS,
  spikeExposure as computeSpikeExposure,
  tickHazardTraversal,
} from "./HazardTraversal";

export type HazardTileKind = "fire" | "ice" | "toxin" | "spikes";

export interface HazardTilePlacement {
  kind: HazardTileKind;
  cell: GridCell;
  phase: number;
}

export interface HazardSurfaceEffect {
  kind: HazardTileKind | null;
  label: string;
  damage: number;
  movementScale: number;
  traction: number;
}

/**
 * Live callers pass a floor-owned numeric query.  The Set branch keeps the
 * public planner source-compatible for external tools and tests; it is read
 * directly and never cloned into a placement snapshot.
 */
export type HazardCellExclusionQuery = CellOccupancyQuery | ReadonlySet<string>;

const EMPTY_HAZARD_EXCLUSION_QUERY: CellOccupancyQuery = {
  isOccupied: () => false,
};

function isHazardCellExcluded(exclusions: HazardCellExclusionQuery, x: number, y: number): boolean {
  if ("isOccupied" in exclusions) return exclusions.isOccupied(x, y);
  return exclusions.has(`${x},${y}`);
}

export interface HazardTraversalState {
  /** Feet have cleared the floor trigger while jumping. */
  airborne?: boolean;
  /** Active mobility pickup suppresses all floor-trap contact and residue. */
  immune?: boolean;
}

export {
  HAZARD_CONTACT_RADIUS,
  HAZARD_LABELS,
  spikeExposure,
  tickHazardTraversal,
  createHazardClockState,
  type HazardClockState,
  type HazardTraversalInput,
  type HazardTraversalResult,
} from "./HazardTraversal";

const HAZARDS_BY_MOOD: Readonly<Record<DungeonMoodId, readonly HazardTileKind[]>> = {
  ancient: ["spikes", "toxin"],
  molten: ["fire", "spikes"],
  frost: ["ice", "spikes"],
  grim: ["toxin", "spikes"],
  verdant: ["toxin", "ice"],
  ash: ["fire", "toxin"],
  iron: ["spikes", "ice"],
  obsidian: ["fire", "spikes"],
  sunken: ["toxin", "ice"],
  fungal: ["toxin", "fire"],
  backrooms: ["spikes", "toxin"],
};

const BIOME_ACCENTS: Readonly<Record<DungeonMoodId, readonly [string, string]>> = {
  ancient: ["#9ca7b7", "#4d6076"],
  molten: ["#ff7a24", "#7c180c"],
  frost: ["#9ee6ff", "#315b84"],
  grim: ["#9dbf6a", "#344c2e"],
  verdant: ["#69d58d", "#1f603d"],
  ash: ["#e07a4f", "#5b2925"],
  iron: ["#aeb8bd", "#3e4b52"],
  obsidian: ["#d54d67", "#511529"],
  sunken: ["#50c5b6", "#174f59"],
  fungal: ["#c485df", "#533063"],
  backrooms: ["#d2b861", "#665321"],
};

function roomDistanceFromSpawn(room: DungeonRoom, spawn: GridCell): number {
  return Math.hypot(room.center.x - spawn.x, room.center.y - spawn.y);
}

export function hazardKindsForMood(mood: DungeonMoodId): readonly HazardTileKind[] {
  return HAZARDS_BY_MOOD[mood];
}

export function planHazardTiles(
  dungeon: DungeonData,
  mood: DungeonMoodId,
  excludedCells: HazardCellExclusionQuery = EMPTY_HAZARD_EXCLUSION_QUERY,
): HazardTilePlacement[] {
  const rooms = dungeon.rooms
    .filter((room) => room.role === "room")
    .sort(
      (left, right) =>
        roomDistanceFromSpawn(left, dungeon.spawn) - roomDistanceFromSpawn(right, dungeon.spawn),
    )
    .slice(1);
  if (rooms.length === 0) return [];
  const target = Math.min(18, Math.max(4, Math.round(dungeon.stats.roomCount * 0.28)));
  const random = createSeededRandom(`${dungeon.seed}:${mood}:hazards`);
  const kinds = HAZARDS_BY_MOOD[mood];
  const selected = new FloorOccupancyOverlay(dungeon.width, dungeon.height);
  const placements: HazardTilePlacement[] = [];
  let attempts = 0;
  while (placements.length < target && attempts < target * 12) {
    const pass = [...rooms];
    for (let index = pass.length - 1; index > 0; index -= 1) {
      const swap = random.integer(0, index);
      [pass[index], pass[swap]] = [pass[swap]!, pass[index]!];
    }
    for (const room of pass) {
      attempts += 1;
      const insetX = Math.min(2, Math.max(1, Math.floor((room.width - 1) / 3)));
      const insetY = Math.min(2, Math.max(1, Math.floor((room.height - 1) / 3)));
      const x = random.integer(room.x + insetX, room.x + room.width - 1 - insetX);
      const y = random.integer(room.y + insetY, room.y + room.height - 1 - insetY);
      if (selected.isOccupied(x, y) || isHazardCellExcluded(excludedCells, x, y)) continue;
      selected.mark(x, y, FloorOccupancyBit.Hazard);
      placements.push({
        kind: kinds[placements.length % kinds.length]!,
        cell: { x, y },
        phase: random.next() * Math.PI * 2,
      });
      if (placements.length >= target) break;
    }
  }
  return placements;
}

const HAZARD_ATLAS_PATH = "/assets/textures/hazards/hazard-tiles-pixel-v1.webp";
const FORGED_IRON_PBR_ROOT = "/assets/textures/model-materials-v2/black-iron/black-iron";
export const FORGED_IRON_PBR_PATHS = Object.freeze({
  albedo: `${FORGED_IRON_PBR_ROOT}_albedo.webp`,
  normal: `${FORGED_IRON_PBR_ROOT}_normal.webp`,
  roughness: `${FORGED_IRON_PBR_ROOT}_roughness.webp`,
  ao: `${FORGED_IRON_PBR_ROOT}_ao.webp`,
});
const FORGED_IRON_MATERIAL_COLOR = 0x8f9698;
const FORGED_IRON_METALNESS = 0.72;
const FORGED_IRON_ROUGHNESS = 0.5;
const FORGED_IRON_ENV_INTENSITY = 1.65;
const FORGED_IRON_INDIRECT_FILL = 0.32;
const FORGED_FRAME_MATERIAL_COLOR = 0x989fa1;
const FORGED_FRAME_METALNESS = 0.78;
const FORGED_FRAME_ROUGHNESS = 0.48;
const FORGED_FRAME_ENV_INTENSITY = 1.85;
const FORGED_FRAME_INDIRECT_FILL = 0.24;
const FORGED_SPIKE_MATERIAL_COLOR = 0xe4e7e6;
const FORGED_SPIKE_METALNESS = 0.74;
const FORGED_SPIKE_ROUGHNESS = 0.34;
const FORGED_SPIKE_ENV_INTENSITY = 1.95;
const FORGED_SPIKE_INDIRECT_FILL = 0.14;
const HAZARD_ATLAS_ROW: Readonly<Record<HazardTileKind, number>> = {
  fire: 0.75,
  ice: 0.5,
  toxin: 0.25,
  spikes: 0,
};
const HAZARD_ANIMATION_FRAMES = [0, 1, 2, 3, 2, 1] as const;

const HAZARD_MATERIAL_RESPONSE: Readonly<
  Record<
    HazardTileKind,
    { emissiveBase: number; emissivePulse: number; roughness: number; metalness: number }
  >
> = {
  fire: { emissiveBase: 0.1, emissivePulse: 0.065, roughness: 0.82, metalness: 0.04 },
  ice: { emissiveBase: 0.025, emissivePulse: 0.018, roughness: 0.34, metalness: 0.02 },
  toxin: { emissiveBase: 0.055, emissivePulse: 0.035, roughness: 0.9, metalness: 0.02 },
  spikes: { emissiveBase: 0, emissivePulse: 0, roughness: 0.8, metalness: 0.2 },
};

const SPIKE_LAYOUT: ReadonlyArray<
  Readonly<{ x: number; z: number; yaw: number; leanX: number; leanZ: number; scale: number }>
> = [
  { x: -0.43, z: -0.38, yaw: -0.18, leanX: 0.025, leanZ: -0.035, scale: 0.94 },
  { x: 0.39, z: -0.43, yaw: 0.42, leanX: -0.035, leanZ: 0.02, scale: 1.04 },
  { x: -0.03, z: 0.01, yaw: -0.55, leanX: 0.018, leanZ: 0.042, scale: 1.1 },
  { x: -0.4, z: 0.41, yaw: 0.72, leanX: -0.02, leanZ: -0.028, scale: 1 },
  { x: 0.44, z: 0.37, yaw: -0.86, leanX: 0.032, leanZ: 0.018, scale: 0.91 },
] as const;

const SPIKE_NOMINAL_HEIGHT = 0.24;
const SPIKE_HEIGHT_SCALES = [0.76, 1, 0.88, 1.08, 0.82] as const;
const SPIKE_RETRACTED_SCALE = 0.05;
const SPIKE_MODEL_BASE_Y = 0.164;
const SPIKE_MODEL_SOCKET_Y = 0.135;
const SPIKE_PLATE_WORLD_Y = 0.025;

/**
 * Image-derived forged spike profile. The reference uses uneven faceted tapers,
 * so a short four-ring custom buffer keeps a bent shoulder and off-axis tip
 * instead of the tall smooth silhouette of ConeGeometry.
 */
export function createForgedSpikeGeometry(): THREE.BufferGeometry {
  const sides = 4;
  const rings = [
    { y: 0, radius: 0.112, x: 0, z: 0 },
    { y: 0.045, radius: 0.12, x: -0.004, z: 0.004 },
    { y: 0.13, radius: 0.073, x: 0.004, z: -0.004 },
    { y: 0.205, radius: 0.029, x: 0.011, z: 0.004 },
  ] as const;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (const [ringIndex, ring] of rings.entries()) {
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2 + Math.PI / 4 + ringIndex * 0.09;
      positions.push(
        ring.x + Math.cos(angle) * ring.radius,
        ring.y,
        ring.z + Math.sin(angle) * ring.radius,
      );
      uvs.push(side / sides, ring.y / SPIKE_NOMINAL_HEIGHT);
      const upperWear = THREE.MathUtils.smoothstep(ring.y, 0.055, SPIKE_NOMINAL_HEIGHT);
      const facetVariation = [0.035, -0.025, 0.055, -0.01][side]!;
      const gain = 0.78 + upperWear * 0.64 + facetVariation;
      colors.push(gain * 1.03, gain, gain * 0.92);
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      const lower = ring * sides + side;
      const lowerNext = ring * sides + next;
      const upper = (ring + 1) * sides + side;
      const upperNext = (ring + 1) * sides + next;
      indices.push(lower, upper, lowerNext, lowerNext, upper, upperNext);
    }
  }
  const tip = positions.length / 3;
  positions.push(0.017, SPIKE_NOMINAL_HEIGHT, -0.007);
  uvs.push(0.5, 1);
  colors.push(1.72, 1.6, 1.42);
  const lastRing = (rings.length - 1) * sides;
  for (let side = 0; side < sides; side += 1) {
    indices.push(lastRing + side, tip, lastRing + ((side + 1) % sides));
  }
  const baseCenter = positions.length / 3;
  positions.push(0, 0, 0);
  uvs.push(0.5, 0);
  colors.push(0.74, 0.72, 0.67);
  for (let side = 0; side < sides; side += 1) {
    indices.push(baseCenter, (side + 1) % sides, side);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = "Image-sculpted forged hazard spike";
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.userData.apexWearGradient = {
    startY: 0.055,
    apexGain: 1.72,
    purpose: "top-view spike silhouette",
  };
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export interface ForgedIronTextureSet {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
}

interface HazardTextureLifecycle {
  active: boolean;
  textureSink?: SceneTextureSink;
  readonly ownedTextures: Set<THREE.Texture>;
}

function ownHazardTexture<T extends THREE.Texture>(
  lifecycle: HazardTextureLifecycle | undefined,
  texture: T,
  registerForPolicy = true,
): T {
  if (!lifecycle?.active) return texture;
  lifecycle.ownedTextures.add(texture);
  if (registerForPolicy) lifecycle.textureSink?.register(texture);
  return texture;
}

function dataTexture(
  data: Uint8Array,
  size: number,
  colorSpace: THREE.ColorSpace,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = colorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function configureForgedIronTexture(
  texture: THREE.Texture,
  name: string,
  sourcePath: string,
  colorSpace: THREE.ColorSpace,
): THREE.Texture {
  texture.name = name;
  texture.userData.sourcePath = sourcePath;
  texture.colorSpace = colorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.08, 1.08);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

type ForgedTextureField = "albedo" | "roughness" | "normal" | "ao";

/**
 * The ImageGen source carries useful forged variation, but its full 512 px grain reads as
 * aggregate at prop scale. Downsample and compress that contrast into broad, soft hammer marks.
 */
function loadFilteredForgedIronTexture(
  path: string,
  name: string,
  colorSpace: THREE.ColorSpace,
  field: ForgedTextureField,
  lifecycle?: HazardTextureLifecycle,
): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context) {
    context.fillStyle = field === "normal" ? "rgb(128 128 255)" : "rgb(72 72 72)";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const filtered = configureForgedIronTexture(
    new THREE.CanvasTexture(canvas),
    name,
    path,
    colorSpace,
  );
  const source = new THREE.TextureLoader(THREE.DefaultLoadingManager).load(path, (loaded) => {
    if (lifecycle && (!lifecycle.active || !lifecycle.ownedTextures.has(filtered))) {
      loaded.dispose();
      return;
    }
    if (!context || !loaded.image) {
      loaded.dispose();
      return;
    }
    const sample = document.createElement("canvas");
    sample.width = 20;
    sample.height = 20;
    const sampleContext = sample.getContext("2d", { willReadFrequently: true });
    if (!sampleContext) {
      loaded.dispose();
      return;
    }
    sampleContext.imageSmoothingEnabled = true;
    sampleContext.imageSmoothingQuality = "high";
    sampleContext.drawImage(loaded.image as CanvasImageSource, 0, 0, sample.width, sample.height);
    const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height);
    const data = pixels.data;
    if (field === "normal") {
      for (let index = 0; index < data.length; index += 4) {
        data[index] = 128 + (data[index]! - 128) * 0.2;
        data[index + 1] = 128 + (data[index + 1]! - 128) * 0.2;
        data[index + 2] = 255 - (255 - data[index + 2]!) * 0.28;
      }
    } else {
      const means = [0, 0, 0];
      const pixelCount = data.length / 4;
      for (let index = 0; index < data.length; index += 4) {
        means[0] += data[index]!;
        means[1] += data[index + 1]!;
        means[2] += data[index + 2]!;
      }
      means[0] /= pixelCount;
      means[1] /= pixelCount;
      means[2] /= pixelCount;
      const contrast = field === "albedo" ? 0.28 : field === "roughness" ? 0.16 : 0.2;
      for (let index = 0; index < data.length; index += 4) {
        data[index] = means[0]! + (data[index]! - means[0]!) * contrast;
        data[index + 1] = means[1]! + (data[index + 1]! - means[1]!) * contrast;
        data[index + 2] = means[2]! + (data[index + 2]! - means[2]!) * contrast;
      }
    }
    sampleContext.putImageData(pixels, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(sample, 0, 0, canvas.width, canvas.height);
    filtered.needsUpdate = true;
    lifecycle?.textureSink?.markRenderable(filtered);
    loaded.dispose();
  });
  source.name = `${name} source`;
  return ownHazardTexture(lifecycle, filtered);
}

function loadForgedIronTextureSet(lifecycle?: HazardTextureLifecycle): ForgedIronTextureSet {
  const albedo = loadFilteredForgedIronTexture(
    FORGED_IRON_PBR_PATHS.albedo,
    "ImageGen forged iron albedo",
    THREE.SRGBColorSpace,
    "albedo",
    lifecycle,
  );
  const roughness = loadFilteredForgedIronTexture(
    FORGED_IRON_PBR_PATHS.roughness,
    "ImageGen forged iron roughness",
    THREE.NoColorSpace,
    "roughness",
    lifecycle,
  );
  const normal = loadFilteredForgedIronTexture(
    FORGED_IRON_PBR_PATHS.normal,
    "ImageGen forged iron normal",
    THREE.NoColorSpace,
    "normal",
    lifecycle,
  );
  const ao = loadFilteredForgedIronTexture(
    FORGED_IRON_PBR_PATHS.ao,
    "ImageGen forged iron ambient occlusion",
    THREE.NoColorSpace,
    "ao",
    lifecycle,
  );
  ao.channel = 0;
  return { albedo, roughness, normal, ao };
}

/** Independent procedural PBR fields used only when images cannot load during SSR/tests. */
function createFallbackForgedIronTextureSet(
  size: number,
  lifecycle?: HazardTextureLifecycle,
): ForgedIronTextureSet {
  const albedo = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const ao = new Uint8Array(size * size * 4);
  const height = new Float32Array(size * size);
  const hash = (x: number, y: number, salt: number): number => {
    const value = Math.sin((x + salt * 13.1) * 12.9898 + (y - salt * 7.3) * 78.233) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixel = y * size + x;
      const offset = pixel * 4;
      const macroCell = Math.max(2, Math.floor(size / 8));
      const macro =
        (hash(Math.floor(x / macroCell), Math.floor(y / macroCell), 5) +
          hash(
            Math.floor((x + macroCell * 0.5) / macroCell),
            Math.floor((y + macroCell * 0.5) / macroCell),
            6,
          )) *
        0.5;
      const pitting = hash(x, y, 1);
      const rust = hash(Math.floor(x / 3), Math.floor(y / 3), 2);
      const value = Math.round(38 + macro * 9 + pitting * 13 + (rust > 0.78 ? 14 : 0));
      albedo.set([value + 4, value, Math.max(0, value - 3), 255], offset);
      const rough = Math.round(172 + hash(x, y, 3) * 45 + (rust > 0.72 ? 24 : 0));
      roughness.set([rough, rough, rough, 255], offset);
      const cavity = Math.round(185 + hash(x, y, 4) * 52 - (pitting > 0.84 ? 65 : 0));
      ao.set([cavity, cavity, cavity, 255], offset);
      height[pixel] = pitting * 0.7 + macro * 0.18 + (rust > 0.86 ? 0.12 : 0);
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sample = (sx: number, sy: number): number =>
        height[((sy + size) % size) * size + ((sx + size) % size)]!;
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * 0.75;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * 0.75;
      const vector = new THREE.Vector3(-dx, -dy, 1).normalize();
      const offset = (y * size + x) * 4;
      normal.set(
        [
          Math.round((vector.x * 0.5 + 0.5) * 255),
          Math.round((vector.y * 0.5 + 0.5) * 255),
          Math.round((vector.z * 0.5 + 0.5) * 255),
          255,
        ],
        offset,
      );
    }
  }
  const textures = {
    albedo: dataTexture(albedo, size, THREE.SRGBColorSpace),
    roughness: dataTexture(roughness, size, THREE.NoColorSpace),
    normal: dataTexture(normal, size, THREE.NoColorSpace),
    ao: dataTexture(ao, size, THREE.NoColorSpace),
  };
  textures.albedo.name = "Forged iron SSR fallback albedo";
  textures.roughness.name = "Forged iron SSR fallback roughness";
  textures.normal.name = "Forged iron SSR fallback normal";
  textures.ao.name = "Forged iron SSR fallback ambient occlusion";
  textures.ao.channel = 0;
  for (const texture of Object.values(textures)) ownHazardTexture(lifecycle, texture);
  return textures;
}

/** ImageGen black-iron PBR in browser, with a deterministic non-directional SSR fallback. */
export function createForgedIronTextureSet(
  size = 32,
  lifecycle?: HazardTextureLifecycle,
): ForgedIronTextureSet {
  return typeof document === "undefined"
    ? createFallbackForgedIronTextureSet(size, lifecycle)
    : loadForgedIronTextureSet(lifecycle);
}

function createForgedIronMaterial(
  textures: ForgedIronTextureSet,
  color: THREE.ColorRepresentation,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: textures.albedo,
    roughnessMap: textures.roughness,
    normalMap: textures.normal,
    normalScale: new THREE.Vector2(0.08, 0.08),
    aoMap: textures.ao,
    aoMapIntensity: 0.24,
    color,
    roughness: FORGED_IRON_ROUGHNESS,
    metalness: FORGED_IRON_METALNESS,
    envMapIntensity: FORGED_IRON_ENV_INTENSITY,
    emissive: 0xffffff,
    emissiveMap: textures.albedo,
    emissiveIntensity: FORGED_IRON_INDIRECT_FILL,
    side: THREE.DoubleSide,
  });
  material.name = "Shared image-sculpted forged iron PBR material";
  material.userData.materialRole = "readable-blackened-forged-iron";
  material.userData.indirectFill = FORGED_IRON_INDIRECT_FILL;
  return material;
}

function createForgedFrameMaterial(textures: ForgedIronTextureSet): THREE.MeshStandardMaterial {
  const material = createForgedIronMaterial(textures, FORGED_FRAME_MATERIAL_COLOR);
  material.name = "Raised blackened forged frame PBR material";
  material.metalness = FORGED_FRAME_METALNESS;
  material.roughness = FORGED_FRAME_ROUGHNESS;
  material.envMapIntensity = FORGED_FRAME_ENV_INTENSITY;
  material.emissiveIntensity = FORGED_FRAME_INDIRECT_FILL;
  material.normalScale.setScalar(0.035);
  material.aoMapIntensity = 0.14;
  material.userData.materialRole = "raised-blackened-forged-frame";
  material.userData.indirectFill = FORGED_FRAME_INDIRECT_FILL;
  return material;
}

/** Raised tips need a brighter diffuse response than the floor plate in torch gaps. */
function createForgedSpikeMaterial(textures: ForgedIronTextureSet): THREE.MeshStandardMaterial {
  const material = createForgedIronMaterial(textures, FORGED_SPIKE_MATERIAL_COLOR);
  material.name = "Readable image-sculpted forged spike PBR material";
  material.metalness = FORGED_SPIKE_METALNESS;
  material.roughness = FORGED_SPIKE_ROUGHNESS;
  material.envMapIntensity = FORGED_SPIKE_ENV_INTENSITY;
  material.emissiveIntensity = FORGED_SPIKE_INDIRECT_FILL;
  material.normalScale.setScalar(0.16);
  material.vertexColors = true;
  material.flatShading = true;
  material.needsUpdate = true;
  material.userData.indirectFill = FORGED_SPIKE_INDIRECT_FILL;
  return material;
}

function transformedGeometry(
  geometry: THREE.BufferGeometry,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
): THREE.BufferGeometry {
  geometry.rotateX(rotation[0]);
  geometry.rotateY(rotation[1]);
  geometry.rotateZ(rotation[2]);
  geometry.translate(...position);
  return geometry;
}

/** One closed socket unit: a low plinth physically overlaps its raised collar. */
function createSpikeSocketCollarGeometry(): THREE.BufferGeometry {
  const pieces = [
    transformedGeometry(new THREE.CylinderGeometry(0.085, 0.115, 0.07, 8), [0, 0, 0]),
    transformedGeometry(
      new THREE.TorusGeometry(0.105, 0.018, 4, 8),
      [0, 0.041, 0],
      [-Math.PI / 2, 0, 0],
    ),
  ];
  const geometry = mergeGeometries(pieces, false);
  pieces.forEach((piece) => piece.dispose());
  if (!geometry) throw new Error("Could not merge the spike socket collar geometry");
  geometry.name = "Visible forged socket plinth and collar";
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** One squat forged rivet with a broad head that remains clear in rear views. */
export function createSpikePlateRivetGeometry(tileSize = 2): THREE.BufferGeometry {
  const radius = tileSize * 0.031;
  const pieces = [
    transformedGeometry(
      new THREE.CylinderGeometry(radius * 0.62, radius * 0.72, 0.06, 8),
      [0, 0, 0],
    ),
    transformedGeometry(new THREE.CylinderGeometry(radius, radius * 0.82, 0.038, 8), [0, 0.043, 0]),
  ];
  const geometry = mergeGeometries(pieces, false);
  pieces.forEach((piece) => piece.dispose());
  if (!geometry) throw new Error("Could not merge the spike plate rivet geometry");
  geometry.name = "Broad headed forged corner rivet";
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function spikePlateRivetLayout(tileSize: number): readonly THREE.Vector3[] {
  const inset = tileSize * 0.31;
  return [
    new THREE.Vector3(-inset, 0.17, -inset),
    new THREE.Vector3(inset, 0.17, -inset),
    new THREE.Vector3(-inset, 0.17, inset),
    new THREE.Vector3(inset, 0.17, inset),
  ];
}

/** Low black-iron plate, four inset panels and a visible underside mechanism. */
export function createSpikePlateBaseGeometry(tileSize: number): THREE.BufferGeometry {
  const half = tileSize * 0.39;
  const rail = tileSize * 0.055;
  const panelSpan = half * 0.76;
  const panelOffset = half * 0.42;
  const pieces: THREE.BufferGeometry[] = [
    transformedGeometry(new THREE.BoxGeometry(half * 2, 0.1, half * 2), [0, 0.05, 0]),
    ...([-1, 1] as const).flatMap((xSign) =>
      ([-1, 1] as const).map((zSign) =>
        transformedGeometry(new THREE.BoxGeometry(panelSpan, 0.014, panelSpan), [
          xSign * panelOffset,
          0.107,
          zSign * panelOffset,
        ]),
      ),
    ),
    transformedGeometry(new THREE.BoxGeometry(half * 1.35, 0.055, rail), [0, -0.028, -half * 0.62]),
    transformedGeometry(new THREE.BoxGeometry(half * 1.35, 0.055, rail), [0, -0.028, half * 0.62]),
    transformedGeometry(new THREE.BoxGeometry(rail, 0.055, half * 1.35), [-half * 0.62, -0.028, 0]),
    transformedGeometry(new THREE.BoxGeometry(rail, 0.055, half * 1.35), [half * 0.62, -0.028, 0]),
    transformedGeometry(
      new THREE.BoxGeometry(half * 1.18, 0.065, rail * 1.25),
      [0, -0.065, 0],
      [0, Math.PI / 4, 0],
    ),
    transformedGeometry(
      new THREE.BoxGeometry(half * 1.18, 0.065, rail * 1.25),
      [0, -0.065, 0],
      [0, -Math.PI / 4, 0],
    ),
    transformedGeometry(new THREE.BoxGeometry(half * 0.46, 0.08, half * 0.46), [0, -0.078, 0]),
  ];
  const geometry = mergeGeometries(pieces, false);
  pieces.forEach((piece) => piece.dispose());
  if (!geometry) throw new Error("Could not merge the forged spike plate base geometry");
  geometry.name = "Image-sculpted layered forged spike plate base";
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Raised perimeter rails and corner gussets use a brighter specular forged finish. */
export function createSpikePlateFrameGeometry(tileSize: number): THREE.BufferGeometry {
  const half = tileSize * 0.39;
  const rail = tileSize * 0.055;
  const cornerInset = half - rail * 0.62;
  const pieces: THREE.BufferGeometry[] = [
    transformedGeometry(new THREE.BoxGeometry(half * 2, 0.08, rail), [0, 0.14, -half + rail * 0.5]),
    transformedGeometry(new THREE.BoxGeometry(half * 2, 0.08, rail), [0, 0.14, half - rail * 0.5]),
    transformedGeometry(new THREE.BoxGeometry(rail, 0.08, half * 2), [-half + rail * 0.5, 0.14, 0]),
    transformedGeometry(new THREE.BoxGeometry(rail, 0.08, half * 2), [half - rail * 0.5, 0.14, 0]),
    ...([-1, 1] as const).flatMap((xSign) =>
      ([-1, 1] as const).map((zSign) =>
        transformedGeometry(new THREE.BoxGeometry(rail * 1.28, 0.035, rail * 1.28), [
          xSign * cornerInset,
          0.16,
          zSign * cornerInset,
        ]),
      ),
    ),
  ];
  const geometry = mergeGeometries(pieces, false);
  pieces.forEach((piece) => piece.dispose());
  if (!geometry) throw new Error("Could not merge the raised spike plate frame geometry");
  geometry.name = "Separate raised forged spike plate frame";
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Static review/destruction model made from the same plate, collar and spike assets as runtime. */
export function createImageSculptedSpikePlate(tileSize = 2): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted five-spike plate";
  root.userData.partId = "root";
  const textures = createForgedIronTextureSet();
  const material = createForgedIronMaterial(textures, FORGED_IRON_MATERIAL_COLOR);
  const frameMaterial = createForgedFrameMaterial(textures);
  const spikeMaterial = createForgedSpikeMaterial(textures);
  const plateGeometry = createSpikePlateBaseGeometry(tileSize);
  const frameGeometry = createSpikePlateFrameGeometry(tileSize);
  const plate = new THREE.Mesh(plateGeometry, material);
  plate.name = "Inset blackened forged plate shell";
  plate.userData.partId = "plate-shell";
  plate.castShadow = true;
  plate.receiveShadow = true;
  const frame = new THREE.Mesh(frameGeometry, frameMaterial);
  frame.name = "Separate raised forged perimeter frame";
  frame.userData.partId = "raised-frame";
  frame.castShadow = true;
  frame.receiveShadow = true;
  root.add(plate, frame);

  const mechanism = new THREE.Group();
  mechanism.name = "Five-spike lift mechanism pivot";
  mechanism.userData.partId = "spike-mechanism";
  mechanism.userData.pivot = true;
  const spikeGeometry = createForgedSpikeGeometry();
  const spikes = new THREE.InstancedMesh(spikeGeometry, spikeMaterial, SPIKE_LAYOUT.length);
  spikes.name = "Five short forged spike instances";
  spikes.userData.partId = "forged-spikes";
  spikes.castShadow = true;
  const collarGeometry = createSpikeSocketCollarGeometry();
  const collars = new THREE.InstancedMesh(collarGeometry, frameMaterial, SPIKE_LAYOUT.length);
  collars.name = "Five forged socket collar instances";
  collars.userData.partId = "socket-collars";
  collars.userData.includesVisiblePlinth = true;
  collars.castShadow = true;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  for (const [index, layout] of SPIKE_LAYOUT.entries()) {
    const heightScale = SPIKE_HEIGHT_SCALES[index]!;
    position.set(layout.x, SPIKE_MODEL_BASE_Y, layout.z);
    euler.set(layout.leanX * 0.22, layout.yaw, layout.leanZ * 0.22);
    rotation.setFromEuler(euler);
    scale.set(layout.scale, heightScale, layout.scale);
    matrix.compose(position, rotation, scale);
    spikes.setMatrixAt(index, matrix);
    position.y = SPIKE_MODEL_SOCKET_Y;
    euler.set(0, layout.yaw * 0.35, 0);
    rotation.setFromEuler(euler);
    scale.setScalar(0.94 + (index % 3) * 0.025);
    matrix.compose(position, rotation, scale);
    collars.setMatrixAt(index, matrix);
  }
  const rivetGeometry = createSpikePlateRivetGeometry(tileSize);
  const rivetLayout = spikePlateRivetLayout(tileSize);
  const rivets = new THREE.InstancedMesh(rivetGeometry, frameMaterial, rivetLayout.length);
  rivets.name = "Four broad forged corner rivet instances";
  rivets.userData.partId = "corner-rivets";
  rivets.castShadow = true;
  rivetLayout.forEach((layout, index) => {
    matrix.compose(layout, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    rivets.setMatrixAt(index, matrix);
  });
  spikes.userData.heightScales = [...SPIKE_HEIGHT_SCALES];
  spikes.userData.nominalHeight = SPIKE_NOMINAL_HEIGHT;
  spikes.instanceMatrix.needsUpdate = true;
  collars.instanceMatrix.needsUpdate = true;
  rivets.instanceMatrix.needsUpdate = true;
  mechanism.add(collars, rivets, spikes);
  root.add(mechanism);
  root.userData.sculptRuntime = {
    sourceImage: "assets-source/imagegen/model-references-v2/ambient/spike-plate-three-view.png",
    materialTextures: FORGED_IRON_PBR_PATHS,
    specification: ".scratch/img2threejs/model-references-v2/ambient/spike-plate/spec.json",
    approximation: "procedural low-poly reconstruction from three generated views",
    family: "spike-plate",
    origin: "ground-contact",
    nodes: {
      "plate-shell": plate.name,
      "raised-frame": frame.name,
      "spike-mechanism": mechanism.name,
      "forged-spikes": spikes.name,
      "socket-collars": collars.name,
      "socket-plinths": collars.name,
      "corner-rivets": rivets.name,
    },
    sockets: {
      trigger: { name: "spike plate trigger", type: "hazard-trigger" },
      spikes: { name: "spike lift sockets", type: "linear-actuator" },
    },
    collider: { type: "box-trigger", size: [tileSize * 0.78, 0.58, tileSize * 0.78] },
    destructionGroups: {
      plate: ["plate-shell", "raised-frame"],
      mechanism: ["forged-spikes", "socket-collars", "socket-plinths", "corner-rivets"],
    },
    geometry: {
      triangles:
        (plateGeometry.index
          ? plateGeometry.index.count / 3
          : plateGeometry.getAttribute("position").count / 3) +
        (frameGeometry.index
          ? frameGeometry.index.count / 3
          : frameGeometry.getAttribute("position").count / 3) +
        (spikeGeometry.index!.count / 3 + collarGeometry.index!.count / 3) * SPIKE_LAYOUT.length +
        (rivetGeometry.index!.count / 3) * rivetLayout.length,
      materialBatches: 3,
      targetTriangles: 800,
      maxTriangles: 1200,
      mergeStrategy: "five instanced geometry batches over three forged-iron finishes",
    },
    ownedTextures: Object.values(textures),
  };
  return root;
}

function createHazardTexture(
  kind: HazardTileKind,
  mood: DungeonMoodId,
  lifecycle: HazardTextureLifecycle,
): THREE.Texture {
  const texture =
    typeof document === "undefined"
      ? new THREE.Texture()
      : new THREE.TextureLoader().load(HAZARD_ATLAS_PATH, (loaded) => {
          if (!lifecycle.active) return;
          lifecycle.textureSink?.markRenderable(loaded);
        });
  texture.name = `${mood} ${kind} imagegen hazard atlas`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.25, 0.25);
  texture.offset.set(0, HAZARD_ATLAS_ROW[kind]);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return ownHazardTexture(lifecycle, texture, typeof document !== "undefined");
}

interface HazardVisual {
  placement: HazardTilePlacement;
  position: THREE.Vector3;
  spikeStart: number;
}

export class HazardTileSystem {
  readonly root = new THREE.Group();
  readonly placements: readonly HazardTilePlacement[];
  private readonly visuals: HazardVisual[] = [];
  private readonly materials = new Map<HazardTileKind, THREE.MeshStandardMaterial>();
  private readonly spikeInstances: THREE.InstancedMesh | null;
  private readonly spikeMatrix = new THREE.Matrix4();
  private readonly spikePosition = new THREE.Vector3();
  private readonly spikeQuaternion = new THREE.Quaternion();
  private readonly spikeScale = new THREE.Vector3();
  private readonly spikeEuler = new THREE.Euler();
  private elapsed = 0;
  private fireCooldown = 0;
  private spikeCooldown = 0;
  private toxinTickCooldown = 0;
  private toxinRemaining = 0;
  private readonly textureLifecycle: HazardTextureLifecycle;
  private disposed = false;

  constructor(
    dungeon: DungeonData,
    mood: DungeonMood,
    tileSize: number,
    excludedCells: HazardCellExclusionQuery = EMPTY_HAZARD_EXCLUSION_QUERY,
    textureSink?: SceneTextureSink,
  ) {
    this.textureLifecycle = { active: true, textureSink, ownedTextures: new Set() };
    this.root.name = `${mood.label} hazard tiles`;
    this.placements = planHazardTiles(dungeon, mood.id, excludedCells);
    const tileGeometry = new THREE.PlaneGeometry(tileSize * 0.78, tileSize * 0.78);
    const placementsByKind = new Map<HazardTileKind, HazardTilePlacement[]>();
    for (const placement of this.placements) {
      const list = placementsByKind.get(placement.kind) ?? [];
      list.push(placement);
      placementsByKind.set(placement.kind, list);
    }
    const spikePlacements = placementsByKind.get("spikes") ?? [];
    const spikeGeometry = createForgedSpikeGeometry();
    const spikeColor = new THREE.Color(FORGED_IRON_MATERIAL_COLOR);
    const spikeInstanceTint = new THREE.Color(0xf2efeb).lerp(
      new THREE.Color(BIOME_ACCENTS[mood.id][0]),
      0.04,
    );
    const forgedTextures = createForgedIronTextureSet(32, this.textureLifecycle);
    const spikeMaterial = createForgedIronMaterial(forgedTextures, spikeColor);
    spikeMaterial.name = `${mood.id} inset blackened forged plate material`;
    const frameMaterial = createForgedFrameMaterial(forgedTextures);
    frameMaterial.name = `${mood.id} raised blackened forged frame material`;
    const raisedSpikeMaterial = createForgedSpikeMaterial(forgedTextures);
    raisedSpikeMaterial.name = `${mood.id} readable raised forged spike material`;
    const collarGeometry = createSpikeSocketCollarGeometry();
    const rivetGeometry = createSpikePlateRivetGeometry(tileSize);
    const rivetLayout = spikePlateRivetLayout(tileSize);

    const tileRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const tileScale = new THREE.Vector3(1, 1, 1);
    const tileMatrix = new THREE.Matrix4();
    const tilePosition = new THREE.Vector3();
    const identityQuaternion = new THREE.Quaternion();
    for (const [kind, placements] of placementsByKind) {
      const response = HAZARD_MATERIAL_RESPONSE[kind];
      const texture = createHazardTexture(kind, mood.id, this.textureLifecycle);
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        emissiveMap: kind === "spikes" ? null : texture,
        color: new THREE.Color(0xffffff).lerp(new THREE.Color(BIOME_ACCENTS[mood.id][0]), 0.08),
        emissive: new THREE.Color(BIOME_ACCENTS[mood.id][0]),
        emissiveIntensity: response.emissiveBase,
        roughness: response.roughness,
        metalness: response.metalness,
        envMapIntensity: kind === "ice" ? 0.42 : 0.24,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      material.name = `${mood.id} ${kind} hazard material`;
      this.materials.set(kind, material);
      const batch = new THREE.InstancedMesh(tileGeometry, material, placements.length);
      batch.name = `${kind} hazard tile batch`;
      batch.receiveShadow = false;
      placements.forEach((placement, index) => {
        const worldPosition = gridToWorld(dungeon, placement.cell, tileSize);
        tilePosition.set(worldPosition.x, SPIKE_PLATE_WORLD_Y, worldPosition.z);
        tileMatrix.compose(tilePosition, tileRotation, tileScale);
        batch.setMatrixAt(index, tileMatrix);
        this.visuals.push({
          placement,
          position: new THREE.Vector3(worldPosition.x, 0, worldPosition.z),
          spikeStart: -1,
        });
      });
      batch.instanceMatrix.needsUpdate = true;
      this.root.add(batch);
    }

    if (spikePlacements.length > 0) {
      const count = spikePlacements.length * SPIKE_LAYOUT.length;
      const plateGeometry = createSpikePlateBaseGeometry(tileSize);
      const frameGeometry = createSpikePlateFrameGeometry(tileSize);
      const plateInstances = new THREE.InstancedMesh(
        plateGeometry,
        spikeMaterial,
        spikePlacements.length,
      );
      plateInstances.name = "Image-sculpted layered spike plate base batch";
      plateInstances.userData.partId = "plate-shell";
      const frameInstances = new THREE.InstancedMesh(
        frameGeometry,
        frameMaterial,
        spikePlacements.length,
      );
      frameInstances.name = "Separate raised forged spike plate frame batch";
      frameInstances.userData.partId = "raised-frame";
      frameInstances.castShadow = true;
      const rivetInstances = new THREE.InstancedMesh(
        rivetGeometry,
        frameMaterial,
        spikePlacements.length * rivetLayout.length,
      );
      rivetInstances.name = "Four forged corner rivet batch";
      rivetInstances.userData.partId = "corner-rivets";
      rivetInstances.castShadow = true;
      let rivetInstance = 0;
      spikePlacements.forEach((placement, index) => {
        const worldPosition = gridToWorld(dungeon, placement.cell, tileSize);
        tilePosition.set(worldPosition.x, SPIKE_PLATE_WORLD_Y, worldPosition.z);
        tileMatrix.compose(tilePosition, identityQuaternion, tileScale);
        plateInstances.setMatrixAt(index, tileMatrix);
        frameInstances.setMatrixAt(index, tileMatrix);
        for (const localRivet of rivetLayout) {
          tilePosition.set(
            worldPosition.x + localRivet.x,
            SPIKE_PLATE_WORLD_Y + localRivet.y,
            worldPosition.z + localRivet.z,
          );
          tileMatrix.compose(tilePosition, identityQuaternion, tileScale);
          rivetInstances.setMatrixAt(rivetInstance, tileMatrix);
          rivetInstance += 1;
        }
      });
      plateInstances.instanceMatrix.needsUpdate = true;
      frameInstances.instanceMatrix.needsUpdate = true;
      rivetInstances.instanceMatrix.needsUpdate = true;
      this.spikeInstances = new THREE.InstancedMesh(spikeGeometry, raisedSpikeMaterial, count);
      this.spikeInstances.name = "Image-sculpted forged spike batch";
      this.spikeInstances.userData.partId = "forged-spikes";
      this.spikeInstances.userData.heightScales = [...SPIKE_HEIGHT_SCALES];
      this.spikeInstances.userData.nominalHeight = SPIKE_NOMINAL_HEIGHT;
      this.spikeInstances.userData.retractedScale = SPIKE_RETRACTED_SCALE;
      this.spikeInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const collarInstances = new THREE.InstancedMesh(collarGeometry, frameMaterial, count);
      collarInstances.name = "Forged spike socket collar batch";
      collarInstances.userData.partId = "socket-collars";
      collarInstances.userData.includesVisiblePlinth = true;
      const color = new THREE.Color();
      let instance = 0;
      for (const placement of spikePlacements) {
        const visual = this.visuals.find((entry) => entry.placement === placement);
        if (!visual) continue;
        visual.spikeStart = instance;
        for (const [localIndex, layout] of SPIKE_LAYOUT.entries()) {
          const colorGain = 0.9 + ((localIndex + instance) % 3) * 0.045;
          color.copy(spikeInstanceTint).multiplyScalar(colorGain);
          this.spikeInstances.setColorAt(instance, color);
          this.spikePosition.set(
            visual.position.x + layout.x,
            SPIKE_PLATE_WORLD_Y + SPIKE_MODEL_BASE_Y,
            visual.position.z + layout.z,
          );
          this.spikeEuler.set(layout.leanX * 0.22, layout.yaw, layout.leanZ * 0.22);
          this.spikeQuaternion.setFromEuler(this.spikeEuler);
          this.spikeScale.set(layout.scale, SPIKE_RETRACTED_SCALE, layout.scale);
          this.spikeMatrix.compose(this.spikePosition, this.spikeQuaternion, this.spikeScale);
          this.spikeInstances.setMatrixAt(instance, this.spikeMatrix);

          this.spikePosition.y = SPIKE_PLATE_WORLD_Y + SPIKE_MODEL_SOCKET_Y;
          this.spikeEuler.set(0, layout.yaw * 0.35, 0);
          this.spikeQuaternion.setFromEuler(this.spikeEuler);
          this.spikeScale.setScalar(0.92 + localIndex * 0.018);
          this.spikeMatrix.compose(this.spikePosition, this.spikeQuaternion, this.spikeScale);
          collarInstances.setMatrixAt(instance, this.spikeMatrix);
          instance += 1;
        }
      }
      this.spikeInstances.instanceMatrix.needsUpdate = true;
      if (this.spikeInstances.instanceColor) this.spikeInstances.instanceColor.needsUpdate = true;
      collarInstances.instanceMatrix.needsUpdate = true;
      const mechanism = new THREE.Group();
      mechanism.name = "Five-spike lift mechanism pivot";
      mechanism.userData.partId = "spike-mechanism";
      mechanism.userData.pivot = true;
      mechanism.add(collarInstances, rivetInstances, this.spikeInstances);
      this.root.add(plateInstances, frameInstances, mechanism);
    } else {
      this.spikeInstances = null;
      spikeGeometry.dispose();
      spikeMaterial.dispose();
      frameMaterial.dispose();
      raisedSpikeMaterial.dispose();
      collarGeometry.dispose();
      rivetGeometry.dispose();
      Object.values(forgedTextures).forEach((texture) => {
        this.textureLifecycle.textureSink?.unregister(texture);
        this.textureLifecycle.ownedTextures.delete(texture);
        texture.dispose();
      });
    }
    this.root.userData.sculptRuntime = {
      sourceImage: "assets-source/imagegen/model-references-v2/ambient/spike-plate-three-view.png",
      surfaceAtlas: HAZARD_ATLAS_PATH,
      materialTextures: FORGED_IRON_PBR_PATHS,
      specification: ".scratch/img2threejs/model-references-v2/ambient/spike-plate/spec.json",
      approximation: "procedural low-poly reconstruction from three generated views",
      nodes: {
        "plate-shell": "Image-sculpted layered spike plate base batch",
        "raised-frame": "Separate raised forged spike plate frame batch",
        "forged-spikes": "Image-sculpted forged spike batch",
        "socket-collars": "Forged spike socket collar batch",
        "socket-plinths": "Forged spike socket collar batch",
        "corner-rivets": "Four forged corner rivet batch",
        "underside-rails": "Image-sculpted layered spike plate base batch",
      },
      sockets: {
        trigger: { name: "spike plate trigger", type: "hazard-trigger" },
        spikes: { name: "spike lift sockets", type: "linear-actuator" },
      },
      collider: { type: "box-trigger", size: [tileSize * 0.78, 0.55, tileSize * 0.78] },
      destructionGroups: {
        plate: ["plate-shell", "raised-frame", "underside-rails"],
        mechanism: ["forged-spikes", "socket-collars", "socket-plinths", "corner-rivets"],
      },
      geometry: {
        spikeTriangles: spikeGeometry.index!.count / 3,
        socketTriangles: collarGeometry.index!.count / 3,
        nominalSpikeHeight: SPIKE_NOMINAL_HEIGHT,
        spikeCountPerPlate: SPIKE_LAYOUT.length,
        rivetTriangles: rivetGeometry.index!.count / 3,
        rivetCountPerPlate: rivetLayout.length,
        materialBatches: 3,
        maxTrianglesPerPlate: 3000,
      },
      drawStrategy:
        "inset charcoal plate, raised perimeter frame and animated spikes use three forged finishes",
    };
  }

  update(delta: number): void {
    this.elapsed += Math.max(0, delta);
    const frame =
      HAZARD_ANIMATION_FRAMES[Math.floor(this.elapsed * 3.5) % HAZARD_ANIMATION_FRAMES.length]!;
    for (const [kind, material] of this.materials) {
      if (material.map) material.map.offset.x = (kind === "spikes" ? 0 : frame) * 0.25;
      const response = HAZARD_MATERIAL_RESPONSE[kind];
      material.emissiveIntensity =
        response.emissiveBase + (Math.sin(this.elapsed * 4.2) * 0.5 + 0.5) * response.emissivePulse;
    }
    if (!this.spikeInstances) return;
    for (const visual of this.visuals) {
      if (visual.spikeStart < 0) continue;
      const exposure = computeSpikeExposure(this.elapsed, visual.placement.phase);
      for (const [localIndex, layout] of SPIKE_LAYOUT.entries()) {
        const instance = visual.spikeStart + localIndex;
        const stagger = 0.92 + ((localIndex + 2) % 3) * 0.045;
        const lift = THREE.MathUtils.clamp(exposure * stagger, 0, 1);
        const heightScale = THREE.MathUtils.lerp(
          SPIKE_RETRACTED_SCALE,
          SPIKE_HEIGHT_SCALES[localIndex]!,
          lift,
        );
        this.spikePosition.set(
          visual.position.x + layout.x,
          SPIKE_PLATE_WORLD_Y + SPIKE_MODEL_BASE_Y,
          visual.position.z + layout.z,
        );
        this.spikeEuler.set(layout.leanX * 0.22, layout.yaw, layout.leanZ * 0.22);
        this.spikeQuaternion.setFromEuler(this.spikeEuler);
        this.spikeScale.set(layout.scale, heightScale, layout.scale);
        this.spikeMatrix.compose(this.spikePosition, this.spikeQuaternion, this.spikeScale);
        this.spikeInstances.setMatrixAt(instance, this.spikeMatrix);
      }
    }
    this.spikeInstances.instanceMatrix.needsUpdate = true;
  }

  sample(
    delta: number,
    player: THREE.Vector3,
    traversal: HazardTraversalState = {},
  ): HazardSurfaceEffect {
    let contactKind: HazardTileKind | null = null;
    let spikeExposure = 0;
    if (!traversal.airborne && !traversal.immune) {
      for (const visual of this.visuals) {
        if (
          Math.hypot(player.x - visual.position.x, player.z - visual.position.z) >
          HAZARD_CONTACT_RADIUS
        ) {
          continue;
        }
        contactKind = visual.placement.kind;
        if (contactKind === "spikes") {
          spikeExposure = computeSpikeExposure(this.elapsed, visual.placement.phase);
        }
        break;
      }
    }
    const result = tickHazardTraversal(
      {
        fireCooldown: this.fireCooldown,
        spikeCooldown: this.spikeCooldown,
        toxinTickCooldown: this.toxinTickCooldown,
        toxinRemaining: this.toxinRemaining,
      },
      {
        delta,
        contactKind,
        spikeExposure,
        airborne: Boolean(traversal.airborne),
        immune: Boolean(traversal.immune),
      },
    );
    this.fireCooldown = result.clocks.fireCooldown;
    this.spikeCooldown = result.clocks.spikeCooldown;
    this.toxinTickCooldown = result.clocks.toxinTickCooldown;
    this.toxinRemaining = result.clocks.toxinRemaining;
    return result.effect;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.textureLifecycle.active = false;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    let cleanupError: unknown;
    let hasCleanupError = false;
    const clean = (dispose: () => void): void => {
      try {
        dispose();
      } catch (error) {
        if (!hasCleanupError) {
          hasCleanupError = true;
          cleanupError = error;
        }
      }
    };
    try {
      for (const texture of this.textureLifecycle.ownedTextures) {
        textures.add(texture);
        clean(() => this.textureLifecycle.textureSink?.unregister(texture));
      }
      this.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        const entries = Array.isArray(object.material) ? object.material : [object.material];
        entries.forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => clean(() => geometry.dispose()));
      materials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial) {
          for (const texture of [
            material.map,
            material.emissiveMap,
            material.normalMap,
            material.roughnessMap,
            material.metalnessMap,
            material.aoMap,
          ]) {
            if (texture) textures.add(texture);
          }
        }
        clean(() => material.dispose());
      });
      textures.forEach((texture) => clean(() => texture.dispose()));
    } finally {
      this.textureLifecycle.textureSink = undefined;
      this.textureLifecycle.ownedTextures.clear();
      this.root.clear();
    }
    if (hasCleanupError) throw cleanupError;
  }
}
