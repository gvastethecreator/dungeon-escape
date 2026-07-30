import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createBiomeMagicPortal } from "../src/world/MagicPortalKit";
import { createDungeonProp } from "../src/world/DungeonPropKit";
import { createForgeProp } from "../src/world/ForgePropFactory";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createReliquaryAltar } from "../src/world/ReliquaryAltar";
import {
  createSpecialRoomSignal,
  type SpecialRoomSignalIdentity,
} from "../src/world/SpecialRoomSignalKit";

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
}

function countNamed(root: THREE.Object3D, name: string): number {
  let count = 0;
  root.traverse((child) => {
    if (child.name === name) count += 1;
  });
  return count;
}

function boundsSize(root: THREE.Object3D): THREE.Vector3 {
  return new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
}

function maxAbsXInZBand(
  root: THREE.Object3D,
  material: THREE.Material,
  minZ: number,
  maxZ: number,
) {
  let maximum = 0;
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.material !== material) return;
    const position = object.geometry.getAttribute("position");
    const point = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld);
      if (point.z >= minZ && point.z <= maxZ) maximum = Math.max(maximum, Math.abs(point.x));
    }
  });
  return maximum;
}

function triangleCount(root: THREE.Object3D): number {
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = object.geometry.getAttribute("position");
    triangles += (object.geometry.index?.count ?? position.count) / 3;
  });
  return Math.round(triangles);
}

