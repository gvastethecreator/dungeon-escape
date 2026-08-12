import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  createImageSculptedAmbient,
  IMAGE_SCULPTED_AMBIENT_KINDS,
  type ImageSculptedAmbientKind,
} from "../src/world/AtmospherePropsKit";
import {
  createImageSculptedHanging,
  IMAGE_SCULPTED_HANGING_FAMILIES,
  type ImageSculptedHangingFamily,
} from "../src/world/ImageSculptedHangingKit";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createStaticPropTemplateBatches } from "../src/world/StaticDungeonScene";

interface RuntimeGeometry {
  triangles: number;
  materialBatches: number;
  targetTriangles: number;
  maxTriangles: number;
  mergeStrategy: string;
}

interface SculptRuntime {
  sourceImage: string;
  specification: string;
  approximation: string;
  family: string;
  origin: string;
  nodes: Record<string, string>;
  sockets: Record<string, unknown>;
  collider: { type: string; size: number[]; offset?: number[] };
  destructionGroups: Record<string, string[]>;
  geometry: RuntimeGeometry;
}

const ACCEPTED_HANGING = [
  "iron-cage",
  "tattered-banner",
  "meat-hooks",
  "bone-mobile",
  "root-cluster",
  "hanging-chain",
  "hanging-vine",
] as const satisfies readonly ImageSculptedHangingFamily[];

const ACCEPTED_AMBIENT = [
  "bone-pile",
  "rubble-pile",
  "rock-cluster",
  "icicle",
  "ice-shard",
  "ground-root-tangle",
  "ground-debris",
] as const satisfies readonly ImageSculptedAmbientKind[];

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function worldBounds(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, false);
  return new THREE.Box3().setFromObject(object);
}

function triangleCount(root: THREE.Object3D): number {
  return Math.round(
    meshesOf(root).reduce((total, mesh) => {
      const position = mesh.geometry.getAttribute("position");
      return total + (mesh.geometry.index ? mesh.geometry.index.count / 3 : position.count / 3);
    }, 0),
  );
}

function assertRuntimeContract(
  root: THREE.Group,
  family: string,
  sourceFolder: "hanging" | "ambient",
  maximumTriangles: number,
): void {
  const runtime = root.userData.sculptRuntime as SculptRuntime;
  const meshes = meshesOf(root);
  expect(runtime.family).toBe(family);
  expect(runtime.sourceImage.replaceAll("\\", "/")).toContain(
    `/model-references-v2/${sourceFolder}/${family}-three-view.png`,
  );
  expect(runtime.specification.replaceAll("\\", "/")).toContain(`/${family}/spec.json`);
  expect(runtime.approximation).toContain("procedural low-poly reconstruction");
  expect(Object.keys(runtime.nodes).length).toBeGreaterThan(0);
  expect(Object.keys(runtime.sockets).length).toBeGreaterThan(0);
  expect(runtime.collider.type.length).toBeGreaterThan(0);
  expect(runtime.collider.size.every((axis) => axis > 0)).toBe(true);
  expect(Object.keys(runtime.destructionGroups).length).toBeGreaterThan(0);
  expect(meshes.length).toBeGreaterThan(0);
  for (const mesh of meshes) {
    expect(mesh.name.length).toBeGreaterThan(0);
    expect(typeof mesh.userData.partId).toBe("string");
    expect((mesh.userData.partId as string).length).toBeGreaterThan(0);
    expect(mesh.geometry.getAttribute("normal")).toBeDefined();
  }
  expect(runtime.geometry.triangles).toBe(triangleCount(root));
  expect(runtime.geometry.triangles).toBeLessThanOrEqual(maximumTriangles);
  expect(runtime.geometry.maxTriangles).toBe(maximumTriangles);
  expect(runtime.geometry.targetTriangles).toBeLessThanOrEqual(maximumTriangles);
  expect(runtime.geometry.materialBatches).toBeLessThanOrEqual(4);
  expect(runtime.geometry.mergeStrategy).toContain("shared DungeonMaterial");

  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  expect(size.x).toBeGreaterThan(0.05);
  expect(size.y).toBeGreaterThan(0.05);
  expect(size.z).toBeGreaterThan(0.03);

  const batches = createStaticPropTemplateBatches(root);
  expect(batches).toHaveLength(runtime.geometry.materialBatches);
  expect(batches.length).toBeLessThanOrEqual(4);
  batches.forEach((batch) => batch.geometry.dispose());
}

