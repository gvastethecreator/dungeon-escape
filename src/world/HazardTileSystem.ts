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

/**
 * Image-derived forged spike profile. The reference uses uneven faceted tapers,
 * so a four-ring custom buffer keeps a bent shoulder and off-axis tip instead
 * of the smooth radial silhouette of ConeGeometry.
 */
export function createForgedSpikeGeometry(): THREE.BufferGeometry {
  const sides = 4;
  const rings = [
    { y: 0, radius: 0.13, x: 0, z: 0 },
    { y: 0.065, radius: 0.142, x: -0.006, z: 0.006 },
    { y: 0.16, radius: 0.096, x: 0.004, z: -0.004 },
    { y: 0.39, radius: 0.045, x: 0.024, z: 0.01 },
  ] as const;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const [ringIndex, ring] of rings.entries()) {
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2 + Math.PI / 4 + ringIndex * 0.09;
      positions.push(
        ring.x + Math.cos(angle) * ring.radius,
        ring.y,
        ring.z + Math.sin(angle) * ring.radius,
      );
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
  positions.push(0.045, 0.54, -0.018);
  const lastRing = (rings.length - 1) * sides;
  for (let side = 0; side < sides; side += 1) {
    indices.push(lastRing + side, tip, lastRing + ((side + 1) % sides));
  }
  const baseCenter = positions.length / 3;
  positions.push(0, 0, 0);
  for (let side = 0; side < sides; side += 1) {
    indices.push(baseCenter, (side + 1) % sides, side);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = "Image-sculpted forged hazard spike";
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

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

  constructor(
    dungeon: DungeonData,
    mood: DungeonMood,
    tileSize: number,
    excludedCellKeys: ReadonlySet<string>,
  ) {
    this.root.name = `${mood.label} hazard tiles`;
    this.placements = planHazardTiles(dungeon, mood.id, excludedCellKeys);
    const tileGeometry = new THREE.PlaneGeometry(tileSize * 0.78, tileSize * 0.78);
    const placementsByKind = new Map<HazardTileKind, HazardTilePlacement[]>();
    for (const placement of this.placements) {
      const list = placementsByKind.get(placement.kind) ?? [];
      list.push(placement);
      placementsByKind.set(placement.kind, list);
    }
    const spikePlacements = placementsByKind.get("spikes") ?? [];
    const spikeGeometry = createForgedSpikeGeometry();
    const spikeColor = new THREE.Color(0x2e2b29).lerp(
      new THREE.Color(BIOME_ACCENTS[mood.id][0]),
      0.09,
    );
    const spikeMaterial = new THREE.MeshStandardMaterial({
      color: spikeColor,
      roughness: 0.72,
      metalness: 0.58,
      envMapIntensity: 0.28,
      side: THREE.DoubleSide,
    });
    const collarGeometry = new THREE.TorusGeometry(0.105, 0.022, 4, 8);
    collarGeometry.name = "Forged spike socket collar";
    collarGeometry.rotateX(-Math.PI / 2);
    const collarMaterial = spikeMaterial.clone();
    collarMaterial.name = `${mood.id} forged spike collar material`;
    collarMaterial.color.multiplyScalar(0.55);
    collarMaterial.roughness = 0.82;
    collarMaterial.metalness = 0.46;

    const tileRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const tileScale = new THREE.Vector3(1, 1, 1);
    const tileMatrix = new THREE.Matrix4();
    const tilePosition = new THREE.Vector3();
    for (const [kind, placements] of placementsByKind) {
      const response = HAZARD_MATERIAL_RESPONSE[kind];
      const texture = createHazardTexture(kind, mood.id);
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
        tilePosition.set(worldPosition.x, 0.025, worldPosition.z);
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
      this.spikeInstances = new THREE.InstancedMesh(spikeGeometry, spikeMaterial, count);
      this.spikeInstances.name = "Image-sculpted forged spike batch";
      this.spikeInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const collarInstances = new THREE.InstancedMesh(collarGeometry, collarMaterial, count);
      collarInstances.name = "Forged spike socket collar batch";
      const color = new THREE.Color();
      let instance = 0;
      for (const placement of spikePlacements) {
        const visual = this.visuals.find((entry) => entry.placement === placement);
        if (!visual) continue;
        visual.spikeStart = instance;
        for (const [localIndex, layout] of SPIKE_LAYOUT.entries()) {
          const colorGain = 0.9 + ((localIndex + instance) % 3) * 0.045;
          color.copy(spikeColor).multiplyScalar(colorGain);
          this.spikeInstances.setColorAt(instance, color);
          this.spikePosition.set(visual.position.x + layout.x, 0.055, visual.position.z + layout.z);
          this.spikeEuler.set(layout.leanX, layout.yaw, layout.leanZ);
          this.spikeQuaternion.setFromEuler(this.spikeEuler);
          this.spikeScale.set(layout.scale, 0.08, layout.scale);
          this.spikeMatrix.compose(this.spikePosition, this.spikeQuaternion, this.spikeScale);
          this.spikeInstances.setMatrixAt(instance, this.spikeMatrix);

          this.spikePosition.y = 0.048;
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
      this.root.add(collarInstances, this.spikeInstances);
    } else {
      this.spikeInstances = null;
      spikeGeometry.dispose();
      spikeMaterial.dispose();
      collarGeometry.dispose();
      collarMaterial.dispose();
    }
    this.root.userData.sculptRuntime = {
      sourceImage: HAZARD_ATLAS_PATH,
      sourceSpec: ".scratch/quality-pass-2026-07-27/img2threejs/forged-spike-plate/spec.json",
      components: ["plate-frame", "spike-batch", "spike-collars", "guide-grooves"],
      collider: { type: "box-trigger", size: [tileSize * 0.78, 0.55, tileSize * 0.78] },
      drawStrategy: "instanced by hazard kind; shared spike and collar batches",
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
      const exposure = this.spikeExposure(visual.placement.phase);
      for (const [localIndex, layout] of SPIKE_LAYOUT.entries()) {
        const instance = visual.spikeStart + localIndex;
        const stagger = 0.92 + ((localIndex + 2) % 3) * 0.045;
        this.spikePosition.set(visual.position.x + layout.x, 0.055, visual.position.z + layout.z);
        this.spikeEuler.set(layout.leanX, layout.yaw, layout.leanZ);
        this.spikeQuaternion.setFromEuler(this.spikeEuler);
        this.spikeScale.set(layout.scale, 0.035 + exposure * stagger, layout.scale);
        this.spikeMatrix.compose(this.spikePosition, this.spikeQuaternion, this.spikeScale);
        this.spikeInstances.setMatrixAt(instance, this.spikeMatrix);
      }
    }
    this.spikeInstances.instanceMatrix.needsUpdate = true;
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
      if (material instanceof THREE.MeshStandardMaterial) {
        material.map?.dispose();
        if (material.emissiveMap !== material.map) material.emissiveMap?.dispose();
      }
      material.dispose();
    });
    this.root.clear();
  }

  private spikeExposure(phase: number): number {
    return THREE.MathUtils.smoothstep(Math.sin(this.elapsed * 2.3 + phase), -0.25, 0.72);
  }
}
