import * as THREE from "three";
import type { DungeonMoodId } from "../systems/DungeonMood";
import { getShaderProgramModeRegistry } from "../systems/ShaderProgramMode";
import type { SceneTextureSink } from "../systems/SceneTextureRegistry";
import type { BiomeSurfaceTextures } from "./AssetLibrary";
import {
  registerTextureSource,
  resolveTextureSource,
  unlinkTextureClone,
} from "./TextureTreatment";

const textureLoader = new THREE.TextureLoader();

export interface DungeonMaterialTextureLifecycle {
  active: boolean;
  textureSink?: SceneTextureSink;
  readonly ownedTextures: Set<THREE.Texture>;
}

const materialTextureLifecycles = new WeakMap<DungeonMaterials, DungeonMaterialTextureLifecycle>();

export function dungeonMaterialTextureLifecycle(
  materials: DungeonMaterials,
): DungeonMaterialTextureLifecycle | undefined {
  return materialTextureLifecycles.get(materials);
}

export function registerDungeonMaterialTexture<T extends THREE.Texture>(
  lifecycle: DungeonMaterialTextureLifecycle | undefined,
  texture: T,
  registerForPolicy = true,
): T {
  if (!lifecycle?.active) return texture;
  lifecycle.ownedTextures.add(texture);
  if (registerForPolicy) lifecycle.textureSink?.register(texture);
  return texture;
}

export function completeDungeonMaterialTextureLoad(
  lifecycle: DungeonMaterialTextureLifecycle | undefined,
  texture: THREE.Texture,
  prepare?: (loaded: THREE.Texture) => void,
): void {
  if (!lifecycle?.active) return;
  prepare?.(texture);
  lifecycle.textureSink?.markRenderable(texture);
}

/** ImageGen-authored albedo families with independent derived PBR channels. */
const PBR_FAMILIES = [
  "aged-oak",
  "black-iron",
  "dull-brass",
  "dungeon-stone",
  "ash-ceramic",
  "aged-bone",
  "woven-cloth",
  "dungeon-ice",
  "arcane-crystal",
  "root-bark",
  "ochre-painted-steel",
] as const;
type PbrFamily = (typeof PBR_FAMILIES)[number];

const PBR_REPEATS: Record<PbrFamily, readonly [number, number]> = {
  "aged-oak": [1.2, 1.8],
  "black-iron": [1.35, 1.35],
  "dull-brass": [1.25, 1.25],
  "dungeon-stone": [1.15, 1.15],
  "ash-ceramic": [1.2, 1.2],
  "aged-bone": [1.1, 1.1],
  "woven-cloth": [1.5, 1.5],
  "dungeon-ice": [1.1, 1.1],
  "arcane-crystal": [1.1, 1.1],
  "root-bark": [0.55, 0.85],
  "ochre-painted-steel": [1.25, 1.25],
};

/** Preserve the old 2x2 texel density while uploading each 512 px source only once. */
export const MODEL_PBR_SOURCE_REPEAT_SCALE = 2;

interface PbrMapSet {
  albedo: THREE.Texture | null;
  normal: THREE.Texture | null;
  roughness: THREE.Texture | null;
  ao: THREE.Texture | null;
}

/**
 * Load a PBR map set from the dungeon clutter concept kit. Albedos use sRGB;
 * normal/roughness are linear data textures. Each map is registered with the
 * source-image path and GPU mirrored repeat so a 512 px map stays 512 px in memory.
 * Falls back to `null` when document is unavailable (SSR/tests) — callers
 * keep their procedural fallback in that case.
 */
