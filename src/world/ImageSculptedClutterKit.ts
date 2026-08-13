import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { DungeonMaterials } from "./MaterialLibrary";
import { normalizeGeometryForMerge } from "./MergeGeometryNormalize";
import {
  addCarpentryMesh,
  addCarpentryRivets,
  createBeamBetween,
  createCarpentryPart,
  createCarpentrySocket,
  finalizeCarpentryModel,
  taperedChamferBoxGeometry,
} from "./ImageSculptedPropKit";

export type ImageSculptedClutterFamily = "barrels" | "crates" | "urns" | "weapon-rack";

function barrel(materials: DungeonMaterials, index: number): THREE.Group {
  const suffix = index + 1;
  const root = createCarpentryPart(
    `barrel-${suffix}`,
    `Iron-bound coopered barrel ${suffix}`,
    `barrel-${suffix}`,
  );
  const body = createCarpentryPart(
    `barrel-body-${suffix}`,
    `Barrel ${suffix} convex stave shell`,
    `barrel-${suffix}`,
  );
  const profile = [
    new THREE.Vector2(0.29, 0),
    new THREE.Vector2(0.32, 0.05),
    new THREE.Vector2(0.365, 0.24),
    new THREE.Vector2(0.385, 0.47),
    new THREE.Vector2(0.365, 0.7),
    new THREE.Vector2(0.32, 0.89),
    new THREE.Vector2(0.29, 0.94),
  ];
  addCarpentryMesh(
    body,
    new THREE.LatheGeometry(profile, 16),
    materials.wood,
    `Barrel ${suffix} low-poly convex oak core`,
  );

  const staves = createCarpentryPart(
    `barrel-staves-${suffix}`,
    `Barrel ${suffix} sixteen-stave system`,
    `barrel-${suffix}`,
  );
  staves.userData.repetitionSystem = { type: "radial-staves", count: 16 };
  const staveGeometry = new THREE.BoxGeometry(0.135, 0.82, 0.05);
  for (let staveIndex = 0; staveIndex < 16; staveIndex += 1) {
    const angle = (staveIndex / 16) * Math.PI * 2;
    const stave = addCarpentryMesh(
      staves,
      staveGeometry,
      materials.wood,
      `Barrel ${suffix} tapered stave ${staveIndex + 1}`,
    );
    stave.position.set(Math.sin(angle) * 0.37, 0.47, Math.cos(angle) * 0.37);
    stave.rotation.y = angle;
    stave.userData.explodeWithParent = true;
  }

  const hoops = createCarpentryPart(
    `barrel-hoops-${suffix}`,
    `Barrel ${suffix} projecting iron hoops`,
    `barrel-${suffix}`,
  );
  for (const [hoopIndex, y] of [0.14, 0.47, 0.8].entries()) {
    const hoop = addCarpentryMesh(
      hoops,
      new THREE.TorusGeometry(0.385, 0.032, 5, 18),
      materials.iron,
      `Barrel ${suffix} iron hoop ${hoopIndex + 1}`,
    );
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
  }
  addCarpentryRivets(
    hoops,
    [0.14, 0.47, 0.8].flatMap((y) =>
      [0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle) => ({
        x: Math.sin(angle) * 0.407,
        y,
        z: Math.cos(angle) * 0.407,
      })),
    ),
    materials.brass,
    `Barrel ${suffix} hoop rivet system`,
    0.022,
  );

  const head = createCarpentryPart(
    `barrel-head-${suffix}`,
    `Barrel ${suffix} recessed head and raised rim`,
    `barrel-${suffix}`,
  );
  const headDisk = addCarpentryMesh(
    head,
    new THREE.CylinderGeometry(0.31, 0.31, 0.035, 16),
    materials.wood,
    `Barrel ${suffix} recessed top head`,
  );
  headDisk.position.y = 0.942;
  for (let rimIndex = 0; rimIndex < 12; rimIndex += 1) {
    const angle = (rimIndex / 12) * Math.PI * 2;
    const block = addCarpentryMesh(
      head,
      new THREE.BoxGeometry(0.14, 0.08, 0.09),
      materials.wood,
      `Barrel ${suffix} raised head rim block ${rimIndex + 1}`,
      { surfaceDetail: true },
    );
    block.position.set(Math.sin(angle) * 0.31, 0.97, Math.cos(angle) * 0.31);
    block.rotation.y = angle;
  }
  const bung = addCarpentryMesh(
    head,
    new THREE.CylinderGeometry(0.056, 0.048, 0.044, 8),
    materials.brass,
    `Barrel ${suffix} recessed octagonal bung`,
  );
  bung.rotation.x = Math.PI / 2;
  bung.position.set(0.09, 0.54, 0.397);
  root.add(
    body,
    staves,
    hoops,
    head,
    createCarpentrySocket(`Barrel ${suffix} bung socket`, "pour", {
      x: 0.09,
      y: 0.54,
      z: 0.43,
    }),
  );
  return root;
}

