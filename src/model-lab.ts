import * as THREE from "three";

import { createForgeChest } from "./world/ForgePropFactory";
import { createDungeonDoor } from "./world/DoorFactory";
import {
  createAnnihilationPulseRelic,
  createCullBrandRelic,
  createCurseVessel,
  createLuminousWardStone,
  createPhoenixEggRelic,
  createResolveFlask,
  createTimeFreezeRelic,
} from "./world/ItemFactory";
import {
  applyMoodToDungeonMaterials,
  createDungeonMaterials,
  type DungeonMaterials,
} from "./world/MaterialLibrary";
import { createMagicStone } from "./world/MagicStoneKit";
import { createReliquaryAltar } from "./world/ReliquaryAltar";
import { getBiomeDecorationProfile } from "./world/BiomeDecorationProfile";
import { getDungeonMood, parseDungeonMoodId, type DungeonMoodId } from "./systems/DungeonMood";
import { createDungeonProp } from "./world/DungeonPropKit";
import { createForgeProp } from "./world/ForgePropFactory";
import { createImageSculptedProp } from "./world/ImageSculptedPropKit";
import { createLightingPropBase } from "./world/LightingPropFactory";
import { createFloorCampfire } from "./world/FloorCampfireFactory";
import { createBiomeMagicPortal } from "./world/MagicPortalKit";
import { createSpecialRoomSignal } from "./world/SpecialRoomSignalKit";
import { createImageSculptedHanging } from "./world/ImageSculptedHangingKit";
import { createImageSculptedAmbient } from "./world/AtmospherePropsKit";
import { createImageSculptedSpikePlate } from "./world/HazardTileSystem";
import { LightingRig } from "./systems/LightingRig";
import { resolveDungeonExposure } from "./systems/LightTuning";
import { parseLaunchConfiguration } from "./launch/LaunchConfiguration";
import {
  createPlayRendererHandle,
  readPlayRendererBackendName,
  type PlayRendererHandle,
} from "./systems/PlayRendererFactory";
import {
  createShaderProgramModeRegistry,
  setShaderProgramModeRegistry,
} from "./systems/ShaderProgramMode";
import type { DungeonRenderer } from "./systems/DungeonRenderer";

export const MODEL_QA_VIEWS = ["front", "right", "back", "left", "rear-left", "top"] as const;
export type ModelQaView = (typeof MODEL_QA_VIEWS)[number];

export const DEFAULT_MODEL_QA_ID = "treasure-chest" as const;
export const MODEL_QA_LOAD_TIMEOUT_MS = 20_000;
export const MODEL_QA_REFERENCE_COUNT = 55;

interface ModelQaCatalogEntry {
  id: string;
  label: string;
  factory: (
    materials: DungeonMaterials,
    context: { mood: DungeonMoodId | "neutral" },
  ) => THREE.Group;
}

const BIOME_DOOR_QA = [
  ["ancient", "Ancient"],
  ["molten", "Molten"],
  ["frost", "Frost"],
  ["grim", "Grim"],
  ["verdant", "Verdant"],
  ["ash", "Ash"],
  ["iron", "Iron"],
  ["obsidian", "Obsidian"],
  ["sunken", "Sunken"],
  ["fungal", "Fungal"],
  ["backrooms", "Backrooms"],
] as const satisfies readonly (readonly [DungeonMoodId, string])[];

function loadDoorQaTexture(path: string, color: boolean): THREE.Texture {
  const texture =
    typeof document === "undefined" ? new THREE.Texture() : new THREE.TextureLoader().load(path);
  texture.name = path;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  return texture;
}

function createBiomeDoorQa(
  mood: DungeonMoodId,
  materials: DungeonMaterials,
  styleOverride?: "dungeon" | "office",
): THREE.Group {
  const profile = getBiomeDecorationProfile(mood);
  const style = styleOverride ?? profile.doorStyle;
  const base = `/assets/textures/biomes/${mood}/door`;
  const leafMaterial = new THREE.MeshStandardMaterial({
    name: `QA ${mood} door surface`,
    color: mood === "obsidian" ? 0x686b72 : 0xffffff,
    map: loadDoorQaTexture(`${base}.webp`, true),
    normalMap: loadDoorQaTexture(`${base}-normal.webp`, false),
    roughnessMap: loadDoorQaTexture(`${base}-roughness.webp`, false),
    metalnessMap: loadDoorQaTexture(`${base}-metalness.webp`, false),
    normalScale: new THREE.Vector2(0.72, 0.72),
    roughness: 1,
    metalness: 1,
    envMapIntensity: mood === "iron" ? 0.78 : 0.34,
  });
  const hardwareMaterial = materials.iron.clone();
  hardwareMaterial.color.setHex(profile.hardwareTint);
  hardwareMaterial.userData = { ...hardwareMaterial.userData, sharedDungeonMaterial: false };
  return createDungeonDoor(materials, 2.4, style === "office" ? 2.8 : 3.5, {
    style,
    curvedArch: style === "office" ? false : styleOverride ? true : profile.curvedArch,
    frameMaterial: materials.darkStone,
    leafMaterial,
    hardwareMaterial,
  });
}

