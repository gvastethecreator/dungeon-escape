import * as THREE from "three";
import type { DungeonMoodId } from "../systems/DungeonMood";
import type { BiomeLayerTextures, BiomeSurfaceTextures } from "./AssetLibrary";
import {
  liftTextureLuminanceSource,
  linkTextureClone,
  registerTextureSource,
  resolveTextureSource,
  unlinkTextureClone,
} from "./TextureTreatment";

const textureLoader = new THREE.TextureLoader();

/** PBR family → on-disk folder under /assets/concepts/dungeon-clutter-kit-v1-pbr/. */
const PBR_FAMILIES = ["aged-oak", "black-iron", "dull-brass", "ash-ceramic"] as const;
type PbrFamily = (typeof PBR_FAMILIES)[number];

const PBR_ALBEDO_LEVELS: Record<
  PbrFamily,
  { targetLuma: number; contrast: number; gamma: number }
> = {
  "aged-oak": { targetLuma: 0.52, contrast: 1.55, gamma: 0.72 },
  "black-iron": { targetLuma: 0.4, contrast: 1.7, gamma: 0.78 },
  "dull-brass": { targetLuma: 0.56, contrast: 1.45, gamma: 0.78 },
  "ash-ceramic": { targetLuma: 0.54, contrast: 1.65, gamma: 0.76 },
};

/**
 * Load a PBR map set from the dungeon clutter concept kit. Albedos use sRGB;
 * normal/roughness are linear data textures. Each map is registered with the
 * seam-treatment pipeline so tile lines stay invisible on props.
 * Falls back to `null` when document is unavailable (SSR/tests) — callers
 * keep their procedural fallback in that case.
 */
function loadPbrMaps(
  family: PbrFamily,
  compact = false,
): {
  albedo: THREE.Texture | null;
  normal: THREE.Texture | null;
  roughness: THREE.Texture | null;
} {
  if (typeof document === "undefined") return { albedo: null, normal: null, roughness: null };
  const base = `/assets/concepts/dungeon-clutter-kit-v1-pbr/${family}/${family}`;
  const albedo = textureLoader.load(`${base}_albedo.png`, (loaded) => {
    liftTextureLuminanceSource(loaded, PBR_ALBEDO_LEVELS[family]);
    resolveTextureSource(loaded);
  });
  registerTextureSource(albedo, `${base}_albedo.png`, true);
  albedo.colorSpace = THREE.SRGBColorSpace;
  const normal = compact
    ? null
    : textureLoader.load(`${base}_normal.png`, (loaded) => resolveTextureSource(loaded));
  if (normal) {
    registerTextureSource(normal, `${base}_normal.png`, true);
    normal.colorSpace = THREE.NoColorSpace;
  }
  const roughness = compact
    ? null
    : textureLoader.load(`${base}_roughness.png`, (loaded) => resolveTextureSource(loaded));
  if (roughness) {
    registerTextureSource(roughness, `${base}_roughness.png`, true);
    roughness.colorSpace = THREE.NoColorSpace;
  }
  for (const texture of [albedo, normal, roughness].filter(
    (candidate): candidate is THREE.Texture => candidate !== null,
  )) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapNearestFilter;
    texture.generateMipmaps = true;
  }
  return { albedo, normal, roughness };
}

export interface DungeonMaterials {
  stone: THREE.MeshStandardMaterial;
  darkStone: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  bone: THREE.MeshStandardMaterial;
  ceramic: THREE.MeshStandardMaterial;
  crystal: THREE.MeshStandardMaterial;
  ice: THREE.MeshStandardMaterial;
}

const ROLE_BASE_COLORS: Record<keyof DungeonMaterials, number> = {
  stone: 0xc4c2b8,
  darkStone: 0x8a8d88,
  wood: 0xbda88e,
  iron: 0xa7aaa8,
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
  iron: 0.07,
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
  darkStone: { roughness: 0.98, metalness: 0.01, envMapIntensity: 0.14, indirectFill: 0.16 },
  wood: { roughness: 0.9, metalness: 0.02, envMapIntensity: 0.24, indirectFill: 0.1 },
  iron: { roughness: 0.7, metalness: 0.64, envMapIntensity: 0.62 },
  brass: { roughness: 0.66, metalness: 0.52, envMapIntensity: 0.68 },
  cloth: { roughness: 1, metalness: 0, envMapIntensity: 0.12, indirectFill: 0.08 },
  bone: { roughness: 0.95, metalness: 0, envMapIntensity: 0.16, indirectFill: 0.06 },
  ceramic: { roughness: 0.86, metalness: 0.02, envMapIntensity: 0.25, indirectFill: 0.08 },
  crystal: { roughness: 0.48, metalness: 0.08, envMapIntensity: 0.48 },
  ice: { roughness: 0.5, metalness: 0.02, envMapIntensity: 0.42 },
};