function crateFacePlanks(
  part: THREE.Group,
  materials: DungeonMaterials,
  axis: "x" | "z",
  side: number,
  suffix: number,
): void {
  const count = 5;
  for (let index = 0; index < count; index += 1) {
    const plank = addCarpentryMesh(
      part,
      axis === "x"
        ? new THREE.BoxGeometry(0.16, 0.62, 0.048)
        : new THREE.BoxGeometry(0.048, 0.62, 0.16),
      materials.wood,
      `Crate ${suffix} ${axis === "x" ? "front-back" : "side"} plank ${index + 1}`,
    );
    if (axis === "x") plank.position.set(-0.34 + index * 0.17, 0.39, side * 0.4);
    else plank.position.set(side * 0.44, 0.39, -0.32 + index * 0.16);
  }
}

function setCrateWoodTone(mesh: THREE.Mesh, tone: number): THREE.Mesh {
  const position = mesh.geometry.getAttribute("position");
  const color = new Float32Array(position.count * 3);
  color.fill(THREE.MathUtils.clamp(tone, 0, 1));
  mesh.geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  return mesh;
}

function addCrateCornerHardware(
  frame: THREE.Group,
  materials: DungeonMaterials,
  suffix: number,
): void {
  const hardware = createCarpentryPart(
    `crate-corner-hardware-${suffix}`,
    `Crate ${suffix} wrapped corner plates and bolts`,
    `crate-frame-${suffix}`,
  );
  const rivetGeometry = new THREE.CircleGeometry(0.028, 6);
  let plateCount = 0;
  let rivetCount = 0;
  for (const x of [-0.44, 0.44]) {
    for (const z of [-0.42, 0.42]) {
      for (const y of [0.14, 0.65]) {
        const height = y < 0.4 ? "lower" : "upper";
        const xSide = x < 0 ? "left" : "right";
        const zSide = z < 0 ? "rear" : "front";
        const facePlate = addCarpentryMesh(
          hardware,
          new THREE.BoxGeometry(0.17, 0.16, 0.035),
          materials.iron,
          `Crate ${suffix} ${zSide}-${xSide} ${height} iron corner plate`,
          { surfaceDetail: true },
        );
        facePlate.position.set(x, y, Math.sign(z) * 0.495);
        plateCount += 1;

        const faceRivet = addCarpentryMesh(
          hardware,
          rivetGeometry,
          materials.brass,
          `Crate ${suffix} ${zSide}-${xSide} ${height} corner plate rivet`,
          { surfaceDetail: true },
        );
        faceRivet.position.set(x, y, Math.sign(z) * 0.516);
        if (z < 0) faceRivet.rotation.y = Math.PI;
        rivetCount += 1;

        const sidePlate = addCarpentryMesh(
          hardware,
          new THREE.BoxGeometry(0.035, 0.16, 0.17),
          materials.iron,
          `Crate ${suffix} ${xSide}-${zSide} ${height} side corner plate`,
          { surfaceDetail: true },
        );
        sidePlate.position.set(Math.sign(x) * 0.515, y, z);
        plateCount += 1;

        const sideRivet = addCarpentryMesh(
          hardware,
          rivetGeometry,
          materials.brass,
          `Crate ${suffix} ${xSide}-${zSide} ${height} side plate rivet`,
          { surfaceDetail: true },
        );
        sideRivet.position.set(Math.sign(x) * 0.536, y, z);
        sideRivet.rotation.y = x < 0 ? -Math.PI / 2 : Math.PI / 2;
        rivetCount += 1;
      }
    }
  }
  hardware.userData.cornerHardware = {
    plateCount,
    rivetCount,
    wrapsAdjacentFaces: true,
    materialBatches: ["iron", "brass"],
  };
  frame.add(hardware);
}