const BIOME_DOOR_QA_ENTRIES = BIOME_DOOR_QA.map(([mood, label]) => ({
  id: `door-${mood}` as const,
  label: `${label} door`,
  factory: (materials: DungeonMaterials) => createBiomeDoorQa(mood, materials),
}));

function forgeModel(kind: string, materials: DungeonMaterials): THREE.Group {
  const model = createForgeProp({ kind, x: 0, y: 0, v: 0 }, materials);
  if (!model) throw new Error(`Forge prop ${kind} has no solid model.`);
  return model;
}

function signalModel(
  identity: "grave" | "treasure" | "shrine" | "elite" | "boss",
  materials: DungeonMaterials,
): THREE.Group {
  const root = new THREE.Group();
  root.name = `${identity} room signal QA root`;
  root.add(createSpecialRoomSignal(identity, materials));
  return root;
}

/**
 * Runtime model catalog. Each entry delegates to the same factory used by the
 * game, so the lab can expose changes in the rendered source model.
 */
export const MODEL_QA_CATALOG = [
  {
    id: "dungeon-door",
    label: "Dungeon door",
    factory: (materials, { mood }) =>
      mood === "neutral"
        ? createBiomeDoorQa("ancient", materials, "dungeon")
        : createBiomeDoorQa(mood, materials, "dungeon"),
  },
  {
    id: "office-door",
    label: "Office door",
    factory: (materials, { mood }) =>
      createBiomeDoorQa(mood === "neutral" ? "backrooms" : mood, materials, "office"),
  },
  {
    id: "entrance-portal-gate",
    label: "Entrance portal gate",
    factory: (materials) => createBiomeMagicPortal("ancient", materials).root,
  },
  {
    id: "carved-pillar",
    label: "Carved pillar",
    factory: (materials) => forgeModel("pillar", materials),
  },
  {
    id: "grave-marker",
    label: "Grave marker",
    factory: (materials) => forgeModel("grave", materials),
  },
  {
    id: "coffin",
    label: "Coffin",
    factory: (materials) => createDungeonProp("coffin", materials),
  },
  {
    id: "reliquary-altar",
    label: "Reliquary altar",
    factory: (materials) => createReliquaryAltar(materials),
  },
  {
    id: "tomb-room-signal",
    label: "Tomb room signal",
    factory: (materials) => signalModel("grave", materials),
  },
  {
    id: "treasure-room-signal",
    label: "Treasure room signal",
    factory: (materials) => signalModel("treasure", materials),
  },
  {
    id: "shrine-room-signal",
    label: "Shrine room signal",
    factory: (materials) => signalModel("shrine", materials),
  },
  {
    id: "elite-room-signal",
    label: "Elite room signal",
    factory: (materials) => signalModel("elite", materials),
  },
  {
    id: "boss-room-signal",
    label: "Boss room signal",
    factory: (materials) => signalModel("boss", materials),
  },
  {
    id: "treasure-chest",
    label: "Treasure chest",
    factory: (materials) => createForgeChest(materials).root,
  },
  {
    id: "table",
    label: "Table",
    factory: (materials) => createDungeonProp("table", materials),
  },
  {
    id: "bench",
    label: "Bench",
    factory: (materials) => createDungeonProp("bench", materials),
  },
  {
    id: "chair",
    label: "Chair",
    factory: (materials) => createDungeonProp("chair", materials),
  },
  {
    id: "bookshelf",
    label: "Bookshelf",
    factory: (materials) => createDungeonProp("bookshelf", materials),
  },
  {
    id: "crate",
    label: "Crate",
    factory: (materials) => createDungeonProp("crates", materials),
  },
  {
    id: "barrel",
    label: "Barrel",
    factory: (materials) => createDungeonProp("barrels", materials),
  },
  {
    id: "urn",
    label: "Urn",
    factory: (materials) => createDungeonProp("urns", materials),
  },
  {
    id: "weapon-rack",
    label: "Weapon rack",
    factory: (materials) => createDungeonProp("weapon-rack", materials),
  },
  {
    id: "lectern",
    label: "Lectern",
    factory: (materials) => createDungeonProp("lectern", materials),
  },
  {
    id: "high-chair",
    label: "High chair",
    factory: (materials) => createImageSculptedProp("high-chair", materials),
  },
  {
    id: "ritual-table",
    label: "Ritual table",
    factory: (materials) => createImageSculptedProp("ritual-table", materials),
  },
  {
    id: "ossuary-cabinet",
    label: "Ossuary cabinet",
    factory: (materials) => createImageSculptedProp("ossuary-cabinet", materials),
  },
  {
    id: "wall-torch",
    label: "Wall torch",
    factory: (materials) => createLightingPropBase("wall-torch", materials),
  },
  {
    id: "wall-lantern",
    label: "Wall lantern",
    factory: (materials) => createLightingPropBase("wall-lantern", materials),
  },
  {
    id: "oil-lantern",
    label: "Oil lantern",
    factory: (materials) => createLightingPropBase("oil-lantern", materials),
  },
  {
    id: "floor-campfire",
    label: "Floor campfire",
    factory: (materials) => createFloorCampfire(new THREE.Vector3(), false, materials).root,
  },
  {
    id: "brazier",
    label: "Brazier",
    factory: (materials) => createLightingPropBase("brazier", materials),
  },
  {
    id: "fluorescent-fixture",
    label: "Fluorescent fixture",
    factory: (materials) => createLightingPropBase("fluorescent-fixture", materials),
  },
  {
    id: "resolve-flask",
    label: "Resolve flask",
    factory: (materials) => createResolveFlask(materials),
  },
  {
    id: "time-freeze-relic",
    label: "Time freeze relic",
    factory: (materials) => createTimeFreezeRelic(materials),
  },
  {
    id: "luminous-ward",
    label: "Luminous ward",
    factory: (materials) => createLuminousWardStone(materials),
  },
  {
    id: "ember-stone",
    label: "Ember magic stone",
    factory: (materials) => createMagicStone("ember", materials).root,
  },
  {
    id: "ash-stone",
    label: "Ash magic stone",
    factory: (materials) => createMagicStone("ash", materials).root,
  },
  {
    id: "crypt-stone",
    label: "Crypt magic stone",
    factory: (materials) => createMagicStone("crypt", materials).root,
  },
  {
    id: "verdant-stone",
    label: "Verdant magic stone",
    factory: (materials) => createMagicStone("verdant", materials).root,
  },
  {
    id: "boss-crystal",
    label: "Boss crystal",
    factory: (materials) => forgeModel("bossCrystal", materials),
  },
  {
    id: "shrine-crystal",
    label: "Shrine crystal",
    factory: (materials) => forgeModel("shrineCrystal", materials),
  },
  {
    id: "iron-cage",
    label: "Iron cage",
    factory: (materials) => createImageSculptedHanging("iron-cage", materials),
  },
  {
    id: "tattered-banner",
    label: "Tattered banner",
    factory: (materials) => createImageSculptedHanging("tattered-banner", materials),
  },
  {
    id: "meat-hooks",
    label: "Meat hooks",
    factory: (materials) => createImageSculptedHanging("meat-hooks", materials),
  },
  {
    id: "bone-mobile",
    label: "Bone mobile",
    factory: (materials) => createImageSculptedHanging("bone-mobile", materials),
  },
  {
    id: "root-cluster",
    label: "Root cluster",
    factory: (materials) => createImageSculptedHanging("root-cluster", materials),
  },
  {
    id: "hanging-chain",
    label: "Hanging chain",
    factory: (materials) => createImageSculptedHanging("hanging-chain", materials),
  },
  {
    id: "hanging-vine",
    label: "Hanging vine",
    factory: (materials) => createImageSculptedHanging("hanging-vine", materials),
  },
  {
    id: "bone-pile",
    label: "Bone pile",
    factory: (materials) => createImageSculptedAmbient("bone-pile", materials),
  },
  {
    id: "rubble-pile",
    label: "Rubble pile",
    factory: (materials) => createImageSculptedAmbient("rubble-pile", materials),
  },
  {
    id: "rock-cluster",
    label: "Rock cluster",
    factory: (materials) => createImageSculptedAmbient("rock-cluster", materials),
  },
  {
    id: "icicle",
    label: "Icicle",
    factory: (materials) => createImageSculptedAmbient("icicle", materials),
  },
  {
    id: "ice-shard",
    label: "Ice shard",
    factory: (materials) => createImageSculptedAmbient("ice-shard", materials),
  },
  {
    id: "ground-root-tangle",
    label: "Ground root tangle",
    factory: (materials) => createImageSculptedAmbient("ground-root-tangle", materials),
  },
  {
    id: "ground-debris",
    label: "Ground debris",
    factory: (materials) => createImageSculptedAmbient("ground-debris", materials),
  },
  {
    id: "spike-plate",
    label: "Spike plate",
    factory: () => createImageSculptedSpikePlate(),
  },
  ...BIOME_DOOR_QA_ENTRIES,
  {
    id: "annihilation-pulse",
    label: "Annihilation pulse relic",
    factory: (materials) => createAnnihilationPulseRelic(materials),
  },
  {
    id: "cull-brand",
    label: "Cull brand relic",
    factory: (materials) => createCullBrandRelic(materials),
  },
  {
    id: "phoenix-egg",
    label: "Phoenix egg relic",
    factory: (materials) => createPhoenixEggRelic(materials),
  },
  {
    id: "swarm-curse",
    label: "Swarm curse vessel",
    factory: (materials) => createCurseVessel(materials, "swarm-curse"),
  },
  {
    id: "slow-curse",
    label: "Slow curse vessel",
    factory: (materials) => createCurseVessel(materials, "slow-curse"),
  },
  {
    id: "frenzy-curse",
    label: "Frenzy curse vessel",
    factory: (materials) => createCurseVessel(materials, "frenzy-curse"),
  },
  {
    id: "gloom-curse",
    label: "Gloom curse vessel",
    factory: (materials) => createCurseVessel(materials, "gloom-curse"),
  },
  {
    id: "mirror-curse",
    label: "Mirror curse vessel",
    factory: (materials) => createCurseVessel(materials, "mirror-curse"),
  },
  {
    id: "spin-curse",
    label: "Spin curse vessel",
    factory: (materials) => createCurseVessel(materials, "spin-curse"),
  },
] as const satisfies readonly ModelQaCatalogEntry[];

