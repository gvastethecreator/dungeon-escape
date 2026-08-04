import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { ForgeChestKit } from "./ForgePropFactory";

export interface RuntimeChestBatchStats {
  sourceMeshes: number;
  bodyBatches: number;
  lidBatches: number;
}

export interface RuntimeChestInstanceHandle {
  /** The resident-owned root that contains this chest's instance batches. */
  readonly root: THREE.Group;
  updateLidMatrix(): void;
}

export interface RuntimeChestBatchResult {
  root: THREE.Group;
  handles: RuntimeChestInstanceHandle[];
  stats: RuntimeChestBatchStats & { instances: number };
}

/** Immutable door-frame batches do not need frame updates after construction. */
export interface RuntimeDoorFrameInstanceHandle {
  /** The resident-owned root that contains this door's frame instances. */
  readonly root: THREE.Group;
}

export type RuntimeWallFireKind = "torch" | "lantern";

export interface RuntimeWallFireFixture {
  kind: RuntimeWallFireKind;
  root: THREE.Group;
}

export interface RuntimeWallFireFixtureHandle {
  setVisible(visible: boolean): void;
}

export interface RuntimeWallFireBatchResult {
  root: THREE.Group;
  handles: RuntimeWallFireFixtureHandle[];
  stats: {
    instances: number;
    sourceMeshes: number;
    batches: number;
    kinds: Record<RuntimeWallFireKind, { instances: number; batches: number }>;
  };
}

interface MeshBatch {
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  meshes: THREE.Mesh[];
}

/**
 * Explicit ownership boundary for final, immutable runtime-batch geometry.
 * The batcher never owns catalog geometry; callers retain ownership of
 * materials and decide which source geometry is externally borrowed.
 */
export interface RuntimeModelBatchingGeometryStrategy {
  borrowGeometry?(
    stableKey: string,
    factory: () => THREE.BufferGeometry,
    resourceType: string,
  ): THREE.BufferGeometry;
  isBorrowedGeometry?(geometry: THREE.BufferGeometry): boolean;
  /** Stable material role, supplied by the material-library owner when needed. */
  materialKey?(material: THREE.Material): string;
}

export interface RuntimeModelBatchingOptions {
  geometryStrategy?: RuntimeModelBatchingGeometryStrategy;
  /** Stable family/topology key; batch and material layout are appended here. */
  geometryKeyPrefix?: string;
}

function isBelow(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current === ancestor) return true;
    current = current.parent;
  }
  return false;
}

function geometriesRelativeTo(mesh: THREE.Mesh, anchor: THREE.Object3D): THREE.BufferGeometry[] {
  const anchorInverse = anchor.matrixWorld.clone().invert();
  const instance = new THREE.Matrix4();
  const count = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
  return Array.from({ length: count }, (_, index) => {
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const relative = anchorInverse.clone().multiply(mesh.matrixWorld);
    if (mesh instanceof THREE.InstancedMesh) {
      mesh.getMatrixAt(index, instance);
      relative.multiply(instance);
    }
    geometry.applyMatrix4(relative);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    if (!geometry.getAttribute("uv")) {
      geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
          new Float32Array(geometry.getAttribute("position").count * 2),
          2,
        ),
      );
    }
    for (const attribute of Object.keys(geometry.attributes)) {
      if (attribute !== "position" && attribute !== "normal" && attribute !== "uv")
        geometry.deleteAttribute(attribute);
    }
    geometry.clearGroups();
    return geometry;
  });
}

function stableMaterialLayout(
  material: THREE.Material,
  strategy: RuntimeModelBatchingGeometryStrategy | undefined,
): string {
  const role =
    strategy?.materialKey?.(material) ?? `${material.type}:${material.name || "unnamed"}`;
  return `single:${encodeURIComponent(role)}`;
}