describe("image-sculpted architecture family v2", () => {
  test("room signals use closed stone relief and separate restrained luminous insets", () => {
    const materials = createDungeonMaterials({ compact: true });
    const identities: SpecialRoomSignalIdentity[] = [
      "grave",
      "treasure",
      "elite",
      "shrine",
      "boss",
    ];
    for (const identity of identities) {
      const signal = createSpecialRoomSignal(identity, materials);
      const meshes = collectMeshes(signal);
      expect(meshes).toHaveLength(2);
      expect(signal.userData.sculptRuntime.drawCalls).toBe(2);
      expect(signal.userData.collider.type).toBe("cylinder");
      expect(signal.userData.reference).toContain("model-references-v2/architecture");

      const stone = meshes.find((mesh) => mesh.name.includes("carved stone"));
      const inlay = meshes.find((mesh) => mesh.name.includes("emissive inset"));
      expect(stone).toBeDefined();
      expect(inlay).toBeDefined();
      expect((stone!.material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(0);
      expect((inlay!.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeLessThanOrEqual(
        1.15,
      );
      expect((inlay!.material as THREE.MeshStandardMaterial).map).toBe(materials.iron.map);
      expect(boundsSize(signal).y).toBeGreaterThan(0.12);
    }

    const shrine = createSpecialRoomSignal("shrine", materials);
    const boss = createSpecialRoomSignal("boss", materials);
    expect(shrine.userData.detailInventory).toContain("6 raised node housings");
    expect(boss.userData.detailInventory).toContain("8 raised node housings");
    expect(boss.userData.detailInventory).toContain("carved inner ring");
    expect(boundsSize(boss).x).toBeGreaterThan(boundsSize(shrine).x);
  });

  test("pillar and grave carry readable relief on every visible side", () => {
    const materials = createDungeonMaterials({ compact: true });
    const pillar = createForgeProp({ kind: "pillar", x: 0, y: 0 }, materials)!;
    const grave = createForgeProp({ kind: "grave", x: 0, y: 0 }, materials)!;

    const flutes = pillar.getObjectByName("Pillar recessed vertical flute") as THREE.InstancedMesh;
    const diamonds = pillar.getObjectByName(
      "Pillar continuous double-diamond frieze relief",
    ) as THREE.InstancedMesh;
    expect(flutes.count).toBe(8);
    expect(diamonds.count).toBe(32);
    expect(collectMeshes(pillar)).toHaveLength(4);
    expect(
      pillar.getObjectByName("Pillar seamless stepped octagonal shell")?.userData.planarCapUvs,
    ).toBe(true);
    const pillarShell = pillar.getObjectByName(
      "Pillar seamless stepped octagonal shell",
    ) as THREE.Mesh;
    const shellPositions = pillarShell.geometry.getAttribute("position");
    const shellNormals = pillarShell.geometry.getAttribute("normal");
    const shellUvs = pillarShell.geometry.getAttribute("uv");
    const maximumY = pillarShell.geometry.boundingBox!.max.y;
    const topCapNormalY: number[] = [];
    const topCapU: number[] = [];
    const topCapV: number[] = [];
    for (let vertex = 0; vertex < shellPositions.count; vertex += 3) {
      const triangleYs = [0, 1, 2].map((offset) => shellPositions.getY(vertex + offset));
      if (!triangleYs.every((value) => Math.abs(value - maximumY) < 1e-5)) continue;
      for (let offset = 0; offset < 3; offset += 1) {
        topCapNormalY.push(shellNormals.getY(vertex + offset));
        topCapU.push(shellUvs.getX(vertex + offset));
        topCapV.push(shellUvs.getY(vertex + offset));
      }
    }
    expect(topCapNormalY).toHaveLength(24);
    expect(topCapNormalY.every((value) => value > 0.999)).toBe(true);
    expect(Math.max(...topCapU) - Math.min(...topCapU)).toBeLessThan(0.38);
    expect(Math.max(...topCapV) - Math.min(...topCapV)).toBeLessThan(0.38);
    expect(Math.floor(Math.min(...topCapU) * 2.3)).toBe(Math.floor(Math.max(...topCapU) * 2.3));
    expect(Math.floor(Math.min(...topCapV) * 2.3)).toBe(Math.floor(Math.max(...topCapV) * 2.3));
    expect(pillar.userData.sculptRuntime.localContrast).toMatchObject({
      structuralStoneValueLift: 0.07,
      carvedReliefValueLift: 0.018,
      geometricFriezeValueLift: 0.085,
      raisedMotifValueLift: 0.14,
    });
    expect(pillar.userData.detailInventory).toContain("eight recessed shaft flutes");
    expect(pillar.userData.detailInventory).toContain(
      "two continuous octagonal double-diamond friezes",
    );
    expect(boundsSize(pillar).y).toBeGreaterThan(2.6);
    expect(boundsSize(pillar).x).toBeCloseTo(boundsSize(pillar).z, 1);

    const graveRivets = grave.getObjectByName("Grave iron cross rivet") as THREE.InstancedMesh;
    const graveCross = grave.getObjectByName("Grave raised pointed iron cross sigil")!;
    expect(graveRivets.count).toBe(3);
    expect(graveCross.position.z).toBeGreaterThan(0.12);
    expect(graveCross.userData.surfaceClearance).toBeLessThan(0.01);
    const rearChannels = grave.getObjectByName("Grave rear paired carved channels");
    expect(rearChannels?.children).toHaveLength(2);
    expect(countNamed(grave, "Grave rear pointed carved channel")).toBe(2);
    expect(grave.getObjectByName("Damaged thick gothic grave slab")).toBeDefined();
    expect(grave.getObjectByName("Grave one-piece broken thick base")).toBeDefined();
    expect(grave.getObjectByName("Grave gothic inset edge frame")).toBeDefined();
    expect(grave.getObjectByName("Grave recessed central cross carving")).toBeDefined();
    expect(grave.userData.sculptRuntime.topology).toContain("two-sided carved relief");
    expect(grave.userData.sculptRuntime.localContrast).toEqual({
      slabValueLift: 0.026,
      edgeValueLift: 0.02,
      slabIndirectFill: 0.026,
    });
    expect(grave.userData.detailInventory).toContain(
      "damaged low-poly gothic slab with large contour chips",
    );
    expect(grave.userData.detailInventory).toContain(
      "one thick broken and chamfered stone base",
    );
    expect(boundsSize(grave).y).toBeGreaterThan(1.8);
    expect(boundsSize(grave).z).toBeGreaterThanOrEqual(0.5);
  });

  test("coffin has complete sides, continuous straps, and a real lid pivot", () => {
    const materials = createDungeonMaterials({ compact: true });
    const coffin = createDungeonProp("coffin", materials, 1);
    const lid = coffin.getObjectByName("Coffin long-edge lid hinge");
    expect(lid?.userData.socket).toMatchObject({ type: "hinge", axis: [0, 0, 1] });
    expect(coffin.userData.collider.type).toBe("compound");
    expect(coffin.userData.detailInventory).toContain("Coffin long side raised panel");
    expect(coffin.userData.detailInventory).toContain("Coffin continuous side strap drop");
    expect(coffin.userData.detailInventory).toContain("Coffin raised sloped lid panel");
    expect(coffin.getObjectByName("Coffin loot socket")?.userData.socket.type).toBe("loot");
    expect(coffin.getObjectByName("Coffin interaction socket")?.userData.socket.type).toBe(
      "interaction",
    );
    const size = boundsSize(coffin);
    expect(size.x).toBeGreaterThan(1.1);
    expect(size.y).toBeGreaterThan(0.75);
    expect(size.z).toBeGreaterThan(2.2);
    expect(coffin.userData.mergedDrawCalls).toBeLessThanOrEqual(8);
    expect(triangleCount(coffin)).toBeLessThanOrEqual(1_800);
    expect(coffin.userData.sculptRuntime.materialRoles).toEqual([
      "darkStone",
      "stone",
      "sharedMetalVertexColor",
    ]);
    expect(
      new Set(
        collectMeshes(coffin).flatMap((part) =>
          Array.isArray(part.material) ? part.material : [part.material],
        ),
      ).size,
    ).toBeLessThanOrEqual(3);

    const body = coffin.getObjectByName("Coffin closed faceted body assembly")!;
    const centerHalfWidth = maxAbsXInZBand(body, materials.darkStone, -0.65, 0.65);
    const footHalfWidth = maxAbsXInZBand(body, materials.darkStone, 1.08, 1.2);
    const headHalfWidth = maxAbsXInZBand(body, materials.darkStone, -1.2, -1.08);
    expect(centerHalfWidth).toBeGreaterThan(0.54);
    expect(footHalfWidth).toBeLessThan(centerHalfWidth * 0.78);
    expect(headHalfWidth).toBeLessThan(centerHalfWidth * 0.82);
    expect(coffin.userData.sculptRuntime.silhouette.plan).toBe("eight-sided coffin");
    expect(coffin.userData.sculptRuntime.uvTileSize).toBeGreaterThanOrEqual(1.1);

    const strapAttachment = lid!.userData.strapAttachment as {
      count: number;
      realization: string;
      continuousGeometry: boolean;
      crossSectionPoints: number;
      crownY: number;
      lowerEdgeY: number;
    };
    expect(strapAttachment.count).toBe(3);
    expect(strapAttachment.realization).toContain("one fitted inverted-u extrusion");
    expect(strapAttachment.continuousGeometry).toBe(true);
    expect(strapAttachment.crossSectionPoints).toBe(16);
    expect(strapAttachment.crownY).toBeGreaterThan(0.39);
    expect(strapAttachment.lowerEdgeY).toBeLessThanOrEqual(0);

    const metalBatch = collectMeshes(lid!).find((part) => {
      const material = part.material as THREE.MeshStandardMaterial;
      return material.vertexColors && material.name.includes("shared iron");
    });
    expect(metalBatch).toBeDefined();
    const metalMaterial = metalBatch!.material as THREE.MeshStandardMaterial;
    expect(metalMaterial.metalness).toBeGreaterThanOrEqual(0.68);
    expect(metalMaterial.roughness).toBeGreaterThanOrEqual(0.5);
    expect(metalMaterial.envMapIntensity).toBeGreaterThanOrEqual(0.7);
    const metalColors = metalBatch!.geometry.getAttribute("color");
    const colorSignatures = new Set<string>();
    for (let index = 0; index < metalColors.count; index += 1) {
      colorSignatures.add(
        [metalColors.getX(index), metalColors.getY(index), metalColors.getZ(index)]
          .map((value) => value.toFixed(3))
          .join(":"),
      );
    }
    expect(colorSignatures.size).toBe(2);
    expect(
      Array.from({ length: metalColors.count }, (_, index) => metalColors.getX(index)).some(
        (red) => red > 0.7,
      ),
    ).toBe(true);

    for (const part of collectMeshes(coffin)) {
      const uv = part.geometry.getAttribute("uv");
      expect(uv).toBeDefined();
      expect(
        Array.from({ length: uv.count }, (_, index) => uv.getX(index)).every(Number.isFinite),
      ).toBe(true);
      expect(
        Array.from({ length: uv.count }, (_, index) => uv.getY(index)).every(Number.isFinite),
      ).toBe(true);
    }
  });

  test("reliquary keeps front actions and authored rear construction", () => {
    const materials = createDungeonMaterials({ compact: true });
    const altar = createReliquaryAltar(materials);
    expect(altar.getObjectByName("Left reliquary door hinge")?.userData.socket.type).toBe("hinge");
    expect(altar.getObjectByName("Right reliquary door hinge")?.userData.socket.type).toBe("hinge");
    expect(altar.getObjectByName("Reliquary niche relic socket")?.userData.socket.type).toBe(
      "relic",
    );
    expect(altar.getObjectByName("Iron rivet repetition system")?.children).toHaveLength(6);
    expect(altar.userData.detailInventory).toContain(
      "four rear oak boards with crossed iron braces",
    );
    expect(altar.userData.detailInventory).toContain(
      "paired capped side towers with front iron stiles",
    );
    expect(altar.userData.detailInventory).toContain("front and rear sloped gable brace systems");
    expect(altar.userData.sculptRuntime.staticDrawCalls).toBeLessThanOrEqual(5);
    expect(altar.userData.sculptRuntime.localContrast).toMatchObject({
      stoneValueLift: 0.045,
      ironValueLift: 0.145,
      brassValueLift: 0.125,
      nicheFrontRecess: 0.295,
    });
    const nicheSocket = altar.getObjectByName("Reliquary niche relic socket")!;
    expect(nicheSocket.userData.nicheClearance).toEqual({
      backFrontZ: 0.105,
      frameFrontZ: 0.4,
      depth: 0.295,
    });
    expect(nicheSocket.userData.nicheClearance.frameFrontZ).toBeGreaterThan(
      nicheSocket.userData.nicheClearance.backFrontZ + 0.25,
    );
    const size = boundsSize(altar);
    expect(size.x).toBeGreaterThan(2.8);
    expect(size.y).toBeGreaterThan(2.7);
    expect(size.y).toBeLessThan(3.1);
    expect(size.x / size.y).toBeGreaterThan(0.9);
    expect(size.z).toBeGreaterThan(1.1);
    expect(altar.userData.sculptRuntime.proportions).toEqual({
      staticWidthScale: 1.22,
      staticHeightScale: 0.9,
      staticDepthScale: 1.08,
    });
  });

  test("ancient portal keeps PBR frame mass while glow stays an inset", () => {
    const materials = createDungeonMaterials({ compact: true });
    const portal = createBiomeMagicPortal("ancient", materials);
    expect(portal.root.userData.asset).toBe("entrance-portal-gate");
    expect(portal.root.userData.collider.type).toBe("compound");
    expect(countNamed(portal.frame, "Ancient rune voussoir 1")).toBe(1);
    expect(
      portal.frame.userData.runtimeBatching.sourceGeometryTypes.includes("ExtrudeGeometry"),
    ).toBe(true);
    expect(portal.frame.userData.runtimeBatching.drawCalls).toBe(4);
    expect(countNamed(portal.frame, "Ancient upper footing collar")).toBe(2);
    expect(countNamed(portal.frame, "Ancient faceted cap slab")).toBe(2);
    expect(countNamed(portal.frame, "Ancient pyramidal pillar cap")).toBe(2);
    expect(countNamed(portal.frame, "Ancient low gate threshold plinth")).toBe(1);
    const portalSize = boundsSize(portal.root);
    expect(portalSize.x / portalSize.y).toBeGreaterThan(0.85);
    expect(portal.root.userData.detailInventory).toContain(
      "paired low plinth steps and upper footing collars",
    );
    const accents = collectMeshes(portal.frame)
      .map((mesh) => mesh.material)
      .filter(
        (material): material is THREE.MeshStandardMaterial =>
          material instanceof THREE.MeshStandardMaterial && material.name.includes("accent"),
      );
    expect(accents.length).toBeGreaterThan(0);
    expect(accents.every((material) => material.emissiveIntensity <= 0.18)).toBe(true);
    const frameMaterial = collectMeshes(portal.frame)
      .map((mesh) => mesh.material)
      .find(
        (material): material is THREE.MeshStandardMaterial =>
          material instanceof THREE.MeshStandardMaterial &&
          material.name.includes("frame material"),
      );
    expect(frameMaterial?.map).toBe(materials.stone.map);
    const reliefMaterial = collectMeshes(portal.frame)
      .map((mesh) => mesh.material)
      .find(
        (material): material is THREE.MeshStandardMaterial =>
          material instanceof THREE.MeshStandardMaterial &&
          material.name === "ancient portal locally lifted stone relief",
      );
    expect(reliefMaterial?.map).toBe(materials.stone.map);
    expect(reliefMaterial?.normalMap).toBe(materials.stone.normalMap);
    expect(reliefMaterial?.roughnessMap).toBe(materials.stone.roughnessMap);
    expect(reliefMaterial?.userData.portalRelief).toMatchObject({
      localValueLift: 0.075,
      localIndirectFill: 0.095,
    });
    expect(reliefMaterial?.emissiveIntensity).toBe(0.095);
    expect(portal.trim.material.map).toBe(materials.iron.map);
  });
});
