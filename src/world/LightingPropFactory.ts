import * as THREE from "three";

import type { DungeonMaterials } from "./MaterialLibrary";

export type LightingPropFamily =
  | "wall-torch"
  | "wall-lantern"
  | "oil-lantern"
  | "floor-campfire"
  | "brazier"
  | "fluorescent-fixture";

const REFERENCE_ROOT = "assets-source/imagegen/model-references-v2/lighting";

const SOURCE_IMAGES: Readonly<Record<LightingPropFamily, string>> = {
  "wall-torch": `${REFERENCE_ROOT}/wall-torch-three-view.png`,
  "wall-lantern": `${REFERENCE_ROOT}/wall-lantern-three-view.png`,
  "oil-lantern": `${REFERENCE_ROOT}/oil-lantern-three-view.png`,
  "floor-campfire": `${REFERENCE_ROOT}/floor-campfire-three-view.png`,
  brazier: `${REFERENCE_ROOT}/brazier-three-view.png`,
  "fluorescent-fixture": `${REFERENCE_ROOT}/fluorescent-fixture-three-view.png`,
};

const TRIANGLE_BUDGETS: Readonly<Record<LightingPropFamily, { target: number; maximum: number }>> =
  {
    "wall-torch": { target: 1_200, maximum: 2_000 },
    "wall-lantern": { target: 1_100, maximum: 1_800 },
    "oil-lantern": { target: 1_400, maximum: 2_200 },
    "floor-campfire": { target: 900, maximum: 1_500 },
    brazier: { target: 220, maximum: 400 },
    "fluorescent-fixture": { target: 24, maximum: 48 },
  };

interface PartOptions {
  relief?: boolean;
}

function part(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  partId: string,
  materialRole: string,
  { relief = false }: PartOptions = {},
): THREE.Mesh {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  object.userData.partId = partId;
  object.userData.materialRole = materialRole;
  object.userData.closedVolume = true;
  if (relief) object.userData.explodeWithParent = true;
  return object;
}

function pivot(name: string, partId: string): THREE.Group {
  const object = new THREE.Group();
  object.name = name;
  object.userData.partId = partId;
  object.userData.pivot = true;
  return object;
}

function socket(
  name: string,
  type: string,
  position: readonly [number, number, number],
): THREE.Group {
  const object = new THREE.Group();
  object.name = name;
  object.position.set(...position);
  object.userData.socket = { type };
  return object;
}

function triangleCount(root: THREE.Object3D): number {
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = object.geometry.getAttribute("position");
    if (!position) return;
    const solidTriangles = object.geometry.index
      ? object.geometry.index.count / 3
      : position.count / 3;
    triangles += solidTriangles * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });
  return Math.round(triangles);
}

function finish(root: THREE.Group, family: LightingPropFamily): THREE.Group {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const nodes: Record<string, string> = {};
  const sockets: Record<string, { name: string; type: string; localPosition: number[] }> = {};
  const materialRoles = new Set<string>();

  root.traverse((object) => {
    const partId = object.userData.partId as string | undefined;
    if (partId) nodes[partId] = object.name;
    const socketData = object.userData.socket as { type: string } | undefined;
    if (socketData) {
      sockets[object.name] = {
        name: object.name,
        type: socketData.type,
        localPosition: object.position.toArray(),
      };
    }
    if (object instanceof THREE.Mesh) {
      materialRoles.add(String(object.userData.materialRole ?? "unassigned"));
    }
  });

  const nodeIds = Object.keys(nodes);
  const budget = TRIANGLE_BUDGETS[family];
  root.userData.propFamily = family;
  root.userData.sculptRuntime = {
    sourceImage: SOURCE_IMAGES[family],
    specification: `.scratch/img2threejs/model-references-v2/lighting/${family}/spec.json`,
    approximation: "procedural low-poly reconstruction from admitted three-view crops",
    family,
    units: "meters",
    origin:
      family === "oil-lantern" || family === "fluorescent-fixture"
        ? "ceiling-contact"
        : family.startsWith("wall-")
          ? "wall-contact"
          : "floor-contact",
    nodes,
    sockets,
    collider: { type: "box", size: size.toArray(), offset: center.toArray() },
    destructionGroups: {
      mount: nodeIds.filter((id) => id.includes("mount") || id.includes("plate")),
      supports: nodeIds.filter(
        (id) => id.includes("bracket") || id.includes("chain") || id.includes("stem"),
      ),
      body: nodeIds.filter(
        (id) =>
          !id.includes("mount") &&
          !id.includes("plate") &&
          !id.includes("bracket") &&
          !id.includes("chain") &&
          !id.includes("stem"),
      ),
    },
    geometry: {
      triangles: triangleCount(root),
      materialBatches: materialRoles.size,
      materialRoles: [...materialRoles].sort(),
      targetTriangles: budget.target,
      maxTriangles: budget.maximum,
      closedVolumesOnly: true,
    },
    lod: { near: 0, mid: 14, far: 28 },
  };
  return root;
}

function cylinderBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  name: string,
  partId: string,
  materialRole: string,
  radialSegments = 6,
): THREE.Mesh {
  const delta = end.clone().sub(start);
  const object = part(
    new THREE.CylinderGeometry(radius, radius, delta.length(), radialSegments),
    material,
    name,
    partId,
    materialRole,
  );
  object.position.copy(start).add(end).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return object;
}

function clearGlassMaterial(): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xa8c5c7,
    transparent: true,
    opacity: 0.3,
    roughness: 0.16,
    metalness: 0,
    transmission: 0.5,
    thickness: 0.035,
    envMapIntensity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.name = "Oil lantern clear glass material";
  return material;
}

function warmDiffuserMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0xb0a87b,
    emissive: 0x746a3f,
    emissiveIntensity: 0.35,
    roughness: 0.78,
    metalness: 0,
  });
  material.name = "Fluorescent warm diffuser material";
  return material;
}

function charredWoodMaterial(materials: DungeonMaterials): THREE.MeshStandardMaterial {
  const material = materials.wood.clone();
  material.name = "Campfire charred wood material";
  material.color.multiplyScalar(0.16);
  material.emissive.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.roughness = Math.max(0.9, material.roughness);
  material.metalness = 0;
  return material;
}

function blackCoalMaterial(materials: DungeonMaterials): THREE.MeshStandardMaterial {
  const material = materials.darkStone.clone();
  material.name = "Campfire black coal material";
  material.color.setHex(0x171516);
  material.emissive.setHex(0x000000);
  material.emissiveIntensity = 0;
  material.roughness = 1;
  material.metalness = 0;
  return material;
}

function locallyReadableIron(
  materials: DungeonMaterials,
  name: string,
  valueLift: number,
  indirectFill: number,
): THREE.MeshStandardMaterial {
  const material = materials.iron.clone();
  material.name = name;
  material.color.offsetHSL(0, -0.015, valueLift);
  material.roughness = 0.68;
  material.metalness = 0.48;
  material.envMapIntensity = Math.max(material.envMapIntensity, 1.2);
  material.emissive.copy(material.color);
  material.emissiveMap = material.map;
  material.emissiveIntensity = indirectFill;
  material.userData.localValueLift = valueLift;
  return material;
}

function restrainedEmberMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: 0x6f2d17,
    emissive: 0xc34f1d,
    emissiveIntensity: 0.58,
    roughness: 0.88,
    metalness: 0,
    toneMapped: true,
  });
  material.name = "Brazier restrained ember material";
  return material;
}

function paintedMetalMaterial(materials: DungeonMaterials): THREE.MeshStandardMaterial {
  const material = materials.paintedSteel.clone();
  material.name = "Fluorescent painted metal material";
  material.emissive.setHex(0x000000);
  material.emissiveIntensity = 0;
  return material;
}

function createShieldGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.58);
  shape.lineTo(-0.21, -0.42);
  shape.lineTo(-0.22, 0.26);
  shape.lineTo(-0.16, 0.39);
  shape.lineTo(0, 0.58);
  shape.lineTo(0.16, 0.39);
  shape.lineTo(0.22, 0.26);
  shape.lineTo(0.21, -0.42);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.065,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    curveSegments: 2,
    steps: 1,
  });
  geometry.translate(0, 0, -0.055);
  return geometry;
}

