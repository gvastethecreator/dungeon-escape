import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createForgeChest } from "../src/world/ForgePropFactory";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { batchForgeChestForRuntime } from "../src/world/RuntimeModelBatching";

function meshCount(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) count += 1;
  });
  return count;
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
});