function addCrateFaceRivets(
  parent: THREE.Group,
  positions: readonly THREE.Vector3Like[],
  material: THREE.Material,
  name: string,
): THREE.Group {
  const system = new THREE.Group();
  system.name = name;
  system.userData.sculptPartId = parent.userData.sculptPartId;
  system.userData.explodeWithParent = true;
  system.userData.repetitionSystem = {
    type: "embedded-fastener",
    count: positions.length,
    realization: "shallow hexagonal heads embedded in the matching face brace",
  };
  const geometry = new THREE.CircleGeometry(0.026, 6);
  for (const [index, position] of positions.entries()) {
    const rivet = addCarpentryMesh(system, geometry, material, `${name} rivet ${index + 1}`, {
      surfaceDetail: true,
    });
    if (position.z < 0) rivet.rotation.y = Math.PI;
    rivet.position.set(position.x, position.y, position.z);
  }
  parent.add(system);
  return system;
}

interface CrateMeshBatch {
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  meshes: THREE.Mesh[];
}

function crateGeometryRelativeTo(mesh: THREE.Mesh, root: THREE.Object3D): THREE.BufferGeometry {
  const relative = root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  return normalizeGeometryForMerge(mesh.geometry, relative, { keepColor: true });
}

/**
 * Keep the named assembly tree for inspection while baking the closed crate to
 * one render mesh per shared material. The non-rendering markers retain each
 * authored brace, plank, skid and fastener anchor for editor and test tooling.
 */
