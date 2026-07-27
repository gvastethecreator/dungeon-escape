import * as THREE from "three";
import type { DungeonMoodId } from "../systems/DungeonMood";
import {
  liftTextureLuminanceSource,
  liftTextureRoughnessSource,
  registerTextureSource,
  resolveTextureSource,
} from "./TextureTreatment";
import {
  ENEMY_ANIMATIONS,
  ENEMY_ATLAS_SRC,
  ENEMY_ATLAS_SIZE,
  type EnemyAnimationDefinition,
} from "./EnemySpriteAtlas";

export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SourcedAtlasFrame extends AtlasFrame {
  src?: string;
  size?: readonly [number, number];
}

export interface AtlasDefinition {
  src: string;
  size: readonly [number, number];
}

/** Full PBR stack for one surface layer (albedo + DepthAnything maps). */
export interface BiomeLayerTextures {
  albedo: THREE.Texture;
  normal: THREE.Texture | null;
  rough: THREE.Texture | null;
  depth: THREE.Texture | null;
}

export interface BiomeSurfaceTextures {
  floor: BiomeLayerTextures;
  wall: BiomeLayerTextures;
  ceiling: BiomeLayerTextures;
}

/** Flat wall sprite plus its authored material response. */
export interface WallSpriteTextures {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  rough: THREE.Texture;
  depth: THREE.Texture;
}

const loader = new THREE.TextureLoader();