export type ModelQaModelId = (typeof MODEL_QA_CATALOG)[number]["id"];

export interface ModelQaBounds {
  center: readonly [number, number, number];
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  size: readonly [number, number, number];
  radius: number;
}

export interface ModelQaMetrics {
  triangles: number;
  geometries: number;
  materials: number;
  textures: number;
  calls: number | null;
}

export type ModelQaStatus = "loading" | "ready" | "error";

export interface ModelQaState {
  ready: boolean;
  status: ModelQaStatus;
  settled: boolean;
  destroyed: boolean;
  id: ModelQaModelId;
  view: ModelQaView;
  mood: DungeonMoodId | "neutral";
  bounds: ModelQaBounds | null;
  metrics: ModelQaMetrics;
  errors: string[];
  destroy: () => void;
}

export interface ModelQaQuery {
  id: ModelQaModelId;
  view: ModelQaView;
  mood: DungeonMoodId | "neutral";
  /** Launch renderer preference (`auto` | `webgl` | `webgpu`). */
  renderer: "auto" | "webgl" | "webgpu";
  errors: string[];
}

interface ModelLabElements {
  canvas: HTMLCanvasElement;
  id: HTMLElement;
  view: HTMLElement;
  status: HTMLElement;
  metrics: HTMLElement;
  error: HTMLElement;
  query: HTMLElement;
}