interface BaseMaterialMaps {
  map: THREE.Texture | null;
  bumpMap: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
}

function cloneBiomePropTexture(source: THREE.Texture | null, repeat: number): THREE.Texture | null {
  if (!source) return null;
  const clone = source.clone();
  linkTextureClone(source, clone);
  clone.repeat.copy(source.repeat).multiplyScalar(repeat);
  clone.needsUpdate = true;
  return clone;
}

const BIOME_MASONRY_RESPONSE: Record<
  DungeonMoodId,
  { normalScale: number; roughness: number; envMapIntensity: number }
> = {
  ancient: { normalScale: 0.56, roughness: 0.96, envMapIntensity: 0.22 },
  molten: { normalScale: 0.68, roughness: 0.92, envMapIntensity: 0.28 },
  frost: { normalScale: 0.72, roughness: 0.88, envMapIntensity: 0.26 },
  grim: { normalScale: 0.6, roughness: 0.98, envMapIntensity: 0.16 },
  verdant: { normalScale: 0.64, roughness: 0.96, envMapIntensity: 0.2 },
  ash: { normalScale: 0.62, roughness: 0.98, envMapIntensity: 0.18 },
  iron: { normalScale: 0.58, roughness: 0.9, envMapIntensity: 0.28 },
  obsidian: { normalScale: 0.7, roughness: 0.82, envMapIntensity: 0.36 },
  sunken: { normalScale: 0.66, roughness: 0.96, envMapIntensity: 0.24 },
  fungal: { normalScale: 0.68, roughness: 0.94, envMapIntensity: 0.2 },
  backrooms: { normalScale: 0.42, roughness: 0.99, envMapIntensity: 0.14 },
};

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
    const baseHex = (material.userData.baseDungeonColor ??= ROLE_BASE_COLORS[key]) as number;
    material.color.setHex(baseHex);
    filtered.copy(material.color).multiply(tint);
    material.color.lerp(
      filtered,
      THREE.MathUtils.clamp(safeStrength * BIOME_TINT_WEIGHT[key], 0, 0.52),
    );
    const finish = PROP_FINISH[key];
    const hasBiomeMasonryFinish =
      (key === "stone" || key === "darkStone") && material.userData.biomeMasonryBound === true;
    if (!hasBiomeMasonryFinish) {
      material.roughness = finish.roughness;
      material.metalness = finish.metalness;
      material.envMapIntensity = finish.envMapIntensity;
    }
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

function bindBiomeLayer(
  material: THREE.MeshStandardMaterial,
  layer: BiomeLayerTextures,
  normalScale: number,
  roughness: number,
  repeat: number,
): void {
  const base = (material.userData.baseDungeonMaps ??= {
    map: material.map,
    bumpMap: material.bumpMap,
    normalMap: material.normalMap,
    roughnessMap: material.roughnessMap,
  } satisfies BaseMaterialMaps) as BaseMaterialMaps;

  const priorClones = material.userData.biomePropTextureClones as THREE.Texture[] | undefined;
  priorClones?.forEach((texture) => {
    unlinkTextureClone(texture);
    texture.dispose();
  });
  const albedo = cloneBiomePropTexture(layer.albedo, repeat)!;
  const rough = cloneBiomePropTexture(layer.rough, repeat);
  const normal = cloneBiomePropTexture(layer.normal, repeat);
  material.userData.biomePropTextureClones = [albedo, rough, normal].filter(
    (texture): texture is THREE.Texture => texture !== null,
  );

  material.map = albedo;
  material.roughnessMap = rough;
  material.roughness = roughness;
  material.envMapIntensity = 0.2;
  material.userData.biomeMasonryBound = true;
  if (normal) {
    material.normalMap = normal;
    material.normalScale.set(normalScale, normalScale);
    material.bumpMap = null;
  } else {
    material.normalMap = null;
    material.bumpMap = base.bumpMap;
  }
  material.needsUpdate = true;
}

