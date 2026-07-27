import * as THREE from "three";
import type { DungeonMoodId } from "../systems/DungeonMood";
import type { BiomeLayerTextures, BiomeSurfaceTextures } from "./AssetLibrary";
import {
  enableDungeonSurfaceShader,
  linkTextureClone,
  unlinkTextureClone,
} from "./TextureTreatment";

/** Mesh-UV normals with per-cell UV offset for continuous tiling. */
const NORMAL_SCALE = new THREE.Vector2(0.45, 0.45);
/** Walls read a bit stronger relief than floors (lantern grazes vertical faces). */
const WALL_NORMAL_SCALE = new THREE.Vector2(0.55, 0.55);

interface SurfaceFinish {
  roughness: number;
  envMapIntensity: number;
}

/**
 * Room layers share a shader, but they do not share a finish. Wet, polished,
 * and obsidian biomes keep a controlled sheen; ash, grim, and backrooms stay
 * diffuse so a torch cannot paint every tile with the same reflection.
 */
const BIOME_SURFACE_FINISH: Record<
  DungeonMoodId,
  Record<"floor" | "wall" | "ceiling", SurfaceFinish>
> = {
  ancient: {
    floor: { roughness: 0.96, envMapIntensity: 0.18 },
    wall: { roughness: 0.98, envMapIntensity: 0.14 },
    ceiling: { roughness: 1, envMapIntensity: 0.1 },
  },
  molten: {
    floor: { roughness: 0.9, envMapIntensity: 0.24 },
    wall: { roughness: 0.94, envMapIntensity: 0.18 },
    ceiling: { roughness: 0.99, envMapIntensity: 0.12 },
  },
  frost: {
    floor: { roughness: 0.86, envMapIntensity: 0.24 },
    wall: { roughness: 0.9, envMapIntensity: 0.18 },
    ceiling: { roughness: 0.98, envMapIntensity: 0.12 },
  },
  grim: {
    floor: { roughness: 0.98, envMapIntensity: 0.14 },
    wall: { roughness: 0.99, envMapIntensity: 0.11 },
    ceiling: { roughness: 1, envMapIntensity: 0.08 },
  },
  verdant: {
    floor: { roughness: 0.96, envMapIntensity: 0.17 },
    wall: { roughness: 0.98, envMapIntensity: 0.13 },
    ceiling: { roughness: 0.99, envMapIntensity: 0.09 },
  },
  ash: {
    floor: { roughness: 0.98, envMapIntensity: 0.13 },
    wall: { roughness: 0.99, envMapIntensity: 0.1 },
    ceiling: { roughness: 1, envMapIntensity: 0.08 },
  },
  iron: {
    floor: { roughness: 0.9, envMapIntensity: 0.24 },
    wall: { roughness: 0.94, envMapIntensity: 0.18 },
    ceiling: { roughness: 0.98, envMapIntensity: 0.12 },
  },
  obsidian: {
    floor: { roughness: 0.82, envMapIntensity: 0.3 },
    wall: { roughness: 0.88, envMapIntensity: 0.24 },
    ceiling: { roughness: 0.96, envMapIntensity: 0.14 },
  },
  sunken: {
    floor: { roughness: 0.94, envMapIntensity: 0.22 },
    wall: { roughness: 0.97, envMapIntensity: 0.17 },
    ceiling: { roughness: 0.99, envMapIntensity: 0.11 },
  },
  fungal: {
    floor: { roughness: 0.92, envMapIntensity: 0.18 },
    wall: { roughness: 0.96, envMapIntensity: 0.14 },
    ceiling: { roughness: 0.99, envMapIntensity: 0.1 },
  },
  backrooms: {
    floor: { roughness: 0.99, envMapIntensity: 0.1 },
    wall: { roughness: 1, envMapIntensity: 0.08 },
    ceiling: { roughness: 1, envMapIntensity: 0.06 },
  },
};

export type SurfaceTheme =
  | "corridor"
  | "entrance"
  | "combat"
  | "elite"
  | "treasure"
  | "shrine"
  | "boss"
  | "grave"
  | "lake";

export interface RoomSurfaceSet {
  floor: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
}

export interface RoomSurfaceTextures {
  floor: THREE.Texture;
  wall: THREE.Texture;
  ceiling: THREE.Texture;
  semanticFloors?: Partial<Record<SurfaceTheme, THREE.Texture>>;
  semanticWalls?: Partial<Record<SurfaceTheme, THREE.Texture>>;
}

