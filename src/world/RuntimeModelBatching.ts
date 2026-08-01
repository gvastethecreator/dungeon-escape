import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { ForgeChestKit } from "./ForgePropFactory";

export interface RuntimeChestBatchStats {
  sourceMeshes: number;
  bodyBatches: number;
  lidBatches: number;
}

export interface RuntimeChestInstanceHandle {
  updateLidMatrix(): void;
}

export interface RuntimeChestBatchResult {
  root: THREE.Group;
  handles: RuntimeChestInstanceHandle[];
  stats: RuntimeChestBatchStats & { instances: number };
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

function mergeAtAnchor(
  anchor: THREE.Object3D,
  meshes: readonly THREE.Mesh[],
  label: string,
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

/**
 * Collapse the detailed interactive chest into one mesh per material and moving
 * section. The authored source tree stays available to the model lab, while the
 * play route keeps the real lid pivot with a bounded draw-call cost.
 */
export function batchForgeChestForRuntime(kit: ForgeChestKit): RuntimeChestBatchStats {
  kit.root.updateMatrixWorld(true);
  const sourceMeshes: THREE.Mesh[] = [];
  kit.root.traverse((object) => {
    if (object instanceof THREE.Mesh) sourceMeshes.push(object);
  });
  const lidMeshes = sourceMeshes.filter((mesh) => isBelow(mesh, kit.lid));
  const bodyMeshes = sourceMeshes.filter((mesh) => !isBelow(mesh, kit.lid));
  const bodyBatches = mergeAtAnchor(kit.root, bodyMeshes, "Runtime chest body");
  const lidBatches = mergeAtAnchor(kit.lid, lidMeshes, "Runtime chest lid");

  for (const mesh of sourceMeshes) {
    mesh.parent?.remove(mesh);
    mesh.geometry.dispose();
  }
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
 * Render every interactive chest through five shared instance batches while
 * keeping each authored root, hinge, socket, collision, and reward anchor.
 */
export function batchForgeChestsForRuntime(
  kits: readonly ForgeChestKit[],
  parent: THREE.Object3D,
): RuntimeChestBatchResult {
  const root = new THREE.Group();
  root.name = "Runtime chest global batches";
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
  const bodyTemplates = mergeAtAnchor(kits[0]!.root, templateBodyMeshes, "Runtime chest body");
  const lidTemplates = mergeAtAnchor(kits[0]!.lid, templateLidMeshes, "Runtime chest lid");
  const matrix = new THREE.Matrix4();

  const createInstances = (
    templates: readonly THREE.Mesh[],
    anchor: (kit: ForgeChestKit) => THREE.Object3D,
    dynamic: boolean,
  ): THREE.InstancedMesh[] =>
    templates.map((template, batchIndex) => {
      const batch = new THREE.InstancedMesh(template.geometry, template.material, kits.length);
      batch.name = `${dynamic ? "Runtime chest lid" : "Runtime chest body"} global batch ${batchIndex + 1}`;
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
  let sourceMeshes = 0;
  for (const kit of kits) {
    for (const mesh of collectChestMeshes(kit)) {
      sourceMeshes += 1;
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
    }
  }

  const handles = kits.map((kit, instance): RuntimeChestInstanceHandle => ({
    updateLidMatrix(): void {
      for (const batch of lidBatches) {
        batch.setMatrixAt(instance, relativeMatrix(kit.lid, root, matrix));
        batch.instanceMatrix.needsUpdate = true;
      }
    },
  }));
  root.userData.runtimeBatching = {
    instances: kits.length,
    sourceMeshes,
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
      const batch = new THREE.InstancedMesh(
        template.geometry,
        template.material,
        entries.length,
      );
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