function wallTorch(materials: DungeonMaterials): THREE.Group {
  const root = pivot("Wall torch base", "root");
  const plateIron = locallyReadableIron(materials, "Torch dark shield iron", -0.045, 0.025);
  plateIron.roughness = 0.8;
  plateIron.metalness = 0.38;
  const frameIron = locallyReadableIron(materials, "Torch readable forged frame iron", 0.13, 0.105);
  const mount = pivot("Torch wall plate", "wall-mount");
  mount.add(
    part(
      createShieldGeometry(),
      plateIron,
      "Torch forged shield plate",
      "shield-plate",
      "blackened-iron",
    ),
  );

  const crown = part(
    new THREE.BoxGeometry(0.46, 0.075, 0.1),
    frameIron,
    "Torch wall crown",
    "crown-bar",
    "blackened-iron",
  );
  crown.position.set(0, 0.34, 0.03);
  mount.add(crown);
  for (const [index, x] of [-0.115, 0.115].entries()) {
    const bolt = part(
      new THREE.CylinderGeometry(0.034, 0.038, 0.035, 6),
      frameIron,
      `Torch lower front bolt ${index + 1}`,
      `front-bolt-${index + 1}`,
      "blackened-iron",
      { relief: true },
    );
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(x, -0.37, 0.012);
    mount.add(bolt);
  }
  root.add(mount, socket("Wall contact socket", "wall", [0, 0, -0.055]));

  const bracket = pivot("Torch scroll bracket", "scroll-bracket");
  const scrollPoints = [
    new THREE.Vector3(0, -0.25, 0.02),
    new THREE.Vector3(0, -0.12, 0.2),
    new THREE.Vector3(0, 0.03, 0.34),
    new THREE.Vector3(0, 0.17, 0.48),
    new THREE.Vector3(0, 0.32, 0.58),
  ];
  for (let index = 0; index < scrollPoints.length - 1; index += 1) {
    bracket.add(
      cylinderBetween(
        scrollPoints[index]!,
        scrollPoints[index + 1]!,
        0.035,
        frameIron,
        "Torch welded S bracket segment",
        `scroll-segment-${index + 1}`,
        "blackened-iron",
      ),
    );
  }
  for (let index = 1; index < scrollPoints.length - 1; index += 1) {
    const elbow = part(
      new THREE.SphereGeometry(0.038, 6, 4),
      frameIron,
      "Torch welded S bracket elbow",
      `scroll-elbow-${index}`,
      "blackened-iron",
      { relief: true },
    );
    elbow.position.copy(scrollPoints[index]!);
    bracket.add(elbow);
  }
  root.add(bracket);

  const handlePivot = pivot("Torch tapered handle pivot", "handle-pivot");
  const handle = part(
    new THREE.CylinderGeometry(0.12, 0.045, 0.76, 7),
    frameIron,
    "Torch tapered handle",
    "tapered-handle",
    "blackened-iron",
  );
  handle.position.set(0, 0.25, 0.61);
  handlePivot.add(handle);
  const pommel = part(
    new THREE.SphereGeometry(0.075, 7, 5),
    frameIron,
    "Torch handle pommel",
    "handle-pommel",
    "blackened-iron",
    { relief: true },
  );
  pommel.position.set(0, -0.155, 0.61);
  handlePivot.add(pommel);

  const basket = pivot("Torch two-ring basket pivot", "basket-pivot");
  for (const [index, y] of [0.59, 0.78].entries()) {
    const ring = part(
      new THREE.TorusGeometry(index === 0 ? 0.175 : 0.21, 0.028, 6, 14),
      frameIron,
      index === 0 ? "Torch basket lower ring" : "Torch basket upper ring",
      `basket-ring-${index + 1}`,
      "blackened-iron",
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, y, 0.64);
    basket.add(ring);
  }
  const ribGeometry = new THREE.CylinderGeometry(0.022, 0.022, 0.18, 6);
  const ribs = new THREE.InstancedMesh(ribGeometry, frameIron, 2);
  ribs.name = "Torch basket two lateral upright ribs";
  ribs.castShadow = true;
  ribs.receiveShadow = true;
  ribs.userData.partId = "basket-ribs";
  ribs.userData.materialRole = "blackened-iron";
  ribs.userData.closedVolume = true;
  ribs.userData.instanceCount = 2;
  const ribTransform = new THREE.Object3D();
  for (const [index, [x, z, tiltX, tiltZ]] of [
    [-0.145, 0.64, 0, -0.12],
    [0.145, 0.64, 0, 0.12],
  ].entries()) {
    ribTransform.position.set(x, 0.685, z);
    ribTransform.rotation.set(tiltX, 0, tiltZ);
    ribTransform.updateMatrix();
    ribs.setMatrixAt(index, ribTransform.matrix);
  }
  ribs.instanceMatrix.needsUpdate = true;
  basket.add(ribs);
  const coal = blackCoalMaterial(materials);
  coal.name = "Torch black coal material";
  coal.color.setHex(0x3b3130);
  coal.emissive.setHex(0x2e160f);
  coal.emissiveIntensity = 0.1;
  coal.roughness = 1;
  coal.metalness = 0;
  coal.userData.localReadableCoal = true;
  const coalBed = part(
    new THREE.CylinderGeometry(0.145, 0.155, 0.042, 8),
    coal,
    "Torch basket charcoal bed",
    "basket-charcoal-bed",
    "black-coal",
  );
  coalBed.position.set(0, 0.655, 0.64);
  basket.add(coalBed);
  const coalLumps = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.052, 0), coal, 5);
  coalLumps.name = "Torch basket coal lumps";
  coalLumps.castShadow = true;
  coalLumps.receiveShadow = true;
  coalLumps.userData.partId = "basket-coal-lumps";
  coalLumps.userData.materialRole = "black-coal";
  coalLumps.userData.closedVolume = true;
  coalLumps.userData.instanceCount = 5;
  const coalTransform = new THREE.Object3D();
  for (let index = 0; index < coalLumps.count; index += 1) {
    const angle = (index / coalLumps.count) * Math.PI * 2;
    coalTransform.position.set(
      Math.sin(angle) * 0.075,
      0.7 + (index % 2) * 0.014,
      0.64 + Math.cos(angle) * 0.075,
    );
    coalTransform.rotation.set(angle * 0.4, angle, angle * 0.25);
    coalTransform.updateMatrix();
    coalLumps.setMatrixAt(index, coalTransform.matrix);
  }
  coalLumps.instanceMatrix.needsUpdate = true;
  basket.add(coalLumps);
  root.add(handlePivot, basket, socket("Torch flame socket", "flame", [0, 0.86, 0.64]));
  root.userData.detailInventory = [
    "dark hammered shield plate",
    "value-separated forged bracket and basket",
    "oversized two-ring basket with raised matte charcoal bed",
    "preserved flame socket above the coal bed",
  ];
  return finish(root, "wall-torch");
}