export type ModelQaLoadStatus = "ready" | "error" | "cancelled";

export interface ModelQaLoadResult {
  status: ModelQaLoadStatus;
  errors: string[];
}

export interface ModelQaLoadBarrier {
  result: Promise<ModelQaLoadResult>;
  seal: () => void;
  cancel: () => void;
}

const EMPTY_MODEL_QA_METRICS: ModelQaMetrics = {
  triangles: 0,
  geometries: 0,
  materials: 0,
  textures: 0,
  calls: null,
};

const FRONT_FACING = new THREE.Vector3(0, 0, 1);
const SURFACE_PLATE_MODEL_IDS = new Set<string>([
  "boss-room-signal",
  "elite-room-signal",
  "shrine-room-signal",
  "spike-plate",
  "tomb-room-signal",
  "treasure-room-signal",
]);
const GROUND_OBLIQUE_MODEL_IDS = new Set<string>([
  "bone-pile",
  "floor-campfire",
  "ground-debris",
  "ground-root-tangle",
  "rock-cluster",
  "rubble-pile",
]);
const CEILING_PLATE_MODEL_IDS = new Set<string>(["fluorescent-fixture"]);

function isDoorModelId(modelId: ModelQaModelId | undefined): boolean {
  return (
    modelId === "dungeon-door" || modelId === "office-door" || modelId?.startsWith("door-") === true
  );
}

export function getModelQaEntry(id: string): ModelQaCatalogEntry | undefined {
  return MODEL_QA_CATALOG.find((entry) => entry.id === id);
}

