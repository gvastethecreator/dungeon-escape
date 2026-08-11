import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createDungeonProp } from "../src/world/DungeonPropKit";
import { createForgeChest } from "../src/world/ForgePropFactory";
import { createImageSculptedClutter } from "../src/world/ImageSculptedClutterKit";
import { createImageSculptedProp } from "../src/world/ImageSculptedPropKit";
import { createDungeonMaterials, type DungeonMaterials } from "../src/world/MaterialLibrary";
import { createStaticPropTemplateBatches } from "../src/world/StaticDungeonScene";

const IDS = [
  "table",
  "bench",
  "chair",
  "bookshelf",
  "lectern",
  "barrel",
  "crate",
  "urn",
  "weapon-rack",
  "high-chair",
  "ritual-table",
  "ossuary-cabinet",
  "treasure-chest",
] as const;

type CarpentryId = (typeof IDS)[number];

interface SculptRuntime {
  sourceImage: string;
  specification: string;
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Array<{ size: number[]; offset: number[] }>;
  destructionGroups: Record<string, string[]>;
  performance: {
    triangles: number;
    trianglesPerInstance: number;
    sourceMeshes: number;
    materialBatches: number;
    maxTriangles: number;
    maxMaterialBatches: number;
  };
  assembly: { explodable: boolean; clickable: boolean; partIdentity: string };
  grounding?: {
    axis: "y";
    sourceMinY: number;
    targetMinY: number;
    appliedOffset: number;
  };
}

function build(id: CarpentryId, materials: DungeonMaterials): THREE.Group {
  if (
    id === "table" ||
    id === "bench" ||
    id === "chair" ||
    id === "bookshelf" ||
    id === "lectern"
  ) {
    return createDungeonProp(id, materials, 0);
  }
  if (id === "barrel") return createImageSculptedClutter("barrels", materials, 0);
  if (id === "crate") return createImageSculptedClutter("crates", materials, 0);
  if (id === "urn") return createDungeonProp("urns", materials, 0);
  if (id === "weapon-rack") return createImageSculptedClutter("weapon-rack", materials, 0);
  if (id === "high-chair") return createImageSculptedProp("high-chair", materials);
  if (id === "ritual-table") return createImageSculptedProp("ritual-table", materials);
  if (id === "ossuary-cabinet") return createImageSculptedProp("ossuary-cabinet", materials);
  return createForgeChest(materials).root;
}

function runtimeOf(model: THREE.Group): SculptRuntime {
  return model.userData.sculptRuntime as SculptRuntime;
}