function borrowMergedGeometry(
  anchor: THREE.Object3D,
  meshes: readonly THREE.Mesh[],
  label: string,
  stableKey: string,
  resourceType: string,
  strategy: RuntimeModelBatchingGeometryStrategy,
): THREE.BufferGeometry {
  const borrow = strategy.borrowGeometry;
  if (!borrow) throw new Error(`${label} requested catalog geometry without a borrow strategy.`);
  return borrow(
    stableKey,
    () => {
      const parts = meshes.flatMap((mesh) => geometriesRelativeTo(mesh, anchor));
      const merged = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
      if (!merged) {
        for (const part of parts) part.dispose();
        throw new Error(`${label} could not create a canonical merged geometry.`);
      }
      if (parts.length > 1) parts.forEach((part) => part.dispose());
      return merged;
    },
    resourceType,
  );
}

function mergeAtAnchor(
  anchor: THREE.Object3D,
  meshes: readonly THREE.Mesh[],
  label: string,
  options?: RuntimeModelBatchingOptions,
): THREE.Mesh[] {
  const groups = new Map<string, MeshBatch>();
  for (const source of meshes) {
    if (Array.isArray(source.material))
      throw new Error(`${label} cannot batch a multi-material chest mesh (${source.name}).`);
    const key = `${source.material.uuid}:${Number(source.castShadow)}:${Number(source.receiveShadow)}`;
    const batch = groups.get(key) ?? {
      material: source.material,
      castShadow: source.castShadow,
      receiveShadow: source.receiveShadow,
      meshes: [],
    };
    batch.meshes.push(source);
    groups.set(key, batch);
  }

  const result: THREE.Mesh[] = [];
  let batchIndex = 0;
  for (const batch of groups.values()) {
    const strategy = options?.geometryStrategy;
    const prefix = options?.geometryKeyPrefix?.trim();
    if (strategy?.borrowGeometry && prefix) {
      const layout = stableMaterialLayout(batch.material, strategy);
      const geometry = borrowMergedGeometry(
        anchor,
        batch.meshes,
        label,
        `${prefix}:part:${batchIndex}:layout:${layout}`,
        `runtime-model-batch-geometry/v2:${layout}`,
        strategy,
      );
      const mesh = new THREE.Mesh(geometry, batch.material);
      mesh.name = `${label} material batch ${batchIndex + 1}`;
      mesh.castShadow = batch.castShadow;
      mesh.receiveShadow = batch.receiveShadow;
      result.push(mesh);
      batchIndex += 1;
      continue;
    }

    const parts = batch.meshes.flatMap((mesh) => geometriesRelativeTo(mesh, anchor));
    const merged = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
    if (!merged) {
      parts.forEach((geometry, partIndex) => {
        const fallback = new THREE.Mesh(geometry, batch.material);
        fallback.name = `${label} fallback ${batchIndex + 1}.${partIndex + 1}`;
        fallback.castShadow = batch.castShadow;
        fallback.receiveShadow = batch.receiveShadow;
        result.push(fallback);
      });
    } else {
      if (parts.length > 1) parts.forEach((part) => part.dispose());
      const mesh = new THREE.Mesh(merged, batch.material);
      mesh.name = `${label} material batch ${batchIndex + 1}`;
      mesh.castShadow = batch.castShadow;
      mesh.receiveShadow = batch.receiveShadow;
      result.push(mesh);
    }
    batchIndex += 1;
  }
  return result;
}

function disposeSourceMeshes(
  meshes: readonly THREE.Mesh[],
  strategy: RuntimeModelBatchingGeometryStrategy | undefined,
): void {
  const released = new Set<THREE.BufferGeometry>();
  for (const mesh of meshes) {
    mesh.parent?.remove(mesh);
    if (released.has(mesh.geometry)) continue;
    released.add(mesh.geometry);
    if (!strategy?.isBorrowedGeometry?.(mesh.geometry)) mesh.geometry.dispose();
  }
}

/**
 * Collapse the detailed interactive chest into one mesh per material and moving
 * section. The authored source tree stays available to the model lab, while the
 * play route keeps the real lid pivot with a bounded draw-call cost.
 */