function wallLantern(materials: DungeonMaterials): THREE.Group {
  const root = pivot("Wall lantern base", "root");
  const plateIron = locallyReadableIron(materials, "Lantern dark hammered plate iron", -0.04, 0.02);
  plateIron.roughness = 0.8;
  plateIron.metalness = 0.38;
  const frameIron = locallyReadableIron(materials, "Lantern readable cage iron", 0.085, 0.07);
  const mount = pivot("Lantern wall mount pivot", "wall-mount");
  const plate = part(
    new THREE.BoxGeometry(0.58, 1.2, 0.075),
    plateIron,
    "Lantern rectangular iron wall plate",
    "wall-plate",
    "blackened-iron",
  );
  mount.add(plate);
  for (const [index, [x, y]] of [
    [-0.245, 0.44],
    [0.245, 0.44],
    [-0.245, -0.51],
    [0.245, -0.51],
  ].entries()) {
    const rivet = part(
      new THREE.CylinderGeometry(0.03, 0.034, 0.032, 7),
      materials.brass,
      `Lantern front brass rivet ${index + 1}`,
      `front-rivet-${index + 1}`,
      "aged-brass",
      { relief: true },
    );
    rivet.rotation.x = Math.PI / 2;
    rivet.position.set(x, y, 0.055);
    mount.add(rivet);
  }
  root.add(mount, socket("Lantern wall contact socket", "wall", [0, 0, -0.038]));

  const bracket = part(
    new THREE.BoxGeometry(0.1, 0.1, 0.52),
    frameIron,
    "Lantern straight projecting bracket",
    "straight-bracket",
    "blackened-iron",
  );
  bracket.position.set(0, 0.33, 0.27);
  root.add(bracket);

  const cage = pivot("Lantern cage pivot", "cage-pivot");
  for (const [index, y] of [0.25, -0.31].entries()) {
    const ring = part(
      new THREE.TorusGeometry(0.165, 0.028, 6, 16),
      frameIron,
      index === 0 ? "Lantern cage upper ring" : "Lantern cage lower ring",
      `cage-ring-${index + 1}`,
      "blackened-iron",
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, y, 0.57);
    cage.add(ring);
  }
  for (const [index, x] of [-0.135, 0.135].entries()) {
    const bar = part(
      new THREE.CylinderGeometry(0.012, 0.012, 0.56, 6),
      frameIron,
      `Lantern fixed cage bar ${index + 1}`,
      `fixed-cage-bar-${index + 1}`,
      "blackened-iron",
    );
    bar.position.set(x, -0.03, 0.57);
    cage.add(bar);
  }

  const hinge = pivot("Lantern cage door hinge", "door-hinge");
  hinge.position.set(-0.15, -0.03, 0.585);
  hinge.rotation.y = -0.95;
  hinge.userData.socket = {
    type: "hinge",
    axis: [0, 1, 0],
    range: [-1.25, 0.05],
    restRadians: -0.95,
  };
  const doorWidth = 0.3;
  const doorHeight = 0.46;
  const doorRail = 0.026;
  for (const [name, size, x, y] of [
    ["left", [doorRail, doorHeight - doorRail * 2, 0.024], doorRail / 2, 0],
    ["right", [doorRail, doorHeight - doorRail * 2, 0.024], doorWidth - doorRail / 2, 0],
    ["upper", [doorWidth, doorRail, 0.024], doorWidth / 2, doorHeight / 2 - doorRail / 2],
    ["lower", [doorWidth, doorRail, 0.024], doorWidth / 2, -doorHeight / 2 + doorRail / 2],
  ] as const) {
    const rail = part(
      new THREE.BoxGeometry(...size),
      frameIron,
      `Lantern open cage door ${name} rail`,
      `open-cage-door-${name}-rail`,
      "blackened-iron",
    );
    rail.position.set(x, y, 0);
    hinge.add(rail);
  }
  for (const [index, y] of [-0.15, 0.15].entries()) {
    const barrel = part(
      new THREE.CylinderGeometry(0.022, 0.022, 0.11, 6),
      frameIron,
      `Lantern hinge barrel ${index + 1}`,
      `hinge-barrel-${index + 1}`,
      "blackened-iron",
      { relief: true },
    );
    barrel.position.y = y;
    hinge.add(barrel);
  }
  cage.add(hinge);

  const reservoir = part(
    new THREE.CylinderGeometry(0.11, 0.15, 0.13, 8),
    materials.brass,
    "Lantern squat brass reservoir",
    "brass-reservoir",
    "aged-brass",
  );
  reservoir.position.set(0, -0.2, 0.57);
  const wickCollar = part(
    new THREE.CylinderGeometry(0.065, 0.075, 0.04, 8),
    materials.brass,
    "Lantern brass wick collar",
    "brass-wick-collar",
    "aged-brass",
  );
  wickCollar.position.set(0, -0.115, 0.57);
  const wick = part(
    new THREE.CylinderGeometry(0.018, 0.022, 0.075, 6),
    blackCoalMaterial(materials),
    "Lantern charred wick",
    "charred-wick",
    "black-coal",
  );
  wick.position.set(0, -0.06, 0.57);
  cage.add(reservoir, wickCollar, wick);
  root.add(cage, socket("Lantern flame socket", "flame", [0, 0.03, 0.57]));
  root.userData.detailInventory = [
    "dark hammered mount plate",
    "thin value-separated cage rails",
    "open four-rail service door",
    "visible brass reservoir, wick collar, and flame socket",
  ];
  return finish(root, "wall-lantern");
}