function batchCrateGeometry(root: THREE.Group, materials: DungeonMaterials): void {
  root.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(root);
  const sourceMeshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) sourceMeshes.push(object);
  });

  const batches = new Map<string, CrateMeshBatch>();
  for (const source of sourceMeshes) {
    if (Array.isArray(source.material)) {
      throw new Error(`Crate layout cannot batch multi-material mesh ${source.name}.`);
    }
    const key = `${source.material.uuid}:${Number(source.castShadow)}:${Number(source.receiveShadow)}`;
    const batch = batches.get(key) ?? {
      material: source.material,
      castShadow: source.castShadow,
      receiveShadow: source.receiveShadow,
      meshes: [],
    };
    batch.meshes.push(source);
    batches.set(key, batch);
  }

  const renderMeshes: THREE.Mesh[] = [];
  for (const batch of batches.values()) {
    const parts = batch.meshes.map((source) => crateGeometryRelativeTo(source, root));
    const geometry = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
    if (!geometry) {
      parts.forEach((part) => part.dispose());
      throw new Error("Crate layout material batch could not merge normalized geometry.");
    }
    if (parts.length > 1) parts.forEach((part) => part.dispose());
    const role =
      batch.material === materials.wood || batch.material.userData.crateWood === true
        ? "wood"
        : batch.material === materials.iron
          ? "iron"
          : batch.material === materials.brass
            ? "brass"
            : "surface";
    const renderMesh = addCarpentryMesh(
      root,
      geometry,
      batch.material,
      `Crate layout ${role} static material batch`,
      { castShadow: batch.castShadow, receiveShadow: batch.receiveShadow },
    );
    renderMesh.userData.sourceMeshCount = batch.meshes.length;
    renderMeshes.push(renderMesh);
  }

  const rootInverse = root.matrixWorld.clone().invert();
  const sourceGeometries = new Set<THREE.BufferGeometry>();
  for (const source of sourceMeshes) {
    const parent = source.parent;
    if (!parent) continue;
    const marker = new THREE.Group();
    marker.name = source.name;
    marker.position.copy(source.position);
    marker.quaternion.copy(source.quaternion);
    marker.scale.copy(source.scale);
    marker.userData = {
      ...source.userData,
      sculptSourceMarker: true,
      sourceGeometry: {
        type: source.geometry.type,
        triangleCount:
          (source.geometry.index?.count ?? source.geometry.getAttribute("position").count) / 3,
      },
    };
    const bounds = new THREE.Box3().setFromObject(source).applyMatrix4(rootInverse);
    marker.userData.sculptSourceBounds = {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
    };
    parent.add(marker);
    parent.remove(source);
    sourceGeometries.add(source.geometry);
  }
  sourceGeometries.forEach((geometry) => geometry.dispose());
  root.add(...renderMeshes);
  root.updateMatrixWorld(true);
  const renderBounds = new THREE.Box3().setFromObject(root);
  root.userData.renderBatching = {
    strategy: "one merged render mesh per shared material with named source markers",
    sourceMeshes: sourceMeshes.length,
    drawCalls: renderMeshes.length,
    materialBatches: batches.size,
    sourceBounds: { min: sourceBounds.min.toArray(), max: sourceBounds.max.toArray() },
    renderBounds: { min: renderBounds.min.toArray(), max: renderBounds.max.toArray() },
  };
}

