import * as THREE from "three";

import { createSeededRandom } from "../core/random";
import { gridToWorld } from "../dungeon/gridCollision";
import type { DungeonData, DungeonRoom, GridCell } from "../dungeon/types";
import type { DungeonMood, DungeonMoodId } from "../systems/DungeonMood";

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

const LABELS: Readonly<Record<HazardTileKind, string>> = {
  fire: "BURNING FLOOR",
  ice: "SLICK ICE",
  toxin: "TOXIC FLOOR",
  spikes: "SPIKE PLATE",
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
  excludedCellKeys: ReadonlySet<string> = new Set(),
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
  const used = new Set(excludedCellKeys);
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
      const key = `${x},${y}`;
      if (used.has(key)) continue;
      used.add(key);
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
const HAZARD_ATLAS_ROW: Readonly<Record<HazardTileKind, number>> = {
  fire: 0.75,
  ice: 0.5,
  toxin: 0.25,
  spikes: 0,
};
const HAZARD_ANIMATION_FRAMES = [0, 1, 2, 3, 2, 1] as const;

function createHazardTexture(kind: HazardTileKind, mood: DungeonMoodId): THREE.Texture {
  const texture = new THREE.TextureLoader().load(HAZARD_ATLAS_PATH);
  texture.name = `${mood} ${kind} imagegen hazard atlas`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.25, 0.25);
  texture.offset.set(0, HAZARD_ATLAS_ROW[kind]);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

interface HazardVisual {
  placement: HazardTilePlacement;
  position: THREE.Vector3;
  spikeLayer: THREE.Group | null;
}

export class HazardTileSystem {
  readonly root = new THREE.Group();
  readonly placements: readonly HazardTilePlacement[];
  private readonly visuals: HazardVisual[] = [];
  private readonly materials = new Map<HazardTileKind, THREE.MeshStandardMaterial>();
  private elapsed = 0;
  private fireCooldown = 0;
  private spikeCooldown = 0;
  private toxinTickCooldown = 0;
  private toxinRemaining = 0;

  constructor(
    dungeon: DungeonData,
    mood: DungeonMood,
    tileSize: number,
    excludedCellKeys: ReadonlySet<string>,
  ) {
    this.root.name = `${mood.label} hazard tiles`;
    this.placements = planHazardTiles(dungeon, mood.id, excludedCellKeys);
    const tileGeometry = new THREE.PlaneGeometry(tileSize * 0.78, tileSize * 0.78);
    const spikeGeometry = new THREE.ConeGeometry(0.11, 0.52, 5);
    const spikeMaterial = new THREE.MeshStandardMaterial({
      color: BIOME_ACCENTS[mood.id][0],
      roughness: 0.48,
      metalness: 0.72,
    });
    for (const placement of this.placements) {
      let material = this.materials.get(placement.kind);
      if (!material) {
        const texture = createHazardTexture(placement.kind, mood.id);
        material = new THREE.MeshStandardMaterial({
          map: texture,
          emissiveMap: texture,
          color: new THREE.Color(0xffffff).lerp(new THREE.Color(BIOME_ACCENTS[mood.id][0]), 0.1),
          emissive: new THREE.Color(BIOME_ACCENTS[mood.id][0]),
          emissiveIntensity: placement.kind === "ice" ? 0.08 : 0.24,
          roughness: placement.kind === "ice" ? 0.24 : 0.72,
          metalness: placement.kind === "spikes" ? 0.52 : 0.08,
          transparent: true,
          alphaTest: 0.08,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        });
        material.name = `${mood.id} ${placement.kind} hazard material`;
        this.materials.set(placement.kind, material);
      }
      const worldPosition = gridToWorld(dungeon, placement.cell, tileSize);
      const position = new THREE.Vector3(worldPosition.x, 0, worldPosition.z);
      const tile = new THREE.Mesh(tileGeometry, material);
      tile.name = `${placement.kind} hazard tile`;
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(position.x, 0.025, position.z);
      tile.receiveShadow = false;
      this.root.add(tile);
      let spikeLayer: THREE.Group | null = null;
      if (placement.kind === "spikes") {
        spikeLayer = new THREE.Group();
        spikeLayer.position.set(position.x, 0.02, position.z);
        for (const [x, z] of [
          [-0.45, -0.45],
          [0.45, -0.45],
          [-0.45, 0.45],
          [0.45, 0.45],
        ] as const) {
          const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
          spike.position.set(x, 0.26, z);
          spikeLayer.add(spike);
        }
        this.root.add(spikeLayer);
      }
      this.visuals.push({ placement, position, spikeLayer });
    }
  }

  update(delta: number): void {
    this.elapsed += Math.max(0, delta);
    const frame =
      HAZARD_ANIMATION_FRAMES[Math.floor(this.elapsed * 3.5) % HAZARD_ANIMATION_FRAMES.length]!;
    for (const [kind, material] of this.materials) {
      if (material.map) material.map.offset.x = frame * 0.25;
      material.emissiveIntensity =
        (kind === "ice" ? 0.06 : 0.18) + (Math.sin(this.elapsed * 4.2) * 0.5 + 0.5) * 0.12;
    }
    for (const visual of this.visuals) {
      if (!visual.spikeLayer) continue;
      const exposure = this.spikeExposure(visual.placement.phase);
      visual.spikeLayer.scale.y = 0.08 + exposure * 0.92;
    }
  }

  sample(delta: number, player: THREE.Vector3): HazardSurfaceEffect {
    this.fireCooldown = Math.max(0, this.fireCooldown - delta);
    this.spikeCooldown = Math.max(0, this.spikeCooldown - delta);
    this.toxinTickCooldown = Math.max(0, this.toxinTickCooldown - delta);
    this.toxinRemaining = Math.max(0, this.toxinRemaining - delta);
    let damage = 0;
    let active: HazardVisual | null = null;
    for (const visual of this.visuals) {
      if (Math.hypot(player.x - visual.position.x, player.z - visual.position.z) > 0.82) continue;
      active = visual;
      break;
    }
    if (active?.placement.kind === "fire" && this.fireCooldown === 0) {
      damage += 5;
      this.fireCooldown = 0.58;
    }
    if (active?.placement.kind === "toxin") this.toxinRemaining = 3.2;
    if (this.toxinRemaining > 0 && this.toxinTickCooldown === 0) {
      damage += 3;
      this.toxinTickCooldown = 0.8;
    }
    if (
      active?.placement.kind === "spikes" &&
      this.spikeCooldown === 0 &&
      this.spikeExposure(active.placement.phase) > 0.62
    ) {
      damage += 14;
      this.spikeCooldown = 1.4;
    }
    const kind = active?.placement.kind ?? (this.toxinRemaining > 0 ? "toxin" : null);
    return {
      kind,
      label: kind ? LABELS[kind] : "",
      damage,
      movementScale: kind === "ice" ? 0.82 : 1,
      traction: kind === "ice" ? 0.18 : 1,
    };
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const entries = Array.isArray(object.material) ? object.material : [object.material];
      entries.forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) material.map?.dispose();
      material.dispose();
    });
    this.root.clear();
  }

  private spikeExposure(phase: number): number {
    return THREE.MathUtils.smoothstep(Math.sin(this.elapsed * 2.3 + phase), -0.25, 0.72);
  }
}
