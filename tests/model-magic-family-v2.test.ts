import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createForgeProp } from "../src/world/ForgePropFactory";
import {
  createLuminousWardStone,
  createResolveFlask,
  createTimeFreezeRelic,
} from "../src/world/ItemFactory";
import { createMagicStone, magicStoneIds } from "../src/world/MagicStoneKit";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  return meshes;
}

function triangleCount(root: THREE.Object3D): number {
  return Math.round(
    meshesOf(root).reduce((total, part) => {
      const positions = part.geometry.getAttribute("position");
      return total + (part.geometry.index ? part.geometry.index.count / 3 : positions.count / 3);
    }, 0),
  );
}

function boundsSize(root: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
}

function countNamed(root: THREE.Object3D, name: string): number {
  let count = 0;
  root.traverse((object) => {
    if (object.name === name) count += 1;
  });
  return count;
}

function materialCount(root: THREE.Object3D): number {
  const materials = new Set<THREE.Material>();
  for (const part of meshesOf(root)) {
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
      materials.add(material);
    }
  }
  return materials.size;
}

function maxVertexDistanceToSurface(detail: THREE.Mesh, surface: THREE.Mesh): number {
  detail.updateWorldMatrix(true, false);
  surface.updateWorldMatrix(true, false);
  const surfacePosition = surface.geometry.getAttribute("position");
  const surfaceIndex = surface.geometry.index;
  const triangles: THREE.Triangle[] = [];
  const vertex = (index: number): THREE.Vector3 =>
    new THREE.Vector3()
      .fromBufferAttribute(surfacePosition, index)
      .applyMatrix4(surface.matrixWorld);
  const indexCount = surfaceIndex?.count ?? surfacePosition.count;
  for (let offset = 0; offset < indexCount; offset += 3) {
    triangles.push(
      new THREE.Triangle(
        vertex(surfaceIndex?.getX(offset) ?? offset),
        vertex(surfaceIndex?.getX(offset + 1) ?? offset + 1),
        vertex(surfaceIndex?.getX(offset + 2) ?? offset + 2),
      ),
    );
  }

  const detailPosition = detail.geometry.getAttribute("position");
  const point = new THREE.Vector3();
  const closest = new THREE.Vector3();
  let maximum = 0;
  for (let index = 0; index < detailPosition.count; index += 1) {
    point.fromBufferAttribute(detailPosition, index).applyMatrix4(detail.matrixWorld);
    let minimum = Number.POSITIVE_INFINITY;
    for (const triangle of triangles) {
      triangle.closestPointToPoint(point, closest);
      minimum = Math.min(minimum, point.distanceTo(closest));
    }
    maximum = Math.max(maximum, minimum);
  }
  return maximum;
}

function expectFiniteUv(part: THREE.Mesh): void {
  const uv = part.geometry.getAttribute("uv");
  expect(uv).toBeDefined();
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < uv.count; index += 1) {
    const u = uv.getX(index);
    const v = uv.getY(index);
    expect(Number.isFinite(u)).toBe(true);
    expect(Number.isFinite(v)).toBe(true);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  expect(maxU - minU).toBeGreaterThan(0.01);
  expect(maxV - minV).toBeGreaterThan(0.01);
}

function expectUsefulUv(part: THREE.Mesh): void {
  const uv = part.geometry.getAttribute("uv");
  expect(uv).toBeDefined();
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < uv.count; index += 1) {
    const u = uv.getX(index);
    const v = uv.getY(index);
    expect(Number.isFinite(u)).toBe(true);
    expect(Number.isFinite(v)).toBe(true);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  expect(minU).toBeGreaterThanOrEqual(0);
  expect(maxU).toBeLessThanOrEqual(1);
  expect(minV).toBeGreaterThanOrEqual(0);
  expect(maxV).toBeLessThanOrEqual(1);
  expect(maxU - minU).toBeGreaterThan(0.4);
  expect(maxV - minV).toBeGreaterThan(0.8);
  expect(uv.count % 3).toBe(0);
  for (let triangle = 0; triangle < uv.count; triangle += 3) {
    const u0 = uv.getX(triangle);
    const v0 = uv.getY(triangle);
    const u1 = uv.getX(triangle + 1);
    const v1 = uv.getY(triangle + 1);
    const u2 = uv.getX(triangle + 2);
    const v2 = uv.getY(triangle + 2);
    const doubledArea = Math.abs((u1 - u0) * (v2 - v0) - (v1 - v0) * (u2 - u0));
    expect(doubledArea).toBeGreaterThan(1e-8);
  }
}

