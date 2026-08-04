import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import { generateDungeonFloorSet } from "../src/dungeon/generateDungeonFloors";
import { gridToWorld } from "../src/dungeon/gridCollision";
import { importDungeonForge } from "../src/dungeon/importDungeonForge";
import { generateForgeDungeon } from "../src/forge/generateForgeDungeon";
import { biomeCampaignParams } from "../src/systems/BiomeCampaign";
import { getDungeonMood } from "../src/systems/DungeonMood";
import type { AssetLibrary } from "../src/world/AssetLibrary";
import type { ForgeChestKit } from "../src/world/ForgePropFactory";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createRoomSurfaceMaterials } from "../src/world/RoomSurfaceMaterials";
import { StaticDungeonScene } from "../src/world/StaticDungeonScene";
import { StaticResourceCatalog } from "../src/world/StaticResourceCatalog";
import { DungeonWorld } from "../src/world/DungeonWorld";

function installCanvasDocument(): () => void {
  const previous = globalThis.document;
  const context = {
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    set fillStyle(_value: string) {},
  };
  const image = () => ({
    addEventListener() {},
    removeEventListener() {},
    set src(_value: string) {},
    get src() {
      return "";
    },
  });
  globalThis.document = {
    createElementNS: () => image(),
    createElement: (name: string) =>
      name === "canvas" ? { width: 0, height: 0, getContext: () => context } : image(),
  } as unknown as Document;
  return () => {
    globalThis.document = previous;
  };
}

function createAssets(): AssetLibrary {
  const albedo = new THREE.Texture();
  const data = new THREE.Texture();
  const layer = { albedo, normal: data, rough: data, depth: data };
  const pbr = { albedo, normal: data, rough: data, depth: data };
  return {
    getBiomeSurfaces: () => ({ floor: layer, wall: layer, ceiling: layer }),
    biomeDoor: () => albedo,
    biomeSpriteProp: () => albedo,
    biomeSpriteDecorAtlas: () => albedo,
    biomeWallDecorPbr: () => pbr,
    wallArtPbr: () => pbr,
  } as unknown as AssetLibrary;
}

function createScene(group: THREE.Group, catalog: StaticResourceCatalog): StaticDungeonScene {
  const texture = new THREE.Texture();
  const materials = createDungeonMaterials();
  const surfaceMaterials = createRoomSurfaceMaterials({
    floor: texture,
    wall: texture,
    ceiling: texture,
    semanticFloors: {
      grave: texture,
      shrine: texture,
      treasure: texture,
      boss: texture,
    },
    semanticWalls: {
      grave: texture,
      shrine: texture,
      treasure: texture,
      elite: texture,
      boss: texture,
    },
  });
  return new StaticDungeonScene({
    group,
    assets: createAssets(),
    materials,
    surfaceMaterials,
    tileSize: 2.4,
    wallHeight: 4.4,
    stoneTextures: new Map(),
    resourceCatalog: catalog,
  });
}

interface BatchSnapshot {
  name: string;
  geometry: THREE.BufferGeometry;
  materials: readonly THREE.Material[];
  count: number;
  matrices: readonly number[];
  bounds: readonly number[] | null;
  sphere: readonly number[] | null;
  groups: readonly { start: number; count: number; materialIndex: number }[];
  castShadow: boolean;
  receiveShadow: boolean;
}

function catalogBatchSnapshots(root: THREE.Object3D): BatchSnapshot[] {
  const snapshots: BatchSnapshot[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    if (
      !object.name.startsWith("Classic ") &&
      !object.name.startsWith("Forge static ") &&
      !object.name.startsWith("Creation passable arch ") &&
      !object.name.startsWith("Runtime chest ") &&
      !object.name.startsWith("Runtime door frame ")
    )
      return;
    const matrix = new THREE.Matrix4();
    const matrices: number[] = [];
    for (let index = 0; index < object.count; index += 1) {
      object.getMatrixAt(index, matrix);
      matrices.push(...matrix.toArray());
    }
    snapshots.push({
      name: object.name,
      geometry: object.geometry,
      materials: Array.isArray(object.material) ? object.material : [object.material],
      count: object.count,
      matrices,
      bounds: object.boundingBox
        ? [...object.boundingBox.min.toArray(), ...object.boundingBox.max.toArray()]
        : null,
      sphere: object.boundingSphere
        ? [...object.boundingSphere.center.toArray(), object.boundingSphere.radius]
        : null,
      groups: object.geometry.groups.map(
        ({
          start,
          count,
          materialIndex,
        }: {
          start: number;
          count: number;
          materialIndex: number;
        }) => ({
          start,
          count,
          materialIndex,
        }),
      ),
      castShadow: object.castShadow,
      receiveShadow: object.receiveShadow,
    });
  });
  return snapshots.sort((left, right) => left.name.localeCompare(right.name));
}

function expectBatchParity(
  before: readonly BatchSnapshot[],
  after: readonly BatchSnapshot[],
): void {
  expect(after.map((batch) => batch.name)).toEqual(before.map((batch) => batch.name));
  after.forEach((batch, index) => {
    const expected = before[index]!;
    expect(batch.geometry).toBe(expected.geometry);
    expect(batch.materials).toHaveLength(expected.materials.length);
    batch.materials.forEach((material, materialIndex) => {
      expect(material).toBe(expected.materials[materialIndex]);
    });
    expect(batch.count).toBe(expected.count);
    expect(batch.matrices).toEqual(expected.matrices);
    expect(batch.bounds).toEqual(expected.bounds);
    expect(batch.sphere).toEqual(expected.sphere);
    expect(batch.groups).toEqual(expected.groups);
    expect(batch.castShadow).toBe(expected.castShadow);
    expect(batch.receiveShadow).toBe(expected.receiveShadow);
  });
}

function reservationSnapshot(handles: ReturnType<StaticDungeonScene["build"]>) {
  return {
    object: [...handles.objectOccupiedCells].sort(),
    solid: [...handles.solidCells.entries()].sort(([left], [right]) => left.localeCompare(right)),
    wallSprite: [...handles.wallSpriteOccupiedCells].sort(),
    clearance: [...handles.objectiveClearanceCells].sort(),
    colliders: handles.solidColliders.map((collider) => ({ ...collider })),
  };
}

function backroomsOptions() {
  const params = biomeCampaignParams("backrooms");
  return {
    roomTarget: params.roomTarget,
    extraConnectionRate: params.loopRate / 100,
    width: params.mapWidth,
    height: params.mapHeight,
    minRoomSize: params.minRoomSize,
    maxRoomSize: params.maxRoomSize,
    corridorRadius: params.corridorRadius,
    roomPadding: params.roomPadding,
  };
}

function nearestRank(values: readonly number[], percentile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(percentile * sorted.length) - 1]!;
}

