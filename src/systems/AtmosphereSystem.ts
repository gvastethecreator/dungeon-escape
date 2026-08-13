import * as THREE from "three";

import { createSeededRandom } from "../core/random";
import { FLOOR } from "../dungeon/generateDungeon";
import { gridToWorld } from "../dungeon/gridCollision";
import type { DungeonData, GridCell } from "../dungeon/types";
import type {
  BiomeParticleGeometryData,
  BiomeParticleMaterial,
  SoftGroundFogMaterial,
} from "./AtmosphereMaterialsShared";
import { biomeParticleHandles, createBiomeParticleAssembly } from "./BiomeParticleMaterial";
import {
  getBiomeParticleProfile,
  isCeilingPrecipitationLayer,
  type BiomeParticleLayerProfile,
} from "./BiomeParticleProfile";
import type { DungeonMood } from "./DungeonMood";
import { getDungeonMood } from "./DungeonMood";
import type { SceneTextureSink } from "./SceneTextureRegistry";
import {
  createSoftGroundFogMaterial,
  SOFT_FOG_DENSITY,
  SOFT_FOG_DEFAULT_WALL_HEIGHT,
  SOFT_FOG_HEIGHT_FALLOFF_AIR,
  SOFT_FOG_HEIGHT_FALLOFF_GROUND,
  SOFT_FOG_LOCAL_HALF,
  softGroundFogHandles,
} from "./SoftGroundFogMaterial";

export {
  SOFT_FOG_DEFAULT_WALL_HEIGHT,
  SOFT_FOG_DENSITY,
  SOFT_FOG_DIST_FALLOFF,
  SOFT_FOG_HEIGHT_FALLOFF,
  SOFT_FOG_HEIGHT_FALLOFF_AIR,
  SOFT_FOG_HEIGHT_FALLOFF_GROUND,
  SOFT_FOG_LOCAL_HALF,
  SOFT_FOG_MAX_ALPHA,
  SOFT_FOG_MAX_DIST,
} from "./SoftGroundFogMaterial";

interface MistBank {
  sprite: THREE.Sprite;
  baseY: number;
  phase: number;
  baseOpacity: number;
  currentOpacity: number;
}

interface SoftGroundFog {
  mesh: THREE.Mesh;
  material: SoftGroundFogMaterial;
  baseDensity: number;
  mask: THREE.DataTexture;
  worldMin: THREE.Vector2;
  worldSize: THREE.Vector2;
}

interface MoteCloud {
  object: THREE.Points | THREE.Sprite;
  material: BiomeParticleMaterial;
  count: number;
}

/**
 * Soft volume haze from mood. Pulls mist toward fog base, then caps Rec.709
 * luminance so bright ice/mist hexes cannot bleach torch contrast. Dark moods
 * keep authored depth — only bright haze is compressed.
 */
export function fogVolumeColor(mood: DungeonMood): THREE.Color {
  const color = new THREE.Color(mood.mistColor);
  color.lerp(new THREE.Color(mood.fog), 0.55);
  const lum = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  const targetLum = 0.22;
  if (lum > targetLum) {
    color.multiplyScalar(targetLum / lum);
  } else {
    // Mild settle for already-dark authored mist (grim/frost/molten).
    color.multiplyScalar(0.88);
  }
  return color;
}

