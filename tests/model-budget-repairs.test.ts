import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createFloorCampfire } from "../src/world/FloorCampfireFactory";
import { createBiomeMagicPortal, setMagicPortalOpen } from "../src/world/MagicPortalKit";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";

interface ModelMetrics {
  triangles: number;
  drawCalls: number;
  materials: number;
}

function modelMetrics(root: THREE.Object3D, solidOnly = false, visibleOnly = false): ModelMetrics {
  let triangles = 0;
  let drawCalls = 0;
  const materials = new Set<THREE.Material>();
  const visit = (object: THREE.Object3D, ancestorsVisible: boolean): void => {
    const visible = ancestorsVisible && object.visible;
    if ((visibleOnly && !visible) || (solidOnly && object.userData.vfxOnly)) return;
    if (!(object instanceof THREE.Mesh)) {
      object.children.forEach((child) => visit(child, visible));
      return;
    }
    const positions = object.geometry.getAttribute("position");
    const instances = object instanceof THREE.InstancedMesh ? object.count : 1;
    triangles += ((object.geometry.index?.count ?? positions.count) / 3) * instances;
    drawCalls += 1;
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((material) => materials.add(material));
    object.children.forEach((child) => visit(child, visible));
  };
  visit(root, true);
  return { triangles, drawCalls, materials: materials.size };
}

function expectValidTriangleUvs(root: THREE.Object3D, solidOnly = false): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || (solidOnly && object.userData.vfxOnly)) return;
    const uv = object.geometry.getAttribute("uv");
    expect(uv, `${object.name} has UVs`).toBeDefined();
    const indices = object.geometry.index;
    const vertexIndex = (corner: number): number => indices?.getX(corner) ?? corner;
    const cornerCount = indices?.count ?? uv.count;
    for (let corner = 0; corner < cornerCount; corner += 3) {
      const a = vertexIndex(corner);
      const b = vertexIndex(corner + 1);
      const c = vertexIndex(corner + 2);
      const values = [uv.getX(a), uv.getY(a), uv.getX(b), uv.getY(b), uv.getX(c), uv.getY(c)];
      expect(values.every(Number.isFinite), `${object.name} has finite UVs`).toBe(true);
      expect(
        values.every((value) => value >= -1e-6 && value <= 1 + 1e-6),
        `${object.name} keeps UVs in range`,
      ).toBe(true);
      const area = Math.abs(
        (values[2]! - values[0]!) * (values[5]! - values[1]!) -
          (values[3]! - values[1]!) * (values[4]! - values[0]!),
      );
      expect(area, `${object.name} has positive UV triangle area`).toBeGreaterThan(1e-8);
    }
  });
}

