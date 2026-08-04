import * as THREE from "three";
import type { DungeonMoodId } from "../systems/DungeonMood";
import type { SceneTextureSink } from "../systems/SceneTextureRegistry";
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
import {
  BIOME_SPRITE_ATLAS_SIZE,
  biomeSpritePropFrame,
  biomeSpritePropTextureUrl,
} from "./BiomeSpriteDecorKit";
import { BIOME_SPRITE_DECOR_ATLAS_SIZE } from "./BiomeSpriteDecorContract";
import { biomeSpriteDecorTextureUrl } from "./BiomeSpriteDecorCatalogs.generated";

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

/** One full double-leaf door plate and its matching linear data maps. */
export interface BiomeDoorTextures {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
  metalness: THREE.Texture;
}

/** Flat wall sprite plus its authored material response. */
export interface WallSpriteTextures {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  rough: THREE.Texture;
  depth: THREE.Texture;
}

const loader = new THREE.TextureLoader();

interface TextureLoadLifecycle {
  active: boolean;
  textureSink?: SceneTextureSink;
}

function completeTextureLoad(
  lifecycle: TextureLoadLifecycle,
  texture: THREE.Texture,
  prepare?: (loaded: THREE.Texture) => void,
): void {
  if (!lifecycle.active) return;
  prepare?.(texture);
  lifecycle.textureSink?.markRenderable(texture);
}