function stableFingerprint(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

const CHEST_SEMANTIC_BASELINE = Object.freeze({
  lid: Object.freeze({
    name: "Chest lid hinge",
    localMatrix: Object.freeze(new THREE.Matrix4().makeTranslation(0, 0.62, -0.42).toArray()),
    userData: Object.freeze({
      sculptPartId: "chest-lid",
      sculptPartDefinition: true,
      destructionGroup: "chest-lid",
      hinge: Object.freeze({
        axis: Object.freeze([1, 0, 0]),
        closedRadians: 0,
        openRadians: -Math.PI * 0.58,
      }),
    }),
  }),
  loot: Object.freeze({
    name: "Chest loot socket",
    localMatrix: Object.freeze(new THREE.Matrix4().makeTranslation(0, 0.5, 0).toArray()),
    userData: Object.freeze({ socket: Object.freeze({ type: "loot" }) }),
  }),
  interaction: Object.freeze({
    name: "Chest interaction socket",
    localMatrix: Object.freeze(new THREE.Matrix4().makeTranslation(0, 0.42, 0.78).toArray()),
    userData: Object.freeze({ socket: Object.freeze({ type: "interaction" }) }),
  }),
});

const CHEST_SEMANTIC_GROUPS = Object.freeze([
  Object.freeze({ name: "Chest framed plank body", id: "chest-body", parent: "root" }),
  Object.freeze({
    name: "Chest recessed plank seam system",
    id: "chest-panel-seams",
    parent: "Chest framed plank body",
  }),
  Object.freeze({ name: "Chest lid hinge", id: "chest-lid", parent: "root" }),
  Object.freeze({ name: "Chest arched lid", id: "chest-lid-shell", parent: "Chest lid hinge" }),
  Object.freeze({
    name: "Chest segmented arched lid straps",
    id: "chest-lid-straps",
    parent: "Chest lid hinge",
  }),
  Object.freeze({ name: "Chest lock assembly", id: "chest-lock", parent: "root" }),
  Object.freeze({ name: "Chest ring handles", id: "side-handles", parent: "root" }),
  Object.freeze({ name: "Chest rear hinge pair", id: "rear-hinges", parent: "root" }),
]);

function expectMatrixClose(actual: THREE.Matrix4, expected: THREE.Matrix4): void {
  actual.elements.forEach((value, index) => {
    expect(value).toBeCloseTo(expected.elements[index]!, 8);
  });
}

function expectChestSemanticContract(kit: Pick<ForgeChestKit, "root" | "lid">): void {
  kit.root.updateMatrixWorld(true);
  for (const semantic of CHEST_SEMANTIC_GROUPS) {
    const node = kit.root.getObjectByName(semantic.name);
    expect(node).toBeInstanceOf(THREE.Group);
    expect(node?.userData).toMatchObject({
      sculptPartId: semantic.id,
      sculptPartDefinition: true,
    });
    expect(semantic.parent === "root" ? node?.parent : node?.parent?.name).toBe(
      semantic.parent === "root" ? kit.root : semantic.parent,
    );
  }

  const contracts = [
    [kit.lid, CHEST_SEMANTIC_BASELINE.lid],
    [kit.root.getObjectByName(CHEST_SEMANTIC_BASELINE.loot.name), CHEST_SEMANTIC_BASELINE.loot],
    [
      kit.root.getObjectByName(CHEST_SEMANTIC_BASELINE.interaction.name),
      CHEST_SEMANTIC_BASELINE.interaction,
    ],
  ] as const;
  for (const [node, baseline] of contracts) {
    expect(node).toBeDefined();
    expect(node?.name).toBe(baseline.name);
    expect(node?.userData).toEqual(baseline.userData);
    node!.updateMatrix();
    expect(node!.matrix.toArray()).toEqual(baseline.localMatrix);
    node!.updateWorldMatrix(true, false);
    expectMatrixClose(
      node!.matrixWorld,
      kit.root.matrixWorld
        .clone()
        .multiply(new THREE.Matrix4().fromArray([...baseline.localMatrix])),
    );
  }
}

function geometryPayloadFingerprint(geometry: THREE.BufferGeometry): string {
  let hash = 2_166_136_261;
  let bytes = 0;
  const updateBytes = (value: Uint8Array): void => {
    bytes += value.byteLength;
    for (const byte of value) {
      hash ^= byte;
      hash = Math.imul(hash, 16_777_619);
    }
  };
  const updateText = (value: string): void => updateBytes(new TextEncoder().encode(value));
  const updateAttribute = (
    label: string,
    attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  ): void => {
    const array =
      attribute instanceof THREE.InterleavedBufferAttribute
        ? attribute.data.array
        : attribute.array;
    updateText(
      `${label}:${array.constructor.name}:${attribute.itemSize}:${Number(attribute.normalized)}:`,
    );
    updateBytes(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
  };

  if (geometry.index) updateAttribute("index", geometry.index);
  for (const name of Object.keys(geometry.attributes).sort()) {
    updateAttribute(name, geometry.getAttribute(name) as THREE.BufferAttribute);
  }
  const morphAttributes = geometry.morphAttributes as Record<
    string,
    Array<THREE.BufferAttribute | THREE.InterleavedBufferAttribute>
  >;
  for (const name of Object.keys(geometry.morphAttributes).sort()) {
    morphAttributes[name]!.forEach((attribute, index) => {
      updateAttribute(`morph:${name}:${index}`, attribute);
    });
  }
  updateText(
    JSON.stringify({
      groups: geometry.groups,
      drawRange: geometry.drawRange,
      morphTargetsRelative: geometry.morphTargetsRelative,
    }),
  );
  return `${bytes}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function isRdl05Renderable(object: THREE.Object3D): object is THREE.Mesh {
  if (!(object instanceof THREE.Mesh)) return false;
  return (
    object.name.startsWith("Classic ") ||
    object.name.startsWith("Forge static ") ||
    object.name.startsWith("Creation passable arch ") ||
    object.name.startsWith("Runtime chest ") ||
    object.name.startsWith("Runtime door frame ") ||
    object.name.startsWith("Room wall artwork ") ||
    object.name === "Static prop contact shadows" ||
    object.name.includes("closed iron-bound door leaf") ||
    object.name.includes("door iron straps") ||
    object.name.includes("office push bar")
  );
}

function exactGeometryCopies(root: THREE.Object3D): {
  identities: number;
  payloads: number;
  copies: number;
} {
  const geometries = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    if (isRdl05Renderable(object)) geometries.add(object.geometry);
  });
  const payloads = new Set([...geometries].map(geometryPayloadFingerprint));
  return {
    identities: geometries.size,
    payloads: payloads.size,
    copies: geometries.size - payloads.size,
  };
}

/**
 * Frozen pre-migration contract. Numeric transforms and bounds use five decimals.
 * Objects sort by name and world matrix. Instance matrices keep their authored order.
 */
const PREMIGRATION_PARITY_VERSION = "rdl05-premigration-v1-round5";

function rounded(value: number): number {
  const result = Math.round(value * 100_000) / 100_000;
  return Object.is(result, -0) ? 0 : result;
}

function roundedArray(values: ArrayLike<number>): number[] {
  return Array.from(values, rounded);
}

function boxSnapshot(box: THREE.Box3 | null): readonly number[] | null {
  return box ? roundedArray([...box.min.toArray(), ...box.max.toArray()]) : null;
}

function sphereSnapshot(sphere: THREE.Sphere | null): readonly number[] | null {
  return sphere ? roundedArray([...sphere.center.toArray(), sphere.radius]) : null;
}

function materialParitySnapshot(material: THREE.Material) {
  const standard = material as THREE.MeshStandardMaterial;
  return {
    type: material.type,
    name: material.name,
    color: standard.color?.getHexString() ?? null,
    emissive: standard.emissive?.getHexString() ?? null,
    roughness: standard.roughness === undefined ? null : rounded(standard.roughness),
    metalness: standard.metalness === undefined ? null : rounded(standard.metalness),
    opacity: rounded(material.opacity),
    transparent: material.transparent,
    alphaTest: rounded(material.alphaTest),
    side: material.side,
    depthTest: material.depthTest,
    depthWrite: material.depthWrite,
    maps: [
      standard.map?.name ?? null,
      standard.normalMap?.name ?? null,
      standard.roughnessMap?.name ?? null,
      standard.metalnessMap?.name ?? null,
      standard.aoMap?.name ?? null,
    ],
  };
}

function geometryParitySnapshot(geometry: THREE.BufferGeometry) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  return {
    type: geometry.type,
    payload: geometryPayloadFingerprint(geometry),
    index: geometry.index
      ? {
          array: geometry.index.array.constructor.name,
          count: geometry.index.count,
          itemSize: geometry.index.itemSize,
          normalized: geometry.index.normalized,
        }
      : null,
    attributes: Object.keys(geometry.attributes)
      .sort()
      .map((name) => {
        const attribute = geometry.getAttribute(name);
        const array =
          attribute instanceof THREE.InterleavedBufferAttribute
            ? attribute.data.array
            : attribute.array;
        return {
          name,
          array: array.constructor.name,
          count: attribute.count,
          itemSize: attribute.itemSize,
          normalized: attribute.normalized,
        };
      }),
    groups: geometry.groups.map(({ start, count, materialIndex }) => ({
      start,
      count,
      materialIndex,
    })),
    box: boxSnapshot(geometry.boundingBox),
    sphere: sphereSnapshot(geometry.boundingSphere),
  };
}

function renderableParitySnapshot(object: THREE.Mesh, familyVariant = object.name) {
  object.updateWorldMatrix(true, false);
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  const instanceLocal: number[][] = [];
  const instanceWorld: number[][] = [];
  if (object instanceof THREE.InstancedMesh) {
    const local = new THREE.Matrix4();
    for (let index = 0; index < object.count; index += 1) {
      object.getMatrixAt(index, local);
      instanceLocal.push(roundedArray(local.elements));
      instanceWorld.push(
        roundedArray(new THREE.Matrix4().multiplyMatrices(object.matrixWorld, local).elements),
      );
    }
    if (!object.boundingBox) object.computeBoundingBox();
    if (!object.boundingSphere) object.computeBoundingSphere();
  }
  return {
    name: object.name,
    familyVariant,
    kind: object instanceof THREE.InstancedMesh ? "instanced" : "mesh",
    count: object instanceof THREE.InstancedMesh ? object.count : 1,
    localMatrix: roundedArray(object.matrix.elements),
    worldMatrix: roundedArray(object.matrixWorld.elements),
    instanceLocal,
    instanceWorld,
    geometry: geometryParitySnapshot(object.geometry),
    materials: materials.map(materialParitySnapshot),
    castShadow: object.castShadow,
    receiveShadow: object.receiveShadow,
    box: object instanceof THREE.InstancedMesh ? boxSnapshot(object.boundingBox) : null,
    sphere: object instanceof THREE.InstancedMesh ? sphereSnapshot(object.boundingSphere) : null,
  };
}

function sortParityRenderables(renderables: ReturnType<typeof renderableParitySnapshot>[]) {
  return renderables.sort((left, right) => {
    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) return byName;
    return JSON.stringify(left.worldMatrix).localeCompare(JSON.stringify(right.worldMatrix));
  });
}

function familyVariantCounts(renderables: ReturnType<typeof renderableParitySnapshot>[]) {
  const counts = new Map<string, { objects: number; instances: number }>();
  for (const renderable of renderables) {
    const familyVariant = renderable.familyVariant.startsWith("Creation passable arch ")
      ? renderable.familyVariant
      : renderable.familyVariant.replace(/ global batch \d+$/, "").replace(/ batch \d+$/, "");
    const current = counts.get(familyVariant) ?? { objects: 0, instances: 0 };
    current.objects += 1;
    current.instances += renderable.count;
    counts.set(familyVariant, current);
  }
  return [...counts]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, counts]) => `${name}|${counts.objects}|${counts.instances}`);
}

function reservationParitySnapshot(handles: ReturnType<StaticDungeonScene["build"]>) {
  return {
    objectOccupied: [...handles.objectOccupiedCells].sort(),
    solid: [...handles.solidCells.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, cell]) => [key, cell.x, cell.y]),
    wallSprite: [...handles.wallSpriteOccupiedCells].sort(),
    objectiveClearance: [...handles.objectiveClearanceCells].sort(),
    colliders: handles.solidColliders.map((collider) =>
      Object.fromEntries(
        Object.entries(collider).map(([key, value]) => [
          key,
          typeof value === "number" ? rounded(value) : value,
        ]),
      ),
    ),
  };
}

function sceneParityBaseline(
  fixture: string,
  root: THREE.Object3D,
  handles: ReturnType<StaticDungeonScene["build"]>,
  staticScene: StaticDungeonScene,
) {
  root.updateMatrixWorld(true);
  const renderables: ReturnType<typeof renderableParitySnapshot>[] = [];
  const forgeBatches = (
    staticScene as unknown as {
      runtimeForgePropBatches: Map<
        string,
        { batches: readonly { geometry: THREE.BufferGeometry }[] }
      >;
    }
  ).runtimeForgePropBatches;
  root.traverse((object) => {
    if (!isRdl05Renderable(object)) return;
    let familyVariant = object.name;
    if (object.name.startsWith("Forge static ")) {
      for (const [groupKey, template] of forgeBatches) {
        if (template.batches.some((part) => part.geometry === object.geometry)) {
          familyVariant = `Forge static ${groupKey.replace(/^forge:/, "")}`;
          break;
        }
      }
    }
    renderables.push(renderableParitySnapshot(object, familyVariant));
  });
  sortParityRenderables(renderables);
  const reservations = reservationParitySnapshot(handles);
  return {
    version: PREMIGRATION_PARITY_VERSION,
    fixture,
    renderableObjects: renderables.length,
    renderableInstances: renderables.reduce((total, renderable) => total + renderable.count, 0),
    familyVariants: familyVariantCounts(renderables),
    doors: handles.doors.length,
    objectOccupied: handles.objectOccupiedCells.size,
    solid: handles.solidCells.size,
    wallSprite: handles.wallSpriteOccupiedCells.size,
    colliders: handles.solidColliders.length,
    reservationsFingerprint: stableFingerprint(JSON.stringify(reservations)),
    fingerprint: stableFingerprint(JSON.stringify({ renderables, reservations })),
  };
}

function doorParityBaseline(fixture: string, handles: ReturnType<StaticDungeonScene["build"]>) {
  const renderables: ReturnType<typeof renderableParitySnapshot>[] = [];
  const actors = handles.doors.map(({ root, left, right }) => {
    root.updateMatrixWorld(true);
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) renderables.push(renderableParitySnapshot(object));
    });
    return {
      root: roundedArray(root.matrixWorld.elements),
      left: roundedArray(left.matrix.elements),
      right: roundedArray(right.matrix.elements),
    };
  });
  sortParityRenderables(renderables);
  return {
    version: PREMIGRATION_PARITY_VERSION,
    fixture,
    actors: actors.length,
    renderableObjects: renderables.length,
    renderableInstances: renderables.reduce((total, renderable) => total + renderable.count, 0),
    familyVariants: familyVariantCounts(renderables),
    fingerprint: stableFingerprint(JSON.stringify({ actors, renderables })),
  };
}

const PREMIGRATION_CLASSIC_BASELINE = Object.freeze({
  version: "rdl05-premigration-v1-round5",
  fixture: "classic:RDL05-CLASSIC-PARITY:rooms10:ash:decor0.72",
  renderableObjects: 85,
  renderableInstances: 192,
  familyVariants: [
    "Classic barrels:0|3|3",
    "Classic barrels:1|3|3",
    "Classic barrels:2|3|6",
    "Classic bench:0|2|2",
    "Classic bench:1|2|2",
    "Classic bench:2|2|2",
    "Classic bookshelf:1|4|8",
    "Classic chair:0|2|2",
    "Classic coffin:0|3|3",
    "Classic crates:1|3|3",
    "Classic lectern:2|3|3",
    "Classic table:1|3|3",
    "Classic urns:0|2|4",
    "Classic urns:2|2|2",
    "Classic weapon-rack:0|3|3",
    "Left closed iron-bound door leaf|9|9",
    "Left door iron straps|9|9",
    "Right closed iron-bound door leaf|9|9",
    "Right door iron straps|9|9",
    "Room wall artwork 1|1|3",
    "Room wall artwork 3|1|2",
    "Runtime chest body|3|45",
    "Runtime chest lid|2|30",
    "Runtime door frame|1|9",
    "Static prop contact shadows|1|18",
  ],
  doors: 9,
  objectOccupied: 259,
  solid: 33,
  wallSprite: 67,
  colliders: 33,
  reservationsFingerprint: "fnv1a-d07e63c2",
  // Generated floor props now reserve room-edge seats, never corridor floor cells.
  fingerprint: "fnv1a-b39296a2",
});
const PREMIGRATION_FORGE_BASELINE = Object.freeze({
  version: "rdl05-premigration-v1-round5",
  fixture: "forge:50505:rooms9:loop0.28:backrooms:decor0.7",
  renderableObjects: 93,
  renderableInstances: 282,
  familyVariants: [
    "Creation passable arch batch 1|1|7",
    "Creation passable arch batch 2|1|2",
    "Forge static banner:0|2|8",
    "Forge static barrels:2|3|3",
    "Forge static bench:1|2|2",
    "Forge static bench:2|2|4",
    "Forge static bookshelf:0|4|4",
    "Forge static bossCrystal:0|7|7",
    "Forge static crates:1|3|12",
    "Forge static debris:0|1|5",
    "Forge static debris:1|1|2",
    "Forge static debris:2|1|8",
    "Forge static high-chair:1|3|6",
    "Forge static ossuary-cabinet:1|4|4",
    "Forge static ossuary-cabinet:2|4|8",
    "Forge static pillar:0|4|32",
    "Forge static pillar:1|4|8",
    "Forge static ring:0|1|1",
    "Forge static ritual-table:0|3|12",
    "Forge static ritual-table:1|3|3",
    "Forge static ritual-table:2|3|6",
    "Forge static shrineCrystal:0|6|12",
    "Forge static urns:1|2|4",
    "Forge static weapon-rack:0|3|3",
    "Forge static weapon-rack:1|3|3",
    "Forge static weapon-rack:2|3|9",
    "Left closed iron-bound door leaf|3|3",
    "Left office push bar|3|3",
    "Right closed iron-bound door leaf|3|3",
    "Right office push bar|3|3",
    "Runtime chest body|3|30",
    "Runtime chest lid|2|20",
    "Runtime door frame|1|3",
    "Static prop contact shadows|1|42",
  ],
  doors: 3,
  objectOccupied: 233,
  solid: 51,
  wallSprite: 56,
  colliders: 51,
  reservationsFingerprint: "fnv1a-7c904afc",
  // Dense wall/ceiling decor still preserves authored rigid prop parity.
  fingerprint: "fnv1a-0a29d9f5",
});
const PREMIGRATION_DOOR_BASELINE = Object.freeze({
  version: "rdl05-premigration-v1-round5",
  fixture: "forge:50505:rooms9:loop0.28:backrooms:decor0.7:doors",
  actors: 3,
  renderableObjects: 12,
  renderableInstances: 12,
  familyVariants: [
    "Left closed iron-bound door leaf|3|3",
    "Left office push bar|3|3",
    "Right closed iron-bound door leaf|3|3",
    "Right office push bar|3|3",
  ],
  fingerprint: "fnv1a-97b912c4",
});

function archInstanceMatrices(
  dungeon: ReturnType<typeof importDungeonForge>,
  arch: NonNullable<ReturnType<typeof importDungeonForge>["forge"]>["arches"][number],
): THREE.Matrix4 {
  const position = gridToWorld(dungeon, { x: arch.x, y: arch.y }, 2.4);
  position.x += (arch.roomDx ?? 0) * 2.4 * 0.5;
  position.z += (arch.roomDy ?? 0) * 2.4 * 0.5;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(position.x, 0, position.z),
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      arch.px === 1 ? 0 : Math.PI / 2,
    ),
    new THREE.Vector3(1, 1, 1),
  );
}

function matrixFingerprint(matrix: THREE.Matrix4): string {
  return matrix.elements.map((value) => value.toFixed(5)).join(",");
}

function runWithDoorCloneCounter(run: () => void): { elapsedMs: number; clones: number } {
  const originalClone = THREE.BufferGeometry.prototype.clone;
  let clones = 0;
  THREE.BufferGeometry.prototype.clone = function cloneWithCounter() {
    const stack = new Error().stack ?? "";
    if (stack.includes("cloneStaticPropTemplateBatches") && stack.includes("addDoorsAndRoomProps"))
      clones += 1;
    return originalClone.call(this);
  };
  const started = performance.now();
  try {
    run();
  } finally {
    THREE.BufferGeometry.prototype.clone = originalClone;
  }
  return { elapsedMs: performance.now() - started, clones };
}

function runWithForgeCloneCounter(run: () => void): number {
  const originalClone = THREE.BufferGeometry.prototype.clone;
  let clones = 0;
  THREE.BufferGeometry.prototype.clone = function cloneWithCounter() {
    const stack = new Error().stack ?? "";
    if (stack.includes("addInstancedForgeProps") && !stack.includes("prepareStaticPropGeometry")) {
      clones += 1;
    }
    return originalClone.call(this);
  };
  try {
    run();
  } finally {
    THREE.BufferGeometry.prototype.clone = originalClone;
  }
  return clones;
}

type DisposableThreeResource = THREE.BufferGeometry | THREE.Material | THREE.Texture;

function trackDisposals(resources: Iterable<DisposableThreeResource>) {
  const counts = new Map<DisposableThreeResource, number>();
  for (const resource of resources) {
    if (counts.has(resource)) continue;
    counts.set(resource, 0);
    resource.addEventListener("dispose", () => {
      counts.set(resource, (counts.get(resource) ?? 0) + 1);
    });
  }
  return counts;
}

function expectExactDisposals(
  counts: ReadonlyMap<DisposableThreeResource, number>,
  expected: number,
): void {
  expect(counts.size).toBeGreaterThan(0);
  expect([...counts.values()]).toEqual([...counts].map(() => expected));
}

describe("RDL-05 rigid prop catalog", () => {
  test("preserves the authored semantic chest contract for all fixed Forge chests", () => {
    const restoreDocument = installCanvasDocument();
    const catalog = new StaticResourceCatalog();
    const staticScene = createScene(new THREE.Group(), catalog);
    try {
      const dungeon = importDungeonForge(
        generateForgeDungeon({
          seed: 50_531,
          roomCount: 9,
          loopChance: 0.28,
          decorDensity: 0.7,
          themeKey: "backrooms",
        }),
      );
      const handles = staticScene.build(dungeon, getDungeonMood("backrooms"), 0.7);
      expect(handles.chests).toHaveLength(13);
      for (const chest of handles.chests) {
        expect(chest.root.getObjectByName(CHEST_SEMANTIC_BASELINE.lid.name)).toBe(chest.lid);
        expectChestSemanticContract(chest);
      }
    } finally {
      staticScene.dispose();
      catalog.dispose();
      restoreDocument();
    }
  });

  test("keeps cached door geometry alive through rebuilds and releases it once", () => {
    const restoreDocument = installCanvasDocument();
    const catalog = new StaticResourceCatalog();
    const staticScene = createScene(new THREE.Group(), catalog);
    const internals = staticScene as unknown as {
      createRuntimeDoor(width: number): THREE.Group;
      runtimeDoorTemplates: Map<string, THREE.Group>;
    };
    try {
      internals.createRuntimeDoor(2.4 * 1.12);
      expect(internals.runtimeDoorTemplates.size).toBe(1);
      const template = [...internals.runtimeDoorTemplates.values()][0]!;
      const expectedNames = [
        "Joined stone door frame",
        "Left closed iron-bound door leaf",
        "Right closed iron-bound door leaf",
        "Left door iron straps",
        "Right door iron straps",
      ];
      const geometries = expectedNames.map((name) => {
        const mesh = template.getObjectByName(name);
        expect(mesh).toBeInstanceOf(THREE.Mesh);
        return (mesh as THREE.Mesh).geometry;
      });
      expect(new Set(geometries).size).toBe(expectedNames.length);
      const disposals = new Map(geometries.map((geometry) => [geometry, 0]));
      for (const geometry of geometries) {
        geometry.addEventListener("dispose", () => {
          disposals.set(geometry, (disposals.get(geometry) ?? 0) + 1);
        });
      }

      const dungeon = generateDungeon("RDL05-DOOR-OWNERSHIP", { roomTarget: 10 });
      const first = staticScene.build(dungeon, getDungeonMood("ash"), 0.72);
      expect(first.doors.length).toBeGreaterThan(0);
      const expectedDoorCount = first.doors.length;
      expect([...disposals.values()]).toEqual(geometries.map(() => 0));
      for (const door of first.doors) {
        for (const name of expectedNames.slice(1)) {
          expect((door.root.getObjectByName(name) as THREE.Mesh).geometry).toBe(
            (template.getObjectByName(name) as THREE.Mesh).geometry,
          );
        }
      }

      const second = staticScene.build(dungeon, getDungeonMood("ash"), 0.72);
      expect(second.doors).toHaveLength(expectedDoorCount);
      expect([...disposals.values()]).toEqual(geometries.map(() => 0));
      expect(
        internals.runtimeDoorTemplates.get([...internals.runtimeDoorTemplates.keys()][0]!),
      ).toBe(template);

      const invalid = { ...dungeon, exit: { x: -1, y: -1 } };
      expect(() => staticScene.build(invalid, getDungeonMood("ash"), 0.72)).toThrow(
        "reachable exit portal seat",
      );
      expect([...disposals.values()]).toEqual(geometries.map(() => 0));
      staticScene.clear();
      expect([...disposals.values()]).toEqual(geometries.map(() => 0));
      staticScene.dispose();
      staticScene.dispose();
      expect([...disposals.values()]).toEqual(geometries.map(() => 1));
    } finally {
      staticScene.dispose();
      catalog.dispose();
      restoreDocument();
    }
  });

  test("keeps immutable rigid geometry scoped to each DungeonWorld", () => {
    const restoreDocument = installCanvasDocument();
    const leftScene = new THREE.Scene();
    const rightScene = new THREE.Scene();
    const leftWorld = new DungeonWorld(leftScene);
    const rightWorld = new DungeonWorld(rightScene);
    const dungeon = generateDungeon("RDL05-TWO-WORLDS", { roomTarget: 10 });
    try {
      leftWorld.setDungeon(dungeon, getDungeonMood("ash"));
      rightWorld.setDungeon(dungeon, getDungeonMood("ash"));

      const left = catalogBatchSnapshots(leftScene).filter((batch) =>
        batch.name.startsWith("Classic "),
      );
      const right = catalogBatchSnapshots(rightScene).filter((batch) =>
        batch.name.startsWith("Classic "),
      );
      expect(left.length).toBeGreaterThan(0);
      expect(right.map((batch) => batch.name)).toEqual(left.map((batch) => batch.name));
      left.forEach((batch, index) => {
        expect(right[index]!.geometry).not.toBe(batch.geometry);
      });

      const leftCatalog = leftWorld.getStaticResourceCatalogSnapshot();
      const rightCatalog = rightWorld.getStaticResourceCatalogSnapshot();
      expect(leftCatalog.keys).toEqual(rightCatalog.keys);
      expect(Object.isFrozen(leftCatalog.keys)).toBe(true);
      expect(leftCatalog.live).toBeGreaterThan(0);
      expect(rightCatalog.live).toBeGreaterThan(0);

      const leftDoorTemplates = (
        leftWorld as unknown as {
          staticScene: { runtimeDoorTemplates: Map<string, THREE.Group> };
        }
      ).staticScene.runtimeDoorTemplates;
      const rightDoorTemplates = (
        rightWorld as unknown as {
          staticScene: { runtimeDoorTemplates: Map<string, THREE.Group> };
        }
      ).staticScene.runtimeDoorTemplates;
      expect([...leftDoorTemplates.keys()]).toEqual([...rightDoorTemplates.keys()]);
      const doorGeometryNames = [
        "Joined stone door frame",
        "Left closed iron-bound door leaf",
        "Right closed iron-bound door leaf",
        "Left door iron straps",
        "Right door iron straps",
      ];
      for (const key of leftDoorTemplates.keys()) {
        const leftTemplate = leftDoorTemplates.get(key)!;
        const rightTemplate = rightDoorTemplates.get(key)!;
        for (const name of doorGeometryNames) {
          expect((leftTemplate.getObjectByName(name) as THREE.Mesh).geometry).not.toBe(
            (rightTemplate.getObjectByName(name) as THREE.Mesh).geometry,
          );
        }
      }

      const leftDisposals = new Map<THREE.BufferGeometry, number>();
      const rightDisposals = new Map<THREE.BufferGeometry, number>();
      for (const batch of left) {
        leftDisposals.set(batch.geometry, 0);
        batch.geometry.addEventListener("dispose", () => {
          leftDisposals.set(batch.geometry, (leftDisposals.get(batch.geometry) ?? 0) + 1);
        });
      }
      for (const batch of right) {
        rightDisposals.set(batch.geometry, 0);
        batch.geometry.addEventListener("dispose", () => {
          rightDisposals.set(batch.geometry, (rightDisposals.get(batch.geometry) ?? 0) + 1);
        });
      }

      leftWorld.dispose();
      expect([...leftDisposals.values()]).toEqual([...leftDisposals].map(() => 1));
      expect([...rightDisposals.values()]).toEqual([...rightDisposals].map(() => 0));
      rightWorld.dispose();
      expect([...rightDisposals.values()]).toEqual([...rightDisposals].map(() => 1));
    } finally {
      leftWorld.dispose();
      rightWorld.dispose();
      restoreDocument();
    }
  });

  test("disposes every DungeonWorld resource owner exactly once", () => {
    const restoreDocument = installCanvasDocument();
    const scene = new THREE.Scene();
    const world = new DungeonWorld(scene);
    const internals = world as unknown as {
      group: THREE.Group;
      assets: {
        ownedTextures: Set<THREE.Texture>;
        dispose(): void;
      };
      materials: Record<string, THREE.Material>;
      surfaceMaterials: Record<string, Record<string, THREE.Material>>;
      enemyShadowMaterial: THREE.Material;
      staticResourceCatalog: {
        geometries: Map<string, { geometry: THREE.BufferGeometry }>;
        dispose(): void;
      };
      staticScene: {
        runtimeDoorTemplates: Map<string, THREE.Group>;
        runtimeDoorTemplateGeometries: Set<THREE.BufferGeometry>;
        dispose(): void;
      };
    };
    try {
      world.setDungeon(
        generateDungeon("RDL05-WORLD-DISPOSE-ONCE", { roomTarget: 10 }),
        getDungeonMood("ash"),
      );

      const assetTextures = trackDisposals(internals.assets.ownedTextures);
      const catalogGeometries = trackDisposals(
        [...internals.staticResourceCatalog.geometries.values()].map(({ geometry }) => geometry),
      );
      const doorGeometries = trackDisposals(internals.staticScene.runtimeDoorTemplateGeometries);
      const ownedMaterials = new Set<THREE.Material>([
        ...Object.values(internals.materials),
        ...Object.values(internals.surfaceMaterials).flatMap((set) => Object.values(set)),
        internals.enemyShadowMaterial,
      ]);
      for (const template of internals.staticScene.runtimeDoorTemplates.values()) {
        template.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => ownedMaterials.add(material));
        });
      }
      const materialDisposals = trackDisposals(ownedMaterials);
      expect({
        assetTextures: assetTextures.size,
        catalogGeometries: catalogGeometries.size,
        doorGeometries: doorGeometries.size,
        materials: materialDisposals.size,
      }).toEqual({
        assetTextures: 37,
        catalogGeometries: 126,
        doorGeometries: 5,
        materials: 42,
      });

      let assetOwnerCalls = 0;
      const disposeAssets = internals.assets.dispose.bind(internals.assets);
      internals.assets.dispose = () => {
        assetOwnerCalls += 1;
        disposeAssets();
      };
      let catalogOwnerCalls = 0;
      const disposeCatalog = internals.staticResourceCatalog.dispose.bind(
        internals.staticResourceCatalog,
      );
      internals.staticResourceCatalog.dispose = () => {
        catalogOwnerCalls += 1;
        disposeCatalog();
      };
      let staticSceneOwnerCalls = 0;
      const disposeStaticScene = internals.staticScene.dispose.bind(internals.staticScene);
      internals.staticScene.dispose = () => {
        staticSceneOwnerCalls += 1;
        disposeStaticScene();
      };

      expectExactDisposals(assetTextures, 0);
      expectExactDisposals(catalogGeometries, 0);
      expectExactDisposals(doorGeometries, 0);
      expectExactDisposals(materialDisposals, 0);
      world.dispose();
      world.dispose();

      expect(assetOwnerCalls).toBe(1);
      expect(staticSceneOwnerCalls).toBe(1);
      expect(catalogOwnerCalls).toBe(1);
      expectExactDisposals(assetTextures, 1);
      expectExactDisposals(catalogGeometries, 1);
      expectExactDisposals(doorGeometries, 1);
      expectExactDisposals(materialDisposals, 1);
      expect(scene.children).not.toContain(internals.group);
    } finally {
      world.dispose();
      restoreDocument();
    }
  });

  test("sets the DungeonWorld dispose guard before cleanup can throw", () => {
    const restoreDocument = installCanvasDocument();
    const world = new DungeonWorld(new THREE.Scene());
    const internals = world as unknown as {
      disposed: boolean;
      clear(): void;
    };
    const clear = internals.clear.bind(world);
    let calls = 0;
    internals.clear = () => {
      calls += 1;
      throw new Error("RDL05 intentional dispose failure");
    };
    try {
      expect(() => world.dispose()).toThrow("RDL05 intentional dispose failure");
      expect(() => world.dispose()).not.toThrow();
      expect(calls).toBe(1);
      expect(internals.disposed).toBe(true);
    } finally {
      internals.clear = clear;
      internals.disposed = false;
      world.dispose();
      restoreDocument();
    }
  });

  test("keeps passable Forge arch geometry isolated between world catalogs", () => {
    const restoreDocument = installCanvasDocument();
    const leftCatalog = new StaticResourceCatalog();
    const rightCatalog = new StaticResourceCatalog();
    const leftGroup = new THREE.Group();
    const rightGroup = new THREE.Group();
    const leftScene = createScene(leftGroup, leftCatalog);
    const rightScene = createScene(rightGroup, rightCatalog);
    const dungeon = importDungeonForge(
      generateForgeDungeon({
        seed: 50_505,
        roomCount: 9,
        loopChance: 0.28,
        decorDensity: 0.7,
        themeKey: "backrooms",
      }),
    );
    try {
      leftScene.build(dungeon, getDungeonMood("backrooms"), 0.7);
      rightScene.build(dungeon, getDungeonMood("backrooms"), 0.7);
      const left = catalogBatchSnapshots(leftGroup).filter((batch) =>
        batch.name.startsWith("Creation passable arch "),
      );
      const right = catalogBatchSnapshots(rightGroup).filter((batch) =>
        batch.name.startsWith("Creation passable arch "),
      );
      expect(left).toHaveLength(2);
      expect(right.map((batch) => batch.name)).toEqual(left.map((batch) => batch.name));
      left.forEach((batch, index) => {
        expect(right[index]!.geometry).not.toBe(batch.geometry);
      });
      const leftKeys = leftCatalog
        .snapshot()
        .keys.filter((key) => key.includes("family:creation-passable-arch"));
      const rightKeys = rightCatalog
        .snapshot()
        .keys.filter((key) => key.includes("family:creation-passable-arch"));
      expect(leftKeys).toEqual(rightKeys);

      const leftDisposals = new Map(left.map((batch) => [batch.geometry, 0]));
      const rightDisposals = new Map(right.map((batch) => [batch.geometry, 0]));
      for (const [geometry] of leftDisposals) {
        geometry.addEventListener("dispose", () => {
          leftDisposals.set(geometry, (leftDisposals.get(geometry) ?? 0) + 1);
        });
      }
      for (const [geometry] of rightDisposals) {
        geometry.addEventListener("dispose", () => {
          rightDisposals.set(geometry, (rightDisposals.get(geometry) ?? 0) + 1);
        });
      }

      leftScene.clear();
      leftScene.dispose();
      expect([...leftDisposals.values()]).toEqual(left.map(() => 0));
      expect([...rightDisposals.values()]).toEqual(right.map(() => 0));
      leftCatalog.dispose();
      expect([...leftDisposals.values()]).toEqual(left.map(() => 1));
      expect([...rightDisposals.values()]).toEqual(right.map(() => 0));
      rightScene.dispose();
      rightCatalog.dispose();
      expect([...rightDisposals.values()]).toEqual(right.map(() => 1));
    } finally {
      leftScene.dispose();
      rightScene.dispose();
      leftCatalog.dispose();
      rightCatalog.dispose();
      restoreDocument();
    }
  });

  test("preserves classic, Forge, rigid-frame and chest batch contracts across rebuilds", () => {
    const restoreDocument = installCanvasDocument();
    const catalog = new StaticResourceCatalog();
    const group = new THREE.Group();
    const staticScene = createScene(group, catalog);
    try {
      const classicDungeon = generateDungeon("RDL05-CLASSIC-PARITY", { roomTarget: 10 });
      const classicFirst = staticScene.build(classicDungeon, getDungeonMood("ash"), 0.72);
      const classicBatches = catalogBatchSnapshots(group);
      const classicReservations = reservationSnapshot(classicFirst);
      const classicCatalog = catalog.snapshot();
      const classicBaseline = sceneParityBaseline(
        "classic:RDL05-CLASSIC-PARITY:rooms10:ash:decor0.72",
        group,
        classicFirst,
        staticScene,
      );
      expect(classicBaseline).toEqual(PREMIGRATION_CLASSIC_BASELINE);
      expect(classicBatches.some((batch) => batch.name.startsWith("Classic "))).toBe(true);

      const classicSecond = staticScene.build(classicDungeon, getDungeonMood("ash"), 0.72);
      expectBatchParity(classicBatches, catalogBatchSnapshots(group));
      expect(reservationSnapshot(classicSecond)).toEqual(classicReservations);
      expect(catalog.snapshot().live).toBe(classicCatalog.live);
      expect(catalog.snapshot().hits).toBeGreaterThan(classicCatalog.hits);

      const forgeDungeon = importDungeonForge(
        generateForgeDungeon({
          seed: 50_505,
          roomCount: 9,
          loopChance: 0.28,
          decorDensity: 0.7,
          themeKey: "backrooms",
        }),
      );
      const forgeFirst = staticScene.build(forgeDungeon, getDungeonMood("backrooms"), 0.7);
      const forgeBatches = catalogBatchSnapshots(group);
      const forgeReservations = reservationSnapshot(forgeFirst);
      const forgeCatalog = catalog.snapshot();
      const forgeBaseline = sceneParityBaseline(
        "forge:50505:rooms9:loop0.28:backrooms:decor0.7",
        group,
        forgeFirst,
        staticScene,
      );
      const doorBaseline = doorParityBaseline(
        "forge:50505:rooms9:loop0.28:backrooms:decor0.7:doors",
        forgeFirst,
      );
      expect(forgeBaseline).toEqual(PREMIGRATION_FORGE_BASELINE);
      expect(doorBaseline).toEqual(PREMIGRATION_DOOR_BASELINE);
      const archBatches: THREE.InstancedMesh[] = [];
      group.traverse((object) => {
        if (
          object instanceof THREE.InstancedMesh &&
          object.name.startsWith("Creation passable arch ")
        ) {
          archBatches.push(object);
        }
      });
      archBatches.sort((left, right) => left.name.localeCompare(right.name));
      expect(archBatches.map((batch) => batch.name)).toEqual([
        "Creation passable arch batch 1",
        "Creation passable arch batch 2",
      ]);
      expect(archBatches.reduce((total, batch) => total + batch.count, 0)).toBe(9);
      expect(forgeFirst.doors).toHaveLength(3);
      for (const batch of archBatches) {
        expect(batch.castShadow).toBe(true);
        expect(batch.receiveShadow).toBe(false);
        expect(batch.geometry.groups).toEqual([]);
        expect(new THREE.Box3().setFromObject(batch).isEmpty()).toBe(false);
        const length = Number(batch.name.split(" ").at(-1));
        const allowedMatrices = new Set(
          forgeDungeon
            .forge!.arches.filter((arch) => arch.len === length)
            .map((arch) => matrixFingerprint(archInstanceMatrices(forgeDungeon, arch))),
        );
        const matrix = new THREE.Matrix4();
        for (let index = 0; index < batch.count; index += 1) {
          batch.getMatrixAt(index, matrix);
          expect(allowedMatrices.has(matrixFingerprint(matrix))).toBe(true);
        }
      }
      expect(forgeBatches.some((batch) => batch.name.startsWith("Runtime door frame "))).toBe(true);
      expect(forgeBatches.some((batch) => batch.name.startsWith("Runtime chest "))).toBe(true);
      expect(forgeCatalog.keys.some((key) => key.includes("family:forge"))).toBe(true);
      expect(forgeCatalog.keys.some((key) => key.includes("family:door-frame"))).toBe(true);
      expect(forgeCatalog.keys.some((key) => key.includes("family:forge-chest"))).toBe(true);
      const archKeys = forgeCatalog.keys.filter((key) =>
        key.includes("family:creation-passable-arch"),
      );
      expect(archKeys).toHaveLength(2);
      expect(
        archKeys.every(
          (key) =>
            key.includes("topology:") &&
            key.includes("width:") &&
            key.includes("height:") &&
            key.includes("style:") &&
            key.includes("curved:") &&
            key.includes("layout:"),
        ),
      ).toBe(true);

      const forgeSecond = staticScene.build(forgeDungeon, getDungeonMood("backrooms"), 0.7);
      expectBatchParity(forgeBatches, catalogBatchSnapshots(group));
      expect(reservationSnapshot(forgeSecond)).toEqual(forgeReservations);
      expect(catalog.snapshot().live).toBe(forgeCatalog.live);
      const forgeHotClones = runWithForgeCloneCounter(() =>
        staticScene.build(forgeDungeon, getDungeonMood("backrooms"), 0.7),
      );
      expect(forgeHotClones).toBe(0);
      expectBatchParity(forgeBatches, catalogBatchSnapshots(group));

      const disposalCounts = new Map<THREE.BufferGeometry, number>();
      for (const batch of catalogBatchSnapshots(group)) {
        disposalCounts.set(batch.geometry, 0);
        batch.geometry.addEventListener("dispose", () => {
          disposalCounts.set(batch.geometry, (disposalCounts.get(batch.geometry) ?? 0) + 1);
        });
      }
      staticScene.clear();
      expect([...disposalCounts.values()]).toEqual([...disposalCounts].map(() => 0));
      staticScene.dispose();
      expect([...disposalCounts.values()]).toEqual([...disposalCounts].map(() => 0));
      catalog.dispose();
      expect([...disposalCounts.values()]).toEqual([...disposalCounts].map(() => 1));
    } finally {
      staticScene.dispose();
      catalog.dispose();
      restoreDocument();
    }
  });

  test("profiles the fixed four-floor Backrooms fixture with clone count as the gate", () => {
    const restoreDocument = installCanvasDocument();
    const catalog = new StaticResourceCatalog();
    const group = new THREE.Group();
    const staticScene = createScene(group, catalog);
    const stack = generateDungeonFloorSet("RDL05-MAP-BACKROOMS-4", backroomsOptions(), 4);
    const originalAddDoorsAndRoomProps = (
      staticScene as unknown as {
        addDoorsAndRoomProps(dungeon: (typeof stack.floors)[number]): void;
      }
    ).addDoorsAndRoomProps;
    let doorProfile: number[] = [];
    (
      staticScene as unknown as {
        addDoorsAndRoomProps(dungeon: (typeof stack.floors)[number]): void;
      }
    ).addDoorsAndRoomProps = (dungeon) => {
      const started = performance.now();
      try {
        return originalAddDoorsAndRoomProps.call(staticScene, dungeon);
      } finally {
        doorProfile.push(performance.now() - started);
      }
    };
    try {
      expect(stack.floors).toHaveLength(4);
      expect(stack.floors.every((floor) => floor.width === 121 && floor.height === 121)).toBe(true);
      expect(backroomsOptions().roomTarget).toBe(42);

      doorProfile = [];
      const cold = runWithDoorCloneCounter(() =>
        staticScene.buildStack(stack.floors, getDungeonMood("backrooms"), 0.88),
      );
      const coldDoorsMs = doorProfile.reduce((total, duration) => total + duration, 0);
      const coldExactCopies = exactGeometryCopies(group);
      const warmSnapshot = catalog.snapshot();
      const hot = Array.from({ length: 5 }, () => {
        doorProfile = [];
        const sample = runWithDoorCloneCounter(() =>
          staticScene.buildStack(stack.floors, getDungeonMood("backrooms"), 0.88),
        );
        return {
          ...sample,
          doorsMs: doorProfile.reduce((total, duration) => total + duration, 0),
          live: catalog.snapshot().live,
          signature: stableFingerprint(catalog.snapshot().keys.join("|")),
        };
      });
      const catalogSnapshot = catalog.snapshot();
      const report = {
        fixture: {
          seed: "RDL05-MAP-BACKROOMS-4",
          floors: stack.floors.length,
          roomsPerFloorTarget: backroomsOptions().roomTarget,
          dimensions: [stack.floors[0]!.width, stack.floors[0]!.height],
          decorDensity: 0.88,
          topologySignature: stableFingerprint(stack.signature),
        },
        cold: {
          elapsedMs: cold.elapsedMs,
          addDoorsAndRoomPropsMs: coldDoorsMs,
          clones: cold.clones,
          exactCopies: coldExactCopies,
        },
        hot: {
          samples: hot.length,
          medianMs: nearestRank(
            hot.map((sample) => sample.elapsedMs),
            0.5,
          ),
          p95Ms: nearestRank(
            hot.map((sample) => sample.elapsedMs),
            0.95,
          ),
          addDoorsAndRoomPropsMedianMs: nearestRank(
            hot.map((sample) => sample.doorsMs),
            0.5,
          ),
          addDoorsAndRoomPropsP95Ms: nearestRank(
            hot.map((sample) => sample.doorsMs),
            0.95,
          ),
          cloneStaticPropTemplateBatchesMax: Math.max(...hot.map((sample) => sample.clones)),
        },
        catalog: {
          keys: catalogSnapshot.keys.length,
          keySignature: stableFingerprint(catalogSnapshot.keys.join("|")),
          live: catalogSnapshot.live,
          hits: catalogSnapshot.hits,
          misses: catalogSnapshot.misses,
        },
      };

      expect(cold.clones).toBeLessThanOrEqual(79);
      expect(coldExactCopies.copies).toBeLessThanOrEqual(61);
      expect(report.hot.cloneStaticPropTemplateBatchesMax).toBeLessThanOrEqual(79);
      expect(hot.every((sample) => sample.live === warmSnapshot.live)).toBe(true);
      expect(hot.every((sample) => sample.signature === hot[0]!.signature)).toBe(true);

      staticScene.build(stack.floors[0]!, getDungeonMood("backrooms"), 0.88);
      expect(catalog.snapshot().live).toBe(warmSnapshot.live);
      staticScene.buildStack(stack.floors, getDungeonMood("backrooms"), 0.88);
      expect(catalog.snapshot().live).toBe(warmSnapshot.live);
      console.info(`[RDL-05 benchmark] ${JSON.stringify(report)}`);
    } finally {
      staticScene.dispose();
      catalog.dispose();
      restoreDocument();
    }
  }, 15_000);
});