export function parseModelQaQuery(search: string): ModelQaQuery {
  const params = new URLSearchParams(search);
  const errors: string[] = [];
  const requestedId = params.get("model")?.trim();
  const requestedView = params.get("view")?.trim();
  const requestedMood = params.get("mood")?.trim();
  const id = isModelQaModelId(requestedId) ? requestedId : DEFAULT_MODEL_QA_ID;
  const view = isModelQaView(requestedView) ? requestedView : "front";
  const parsedMood = parseDungeonMoodId(requestedMood);
  const mood = requestedMood === "neutral" ? "neutral" : (parsedMood ?? "neutral");
  const renderer = parseLaunchConfiguration(search).render.renderer;

  if (requestedId && id !== requestedId)
    errors.push(`Unknown model “${requestedId}”; using ${DEFAULT_MODEL_QA_ID}.`);
  if (requestedView && view !== requestedView)
    errors.push(`Unknown view “${requestedView}”; using front.`);
  if (requestedMood && requestedMood !== "neutral" && !parsedMood)
    errors.push(`Unknown mood “${requestedMood}”; using neutral lighting.`);

  return { id, view, mood, renderer, errors };
}

export function createModelQaState(query: ModelQaQuery): ModelQaState {
  return {
    ready: false,
    status: "loading",
    settled: false,
    destroyed: false,
    id: query.id,
    view: query.view,
    mood: query.mood,
    bounds: null,
    metrics: { ...EMPTY_MODEL_QA_METRICS },
    errors: [...query.errors],
    destroy: () => {},
  };
}

export function settleModelQaState(
  state: ModelQaState,
  status: Exclude<ModelQaStatus, "loading">,
  errors: readonly string[] = [],
): void {
  if (state.settled) return;
  state.status = status;
  state.settled = true;
  state.ready = status === "ready";
  state.errors.push(...errors);
}

/** Track the exact LoadingManager items started while a model factory runs. */
export function createModelQaLoadBarrier(
  manager: THREE.LoadingManager,
  timeoutMs = 5000,
): ModelQaLoadBarrier {
  const originalItemStart = manager.itemStart;
  const originalItemEnd = manager.itemEnd;
  const originalItemError = manager.itemError;
  const pending = new Map<string, number>();
  const failed = new Set<string>();
  let pendingCount = 0;
  let sealed = false;
  let finished = false;
  let resolveResult!: (result: ModelQaLoadResult) => void;
  const result = new Promise<ModelQaLoadResult>((resolve) => {
    resolveResult = resolve;
  });

  const restore = (): void => {
    if (manager.itemStart === trackedItemStart) manager.itemStart = originalItemStart;
    if (manager.itemEnd === trackedItemEnd) manager.itemEnd = originalItemEnd;
    if (manager.itemError === trackedItemError) manager.itemError = originalItemError;
  };

  const finish = (status: ModelQaLoadStatus, errors: string[]): void => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    restore();
    resolveResult({ status, errors });
  };

  const settleIfDone = (): void => {
    if (!sealed || pendingCount > 0 || finished) return;
    const errors = [...failed].map((url) => `Texture load failed: ${url}`);
    finish(errors.length > 0 ? "error" : "ready", errors);
  };

  function trackedItemStart(url: string): void {
    pending.set(url, (pending.get(url) ?? 0) + 1);
    pendingCount += 1;
    originalItemStart.call(manager, url);
  }

  function trackedItemEnd(url: string): void {
    originalItemEnd.call(manager, url);
    const count = pending.get(url) ?? 0;
    if (count <= 0) return;
    if (count === 1) pending.delete(url);
    else pending.set(url, count - 1);
    pendingCount -= 1;
    settleIfDone();
  }

  function trackedItemError(url: string): void {
    if ((pending.get(url) ?? 0) > 0) failed.add(url);
    originalItemError.call(manager, url);
  }

  manager.itemStart = trackedItemStart;
  manager.itemEnd = trackedItemEnd;
  manager.itemError = trackedItemError;

  const timeout = setTimeout(
    () => {
      const errors = [...failed].map((url) => `Texture load failed: ${url}`);
      for (const url of pending.keys()) {
        if (!failed.has(url)) errors.push(`Texture load timed out: ${url}`);
      }
      if (errors.length === 0) errors.push("Texture loading timed out.");
      finish("error", errors);
    },
    Math.max(1, timeoutMs),
  );

  return {
    result,
    seal: () => {
      if (finished) return;
      sealed = true;
      settleIfDone();
    },
    cancel: () => finish("cancelled", []),
  };
}

export function createIdempotentCleanup(actions: readonly (() => void)[]): () => readonly string[] {
  let result: string[] | null = null;
  return () => {
    if (result) return result;
    result = [];
    for (const action of actions) {
      try {
        action();
      } catch (error: unknown) {
        result.push(errorMessage(error));
      }
    }
    return result;
  };
}