describe("carpentry model reconstruction v2", () => {
  test("links every runtime model to its accepted three-view sheet and sculpt spec", () => {
    const materials = createDungeonMaterials({ compact: true });
    for (const id of IDS) {
      const runtime = runtimeOf(build(id, materials));
      expect(runtime.sourceImage).toBe(
        `assets-source/imagegen/model-references-v2/carpentry/${id}-three-view.png`,
      );
      expect(runtime.specification).toBe(
        `.scratch/img2threejs/model-references-v2/carpentry/${id}/spec.json`,
      );
    }
  });

  test("keeps named part identity, colliders and assembly data on all source meshes", () => {
    const materials = createDungeonMaterials({ compact: true });
    for (const id of IDS) {
      const model = build(id, materials);
      const runtime = runtimeOf(model);
      const meshes: THREE.Mesh[] = [];
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) meshes.push(object);
      });

      if (id === "crate") {
        expect(meshes.length).toBe(3);
      } else {
        expect(meshes.length).toBeGreaterThan(5);
      }
      expect(Object.keys(runtime.meshes)).toHaveLength(meshes.length);
      expect(Object.keys(runtime.nodes).length).toBeGreaterThan(1);
      expect(Object.keys(runtime.destructionGroups).length).toBeGreaterThan(0);
      expect(runtime.colliders).toHaveLength(1);
      expect(runtime.colliders[0]!.size.every((value) => Number.isFinite(value) && value > 0)).toBe(
        true,
      );
      expect(runtime.assembly).toMatchObject({ explodable: true, clickable: true });
      expect(runtime.assembly.partIdentity).toContain("sculptPartId");
      expect(model.userData.detailInventory).toHaveLength(meshes.length);
      for (const item of meshes) {
        expect(item.name.length).toBeGreaterThan(0);
        expect(typeof item.userData.sculptPartId).toBe("string");
        expect(item.userData.sculptPartId.length).toBeGreaterThan(0);
        expect(item.geometry.getAttribute("position")?.count ?? 0).toBeGreaterThan(0);
      }
    }
  });

  test("stays inside the low-poly and shared-material budgets", () => {
    const materials = createDungeonMaterials({ compact: true });
    for (const id of IDS) {
      const runtime = runtimeOf(build(id, materials));
      expect(runtime.performance.trianglesPerInstance).toBeLessThanOrEqual(
        runtime.performance.maxTriangles,
      );
      expect(runtime.performance.materialBatches).toBeLessThanOrEqual(
        runtime.performance.maxMaterialBatches,
      );
      if (id === "crate") {
        expect(runtime.performance.sourceMeshes).toBe(3);
      } else {
        expect(runtime.performance.sourceMeshes).toBeGreaterThan(5);
      }
      expect(runtime.performance.triangles).toBeGreaterThan(100);
    }
  });

  test("preserves the reference-defining silhouette and hardware details", () => {
    const materials = createDungeonMaterials({ compact: true });
    const details: Record<CarpentryId, readonly string[]> = {
      table: ["Table top plank 1", "Table long lower stretcher"],
      bench: ["Front bench seat plank", "Bench long lower stretcher"],
      chair: ["Chair open back slat", "Chair carved crest rail"],
      bookshelf: ["Bookshelf rear upper diagonal brace", "Bookshelf distinct codex 1"],
      lectern: ["Angled lectern desk", "Lectern brass ring pull"],
      barrel: ["Barrel 1 tapered stave 16", "Barrel 1 recessed octagonal bung"],
      crate: ["Crate 1 front diagonal brace ascending", "Crate 1 rear diagonal brace"],
      urn: [
        "Urn 1 domed ceramic lid and finial",
        "Urn 1 left open ring handle",
        "Urn 1 stepped ceramic pedestal foot",
      ],
      "weapon-rack": [
        "Weapon rack long rear diagonal brace",
        "Upper weapon rack four-open-slot U rail",
      ],
      "high-chair": ["High chair arched plank back panel", "High chair segmented iron crown"],
      "ritual-table": ["Ritual table inset sigil ring", "Ritual table iron foot cuff"],
      "ossuary-cabinet": ["Ossuary segmented iron arch crown", "Ossuary forged lock plate"],
      "treasure-chest": ["Chest arched lid stave 9", "Chest brass side ring"],
    };

    for (const id of IDS) {
      const model = build(id, materials);
      for (const detail of details[id]) expect(model.getObjectByName(detail)).toBeDefined();
    }
  });

  test("builds the bookshelf as a deep closed case with divided side walls", () => {
    const materials = createDungeonMaterials({ compact: true });
    const bookshelf = build("bookshelf", materials);
    const fullBounds = new THREE.Box3().setFromObject(bookshelf);
    expect(fullBounds.getSize(new THREE.Vector3()).z).toBeGreaterThan(0.56);
    expect(bookshelf.getObjectByName("Bookshelf thick inner crown rail")).toBeDefined();
    expect(bookshelf.getObjectByName("Bookshelf rear lower diagonal brace")).toBeDefined();
    expect(bookshelf.getObjectByName("Bookshelf rear upper diagonal brace")).toBeDefined();

    for (const side of ["Left", "Right"] as const) {
      const planks = [1, 2, 3].map(
        (index) =>
          bookshelf.getObjectByName(`${side} bookshelf side wall plank ${index}`) as THREE.Mesh,
      );
      expect(planks.every(Boolean)).toBe(true);
      const bounds = planks
        .map((plank) => new THREE.Box3().setFromObject(plank))
        .sort((left, right) => left.min.z - right.min.z);
      const wallBounds = bounds.reduce((result, item) => result.union(item), new THREE.Box3());
      const wallSize = wallBounds.getSize(new THREE.Vector3());
      expect(wallSize.y).toBeGreaterThan(2);
      expect(wallSize.z).toBeGreaterThan(0.43);
      for (let index = 1; index < bounds.length; index += 1) {
        expect(bounds[index]!.min.z - bounds[index - 1]!.max.z).toBeLessThanOrEqual(0.01);
      }
    }

    const shelves: THREE.Mesh[] = [];
    const sideBands: THREE.Mesh[] = [];
    const shelfEdgeBands: THREE.Mesh[] = [];
    bookshelf.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.name === "Bookshelf projecting shelf nose") shelves.push(object);
      if (object.name.endsWith("bookshelf side iron band")) sideBands.push(object);
      if (object.name === "Bookshelf iron shelf edge band") shelfEdgeBands.push(object);
    });
    expect(shelves).toHaveLength(4);
    expect(shelfEdgeBands).toHaveLength(4);
    for (const shelf of shelves) {
      const size = new THREE.Box3().setFromObject(shelf).getSize(new THREE.Vector3());
      expect(size.y).toBeGreaterThan(0.09);
      expect(size.z).toBeGreaterThan(0.48);
    }
    expect(sideBands).toHaveLength(8);
    const leftStile = bookshelf.getObjectByName("Left bookshelf outer stile");
    const rightStile = bookshelf.getObjectByName("Right bookshelf outer stile");
    expect(leftStile).toBeDefined();
    expect(rightStile).toBeDefined();
    const leftStileBounds = new THREE.Box3().setFromObject(leftStile!);
    const rightStileBounds = new THREE.Box3().setFromObject(rightStile!);
    for (const band of sideBands) {
      const bounds = new THREE.Box3().setFromObject(band);
      if (band.name.startsWith("Left")) {
        expect(bounds.min.x).toBeLessThan(leftStileBounds.min.x - 0.005);
      } else {
        expect(bounds.max.x).toBeGreaterThan(rightStileBounds.max.x + 0.005);
      }
    }
    expect(bookshelf.getObjectByName("Bookshelf side band rivet system")?.children).toHaveLength(
      12,
    );

    const lowerBrace = bookshelf.getObjectByName(
      "Bookshelf rear lower diagonal brace",
    ) as THREE.Mesh;
    const upperBrace = bookshelf.getObjectByName(
      "Bookshelf rear upper diagonal brace",
    ) as THREE.Mesh;
    lowerBrace.geometry.computeBoundingBox();
    const braceGeometrySize = lowerBrace.geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(braceGeometrySize.x).toBeGreaterThanOrEqual(0.15);
    expect(braceGeometrySize.z).toBeGreaterThanOrEqual(0.1);
    const rearBraces = bookshelf.getObjectByName("Bookshelf rear diagonal braces")!;
    expect(rearBraces.userData.attachment).toMatchObject({
      sharedJoint: [0.7, 1.34, -0.285],
      rearOffset: 0.03,
      braceWidth: 0.16,
      braceDepth: 0.11,
    });
    const backPlank = bookshelf.getObjectByName("Bookshelf recessed back plank 4")!;
    const backBounds = new THREE.Box3().setFromObject(backPlank);
    for (const brace of [lowerBrace, upperBrace]) {
      const braceBounds = new THREE.Box3().setFromObject(brace);
      expect(braceBounds.max.z).toBeLessThanOrEqual(backBounds.min.z + 0.006);
      expect(braceBounds.max.z).toBeGreaterThanOrEqual(backBounds.min.z - 0.01);
    }

    const codices: THREE.Mesh[] = [];
    bookshelf.traverse((object) => {
      if (object instanceof THREE.Mesh && object.name.startsWith("Bookshelf distinct codex ")) {
        codices.push(object);
      }
    });
    expect(codices).toHaveLength(11);
    const codexMaterial = codices[0]!.material as THREE.MeshStandardMaterial;
    const recessedWoodMaterial = (
      bookshelf.getObjectByName("Bookshelf recessed back plank 4") as THREE.Mesh
    ).material as THREE.MeshStandardMaterial;
    const shellWoodMaterial = (
      bookshelf.getObjectByName("Left bookshelf outer stile") as THREE.Mesh
    ).material as THREE.MeshStandardMaterial;
    const shelfIronMaterial = (
      bookshelf.getObjectByName("Left bookshelf side iron band") as THREE.Mesh
    ).material as THREE.MeshStandardMaterial;
    expect(recessedWoodMaterial).not.toBe(materials.wood);
    expect(shellWoodMaterial).not.toBe(materials.wood);
    expect(recessedWoodMaterial).not.toBe(shellWoodMaterial);
    expect(recessedWoodMaterial.map).toBe(materials.wood.map);
    expect(recessedWoodMaterial.normalMap).toBe(materials.wood.normalMap);
    expect(recessedWoodMaterial.roughnessMap).toBe(materials.wood.roughnessMap);
    expect(recessedWoodMaterial.emissiveMap).toBe(recessedWoodMaterial.map);
    expect(recessedWoodMaterial.userData).toMatchObject({
      localValueScale: 0.52,
      localIndirectFill: 0.014,
      indirectFillSource: "albedo map",
      finish: "matte recessed dark oak",
      biomeSafe: true,
    });
    expect(shellWoodMaterial.userData).toMatchObject({
      localValueScale: 0.84,
      localIndirectFill: 0.032,
      indirectFillSource: "albedo map",
      finish: "dark aged oak with visible grain relief",
      biomeSafe: true,
    });
    expect(shellWoodMaterial.emissiveMap).toBe(shellWoodMaterial.map);
    expect(
      shellWoodMaterial.color.r + shellWoodMaterial.color.g + shellWoodMaterial.color.b,
    ).toBeLessThan(materials.wood.color.r + materials.wood.color.g + materials.wood.color.b);
    expect(
      shellWoodMaterial.color.r + shellWoodMaterial.color.g + shellWoodMaterial.color.b,
    ).toBeGreaterThan(
      (recessedWoodMaterial.color.r + recessedWoodMaterial.color.g + recessedWoodMaterial.color.b) *
        1.25,
    );
    expect(recessedWoodMaterial.roughness).toBeGreaterThanOrEqual(shellWoodMaterial.roughness);
    expect(shelfIronMaterial).not.toBe(materials.iron);
    expect(shelfIronMaterial.map).toBe(materials.iron.map);
    expect(shelfIronMaterial.normalMap).toBe(materials.iron.normalMap);
    expect(shelfIronMaterial.emissiveMap).toBeNull();
    expect(shelfIronMaterial.metalness).toBeGreaterThanOrEqual(0.62);
    expect(shelfIronMaterial.envMapIntensity).toBeGreaterThanOrEqual(1.38);
    expect(codexMaterial).not.toBe(materials.cloth);
    expect(codexMaterial.map).toBe(materials.cloth.map);
    expect(codexMaterial.normalMap).toBe(materials.cloth.normalMap);
    expect(codexMaterial.roughnessMap).toBe(materials.cloth.roughnessMap);
    expect(codexMaterial.emissiveMap).toBeNull();
    expect(codexMaterial.vertexColors).toBe(true);
    expect(codexMaterial.userData).toMatchObject({
      palette: "burgundy, olive, slate, umber, muted violet",
      colorSource: "per-book vertex color",
      biomeSafe: true,
    });
    const bookColors = new Set(
      codices.map((book) => {
        const color = book.geometry.getAttribute("color");
        expect(color).toBeDefined();
        return [color.getX(0), color.getY(0), color.getZ(0)]
          .map((value) => value.toFixed(5))
          .join(":");
      }),
    );
    expect(bookColors.size).toBe(5);
    expect(runtimeOf(bookshelf).performance.materialBatches).toBe(4);
  });

  test("uses a round black ceramic body, continuous Greek band and 360 inlays on the urn", () => {
    const materials = createDungeonMaterials({ compact: true });
    const urn = build("urn", materials);
    const body = urn.getObjectByName("Urn 1 faceted black ceramic lathed body") as THREE.Mesh;
    const bodyMaterial = body.material as THREE.MeshStandardMaterial;
    const shoulderRim = urn.getObjectByName("Urn 1 shoulder brass rim 2") as THREE.Mesh;
    const brassMaterial = shoulderRim.material as THREE.MeshStandardMaterial;
    const inlays = urn.getObjectByName("Urn 1 worn brass body inlays 360") as THREE.Mesh;
    const greekBand = urn.getObjectByName("Urn 1 continuous Greek key brass band") as THREE.Mesh;
    const foot = urn.getObjectByName("Urn 1 stepped ceramic pedestal foot") as THREE.Mesh;

    expect(new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).z).toBeGreaterThan(
      0.9,
    );
    expect(body.userData.profile).toContain("rounded full body");
    expect(foot.geometry.type).toBe("CylinderGeometry");
    const footSize = new THREE.Box3().setFromObject(foot).getSize(new THREE.Vector3());
    expect(Math.abs(footSize.x - footSize.z)).toBeLessThan(0.03);
    expect(urn.getObjectByName("Urn 1 base brass rim 1")).toBeDefined();
    expect(urn.getObjectByName("Urn 1 mouth brass rim 3")).toBeDefined();
    expect(urn.getObjectByName("Urn 1 lid brass rim")).toBeDefined();
    expect(urn.getObjectByName("Urn 1 low stepped lid knob")).toBeDefined();
    expect(greekBand.userData.pattern).toEqual({
      type: "greek-key",
      segments: 16,
      continuous360: true,
    });
    expect(inlays.userData.pattern).toEqual({ rows: 4, count: 29, continuous360: true });
    expect(bodyMaterial).not.toBe(materials.ceramic);
    expect(bodyMaterial.map).toBe(materials.ceramic.map);
    expect(bodyMaterial.normalMap).toBe(materials.ceramic.normalMap);
    expect(bodyMaterial.roughnessMap).toBe(materials.ceramic.roughnessMap);
    expect(bodyMaterial.emissiveMap).toBeNull();
    expect(bodyMaterial.userData.finish).toBe("black fired ceramic with restrained glaze");
    expect(bodyMaterial.color.r + bodyMaterial.color.g + bodyMaterial.color.b).toBeLessThan(
      materials.ceramic.color.r + materials.ceramic.color.g + materials.ceramic.color.b,
    );
    expect(brassMaterial).not.toBe(materials.brass);
    expect(brassMaterial.map).toBe(materials.brass.map);
    expect(brassMaterial.normalMap).toBe(materials.brass.normalMap);
    expect(brassMaterial.roughnessMap).toBe(materials.brass.roughnessMap);
    expect(brassMaterial.metalness).toBeGreaterThanOrEqual(0.58);
    expect(brassMaterial.envMapIntensity).toBeGreaterThanOrEqual(0.9);
    expect(brassMaterial.color.r).toBeGreaterThan(brassMaterial.color.b);
    expect(greekBand.material).toBe(brassMaterial);
    expect(inlays.material).toBe(brassMaterial);
    expect(runtimeOf(urn).performance.materialBatches).toBe(2);
  });

  test("orients the lectern reading face toward +z and joins its rear brace", () => {
    const lectern = build("lectern", createDungeonMaterials({ compact: true }));
    const deck = lectern.getObjectByName("Angled lectern desk") as THREE.Mesh;
    const lip = lectern.getObjectByName("Lectern raised reading lip") as THREE.Mesh;
    const brace = lectern.getObjectByName("Lectern rear kick brace")!;
    const kick = lectern.getObjectByName("Lectern rear diagonal kick brace") as THREE.Mesh;
    const manuscript = lectern.getObjectByName("Lectern manuscript socket")!;

    expect(deck.rotation.x).toBeCloseTo(0.36, 6);
    expect(deck.userData.readingSurface).toMatchObject({ front: "+z", slopeRadians: 0.36 });
    expect(lip.rotation.x).toBeCloseTo(deck.rotation.x, 6);
    expect(lip.position.z).toBeGreaterThan(deck.position.z + 0.3);
    expect(lip.userData.deckAttachment).toEqual({ edge: "+z", contact: true });
    expect(manuscript.position.y).toBeGreaterThan(deck.position.y);
    expect(manuscript.position.z).toBeGreaterThan(deck.position.z);
    expect(brace.userData.deckContact).toMatchObject({
      endpoint: [0, 1.23, -0.315],
      target: "Angled lectern desk underside",
      contact: true,
    });
    const deckBounds = new THREE.Box3().setFromObject(deck).expandByScalar(0.015);
    expect(deckBounds.intersectsBox(new THREE.Box3().setFromObject(kick))).toBe(true);
  });

  test("joins the ossuary arched back to its iron crown", () => {
    const materials = createDungeonMaterials({ compact: true });
    const ossuary = build("ossuary-cabinet", materials);
    const back = ossuary.getObjectByName("Ossuary arched plank cabinet back") as THREE.Mesh;
    const crown = ossuary.getObjectByName("Ossuary segmented iron arch crown") as THREE.Mesh;
    const displayBacking = ossuary.getObjectByName(
      "Left ossuary recessed iron display backing",
    ) as THREE.Mesh;
    expect(back.userData.archProfile).toEqual({
      height: 2,
      shoulderHeight: 1.55,
      apexY: 2.22,
    });
    expect(crown.userData.panelAttachment).toEqual({
      panelApexY: 2.22,
      innerCrownApexY: 2.22,
      contact: true,
    });
    expect(ossuary.getObjectByName("Ossuary rear segmented iron arch crown")).toBeDefined();
    const roof = ossuary.getObjectByName("Ossuary continuous curved plank roof")!;
    expect(roof.userData.coverage).toMatchObject({
      type: "continuous segmented barrel roof",
      plankCount: 7,
      closed: true,
    });
    for (let index = 1; index <= 7; index += 1) {
      expect(ossuary.getObjectByName(`Ossuary curved roof plank ${index}`)).toBeDefined();
    }
    for (let index = 1; index <= 5; index += 1) {
      expect(ossuary.getObjectByName(`Ossuary crown depth rib ${index}`)).toBeDefined();
    }
    expect(ossuary.getObjectsByProperty("name", "Ossuary rear horizontal iron brace")).toHaveLength(
      3,
    );
    const fullBounds = new THREE.Box3().setFromObject(ossuary);
    expect(fullBounds.getSize(new THREE.Vector3()).z).toBeGreaterThan(0.72);
    expect(displayBacking.position.z).toBeLessThan(0.04);
    expect(displayBacking.userData.displayContrast).toEqual({
      behindBoneZ: 0.04,
      preservesSharedBatches: true,
    });
    for (const side of ["Left", "Right"] as const) {
      const sidePlanks = [1, 2, 3].map((index) =>
        ossuary.getObjectByName(`${side} ossuary divided side plank ${index}`)!,
      );
      const wallBounds = sidePlanks.reduce(
        (bounds, plank) => bounds.union(new THREE.Box3().setFromObject(plank)),
        new THREE.Box3(),
      );
      expect(wallBounds.getSize(new THREE.Vector3()).z).toBeGreaterThan(0.62);
      expect(ossuary.getObjectByName(`${side} ossuary crown depth bridge`)).toBeDefined();
      expect(ossuary.getObjectByName(`${side} ossuary aged brass door knob`)).toBeDefined();
      expect(ossuary.getObjectByName(`${side} ossuary visible hinge plate 1`)).toBeDefined();
      expect(ossuary.getObjectByName(`${side} ossuary visible hinge plate 2`)).toBeDefined();
      expect(
        ossuary.getObjectsByProperty("name", `${side} ossuary side vertical plank joint`),
      ).toHaveLength(2);
    }
    expect(ossuary.getObjectsByProperty("name", "Ossuary rear vertical plank joint")).toHaveLength(
      5,
    );
    const doorBounds = new THREE.Box3().setFromObject(
      ossuary.getObjectByName("Left ossuary lower plank door")!,
    );
    const stileBounds = new THREE.Box3().setFromObject(
      ossuary.getObjectByName("Left ossuary cabinet stile")!,
    );
    expect(doorBounds.max.z).toBeLessThan(stileBounds.max.z);
    const backBounds = new THREE.Box3().setFromObject(back);
    expect(backBounds.max.z).toBeLessThan(displayBacking.position.z);
    const displayedBones = ossuary.getObjectsByProperty(
      "name",
      "Ossuary displayed long bone shaft",
    ) as THREE.Mesh[];
    expect(displayedBones).toHaveLength(4);
    const displayedBone = displayedBones[0]!;
    expect(
      new THREE.Box3().setFromObject(displayedBone).getSize(new THREE.Vector3()).y,
    ).toBeGreaterThan(0.42);
    const boneMaterial = displayedBone.material as THREE.MeshStandardMaterial;
    expect(boneMaterial).not.toBe(materials.bone);
    expect(boneMaterial.map).toBe(materials.bone.map);
    expect(boneMaterial.normalMap).toBe(materials.bone.normalMap);
    expect(boneMaterial.roughnessMap).toBe(materials.bone.roughnessMap);
    expect(boneMaterial.emissiveMap).toBeNull();
    expect(boneMaterial.userData).toMatchObject({
      localValueScale: 1.18,
      localEmissiveLift: 0.07,
      biomeSafe: true,
    });
    const ironMaterial = displayBacking.material as THREE.MeshStandardMaterial;
    const woodMaterial = (ossuary.getObjectByName("Left ossuary cabinet stile") as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    const brassMaterial = (
      ossuary.getObjectByName("Left ossuary aged brass door knob") as THREE.Mesh
    ).material as THREE.MeshStandardMaterial;
    expect(woodMaterial.map).toBe(materials.wood.map);
    expect(woodMaterial.normalMap).toBe(materials.wood.normalMap);
    expect(woodMaterial.emissiveMap).toBe(woodMaterial.map);
    expect(woodMaterial.userData).toMatchObject({
      localValueScale: 0.68,
      localIndirectFill: 0.028,
      indirectFillSource: "albedo map",
    });
    expect(woodMaterial.userData.finish).toContain("dark aged oak");
    expect(ironMaterial.map).toBe(materials.iron.map);
    expect(ironMaterial.normalMap).toBe(materials.iron.normalMap);
    expect(ironMaterial.metalness).toBeGreaterThanOrEqual(0.66);
    expect(ironMaterial.roughness).toBeGreaterThanOrEqual(0.66);
    expect(ironMaterial.envMapIntensity).toBeLessThanOrEqual(0.94);
    expect(brassMaterial.map).toBe(materials.brass.map);
    expect(brassMaterial.metalness).toBeGreaterThanOrEqual(0.56);
    expect(runtimeOf(ossuary).performance.materialBatches).toBe(4);
  });

  test("grounds the six repaired floor props and keeps their runtime batches bounded", () => {
    const materials = createDungeonMaterials({ compact: true });
    for (const id of [
      "table",
      "bench",
      "bookshelf",
      "weapon-rack",
      "lectern",
      "ossuary-cabinet",
    ] as const) {
      const model = build(id, materials);
      const runtime = runtimeOf(model);
      const bounds = new THREE.Box3().setFromObject(model);
      expect(bounds.min.y).toBeGreaterThanOrEqual(0);
      expect(bounds.min.y).toBeLessThanOrEqual(0.01);
      expect(runtime.grounding).toMatchObject({ axis: "y", targetMinY: 0.001 });
      expect(runtime.performance.trianglesPerInstance).toBeLessThanOrEqual(
        id === "ossuary-cabinet" ? 3_800 : 3_000,
      );
      const materialBatchLimit = id === "bookshelf" || id === "ossuary-cabinet" ? 4 : 3;
      expect(runtime.performance.materialBatches).toBeLessThanOrEqual(materialBatchLimit);

      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const position = object.geometry.getAttribute("position");
        const uv = object.geometry.getAttribute("uv");
        expect(uv).toBeDefined();
        expect(uv.count).toBe(position.count);
        for (let index = 0; index < uv.count; index += 1) {
          expect(Number.isFinite(uv.getX(index))).toBe(true);
          expect(Number.isFinite(uv.getY(index))).toBe(true);
        }
      });

      const batches = createStaticPropTemplateBatches(model);
      expect(batches.length).toBeLessThanOrEqual(materialBatchLimit);
      batches.forEach((batch) => batch.geometry.dispose());
    }
  });

  test("anchors crate braces, feet and rivets to the matching closed faces", () => {
    const crate = build("crate", createDungeonMaterials({ compact: true }));
    const frontRivets = crate.getObjectByName("Crate 1 front brace rivet system")!;
    const rearRivets = crate.getObjectByName("Crate 1 rear brace rivet system")!;
    const rightBrace = crate.getObjectByName("Crate 1 right side diagonal brace")!;
    const cornerHardware = crate.getObjectByName("Crate 1 wrapped corner plates and bolts")!;

    expect(crate.getObjectByName("Crate 1 rear diagonal brace descending")).toBeDefined();
    expect(crate.getObjectByName("Crate 1 grounded timber skid")).toBeDefined();
    expect(frontRivets.children).toHaveLength(4);
    expect(rearRivets.children).toHaveLength(4);
    expect(cornerHardware.userData.cornerHardware).toEqual({
      plateCount: 16,
      rivetCount: 16,
      wrapsAdjacentFaces: true,
      materialBatches: ["iron", "brass"],
    });
    const hardwareMarkers: THREE.Object3D[] = [];
    cornerHardware.traverse((object) => {
      if (object.userData.sculptSourceMarker) hardwareMarkers.push(object);
    });
    expect(
      hardwareMarkers.filter(
        (part) => part.name.includes("corner plate") && !part.name.endsWith("rivet"),
      ),
    ).toHaveLength(16);
    expect(hardwareMarkers.filter((part) => part.name.endsWith("plate rivet"))).toHaveLength(16);
    for (const [system, expectedZ] of [
      [frontRivets, 0.513],
      [rearRivets, -0.513],
    ] as const) {
      for (const fastener of system.children) {
        expect(fastener.position.z).toBeCloseTo(expectedZ, 4);
        expect(Math.abs(fastener.position.x)).toBeCloseTo(0.34, 4);
        expect([0.13, 0.65]).toContain(Number(fastener.position.y.toFixed(2)));
        expect(fastener.userData.sculptSourceMarker).toBe(true);
        const fastenerBounds = fastener.userData.sculptSourceBounds as {
          min: number[];
          max: number[];
        };
        expect(
          Math.max(Math.abs(fastenerBounds.min[2]!), Math.abs(fastenerBounds.max[2]!)),
        ).toBeLessThanOrEqual(0.53);
      }
    }

    expect(rightBrace.userData.sculptSourceMarker).toBe(true);
    const rightBraceBounds = rightBrace.userData.sculptSourceBounds as {
      min: number[];
      max: number[];
    };
    expect(rightBraceBounds.min[0]!).toBeLessThanOrEqual(0.46);
    expect(rightBraceBounds.max[0]!).toBeGreaterThanOrEqual(0.48);
    expect(rightBraceBounds.min[1]!).toBeLessThan(0.16);
    expect(rightBraceBounds.max[1]!).toBeGreaterThan(0.62);

    const brassBatch = crate.getObjectByName(
      "Crate layout brass static material batch",
    ) as THREE.Mesh;
    brassBatch.geometry.computeBoundingBox();
    expect(brassBatch.geometry.boundingBox!.min.x).toBeLessThanOrEqual(-0.535);
    expect(brassBatch.geometry.boundingBox!.max.x).toBeGreaterThanOrEqual(0.535);
    expect(brassBatch.geometry.boundingBox!.min.z).toBeLessThanOrEqual(-0.512);
    expect(brassBatch.geometry.boundingBox!.max.z).toBeGreaterThanOrEqual(0.512);

    const ironBatch = crate.getObjectByName(
      "Crate layout iron static material batch",
    ) as THREE.Mesh;
    ironBatch.geometry.computeBoundingBox();
    expect(ironBatch.geometry.boundingBox!.min.x).toBeLessThanOrEqual(-0.53);
    expect(ironBatch.geometry.boundingBox!.max.x).toBeGreaterThanOrEqual(0.53);
    expect(ironBatch.geometry.boundingBox!.min.z).toBeLessThanOrEqual(-0.51);
    expect(ironBatch.geometry.boundingBox!.max.z).toBeGreaterThanOrEqual(0.51);

    crate.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const uv = object.geometry.getAttribute("uv");
      expect(uv).toBeDefined();
      for (let index = 0; index < uv.count; index += 1) {
        expect(Number.isFinite(uv.getX(index))).toBe(true);
        expect(Number.isFinite(uv.getY(index))).toBe(true);
      }
    });
  });

  test("bakes the closed crate into bounded render batches without changing its silhouette", () => {
    const crate = build("crate", createDungeonMaterials({ compact: true }));
    const batching = crate.userData.renderBatching as {
      sourceMeshes: number;
      drawCalls: number;
      materialBatches: number;
      sourceBounds: { min: number[]; max: number[] };
      renderBounds: { min: number[]; max: number[] };
    };
    const meshes: THREE.Mesh[] = [];
    const materials = new Set<string>();
    crate.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      meshes.push(object);
      const assigned = Array.isArray(object.material) ? object.material : [object.material];
      assigned.forEach((material) => materials.add(material.uuid));
    });

    expect(batching.sourceMeshes).toBeGreaterThan(40);
    expect(batching.drawCalls).toBe(meshes.length);
    expect(meshes.length).toBe(3);
    expect(materials.size).toBe(3);
    expect(runtimeOf(crate).performance.triangles).toBeLessThanOrEqual(3_000);
    for (const edge of ["min", "max"] as const) {
      batching.sourceBounds[edge].forEach((value, axis) => {
        expect(batching.renderBounds[edge][axis]).toBeCloseTo(value, 5);
      });
    }

    const woodBatch = crate.getObjectByName(
      "Crate layout wood static material batch",
    ) as THREE.Mesh;
    woodBatch.geometry.computeBoundingBox();
    expect(woodBatch.geometry.boundingBox!.max.x).toBeGreaterThanOrEqual(0.485);
  });

  test("keeps interactive pivots and attachment sockets on the matching assemblies", () => {
    const materials = createDungeonMaterials({ compact: true });
    const lectern = build("lectern", materials);
    const urn = build("urn", materials);
    const ossuary = build("ossuary-cabinet", materials);
    const chestKit = createForgeChest(materials);

    expect(lectern.getObjectByName("Lectern front door hinge")?.userData.socket.type).toBe("hinge");
    expect(urn.getObjectByName("Urn 1 removable domed lid pivot")?.userData.socket.type).toBe(
      "hinge",
    );
    expect(ossuary.getObjectByName("Ossuary left door hinge")?.userData.socket.type).toBe("hinge");
    expect(ossuary.getObjectByName("Ossuary right door hinge")?.userData.socket.type).toBe("hinge");
    expect(chestKit.lid.parent).toBe(chestKit.root);
    expect(chestKit.lid.position.z).toBeLessThan(0);
    expect(chestKit.lid.userData.hinge.axis).toEqual([1, 0, 0]);
    expect(Object.keys(runtimeOf(chestKit.root).sockets)).toEqual([
      "Chest loot socket",
      "Chest interaction socket",
    ]);
  });

  test("keeps the treasure chest closed and readable from every gameplay side", () => {
    const materials = createDungeonMaterials({ compact: true });
    const chest = createForgeChest(materials).root;
    chest.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    chest.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes.push(object);
    });
    const named = (pattern: RegExp) => meshes.filter((item) => pattern.test(item.name));

    expect(named(/^Front chest body plank/)).toHaveLength(5);
    expect(named(/^Rear chest body plank/)).toHaveLength(5);
    expect(named(/^(Left|Right) chest side plank/)).toHaveLength(8);
    expect(named(/chest lid solid arched end panel$/)).toHaveLength(2);
    expect(named(/^Chest rear (body hinge leaf|hinge barrel)$/)).toHaveLength(4);
    expect(chest.getObjectByName("Chest closed lid underside panel")).toBeDefined();
    expect(chest.getObjectByName("Chest grounded timber plinth")).toBeDefined();
    expect(chest.getObjectByName("Chest lock raised center boss")).toBeDefined();

    const body = chest.getObjectByName("Chest framed plank body")!;
    const underside = chest.getObjectByName("Chest closed lid underside panel")!;
    const bodyBounds = new THREE.Box3().setFromObject(body);
    const undersideBounds = new THREE.Box3().setFromObject(underside);
    expect(undersideBounds.min.y - bodyBounds.max.y).toBeLessThanOrEqual(0.02);

    const lidStaves = named(/^Chest arched lid stave/);
    expect(lidStaves).toHaveLength(9);
    expect(lidStaves.every((item) => item.geometry.userData.woodUvLayout?.grainAxis === "x")).toBe(
      true,
    );
    const panelSeeds = [
      ...named(/^(Front|Rear) chest body plank/),
      ...named(/^(Left|Right) chest side plank/),
    ].map((item) => item.geometry.userData.woodUvLayout?.seed);
    expect(new Set(panelSeeds).size).toBe(panelSeeds.length);
  });

  test("ships the weapon rack empty with aligned physical U-slot voids", () => {
    const materials = createDungeonMaterials({ compact: true });
    const rack = build("weapon-rack", materials);
    const runtime = runtimeOf(rack);
    const meshNames = Object.values(runtime.meshes).map((item) => item.name.toLowerCase());
    expect(meshNames.some((name) => /sword|spear|axe|blade/.test(name))).toBe(false);
    expect(Object.values(runtime.sockets)).toHaveLength(8);
    expect(
      Object.values(runtime.sockets).filter((socket) => socket.userData.socket.type === "weapon"),
    ).toHaveLength(4);
    expect(
      Object.values(runtime.sockets).filter(
        (socket) => socket.userData.socket.type === "weapon-support",
      ),
    ).toHaveLength(4);

    rack.updateMatrixWorld(true);
    const upperSockets = Object.values(runtime.sockets)
      .filter((socket) => socket.userData.socket.type === "weapon")
      .map((socket) => socket.getWorldPosition(new THREE.Vector3()).x)
      .sort((left, right) => left - right);
    const lowerSockets = Object.values(runtime.sockets)
      .filter((socket) => socket.userData.socket.type === "weapon-support")
      .map((socket) => socket.getWorldPosition(new THREE.Vector3()).x)
      .sort((left, right) => left - right);
    expect(upperSockets).toHaveLength(4);
    upperSockets.forEach((x, index) => expect(x).toBeCloseTo(lowerSockets[index]!, 6));

    for (const label of ["Upper", "Lower"] as const) {
      const rail = rack.getObjectByName(`${label} weapon rack four-open-slot U rail`) as THREE.Mesh;
      expect(rail).toBeDefined();
      const layout = rail.geometry.userData.openSlotLayout as {
        physicalVoid: boolean;
        count: number;
        centers: number[];
        width: number;
        depth: number;
        railHeight: number;
      };
      expect(layout).toMatchObject({ physicalVoid: true, count: 4 });
      const raycaster = new THREE.Raycaster();
      const castAt = (x: number, y: number): THREE.Intersection[] => {
        const origin = rail.localToWorld(new THREE.Vector3(x, y, 1));
        const direction = new THREE.Vector3(0, 0, -1).transformDirection(rail.matrixWorld);
        raycaster.set(origin, direction);
        return raycaster.intersectObject(rail, false);
      };
      for (const center of layout.centers) {
        expect(castAt(center, layout.railHeight - 0.035)).toHaveLength(0);
        expect(castAt(center, layout.railHeight - layout.depth - 0.025).length).toBeGreaterThan(0);
      }
      expect(castAt(0, layout.railHeight - 0.035).length).toBeGreaterThan(0);
    }
  });

  test("collapses dense static carpentry to the declared material batch count", () => {
    const materials = createDungeonMaterials({ compact: true });
    for (const id of ["table", "bookshelf", "crate", "weapon-rack"] as const) {
      const model = build(id, materials);
      const batches = createStaticPropTemplateBatches(model);
      expect(batches).toHaveLength(runtimeOf(model).performance.materialBatches);
      expect(batches.every((batch) => batch.geometry.index === null)).toBe(true);
      batches.forEach((batch) => batch.geometry.dispose());
    }
  });
});