describe("image-sculpted hanging model set v2", () => {
  test("registers every accepted hanging identity", () => {
    for (const family of ACCEPTED_HANGING) {
      expect(IMAGE_SCULPTED_HANGING_FAMILIES).toContain(family);
    }
  });

  test("meets geometry, hierarchy, collider and batching contracts", () => {
    const materials = createDungeonMaterials();
    for (const family of ACCEPTED_HANGING) {
      const root = createImageSculptedHanging(family, materials, 2.4, 0);
      const maximumTriangles = family === "hanging-chain" ? 700 : 3000;
      assertRuntimeContract(root, family, "hanging", maximumTriangles);
      expect(root.userData.sculptRuntime.origin).toBe("ceiling-mount");
      expect(new THREE.Box3().setFromObject(root).max.y).toBeLessThanOrEqual(0.08);
    }
  });

  test("preserves the counted identity parts from the accepted views", () => {
    const materials = createDungeonMaterials();
    const expectedCounts: ReadonlyArray<readonly [ImageSculptedHangingFamily, string, number]> = [
      ["iron-cage", "Cage vertical bar", 7],
      ["tattered-banner", "Tattered oxblood cloth panel", 1],
      ["meat-hooks", "Round curved forged meat hook", 3],
      ["bone-mobile", "Twisted bone mobile rope strand", 5],
      ["bone-mobile", "Distinct hanging long bone", 4],
      ["root-cluster", "Angular crossing crown root", 5],
      ["root-cluster", "Joined bifurcated hanging root", 3],
      ["root-cluster", "Attached moss clump", 3],
      ["hanging-chain", "Alternating rectangular forged chain link", 6],
      ["hanging-vine", "Attached vine tendril", 3],
      ["hanging-vine", "Pointed low-poly vine leaf", 3],
    ];
    for (const [family, name, count] of expectedCounts) {
      const root = createImageSculptedHanging(family, materials, 2.4, 0);
      expect(root.getObjectsByProperty("name", name)).toHaveLength(count);
    }

    const banner = createImageSculptedHanging("tattered-banner", materials, 2.4, 0);
    const cloth = (banner.getObjectByName("Tattered oxblood cloth panel") as THREE.Mesh).geometry;
    expect(cloth).not.toBeInstanceOf(THREE.PlaneGeometry);
    expect(cloth.boundingBox!.max.z - cloth.boundingBox!.min.z).toBeGreaterThan(0.08);
    expect(cloth.userData.sideCutCount).toBe(2);
    const vine = createImageSculptedHanging("hanging-vine", materials, 2.4, 0);
    expect(
      (vine.getObjectByName("Pointed low-poly vine leaf") as THREE.Mesh).geometry,
    ).toBeInstanceOf(THREE.ExtrudeGeometry);
  });

  test("keeps the cage and banner load paths physically continuous", () => {
    const materials = createDungeonMaterials();
    const cage = createImageSculptedHanging("iron-cage", materials, 2.4, 0);
    const cageLinks = cage.getObjectsByProperty(
      "name",
      "Alternating oval chain link",
    ) as THREE.Mesh[];
    const cageEye = cage.getObjectByName("Cage roof hanger eye")!;
    const cageBrace = cage.getObjectByName("Cage load-bearing roof brace")!;
    expect(worldBounds(cageLinks.at(-1)!).intersectsBox(worldBounds(cageEye))).toBe(true);
    expect(worldBounds(cageEye).intersectsBox(worldBounds(cageBrace))).toBe(true);

    const banner = createImageSculptedHanging("tattered-banner", materials, 2.4, 0);
    const links = banner.getObjectsByProperty(
      "name",
      "Alternating oval chain link",
    ) as THREE.Mesh[];
    const eyes = banner.getObjectsByProperty("name", "Banner rod suspension eye") as THREE.Mesh[];
    const straps = banner.getObjectsByProperty(
      "name",
      "Banner cloth retaining strap",
    ) as THREE.Mesh[];
    const rod = banner.getObjectByName("Weathered banner cross rod")!;
    const cloth = banner.getObjectByName("Tattered oxblood cloth panel") as THREE.Mesh;
    expect(links).toHaveLength(4);
    expect(eyes).toHaveLength(2);
    expect(straps).toHaveLength(2);
    for (const [index, eye] of eyes.entries()) {
      expect(worldBounds(links[index * 2 + 1]!).intersectsBox(worldBounds(eye))).toBe(true);
      expect(worldBounds(eye).intersectsBox(worldBounds(rod))).toBe(true);
      expect(worldBounds(straps[index]!).intersectsBox(worldBounds(rod))).toBe(true);
      expect(worldBounds(straps[index]!).intersectsBox(worldBounds(cloth))).toBe(true);
    }
    const hemProfile = cloth.geometry.userData.hemProfile as number[];
    const tearTips = hemProfile.filter(
      (depth, index) =>
        index > 0 &&
        index < hemProfile.length - 1 &&
        depth > hemProfile[index - 1]! &&
        depth > hemProfile[index + 1]!,
    );
    expect(cloth.geometry.userData.tearCount).toBe(4);
    expect(cloth.geometry.userData.sideCutCount).toBe(2);
    expect(cloth.geometry.userData.sideCutDepths).toEqual([0.082, 0.068]);
    expect(cloth.geometry.userData.uvStrategy).toBe("continuous-front-back-no-center-mirror");
    expect(new Set(cloth.geometry.userData.tailDepths as number[]).size).toBe(4);
    expect(tearTips).toHaveLength(4);
    expect(new Set(tearTips).size).toBe(4);
  });

  test("sculpts the meat load as an asymmetric heavy haunch with a rear longitudinal UV seam", () => {
    const materials = createDungeonMaterials();
    const hooks = createImageSculptedHanging("meat-hooks", materials, 2.4, 0);
    const meat = hooks.getObjectByName("Low-poly cured meat haunch") as THREE.Mesh;
    const profile = meat.geometry.userData.haunchProfile as Array<{
      y: number;
      x: number;
      radiusX: number;
      radiusZ: number;
    }>;
    const uv = meat.geometry.getAttribute("uv");

    expect(meat.geometry).not.toBeInstanceOf(THREE.SphereGeometry);
    expect(meat.geometry.userData.uvStrategy).toBe("single-rear-longitudinal-seam-clamp");
    expect(meat.geometry.userData.heavyLobeRing).toBe(8);
    expect(meat.geometry.userData.radialSegments).toBe(12);
    expect(meat.geometry.userData.longitudinalFiberAxis).toBe("v");
    expect(profile).toHaveLength(13);
    expect(profile[8]!.radiusX).toBeGreaterThan(profile[3]!.radiusX * 2.3);
    expect(profile[0]!.radiusX).toBeLessThan(profile[8]!.radiusX * 0.16);
    expect(Math.max(...profile.map(({ radiusX }) => radiusX)) * 2).toBeLessThan(0.3);
    expect(new Set(profile.map(({ x }) => x)).size).toBe(profile.length);
    for (let index = 0; index < uv.count; index += 1) {
      expect(uv.getX(index)).toBeGreaterThanOrEqual(0.019);
      expect(uv.getX(index)).toBeLessThanOrEqual(0.981);
      expect(uv.getY(index)).toBeGreaterThanOrEqual(0.019);
      expect(uv.getY(index)).toBeLessThanOrEqual(0.981);
    }
  });
});