function loadPbrMaps(
  family: PbrFamily,
  compact: boolean,
  lifecycle: DungeonMaterialTextureLifecycle,
): PbrMapSet {
  if (typeof document === "undefined")
    return { albedo: null, normal: null, roughness: null, ao: null };
  const base = `/assets/textures/model-materials-v2/${family}/${family}`;
  const albedo = textureLoader.load(`${base}_albedo.webp`, (loaded) =>
    completeDungeonMaterialTextureLoad(lifecycle, loaded, resolveTextureSource),
  );
  registerTextureSource(albedo, `${base}_albedo.webp`, { seam: "none" });
  albedo.colorSpace = THREE.SRGBColorSpace;
  const normal = compact
    ? null
    : textureLoader.load(`${base}_normal.webp`, (loaded) =>
        completeDungeonMaterialTextureLoad(lifecycle, loaded, resolveTextureSource),
      );
  if (normal) {
    registerTextureSource(normal, `${base}_normal.webp`, { seam: "none" });
    normal.colorSpace = THREE.NoColorSpace;
  }
  const roughness = compact
    ? null
    : textureLoader.load(`${base}_roughness.webp`, (loaded) =>
        completeDungeonMaterialTextureLoad(lifecycle, loaded, resolveTextureSource),
      );
  if (roughness) {
    registerTextureSource(roughness, `${base}_roughness.webp`, { seam: "none" });
    roughness.colorSpace = THREE.NoColorSpace;
  }
  const ao = compact
    ? null
    : textureLoader.load(`${base}_ao.webp`, (loaded) =>
        completeDungeonMaterialTextureLoad(lifecycle, loaded, resolveTextureSource),
      );
  if (ao) {
    registerTextureSource(ao, `${base}_ao.webp`, { seam: "none" });
    ao.colorSpace = THREE.NoColorSpace;
    // Three defaults aoMap to UV1. Procedural props share a well-formed UV0
    // but do not duplicate it, so select UV0 explicitly.
    ao.channel = 0;
  }
  for (const texture of [albedo, normal, roughness, ao]) {
    if (texture === null) continue;
    texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
    texture.repeat.set(
      PBR_REPEATS[family][0] * MODEL_PBR_SOURCE_REPEAT_SCALE,
      PBR_REPEATS[family][1] * MODEL_PBR_SOURCE_REPEAT_SCALE,
    );
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    registerDungeonMaterialTexture(lifecycle, texture);
  }
  return { albedo, normal, roughness, ao };
}

export interface DungeonMaterials {
  stone: THREE.MeshStandardMaterial;
  darkStone: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  root: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  paintedSteel: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  bone: THREE.MeshStandardMaterial;
  ceramic: THREE.MeshStandardMaterial;
  crystal: THREE.MeshStandardMaterial;
  ice: THREE.MeshStandardMaterial;
}

const ROLE_BASE_COLORS: Record<keyof DungeonMaterials, number> = {
  stone: 0xc4c2b8,
  darkStone: 0xa1a29d,
  wood: 0xbda88e,
  root: 0x9a8a72,
  iron: 0xc0c4c2,
  paintedSteel: 0xb5a276,
  brass: 0xc0a75f,
  cloth: 0x9f8790,
  bone: 0xc9c4a6,
  ceramic: 0xb8b0aa,
  crystal: 0xa4c3c6,
  ice: 0xa4c9d0,
};

const BIOME_TINT_WEIGHT: Record<keyof DungeonMaterials, number> = {
  stone: 0.4,
  darkStone: 0.44,
  wood: 0.25,
  root: 0.34,
  iron: 0.07,
  paintedSteel: 0.12,
  brass: 0.1,
  cloth: 0.3,
  bone: 0.24,
  ceramic: 0.32,
  crystal: 0.14,
  ice: 0.18,
};

interface PropFinish {
  roughness: number;
  metalness: number;
  envMapIntensity: number;
  /** Small albedo bounce for matte dielectrics; metals must receive scene light. */
  indirectFill?: number;
}