function oilLantern(materials: DungeonMaterials): THREE.Group {
  const root = pivot("Oil lantern base", "root");
  const ceilingPlate = part(
    new THREE.CylinderGeometry(0.15, 0.15, 0.065, 10),
    materials.iron,
    "Oil lantern round ceiling plate",
    "ceiling-mount",
    "blackened-iron",
  );
  ceilingPlate.position.y = -0.0325;
  root.add(ceilingPlate, socket("Oil lantern ceiling socket", "ceiling", [0, 0, 0]));

  const chain = pivot("Oil lantern five-link chain pivot", "chain-pivot");
  for (let index = 0; index < 5; index += 1) {
    const link = part(
      new THREE.TorusGeometry(0.052, 0.014, 6, 12),
      materials.iron,
      `Oil lantern chain link ${index + 1}`,
      `chain-link-${index + 1}`,
      "blackened-iron",
    );
    link.scale.y = 1.35;
    link.rotation.y = (index % 2) * (Math.PI / 2);
    link.position.y = -0.12 - index * 0.105;
    chain.add(link);
  }
  root.add(chain);

  const body = pivot("Oil lantern body pivot", "body-pivot");
  const dome = part(
    new THREE.CylinderGeometry(0.235, 0.31, 0.19, 10),
    materials.iron,
    "Oil lantern faceted iron dome",
    "faceted-dome",
    "blackened-iron",
  );
  dome.position.y = -0.76;
  const roofEye = part(
    new THREE.TorusGeometry(0.075, 0.016, 6, 12),
    materials.iron,
    "Oil lantern load-bearing roof eye",
    "roof-hanger-eye",
    "blackened-iron",
  );
  roofEye.position.y = -0.655;
  roofEye.rotation.y = Math.PI / 2 - 0.45;
  roofEye.userData.attachedTo = ["chain-link-5", "faceted-dome"];
  body.add(dome, roofEye);

  for (const [index, y] of [-0.88, -1.27].entries()) {
    const ring = part(
      new THREE.TorusGeometry(0.23, 0.024, 6, 16),
      materials.iron,
      index === 0 ? "Oil lantern top cage ring" : "Oil lantern lower cage ring",
      `cage-ring-${index + 1}`,
      "blackened-iron",
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    body.add(ring);
  }
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2;
    const bar = part(
      new THREE.CylinderGeometry(0.016, 0.016, 0.39, 6),
      materials.iron,
      `Oil lantern cage bar ${index + 1}`,
      `cage-bar-${index + 1}`,
      "blackened-iron",
    );
    bar.position.set(Math.cos(angle) * 0.205, -1.075, Math.sin(angle) * 0.205);
    body.add(bar);
  }
  const glass = part(
    new THREE.CylinderGeometry(0.19, 0.19, 0.34, 12),
    clearGlassMaterial(),
    "Oil lantern clear glass chamber",
    "glass-chamber",
    "clear-glass",
  );
  glass.position.y = -1.075;
  body.add(glass);

  const wickCollar = part(
    new THREE.CylinderGeometry(0.105, 0.115, 0.08, 10),
    materials.brass,
    "Oil lantern brass wick collar",
    "wick-collar",
    "aged-brass",
  );
  wickCollar.position.y = -1.23;
  const reservoir = part(
    new THREE.SphereGeometry(0.25, 10, 6),
    materials.brass,
    "Oil lantern flattened brass reservoir",
    "brass-reservoir",
    "aged-brass",
  );
  reservoir.scale.y = 0.42;
  reservoir.position.y = -1.38;
  body.add(wickCollar, reservoir);
  root.add(body, socket("Oil lantern flame socket", "flame", [0, -1.13, 0]));
  return finish(root, "oil-lantern");
}