describe("image-sculpted ambient model set v2", () => {
  test("registers every accepted ground and ceiling identity", () => {
    expect(IMAGE_SCULPTED_AMBIENT_KINDS).toEqual(ACCEPTED_AMBIENT);
  });

  test("meets geometry, hierarchy, collider and batching contracts", () => {
    const materials = createDungeonMaterials();
    for (const kind of ACCEPTED_AMBIENT) {
      const root = createImageSculptedAmbient(kind, materials, 0);
      assertRuntimeContract(root, kind, "ambient", 1200);
      expect(root.userData.sculptRuntime.origin).toBe(
        kind === "icicle" ? "ceiling-contact" : "ground-contact",
      );
    }
  });

  test("preserves the counted identity parts from the accepted views", () => {
    const materials = createDungeonMaterials();
    const expectedCounts: ReadonlyArray<readonly [ImageSculptedAmbientKind, string, number]> = [
      ["bone-pile", "Merged pile of fourteen varied long bones", 1],
      ["bone-pile", "Faceted volumetric skull vault", 1],
      ["rubble-pile", "Rubble stone", 6],
      ["rock-cluster", "Cluster main rock", 3],
      ["rock-cluster", "Loose cluster pebble", 6],
      ["icicle", "Bent tapered main icicle", 1],
      ["icicle", "Short satellite icicle", 2],
      ["ice-shard", "Tall asymmetric ice crystal", 1],
      ["ice-shard", "Satellite ice crystal", 2],
      ["ice-shard", "Octagonal crystal socket plinth", 1],
      ["ice-shard", "Faceted crystal plinth facing stone", 4],
      ["ice-shard", "Socket reinforcement strap", 2],
      ["ice-shard", "Strap bolt", 4],
      ["ground-root-tangle", "Long irregular crossing ground root", 6],
      ["ground-root-tangle", "Joined low bifurcated root", 3],
      ["ground-root-tangle", "Low woody root junction knot", 3],
      ["ground-debris", "Dark low flat stone fragment", 6],
    ];
    for (const [kind, name, count] of expectedCounts) {
      const root = createImageSculptedAmbient(kind, materials, 0);
      expect(root.getObjectsByProperty("name", name)).toHaveLength(count);
    }
  });

  test("keeps roots closed and tapered, debris separated, and ice facets readable", () => {
    const materials = createDungeonMaterials();

    const roots = createImageSculptedAmbient("ground-root-tangle", materials, 0);
    const primaryRoots = roots.getObjectsByProperty(
      "name",
      "Long irregular crossing ground root",
    ) as THREE.Mesh[];
    expect(primaryRoots).toHaveLength(6);
    const startRadii = new Set<number>();
    const endRadii = new Set<number>();
    for (const primaryRoot of primaryRoots) {
      expect(primaryRoot.userData.closedByGeometryCap).toBe(true);
      expect(primaryRoot.geometry.getAttribute("uv")).toBeDefined();
      expect(primaryRoot.geometry.index).toBeDefined();
      startRadii.add(primaryRoot.userData.startRadius as number);
      endRadii.add(primaryRoot.userData.endRadius as number);
    }
    expect(startRadii.size).toBe(6);
    expect(endRadii.size).toBe(6);
    const branches = roots.getObjectsByProperty(
      "name",
      "Joined low bifurcated root",
    ) as THREE.Mesh[];
    expect(branches).toHaveLength(3);
    for (const branch of branches) {
      expect(Array.isArray(branch.userData.attachedTo)).toBe(true);
      expect(branch.userData.closedByGeometryCap).toBe(true);
      const bounds = new THREE.Box3().setFromObject(branch);
      expect(bounds.max.y).toBeLessThan(0.19);
      expect(bounds.min.y).toBeLessThan(0.05);
    }
    const rootBounds = new THREE.Box3().setFromObject(roots).getSize(new THREE.Vector3());
    expect(rootBounds.x).toBeGreaterThan(1.1);
    expect(rootBounds.z).toBeGreaterThan(1.1);
    expect(rootBounds.y).toBeGreaterThan(0.22);

    const debris = createImageSculptedAmbient("ground-debris", materials, 0);
    expect(debris.getObjectByName("Broad cracked debris slab")).toBeUndefined();
    expect(debris.getObjectByName("Upright masonry wedge")).toBeUndefined();
    const stones = debris.getObjectsByProperty(
      "name",
      "Dark low flat stone fragment",
    ) as THREE.Mesh[];
    expect(stones).toHaveLength(6);
    for (const stone of stones) {
      const size = new THREE.Box3().setFromObject(stone).getSize(new THREE.Vector3());
      expect(stone.material).toBe(materials.darkStone);
      expect(size.x).toBeLessThan(0.5);
      expect(size.y).toBeLessThan(0.1);
      expect(size.z).toBeLessThan(0.5);
    }
    for (let index = 0; index < stones.length; index += 1) {
      for (let other = index + 1; other < stones.length; other += 1) {
        const planarDistance = new THREE.Vector2(
          stones[index]!.position.x - stones[other]!.position.x,
          stones[index]!.position.z - stones[other]!.position.z,
        ).length();
        expect(planarDistance).toBeGreaterThan(0.1);
      }
    }

    const ice = createImageSculptedAmbient("ice-shard", materials, 0);
    const crystalMeshes = [
      ice.getObjectByName("Tall asymmetric ice crystal") as THREE.Mesh,
      ...(ice.getObjectsByProperty("name", "Satellite ice crystal") as THREE.Mesh[]),
    ];
    for (const crystal of crystalMeshes) {
      expect(crystal.geometry.index).toBeNull();
      const positions = crystal.geometry.getAttribute("position");
      const normals = crystal.geometry.getAttribute("normal");
      const uvs = crystal.geometry.getAttribute("uv");
      expect(normals.count).toBe(positions.count);
      expect(uvs.count).toBe(positions.count);
      let maxUv = 0;
      for (let index = 0; index < uvs.count; index += 1) {
        maxUv = Math.max(maxUv, uvs.getX(index), uvs.getY(index));
      }
      expect(maxUv).toBeGreaterThan(1);
      expect(maxUv).toBeLessThanOrEqual(1.25);
      for (let triangle = 0; triangle < positions.count; triangle += 3) {
        const normalA = new THREE.Vector3().fromBufferAttribute(normals, triangle);
        const normalB = new THREE.Vector3().fromBufferAttribute(normals, triangle + 1);
        const normalC = new THREE.Vector3().fromBufferAttribute(normals, triangle + 2);
        expect(normalA.distanceTo(normalB)).toBeLessThan(1e-6);
        expect(normalA.distanceTo(normalC)).toBeLessThan(1e-6);
      }
    }
    const straps = ice.getObjectsByProperty("name", "Socket reinforcement strap") as THREE.Mesh[];
    expect((ice.getObjectByName("Octagonal crystal socket plinth") as THREE.Mesh).material).toBe(
      materials.darkStone,
    );
    for (const facing of ice.getObjectsByProperty(
      "name",
      "Faceted crystal plinth facing stone",
    ) as THREE.Mesh[]) {
      expect(facing.material).toBe(materials.darkStone);
      expect(Math.hypot(facing.position.x, facing.position.z)).toBeLessThan(0.48);
    }
    for (const strap of straps) {
      expect(strap.material).toBe(materials.iron);
      expect(Math.hypot(strap.position.x, strap.position.z)).toBeLessThan(0.46);
      const strapHeight = new THREE.Box3().setFromObject(strap).getSize(new THREE.Vector3()).y;
      expect(strapHeight).toBeLessThan(0.24);
    }
  });
});