/** Role-specific finish keeps the shared material set from becoming one glossy tint. */
const PROP_FINISH: Record<keyof DungeonMaterials, PropFinish> = {
  stone: { roughness: 0.96, metalness: 0.02, envMapIntensity: 0.18, indirectFill: 0.14 },
  darkStone: { roughness: 0.98, metalness: 0.01, envMapIntensity: 0.18, indirectFill: 0.18 },
  wood: { roughness: 0.9, metalness: 0.02, envMapIntensity: 0.24, indirectFill: 0.16 },
  root: { roughness: 0.92, metalness: 0, envMapIntensity: 0.22, indirectFill: 0.18 },
  // Old wrought iron carries oxide and soot, so a mixed metal response reads
  // more truthfully than a near-solid conductor under the dungeon's low IBL.
  iron: { roughness: 0.74, metalness: 0.42, envMapIntensity: 1.1 },
  paintedSteel: { roughness: 0.82, metalness: 0.46, envMapIntensity: 0.5 },
  brass: { roughness: 0.66, metalness: 0.52, envMapIntensity: 0.68 },
  cloth: { roughness: 1, metalness: 0, envMapIntensity: 0.12, indirectFill: 0.1 },
  bone: { roughness: 0.95, metalness: 0, envMapIntensity: 0.16, indirectFill: 0.1 },
  ceramic: { roughness: 0.86, metalness: 0.02, envMapIntensity: 0.25, indirectFill: 0.1 },
  crystal: { roughness: 0.48, metalness: 0.08, envMapIntensity: 0.48 },
  ice: { roughness: 0.5, metalness: 0.02, envMapIntensity: 0.42 },
};

interface BaseMaterialMaps {
  map: THREE.Texture | null;
  bumpMap: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  aoMap: THREE.Texture | null;
}

/**
 * Pull shared prop materials into the active biome without flattening their
 * wood/metal/stone identity. Base colors are captured once so changing seed or
 * biome never stacks the tint.
 */
export function applyMoodToDungeonMaterials(
  materials: DungeonMaterials,
  surfaceTint: number,
  strength = 1,
): void {
  const tint = new THREE.Color(surfaceTint);
  const filtered = new THREE.Color();
  const safeStrength = THREE.MathUtils.clamp(strength, 0, 1.2);
  for (const [key, material] of Object.entries(materials) as Array<
    [keyof DungeonMaterials, THREE.MeshStandardMaterial]
  >) {
    // Browser PBR maps start with a white multiplier. Using that runtime color
    // as the tint base made wood, iron, brass, and stone converge to one pale
    // biome color. Keep a stable role color in both PBR and fallback paths.
    const storedBase = material.userData.baseDungeonColor as number | undefined;
    const baseHex =
      storedBase === undefined || storedBase === 0xffffff ? ROLE_BASE_COLORS[key] : storedBase;
    material.userData.baseDungeonColor = baseHex;
    material.color.setHex(baseHex);
    filtered.copy(material.color).multiply(tint);
    material.color.lerp(
      filtered,
      THREE.MathUtils.clamp(safeStrength * BIOME_TINT_WEIGHT[key], 0, 0.52),
    );
    const finish = PROP_FINISH[key];
    material.roughness = material.userData.absoluteRoughnessMap ? 1 : finish.roughness;
    material.metalness = finish.metalness;
    material.envMapIntensity = finish.envMapIntensity;
    material.emissiveMap = null;
    if (finish.indirectFill !== undefined) {
      // Cheap indirect bounce from the actual albedo map. It restores surface
      // detail in torch gaps while staying below authored signal materials.
      material.emissive.copy(material.color);
      material.emissiveMap = material.map;
      material.emissiveIntensity = finish.indirectFill;
    } else if (key !== "crystal" && key !== "ice") {
      // Metals and unlit utility roles should never self-light through an old
      // shared map when a biome is applied more than once.
      material.emissive.set(0x000000);
      material.emissiveIntensity = 0;
    }
  }
}

function restorePropMaterialMaps(material: THREE.MeshStandardMaterial): void {
  const priorClones = material.userData.biomePropTextureClones as THREE.Texture[] | undefined;
  priorClones?.forEach((texture) => {
    unlinkTextureClone(texture);
    texture.dispose();
  });
  delete material.userData.biomePropTextureClones;
  const base = material.userData.baseDungeonMaps as BaseMaterialMaps | undefined;
  if (base) {
    material.map = base.map;
    material.bumpMap = base.bumpMap;
    material.normalMap = base.normalMap;
    material.roughnessMap = base.roughnessMap;
    material.aoMap = base.aoMap;
  }
  material.userData.biomeMasonryBound = false;
  material.needsUpdate = true;
}

/**
 * Room surfaces own each biome's floor, wall, and ceiling plates. Shared props
 * keep their authored PBR role maps so rubble does not turn into brickwork and
 * carved cavities do not inherit floor tiles. `applyMoodToDungeonMaterials`
 * supplies the restrained palette response that ties them into the room.
 */