export function createModelQaModel(
  id: ModelQaModelId,
  materials: DungeonMaterials = createDungeonMaterials(),
  mood: DungeonMoodId | "neutral" = "neutral",
): THREE.Group {
  const entry = getModelQaEntry(id);
  if (!entry) throw new Error(`Model QA catalog entry “${id}” is unavailable.`);
  const root = entry.factory(materials, { mood });
  root.name = `Model QA · ${entry.label}`;
  return root;
}

/** Measure only the model hierarchy. Lab lights and UI do not affect these values. */
export function getModelQaBounds(root: THREE.Object3D): ModelQaBounds {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  const localBounds = new THREE.Box3();
  const visit = (object: THREE.Object3D): void => {
    if (!object.visible || object.userData.vfxOnly === true) return;
    if (object instanceof THREE.InstancedMesh) {
      if (!object.boundingBox) object.computeBoundingBox();
      if (object.boundingBox)
        bounds.union(localBounds.copy(object.boundingBox).applyMatrix4(object.matrixWorld));
    } else if (object instanceof THREE.Mesh) {
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      if (object.geometry.boundingBox)
        bounds.union(
          localBounds.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld),
        );
    }
    object.children.forEach(visit);
  };
  visit(root);
  if (bounds.isEmpty()) throw new Error(`Model “${root.name || "unnamed"}” has no visible bounds.`);

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  return {
    center: vectorTuple(center),
    min: vectorTuple(bounds.min),
    max: vectorTuple(bounds.max),
    size: vectorTuple(size),
    radius: Math.max(size.length() * 0.5, 0.001),
  };
}

export function collectModelQaMetrics(
  root: THREE.Object3D,
  calls: number | null = null,
): ModelQaMetrics {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let triangles = 0;

  const visit = (child: THREE.Object3D): void => {
    if (!child.visible || child.userData.vfxOnly === true) return;
    if (!(child instanceof THREE.Mesh)) {
      child.children.forEach(visit);
      return;
    }
    const geometry = child.geometry;
    geometries.add(geometry);
    triangles +=
      geometryTriangleCount(geometry) * (child instanceof THREE.InstancedMesh ? child.count : 1);

    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of childMaterials) {
      materials.add(material);
      collectMaterialTextures(material, textures);
    }
    child.children.forEach(visit);
  };
  visit(root);

  return {
    triangles,
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size,
    calls:
      typeof calls === "number" && Number.isFinite(calls) ? Math.max(0, Math.trunc(calls)) : null,
  };
}

export function disposeModelQaResources(
  root: THREE.Object3D | null,
  dungeonMaterials: DungeonMaterials | null,
): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const collectMaterial = (material: THREE.Material): void => {
    materials.add(material);
    collectMaterialTextures(material, textures);
  };

  root?.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    childMaterials.forEach(collectMaterial);
  });
  if (dungeonMaterials) Object.values(dungeonMaterials).forEach(collectMaterial);

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

/** Place a canonical view far enough away to fit the complete Box3. */
export function frameModelQaCamera(
  camera: THREE.PerspectiveCamera,
  bounds: ModelQaBounds,
  view: ModelQaView,
  aspect: number,
  modelId?: ModelQaModelId,
): void {
  const center = new THREE.Vector3(...bounds.center);
  const safeAspect = Math.max(aspect, 0.01);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * 0.5) * safeAspect);
  const fitFov = Math.min(verticalFov, horizontalFov);
  const distance = (bounds.radius / Math.sin(fitFov * 0.5)) * 1.16;
  const direction = viewDirection(view, modelId);

  camera.aspect = safeAspect;
  camera.near = Math.max(0.01, distance - bounds.radius * 1.9);
  camera.far = Math.max(camera.near + 1, distance + bounds.radius * 3.4);
  camera.up.set(0, 1, 0);
  if (Math.abs(direction.y) > 0.98) camera.up.set(0, 0, direction.y > 0 ? -1 : 1);
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

function collectMaterialTextures(material: THREE.Material, target: Set<THREE.Texture>): void {
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    if (value instanceof THREE.Texture) target.add(value);
  }
  if (!(material instanceof THREE.ShaderMaterial)) return;
  for (const uniform of Object.values(material.uniforms)) {
    if (uniform.value instanceof THREE.Texture) target.add(uniform.value);
  }
}

function geometryTriangleCount(geometry: THREE.BufferGeometry): number {
  const vertexCount = geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0;
  return Math.floor(vertexCount / 3);
}

function isModelQaView(value: string | undefined): value is ModelQaView {
  return MODEL_QA_VIEWS.some((view) => view === value);
}

function isModelQaModelId(value: string | undefined): value is ModelQaModelId {
  return value !== undefined && getModelQaEntry(value) !== undefined;
}