describe("image-sculpted magic family v2", () => {
  test("resolve flask keeps a closed vessel inside an eight-rib cage", () => {
    const materials = createDungeonMaterials({ compact: true });
    const flask = createResolveFlask(materials);
    const size = boundsSize(flask);
    const bounds = new THREE.Box3().setFromObject(flask);
    const bottle = flask.getObjectByName("Faceted flask glass") as THREE.Mesh;
    const liquid = flask.getObjectByName("Resolve flask liquid") as THREE.Mesh;
    const lowerCollar = flask.getObjectByName(
      "Resolve flask lower iron bottle collar",
    ) as THREE.Mesh;
    const upperCollar = flask.getObjectByName(
      "Resolve flask bolted upper iron collar",
    ) as THREE.Mesh;
    const ribs = flask.getObjectByName("Resolve flask eight-rib iron cage") as THREE.Mesh;
    const bolts = flask.getObjectByName("Resolve flask upper collar bolts") as THREE.Mesh;
    const shield = flask.getObjectByName("Raised resolve quartered shield") as THREE.Mesh;
    const shieldLine = flask.getObjectByName("Resolve shield vertical quarter line") as THREE.Mesh;
    const shieldRivets = flask.getObjectByName("Resolve shield four iron rivets") as THREE.Mesh;
    const leftLoop = flask.getObjectByName("Left resolve flask open side loop") as THREE.Mesh;
    const stopper = flask.getObjectByName("Resolve flask broad ringed wood stopper") as THREE.Mesh;
    const halo = flask.getObjectByName("Resolve pickup halo") as THREE.Mesh;
    const solidMeshes = meshesOf(flask).filter((part) => !part.userData.vfxOnly);
    const solidMaterials = new Set<THREE.Material>();
    for (const part of solidMeshes) {
      for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
        solidMaterials.add(material);
      }
    }

    expect(flask.userData.reference).toContain("model-references-v2/magic/resolve-flask");
    expect(flask.userData.detailInventory).toContain("eight-rib radial iron cage");
    expect(bottle.geometry.userData).toMatchObject({
      closedProfile: true,
      radialSegments: 12,
      profileEndpointsOnAxis: true,
    });
    expect(liquid.userData.closedProfile).toBe(true);
    expect(ribs.userData).toMatchObject({
      instanceCount: 8,
      segmentsPerRib: 4,
      crossSection: "flat rectangular strap",
    });
    expect(bolts.userData.instanceCount).toBe(8);
    expect(lowerCollar).toBeDefined();
    expect(upperCollar).toBeDefined();
    expect(shield).toBeDefined();
    expect(shieldRivets.userData.instanceCount).toBe(4);
    expect(flask.getObjectByName("Left resolve flask open side loop")).toBeDefined();
    expect(flask.getObjectByName("Right resolve flask open side loop")).toBeDefined();
    expect(leftLoop.userData.opening).toBe("square through-hole");
    expect(leftLoop.rotation.y).toBe(0);
    expect(stopper.userData).toMatchObject({ ringCount: 3, closedProfile: true });
    expect(halo.userData.vfxOnly).toBe(true);
    expect(halo.castShadow).toBe(false);

    // Iron cage, collars, bolts, shield seams, and loops share one tailored
    // PBR material. The stopper and shield keep their shared wood/brass maps.
    expect(lowerCollar.material).toBe(ribs.material);
    expect(upperCollar.material).toBe(ribs.material);
    expect(bolts.material).toBe(ribs.material);
    expect(shieldLine.material).toBe(ribs.material);
    expect(shieldRivets.material).toBe(ribs.material);
    expect(leftLoop.material).toBe(ribs.material);
    expect((stopper.material as THREE.MeshStandardMaterial).map).toBe(materials.wood.map);
    expect((shield.material as THREE.MeshStandardMaterial).map).toBe(materials.brass.map);
    for (const material of solidMaterials) {
      if (!(material instanceof THREE.MeshStandardMaterial) || !material.map) continue;
      expect(material.roughnessMap).not.toBe(material.map);
      expect(material.normalMap).not.toBe(material.map);
      expect(material.aoMap).not.toBe(material.map);
    }
    for (const part of solidMeshes) expectFiniteUv(part);

    expect(size.y).toBeGreaterThan(0.8);
    expect(size.x).toBeGreaterThan(0.7);
    expect(size.x / size.y).toBeGreaterThan(0.85);
    expect(size.x / size.y).toBeLessThan(1.05);
    expect(size.z / size.x).toBeGreaterThan(0.75);
    expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001);
    expect(triangleCount(flask)).toBeLessThanOrEqual(3_000);
    expect(meshesOf(flask)).toHaveLength(14);
    expect(meshesOf(flask).length).toBeLessThanOrEqual(20);
    expect(solidMaterials.size).toBeLessThanOrEqual(6);
    expect(materialCount(flask)).toBeLessThanOrEqual(6);
    expect(flask.userData.sculptRuntime.sockets.pickup).toBeInstanceOf(THREE.Object3D);
    expect(flask.userData.sculptRuntime.sockets.glow).toBeInstanceOf(THREE.Object3D);
    expect(flask.userData.sculptRuntime.pivots.stopper).toBeInstanceOf(THREE.Object3D);
    expect(flask.userData.sculptRuntime.pivots.shield).toBeInstanceOf(THREE.Object3D);
    expect(flask.userData.sculptRuntime.colliders).toEqual([
      { type: "sphere", radius: 0.47, offset: [0, 0.48, 0], isTrigger: true },
    ]);
    expect(flask.userData.sculptRuntime.destructionGroups).toMatchObject({
      vessel: expect.any(THREE.Object3D),
      restraint: expect.any(THREE.Object3D),
      stopper: expect.any(THREE.Object3D),
      heraldry: expect.any(THREE.Object3D),
    });
  });

  test("time relic reads as a tall four-post iron frame with a faceted core", () => {
    const materials = createDungeonMaterials({ compact: true });
    const relic = createTimeFreezeRelic(materials);
    const size = boundsSize(relic);
    const core = relic.getObjectByName("Time freeze frozen core") as THREE.Mesh;
    const leftRail = relic.getObjectByName("Time freeze left rail") as THREE.Mesh;
    const topCap = relic.getObjectByName("Time freeze top cap") as THREE.Mesh;
    const topBezel = relic.getObjectByName("Time freeze raised brass top bezel") as THREE.Mesh;
    const iron = leftRail.material as THREE.MeshStandardMaterial;
    const brass = topBezel.material as THREE.MeshStandardMaterial;
    const postSockets = relic.getObjectByName(
      "Time freeze eight reinforced post socket blocks",
    ) as THREE.Mesh;

    expect(relic.userData.reference).toContain("model-references-v2/magic/time-freeze-relic");
    expect(relic.getObjectByName("Time freeze rear left rail")).toBeDefined();
    expect(relic.getObjectByName("Time freeze rear right rail")).toBeDefined();
    expect(relic.getObjectByName("Time freeze front rune bar")).toBeDefined();
    expect(relic.getObjectByName("Time freeze rear rune bar")).toBeDefined();
    expect(relic.getObjectByName("Time freeze eight cap bolts")).toBeDefined();
    expect(relic.getObjectByName("Time freeze recessed top socket inset")).toBeDefined();
    expect(relic.getObjectByName("Time freeze raised brass top bezel")).toBeDefined();
    const runes = relic.getObjectByName("Time freeze eight flush rune strokes") as THREE.Mesh;
    expect(runes).toBeDefined();
    expect(runes.userData.inlay).toMatchObject({
      strokeCount: 8,
      maximumRelief: 0.0065,
      flush: true,
    });
    expect(relic.getObjectByName("Time freeze minute hand")).toBeUndefined();
    expect(relic.getObjectByName("Time freeze four rune branch strokes")).toBeUndefined();
    expect(relic.getObjectByName("Time freeze front rune bar")?.userData.coreSightline).toEqual({
      openGap: [0.555, 0.935],
      clear: true,
    });
    expect(postSockets.userData).toMatchObject({
      instanceCount: 8,
      connection: "four rails joined to both cap assemblies",
    });
    expect(iron).not.toBe(materials.iron);
    expect(iron.map).toBe(materials.iron.map);
    expect(iron.normalMap).toBe(materials.iron.normalMap);
    expect(iron.roughnessMap).toBe(materials.iron.roughnessMap);
    expect(iron.emissiveMap).toBeNull();
    expect(iron.roughness).toBeGreaterThanOrEqual(0.68);
    expect(iron.roughness).toBeLessThanOrEqual(0.78);
    expect(iron.metalness).toBeGreaterThanOrEqual(0.7);
    expect(iron.envMapIntensity).toBeLessThanOrEqual(0.82);
    expect(iron.userData.finish).toBe("dominant dark rough iron with restrained cool edges");
    expect(topCap.material).toBe(iron);
    expect(postSockets.material).toBe(iron);
    expect(brass).not.toBe(materials.brass);
    expect(brass.map).toBe(materials.brass.map);
    expect(brass.normalMap).toBe(materials.brass.normalMap);
    expect(brass.roughnessMap).toBe(materials.brass.roughnessMap);
    expect(brass.emissiveMap).toBeNull();
    expect(brass.color.r).toBeGreaterThan(brass.color.b);
    expect(brass.roughness).toBeLessThanOrEqual(0.64);
    expect(brass.metalness).toBeGreaterThanOrEqual(0.64);
    expect(brass.envMapIntensity).toBeLessThanOrEqual(0.94);
    expect(brass.userData.finish).toBe("small aged brass accent hardware");
    expect(core.geometry.type).toBe("OctahedronGeometry");
    expect(boundsSize(core).x).toBeGreaterThanOrEqual(0.65);
    expect(size.y / size.x).toBeGreaterThan(1.6);
    expect(triangleCount(relic)).toBeLessThanOrEqual(1_800);
    expect(relic.userData.sculptRuntime.destructionGroups.frame).toBeDefined();
  });

  test("ward uses an asymmetric faceted mineral core, anchored veins, and eight plinth runes", () => {
    const materials = createDungeonMaterials({ compact: true });
    const ward = createLuminousWardStone(materials);
    const crystal = ward.getObjectByName("Luminous ward faceted crystal") as THREE.Mesh;
    const material = crystal.material as THREE.MeshPhysicalMaterial;
    const stopper = ward.getObjectByName("Luminous ward faceted stopper") as THREE.Mesh;
    const collar = ward.getObjectByName("Luminous ward bolted neck collar") as THREE.Mesh;
    const veins = ward.getObjectByName(
      "Luminous ward three irregular gold facet inlays",
    ) as THREE.Mesh;
    const crystalSize = boundsSize(crystal);
    const position = crystal.geometry.getAttribute("position");
    const middleRingRadii = new Set<number>();
    for (let index = 0; index < position.count; index += 1) {
      if (Math.abs(position.getY(index) - 0.2) > 1e-4) continue;
      middleRingRadii.add(
        Number(Math.hypot(position.getX(index), position.getZ(index)).toFixed(3)),
      );
    }

    expect(ward.userData.reference).toContain("model-references-v2/magic/luminous-ward");
    expect(crystal.geometry.type).toBe("BufferGeometry");
    expect(crystal.geometry.userData.wardCore).toMatchObject({
      ringCount: 7,
      segmentCount: 8,
      profile: "asymmetric mineral loft",
    });
    expect(middleRingRadii.size).toBeGreaterThanOrEqual(6);
    expect(crystalSize.x / crystalSize.y).toBeGreaterThan(1.05);
    expect(material.color.r).toBeGreaterThan(0.55);
    expect(material.color.r).toBeGreaterThan(material.color.g);
    expect(material.color.g).toBeGreaterThan(material.color.b);
    expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(material.roughness).toBeGreaterThanOrEqual(0.44);
    expect(material.roughness).toBeLessThanOrEqual(0.6);
    expect(material.metalness).toBe(0);
    expect(material.envMapIntensity).toBeGreaterThanOrEqual(0.7);
    expect(material.transmission).toBe(0);
    expect(material.thickness).toBe(0);
    expect(material.emissiveIntensity).toBeGreaterThanOrEqual(0.4);
    expect(material.userData.materialRole).toBe("luminous-ward-gold");
    expect(material.map?.name).toContain("luminous-ward-gold");
    expect(material.normalMap).toBeNull();
    expect(material.roughnessMap).toBeNull();
    expectUsefulUv(crystal);
    expect(
      ward.getObjectByName("Luminous ward three irregular gold facet inlays")?.userData,
    ).toMatchObject({
      instanceCount: 3,
      layout: "asymmetric",
      frontAnchorAngle: 0.04,
      frontBranchCount: 2,
    });
    expect(veins.userData.surfaceAttachment).toEqual({
      target: "Luminous ward faceted crystal",
      centerOffset: 0.002,
      tubeRadius: 0.014,
      embeddedDepth: 0.012,
    });
    expect(maxVertexDistanceToSurface(veins, crystal)).toBeLessThanOrEqual(0.04);
    expect(collar.userData).toMatchObject({
      boltCount: 6,
      attachment: { coreOverlap: 0.04, stopperOverlap: 0.01, wrapsNeck: true },
    });
    const coreBounds = new THREE.Box3().setFromObject(crystal);
    const collarBounds = new THREE.Box3().setFromObject(collar);
    const stopperBounds = new THREE.Box3().setFromObject(stopper);
    expect(stopper.geometry.userData.wardStopper).toMatchObject({
      ringCount: 3,
      segmentCount: 7,
      profile: "short asymmetric mineral cap",
      closedProfile: true,
    });
    expect(coreBounds.max.y - collarBounds.min.y).toBeGreaterThanOrEqual(0.035);
    expect(collarBounds.max.y - stopperBounds.min.y).toBeGreaterThanOrEqual(0.005);
    expect(stopperBounds.getSize(new THREE.Vector3()).y).toBeLessThanOrEqual(0.19);
    expect(ward.getObjectByName("Luminous ward six guard posts")).toBeDefined();
    expect(ward.getObjectByName("Luminous ward eight rune plaques")?.userData.instanceCount).toBe(
      8,
    );
    expect(ward.getObjectByName("Luminous ward eight rune strokes")?.userData.instanceCount).toBe(
      8,
    );
    expect(materialCount(ward)).toBeLessThanOrEqual(6);
    expect(triangleCount(ward)).toBeLessThanOrEqual(2_800);
  });

  test("each magic stone has its own loft profile with bounded draw calls", () => {
    const materials = createDungeonMaterials({ compact: true });
    const signatures = new Set<string>();
    const cageSignatures = new Set<number>();
    const pedestalSignatures = new Set<number>();

    for (const stoneId of magicStoneIds()) {
      const visual = createMagicStone(stoneId, materials);
      const rootMeshes = visual.root.children.filter(
        (object): object is THREE.Mesh => object instanceof THREE.Mesh,
      );
      const core = visual.root.getObjectByName(`${stoneId} crystal core`) as THREE.Mesh;
      const shardCluster = visual.root.getObjectByName(
        `${stoneId} crystal shard cluster`,
      ) as THREE.Mesh;
      const cage = visual.root.getObjectByName(`${stoneId} iron cage ring`) as THREE.Mesh;
      const pedestal = visual.root.getObjectByName(`${stoneId} stone pedestal`) as THREE.Mesh;
      const runeSystem = visual.root.getObjectByName(`${stoneId} rim rune ring`) as THREE.Mesh;
      const coreBounds = boundsSize(core);
      const positionCount = core.geometry.getAttribute("position").count;
      cageSignatures.add(cage.geometry.getAttribute("position").count);
      pedestalSignatures.add(pedestal.geometry.getAttribute("position").count);
      signatures.add(
        [
          positionCount,
          coreBounds.x.toFixed(2),
          coreBounds.y.toFixed(2),
          coreBounds.z.toFixed(2),
        ].join(":"),
      );

      expect(visual.root.userData.reference.image).toContain(
        `/model-references-v2/magic/${stoneId}-stone-three-view.png`,
      );
      expect(visual.root.userData.detailInventory).toHaveLength(4);
      expect(visual.root.getObjectByName(`${stoneId} iron cage ring`)).toBeDefined();
      expect(visual.root.getObjectByName(`${stoneId} stone pedestal`)).toBeDefined();
      expect(visual.root.getObjectByName(`${stoneId} pickup socket`)).toBeDefined();
      expect(runeSystem.userData.pattern).toBe(`${stoneId} front plinth rune system`);
      expect(rootMeshes).toHaveLength(7);
      expect(rootMeshes.filter((part) => part.userData.compactPreviewOptional)).toHaveLength(4);
      expect(triangleCount(visual.root)).toBeLessThanOrEqual(1_800);
      expect(materialCount(visual.root)).toBeLessThanOrEqual(6);
      expect((core.material as THREE.MeshStandardMaterial).map).toBe(materials.crystal.map);
      expectUsefulUv(core);
      expectUsefulUv(shardCluster);
    }

    expect(signatures.size).toBe(4);
    expect(cageSignatures.size).toBe(4);
    expect(pedestalSignatures.size).toBeGreaterThanOrEqual(2);
  });

  test("boss and shrine crystals use separate silhouettes and action anchors", () => {
    const materials = createDungeonMaterials({ compact: true });
    const boss = createForgeProp({ kind: "bossCrystal", x: 0, y: 0 }, materials)!;
    const shrine = createForgeProp({ kind: "shrineCrystal", x: 0, y: 0 }, materials)!;
    const bossCore = boss.getObjectByName("Boss crystal tall asymmetric blood core") as THREE.Mesh;
    const shrineLeft = shrine.getObjectByName(
      "Shrine crystal left forked gold prong",
    ) as THREE.Mesh;
    const shrineRight = shrine.getObjectByName(
      "Shrine crystal right forked gold prong",
    ) as THREE.Mesh;

    expect(boss.userData.reference).toContain("model-references-v2/magic/boss-crystal");
    expect(shrine.userData.reference).toContain("model-references-v2/magic/shrine-crystal");
    expect(bossCore).toBeDefined();
    expect(boss.getObjectByName("Boss crystal left faceted shoulder lobe")).toBeDefined();
    expect(boss.getObjectByName("Boss crystal right faceted shoulder lobe")).toBeDefined();
    expect(boss.getObjectByName("Boss crystal raised front blood chip")).toBeDefined();
    expect(boss.getObjectByName("Boss crystal visible inner depth core")).toBeDefined();
    expect(boss.getObjectByName("Boss crystal front crown rune")).toBeDefined();
    expect(shrine.getObjectByName("Shrine crystal joined faceted gold body")).toBeDefined();
    expect(shrineLeft).toBeDefined();
    expect(shrineRight).toBeDefined();
    expect(shrine.getObjectByName("Shrine crystal left low gold satellite")).toBeDefined();
    expect(shrine.getObjectByName("Shrine crystal right low gold satellite")).toBeDefined();
    expect(shrine.getObjectByName("Shrine crystal carved front diamond rune")).toBeDefined();
    expect((bossCore.material as THREE.MeshStandardMaterial).color.r).toBeGreaterThan(
      (bossCore.material as THREE.MeshStandardMaterial).color.g * 2,
    );
    expect(bossCore.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    const bossCrystalMaterial = bossCore.material as THREE.MeshPhysicalMaterial;
    expect(bossCrystalMaterial.transmission).toBe(0.22);
    expect(bossCrystalMaterial.thickness).toBe(0.72);
    expect(bossCrystalMaterial.clearcoat).toBe(0.34);
    expect(boss.userData.sculptRuntime.opticalDepth).toEqual({
      transmission: 0.22,
      thickness: 0.72,
      innerGlowOpacity: 0.34,
    });
    expect((shrineLeft.material as THREE.MeshStandardMaterial).color.r).toBeGreaterThan(
      (shrineLeft.material as THREE.MeshStandardMaterial).color.b * 2,
    );
    for (const name of [
      "Boss crystal tall asymmetric blood core",
      "Boss crystal left faceted shoulder lobe",
      "Boss crystal right faceted shoulder lobe",
      "Boss crystal raised front blood chip",
    ]) {
      expectUsefulUv(boss.getObjectByName(name) as THREE.Mesh);
    }
    for (const name of [
      "Shrine crystal joined faceted gold body",
      "Shrine crystal left forked gold prong",
      "Shrine crystal right forked gold prong",
      "Shrine crystal left low gold satellite",
      "Shrine crystal right low gold satellite",
    ]) {
      expectUsefulUv(shrine.getObjectByName(name) as THREE.Mesh);
    }
    expect(countNamed(boss, "Boss crystal heavy radial iron brace")).toBe(4);
    expect(
      (boss.getObjectByName("Boss crystal broad iron support feet") as THREE.InstancedMesh).count,
    ).toBe(4);
    expect(
      (boss.getObjectByName("Boss crystal restraint rivets") as THREE.InstancedMesh).count,
    ).toBe(4);
    expect(
      (boss.getObjectByName("Boss crystal four thick upper clamp jaws") as THREE.InstancedMesh)
        .count,
    ).toBe(4);
    const bossMiddlePlinth = boss.getObjectByName(
      "Boss crystal broken middle plinth",
    ) as THREE.Mesh;
    const bossMiddleMaterial = bossMiddlePlinth.material as THREE.MeshStandardMaterial;
    expect(bossMiddleMaterial.color.getHex()).toBe(0x7c747b);
    expect(bossMiddleMaterial.emissiveIntensity).toBe(0.085);
    const bossSeat = boss.getObjectByName("Boss crystal recessed iron seat") as THREE.Mesh;
    const bossSeatMaterial = bossSeat.material as THREE.MeshStandardMaterial;
    expect(bossSeatMaterial.metalness).toBeGreaterThan(0.65);
    expect(bossSeatMaterial.emissiveIntensity).toBe(0.115);
    expect(boss.userData.sculptRuntime.localIndirectFill).toEqual({
      loadBearingStone: 0.095,
      dressedStone: 0.085,
      blackenedIron: 0.115,
    });
    expect(countNamed(shrine, "Shrine crystal inclined ceremonial brace")).toBe(4);
    expect(
      (shrine.getObjectByName("Shrine crystal ceremonial support feet") as THREE.InstancedMesh)
        .count,
    ).toBe(4);
    expect(
      (shrine.getObjectByName("Shrine crystal ceremonial restraint rivets") as THREE.InstancedMesh)
        .count,
    ).toBe(4);
    expect(boss.getObjectByName("Boss crystal interaction socket")).toBeDefined();
    expect(shrine.getObjectByName("Shrine crystal vfx socket")).toBeDefined();
    expect(boundsSize(boss).y).toBeGreaterThan(boundsSize(shrine).y);
    expect(triangleCount(boss)).toBeGreaterThan(300);
    expect(triangleCount(shrine)).toBeGreaterThan(300);
    expect(triangleCount(boss)).toBeLessThanOrEqual(2_200);
    expect(triangleCount(shrine)).toBeLessThanOrEqual(2_200);
    expect(materialCount(boss)).toBeLessThanOrEqual(6);
    expect(materialCount(shrine)).toBeLessThanOrEqual(6);
    expect(meshesOf(boss).length).toBeLessThanOrEqual(20);
    expect(meshesOf(shrine).length).toBeLessThanOrEqual(20);
  });
});