function createMistTexture(): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([200, 202, 198, 120]);
    const texture = new THREE.DataTexture(data, 1, 1);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create mist texture.");
  const gradient = context.createRadialGradient(64, 34, 3, 64, 34, 61);
  gradient.addColorStop(0, "rgba(214, 216, 207, 0.44)");
  gradient.addColorStop(0.44, "rgba(157, 166, 165, 0.2)");
  gradient.addColorStop(1, "rgba(88, 98, 101, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/** Coarse lit motes — count scales with floor area. */
// Mote budgets trimmed for smoother mid-range GPUs (still reads as ash motes).
export const DUST_COARSE_MIN = 360;
export const DUST_COARSE_MAX = 900;
export const DUST_COARSE_PER_FLOOR = 0.5;
/** World-unit point size range (varied per mote). */
export const DUST_COARSE_SIZE_MIN = 0.025;
export const DUST_COARSE_SIZE_MAX = 0.105;
/** Peak opacity while visible (particles also fade in/out over time). */
export const DUST_COARSE_OPACITY = 0.46;

/** Fine floating dust layer. */
export const DUST_FINE_MIN = 280;
export const DUST_FINE_MAX = 720;
export const DUST_FINE_PER_FLOOR = 0.38;
export const DUST_FINE_SIZE_MIN = 0.015;
export const DUST_FINE_SIZE_MAX = 0.06;
export const DUST_FINE_OPACITY = 0.34;

/** Kept for tests / callers that still read a single size token (mid of range). */
export const DUST_COARSE_SIZE = (DUST_COARSE_SIZE_MIN + DUST_COARSE_SIZE_MAX) * 0.5;
export const DUST_FINE_SIZE = (DUST_FINE_SIZE_MIN + DUST_FINE_SIZE_MAX) * 0.5;

/** Dense enough for a room read while both layers stay under their profile caps. */
export const BIOME_PARTICLE_DENSITY_DESKTOP = 2.2;
export const BIOME_PARTICLE_DENSITY_COMPACT = 1.25;

function createDustTexture(): THREE.Texture {
  if (typeof document === "undefined") {
    const data = new Uint8Array([255, 250, 235, 255]);
    const texture = new THREE.DataTexture(data, 1, 1);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create dust texture.");
  // Hotter core + shorter falloff so each mote reads as a speck, not a faint smear.
  const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 14);
  gradient.addColorStop(0, "rgba(255, 252, 240, 1)");
  gradient.addColorStop(0.22, "rgba(255, 244, 210, 0.95)");
  gradient.addColorStop(0.55, "rgba(230, 215, 175, 0.55)");
  gradient.addColorStop(1, "rgba(160, 150, 120, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft floor mask: 5×5 blur so walkable area edges feather, not grid. */
function createFloorMaskTexture(dungeon: DungeonData): THREE.DataTexture {
  const w = dungeon.width;
  const h = dungeon.height;
  const raw = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      raw[y * w + x] = dungeon.grid[y]?.[x] === FLOOR ? 1 : 0;
    }
  }
  const soft = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const sx = x + dx;
          const sy = y + dy;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          // Distance weight for rounder soft edges.
          const weight = 1 / (1 + dx * dx + dy * dy);
          sum += raw[sy * w + sx]! * weight;
          count += weight;
        }
      }
      soft[y * w + x] = sum / Math.max(1e-6, count);
    }
  }
  const data = new Uint8Array(w * h);
  for (let i = 0; i < soft.length; i += 1) {
    data[i] = Math.round(Math.min(1, soft[i]!) * 255);
  }
  const texture = new THREE.DataTexture(data, w, h, THREE.RedFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.name = "Dungeon floor fog mask";
  return texture;
}

/** How hard a biome-event pulse ramps ceiling precipitation opacity. */
export const CEILING_EVENT_OPACITY_BOOST = 2.35;
/** Extra fall speed while a biome-event pulse is active. */
export const CEILING_EVENT_SPEED_BOOST = 1.7;