function floorCampfire(materials: DungeonMaterials, variant: number): THREE.Group {
  const root = pivot("Floor campfire base", "root");
  root.rotation.y = (variant % 4) * (Math.PI / 5);
  root.add(socket("Campfire floor contact socket", "floor", [0, 0, 0]));

  const ash = part(
    new THREE.CylinderGeometry(0.48, 0.5, 0.045, 10),
    materials.darkStone,
    "Campfire ash bed",
    "decagonal-ash-pan",
    "ash-stone",
  );
  ash.position.y = 0.0225;
  root.add(ash);

  const ring = pivot("Campfire stone ring", "stone-ring-pivot");
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2 + (index % 2) * 0.035;
    const stone = part(
      new THREE.DodecahedronGeometry(0.105 + (index % 3) * 0.008, 0),
      materials.stone,
      `Campfire ring stone ${index + 1}`,
      `ring-stone-${index + 1}`,
      "faceted-stone",
    );
    stone.scale.set(1.12 + (index % 2) * 0.08, 0.72 + (index % 3) * 0.04, 0.94);
    stone.position.set(Math.sin(angle) * 0.39, 0.11, Math.cos(angle) * 0.39);
    stone.rotation.set(0.05 * (index % 2), angle, 0.04 * ((index % 3) - 1));
    ring.add(stone);
  }
  root.add(ring);

  const logs = pivot("Campfire log triangle", "log-triangle-pivot");
  const charredWood = charredWoodMaterial(materials);
  const logAngles = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];
  for (const [index, angle] of logAngles.entries()) {
    const start = new THREE.Vector3(Math.sin(angle) * 0.24, 0.15, Math.cos(angle) * 0.24);
    const apexAngle = angle + Math.PI;
    const end = new THREE.Vector3(Math.sin(apexAngle) * 0.025, 0.43, Math.cos(apexAngle) * 0.025);
    const log = cylinderBetween(
      start,
      end,
      0.06,
      charredWood,
      `Campfire charred log ${index + 1}`,
      `charred-log-${index + 1}`,
      "charred-wood",
    );
    logs.add(log);
  }
  root.add(logs);

  const coals = pivot("Campfire coal bed", "coal-bed-pivot");
  const blackCoal = blackCoalMaterial(materials);
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    const coal = part(
      new THREE.DodecahedronGeometry(0.052 + (index % 2) * 0.008, 0),
      blackCoal,
      `Campfire coal lump ${index + 1}`,
      `coal-lump-${index + 1}`,
      "black-coal",
    );
    coal.position.set(Math.cos(angle) * 0.09, 0.105 + (index % 2) * 0.012, Math.sin(angle) * 0.09);
    coal.rotation.set(angle * 0.7, angle, angle * 0.4);
    coals.add(coal);
  }
  root.add(
    coals,
    socket("Campfire flame socket", "flame", [0, 0.32, 0]),
    socket("Campfire smoke socket", "smoke", [0, 0.58, 0]),
  );
  return finish(root, "floor-campfire");
}

function createClosedBowlGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.13, -0.16),
    new THREE.Vector2(0.38, -0.1),
    new THREE.Vector2(0.48, 0.08),
    new THREE.Vector2(0.5, 0.17),
    new THREE.Vector2(0.42, 0.18),
    new THREE.Vector2(0.39, 0.09),
    new THREE.Vector2(0.31, -0.035),
    new THREE.Vector2(0.13, -0.08),
    new THREE.Vector2(0.13, -0.16),
  ];
  return new THREE.LatheGeometry(profile, 8);
}

function brazier(materials: DungeonMaterials): THREE.Group {
  const root = pivot("Brazier base", "root");
  root.add(socket("Brazier floor contact socket", "floor", [0, 0, 0]));
  const iron = locallyReadableIron(materials, "Brazier readable black iron", 0.065, 0.045);
  const lowerFoot = part(
    new THREE.CylinderGeometry(0.29, 0.32, 0.12, 8),
    iron,
    "Brazier broad octagonal lower foot",
    "lower-foot",
    "blackened-iron",
  );
  lowerFoot.position.y = 0.06;
  const upperFoot = part(
    new THREE.CylinderGeometry(0.24, 0.28, 0.1, 8),
    iron,
    "Brazier stepped octagonal upper foot",
    "upper-foot",
    "blackened-iron",
  );
  upperFoot.position.y = 0.17;
  const stem = part(
    new THREE.CylinderGeometry(0.17, 0.235, 0.52, 8),
    iron,
    "Brazier centered octagonal tapered stem",
    "octagonal-stem",
    "blackened-iron",
  );
  stem.position.y = 0.46;
  const collar = part(
    new THREE.CylinderGeometry(0.245, 0.225, 0.1, 8),
    iron,
    "Brazier octagonal bowl support collar",
    "bowl-support-collar",
    "blackened-iron",
  );
  collar.position.y = 0.75;
  const bowl = part(
    createClosedBowlGeometry(),
    iron,
    "Brazier shallow octagonal iron bowl",
    "octagonal-bowl",
    "blackened-iron",
  );
  bowl.position.y = 0.93;
  const rim = part(
    new THREE.TorusGeometry(0.495, 0.03, 4, 8),
    iron,
    "Brazier thin octagonal rolled rim",
    "octagonal-rim",
    "blackened-iron",
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.105;

  const coal = blackCoalMaterial(materials);
  coal.name = "Brazier black coal material";
  const coalBed = part(
    new THREE.CylinderGeometry(0.34, 0.37, 0.055, 8),
    coal,
    "Brazier recessed charcoal bed",
    "charcoal-bed",
    "black-coal",
  );
  coalBed.position.y = 1.055;
  const coalLumps = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.072, 0), coal, 5);
  coalLumps.name = "Brazier faceted coal lumps";
  coalLumps.castShadow = true;
  coalLumps.receiveShadow = true;
  coalLumps.userData.partId = "coal-lumps";
  coalLumps.userData.materialRole = "black-coal";
  coalLumps.userData.closedVolume = true;
  coalLumps.userData.instanceCount = 5;
  const ember = restrainedEmberMaterial();
  const emberLumps = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.046, 0), ember, 4);
  emberLumps.name = "Brazier restrained ember nodes";
  emberLumps.castShadow = true;
  emberLumps.receiveShadow = true;
  emberLumps.userData.partId = "ember-nodes";
  emberLumps.userData.materialRole = "restrained-ember";
  emberLumps.userData.closedVolume = true;
  emberLumps.userData.instanceCount = 4;
  const transform = new THREE.Object3D();
  for (let index = 0; index < coalLumps.count; index += 1) {
    const angle = (index / coalLumps.count) * Math.PI * 2 + 0.2;
    transform.position.set(
      Math.sin(angle) * 0.21,
      1.105 + (index % 2) * 0.018,
      Math.cos(angle) * 0.2,
    );
    transform.rotation.set(angle * 0.4, angle, angle * 0.25);
    transform.updateMatrix();
    coalLumps.setMatrixAt(index, transform.matrix);
  }
  coalLumps.instanceMatrix.needsUpdate = true;
  for (let index = 0; index < emberLumps.count; index += 1) {
    const angle = (index / emberLumps.count) * Math.PI * 2 + 0.65;
    transform.position.set(Math.sin(angle) * 0.13, 1.115, Math.cos(angle) * 0.12);
    transform.rotation.set(angle * 0.3, angle, angle * 0.2);
    transform.updateMatrix();
    emberLumps.setMatrixAt(index, transform.matrix);
  }
  emberLumps.instanceMatrix.needsUpdate = true;

  root.add(
    lowerFoot,
    upperFoot,
    stem,
    collar,
    bowl,
    rim,
    coalBed,
    coalLumps,
    emberLumps,
    socket("Brazier flame socket", "flame", [0, 1.19, 0]),
  );
  root.userData.detailInventory = [
    "two-step octagonal foot",
    "tapered octagonal stem and support collar",
    "shallow closed bowl with thin rolled rim",
    "recessed coal bed with restrained ember nodes",
  ];
  return finish(root, "brazier");
}