function crate(materials: DungeonMaterials, index: number): THREE.Group {
  const suffix = index + 1;
  const root = createCarpentryPart(
    `crate-${suffix}`,
    `Iron-bound closed crate ${suffix}`,
    `crate-${suffix}`,
  );
  const shell = createCarpentryPart(
    `crate-shell-${suffix}`,
    `Crate ${suffix} recessed plank shell`,
    `crate-${suffix}`,
  );
  crateFacePlanks(shell, materials, "x", -1, suffix);
  crateFacePlanks(shell, materials, "x", 1, suffix);
  crateFacePlanks(shell, materials, "z", -1, suffix);
  crateFacePlanks(shell, materials, "z", 1, suffix);
  for (let index = 0; index < 5; index += 1) {
    const top = addCarpentryMesh(
      shell,
      new THREE.BoxGeometry(0.16, 0.05, 0.76),
      materials.wood,
      `Crate ${suffix} closed top plank ${index + 1}`,
    );
    top.position.set(-0.34 + index * 0.17, 0.73, 0);
  }

  const frame = createCarpentryPart(
    `crate-frame-${suffix}`,
    `Crate ${suffix} chamfered perimeter frame`,
    `crate-${suffix}`,
  );
  for (const x of [-0.44, 0.44]) {
    for (const z of [-0.42, 0.42]) {
      const corner = addCarpentryMesh(
        frame,
        taperedChamferBoxGeometry([0.1, 0.78, 0.1], 0.016),
        materials.iron,
        `Crate ${suffix} iron corner rail`,
      );
      corner.position.set(x, 0.39, z);
    }
  }
  for (const y of [0.08, 0.7]) {
    for (const z of [-0.43, 0.43]) {
      const rail = addCarpentryMesh(
        frame,
        taperedChamferBoxGeometry([0.98, 0.11, 0.095], 0.016),
        materials.wood,
        `Crate ${suffix} horizontal timber frame rail`,
      );
      rail.position.set(0, y, z);
      setCrateWoodTone(rail, 0.78);
    }
    for (const x of [-0.45, 0.45]) {
      const rail = addCarpentryMesh(
        frame,
        taperedChamferBoxGeometry([0.095, 0.11, 0.86], 0.016),
        materials.wood,
        `Crate ${suffix} side timber frame rail`,
      );
      rail.position.set(x, y, 0);
      setCrateWoodTone(rail, 0.78);
    }
  }
  for (const x of [-0.28, 0.28]) {
    const skid = addCarpentryMesh(
      frame,
      taperedChamferBoxGeometry([0.16, 0.08, 0.92], 0.012, 1.04, 0.96),
      materials.wood,
      `Crate ${suffix} grounded timber skid`,
    );
    skid.position.set(x, 0.025, 0);
    setCrateWoodTone(skid, 0.7);
  }
  setCrateWoodTone(
    createBeamBetween(
      frame,
      new THREE.Vector3(-0.34, 0.13, 0.482),
      new THREE.Vector3(0.34, 0.65, 0.482),
      0.14,
      0.095,
      0.014,
      materials.wood,
      `Crate ${suffix} front diagonal brace ascending`,
    ),
    0.62,
  );
  setCrateWoodTone(
    createBeamBetween(
      frame,
      new THREE.Vector3(0.34, 0.13, 0.482),
      new THREE.Vector3(-0.34, 0.65, 0.482),
      0.14,
      0.095,
      0.014,
      materials.wood,
      `Crate ${suffix} front diagonal brace descending`,
    ),
    0.62,
  );
  setCrateWoodTone(
    createBeamBetween(
      frame,
      new THREE.Vector3(-0.34, 0.13, -0.482),
      new THREE.Vector3(0.34, 0.65, -0.482),
      0.13,
      0.085,
      0.014,
      materials.wood,
      `Crate ${suffix} rear diagonal brace`,
    ),
    0.62,
  );
  setCrateWoodTone(
    createBeamBetween(
      frame,
      new THREE.Vector3(0.34, 0.13, -0.482),
      new THREE.Vector3(-0.34, 0.65, -0.482),
      0.13,
      0.085,
      0.014,
      materials.wood,
      `Crate ${suffix} rear diagonal brace descending`,
    ),
    0.62,
  );
  setCrateWoodTone(
    createBeamBetween(
      frame,
      new THREE.Vector3(0.477, 0.13, -0.32),
      new THREE.Vector3(0.477, 0.65, 0.32),
      0.08,
      0.14,
      0.014,
      materials.wood,
      `Crate ${suffix} right side diagonal brace`,
    ),
    0.62,
  );
  addCrateCornerHardware(frame, materials, suffix);
  addCrateFaceRivets(
    frame,
    [-0.34, 0.34].flatMap((x) => [0.13, 0.65].map((y) => ({ x, y, z: 0.513 }))),
    materials.brass,
    `Crate ${suffix} front brace rivet system`,
  );
  addCrateFaceRivets(
    frame,
    [-0.34, 0.34].flatMap((x) => [0.13, 0.65].map((y) => ({ x, y, z: -0.513 }))),
    materials.brass,
    `Crate ${suffix} rear brace rivet system`,
  );
  root.add(shell, frame);
  return root;
}