/**
 * Stone props use the active biome surface pack. Furniture and hardware retain
 * their wood/metal maps, then receive the restrained role tint above.
 */
export function applyBiomeMapsToDungeonMaterials(
  materials: DungeonMaterials,
  biome: BiomeSurfaceTextures,
  moodId: DungeonMoodId,
): void {
  const response = BIOME_MASONRY_RESPONSE[moodId];
  bindBiomeLayer(materials.stone, biome.wall, response.normalScale, response.roughness, 1.25);
  materials.stone.envMapIntensity = response.envMapIntensity;
  bindBiomeLayer(
    materials.darkStone,
    biome.floor,
    response.normalScale * 0.9,
    Math.min(1, response.roughness + 0.04),
    1.4,
  );
  materials.darkStone.envMapIntensity = Math.min(0.42, response.envMapIntensity + 0.02);
}

function surfaceTexture(
  kind: "wood" | "stone" | "metal" | "cloth",
  height = false,
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
  return texture;
}

function generatedAlbedo(path: string, repeat: readonly [number, number]): THREE.Texture {
  const texture =
    typeof document === "undefined"
      ? new THREE.Texture()
      : textureLoader.load(path, (loaded) => resolveTextureSource(loaded));
  registerTextureSource(texture, path, true);
  texture.name = path;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.generateMipmaps = true;
  return texture;
}

function shared<T extends THREE.Material>(material: T): T {
  material.userData.sharedDungeonMaterial = true;
  return material;
}

export function createDungeonMaterials({
  compact = false,
}: { compact?: boolean } = {}): DungeonMaterials {
  // PBR concept-kit maps replace the procedural bump for the four primary
  // prop materials when available (browser runtime). Tests/SSR fall through
  // to the procedural fallback below.
  const woodPbr = loadPbrMaps("aged-oak", compact);
  const ironPbr = loadPbrMaps("black-iron", compact);
  const brassPbr = loadPbrMaps("dull-brass", compact);
  const ceramicPbr = loadPbrMaps("ash-ceramic", compact);

  const woodMap =
    woodPbr.albedo ??
    generatedAlbedo("/assets/textures/generated/iron-ash-prop-oak-v1.png", [2, 4]);
  const woodHeight = surfaceTexture("wood", true);
  const stoneMap = surfaceTexture("stone");
  const stoneHeight = surfaceTexture("stone", true);
  const ironMap =
    ironPbr.albedo ??
    generatedAlbedo("/assets/textures/generated/iron-ash-prop-iron-v1.png", [3, 3]);
  const ironHeight = surfaceTexture("metal", true);
  const brassMap =
    brassPbr.albedo ??
    generatedAlbedo("/assets/textures/generated/iron-ash-prop-brass-v1.png", [3, 3]);
  const brassHeight = surfaceTexture("metal", true);
  const clothMap = surfaceTexture("cloth");
  const boneMap = generatedAlbedo(
    "/assets/textures/generated/iron-ash-prop-bone-v1.png",
    [1.5, 1.5],
  );
  const ceramicMap =
    ceramicPbr.albedo ??
    generatedAlbedo("/assets/textures/generated/iron-ash-prop-ceramic-v1.png", [2, 2]);
  const crystalMap = generatedAlbedo(
    "/assets/textures/generated/iron-ash-prop-crystal-v1.png",
    [1.25, 1.25],
  );
  const crystalHeight = surfaceTexture("stone", true);
  const iceMap = generatedAlbedo(
    "/assets/textures/generated/iron-ash-prop-ice-v1.png",
    [1.25, 1.25],
  );
  const iceHeight = surfaceTexture("stone", true);
  // envMapIntensity assumes low scene.environmentIntensity from LightingRig.
  // Metals need higher material weight; dielectrics stay matte under IBL.
  // When PBR normal/roughness maps are present, real microsurface replaces the
  // procedural bump; otherwise bumpMap keeps the prior look.
  return {
    stone: shared(
      new THREE.MeshStandardMaterial({
        color: 0xb0b0a8,
        map: stoneMap,
        ...(compact ? {} : { bumpMap: stoneHeight, bumpScale: 0.055 }),
        roughness: 0.94,
        metalness: 0.02,
        envMapIntensity: 0.35,
      }),
    ),
    darkStone: shared(
      new THREE.MeshStandardMaterial({
        color: 0x6b6d69,
        map: stoneMap,
        ...(compact ? {} : { bumpMap: stoneHeight, bumpScale: 0.07 }),
        roughness: 0.98,
        envMapIntensity: 0.28,
      }),
    ),
    wood: shared(
      buildPbrMaterial(
        woodPbr,
        woodMap,
        0x9a8878,
        woodHeight,
        0.045,
        0.6,
        0.86,
        0.02,
        0.4,
        !compact,
      ),
    ),
    iron: shared(
      buildPbrMaterial(
        ironPbr,
        ironMap,
        0x777b78,
        ironHeight,
        0.025,
        0.7,
        0.55,
        0.72,
        1.05,
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
        0.48,
        0.68,
        1.15,
        !compact,
      ),
    ),
    cloth: shared(
      new THREE.MeshStandardMaterial({
        color: 0x777074,
        map: clothMap,
        roughness: 1,
        side: THREE.DoubleSide,
        envMapIntensity: 0.2,
      }),
    ),
    bone: shared(
      new THREE.MeshStandardMaterial({
        color: 0x8a8776,
        map: boneMap,
        ...(compact ? {} : { bumpMap: stoneHeight, bumpScale: 0.018 }),
        roughness: 0.92,
        envMapIntensity: 0.35,
      }),
    ),
    ceramic: shared(
      buildPbrMaterial(
        ceramicPbr,
        ceramicMap,
        0x6a6b65,
        stoneHeight,
        0.012,
        0.6,
        0.72,
        0.02,
        0.55,
        !compact,
      ),
    ),
    crystal: shared(
      new THREE.MeshStandardMaterial({
        color: 0x8a7478,
        map: crystalMap,
        ...(compact ? {} : { bumpMap: crystalHeight, bumpScale: 0.035 }),
        emissive: 0x241418,
        emissiveIntensity: 0.8,
        roughness: 0.32,
        metalness: 0.12,
        envMapIntensity: 0.9,
      }),
    ),
    ice: shared(
      new THREE.MeshStandardMaterial({
        color: 0x79898d,
        map: iceMap,
        ...(compact ? {} : { bumpMap: iceHeight, bumpScale: 0.025 }),
        emissive: 0x11191b,
        emissiveIntensity: 0.38,
        roughness: 0.28,
        metalness: 0.04,
        envMapIntensity: 0.85,
      }),
    ),
  };
}