export function applyBiomeMapsToDungeonMaterials(
  materials: DungeonMaterials,
  biome: BiomeSurfaceTextures,
  moodId: DungeonMoodId,
): void {
  void biome;
  for (const material of [materials.stone, materials.darkStone]) {
    restorePropMaterialMaps(material);
    material.userData.biomePropMoodId = moodId;
  }
}

function surfaceTexture(
  kind: "wood" | "stone" | "metal" | "cloth",
  height = false,
  lifecycle?: DungeonMaterialTextureLifecycle,
): THREE.DataTexture {
  const data = new Uint8Array(128 * 128 * 4);
  let state = kind.length * 9973 + (height ? 41 : 17);
  const random = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const base =
    kind === "wood"
      ? [59, 48, 39]
      : kind === "stone"
        ? [74, 75, 71]
        : kind === "metal"
          ? [38, 41, 40]
          : [48, 44, 45];
  for (let y = 0; y < 128; y += 1)
    for (let x = 0; x < 128; x += 1) {
      const grain =
        kind === "wood"
          ? Math.sin(x * 0.18 + Math.sin(y * 0.045)) * 3.5
          : kind === "stone"
            ? Math.sin(x * 0.11) * Math.cos(y * 0.14) * 8
            : 0;
      const scratch = kind === "metal" && (x * 5 + y * 11) % 83 < 2 ? 18 : 0;
      const noise = (random() - 0.5) * (kind === "cloth" ? 16 : 24);
      const value = 128 + grain + scratch + noise;
      const index = (y * 128 + x) * 4;
      data[index] = height
        ? value
        : THREE.MathUtils.clamp(base[0]! + grain + scratch + noise, 0, 255);
      data[index + 1] = height
        ? value
        : THREE.MathUtils.clamp(base[1]! + grain + scratch + noise, 0, 255);
      data[index + 2] = height
        ? value
        : THREE.MathUtils.clamp(base[2]! + grain + scratch + noise, 0, 255);
      data[index + 3] = 255;
    }
  const texture = new THREE.DataTexture(data, 128, 128, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.colorSpace = height ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === "wood" ? 2 : 3, kind === "wood" ? 4 : 3);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  return registerDungeonMaterialTexture(lifecycle, texture);
}

function generatedAlbedo(
  path: string,
  repeat: readonly [number, number],
  lifecycle: DungeonMaterialTextureLifecycle,
): THREE.Texture {
  const texture =
    typeof document === "undefined"
      ? new THREE.Texture()
      : textureLoader.load(path, (loaded) =>
          completeDungeonMaterialTextureLoad(lifecycle, loaded, resolveTextureSource),
        );
  registerTextureSource(texture, path, true);
  texture.name = path;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.generateMipmaps = true;
  return registerDungeonMaterialTexture(lifecycle, texture, typeof document !== "undefined");
}

function shared<T extends THREE.Material>(material: T): T {
  material.userData.sharedDungeonMaterial = true;
  return material;
}

const dungeonMaterialVariantCache = new Map<string, THREE.MeshStandardMaterial>();

/** Drop all cached finish variants (tests / full material graph rebuild). */
export function clearDungeonMaterialVariantCache(): void {
  for (const material of dungeonMaterialVariantCache.values()) material.dispose();
  dungeonMaterialVariantCache.clear();
}

/** Drop variants whose base uuid belongs to this materials set. */
export function clearDungeonMaterialVariantsFor(materials: DungeonMaterials): void {
  const prefixes = Object.values(materials).map((material) => `${material.uuid}::`);
  for (const [key, variant] of dungeonMaterialVariantCache.entries()) {
    if (!prefixes.some((prefix) => key.startsWith(prefix))) continue;
    variant.dispose();
    dungeonMaterialVariantCache.delete(key);
  }
}

export function dungeonMaterialVariantCacheSize(): number {
  return dungeonMaterialVariantCache.size;
}

/**
 * Stable token for one DungeonMaterials set. All roles are created together, so
 * wood.uuid identifies the set for prop-batch cache keys.
 */