describe("image-sculpted hanging chain form", () => {
  test("uses six overlapping lean loops with alternating readable orientations", () => {
    const chain = createImageSculptedHanging("hanging-chain", createDungeonMaterials(), 2.4, 0);
    const links = chain.getObjectsByProperty(
      "name",
      "Alternating rectangular forged chain link",
    ) as THREE.Mesh[];
    expect(links).toHaveLength(6);
    expect(chain.getObjectByName("Blackened iron ceiling plate")).toBeDefined();
    expect(chain.getObjectByName("Heavy round open chain hook")).toBeDefined();
    expect(chain.getObjectByName("Heavy forged mount neck")).toBeDefined();
    // Weld collars were dropped for PERF-36; silhouette stays in the links.
    expect(chain.getObjectsByProperty("name", "Forged link weld collar")).toHaveLength(0);
    expect(chain.userData.sculptRuntime.geometry.triangles).toBeLessThanOrEqual(600);
    for (let index = 0; index < links.length; index += 1) {
      const link = links[index]!;
      expect(link.geometry).toBeInstanceOf(THREE.ExtrudeGeometry);
      expect(link.geometry.userData.linkProfile).toBe("rectangular-lean");
      expect(link.userData.interlocked).toBe(true);
      expect(link.userData.chainOrientation).toBe(index % 2 === 0 ? "front" : "cross");
      const size = new THREE.Box3().setFromObject(link).getSize(new THREE.Vector3());
      expect(size.x).toBeGreaterThan(0.045);
      expect(size.z).toBeGreaterThan(0.045);
      if (index === 0) continue;
      const previousBounds = new THREE.Box3().setFromObject(links[index - 1]!);
      const currentBounds = new THREE.Box3().setFromObject(link);
      const verticalOverlap =
        Math.min(previousBounds.max.y, currentBounds.max.y) -
        Math.max(previousBounds.min.y, currentBounds.min.y);
      expect(verticalOverlap).toBeGreaterThan(0.015);
    }
  });

  test("keeps finite UVs on every repaired PBR mesh", () => {
    const materials = createDungeonMaterials();
    const repaired = [
      createImageSculptedHanging("hanging-chain", materials, 2.4, 0),
      createImageSculptedAmbient("ground-root-tangle", materials, 0),
      createImageSculptedAmbient("ground-debris", materials, 0),
      createImageSculptedAmbient("ice-shard", materials, 0),
    ];
    for (const root of repaired) {
      for (const part of meshesOf(root)) {
        const uvs = part.geometry.getAttribute("uv");
        expect(uvs).toBeDefined();
        expect(uvs.count).toBeGreaterThan(2);
        for (let index = 0; index < uvs.count; index += 1) {
          expect(Number.isFinite(uvs.getX(index))).toBe(true);
          expect(Number.isFinite(uvs.getY(index))).toBe(true);
        }
      }
    }
  });
});