function viewDirection(view: ModelQaView, modelId?: ModelQaModelId): THREE.Vector3 {
  const surfacePlate = modelId !== undefined && SURFACE_PLATE_MODEL_IDS.has(modelId);
  const groundOblique = modelId !== undefined && GROUND_OBLIQUE_MODEL_IDS.has(modelId);
  const ceilingPlate = modelId !== undefined && CEILING_PLATE_MODEL_IDS.has(modelId);
  switch (view) {
    case "right":
      if (isDoorModelId(modelId)) {
        const yaw = THREE.MathUtils.degToRad(35);
        return new THREE.Vector3(Math.sin(yaw), 0.06, Math.cos(yaw)).normalize();
      }
      if (surfacePlate) return new THREE.Vector3(1, 0.08, 0).normalize();
      if (groundOblique) return new THREE.Vector3(1, 0.18, 0).normalize();
      if (ceilingPlate) return new THREE.Vector3(1, -0.12, 0).normalize();
      return new THREE.Vector3(1, 0, 0);
    case "back":
      return new THREE.Vector3(0, 0, -1);
    case "left":
      return new THREE.Vector3(-1, 0, 0);
    case "rear-left":
      if (surfacePlate) return new THREE.Vector3(-1, 0.62, -1).normalize();
      if (groundOblique) return new THREE.Vector3(-1, 0.5, -1).normalize();
      if (ceilingPlate) return new THREE.Vector3(-1, -0.55, -1).normalize();
      return new THREE.Vector3(-1, 0.08, -1).normalize();
    case "top":
      return new THREE.Vector3(0, 1, 0);
    case "front":
      // Keep the canonical top view orthographic-like while giving floor
      // plates a distinct front elevation. This exposes spike height, bevels,
      // and layered room-signal geometry instead of duplicating the top shot.
      if (surfacePlate) return new THREE.Vector3(0, 0.68, 1).normalize();
      if (groundOblique) return new THREE.Vector3(0, 0.62, 1).normalize();
      if (ceilingPlate) return new THREE.Vector3(0, -1, 0);
      return FRONT_FACING.clone();
  }
}