export function batchForgeChestForRuntime(
  kit: ForgeChestKit,
  options?: RuntimeModelBatchingOptions,
): RuntimeChestBatchStats {
  kit.root.updateMatrixWorld(true);
  const sourceMeshes: THREE.Mesh[] = [];
  kit.root.traverse((object) => {
    if (object instanceof THREE.Mesh) sourceMeshes.push(object);
  });
  const lidMeshes = sourceMeshes.filter((mesh) => isBelow(mesh, kit.lid));
  const bodyMeshes = sourceMeshes.filter((mesh) => !isBelow(mesh, kit.lid));
  const prefix = options?.geometryKeyPrefix?.trim();
  const bodyBatches = mergeAtAnchor(kit.root, bodyMeshes, "Runtime chest body", {
    ...options,
    geometryKeyPrefix: prefix ? `${prefix}:body` : undefined,
  });
  const lidBatches = mergeAtAnchor(kit.lid, lidMeshes, "Runtime chest lid", {
    ...options,
    geometryKeyPrefix: prefix ? `${prefix}:lid` : undefined,
  });

  disposeSourceMeshes(sourceMeshes, options?.geometryStrategy);
  kit.root.add(...bodyBatches);
  kit.lid.add(...lidBatches);
  kit.root.userData.runtimeBatching = {
    sourceMeshes: sourceMeshes.length,
    bodyBatches: bodyBatches.length,
    lidBatches: lidBatches.length,
  } satisfies RuntimeChestBatchStats;
  kit.root.updateMatrixWorld(true);
  return kit.root.userData.runtimeBatching as RuntimeChestBatchStats;
}

function collectChestMeshes(kit: ForgeChestKit): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  kit.root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function relativeMatrix(
  anchor: THREE.Object3D,
  parent: THREE.Object3D,
  target: THREE.Matrix4,
): THREE.Matrix4 {
  anchor.updateWorldMatrix(true, false);
  parent.updateWorldMatrix(true, false);
  return target.copy(parent.matrixWorld).invert().multiply(anchor.matrixWorld);
}

/**
 * Render one resident floor's interactive chests through five shared instance
 * batches while keeping each authored root, hinge, socket, collision, and reward anchor.
 */
export function batchForgeChestsForRuntime(
  kits: readonly ForgeChestKit[],
  parent: THREE.Object3D,
  options?: RuntimeModelBatchingOptions,
): RuntimeChestBatchResult {
  const root = new THREE.Group();
  root.name = "Runtime chest batches";
  if (kits.length === 0) {
    return {
      root,
      handles: [],
      stats: { instances: 0, sourceMeshes: 0, bodyBatches: 0, lidBatches: 0 },
    };
  }

  parent.updateWorldMatrix(true, false);
  for (const kit of kits) kit.root.updateWorldMatrix(true, true);
  const templateMeshes = collectChestMeshes(kits[0]!);
  const templateLidMeshes = templateMeshes.filter((mesh) => isBelow(mesh, kits[0]!.lid));
  const templateBodyMeshes = templateMeshes.filter((mesh) => !isBelow(mesh, kits[0]!.lid));
  const prefix = options?.geometryKeyPrefix?.trim();
  const bodyTemplates = mergeAtAnchor(kits[0]!.root, templateBodyMeshes, "Runtime chest body", {
    ...options,
    geometryKeyPrefix: prefix ? `${prefix}:body` : undefined,
  });
  const lidTemplates = mergeAtAnchor(kits[0]!.lid, templateLidMeshes, "Runtime chest lid", {
    ...options,
    geometryKeyPrefix: prefix ? `${prefix}:lid` : undefined,
  });
  const matrix = new THREE.Matrix4();

  const createInstances = (
    templates: readonly THREE.Mesh[],
    anchor: (kit: ForgeChestKit) => THREE.Object3D,
    dynamic: boolean,
  ): THREE.InstancedMesh[] =>
    templates.map((template, batchIndex) => {
      const batch = new THREE.InstancedMesh(template.geometry, template.material, kits.length);
      batch.name = `${dynamic ? "Runtime chest lid" : "Runtime chest body"} batch ${batchIndex + 1}`;
      batch.castShadow = template.castShadow;
      batch.receiveShadow = template.receiveShadow;
      if (dynamic) batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      kits.forEach((kit, instance) => {
        batch.setMatrixAt(instance, relativeMatrix(anchor(kit), parent, matrix));
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
      if (dynamic && batch.boundingSphere) batch.boundingSphere.radius += 2;
      root.add(batch);
      return batch;
    });

  const bodyBatches = createInstances(bodyTemplates, (kit) => kit.root, false);
  const lidBatches = createInstances(lidTemplates, (kit) => kit.lid, true);
  const sourceMeshes = kits.flatMap((kit) => collectChestMeshes(kit));
  disposeSourceMeshes(sourceMeshes, options?.geometryStrategy);

  const handles = kits.map(
    (kit, instance): RuntimeChestInstanceHandle => ({
      root,
      updateLidMatrix(): void {
        for (const batch of lidBatches) {
          batch.setMatrixAt(instance, relativeMatrix(kit.lid, root, matrix));
          batch.instanceMatrix.needsUpdate = true;
        }
      },
    }),
  );
  root.userData.runtimeBatching = {
    instances: kits.length,
    sourceMeshes: sourceMeshes.length,
    bodyBatches: bodyBatches.length,
    lidBatches: lidBatches.length,
  } satisfies RuntimeChestBatchResult["stats"];
  return {
    root,
    handles,
    stats: root.userData.runtimeBatching as RuntimeChestBatchResult["stats"],
  };
}

function isVfxOnly(object: THREE.Object3D, root: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current && current !== root) {
    if (current.userData.vfxOnly === true) return true;
    current = current.parent;
  }
  return false;
}

function collectFixtureMeshes(root: THREE.Group): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && !isVfxOnly(object, root)) meshes.push(object);
  });
  return meshes;
}