/** Color-only theme variation — no UV offset (offsets break continuous world UV seams). */
const PALETTES: Record<SurfaceTheme, { floor: number; wall: number; ceiling: number }> = {
  corridor: { floor: 0x96958f, wall: 0x83817c, ceiling: 0x767775 },
  entrance: { floor: 0xa4a198, wall: 0x918c83, ceiling: 0x7d7c77 },
  combat: { floor: 0x958c85, wall: 0x8c7770, ceiling: 0x736d6b },
  elite: { floor: 0x878184, wall: 0x806d72, ceiling: 0x6e696c },
  treasure: { floor: 0x9d947f, wall: 0x94856b, ceiling: 0x7d7665 },
  shrine: { floor: 0xa09f96, wall: 0x99978c, ceiling: 0x7f7e77 },
  boss: { floor: 0x747578, wall: 0x67686b, ceiling: 0x5c5d60 },
  grave: { floor: 0x858b81, wall: 0x788070, ceiling: 0x6b7268 },
  lake: { floor: 0x829092, wall: 0x78888a, ceiling: 0x667578 },
};

function themedTexture(
  source: THREE.Texture,
  theme: SurfaceTheme,
  surface: "floor" | "wall" | "ceiling",
): THREE.Texture {
  const texture = source.clone();
  texture.name = `${source.name}#${theme}-${surface}`;
  linkTextureClone(source, texture);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // Same UV scale for every layer — wall height stretch applied via world/mesh UV only if needed.
  // Keep 1:1 for biome PBR so albedo/normal/rough stay locked.
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  texture.magFilter = source.magFilter ?? THREE.LinearFilter;
  texture.minFilter = source.minFilter ?? THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function applySurfaceStability(
  material: THREE.MeshStandardMaterial,
  layer: "floor" | "wall" | "ceiling",
): void {
  material.userData.sharedDungeonMaterial = true;
  material.polygonOffset = true;
  // Bias coplanar floor/ceiling neighbors and wall face overlaps without opening gaps.
  if (layer === "floor") {
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
  } else if (layer === "ceiling") {
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 2;
  } else {
    // Faces sit slightly in front of the dark wall core.
    material.polygonOffsetFactor = -1.5;
    material.polygonOffsetUnits = -2;
  }
  // Soften tile-edge shimmer under torch light.
  material.dithering = true;
}

function makeSurfaceMaterial(
  map: THREE.Texture,
  color: number,
  emissive: number,
  emissiveIntensity: number,
  roughness: number,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    color,
    emissive,
    emissiveIntensity,
    roughness,
    metalness: 0.04,
    // Stone architecture should stay matte under the scene IBL.
    envMapIntensity: 0.32,
  });
}

export function createRoomSurfaceMaterials(
  textures: RoomSurfaceTextures,
): Record<SurfaceTheme, RoomSurfaceSet> {
  return Object.fromEntries(
    (Object.keys(PALETTES) as SurfaceTheme[]).map((theme) => {
      const palette = PALETTES[theme];
      const floorMap = themedTexture(
        textures.semanticFloors?.[theme] ?? textures.floor,
        theme,
        "floor",
      );
      const wallMap = themedTexture(
        textures.semanticWalls?.[theme] ?? textures.wall,
        theme,
        "wall",
      );
      const ceilingMap = themedTexture(textures.ceiling, theme, "ceiling");
      const set = {
        floor: makeSurfaceMaterial(floorMap, palette.floor, 0x101110, 0.2, 0.88),
        wall: makeSurfaceMaterial(
          wallMap,
          palette.wall,
          theme === "treasure" ? 0x171208 : theme === "lake" ? 0x081416 : 0x0f100f,
          theme === "boss" ? 0.2 : 0.3,
          0.86,
        ),
        ceiling: makeSurfaceMaterial(ceilingMap, palette.ceiling, 0x0b0c0b, 0.5, 0.94),
      };
      set.floor.userData.baseColor = palette.floor;
      set.wall.userData.baseColor = palette.wall;
      set.ceiling.userData.baseColor = palette.ceiling;
      set.floor.userData.baseEmissive = 0x101110;
      set.wall.userData.baseEmissive =
        theme === "treasure" ? 0x171208 : theme === "lake" ? 0x081416 : 0x0f100f;
      set.ceiling.userData.baseEmissive = 0x0b0c0b;
      applySurfaceStability(set.floor, "floor");
      applySurfaceStability(set.wall, "wall");
      applySurfaceStability(set.ceiling, "ceiling");
      // Translate UV per cell (aTileUvOffset) + world-space macro variation/grime.
      enableDungeonSurfaceShader(set.floor);
      enableDungeonSurfaceShader(set.wall);
      enableDungeonSurfaceShader(set.ceiling);
      return [theme, set];
    }),
  ) as Record<SurfaceTheme, RoomSurfaceSet>;
}

