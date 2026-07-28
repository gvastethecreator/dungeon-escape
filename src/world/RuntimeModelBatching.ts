import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { ForgeChestKit } from "./ForgePropFactory";

export interface RuntimeChestBatchStats {
  sourceMeshes: number;
  bodyBatches: number;
  lidBatches: number;
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

function geometryRelativeTo(mesh: THREE.Mesh, anchor: THREE.Object3D): THREE.BufferGeometry {
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const relative = anchor.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
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
    const parts = batch.meshes.map((mesh) => geometryRelativeTo(mesh, anchor));
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