function pixelTexture(
  source: string,
  colorSpace = true,
  seam: "none" | "mirror" | "edge-blend" = "edge-blend",
  onLoad?: (texture: THREE.Texture) => void,
): THREE.Texture {
  const texture = loader.load(source, (loaded) => {
    onLoad?.(loaded);
    resolveTextureSource(loaded);
  });
  // Edge-blend makes Imagine/AI maps wrap cleanly; mirror kept for older generated props.
  const mode = source.includes("/generated/") && seam === "edge-blend" ? "mirror" : seam;
  registerTextureSource(texture, source, { seam: mode });
  texture.name = source;
  texture.colorSpace = colorSpace ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Data maps (normal/rough/depth) — linear color space, no seam re-bake (already seamless). */
function dataTexture(source: string): THREE.Texture {
  const texture = loader.load(source);
  texture.name = source;
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function biomePath(
  mood: DungeonMoodId,
  surface: "floor" | "wall" | "ceiling",
  kind: "albedo" | "normal" | "rough" | "depth" = "albedo",
): string {
  if (kind === "albedo") return `/assets/textures/biomes/${mood}/${surface}.png`;
  return `/assets/textures/biomes/${mood}/${surface}-${kind}.png`;
}

const BIOME_ALBEDO_TARGETS: Record<DungeonMoodId, Record<"floor" | "wall" | "ceiling", number>> = {
  ancient: { floor: 0.38, wall: 0.42, ceiling: 0.28 },
  molten: { floor: 0.34, wall: 0.36, ceiling: 0.26 },
  frost: { floor: 0.52, wall: 0.42, ceiling: 0.3 },
  grim: { floor: 0.38, wall: 0.38, ceiling: 0.3 },
  verdant: { floor: 0.36, wall: 0.38, ceiling: 0.29 },
  ash: { floor: 0.36, wall: 0.42, ceiling: 0.29 },
  iron: { floor: 0.38, wall: 0.4, ceiling: 0.28 },
  obsidian: { floor: 0.28, wall: 0.3, ceiling: 0.26 },
  sunken: { floor: 0.36, wall: 0.38, ceiling: 0.34 },
  fungal: { floor: 0.36, wall: 0.36, ceiling: 0.32 },
  backrooms: { floor: 0.44, wall: 0.48, ceiling: 0.46 },
};

/**
 * Authored roughness maps for a few wet/dark biomes were too close to zero.
 * A light lift keeps their texture variation, while preventing one dark pixel
 * from turning a whole masonry tile into a mirror under the room IBL.
 */
const BIOME_ROUGHNESS_FLOORS: Record<
  DungeonMoodId,
  Record<"floor" | "wall" | "ceiling", number>
> = {
  ancient: { floor: 0.12, wall: 0.1, ceiling: 0.08 },
  molten: { floor: 0.1, wall: 0.08, ceiling: 0.06 },
  frost: { floor: 0.08, wall: 0.08, ceiling: 0.06 },
  grim: { floor: 0.12, wall: 0.1, ceiling: 0.08 },
  verdant: { floor: 0.1, wall: 0.1, ceiling: 0.08 },
  ash: { floor: 0.12, wall: 0.1, ceiling: 0.08 },
  iron: { floor: 0.14, wall: 0.12, ceiling: 0.1 },
  obsidian: { floor: 0.28, wall: 0.26, ceiling: 0.2 },
  sunken: { floor: 0.42, wall: 0.42, ceiling: 0.34 },
  fungal: { floor: 0.02, wall: 0.02, ceiling: 0.02 },
  backrooms: { floor: 0.02, wall: 0.02, ceiling: 0.02 },
};

function loadBiomeLayer(
  mood: DungeonMoodId,
  surface: "floor" | "wall" | "ceiling",
): BiomeLayerTextures {
  const compact = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  // Light edge-blend on every layer with the same ratio keeps wrap borders locked.
  // (Albedo-only blend was desyncing normal/rough and drawing false tile lines.)
  const albedo = pixelTexture(biomePath(mood, surface, "albedo"), true, "edge-blend", (loaded) =>
    liftTextureLuminanceSource(loaded, {
      targetLuma: BIOME_ALBEDO_TARGETS[mood][surface],
      contrast: mood === "obsidian" || mood === "fungal" ? 1.5 : 1.35,
      gamma: 0.82,
    }),
  );
  const normal = compact
    ? null
    : pixelTexture(biomePath(mood, surface, "normal"), false, "edge-blend");
  const rough = compact
    ? null
    : pixelTexture(biomePath(mood, surface, "rough"), false, "edge-blend", (loaded) =>
        liftTextureRoughnessSource(loaded, {
          floor: BIOME_ROUGHNESS_FLOORS[mood][surface],
          gamma: 1,
        }),
      );
  const depth = compact ? null : dataTexture(biomePath(mood, surface, "depth"));
  // Shared sampling: linear mips for all layers reduce light shimmer at tile boundaries.
  for (const tex of [albedo, normal, rough, depth].filter(
    (candidate): candidate is THREE.Texture => candidate !== null,
  )) {
    tex.repeat.set(1, 1);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
  }
  if (normal) normal.colorSpace = THREE.NoColorSpace;
  if (rough) rough.colorSpace = THREE.NoColorSpace;
  return { albedo, normal, rough, depth };
}

export class AssetLibrary {
  readonly wall = pixelTexture("/assets/textures/iron-ash-wall-v2.webp");
  readonly wallCrypt = pixelTexture("/assets/textures/generated/iron-ash-wall-crypt-v1.png");
  readonly wallShrine = pixelTexture("/assets/textures/generated/iron-ash-wall-shrine-v1.png");
  readonly wallTreasure = pixelTexture("/assets/textures/generated/iron-ash-wall-treasure-v1.png");
  readonly wallBoss = pixelTexture("/assets/textures/generated/iron-ash-wall-boss-v1.png");
  readonly floor = pixelTexture("/assets/textures/iron-ash-floor-v2.webp");
  readonly floorCrypt = pixelTexture("/assets/textures/generated/iron-ash-floor-crypt-v1.png");
  readonly floorShrine = pixelTexture("/assets/textures/generated/iron-ash-floor-shrine-v1.png");
  readonly floorTreasure = pixelTexture(
    "/assets/textures/generated/iron-ash-floor-treasure-v1.png",
  );
  readonly floorBoss = pixelTexture("/assets/textures/generated/iron-ash-floor-boss-v1.png");
  readonly ceiling = pixelTexture("/assets/textures/iron-ash-ceiling.png");
  /** Lazy biome packs — only the active mood loads PBR stacks (big boot win). */
  private readonly biomeSurfaces = new Map<DungeonMoodId, BiomeSurfaceTextures>();
  private readonly biomeDoors = new Map<DungeonMoodId, THREE.Texture>();
  private readonly ownedTextures: THREE.Texture[] = [
    this.wall,
    this.wallCrypt,
    this.wallShrine,
    this.wallTreasure,
    this.wallBoss,
    this.floor,
    this.floorCrypt,
    this.floorShrine,
    this.floorTreasure,
    this.floorBoss,
    this.ceiling,
  ];
  private readonly atlasCache = new Map<string, THREE.Texture>();

  constructor() {
    this.wall.repeat.set(1, 1);
    this.floor.repeat.set(1, 1);
    this.ceiling.repeat.set(1, 1);
  }

  getBiomeSurfaces(mood: DungeonMoodId): BiomeSurfaceTextures {
    const cached = this.biomeSurfaces.get(mood);
    if (cached) return cached;
    const pack = {
      floor: loadBiomeLayer(mood, "floor"),
      wall: loadBiomeLayer(mood, "wall"),
      ceiling: loadBiomeLayer(mood, "ceiling"),
    } satisfies BiomeSurfaceTextures;
    for (const layer of Object.values(pack)) {
      this.ownedTextures.push(
        ...[layer.albedo, layer.normal, layer.rough, layer.depth].filter(
          (candidate): candidate is THREE.Texture => candidate !== null,
        ),
      );
    }
    this.biomeSurfaces.set(mood, pack);
    return pack;
  }

  /** Test/helper: ensure a mood pack exists without building a dungeon. */
  preloadBiome(mood: DungeonMoodId): BiomeSurfaceTextures {
    return this.getBiomeSurfaces(mood);
  }

  /** One authored door surface per biome; doors stay distinct from wall/floor tiling. */
  biomeDoor(mood: DungeonMoodId): THREE.Texture {
    const cached = this.biomeDoors.get(mood);
    if (cached) return cached;
    const texture = pixelTexture(biomeDoorTextureUrl(mood), true, "none");
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 1);
    this.biomeDoors.set(mood, texture);
    this.ownedTextures.push(texture);
    return texture;
  }

  /** Four lit wall sprites per biome: two paintings, one fissure, one seal/stain. */
  biomeWallDecor(mood: DungeonMoodId, index: number): THREE.Texture {
    return this.biomeWallDecorPbr(mood, index).albedo;
  }

  biomeWallDecorPbr(mood: DungeonMoodId, index: number): WallSpriteTextures {
    const frame = Math.abs(index) % 4;
    const crop = {
      x: frame * 256,
      y: 0,
      w: 256,
      h: 256,
    };
    const base = biomeWallDecorTextureUrl(mood).replace(/\.png$/, "");
    return {
      albedo: this.atlasFrame(`${base}.png`, [1024, 256], crop),
      normal: this.atlasFrame(`${base}-normal.png`, [1024, 256], crop, false),
      rough: this.atlasFrame(`${base}-rough.png`, [1024, 256], crop, false),
      depth: this.atlasFrame(`${base}-depth.png`, [1024, 256], crop, false),
    };
  }

  enemy(frame: SourcedAtlasFrame): THREE.Texture {
    return this.atlasFrame(
      frame.src ?? ENEMY_ATLAS_SRC,
      frame.size ?? ENEMY_ATLAS_SIZE,
      frame,
    );
  }

  /**
   * A texture is unique per enemy kind so its atlas crop can advance without
   * changing the other instanced material batches.
   */
  enemyAnimation(animation: EnemyAnimationDefinition): THREE.Texture {
    const key = `${animation.src}:${animation.size[0]}x${animation.size[1]}:animation-atlas`;
    const cached = this.atlasCache.get(key);
    if (cached) return cached;
    const texture = loader.load(animation.src);
    texture.name = `${animation.src}#shared-animation-atlas`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    this.ownedTextures.push(texture);
    this.atlasCache.set(key, texture);
    return texture;
  }

  item(frame: AtlasFrame): THREE.Texture {
    return this.atlasFrame("/assets/sprites/iron-ash-items.png", [1774, 887], frame);
  }

  wallArt(index: number): THREE.Texture {
    return this.wallArtPbr(index).albedo;
  }

  wallArtPbr(index: number): WallSpriteTextures {
    const x = (index % 2) * 512;
    const y = Math.floor(index / 2) * 512;
    const crop = {
      x,
      y,
      w: 512,
      h: 512,
    };
    const base = "/assets/sprites/iron-ash-wall-art";
    return {
      albedo: this.atlasFrame(`${base}.webp`, [1024, 1024], crop),
      normal: this.atlasFrame(`${base}-normal.png`, [1024, 1024], crop, false),
      rough: this.atlasFrame(`${base}-rough.png`, [1024, 1024], crop, false),
      depth: this.atlasFrame(`${base}-depth.png`, [1024, 1024], crop, false),
    };
  }

  dispose(): void {
    for (const texture of this.ownedTextures) texture.dispose();
  }

  private atlasFrame(
    source: string,
    size: readonly [number, number],
    frame: AtlasFrame,
    color = true,
  ): THREE.Texture {
    const key = `${source}:${size[0]}x${size[1]}:${frame.x},${frame.y},${frame.w},${frame.h}:${color ? "srgb" : "data"}`;
    const cached = this.atlasCache.get(key);
    if (cached) return cached;
    const texture = loader.load(source);
    texture.name = `${source}#${frame.x},${frame.y},${frame.w},${frame.h}`;
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.magFilter = color ? THREE.NearestFilter : THREE.LinearFilter;
    texture.minFilter = color ? THREE.NearestMipmapNearestFilter : THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(frame.w / size[0], frame.h / size[1]);
    texture.offset.set(frame.x / size[0], 1 - (frame.y + frame.h) / size[1]);
    this.ownedTextures.push(texture);
    this.atlasCache.set(key, texture);
    return texture;
  }
}

/** @deprecated Use ENEMY_ANIMATIONS for all new runtime work. */
export const ENEMY_FRAMES = ENEMY_ANIMATIONS;

export const ITEM_FRAMES = {
  skullSeal: { x: 0, y: 0, w: 443, h: 887 },
  resolveFlask: { x: 443, y: 0, w: 444, h: 887 },
  ironKey: { x: 887, y: 0, w: 443, h: 887 },
  reliquary: { x: 1330, y: 0, w: 444, h: 887 },
} as const;

/** Public URL for biome surface maps (editor / docs). */
export function biomeTextureUrl(
  mood: DungeonMoodId,
  surface: "floor" | "wall" | "ceiling",
  kind: "albedo" | "normal" | "rough" | "depth" = "albedo",
): string {
  return biomePath(mood, surface, kind);
}

export function biomeDoorTextureUrl(mood: DungeonMoodId): string {
  return `/assets/textures/biomes/${mood}/door.png`;
}

export function biomeWallDecorTextureUrl(mood: DungeonMoodId): string {
  return `/assets/sprites/biomes/${mood}-wall-decor.png`;
}
