import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createForgeChest } from "../src/world/ForgePropFactory";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import {
  batchForgeChestForRuntime,
  batchForgeChestsForRuntime,
  batchWallFireFixturesForRuntime,
} from "../src/world/RuntimeModelBatching";
import { createWallLantern, createWallTorch } from "../src/world/WallTorchFactory";

function meshCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) count += 1;
  });
  return count;
}

function instanceBounds(
  root: THREE.Object3D,
  instance: number,
  nameIncludes?: string,
): THREE.Box3 {
  const bounds = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  root.traverse((object) => {
    if (
      !(object instanceof THREE.InstancedMesh) ||
      (nameIncludes && !object.name.includes(nameIncludes))
    )
      return;
    object.geometry.computeBoundingBox();
    if (!object.geometry.boundingBox) return;
    object.getMatrixAt(instance, matrix);
    matrix.premultiply(object.matrixWorld);
    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(matrix));
  });
  return bounds;
}

function rigidFixtureBounds(root: THREE.Object3D): THREE.Box3 {
  const bounds = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    let current: THREE.Object3D | null = object;
    while (current && current !== root) {
      if (current.userData.vfxOnly === true) return;
      current = current.parent;
    }
    object.geometry.computeBoundingBox();
    if (object.geometry.boundingBox) {
      bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    }
  });
  return bounds;
}