function assignLayerMaps(
  material: THREE.MeshStandardMaterial,
  layer: BiomeLayerTextures,
  _theme: SurfaceTheme,
  surface: "floor" | "wall" | "ceiling",
  moodId: DungeonMoodId,
): void {
  // Share AssetLibrary textures directly (no clone-before-load, which left blank maps).
  // Themes only differ by color/emissive multiply, not UV, so sharing is safe.
  const previousMap = material.map;
  const previousNormal = material.normalMap;
  const previousRough = material.roughnessMap;
  const wasOwned = material.userData.mapsOwnedByAssetLibrary === true;

  material.map = layer.albedo;
  material.normalMap = layer.normal;
  material.roughnessMap = layer.rough;
  material.normalScale.copy(surface === "wall" ? WALL_NORMAL_SCALE : NORMAL_SCALE);
  const finish = BIOME_SURFACE_FINISH[moodId][surface];
  material.roughness = finish.roughness;
  material.metalness = 0.02;
  material.envMapIntensity = finish.envMapIntensity;
  // Ensure wrap for tall wall UVs that exceed 0..1 in V.
  for (const map of [layer.albedo, layer.normal, layer.rough].filter(
    (candidate): candidate is THREE.Texture => candidate !== null,
  )) {
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
  }
  material.userData.mapsOwnedByAssetLibrary = true;

  // Only dispose prior theme clones from createRoomSurfaceMaterials, never shared biome assets.
  if (!wasOwned) {
    for (const texture of [previousMap, previousNormal, previousRough]) {
      if (!texture) continue;
      unlinkTextureClone(texture);
      texture.dispose();
    }
  }
  material.needsUpdate = true;
}

/** Apply DepthAnything-baked PBR stacks for the active biome. */
export function applyBiomeMaps(
  materials: Record<SurfaceTheme, RoomSurfaceSet>,
  biome: BiomeSurfaceTextures,
  moodId: DungeonMoodId = "ash",
): void {
  for (const theme of Object.keys(PALETTES) as SurfaceTheme[]) {
    const set = materials[theme]!;
    assignLayerMaps(set.floor, biome.floor, theme, "floor", moodId);
    assignLayerMaps(set.wall, biome.wall, theme, "wall", moodId);
    assignLayerMaps(set.ceiling, biome.ceiling, theme, "ceiling", moodId);
  }
}

/**
 * Multiply each surface base palette by the dungeon mood tint, then apply
 * albedoGain so bright biome maps (frost ice) land in the same luminance band
 * as darker stone biomes under the interior light stack.
 */
export function applyMoodToSurfaceMaterials(
  materials: Record<SurfaceTheme, RoomSurfaceSet>,
  surfaceTint: number,
  strength: number,
  albedoGain = 1,
): void {
  const tint = new THREE.Color(surfaceTint);
  const scratch = new THREE.Color();
  const gain = THREE.MathUtils.clamp(albedoGain, 0.25, 1.35);
  for (const set of Object.values(materials)) {
    for (const material of Object.values(set)) {
      const base = material.userData.baseColor as number | undefined;
      if (base === undefined) continue;
      scratch.setHex(base);
      if (strength > 0) {
        const filtered = scratch.clone().multiply(tint);
        scratch.lerp(filtered, THREE.MathUtils.clamp(strength, 0, 1));
      }
      scratch.multiplyScalar(gain);
      material.color.copy(scratch);
      const baseEmissive = material.userData.baseEmissive as number | undefined;
      if (baseEmissive !== undefined) {
        scratch.setHex(baseEmissive);
        if (strength > 0) {
          const filtered = scratch.clone().multiply(tint);
          scratch.lerp(filtered, THREE.MathUtils.clamp(strength * 0.65, 0, 1));
        }
        // Keep emissive quieter than albedo when gain is low (bright ice maps).
        scratch.multiplyScalar(THREE.MathUtils.lerp(0.75, 1, gain));
        material.emissive.copy(scratch);
      }
    }
  }
}

export function disposeRoomSurfaceMaterials(materials: Record<SurfaceTheme, RoomSurfaceSet>): void {
  const disposed = new Set<THREE.Texture>();
  for (const set of Object.values(materials)) {
    for (const material of Object.values(set)) {
      // Biome PBR maps are owned by AssetLibrary — do not dispose them here.
      if (!material.userData.mapsOwnedByAssetLibrary) {
        for (const map of [material.map, material.normalMap, material.roughnessMap]) {
          if (map && !disposed.has(map)) {
            map.dispose();
            disposed.add(map);
          }
        }
      }
      material.dispose();
    }
  }
}
