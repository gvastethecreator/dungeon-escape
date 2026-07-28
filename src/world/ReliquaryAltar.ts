import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { DungeonMaterials } from "./MaterialLibrary";

function projectArchitectureUvs<T extends THREE.BufferGeometry>(geometry: T, tileSize = 0.7): T {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  if (!position || !normal) return geometry;
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const nz = Math.abs(normal.getZ(index));
    if (ny >= nx && ny >= nz) {
      uv[index * 2] = x / tileSize;
      uv[index * 2 + 1] = z / tileSize;
    } else if (nx >= nz) {
      uv[index * 2] = z / tileSize;
      uv[index * 2 + 1] = y / tileSize;
    } else {
      uv[index * 2] = x / tileSize;
      uv[index * 2 + 1] = y / tileSize;
    }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function box(
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(projectArchitectureUvs(new THREE.BoxGeometry(...size)), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function pivot(name: string, position: [number, number, number]): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  return group;
}

function pointedPanelGeometry(width: number, height: number, depth: number): THREE.ExtrudeGeometry {
  const shoulder = height * 0.68;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, shoulder);
  shape.lineTo(0, height);
  shape.lineTo(-width / 2, shoulder);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.018,
    bevelThickness: 0.014,
  });
  geometry.translate(0, 0, -depth / 2);
  return projectArchitectureUvs(geometry);
}

function beamBetween(
  name: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  width: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh {
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const delta = end.clone().sub(start);
  const beam = box(
    name,
    [delta.length(), width, depth],
    [midpoint.x, midpoint.y, midpoint.z],
    material,
  );
  beam.rotation.z = Math.atan2(delta.y, delta.x);
  return beam;
}

function mergeDirectMeshes(group: THREE.Group, batchName: string): THREE.Group {
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.updateMatrixWorld(true);
  // Snapshot first because each accepted mesh leaves the source group below.
  for (const child of group.children.slice()) {
    if (!(child instanceof THREE.Mesh)) continue;
    child.updateMatrix();
    const geometry = (
      child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone()
    ).applyMatrix4(child.matrix);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    for (const attribute of Object.keys(geometry.attributes)) {
      if (attribute !== "position" && attribute !== "normal" && attribute !== "uv") {
        geometry.deleteAttribute(attribute);
      }
    }
    geometry.clearGroups();
    const list = batches.get(child.material) ?? [];
    list.push(geometry);
    batches.set(child.material, list);
    group.remove(child);
  }
  let index = 0;
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error(`Could not merge ${batchName}`);
    for (const geometry of geometries) if (geometry !== merged) geometry.dispose();
    const batch = new THREE.Mesh(merged, material);
    batch.name = `${batchName} material batch ${index + 1}`;
    batch.castShadow = true;
    batch.receiveShadow = true;
    group.add(batch);
    index += 1;
  }
  group.userData.mergedDrawCalls = index;
  return group;
}