describe("runtime model batching", () => {
  test("collapses a detailed chest while preserving its bounds, materials, and lid pivot", () => {
    const materials = createDungeonMaterials();
    const kit = createForgeChest(materials);
    kit.root.updateMatrixWorld(true);
    const before = new THREE.Box3().setFromObject(kit.root);
    const sourceMaterials = new Set<THREE.Material>();
    kit.root.traverse((object) => {
      if (object instanceof THREE.Mesh && !Array.isArray(object.material))
        sourceMaterials.add(object.material);
    });
    const sourceMeshCount = meshCount(kit.root);

    const stats = batchForgeChestForRuntime(kit);
    const after = new THREE.Box3().setFromObject(kit.root);
    const runtimeMaterials = new Set<THREE.Material>();
    kit.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      expect(object.geometry.getAttribute("uv")).toBeDefined();
      if (!Array.isArray(object.material)) runtimeMaterials.add(object.material);
    });

    expect(sourceMeshCount).toBeGreaterThan(80);
    expect(stats).toEqual({ sourceMeshes: sourceMeshCount, bodyBatches: 3, lidBatches: 2 });
    expect(meshCount(kit.root)).toBe(5);
    expect(runtimeMaterials).toEqual(sourceMaterials);
    expect(kit.lid.parent).toBe(kit.root);
    expect(kit.lid.userData.hinge.axis).toEqual([1, 0, 0]);
    expect(kit.root.getObjectByName("Chest loot socket")).toBeDefined();
    expect(kit.root.getObjectByName("Chest interaction socket")).toBeDefined();
    for (const axis of ["x", "y", "z"] as const) {
      expect(after.min[axis]).toBeCloseTo(before.min[axis], 4);
      expect(after.max[axis]).toBeCloseTo(before.max[axis], 4);
    }
  });

  test("keeps the moving lid geometry under the hinge after batching", () => {
    const kit = createForgeChest(createDungeonMaterials());
    batchForgeChestForRuntime(kit);
    const closed = new THREE.Box3().setFromObject(kit.lid);
    kit.lid.rotation.x = -1.18;
    kit.root.updateMatrixWorld(true);
    const open = new THREE.Box3().setFromObject(kit.lid);

    expect(open.min.z).not.toBeCloseTo(closed.min.z, 3);
    expect(open.max.y).toBeGreaterThan(closed.max.y);
  });

  test("shares body and lid batches across chests and updates one lid instance", () => {
    const materials = createDungeonMaterials();
    const parent = new THREE.Group();
    const kits = [0, 1, 2].map((index) => {
      const kit = createForgeChest(materials);
      kit.root.position.set(index * 3, 0, index * -2);
      parent.add(kit.root);
      return kit;
    });
    parent.updateMatrixWorld(true);
    const closedBounds = kits.map((kit) => new THREE.Box3().setFromObject(kit.root));

    const result = batchForgeChestsForRuntime(kits, parent);
    parent.add(result.root);
    parent.updateMatrixWorld(true);
    expect(result.stats).toMatchObject({ instances: 3, bodyBatches: 3, lidBatches: 2 });
    expect(result.stats.sourceMeshes).toBeGreaterThan(240);
    expect(meshCount(result.root)).toBe(5);
    result.root.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) expect(object.count).toBe(3);
    });
    closedBounds.forEach((expected, index) => {
      const actual = instanceBounds(result.root, index);
      for (const axis of ["x", "y", "z"] as const) {
        expect(actual.min[axis]).toBeCloseTo(expected.min[axis], 4);
        expect(actual.max[axis]).toBeCloseTo(expected.max[axis], 4);
      }
    });

    const lidBatch = result.root.getObjectByName(
      "Runtime chest lid global batch 1",
    ) as THREE.InstancedMesh;
    const before = new THREE.Matrix4();
    const unchangedBefore = new THREE.Matrix4();
    const after = new THREE.Matrix4();
    lidBatch.getMatrixAt(1, before);
    lidBatch.getMatrixAt(0, unchangedBefore);
    kits[1]!.lid.rotation.x = -1.18;
    result.handles[1]!.updateLidMatrix();
    lidBatch.getMatrixAt(1, after);
    expect(after.equals(before)).toBe(false);
    const unchanged = new THREE.Matrix4();
    lidBatch.getMatrixAt(0, unchanged);
    expect(unchanged.equals(unchangedBefore)).toBe(true);
    expect(closedBounds[0]!.isEmpty()).toBe(false);
    expect(kits[0]!.lid.userData.hinge.axis).toEqual([1, 0, 0]);
  });

  test("shares rigid wall-fire fixtures while preserving VFX actors and per-instance LOD", () => {
    const materials = createDungeonMaterials();
    const parent = new THREE.Group();
    const torchA = createWallTorch(
      new THREE.Vector3(1, 1.4, 2),
      new THREE.Vector3(0, 0, 1),
      true,
      materials,
    );
    const torchB = createWallTorch(
      new THREE.Vector3(4, 1.4, -2),
      new THREE.Vector3(1, 0, 0),
      true,
      materials,
    );
    const lantern = createWallLantern(
      new THREE.Vector3(-3, 1.4, 1),
      new THREE.Vector3(0, 0, -1),
      true,
      materials,
    );
    const assemblies = [torchA, torchB, lantern];
    parent.add(...assemblies.map((assembly) => assembly.root));
    const before = assemblies.map((assembly) => rigidFixtureBounds(assembly.root));

    const result = batchWallFireFixturesForRuntime(
      [
        { kind: "torch", root: torchA.root },
        { kind: "torch", root: torchB.root },
        { kind: "lantern", root: lantern.root },
      ],
      parent,
    );
    parent.add(result.root);
    parent.updateMatrixWorld(true);
    expect(result.stats.instances).toBe(3);
    expect(result.stats.sourceMeshes).toBeGreaterThan(result.stats.batches);
    expect(result.stats.kinds.torch.instances).toBe(2);
    expect(result.stats.kinds.lantern.instances).toBe(1);
    expect(torchA.flame.parent).not.toBeNull();
    expect(torchA.flameDetails.every((detail) => detail.parent !== null)).toBe(true);
    expect(torchA.root.getObjectByName("Torch flame socket")).toBeDefined();

    const torchBatch = result.root.getObjectByName(
      "Runtime wall-fire torch global batch 1",
    ) as THREE.InstancedMesh;
    const visibleA = new THREE.Matrix4();
    const visibleB = new THREE.Matrix4();
    torchBatch.getMatrixAt(0, visibleA);
    torchBatch.getMatrixAt(1, visibleB);
    result.handles[0]!.setVisible(false);
    const hiddenA = new THREE.Matrix4();
    const unchangedB = new THREE.Matrix4();
    torchBatch.getMatrixAt(0, hiddenA);
    torchBatch.getMatrixAt(1, unchangedB);
    expect(hiddenA.determinant()).toBe(0);
    expect(unchangedB.equals(visibleB)).toBe(true);
    result.handles[0]!.setVisible(true);
    torchBatch.getMatrixAt(0, hiddenA);
    expect(hiddenA.equals(visibleA)).toBe(true);

    const batchedBounds = [
      instanceBounds(result.root, 0, "wall-fire torch"),
      instanceBounds(result.root, 1, "wall-fire torch"),
      instanceBounds(result.root, 0, "wall-fire lantern"),
    ];
    batchedBounds.forEach((actual, index) => {
      const expected = before[index]!;
      for (const axis of ["x", "y", "z"] as const) {
        expect(actual.min[axis]).toBeCloseTo(expected.min[axis], 4);
        expect(actual.max[axis]).toBeCloseTo(expected.max[axis], 4);
      }
    });
  });
});