/**
 * Assembles a prop MeshStandardMaterial that prefers real PBR maps when the
 * concept-kit load succeeded, and falls back to a procedural bumpMap otherwise.
 * Only non-null map fields are forwarded so MeshStandardMaterial's constructor
 * does not warn about explicit `undefined` values.
 */
function buildPbrMaterial(
  pbr: {
    albedo: THREE.Texture | null;
    normal: THREE.Texture | null;
    roughness: THREE.Texture | null;
  },
  albedoFallback: THREE.Texture,
  fallbackTint: number,
  bumpFallback: THREE.Texture,
  bumpScale: number,
  normalStrength: number,
  baseRoughness: number,
  baseMetalness: number,
  envMapIntensity: number,
  useBumpFallback = true,
): THREE.MeshStandardMaterial {
  const params: THREE.MeshStandardMaterialParameters = {
    color: pbr.albedo ? 0xffffff : fallbackTint,
    map: pbr.albedo ?? albedoFallback,
    roughness: baseRoughness,
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
  return new THREE.MeshStandardMaterial(params);
}

export function disposeDungeonMaterials(materials: DungeonMaterials): void {
  const textures = new Set<THREE.Texture>();
  for (const material of Object.values(materials)) {
    const biomeClones = material.userData.biomePropTextureClones as THREE.Texture[] | undefined;
    biomeClones?.forEach((texture) => {
      unlinkTextureClone(texture);
      textures.add(texture);
    });
    const base = material.userData.baseDungeonMaps as BaseMaterialMaps | undefined;
    const ownedMaps = base
      ? [base.map, base.bumpMap, base.normalMap, base.roughnessMap]
      : [material.map, material.bumpMap, material.normalMap, material.roughnessMap];
    for (const texture of ownedMaps) if (texture) textures.add(texture);
    material.dispose();
  }
  textures.forEach((texture) => texture.dispose());
}
