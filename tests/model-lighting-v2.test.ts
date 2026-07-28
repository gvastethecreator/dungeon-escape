import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createLightingPropBase, type LightingPropFamily } from "../src/world/LightingPropFactory";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) result.push(object);
  });
  return result;
}

function countNames(root: THREE.Object3D, pattern: RegExp): number {
  let count = 0;
  root.traverse((object) => {
    if (pattern.test(object.name)) count += 1;
  });
  return count;
}

function worldBounds(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, false);
  return new THREE.Box3().setFromObject(object);
}

function materialLightness(material: THREE.Material): number {
  if (!(material instanceof THREE.MeshStandardMaterial)) return 1;
  return material.color.getHSL({ h: 0, s: 0, l: 0 }).l;
}

function openBoundaryEdgeCount(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute("position");
  const index = geometry.index;
  const welded = new Map<string, number>();
  const vertexIds: number[] = [];
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const key = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)]
      .map((value) => (Math.abs(value) < 0.000_005 ? 0 : value).toFixed(5))
      .join(",");
    let weldedId = welded.get(key);
    if (weldedId === undefined) {
      weldedId = welded.size;
      welded.set(key, weldedId);
    }
    vertexIds.push(weldedId);
  }

  const edges = new Map<string, number>();
  const triangleIndex = (offset: number): number =>
    vertexIds[index ? index.getX(offset) : offset] ?? -1;
  const triangleVertexCount = index ? index.count : position.count;
  for (let offset = 0; offset < triangleVertexCount; offset += 3) {
    const triangle = [triangleIndex(offset), triangleIndex(offset + 1), triangleIndex(offset + 2)];
    if (new Set(triangle).size < 3) continue;
    for (const [a, b] of [
      [triangle[0]!, triangle[1]!],
      [triangle[1]!, triangle[2]!],
      [triangle[2]!, triangle[0]!],
    ]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  return [...edges.values()].filter((uses) => uses === 1).length;
}

describe("lighting model family v2", () => {
  const families: readonly LightingPropFamily[] = [
    "wall-torch",
    "wall-lantern",
    "oil-lantern",
    "floor-campfire",
    "brazier",
    "fluorescent-fixture",
  ];

  test("all six stable base builders expose closed named parts, action sockets and budgets", () => {
    for (const family of families) {
      const root = createLightingPropBase(family, createDungeonMaterials({ compact: true }));
      const solidMeshes = meshes(root);
      const runtime = root.userData.sculptRuntime;

      expect(root.userData.propFamily).toBe(family);
      expect(runtime.family).toBe(family);
      expect(runtime.sourceImage).toContain(`${family}-three-view.png`);
      expect(runtime.specification).toContain(`/lighting/${family}/spec.json`);
      expect(Object.keys(runtime.nodes).length).toBeGreaterThan(0);
      expect(Object.keys(runtime.sockets).length).toBeGreaterThan(0);
      expect(runtime.collider.type).toBe("box");
      expect(runtime.geometry.triangles).toBeGreaterThan(0);
      expect(runtime.geometry.triangles).toBeLessThanOrEqual(runtime.geometry.maxTriangles);
      expect(runtime.geometry.closedVolumesOnly).toBe(true);
      expect(solidMeshes.length).toBeGreaterThan(0);

      for (const object of solidMeshes) {
        expect(object.name.length).toBeGreaterThan(0);
        expect(object.userData.partId).toBeTruthy();
        expect(object.userData.materialRole).toBeTruthy();
        expect(object.userData.closedVolume).toBe(true);
        expect(object.userData.vfxOnly).toBeUndefined();
        const uv = object.geometry.getAttribute("uv");
        expect(uv, `${family}: ${object.name} UV attribute`).toBeDefined();
        expect(uv?.count, `${family}: ${object.name} UV count`).toBe(
          object.geometry.getAttribute("position").count,
        );
        expect(openBoundaryEdgeCount(object.geometry), `${family}: ${object.name}`).toBe(0);
      }
    }
  });

  test("wall torch keeps its exact shield hardware and two-ring basket", () => {
    const root = createLightingPropBase("wall-torch", createDungeonMaterials());
    const shield = root.getObjectByName("Torch forged shield plate") as THREE.Mesh;
    const handle = root.getObjectByName("Torch tapered handle") as THREE.Mesh;
    const lowerRing = root.getObjectByName("Torch basket lower ring") as THREE.Mesh;
    const upperRing = root.getObjectByName("Torch basket upper ring") as THREE.Mesh;
    const coalBed = root.getObjectByName("Torch basket charcoal bed") as THREE.Mesh;
    expect(shield).toBeDefined();
    expect(root.getObjectByName("Torch scroll bracket")).toBeDefined();
    expect(countNames(root, /^Torch lower front bolt \d$/)).toBe(2);
    expect(countNames(root, /^Torch basket (lower|upper) ring$/)).toBe(2);
    const ribs = root.getObjectByName(
      "Torch basket two lateral upright ribs",
    ) as THREE.InstancedMesh;
    expect(ribs.count).toBe(2);
    expect(root.getObjectByName("Torch basket charcoal bed")).toBeDefined();
    expect((root.getObjectByName("Torch basket coal lumps") as THREE.InstancedMesh).count).toBe(5);
    expect(materialLightness(shield.material as THREE.Material)).toBeLessThan(
      materialLightness(upperRing.material as THREE.Material),
    );
    const handleBounds = worldBounds(handle);
    expect(handleBounds.getSize(new THREE.Vector3()).y).toBeCloseTo(0.76, 2);
    expect(handleBounds.min.y).toBeLessThan(-0.12);
    expect(handleBounds.max.y).toBeGreaterThan(lowerRing.position.y);
    expect(lowerRing.position.y).toBeLessThanOrEqual(0.6);
    expect(upperRing.position.y).toBeLessThanOrEqual(0.78);
    expect(coalBed.position.y).toBeGreaterThan(lowerRing.position.y);
    expect(coalBed.position.y).toBeLessThan(upperRing.position.y);
    expect((coalBed.material as THREE.Material).userData.localReadableCoal).toBe(true);
    const flameSocket = root.getObjectByName("Torch flame socket")!;
    expect(flameSocket.userData.socket.type).toBe("flame");
    expect(flameSocket.position.y).toBeLessThanOrEqual(0.86);
  });

  test("wall lantern keeps thin cage bars and an open four-rail service door", () => {
    const root = createLightingPropBase("wall-lantern", createDungeonMaterials());
    expect(countNames(root, /^Lantern front brass rivet \d$/)).toBe(4);
    expect(countNames(root, /^Lantern fixed cage bar \d$/)).toBe(2);
    expect(countNames(root, /^Lantern cage (upper|lower) ring$/)).toBe(2);
    expect(countNames(root, /^Lantern open cage door (left|right|upper|lower) rail$/)).toBe(4);
    expect(root.getObjectByName("Lantern closed thin rectangular iron door")).toBeUndefined();
    const hinge = root.getObjectByName("Lantern cage door hinge")!;
    expect(hinge.userData.socket.type).toBe("hinge");
    expect(hinge.rotation.y).toBeLessThan(-0.8);
    expect(root.getObjectByName("Lantern brass wick collar")).toBeDefined();
    expect(root.getObjectByName("Lantern charred wick")).toBeDefined();
    for (let index = 1; index <= 4; index += 1) {
      const rivet = root.getObjectByName(`Lantern front brass rivet ${index}`)!;
      expect(Math.abs(rivet.position.x)).toBeGreaterThan(0.24);
      expect(rivet.position.z).toBeGreaterThan(0.04);
    }
    expect(new Set(meshes(root).map((object) => object.userData.materialRole))).toEqual(
      new Set(["blackened-iron", "aged-brass", "black-coal"]),
    );
  });

  test("oil lantern keeps five links, four cage bars and separate iron, brass and glass roles", () => {
    const root = createLightingPropBase("oil-lantern", createDungeonMaterials());
    expect(countNames(root, /^Oil lantern chain link \d$/)).toBe(5);
    expect(countNames(root, /^Oil lantern cage bar \d$/)).toBe(4);
    expect(root.getObjectByName("Oil lantern clear glass chamber")).toBeDefined();
    expect(root.getObjectByName("Oil lantern brass wick collar")).toBeDefined();
    expect(root.getObjectByName("Oil lantern flattened brass reservoir")).toBeDefined();
    expect(new Set(meshes(root).map((object) => object.userData.materialRole))).toEqual(
      new Set(["blackened-iron", "aged-brass", "clear-glass"]),
    );
    const glass = root.getObjectByName("Oil lantern clear glass chamber") as THREE.Mesh;
    expect(glass.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect((glass.material as THREE.MeshPhysicalMaterial).transmission).toBeGreaterThanOrEqual(0.5);
    expect((glass.material as THREE.MeshPhysicalMaterial).map).toBeNull();
    const finalLink = root.getObjectByName("Oil lantern chain link 5")!;
    const roofEye = root.getObjectByName("Oil lantern load-bearing roof eye") as THREE.Mesh;
    const dome = root.getObjectByName("Oil lantern faceted iron dome")!;
    expect(roofEye.geometry).toBeInstanceOf(THREE.TorusGeometry);
    expect(roofEye.userData.attachedTo).toEqual(["chain-link-5", "faceted-dome"]);
    expect(worldBounds(finalLink).intersectsBox(worldBounds(roofEye))).toBe(true);
    expect(worldBounds(roofEye).intersectsBox(worldBounds(dome))).toBe(true);
  });

  test("campfire base has exact stone, log and coal counts without baked flame geometry", () => {
    const root = createLightingPropBase("floor-campfire", createDungeonMaterials());
    expect(countNames(root, /^Campfire ring stone \d$/)).toBe(8);
    expect(countNames(root, /^Campfire charred log \d$/)).toBe(3);
    expect(countNames(root, /^Campfire coal lump \d$/)).toBe(6);
    expect(meshes(root).some((object) => /flame|smoke/i.test(object.name))).toBe(false);
    expect(root.getObjectByName("Campfire flame socket")?.userData.socket.type).toBe("flame");
    expect(root.getObjectByName("Campfire smoke socket")?.userData.socket.type).toBe("smoke");
    const log = root.getObjectByName("Campfire charred log 1") as THREE.Mesh;
    const coal = root.getObjectByName("Campfire coal lump 1") as THREE.Mesh;
    expect(materialLightness(log.material as THREE.Material)).toBeLessThan(0.2);
    expect(materialLightness(coal.material as THREE.Material)).toBeLessThan(0.1);
  });

  test("brazier has a grounded stepped base, closed bowl, coal bed and restrained embers", () => {
    const root = createLightingPropBase("brazier", createDungeonMaterials());
    expect(meshes(root).map((object) => object.name)).toEqual([
      "Brazier broad octagonal lower foot",
      "Brazier stepped octagonal upper foot",
      "Brazier centered octagonal tapered stem",
      "Brazier octagonal bowl support collar",
      "Brazier shallow octagonal iron bowl",
      "Brazier thin octagonal rolled rim",
      "Brazier recessed charcoal bed",
      "Brazier faceted coal lumps",
      "Brazier restrained ember nodes",
    ]);
    expect((root.getObjectByName("Brazier faceted coal lumps") as THREE.InstancedMesh).count).toBe(
      5,
    );
    expect(
      (root.getObjectByName("Brazier restrained ember nodes") as THREE.InstancedMesh).count,
    ).toBe(4);
    const flameSocket = root.getObjectByName("Brazier flame socket")!;
    expect(flameSocket.userData.socket.type).toBe("flame");
    expect(flameSocket.position.y).toBeGreaterThan(1.1);
    expect(worldBounds(root).min.y).toBeCloseTo(0, 4);
    expect(root.userData.sculptRuntime.geometry.triangles).toBeLessThanOrEqual(400);
    expect(new Set(meshes(root).map((object) => object.userData.materialRole))).toEqual(
      new Set(["blackened-iron", "black-coal", "restrained-ember"]),
    );
  });

  test("fluorescent fixture is the exact two-solid measured housing and inset diffuser", () => {
    const materials = createDungeonMaterials();
    const root = createLightingPropBase("fluorescent-fixture", materials);
    const solidMeshes = meshes(root);
    expect(solidMeshes).toHaveLength(2);
    const housing = root.getObjectByName("Fluorescent plain metal housing") as THREE.Mesh;
    const diffuser = root.getObjectByName("Fluorescent inset warm diffuser") as THREE.Mesh;
    const housingSize = new THREE.Box3().setFromObject(housing).getSize(new THREE.Vector3());
    const diffuserSize = new THREE.Box3().setFromObject(diffuser).getSize(new THREE.Vector3());
    expect(housingSize.x).toBeCloseTo(1.72);
    expect(housingSize.y).toBeCloseTo(0.08);
    expect(housingSize.z).toBeCloseTo(0.48);
    expect(diffuserSize.x).toBeCloseTo(1.5);
    expect(diffuserSize.y).toBeCloseTo(0.035);
    expect(diffuserSize.z).toBeCloseTo(0.31);
    expect(diffuser.position.y).toBeLessThan(-0.08);
    expect(new Set(solidMeshes.map((object) => object.userData.materialRole))).toEqual(
      new Set(["painted-metal", "warm-diffuser"]),
    );
    expect((housing.material as THREE.MeshStandardMaterial).map).toBe(materials.paintedSteel.map);
    expect((housing.material as THREE.MeshStandardMaterial).metalness).toBe(
      materials.paintedSteel.metalness,
    );
    expect((diffuser.material as THREE.MeshStandardMaterial).map).toBeNull();
    expect((diffuser.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);
    expect((diffuser.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeLessThanOrEqual(
      1,
    );
  });
});