export function dungeonMaterialsCacheToken(materials: DungeonMaterials): string {
  return materials.wood.uuid;
}

/**
 * Clone a shared dungeon material once per finish key. Prop kits reuse the same
 * variant object so the renderer does not accumulate one material per template.
 * Configure must not mutate the material after this returns.
 */
export function getDungeonMaterialVariant(
  base: THREE.MeshStandardMaterial,
  key: string,
  configure: (material: THREE.MeshStandardMaterial) => void,
): THREE.MeshStandardMaterial {
  // Include shader program mode so glsl/tsl finish variants never collide.
  const cacheKey = `${base.uuid}::${getShaderProgramModeRegistry().mode}::${key}`;
  const hit = dungeonMaterialVariantCache.get(cacheKey);
  if (hit) return hit;
  const material = base.clone();
  configure(material);
  material.userData.sharedDungeonMaterialVariant = true;
  material.userData.variantKey = cacheKey;
  material.userData.variantBaseUuid = base.uuid;
  dungeonMaterialVariantCache.set(cacheKey, material);
  return material;
}

export function createDungeonMaterials({
  compact = false,
  textureSink,
}: { compact?: boolean; textureSink?: SceneTextureSink } = {}): DungeonMaterials {
  const textureLifecycle: DungeonMaterialTextureLifecycle = {
    active: true,
    textureSink,
    ownedTextures: new Set(),
  };
  // ImageGen albedos provide the authored color layer. Height, normal,
  // roughness, and AO remain separate derived data channels.
  const stonePbr = loadPbrMaps("dungeon-stone", compact, textureLifecycle);
  const woodPbr = loadPbrMaps("aged-oak", compact, textureLifecycle);
  const rootPbr = loadPbrMaps("root-bark", compact, textureLifecycle);
  const ironPbr = loadPbrMaps("black-iron", compact, textureLifecycle);
  const paintedSteelPbr = loadPbrMaps("ochre-painted-steel", compact, textureLifecycle);
  const brassPbr = loadPbrMaps("dull-brass", compact, textureLifecycle);
  const ceramicPbr = loadPbrMaps("ash-ceramic", compact, textureLifecycle);
  const clothPbr = loadPbrMaps("woven-cloth", compact, textureLifecycle);
  const bonePbr = loadPbrMaps("aged-bone", compact, textureLifecycle);
  const crystalPbr = loadPbrMaps("arcane-crystal", compact, textureLifecycle);
  const icePbr = loadPbrMaps("dungeon-ice", compact, textureLifecycle);
  const needsProceduralFallback = typeof document === "undefined";

  const woodMap =
    woodPbr.albedo ??
    generatedAlbedo(
      "/assets/textures/generated/iron-ash-prop-oak-v1.webp",
      [2, 4],
      textureLifecycle,
    );
  const woodHeight = needsProceduralFallback
    ? surfaceTexture("wood", true, textureLifecycle)
    : woodMap;
  const stoneMap = stonePbr.albedo ?? surfaceTexture("stone", false, textureLifecycle);
  const stoneHeight = needsProceduralFallback
    ? surfaceTexture("stone", true, textureLifecycle)
    : stoneMap;
  const ironMap =
    ironPbr.albedo ??
    generatedAlbedo(
      "/assets/textures/generated/iron-ash-prop-iron-v1.webp",
      [3, 3],
      textureLifecycle,
    );
  const ironHeight = needsProceduralFallback
    ? surfaceTexture("metal", true, textureLifecycle)
    : ironMap;
  const brassMap =
    brassPbr.albedo ??
    generatedAlbedo(
      "/assets/textures/generated/iron-ash-prop-brass-v1.webp",
      [3, 3],
      textureLifecycle,
    );
  const brassHeight = needsProceduralFallback
    ? surfaceTexture("metal", true, textureLifecycle)
    : brassMap;
  const clothMap = clothPbr.albedo ?? surfaceTexture("cloth", false, textureLifecycle);
  const clothHeight = needsProceduralFallback
    ? surfaceTexture("cloth", true, textureLifecycle)
    : clothMap;
  const boneMap =
    bonePbr.albedo ??
    generatedAlbedo(
      "/assets/textures/generated/iron-ash-prop-bone-v1.webp",
      [1.5, 1.5],
      textureLifecycle,
    );
  const ceramicMap =
    ceramicPbr.albedo ??
    generatedAlbedo(
      "/assets/textures/generated/iron-ash-prop-ceramic-v1.webp",
      [2, 2],
      textureLifecycle,
    );
  const crystalMap =
    crystalPbr.albedo ??
    generatedAlbedo(
      "/assets/textures/generated/iron-ash-prop-crystal-v1.webp",
      [1.25, 1.25],
      textureLifecycle,
    );
  const crystalHeight = needsProceduralFallback
    ? surfaceTexture("stone", true, textureLifecycle)
    : crystalMap;
  const iceMap =
    icePbr.albedo ??
    generatedAlbedo(
      "/assets/textures/generated/iron-ash-prop-ice-v1.webp",
      [1.25, 1.25],
      textureLifecycle,
    );
  const iceHeight = needsProceduralFallback
    ? surfaceTexture("stone", true, textureLifecycle)
    : iceMap;

  const materials: DungeonMaterials = {
    stone: shared(
      buildPbrMaterial(
        stonePbr,
        stoneMap,
        0xb0b0a8,
        stoneHeight,
        0.055,
        0.55,
        0.9,
        0.02,
        0.3,
        !compact,
      ),
    ),
    darkStone: shared(
      buildPbrMaterial(
        stonePbr,
        stoneMap,
        0xa1a29d,
        stoneHeight,
        0.07,
        0.62,
        0.94,
        0.02,
        0.25,
        !compact,
        0xb8b8b4,
      ),
    ),
    wood: shared(
      buildPbrMaterial(
        woodPbr,
        woodMap,
        0x9a8878,
        woodHeight,
        0.045,
        0.6,
        0.78,
        0.02,
        0.34,
        !compact,
      ),
    ),
    root: shared(
      buildPbrMaterial(
        rootPbr,
        rootPbr.albedo ?? woodMap,
        0x9a8a72,
        woodHeight,
        0.055,
        0.68,
        0.9,
        0,
        0.22,
        !compact,
      ),
    ),
    iron: shared(
      buildPbrMaterial(
        ironPbr,
        ironMap,
        0xc0c4c2,
        ironHeight,
        0.025,
        0.7,
        0.62,
        0.46,
        0.72,
        !compact,
      ),
    ),
    paintedSteel: shared(
      buildPbrMaterial(
        paintedSteelPbr,
        paintedSteelPbr.albedo ?? ironMap,
        0xa39370,
        ironHeight,
        0.024,
        0.55,
        0.78,
        0.46,
        0.5,
        !compact,
      ),
    ),
    brass: shared(
      buildPbrMaterial(
        brassPbr,
        brassMap,
        0x8a7447,
        brassHeight,
        0.014,
        0.7,
        0.52,
        0.68,
        0.78,
        !compact,
      ),
    ),
    cloth: shared(
      buildPbrMaterial(
        clothPbr,
        clothMap,
        0x777074,
        clothHeight,
        0.018,
        0.72,
        0.94,
        0,
        0.14,
        !compact,
      ),
    ),
    bone: shared(
      buildPbrMaterial(
        bonePbr,
        boneMap,
        0xaaa58d,
        stoneHeight,
        0.018,
        0.5,
        0.82,
        0,
        0.22,
        !compact,
      ),
    ),
    ceramic: shared(
      buildPbrMaterial(
        ceramicPbr,
        ceramicMap,
        0x6a6b65,
        stoneHeight,
        0.012,
        0.6,
        0.76,
        0.02,
        0.55,
        !compact,
      ),
    ),
    crystal: shared(
      buildPbrMaterial(
        crystalPbr,
        crystalMap,
        0x8a7478,
        crystalHeight,
        0.035,
        0.58,
        0.3,
        0.08,
        0.62,
        !compact,
      ),
    ),
    ice: shared(
      buildPbrMaterial(
        icePbr,
        iceMap,
        0x8ca9af,
        iceHeight,
        0.025,
        0.52,
        0.32,
        0.02,
        0.58,
        !compact,
      ),
    ),
  };
  materials.cloth.side = THREE.DoubleSide;
  materials.crystal.emissive.setHex(0x241418);
  materials.crystal.emissiveIntensity = 0.68;
  materials.ice.emissive.setHex(0x11191b);
  materials.ice.emissiveIntensity = 0.28;
  materialTextureLifecycles.set(materials, textureLifecycle);
  return materials;
}