export class AtmosphereSystem {
  readonly stats = { mistBanks: 0, motes: 0, groundFogTiles: 0 };
  private readonly group = new THREE.Group();
  private readonly mistTexture: THREE.Texture;
  private readonly dustTexture: THREE.Texture;
  private readonly mistBanks: MistBank[] = [];
  private mistBankMaterial: THREE.SpriteMaterial | null = null;
  private softGroundFog: SoftGroundFog | null = null;
  private supportParticles: THREE.Points | THREE.Sprite | null = null;
  private signatureParticles: THREE.Points | THREE.Sprite | null = null;
  private ceilingParticles: THREE.Points | THREE.Sprite | null = null;
  private supportParticleMaterial: BiomeParticleMaterial | null = null;
  private signatureParticleMaterial: BiomeParticleMaterial | null = null;
  private ceilingParticleMaterial: BiomeParticleMaterial | null = null;
  private ceilingBaseOpacity = 0;
  private ceilingBaseSpeed = 0;
  /** 0..1 — biome event pulse (dustfall, cinderfall, …) intensifies ceiling fallers. */
  private eventPulse = 0;
  /** 0..1 — clarity pickup thins soft volume fog and mist banks. */
  private fogClearPulse = 0;
  private elapsed = 0;
  private readonly wallHeight: number;
  private readonly viewer = new THREE.Vector3();
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly tileSize: number,
    wallHeight: number = SOFT_FOG_DEFAULT_WALL_HEIGHT,
    private readonly textureSink?: SceneTextureSink,
  ) {
    this.wallHeight = wallHeight;
    this.mistTexture = createMistTexture();
    this.dustTexture = createDustTexture();
    this.textureSink?.register(this.mistTexture);
    this.textureSink?.register(this.dustTexture);
    this.group.name = "Dungeon atmosphere";
    scene.add(this.group);
  }

  /**
   * Intensifies biome ceiling precipitation (grit, ash, spores, drips).
   * Environment-only: no screen streaks — particles fall from the slab.
   */
  setEventPulse(amount: number): void {
    this.eventPulse = THREE.MathUtils.clamp(amount, 0, 1);
    this.applyCeilingEventPulse();
  }

  /** Temporary clarity pickup: fade soft ground fog and mist banks. */
  setFogClearPulse(amount: number): void {
    this.fogClearPulse = THREE.MathUtils.clamp(amount, 0, 1);
    this.applyFogClearPulse();
  }

  setDungeon(dungeon: DungeonData, mood: DungeonMood = getDungeonMood("ash")): void {
    this.clear();
    this.elapsed = 0;
    this.eventPulse = 0;
    this.fogClearPulse = 0;
    const random = createSeededRandom(`${dungeon.seed}:atmosphere`);
    const rooms = [...dungeon.rooms].sort((a, b) => b.width * b.height - a.width * a.height);

    // Soft wisps through the column — dual-layer height bias (ground + air).
    const bankCount = Math.min(18, Math.max(9, Math.round(rooms.length * 0.6)));
    const wispColor = fogVolumeColor(mood);
    this.mistBankMaterial = new THREE.SpriteMaterial({
      map: this.mistTexture,
      color: wispColor,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
      blending: THREE.NormalBlending,
    });
    for (let index = 0; index < bankCount; index += 1) {
      const room = rooms[index % Math.max(1, rooms.length)];
      if (!room) continue;
      const center = gridToWorld(dungeon, room.center, this.tileSize);
      // Prefer lower/mid air (matches ground+air exponentials).
      const heightT = Math.pow(random.next(), 1.25);
      const baseY = 0.2 + heightT * (this.wallHeight * 0.88);
      const heightFade =
        0.52 * Math.exp(-SOFT_FOG_HEIGHT_FALLOFF_GROUND * baseY) +
        0.48 * Math.exp(-SOFT_FOG_HEIGHT_FALLOFF_AIR * baseY);
      const baseOpacity = (0.018 + heightFade * 0.055) * mood.dustOpacityScale;
      const sprite = new THREE.Sprite(this.mistBankMaterial);
      sprite.position.set(
        center.x + (random.next() - 0.5) * room.width * this.tileSize * 0.48,
        baseY,
        center.z + (random.next() - 0.5) * room.height * this.tileSize * 0.48,
      );
      const scale = 4.0 + random.next() * 3.8 + heightFade * 2.0;
      sprite.scale.set(scale, scale * (0.42 + heightFade * 0.28), 1);
      sprite.renderOrder = 1;
      const bank: MistBank = {
        sprite,
        baseY,
        phase: index * 1.71,
        baseOpacity,
        currentOpacity: baseOpacity,
      };
      sprite.onBeforeRender = () => {
        const material = this.mistBankMaterial;
        if (material) material.opacity = bank.currentOpacity;
      };
      this.group.add(sprite);
      this.mistBanks.push(bank);
    }

    const floorCells: GridCell[] = [];
    for (let y = 0; y < dungeon.height; y += 1) {
      for (let x = 0; x < dungeon.width; x += 1)
        if (dungeon.grid[y]?.[x] === FLOOR) floorCells.push({ x, y });
    }

    this.addSoftGroundFog(dungeon, floorCells, mood);

    if (floorCells.length === 0) {
      this.stats.mistBanks = this.mistBanks.length;
      this.stats.motes = 0;
      return;
    }

    const profile = getBiomeParticleProfile(mood.id);
    const support = this.createMoteCloud(dungeon, floorCells, random, profile.support);
    const signature = this.createMoteCloud(dungeon, floorCells, random, profile.signature);
    const ceiling = this.createMoteCloud(dungeon, floorCells, random, profile.ceiling);
    this.supportParticles = support.object;
    this.signatureParticles = signature.object;
    this.ceilingParticles = ceiling.object;
    this.supportParticleMaterial = support.material;
    this.signatureParticleMaterial = signature.material;
    this.ceilingParticleMaterial = ceiling.material;
    this.ceilingBaseOpacity = profile.ceiling.opacity;
    this.ceilingBaseSpeed = profile.ceiling.speed;
    this.applyCeilingEventPulse();
    this.group.add(this.supportParticles, this.signatureParticles, this.ceilingParticles);
    this.stats.mistBanks = this.mistBanks.length;
    this.stats.motes = support.count + signature.count + ceiling.count;
  }

  /**
   * @param viewerPosition Player/camera XZ follow target for the local fog volume.
   */
  update(delta: number, viewerPosition?: THREE.Vector3Like): void {
    this.elapsed += delta;
    if (viewerPosition) {
      this.viewer.set(viewerPosition.x, viewerPosition.y, viewerPosition.z);
      if (this.softGroundFog) {
        this.softGroundFog.mesh.position.x = viewerPosition.x;
        this.softGroundFog.mesh.position.z = viewerPosition.z;
        this.softGroundFog.mesh.position.y =
          this.softGroundFog.mesh.userData.webGpuFogGroundLayer === true
            ? 0.08
            : this.wallHeight * 0.5;
        const fogHandles = softGroundFogHandles(this.softGroundFog.material);
        fogHandles?.uBoxCenter.value.set(viewerPosition.x, viewerPosition.z);
      }
    }
    const clearFade = 1 - this.fogClearPulse * 0.94;
    for (const bank of this.mistBanks) {
      bank.sprite.position.y = bank.baseY + Math.sin(this.elapsed * 0.34 + bank.phase) * 0.1;
      bank.currentOpacity =
        (bank.baseOpacity + (Math.sin(this.elapsed * 0.47 + bank.phase) * 0.5 + 0.5) * 0.02) *
        clearFade;
    }
    if (this.softGroundFog) {
      const fogHandles = softGroundFogHandles(this.softGroundFog.material);
      if (fogHandles) {
        fogHandles.uTime.value = this.elapsed;
        const pulse = 1 + Math.sin(this.elapsed * 0.17) * 0.03;
        fogHandles.uDensity.value = this.softGroundFog.baseDensity * pulse * clearFade;
      }
    }
    // All flow and the player wake run on the GPU; only tick shared uniforms.
    for (const material of [
      this.supportParticleMaterial,
      this.signatureParticleMaterial,
      this.ceilingParticleMaterial,
    ]) {
      if (!material) continue;
      const handles = biomeParticleHandles(material);
      if (!handles) continue;
      handles.uTime.value = this.elapsed;
      handles.uViewer.value.copy(this.viewer);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.textureSink?.unregister(this.mistTexture);
    this.textureSink?.unregister(this.dustTexture);
    this.mistTexture.dispose();
    this.dustTexture.dispose();
    this.scene.remove(this.group);
  }

  private applyCeilingEventPulse(): void {
    if (!this.ceilingParticleMaterial) return;
    const handles = biomeParticleHandles(this.ceilingParticleMaterial);
    if (!handles) return;
    const pulse = this.eventPulse;
    const clearFade = 1 - this.fogClearPulse * 0.72;
    handles.uOpacity.value = Math.min(
      1,
      this.ceilingBaseOpacity * (1 + pulse * (CEILING_EVENT_OPACITY_BOOST - 1)) * clearFade,
    );
    handles.uSpeed.value = this.ceilingBaseSpeed * (1 + pulse * (CEILING_EVENT_SPEED_BOOST - 1));
  }

  private applyFogClearPulse(): void {
    // Ceiling opacity depends on both event and clarity pulses.
    this.applyCeilingEventPulse();
    for (const material of [this.supportParticleMaterial, this.signatureParticleMaterial]) {
      if (!material) continue;
      // Support/signature keep base authored opacity; only soft volume fog thins hard.
      // No extra work here — mist + soft fog apply clearFade each frame.
    }
  }

  private addSoftGroundFog(
    dungeon: DungeonData,
    floorCells: readonly GridCell[],
    mood: DungeonMood,
  ): void {
    if (floorCells.length === 0) return;

    const worldMin = new THREE.Vector2(
      -(dungeon.width * this.tileSize) / 2,
      -(dungeon.height * this.tileSize) / 2,
    );
    const worldSize = new THREE.Vector2(
      dungeon.width * this.tileSize,
      dungeon.height * this.tileSize,
    );

    const mask = createFloorMaskTexture(dungeon);
    this.textureSink?.register(mask);
    // Local box: follows player each frame; height = full wall column.
    const side = SOFT_FOG_LOCAL_HALF * 2;
    const baseDensity = SOFT_FOG_DENSITY * mood.volumeFogMul;
    const material = createSoftGroundFogMaterial({
      color: fogVolumeColor(mood),
      density: baseDensity,
      mask,
      worldMin,
      worldSize,
      wallHeight: this.wallHeight,
    });
    const usesWebGpuGroundLayer = material.userData.softGroundFogPlane === true;
    const geometry = usesWebGpuGroundLayer
      ? new THREE.PlaneGeometry(side, side)
      : new THREE.BoxGeometry(side, this.wallHeight, side);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Soft volumetric ground fog";
    mesh.userData.webGpuFogGroundLayer = usesWebGpuGroundLayer;
    if (usesWebGpuGroundLayer) mesh.rotation.x = -Math.PI * 0.5;
    mesh.position.set(0, usesWebGpuGroundLayer ? 0.08 : this.wallHeight * 0.5, 0);
    mesh.renderOrder = 3;
    // Volume spans the dungeon; local bounds would cull valid fog slabs.
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.softGroundFog = { mesh, material, baseDensity, mask, worldMin, worldSize };
    this.stats.groundFogTiles = floorCells.length;
  }

  private createMoteCloud(
    dungeon: DungeonData,
    floorCells: readonly GridCell[],
    random: ReturnType<typeof createSeededRandom>,
    layer: BiomeParticleLayerProfile,
  ): MoteCloud {
    const densityScale =
      typeof window !== "undefined" && window.innerWidth <= 820
        ? BIOME_PARTICLE_DENSITY_COMPACT
        : BIOME_PARTICLE_DENSITY_DESKTOP;
    const count = Math.min(
      layer.maxCount,
      Math.max(layer.minCount, Math.round(floorCells.length * layer.perFloor * densityScale)),
    );
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const tints = new Float32Array(count);
    const sizeSpan = Math.max(0, layer.sizeMax - layer.sizeMin);
    const cells = [...floorCells];
    for (let index = cells.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random.next() * (index + 1));
      [cells[index], cells[swapIndex]] = [cells[swapIndex]!, cells[index]!];
    }
    const ceilingSpawn = isCeilingPrecipitationLayer(layer);
    for (let index = 0; index < count; index += 1) {
      const cell = cells[index % cells.length]!;
      const point = gridToWorld(dungeon, cell, this.tileSize);
      // Column field fills the room; ceiling drips seed near the slab.
      const y = ceilingSpawn
        ? this.wallHeight * (0.9 + random.next() * 0.08)
        : 0.15 + Math.pow(random.next(), 1.08) * (this.wallHeight * 0.88);
      // Sparse ceiling fallers cluster slightly so some spots feel wetter/dirtier.
      const cluster = ceilingSpawn && random.next() < 0.35 ? 0.22 : 0.5;
      positions[index * 3] = point.x + (random.next() - 0.5) * this.tileSize * cluster * 2;
      positions[index * 3 + 1] = y;
      positions[index * 3 + 2] = point.z + (random.next() - 0.5) * this.tileSize * cluster * 2;
      const sizeT = Math.pow(random.next(), 1.35);
      sizes[index] = layer.sizeMin + sizeSpan * sizeT;
      phases[index] = random.next();
      tints[index] = Math.pow(random.next(), 1.5);
    }
    const data: BiomeParticleGeometryData = {
      positions,
      sizes,
      phases,
      tints,
      count,
    };
    const assembly = createBiomeParticleAssembly(
      { map: this.dustTexture, layer, wallHeight: this.wallHeight },
      data,
      `Biome particles: ${layer.name}`,
    );
    return { object: assembly.object, material: assembly.material, count: assembly.count };
  }

  private clear(): void {
    if (this.softGroundFog) {
      this.textureSink?.unregister(this.softGroundFog.mask);
      this.softGroundFog.mask.dispose();
      this.softGroundFog = null;
    }
    while (this.group.children.length > 0) {
      const child = this.group.children[0]!;
      this.group.remove(child);
      if (child instanceof THREE.InstancedMesh || child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const material = child.material;
        const materials = Array.isArray(material) ? material : [material];
        for (const entry of materials) entry.dispose();
        continue;
      }
      const object = child as THREE.Points | THREE.Sprite;
      if ((object as THREE.Points).isPoints) (object as THREE.Points).geometry.dispose();
      const material = object.material;
      const materials = Array.isArray(material) ? material : material ? [material] : [];
      for (const entry of materials) {
        if (entry !== this.mistBankMaterial) entry.dispose();
      }
    }
    this.mistBankMaterial?.dispose();
    this.mistBankMaterial = null;
    this.mistBanks.length = 0;
    this.supportParticles = null;
    this.signatureParticles = null;
    this.ceilingParticles = null;
    this.supportParticleMaterial = null;
    this.signatureParticleMaterial = null;
    this.ceilingParticleMaterial = null;
    this.ceilingBaseOpacity = 0;
    this.ceilingBaseSpeed = 0;
    this.eventPulse = 0;
    this.fogClearPulse = 0;

    this.stats.mistBanks = 0;
    this.stats.motes = 0;
    this.stats.groundFogTiles = 0;
  }
}