function urn(materials: DungeonMaterials, index: number): THREE.Group {
  const suffix = index + 1;
  const root = createCarpentryPart(
    `urn-${suffix}`,
    `Lidded funerary urn ${suffix}`,
    `urn-${suffix}`,
  );
  const vessel = createCarpentryPart(
    `urn-vessel-${suffix}`,
    `Urn ${suffix} broad ovoid ceramic vessel`,
    `urn-${suffix}`,
  );
  const profile = [
    new THREE.Vector2(0.18, 0),
    new THREE.Vector2(0.26, 0.06),
    new THREE.Vector2(0.28, 0.13),
    new THREE.Vector2(0.34, 0.29),
    new THREE.Vector2(0.37, 0.52),
    new THREE.Vector2(0.34, 0.7),
    new THREE.Vector2(0.27, 0.84),
    new THREE.Vector2(0.18, 0.91),
    new THREE.Vector2(0.15, 1.01),
  ];
  addCarpentryMesh(
    vessel,
    new THREE.LatheGeometry(profile, 16),
    materials.ceramic,
    `Urn ${suffix} faceted ash-ceramic lathed body`,
  );
  const foot = addCarpentryMesh(
    vessel,
    new THREE.CylinderGeometry(0.26, 0.29, 0.08, 10),
    materials.ceramic,
    `Urn ${suffix} stepped ceramic pedestal foot`,
  );
  foot.position.y = 0.035;
  for (const [bandIndex, [y, radius]] of [
    [0.09, 0.25],
    [0.79, 0.3],
    [0.94, 0.17],
  ].entries()) {
    const band = addCarpentryMesh(
      vessel,
      new THREE.TorusGeometry(radius, 0.018, 5, 16),
      bandIndex === 1 ? materials.brass : materials.ceramic,
      `Urn ${suffix} stepped collar ${bandIndex + 1}`,
      { surfaceDetail: true },
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
  }
  for (let motifIndex = 0; motifIndex < 10; motifIndex += 1) {
    const angle = (motifIndex / 10) * Math.PI * 2;
    const motif = addCarpentryMesh(
      vessel,
      new THREE.OctahedronGeometry(0.035, 0),
      materials.brass,
      `Urn ${suffix} geometric shoulder inlay ${motifIndex + 1}`,
      { surfaceDetail: true },
    );
    motif.scale.y = 0.55;
    motif.position.set(Math.sin(angle) * 0.335, 0.73, Math.cos(angle) * 0.335);
  }

  const lid = createCarpentryPart(
    `urn-lid-${suffix}`,
    `Urn ${suffix} removable domed lid pivot`,
    `urn-${suffix}`,
  );
  lid.position.set(0, 1.0, -0.12);
  lid.userData.socket = {
    type: "hinge",
    axis: [1, 0, 0],
    range: [0, 1.9],
    detachable: true,
  };
  const lidProfile = [
    new THREE.Vector2(0.18, 0),
    new THREE.Vector2(0.25, 0.04),
    new THREE.Vector2(0.24, 0.1),
    new THREE.Vector2(0.16, 0.19),
    new THREE.Vector2(0.07, 0.23),
    new THREE.Vector2(0.05, 0.31),
  ];
  const lidMesh = addCarpentryMesh(
    lid,
    new THREE.LatheGeometry(lidProfile, 16),
    materials.ceramic,
    `Urn ${suffix} domed ceramic lid and finial`,
  );
  lidMesh.position.z = 0.12;

  const handles = createCarpentryPart(
    `urn-handles-${suffix}`,
    `Urn ${suffix} paired brass ring handles`,
    `urn-${suffix}`,
  );
  for (const side of [-1, 1]) {
    const stud = addCarpentryMesh(
      handles,
      taperedChamferBoxGeometry([0.09, 0.1, 0.085], 0.014),
      materials.brass,
      `Urn ${suffix} ${side < 0 ? "left" : "right"} ring stud`,
    );
    stud.position.set(side * 0.325, 0.69, 0);
    const ring = addCarpentryMesh(
      handles,
      new THREE.TorusGeometry(0.13, 0.018, 5, 14),
      materials.brass,
      `Urn ${suffix} ${side < 0 ? "left" : "right"} open ring handle`,
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.set(side * 0.34, 0.59, 0);
  }
  root.add(
    vessel,
    lid,
    handles,
    createCarpentrySocket(`Urn ${suffix} offering socket`, "ritual-item", {
      x: 0,
      y: 1.34,
      z: 0,
    }),
  );
  return root;
}

function openWeaponSlotRailGeometry(
  width: number,
  height: number,
  depth: number,
  slotCenters: readonly number[],
  slotWidth: number,
  slotDepth: number,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const slotBottom = height - slotDepth;
  const cornerRadius = Math.min(slotWidth * 0.5, slotDepth * 0.5);
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, height);
  for (const center of [...slotCenters].reverse()) {
    shape.lineTo(center + slotWidth / 2, height);
    shape.lineTo(center + slotWidth / 2, slotBottom + cornerRadius);
    shape.quadraticCurveTo(center + slotWidth / 2, slotBottom, center, slotBottom);
    shape.quadraticCurveTo(
      center - slotWidth / 2,
      slotBottom,
      center - slotWidth / 2,
      slotBottom + cornerRadius,
    );
    shape.lineTo(center - slotWidth / 2, height);
  }
  shape.lineTo(-width / 2, height);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 2,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.008,
    bevelThickness: 0.008,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  geometry.name = "Weapon rack four open U-slot rail geometry";
  geometry.userData.openSlotLayout = {
    physicalVoid: true,
    openEdge: "top",
    count: slotCenters.length,
    centers: [...slotCenters],
    width: slotWidth,
    depth: slotDepth,
    railHeight: height,
  };
  return geometry;
}

function weaponRack(materials: DungeonMaterials, variant: number): THREE.Group {
  const root = createCarpentryPart(
    "weapon-rack-frame",
    `Empty slotted weapon rack variant ${variant + 1}`,
    "weapon-rack-frame",
  );
  const posts = createCarpentryPart(
    "weapon-rack-posts",
    "Weapon rack tall post and splayed foot assembly",
    "weapon-rack-frame",
  );
  for (const x of [-0.69, 0.69]) {
    const post = addCarpentryMesh(
      posts,
      taperedChamferBoxGeometry([0.13, 1.46, 0.15], 0.02, 1.08, 0.96),
      materials.wood,
      `${x < 0 ? "Left" : "Right"} weapon rack upright`,
    );
    post.position.set(x, 0.82, 0);
    const foot = addCarpentryMesh(
      posts,
      taperedChamferBoxGeometry([0.58, 0.13, 0.65], 0.022, 1.04, 0.98),
      materials.wood,
      `${x < 0 ? "Left" : "Right"} weapon rack splayed foot`,
    );
    foot.position.set(x, 0.065, 0.02);
    const cap = addCarpentryMesh(
      posts,
      taperedChamferBoxGeometry([0.17, 0.18, 0.18], 0.026, 1.04, 0.88),
      materials.wood,
      `${x < 0 ? "Left" : "Right"} weapon rack blunt post cap`,
    );
    cap.position.set(x, 1.63, 0);
  }

  const rails = createCarpentryPart(
    "weapon-rack-rails",
    "Weapon rack aligned upper and lower slot rails",
    "weapon-rack-frame",
  );
  const slotCenters = [-0.42, -0.14, 0.14, 0.42] as const;
  const railHeight = 0.25;
  for (const [label, y] of [
    ["Lower", 0.275],
    ["Upper", 1.265],
  ] as const) {
    const rail = addCarpentryMesh(
      rails,
      openWeaponSlotRailGeometry(1.42, railHeight, 0.18, slotCenters, 0.15, 0.13),
      materials.wood,
      `${label} weapon rack four-open-slot U rail`,
    );
    rail.position.set(0, y, 0);
  }
  rails.userData.slotLayout = {
    type: "four-open-u-slots",
    physicalVoid: true,
    centers: [...slotCenters],
    upperSocketY: 1.46,
    lowerSocketY: 0.47,
  };
  const braces = createCarpentryPart(
    "weapon-rack-braces",
    "Weapon rack rear triangular brace assembly",
    "weapon-rack-frame",
  );
  createBeamBetween(
    braces,
    new THREE.Vector3(-0.58, 0.14, -0.12),
    new THREE.Vector3(0.58, 1.27, -0.12),
    0.105,
    0.09,
    0.014,
    materials.wood,
    "Weapon rack long rear diagonal brace",
  );
  for (const x of [-0.69, 0.69]) {
    createBeamBetween(
      braces,
      new THREE.Vector3(x, 0.14, 0.26),
      new THREE.Vector3(x, 0.55, 0.02),
      0.09,
      0.08,
      0.012,
      materials.wood,
      `${x < 0 ? "Left" : "Right"} weapon rack foot brace`,
    );
  }
  addCarpentryRivets(
    posts,
    [-0.69, 0.69].flatMap((x) => [0.12, 0.38, 1.35].map((y) => ({ x, y, z: 0.1 }))),
    materials.iron,
    "Weapon rack joint rivet system",
  );
  const makerPlate = addCarpentryMesh(
    posts,
    new THREE.BoxGeometry(0.22, 0.08, 0.025),
    materials.brass,
    "Weapon rack maker brass plate",
    { surfaceDetail: true },
  );
  makerPlate.position.set(0, 1.33, 0.095);
  root.add(posts, rails, braces);
  for (let slotIndex = 0; slotIndex < 4; slotIndex += 1) {
    const x = slotCenters[slotIndex]!;
    root.add(
      createCarpentrySocket(`Weapon rack slot ${slotIndex + 1}`, "weapon", {
        x,
        y: 1.46,
        z: 0.08,
      }),
      createCarpentrySocket(`Weapon rack lower slot ${slotIndex + 1}`, "weapon-support", {
        x,
        y: 0.47,
        z: 0.08,
      }),
    );
  }
  return root;
}

export function createImageSculptedClutter(
  family: ImageSculptedClutterFamily,
  materials: DungeonMaterials,
  variant = 0,
): THREE.Group {
  const v = Math.abs(Math.trunc(variant)) % 3;
  const root = new THREE.Group();
  root.name = `Image-sculpted ${family} v2 variant ${v + 1}`;
  if (family === "weapon-rack") {
    root.add(weaponRack(materials, v));
    root.scale.set(0.81, 0.98, 1.06);
    return finalizeCarpentryModel(root, {
      id: "weapon-rack",
      family,
      tier: "repeated",
      colliderType: "compound",
      grounded: true,
    });
  }

  const familyMaterials: DungeonMaterials =
    family === "crates"
      ? {
          ...materials,
          wood: materials.wood.clone(),
        }
      : materials;
  if (family === "crates") {
    familyMaterials.wood.name = "Crate shared contrast-tinted aged wood";
    familyMaterials.wood.vertexColors = true;
    familyMaterials.wood.userData.crateWood = true;
  }

  const layouts: ReadonlyArray<ReadonlyArray<readonly [number, number]>> =
    family === "barrels"
      ? [
          [[0, 1]],
          [[0, 1.06]],
          [
            [-0.46, 0.92],
            [0.44, 1],
          ],
        ]
      : family === "crates"
        ? [
            [[0, 1]],
            [
              [-0.44, 0.88],
              [0.43, 1],
            ],
            [
              [-0.42, 0.9],
              [0.4, 0.96],
            ],
          ]
        : [
            [[0, 1]],
            [
              [-0.35, 0.86],
              [0.35, 1],
            ],
            [[0, 1.08]],
          ];
  const layout = layouts[v]!;
  for (const [index, [x, scale]] of layout.entries()) {
    const model =
      family === "barrels"
        ? barrel(familyMaterials, index)
        : family === "crates"
          ? crate(familyMaterials, index)
          : urn(familyMaterials, index);
    model.position.x = x;
    model.scale.setScalar(scale);
    root.add(model);
  }
  if (family === "barrels") root.scale.set(0.91, 0.93, 0.91);
  else if (family === "crates") {
    root.scale.set(0.98, 1.06, 0.84);
    batchCrateGeometry(root, familyMaterials);
  } else root.scale.set(1, 0.93, 1);
  const id = family === "barrels" ? "barrel" : family === "crates" ? "crate" : "urn";
  return finalizeCarpentryModel(root, {
    id,
    family,
    tier: "repeated",
    colliderType: family === "urns" ? "cylinder" : "compound",
    instanceCount: layout.length,
  });
}