/**
 * Assembles a prop MeshStandardMaterial that prefers real PBR maps when the
 * concept-kit load succeeded, and falls back to a procedural bumpMap otherwise.
 * Only non-null map fields are forwarded so MeshStandardMaterial's constructor
 * does not warn about explicit `undefined` values.
 */
function buildPbrMaterial(
  pbr: PbrMapSet,
  albedoFallback: THREE.Texture,
  fallbackTint: number,
  bumpFallback: THREE.Texture,
  bumpScale: number,
  normalStrength: number,
  baseRoughness: number,
  baseMetalness: number,
  envMapIntensity: number,
  useBumpFallback = true,
  mappedTint = 0xffffff,
): THREE.MeshStandardMaterial {
  const baseColor = pbr.albedo ? mappedTint : fallbackTint;
  const params: THREE.MeshStandardMaterialParameters = {
    color: baseColor,
    map: pbr.albedo ?? albedoFallback,
    roughness: pbr.roughness ? 1 : baseRoughness,
    metalness: baseMetalness,
    envMapIntensity,
  };
  if (pbr.normal) {
    params.normalMap = pbr.normal;
    params.normalScale = new THREE.Vector2(normalStrength, normalStrength);
  } else if (useBumpFallback) {
    params.bumpMap = bumpFallback;
    params.bumpScale = bumpScale;
  }
  if (pbr.roughness) params.roughnessMap = pbr.roughness;
  if (pbr.ao) {
    params.aoMap = pbr.ao;
    params.aoMapIntensity = 0.62;
  }
  const material = new THREE.MeshStandardMaterial(params);
  // Keep the semantic role tint separate from the white PBR map multiplier.
  // Mood application must never treat white as the identity of every surface.
  material.userData.baseDungeonColor = fallbackTint;
  material.userData.absoluteRoughnessMap = pbr.roughness !== null;
  return material;
}