function fluorescentFixture(materials: DungeonMaterials): THREE.Group {
  const root = pivot("Fluorescent fixture base", "root");
  const housing = part(
    new THREE.BoxGeometry(1.72, 0.08, 0.48),
    paintedMetalMaterial(materials),
    "Fluorescent plain metal housing",
    "metal-housing",
    "painted-metal",
  );
  housing.position.y = -0.04;
  const diffuser = part(
    new THREE.BoxGeometry(1.5, 0.035, 0.31),
    warmDiffuserMaterial(),
    "Fluorescent inset warm diffuser",
    "inset-diffuser",
    "warm-diffuser",
  );
  diffuser.castShadow = false;
  diffuser.position.y = -0.0975;
  root.add(
    housing,
    diffuser,
    socket("Fluorescent ceiling socket", "ceiling", [0, 0, 0]),
    socket("Fluorescent light socket", "area-light", [0, -0.12, 0]),
  );
  return finish(root, "fluorescent-fixture");
}

export function createLightingPropBase(
  family: LightingPropFamily,
  materials: DungeonMaterials,
  variant = 0,
): THREE.Group {
  if (family === "wall-torch") return wallTorch(materials);
  if (family === "wall-lantern") return wallLantern(materials);
  if (family === "oil-lantern") return oilLantern(materials);
  if (family === "floor-campfire") return floorCampfire(materials, variant);
  if (family === "brazier") return brazier(materials);
  return fluorescentFixture(materials);
}