/** Batch rigid torch/lantern fixtures; flames, embers, halos and lights stay per actor. */
export function batchWallFireFixturesForRuntime(
  fixtures: readonly RuntimeWallFireFixture[],
  parent: THREE.Object3D,
): RuntimeWallFireBatchResult {
  const root = new THREE.Group();
  root.name = "Runtime wall-fire global batches";
  const handles: RuntimeWallFireFixtureHandle[] = fixtures.map(() => ({ setVisible() {} }));
  const stats: RuntimeWallFireBatchResult["stats"] = {
    instances: fixtures.length,
    sourceMeshes: 0,
    batches: 0,
    kinds: {
      torch: { instances: 0, batches: 0 },
      lantern: { instances: 0, batches: 0 },
    },
  };
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  for (const kind of ["torch", "lantern"] as const) {
    const entries = fixtures
      .map((fixture, sourceIndex) => ({ fixture, sourceIndex }))
      .filter((entry) => entry.fixture.kind === kind);
    if (entries.length === 0) continue;
    for (const entry of entries) entry.fixture.root.updateWorldMatrix(true, true);
    const templateMeshes = collectFixtureMeshes(entries[0]!.fixture.root);
    const templates = mergeAtAnchor(
      entries[0]!.fixture.root,
      templateMeshes,
      `Runtime wall-fire ${kind}`,
    );
    const matrices = entries.map((entry) =>
      relativeMatrix(entry.fixture.root, parent, new THREE.Matrix4()),
    );
    const batches = templates.map((template, batchIndex) => {
      const batch = new THREE.InstancedMesh(template.geometry, template.material, entries.length);
      batch.name = `Runtime wall-fire ${kind} global batch ${batchIndex + 1}`;
      batch.castShadow = template.castShadow;
      batch.receiveShadow = template.receiveShadow;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      matrices.forEach((value, instance) => batch.setMatrixAt(instance, value));
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
      root.add(batch);
      return batch;
    });

    entries.forEach((entry, instance) => {
      let visible = true;
      handles[entry.sourceIndex] = {
        setVisible(nextVisible: boolean): void {
          if (nextVisible === visible) return;
          visible = nextVisible;
          for (const batch of batches) {
            batch.setMatrixAt(instance, visible ? matrices[instance]! : zeroMatrix);
            batch.instanceMatrix.needsUpdate = true;
          }
        },
      };
    });

    const ownedMaterials = new Set<THREE.Material>();
    entries.forEach((entry, entryIndex) => {
      for (const mesh of collectFixtureMeshes(entry.fixture.root)) {
        stats.sourceMeshes += 1;
        mesh.parent?.remove(mesh);
        mesh.geometry.dispose();
        if (entryIndex === 0) continue;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (!material.userData.sharedDungeonMaterial) ownedMaterials.add(material);
        }
      }
    });
    for (const material of ownedMaterials) material.dispose();
    stats.kinds[kind] = { instances: entries.length, batches: batches.length };
    stats.batches += batches.length;
  }

  root.userData.runtimeBatching = stats;
  return { root, handles, stats };
}