describe("model budget repairs", () => {
  test("portal batches the full gate into bounded material roles and render cost", () => {
    const materials = createDungeonMaterials({ compact: true });
    const portal = createBiomeMagicPortal("ancient", materials);
    const metrics = modelMetrics(portal.root);
    const visibleMetrics = modelMetrics(portal.root, false, true);
    const runtime = portal.root.userData.sculptRuntime;

    expect(metrics).toEqual({ triangles: 3720, drawCalls: 12, materials: 7 });
    expect(metrics.triangles).toBeLessThanOrEqual(4_000);
    expect(visibleMetrics).toEqual({ triangles: 2693, drawCalls: 7, materials: 5 });
    expect(visibleMetrics.triangles).toBeLessThanOrEqual(3_000);
    expect(visibleMetrics.drawCalls).toBeLessThanOrEqual(10);
    expect(metrics.materials).toBeLessThanOrEqual(7);
    expect(runtime.materialRoles).toHaveLength(7);
    expect(runtime.runtimeBatching.maximumVisibleDrawCalls).toBeLessThanOrEqual(12);
    expect(runtime.runtimeBatching.frame).toMatchObject({ drawCalls: 4, materialBatches: 4 });
    expect(runtime.runtimeBatching.seal).toMatchObject({ drawCalls: 1, materialBatches: 1 });
    expect(runtime.sockets.entry).toMatchObject({ type: "portal-entry" });
    expect(runtime.destructionGroups.frame).toEqual(["Faceted escape portal arch"]);
    expect(portal.root.userData.collider.parts).toHaveLength(2);

    const bounds = new THREE.Box3().setFromObject(portal.root);
    const size = bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(2);
    expect(size.y).toBeGreaterThan(3.4);
    expect(size.z).toBeGreaterThan(0.5);
    expect(size.x / size.y).toBeGreaterThan(0.85);
    expect(size.x / size.y).toBeLessThan(0.95);
    expect(portal.root.userData.collider.parts[0].center[0]).toBeCloseTo(-1.12);
    expect(portal.root.userData.collider.parts[1].center[0]).toBeCloseTo(1.12);
    expect(portal.frame.getObjectByName("Ancient upper footing collar")).toBeDefined();
    expect(portal.frame.getObjectByName("Ancient faceted cap slab")).toBeDefined();
    expect(portal.frame.getObjectByName("Ancient pyramidal pillar cap")).toBeDefined();
    expect(portal.frame.getObjectByName("Ancient low gate threshold plinth")).toBeDefined();
    expect(portal.frame.getObjectByName("Ancient rune voussoir 1")?.userData).toMatchObject({
      renderedByMaterialBatch: true,
      sourceGeometryType: "ExtrudeGeometry",
    });
    const flatMagic = portal.root.getObjectByName("Portal sealed energy veil") as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshBasicMaterial
    >;
    expect(flatMagic.material.opacity).toBe(0.22);
    expect(flatMagic.material.color.getHex()).toBe(portal.profile.magicColor);

    const pbrMaterials = new Set<THREE.MeshStandardMaterial>();
    portal.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
        pbrMaterials.add(object.material);
      }
    });
    expect(pbrMaterials.size).toBe(4);
    for (const material of pbrMaterials) {
      expect(material.map, `${material.name} has albedo`).toBeDefined();
      expect(material.normalMap, `${material.name} has normal map`).toBeDefined();
      expect(material.roughnessMap, `${material.name} has roughness map`).toBeDefined();
    }
    expectValidTriangleUvs(portal.root);

    setMagicPortalOpen(portal.root, true);
    expect(portal.seal.visible).toBe(false);
    expect(portal.interior.root.visible).toBe(true);
    setMagicPortalOpen(portal.root, false);
    expect(portal.seal.visible).toBe(true);
    expect(portal.interior.root.visible).toBe(false);
  });

  test("floor campfire keeps three solid batches and one procedural flame", () => {
    const materials = createDungeonMaterials({ compact: true });
    const campfire = createFloorCampfire(new THREE.Vector3(), false, materials, 2);
    const metrics = modelMetrics(campfire.root, true);
    const fullAssemblyMetrics = modelMetrics(campfire.root);
    const runtime = campfire.root.userData.sculptRuntime;

    expect(metrics).toEqual({ triangles: 616, drawCalls: 3, materials: 3 });
    expect(fullAssemblyMetrics).toEqual({ triangles: 632, drawCalls: 5, materials: 5 });
    expect(metrics.triangles).toBeLessThanOrEqual(1_500);
    expect(runtime.geometry).toMatchObject({
      materialBatches: 3,
      drawCalls: 3,
      baseOnly: true,
    });
    expect(runtime.geometry.materialRoles).toEqual([
      "ash-and-coal",
      "charred-wood",
      "faceted-stone",
    ]);
    expect(runtime.runtimeBatching).toMatchObject({
      sourceMeshes: 18,
      drawCalls: 3,
      partMarkersPreserved: 18,
    });
    expect(runtime.sockets["Campfire floor contact socket"].type).toBe("floor");
    expect(runtime.sockets["Campfire flame socket"].type).toBe("flame");
    expect(runtime.sockets["Campfire smoke socket"].type).toBe("smoke");
    expect(runtime.destructionGroups.body).toContain("charred-log-3");
    expect(campfire.root.getObjectByName("Campfire stone ring")).toBeDefined();
    expect(campfire.root.getObjectByName("Campfire log triangle")).toBeDefined();
    expect(campfire.root.getObjectByName("Campfire coal bed")).toBeDefined();
    expect(campfire.root.getObjectByName("Campfire charred log 1")?.userData).toMatchObject({
      renderedByMaterialBatch: true,
      sourceGeometryType: "CylinderGeometry",
    });

    const bounds = new THREE.Box3();
    campfire.root.traverse((object) => {
      if (object instanceof THREE.Mesh && !object.userData.vfxOnly) bounds.expandByObject(object);
    });
    const size = bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(0.9);
    expect(size.y).toBeGreaterThan(0.4);
    expect(size.z).toBeGreaterThan(0.9);
    expectValidTriangleUvs(campfire.root, true);
  });
});