/** Three-view ImageGen reconstruction with closed panels and action-ready doors. */
export function createReliquaryAltar(baseMaterials: DungeonMaterials): THREE.Group {
  const oak = baseMaterials.wood.clone();
  oak.name = "Reliquary locally lifted warm oak";
  oak.color.offsetHSL(0.015, 0.025, 0.075);
  oak.roughness = Math.min(oak.roughness, 0.86);
  oak.userData.localValueLift = 0.075;

  const forgedIron = baseMaterials.iron.clone();
  forgedIron.name = "Reliquary locally readable forged iron";
  forgedIron.color.offsetHSL(0, -0.025, 0.145);
  forgedIron.roughness = 0.64;
  forgedIron.metalness = 0.44;
  forgedIron.envMapIntensity = Math.max(forgedIron.envMapIntensity, 1.35);
  forgedIron.emissive.copy(forgedIron.color);
  forgedIron.emissiveMap = forgedIron.map;
  forgedIron.emissiveIntensity = 0.115;
  forgedIron.userData.localValueLift = 0.145;

  const agedBrass = baseMaterials.brass.clone();
  agedBrass.name = "Reliquary locally readable aged brass";
  agedBrass.color.offsetHSL(0.005, 0.03, 0.125);
  agedBrass.roughness = 0.62;
  agedBrass.metalness = 0.46;
  agedBrass.envMapIntensity = Math.max(agedBrass.envMapIntensity, 1.05);
  agedBrass.emissive.copy(agedBrass.color);
  agedBrass.emissiveMap = agedBrass.map;
  agedBrass.emissiveIntensity = 0.095;
  agedBrass.userData.localValueLift = 0.125;

  const shrineStone = baseMaterials.stone.clone();
  shrineStone.name = "Reliquary locally lifted shrine stone";
  shrineStone.color.offsetHSL(0, -0.01, 0.045);
  shrineStone.emissive.copy(shrineStone.color);
  shrineStone.emissiveMap = shrineStone.map;
  shrineStone.emissiveIntensity = 0.045;
  shrineStone.userData.localValueLift = 0.045;

  const nicheShadow = baseMaterials.darkStone.clone();
  nicheShadow.name = "Reliquary recessed niche shadow";
  nicheShadow.color.multiplyScalar(0.42);
  nicheShadow.emissive.copy(nicheShadow.color);
  nicheShadow.emissiveMap = nicheShadow.map;
  nicheShadow.emissiveIntensity = 0.018;

  const materials: DungeonMaterials = {
    ...baseMaterials,
    brass: agedBrass,
    darkStone: nicheShadow,
    wood: oak,
    iron: forgedIron,
    stone: shrineStone,
  };
  const root = pivot("Reliquary altar action root", [0, 0, 0]);
  root.userData.asset = "reliquary-altar";
  root.userData.source =
    "assets-source/imagegen/model-references-v2/architecture/reliquary-altar-three-view.png";
  root.userData.reference = root.userData.source;
  root.userData.collider = {
    type: "box",
    size: [2.96, 2.94, 1.23],
    center: [0, 1.47, 0],
  };
  root.userData.qualityContract =
    ".scratch/img2threejs/model-references-v2/architecture/reliquary-altar/spec.json";

  const architecture = pivot("Reliquary static architectural assembly", [0, 0, 0]);
  architecture.add(
    box(
      "Reliquary broad outer altar plinth",
      [2.42, 0.12, 1.14],
      [0, 0.06, 0],
      materials.darkStone,
    ),
    box("Broad chipped plinth", [2.18, 0.16, 1.02], [0, 0.08, 0], materials.darkStone),
    box("Stepped stone base", [1.98, 0.16, 0.9], [0, 0.23, 0], materials.stone),
    box("Cabinet lower oak rail", [1.66, 0.14, 0.68], [0, 0.39, 0], materials.wood),
    box("Cabinet upper oak rail", [1.66, 0.14, 0.68], [0, 1.49, 0], materials.wood),
    box("Cabinet left oak side", [0.14, 1.16, 0.68], [-0.76, 0.94, 0], materials.wood),
    box("Cabinet right oak side", [0.14, 1.16, 0.68], [0.76, 0.94, 0], materials.wood),
  );
  for (const side of [-1, 1]) {
    architecture.add(
      box("Reliquary oak corner post", [0.18, 1.2, 0.78], [side * 0.88, 0.96, 0], materials.wood),
      box(
        "Reliquary corner post foot",
        [0.3, 0.17, 0.9],
        [side * 0.88, 0.39, 0],
        materials.darkStone,
      ),
      box("Reliquary corner post cap", [0.3, 0.17, 0.9], [side * 0.88, 1.51, 0], materials.iron),
    );
  }

  for (let index = 0; index < 4; index += 1) {
    architecture.add(
      box(
        `Cabinet rear oak board ${index + 1}`,
        [0.39, 1.04, 0.075],
        [-0.585 + index * 0.39, 0.94, -0.35],
        materials.wood,
      ),
    );
  }
  architecture.add(
    box("Cabinet rear iron waist strap", [1.54, 0.08, 0.045], [0, 0.91, -0.405], materials.iron),
    beamBetween(
      "Cabinet rear left diagonal brace",
      new THREE.Vector3(-0.68, 0.45, -0.405),
      new THREE.Vector3(0.03, 1.43, -0.405),
      0.09,
      0.045,
      materials.iron,
    ),
    beamBetween(
      "Cabinet rear right diagonal brace",
      new THREE.Vector3(0.68, 0.45, -0.405),
      new THREE.Vector3(-0.03, 1.43, -0.405),
      0.09,
      0.045,
      materials.iron,
    ),
  );

  const sideRivetGeometry = new THREE.SphereGeometry(0.028, 6, 4);
  for (const side of [-1, 1]) {
    architecture.add(
      box(
        "Cabinet side front iron stile",
        [0.045, 0.94, 0.075],
        [side * 0.845, 0.94, 0.25],
        materials.iron,
      ),
      box(
        "Cabinet side rear iron stile",
        [0.045, 0.94, 0.075],
        [side * 0.845, 0.94, -0.25],
        materials.iron,
      ),
      box(
        "Cabinet side iron waist strap",
        [0.045, 0.08, 0.58],
        [side * 0.845, 0.94, 0],
        materials.iron,
      ),
    );
    for (const y of [0.56, 1.32]) {
      for (const z of [-0.25, 0.25]) {
        const rivet = new THREE.Mesh(sideRivetGeometry, materials.iron);
        rivet.name = "Cabinet side iron rivet";
        rivet.position.set(side * 0.875, y, z);
        rivet.castShadow = true;
        architecture.add(rivet);
      }
    }
  }

  architecture.add(
    box("Stone altar ledge understep", [1.98, 0.12, 0.94], [0, 1.54, 0.02], materials.darkStone),
    box("Deep overhanging stone altar slab", [2.22, 0.22, 1.08], [0, 1.68, 0.07], materials.stone),
    box("Reliquary front altar apron", [1.92, 0.26, 0.12], [0, 1.5, 0.47], materials.wood),
    box("Reliquary rear altar apron", [1.92, 0.26, 0.12], [0, 1.5, -0.39], materials.wood),
  );
  const shrineBack = new THREE.Mesh(pointedPanelGeometry(1.88, 1.16, 0.4), materials.wood);
  shrineBack.name = "Peaked oak shrine back";
  shrineBack.position.set(0, 1.65, -0.12);
  shrineBack.castShadow = true;
  shrineBack.receiveShadow = true;
  architecture.add(shrineBack);

  const niche = new THREE.Mesh(pointedPanelGeometry(0.84, 0.9, 0.06), materials.darkStone);
  niche.name = "Shadowed pointed saint niche";
  niche.position.set(0, 1.72, 0.1);
  niche.castShadow = true;
  niche.receiveShadow = true;
  architecture.add(niche);
  architecture.add(
    box("Niche left stone upright", [0.18, 0.68, 0.36], [-0.51, 2.08, 0.23], materials.stone),
    box("Niche right stone upright", [0.18, 0.68, 0.36], [0.51, 2.08, 0.23], materials.stone),
    beamBetween(
      "Niche left pointed arch beam",
      new THREE.Vector3(-0.52, 2.38, 0.23),
      new THREE.Vector3(0, 2.73, 0.23),
      0.18,
      0.36,
      materials.stone,
    ),
    beamBetween(
      "Niche right pointed arch beam",
      new THREE.Vector3(0, 2.73, 0.23),
      new THREE.Vector3(0.52, 2.38, 0.23),
      0.18,
      0.36,
      materials.stone,
    ),
    box("Shrine left side tower", [0.24, 0.9, 0.56], [-0.84, 2.08, 0.1], materials.stone),
    box("Shrine right side tower", [0.24, 0.9, 0.56], [0.84, 2.08, 0.1], materials.stone),
    box("Shrine left tower foot", [0.38, 0.16, 0.66], [-0.84, 1.68, 0.08], materials.darkStone),
    box("Shrine right tower foot", [0.38, 0.16, 0.66], [0.84, 1.68, 0.08], materials.darkStone),
    box("Shrine left tower cap", [0.42, 0.16, 0.68], [-0.84, 2.51, 0.08], materials.iron),
    box("Shrine right tower cap", [0.42, 0.16, 0.68], [0.84, 2.51, 0.08], materials.iron),
    box("Shrine left tower front stile", [0.08, 0.7, 0.08], [-0.84, 2.08, 0.405], materials.iron),
    box("Shrine right tower front stile", [0.08, 0.7, 0.08], [0.84, 2.08, 0.405], materials.iron),
    beamBetween(
      "Reliquary left gable roof edge",
      new THREE.Vector3(-1.03, 2.43, -0.01),
      new THREE.Vector3(0, 2.92, -0.01),
      0.13,
      0.46,
      materials.iron,
    ),
    beamBetween(
      "Reliquary right gable roof edge",
      new THREE.Vector3(0, 2.92, -0.01),
      new THREE.Vector3(1.03, 2.43, -0.01),
      0.13,
      0.46,
      materials.iron,
    ),
    box("Reliquary gable lower tie", [2.18, 0.13, 0.46], [0, 2.45, -0.01], materials.iron),
    beamBetween(
      "Reliquary rear left gable brace",
      new THREE.Vector3(-0.86, 1.78, -0.37),
      new THREE.Vector3(0, 2.71, -0.37),
      0.1,
      0.08,
      materials.iron,
    ),
    beamBetween(
      "Reliquary rear right gable brace",
      new THREE.Vector3(0.86, 1.78, -0.37),
      new THREE.Vector3(0, 2.71, -0.37),
      0.1,
      0.08,
      materials.iron,
    ),
    box("Reliquary rear shrine waist brace", [1.78, 0.09, 0.08], [0, 2.05, -0.39], materials.iron),
  );
  for (const x of [-0.96, 0, 0.96]) {
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.29, 5), materials.iron);
    finial.name = "Reliquary iron finial";
    finial.position.set(x, x === 0 ? 3.08 : 2.76, 0.02);
    finial.castShadow = true;
    architecture.add(finial);
  }
  const gableRivetGeometry = new THREE.SphereGeometry(0.04, 6, 4);
  for (const [x, y] of [
    [0, 2.84],
    [-0.51, 2.58],
    [0.51, 2.58],
  ] as const) {
    const rivet = new THREE.Mesh(gableRivetGeometry, materials.iron);
    rivet.name = "Reliquary gable iron rivet";
    rivet.position.set(x, y, 0.25);
    rivet.castShadow = true;
    architecture.add(rivet);
  }
  const gableMedallion = new THREE.Mesh(new THREE.OctahedronGeometry(0.095, 0), materials.brass);
  gableMedallion.name = "Reliquary gable diamond medallion";
  gableMedallion.scale.z = 0.38;
  gableMedallion.position.set(0, 2.59, 0.29);
  gableMedallion.castShadow = true;
  architecture.add(gableMedallion);
  mergeDirectMeshes(architecture, "Reliquary static architecture");
  architecture.scale.set(1.22, 0.9, 1.08);

  for (const side of [-1, 1]) {
    const door = pivot(`${side < 0 ? "Left" : "Right"} reliquary door hinge`, [
      side * 1.02,
      0.86,
      0.4,
    ]);
    door.userData.socket = {
      type: "hinge",
      axis: [0, 1, 0],
      limit: side < 0 ? [-1.2, 0.05] : [-0.05, 1.2],
    };
    door.userData.collider = { type: "box", size: [0.87, 1.04, 0.11] };
    const doorCenter = -side * 0.43;
    door.add(
      box("Recessed oak door", [0.86, 1.04, 0.06], [doorCenter, 0, 0], materials.wood),
      box("Door inset oak panel", [0.62, 0.7, 0.04], [doorCenter, 0, 0.04], materials.wood),
      box(
        "Door left oak frame stile",
        [0.08, 0.92, 0.09],
        [doorCenter - 0.34, 0, 0.05],
        materials.wood,
      ),
      box(
        "Door right oak frame stile",
        [0.08, 0.92, 0.09],
        [doorCenter + 0.34, 0, 0.05],
        materials.wood,
      ),
      box(
        "Door upper oak frame rail",
        [0.68, 0.08, 0.09],
        [doorCenter, 0.43, 0.05],
        materials.wood,
      ),
      box(
        "Door lower oak frame rail",
        [0.68, 0.08, 0.09],
        [doorCenter, -0.43, 0.05],
        materials.wood,
      ),
      box(
        "Door vertical board seam",
        [0.018, 0.66, 0.016],
        [doorCenter, 0, 0.07],
        materials.darkStone,
      ),
      box("Door iron outer stile", [0.075, 1.02, 0.11], [-side * 0.83, 0, 0.04], materials.iron),
    );
    for (const y of [-0.39, 0.39]) {
      door.add(
        box("Door iron strap", [0.83, 0.07, 0.115], [-side * 0.42, y, 0.045], materials.iron),
      );
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.023, 6, 12), materials.brass);
    ring.name = "Door pull ring";
    ring.position.set(-side * 0.18, 0, 0.09);
    ring.castShadow = true;
    door.add(ring);
    mergeDirectMeshes(door, `${side < 0 ? "Left" : "Right"} reliquary door`);
    root.add(door);
  }

  const rivets = pivot("Iron rivet repetition system", [0, 0, 0]);
  const rivetGeometry = new THREE.SphereGeometry(0.045, 6, 4);
  for (const x of [-0.92, 0.92]) {
    for (const y of [0.5, 0.86, 1.24]) {
      const rivet = new THREE.Mesh(rivetGeometry, materials.iron);
      rivet.name = "Reliquary iron strap rivet";
      rivet.position.set(x, y, 0.47);
      rivet.castShadow = true;
      rivets.add(rivet);
    }
  }

  const candleSockets = pivot("Candle socket rail", [0, 2.36, 0.33]);
  for (const x of [-0.75, 0.75]) {
    const socket = pivot(`Candle socket ${x < 0 ? "left" : "right"}`, [x, 0, 0]);
    socket.userData.socket = { type: "prop", accepts: "candle", localPosition: [0, 0.1, 0] };
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.065, 0.11, 8), materials.iron);
    cup.name = "Reliquary candle iron cup";
    cup.castShadow = true;
    socket.add(cup);
    candleSockets.add(socket);
  }

  const relicSocket = pivot("Reliquary niche relic socket", [0, 2.0, 0.29]);
  relicSocket.userData.socket = { type: "relic", localPosition: [0, 0, 0] };
  relicSocket.userData.nicheClearance = {
    backFrontZ: 0.105,
    frameFrontZ: 0.4,
    depth: 0.295,
  };

  root.add(architecture, candleSockets, rivets, relicSocket);
  root.userData.detailInventory = [
    "three-step broad stone altar plinth",
    "open oak cabinet carcass",
    "two capped oak corner posts",
    "iron-framed cabinet side panels",
    "four rear oak boards with crossed iron braces",
    "two wider action-ready inset double doors with board seams",
    "deep overhanging altar slab with front and rear aprons",
    "large deep pointed saint niche with a thick stone frame",
    "paired capped side towers with front iron stiles",
    "front and rear sloped gable brace systems",
    "three iron finials",
    "two candle sockets and one relic socket",
  ];
  root.userData.sculptRuntime = {
    topology: "closed cabinet panels with separately hinged doors",
    materialRoles: ["wood", "iron", "brass", "stone", "darkStone"],
    staticDrawCalls: architecture.userData.mergedDrawCalls,
    actionPivots: ["Left reliquary door hinge", "Right reliquary door hinge"],
    localContrast: {
      oakValueLift: 0.075,
      stoneValueLift: 0.045,
      ironValueLift: 0.145,
      ironIndirectFill: 0.115,
      brassValueLift: 0.125,
      brassIndirectFill: 0.095,
      nicheValueScale: 0.42,
      nicheFrontRecess: 0.295,
    },
    proportions: {
      staticWidthScale: 1.22,
      staticHeightScale: 0.9,
      staticDepthScale: 1.08,
    },
  };
  return root;
}