function vectorTuple(vector: THREE.Vector3): readonly [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function modelLabElements(): ModelLabElements {
  return {
    canvas: requiredElement<HTMLCanvasElement>("model-lab-canvas"),
    id: requiredElement("model-lab-id"),
    view: requiredElement("model-lab-view"),
    status: requiredElement("model-lab-status"),
    metrics: requiredElement("model-lab-metrics"),
    error: requiredElement("model-lab-error"),
    query: requiredElement("model-lab-query"),
  };
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Model QA element “#${id}” is missing.`);
  return element as T;
}

function updateModelLabOverlay(elements: ModelLabElements, state: ModelQaState): void {
  elements.id.textContent = state.id;
  elements.view.textContent = state.view;
  elements.status.textContent = state.status;
  elements.status.dataset.status = state.status;
  elements.query.textContent = `?model=${state.id}&view=${state.view}&mood=${state.mood}`;
  const { calls, geometries, materials, textures, triangles } = state.metrics;
  elements.metrics.textContent = `tri ${triangles} · geo ${geometries} · mat ${materials} · tex ${textures} · calls ${calls ?? "—"}`;
  elements.error.hidden = state.errors.length === 0;
  elements.error.textContent = state.errors.join(" ");
}

export function startModelLab(loadTimeoutMs = MODEL_QA_LOAD_TIMEOUT_MS): ModelQaState {
  window.__MODEL_QA__?.destroy?.();
  const query = parseModelQaQuery(window.location.search);
  const state = createModelQaState(query);
  let elements: ModelLabElements | null = null;
  let renderer: (THREE.WebGLRenderer & DungeonRenderer) | null = null;
  let playRendererHandle: PlayRendererHandle | null = null;
  let model: THREE.Group | null = null;
  let materials: DungeonMaterials | null = null;
  let lighting: LightingRig | null = null;
  let loadBarrier: ModelQaLoadBarrier | null = null;
  let resizeHandler: (() => void) | null = null;
  const pageHideHandler = (): void => state.destroy();
  const release = createIdempotentCleanup([
    () => {
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
    },
    () => window.removeEventListener("pagehide", pageHideHandler),
    () => loadBarrier?.cancel(),
    () => model?.removeFromParent(),
    () => lighting?.dispose(),
    () => disposeModelQaResources(model, materials),
    () => {
      playRendererHandle?.dispose();
      playRendererHandle = null;
      renderer = null;
    },
  ]);

  state.destroy = () => {
    if (state.destroyed) return;
    state.destroyed = true;
    if (!state.settled)
      settleModelQaState(state, "error", ["Model QA was destroyed before loading settled."]);
    state.errors.push(...release());
    if (elements) updateModelLabOverlay(elements, state);
  };
  window.__MODEL_QA__ = state;
  window.addEventListener("pagehide", pageHideHandler, { once: true });

  void (async () => {
  try {
    elements = modelLabElements();
    updateModelLabOverlay(elements, state);
    playRendererHandle = await createPlayRendererHandle({
      canvas: elements.canvas,
      preference: query.renderer,
      preferDefaultGpu: false,
    });
    setShaderProgramModeRegistry(
      createShaderProgramModeRegistry(playRendererHandle.isWebGpuRenderer ? "tsl" : "glsl"),
    );
    renderer = playRendererHandle.renderer as THREE.WebGLRenderer & DungeonRenderer;
    if ("setPixelRatio" in renderer) renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure =
      query.mood === "neutral"
        ? 1
        : resolveDungeonExposure(0.5, getDungeonMood(query.mood).exposureBias);
    (globalThis as { __rendererInfo?: unknown }).__rendererInfo = {
      app: "model-lab",
      requested: playRendererHandle.requested,
      backend: playRendererHandle.backend,
      backendName: readPlayRendererBackendName(playRendererHandle),
      isWebGpuRenderer: playRendererHandle.isWebGpuRenderer,
    };

    const scene = new THREE.Scene();
    if (query.mood === "neutral") {
      scene.background = new THREE.Color(0x202326);
      scene.add(
        new THREE.HemisphereLight(0xd9e0de, 0x25292b, 1.25),
        directionalLight(0xffe1bd, 2.35, [4.6, 6.2, 5.1]),
        directionalLight(0x9cb7c6, 1.25, [-4.4, 2.4, 3.2]),
        directionalLight(0xc9a77a, 1.45, [-3.5, 4.2, -4.8]),
      );
    } else {
      lighting = new LightingRig(scene);
      lighting.bindEnvironment(renderer);
      lighting.applyMood(getDungeonMood(query.mood));
    }
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    loadBarrier = createModelQaLoadBarrier(THREE.DefaultLoadingManager, loadTimeoutMs);
    materials = createDungeonMaterials();
    if (query.mood !== "neutral") {
      const mood = getDungeonMood(query.mood);
      applyMoodToDungeonMaterials(materials, mood.surfaceTint, 0.9 + mood.surfaceStrength * 0.25);
    }
    model = createModelQaModel(query.id, materials, query.mood);
    scene.add(model);
    state.bounds = getModelQaBounds(model);
    state.metrics = collectModelQaMetrics(model);

    const resizeRenderer = (): { width: number; height: number } => {
      const rect = elements!.canvas.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      renderer!.setSize(width, height, false);
      return { width, height };
    };
    const render = (): void => {
      const { width, height } = resizeRenderer();
      frameModelQaCamera(camera, state.bounds!, query.view, width / height, query.id);
      if (lighting) {
        const viewForward = camera.getWorldDirection(new THREE.Vector3());
        lighting.update(1, camera.position, null, viewForward);
      }
      renderer!.render(scene, camera);
      const drawCalls =
        (renderer as THREE.WebGLRenderer | null)?.info?.render?.calls ?? null;
      state.metrics = collectModelQaMetrics(model!, drawCalls);
    };

    resizeHandler = () => {
      if (state.ready) render();
      else resizeRenderer();
      updateModelLabOverlay(elements!, state);
    };
    window.addEventListener("resize", resizeHandler, { passive: true });
    resizeRenderer();
    updateModelLabOverlay(elements, state);
    loadBarrier.seal();
    void loadBarrier.result.then((loadResult) => {
      if (state.destroyed || loadResult.status === "cancelled") return;
      if (loadResult.status === "error") {
        settleModelQaState(state, "error", loadResult.errors);
        updateModelLabOverlay(elements!, state);
        return;
      }
      try {
        render();
        settleModelQaState(state, "ready");
        updateModelLabOverlay(elements!, state);
      } catch (error: unknown) {
        settleModelQaState(state, "error", [errorMessage(error)]);
        updateModelLabOverlay(elements!, state);
      }
    });
  } catch (error: unknown) {
    settleModelQaState(state, "error", [errorMessage(error)]);
    state.destroy();
  }
  })();

  return state;
}

function directionalLight(
  color: number,
  intensity: number,
  position: readonly [number, number, number],
): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(...position);
  return light;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

declare global {
  interface Window {
    __MODEL_QA__?: ModelQaState;
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const labCanvas = document.getElementById("model-lab-canvas");
  if (labCanvas) startModelLab();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => window.__MODEL_QA__?.destroy?.());
}