function pixelTexture(
  source: string,
  colorSpace = true,
  seam: "none" | "mirror" | "edge-blend" = "edge-blend",
  lifecycle: TextureLoadLifecycle,
  onLoad?: (texture: THREE.Texture) => void,
): THREE.Texture {
  const texture = loader.load(source, (loaded) => {
    completeTextureLoad(lifecycle, loaded, (ready) => {
      onLoad?.(ready);
      resolveTextureSource(ready);
    });
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
function dataTexture(source: string, lifecycle: TextureLoadLifecycle): THREE.Texture {
  const texture = loader.load(source, (loaded) => completeTextureLoad(lifecycle, loaded));
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
  if (kind === "albedo") return `/assets/textures/biomes/${mood}/${surface}.webp`;
  return `/assets/textures/biomes/${mood}/${surface}-${kind}.webp`;
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
  lifecycle: TextureLoadLifecycle,
): BiomeLayerTextures {
  const compact = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  // Light edge-blend on every layer with the same ratio keeps wrap borders locked.
  // (Albedo-only blend was desyncing normal/rough and drawing false tile lines.)
  const albedo = pixelTexture(
    biomePath(mood, surface, "albedo"),
    true,
    "edge-blend",
    lifecycle,
    (loaded) =>
      liftTextureLuminanceSource(loaded, {
        targetLuma: BIOME_ALBEDO_TARGETS[mood][surface],
        contrast: mood === "obsidian" || mood === "fungal" ? 1.5 : 1.35,
        gamma: 0.82,
      }),
  );
  const normal = compact
    ? null
    : pixelTexture(biomePath(mood, surface, "normal"), false, "edge-blend", lifecycle);
  const rough = compact
    ? null
    : pixelTexture(biomePath(mood, surface, "rough"), false, "edge-blend", lifecycle, (loaded) =>
        liftTextureRoughnessSource(loaded, {
          floor: BIOME_ROUGHNESS_FLOORS[mood][surface],
          gamma: 1,
        }),
      );
  const depth = compact ? null : dataTexture(biomePath(mood, surface, "depth"), lifecycle);
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
  readonly wall: THREE.Texture;
  readonly wallCrypt: THREE.Texture;
  readonly wallShrine: THREE.Texture;
  readonly wallTreasure: THREE.Texture;
  readonly wallBoss: THREE.Texture;
  readonly floor: THREE.Texture;
  readonly floorCrypt: THREE.Texture;
  readonly floorShrine: THREE.Texture;
  readonly floorTreasure: THREE.Texture;
  readonly floorBoss: THREE.Texture;
  readonly ceiling: THREE.Texture;
  /** Lazy biome packs — only the active mood loads PBR stacks (big boot win). */
  private readonly biomeSurfaces = new Map<DungeonMoodId, BiomeSurfaceTextures>();
  private readonly biomeDoors = new Map<DungeonMoodId, BiomeDoorTextures>();
  private readonly ownedTextures = new Set<THREE.Texture>();
  private readonly atlasCache = new Map<string, THREE.Texture>();
  private readonly loadLifecycle: TextureLoadLifecycle;
  private disposed = false;

  constructor(textureSink?: SceneTextureSink) {
    this.loadLifecycle = { active: true, textureSink };
    this.wall = this.pixelTexture("/assets/textures/iron-ash-wall-v2.webp");
    this.wallCrypt = this.pixelTexture("/assets/textures/generated/iron-ash-wall-crypt-v1.webp");
    this.wallShrine = this.pixelTexture("/assets/textures/generated/iron-ash-wall-shrine-v1.webp");
    this.wallTreasure = this.pixelTexture(
      "/assets/textures/generated/iron-ash-wall-treasure-v1.webp",
    );
    this.wallBoss = this.pixelTexture("/assets/textures/generated/iron-ash-wall-boss-v1.webp");
    this.floor = this.pixelTexture("/assets/textures/iron-ash-floor-v2.webp");
    this.floorCrypt = this.pixelTexture("/assets/textures/generated/iron-ash-floor-crypt-v1.webp");
    this.floorShrine = this.pixelTexture(
      "/assets/textures/generated/iron-ash-floor-shrine-v1.webp",
    );
    this.floorTreasure = this.pixelTexture(
      "/assets/textures/generated/iron-ash-floor-treasure-v1.webp",
    );
    this.floorBoss = this.pixelTexture("/assets/textures/generated/iron-ash-floor-boss-v1.webp");
    this.ceiling = this.pixelTexture("/assets/textures/iron-ash-ceiling.webp");
    this.wall.repeat.set(1, 1);
    this.floor.repeat.set(1, 1);
    this.ceiling.repeat.set(1, 1);
  }

  getBiomeSurfaces(mood: DungeonMoodId): BiomeSurfaceTextures {
    const cached = this.biomeSurfaces.get(mood);
    if (cached) return cached;
    const pack = {
      floor: loadBiomeLayer(mood, "floor", this.loadLifecycle),
      wall: loadBiomeLayer(mood, "wall", this.loadLifecycle),
      ceiling: loadBiomeLayer(mood, "ceiling", this.loadLifecycle),
    } satisfies BiomeSurfaceTextures;
    for (const layer of Object.values(pack)) {
      for (const texture of [layer.albedo, layer.normal, layer.rough, layer.depth]) {
        if (texture) this.ownTexture(texture);
      }
    }
    this.biomeSurfaces.set(mood, pack);
    return pack;
  }

  /** Test/helper: ensure a mood pack exists without building a dungeon. */
  preloadBiome(mood: DungeonMoodId): BiomeSurfaceTextures {
    return this.getBiomeSurfaces(mood);
  }

  /** One authored door surface per biome; every map uses the same centered leaf split. */
  biomeDoorSurface(mood: DungeonMoodId): BiomeDoorTextures {
    const cached = this.biomeDoors.get(mood);
    if (cached) return cached;
    const base = `/assets/textures/biomes/${mood}/door`;
    const surface = {
      albedo: this.pixelTexture(biomeDoorTextureUrl(mood), true, "none"),
      normal: this.dataTexture(`${base}-normal.webp`),
      roughness: this.dataTexture(`${base}-roughness.webp`),
      metalness: this.dataTexture(`${base}-metalness.webp`),
    } satisfies BiomeDoorTextures;
    for (const texture of Object.values(surface)) {
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.repeat.set(1, 1);
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 8;
      this.loadLifecycle.textureSink?.register(texture);
    }
    this.biomeDoors.set(mood, surface);
    return surface;
  }

  /** Backward-compatible albedo access for callers which only need the color plate. */
  biomeDoor(mood: DungeonMoodId): THREE.Texture {
    return this.biomeDoorSurface(mood).albedo;
  }

  /** Four lit wall sprites per biome: two paintings, one fissure, one seal/stain. */
  biomeWallDecor(mood: DungeonMoodId, index: number): THREE.Texture {
    return this.biomeWallDecorPbr(mood, index).albedo;
  }

  biomeWallDecorPbr(mood: DungeonMoodId, index: number): WallSpriteTextures {
    const frame = Math.abs(index) % 4;
    const crop = {
      x: frame * 128,
      y: 0,
      w: 128,
      h: 128,
    };
    const base = biomeWallDecorTextureUrl(mood).replace(/\.webp$/, "");
    return {
      albedo: this.atlasFrame(`${base}.webp`, [512, 128], crop),
      normal: this.atlasFrame(`${base}-normal.webp`, [512, 128], crop, false),
      rough: this.atlasFrame(`${base}-rough.webp`, [512, 128], crop, false),
      depth: this.atlasFrame(`${base}-depth.webp`, [512, 128], crop, false),
    };
  }

  /** One transparent 512px billboard crop from the active biome prop atlas. */
  biomeSpriteProp(mood: DungeonMoodId, index: number): THREE.Texture {
    return this.atlasFrame(
      biomeSpritePropTextureUrl(mood),
      BIOME_SPRITE_ATLAS_SIZE,
      biomeSpritePropFrame(index),
    );
  }

  /**
   * One shared 7x4 v2 atlas per biome. Individual prop geometries remap their
   * UVs to a slot, avoiding 28 full-atlas texture uploads for one mood.
   */
  biomeSpriteDecorAtlas(mood: DungeonMoodId): THREE.Texture {
    return this.atlasFrame(biomeSpriteDecorTextureUrl(mood), BIOME_SPRITE_DECOR_ATLAS_SIZE, {
      x: 0,
      y: 0,
      w: BIOME_SPRITE_DECOR_ATLAS_SIZE[0],
      h: BIOME_SPRITE_DECOR_ATLAS_SIZE[1],
    });
  }

  enemy(frame: SourcedAtlasFrame): THREE.Texture {
    return this.atlasFrame(frame.src ?? ENEMY_ATLAS_SRC, frame.size ?? ENEMY_ATLAS_SIZE, frame);
  }

  /**
   * A texture is unique per enemy kind so its atlas crop can advance without
   * changing the other instanced material batches.
   */
  enemyAnimation(animation: EnemyAnimationDefinition): THREE.Texture {
    const key = `${animation.src}:${animation.size[0]}x${animation.size[1]}:animation-atlas`;
    const cached = this.atlasCache.get(key);
    if (cached) return cached;
    const lifecycle = this.loadLifecycle;
    const texture = loader.load(animation.src, (loaded) => completeTextureLoad(lifecycle, loaded));
    texture.name = `${animation.src}#shared-animation-atlas`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    this.ownTexture(texture);
    this.atlasCache.set(key, texture);
    return texture;
  }

  item(frame: AtlasFrame): THREE.Texture {
    return this.atlasFrame("/assets/sprites/iron-ash-items.webp", [887, 443], frame);
  }

  wallArt(index: number): THREE.Texture {
    return this.wallArtPbr(index).albedo;
  }

  wallArtPbr(index: number): WallSpriteTextures {
    const x = (index % 2) * 256;
    const y = Math.floor(index / 2) * 256;
    const crop = {
      x,
      y,
      w: 256,
      h: 256,
    };
    const base = "/assets/sprites/iron-ash-wall-art";
    return {
      albedo: this.atlasFrame(`${base}.webp`, [512, 512], crop),
      normal: this.atlasFrame(`${base}-normal.webp`, [512, 512], crop, false),
      rough: this.atlasFrame(`${base}-rough.webp`, [512, 512], crop, false),
      depth: this.atlasFrame(`${base}-depth.webp`, [512, 512], crop, false),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadLifecycle.active = false;
    const textureSink = this.loadLifecycle.textureSink;
    for (const texture of this.ownedTextures) {
      textureSink?.unregister(texture);
      texture.dispose();
    }
    this.loadLifecycle.textureSink = undefined;
    this.ownedTextures.clear();
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
    const lifecycle = this.loadLifecycle;
    const texture = loader.load(source, (loaded) => completeTextureLoad(lifecycle, loaded));
    texture.name = `${source}#${frame.x},${frame.y},${frame.w},${frame.h}`;
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.magFilter = color ? THREE.NearestFilter : THREE.LinearFilter;
    texture.minFilter = color ? THREE.NearestMipmapNearestFilter : THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(frame.w / size[0], frame.h / size[1]);
    texture.offset.set(frame.x / size[0], 1 - (frame.y + frame.h) / size[1]);
    this.ownTexture(texture);
    this.atlasCache.set(key, texture);
    return texture;
  }

  private pixelTexture(
    source: string,
    colorSpace = true,
    seam: "none" | "mirror" | "edge-blend" = "edge-blend",
    onLoad?: (texture: THREE.Texture) => void,
  ): THREE.Texture {
    return this.ownTexture(pixelTexture(source, colorSpace, seam, this.loadLifecycle, onLoad));
  }

  private dataTexture(source: string): THREE.Texture {
    return this.ownTexture(dataTexture(source, this.loadLifecycle));
  }

  private ownTexture<T extends THREE.Texture>(texture: T): T {
    this.ownedTextures.add(texture);
    this.loadLifecycle.textureSink?.register(texture);
    return texture;
  }
}

/** @deprecated Use ENEMY_ANIMATIONS for all new runtime work. */
export const ENEMY_FRAMES = ENEMY_ANIMATIONS;

export const ITEM_FRAMES = {
  skullSeal: { x: 0, y: 0, w: 222, h: 443 },
  resolveFlask: { x: 222, y: 0, w: 222, h: 443 },
  ironKey: { x: 444, y: 0, w: 221, h: 443 },
  reliquary: { x: 665, y: 0, w: 222, h: 443 },
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
  return `/assets/textures/biomes/${mood}/door.webp`;
}

export function biomeWallDecorTextureUrl(mood: DungeonMoodId): string {
  return `/assets/sprites/biomes/${mood}-wall-decor.webp`;
}