export function disposeDungeonMaterials(materials: DungeonMaterials): void {
  const lifecycle = materialTextureLifecycles.get(materials);
  if (lifecycle) {
    lifecycle.active = false;
    for (const texture of lifecycle.ownedTextures) lifecycle.textureSink?.unregister(texture);
    lifecycle.textureSink = undefined;
  }
  // Variants hold clones that share maps with the bases. Drop them before
  // disposing base maps so rebuilds never reuse disposed GPU textures.
  clearDungeonMaterialVariantsFor(materials);
  const textures = new Set<THREE.Texture>();
  for (const material of Object.values(materials)) {
    const biomeClones = material.userData.biomePropTextureClones as THREE.Texture[] | undefined;
    biomeClones?.forEach((texture) => {
      unlinkTextureClone(texture);
      textures.add(texture);
    });
    const base = material.userData.baseDungeonMaps as BaseMaterialMaps | undefined;
    const ownedMaps = base
      ? [base.map, base.bumpMap, base.normalMap, base.roughnessMap, base.aoMap]
      : [material.map, material.bumpMap, material.normalMap, material.roughnessMap, material.aoMap];
    for (const texture of ownedMaps) if (texture) textures.add(texture);
    const localVariants = material.userData.localModelMaterialVariants as
      | THREE.MeshStandardMaterial[]
      | undefined;
    for (const variant of localVariants ?? []) {
      for (const texture of [
        variant.map,
        variant.bumpMap,
        variant.normalMap,
        variant.roughnessMap,
        variant.aoMap,
      ]) {
        if (texture) textures.add(texture);
      }
      variant.dispose();
    }
    if (localVariants) localVariants.length = 0;
    material.dispose();
  }
  for (const texture of lifecycle?.ownedTextures ?? []) textures.add(texture);
  textures.forEach((texture) => texture.dispose());
  lifecycle?.ownedTextures.clear();
  materialTextureLifecycles.delete(materials);
}