export interface RuntimeDoorFrameBatchStats {
  doors: number;
  sourceMeshes: number;
  batches: number;
}

export interface RuntimeDoorFrameSource {
  root: THREE.Group;
  left: THREE.Object3D;
  right: THREE.Object3D;
}

export interface RuntimeDoorFrameBatchOptions extends RuntimeModelBatchingOptions {
  /** Doors with different topology/dimensions must never share a frame template. */
  keyForDoor?: (door: RuntimeDoorFrameSource) => string;
}

export interface RuntimeDoorFrameBatchResult {
  root: THREE.Group;
  handles: RuntimeDoorFrameInstanceHandle[];
  stats: RuntimeDoorFrameBatchStats;
}

/**
 * Share rigid door-frame meshes within one resident floor. Leaf hinges stay per
 * door so openness animation keeps writing local rotations (strategy B).
 */
export function batchDoorFramesForRuntime(
  doors: readonly RuntimeDoorFrameSource[],
  parent: THREE.Object3D,
  options?: RuntimeDoorFrameBatchOptions,
): RuntimeDoorFrameBatchResult {
  const root = new THREE.Group();
  root.name = "Runtime door frame batches";
  const handles = doors.map<RuntimeDoorFrameInstanceHandle>(() => ({ root }));
  const stats: RuntimeDoorFrameBatchStats = {
    doors: doors.length,
    sourceMeshes: 0,
    batches: 0,
  };
  if (doors.length === 0) return { root, handles, stats };

  parent.updateWorldMatrix(true, false);
  for (const door of doors) door.root.updateWorldMatrix(true, true);

  const isUnderHinge = (mesh: THREE.Object3D, door: RuntimeDoorFrameSource) =>
    isBelow(mesh, door.left) || isBelow(mesh, door.right);

  const groups = new Map<string, RuntimeDoorFrameSource[]>();
  for (const door of doors) {
    const rawKey = options?.keyForDoor?.(door) ?? "default";
    const key = rawKey.trim() || "default";
    const group = groups.get(key) ?? [];
    group.push(door);
    groups.set(key, group);
  }

  const matrix = new THREE.Matrix4();
  for (const [groupKey, groupDoors] of groups) {
    const frameMeshesPerDoor = groupDoors.map((door) => {
      const meshes: THREE.Mesh[] = [];
      door.root.traverse((object) => {
        if (object instanceof THREE.Mesh && !isUnderHinge(object, door)) meshes.push(object);
      });
      return meshes;
    });
    const templateMeshes = frameMeshesPerDoor[0] ?? [];
    if (templateMeshes.length === 0) continue;

    const prefix = options?.geometryKeyPrefix?.trim();
    const templates = mergeAtAnchor(groupDoors[0]!.root, templateMeshes, "Runtime door frame", {
      ...options,
      geometryKeyPrefix: prefix ? `${prefix}:topology:${encodeURIComponent(groupKey)}` : undefined,
    });
    for (const [batchIndex, template] of templates.entries()) {
      const batch = new THREE.InstancedMesh(
        template.geometry,
        template.material,
        groupDoors.length,
      );
      batch.name = `Runtime door frame batch ${stats.batches + batchIndex + 1}`;
      batch.castShadow = template.castShadow;
      batch.receiveShadow = template.receiveShadow;
      groupDoors.forEach((door, instance) => {
        batch.setMatrixAt(instance, relativeMatrix(door.root, parent, matrix));
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingBox();
      batch.computeBoundingSphere();
      root.add(batch);
    }
    stats.batches += templates.length;
    const sourceMeshes = frameMeshesPerDoor.flat();
    stats.sourceMeshes += sourceMeshes.length;
    disposeSourceMeshes(sourceMeshes, options?.geometryStrategy);
  }

  root.userData.runtimeBatching = stats;
  return { root, handles, stats };
}
