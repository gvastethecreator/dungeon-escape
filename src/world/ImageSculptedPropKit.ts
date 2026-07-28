import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import type { DungeonMaterials } from "./MaterialLibrary";

export type ImageSculptedPropFamily =
  | "high-chair"
  | "ritual-table"
  | "wall-lantern"
  | "ossuary-cabinet";

export type CarpentryTier = "repeated" | "hero";

const CARPENTRY_REFERENCE_ROOT = "assets-source/imagegen/model-references-v2/carpentry";
const CARPENTRY_SPEC_ROOT = ".scratch/img2threejs/model-references-v2/carpentry";

interface CarpentryFinishOptions {
  id: string;
  family: string;
  tier: CarpentryTier;
  sourceImage?: string;
  specification?: string;
  colliderType?: "box" | "cylinder" | "compound";
  instanceCount?: number;
  limitations?: readonly string[];
  grounded?: boolean;
  targetTriangles?: number;
  maxTriangles?: number;
  maxMaterialBatches?: number;
}

interface CarpentryMeshOptions {
  surfaceDetail?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute("position");
  if (!position) return 0;
  return (geometry.index?.count ?? position.count) / 3;
}

function closestPartId(object: THREE.Object3D): string {
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    const partId = cursor.userData.sculptPartId;
    if (typeof partId === "string") return partId;
    cursor = cursor.parent;
  }
  return "root";
}

export function createCarpentryPart(id: string, name: string, destructionGroup = id): THREE.Group {
  const part = new THREE.Group();
  part.name = name;
  part.userData.sculptPartId = id;
  part.userData.sculptPartDefinition = true;
  part.userData.destructionGroup = destructionGroup;
  return part;
}

export function addCarpentryMesh(
  part: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  options: CarpentryMeshOptions = {},
): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.castShadow = options.castShadow ?? true;
  result.receiveShadow = options.receiveShadow ?? true;
  result.userData.sculptPartId = closestPartId(part);
  if (options.surfaceDetail) result.userData.explodeWithParent = true;
  part.add(result);
  return result;
}

export function createCarpentrySocket(
  name: string,
  type: string,
  position: THREE.Vector3Like,
  extra: Record<string, unknown> = {},
): THREE.Group {
  const node = new THREE.Group();
  node.name = name;
  node.position.set(position.x, position.y, position.z);
  node.userData.socket = { type, ...extra };
  return node;
}

export function taperedChamferBoxGeometry(
  size: readonly [number, number, number],
  radius: number,
  bottomScale = 1,
  topScale = 1,
): THREE.BufferGeometry {
  const geometry = new RoundedBoxGeometry(size[0], size[1], size[2], 1, radius);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const halfHeight = Math.max(0.0001, size[1] / 2);
  for (let index = 0; index < position.count; index += 1) {
    const normalizedY = THREE.MathUtils.clamp(
      (position.getY(index) + halfHeight) / (halfHeight * 2),
      0,
      1,
    );
    const scale = THREE.MathUtils.lerp(bottomScale, topScale, normalizedY);
    position.setX(index, position.getX(index) * scale);
    position.setZ(index, position.getZ(index) * scale);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export function createArchedPanelGeometry(
  width: number,
  height: number,
  depth: number,
  shoulderHeight = height * 0.7,
): THREE.ExtrudeGeometry {
  const halfWidth = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  shape.lineTo(halfWidth, 0);
  shape.lineTo(halfWidth, shoulderHeight);
  shape.quadraticCurveTo(halfWidth, height, 0, height);
  shape.quadraticCurveTo(-halfWidth, height, -halfWidth, shoulderHeight);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: Math.min(0.025, depth * 0.2),
    bevelThickness: Math.min(0.018, depth * 0.16),
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function createCurvedRoofPlankGeometry(
  innerRadius: number,
  outerRadius: number,
  depth: number,
  startAngle: number,
  endAngle: number,
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(Math.cos(startAngle) * innerRadius, Math.sin(startAngle) * innerRadius);
  shape.lineTo(Math.cos(startAngle) * outerRadius, Math.sin(startAngle) * outerRadius);
  shape.lineTo(Math.cos(endAngle) * outerRadius, Math.sin(endAngle) * outerRadius);
  shape.lineTo(Math.cos(endAngle) * innerRadius, Math.sin(endAngle) * innerRadius);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

export function createBeamBetween(
  part: THREE.Group,
  start: THREE.Vector3,
  end: THREE.Vector3,
  width: number,
  depth: number,
  radius: number,
  material: THREE.Material,
  name: string,
  options: CarpentryMeshOptions = {},
): THREE.Mesh {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const result = addCarpentryMesh(
    part,
    taperedChamferBoxGeometry([width, length, depth], radius),
    material,
    name,
    options,
  );
  result.position.copy(start).add(end).multiplyScalar(0.5);
  result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return result;
}

export function addCarpentryRivets(
  parent: THREE.Group,
  positions: readonly THREE.Vector3Like[],
  material: THREE.Material,
  name: string,
  radius = 0.026,
): THREE.Group {
  const system = new THREE.Group();
  system.name = name;
  system.userData.sculptPartId = closestPartId(parent);
  system.userData.explodeWithParent = true;
  system.userData.repetitionSystem = {
    type: "fastener",
    count: positions.length,
    realization: "shared low-poly geometry; static material batching collapses the final draw",
  };
  const geometry = new THREE.SphereGeometry(radius, 5, 4);
  positions.forEach((position, index) => {
    const rivet = addCarpentryMesh(system, geometry, material, `${name} rivet ${index + 1}`, {
      surfaceDetail: true,
    });
    rivet.position.set(position.x, position.y, position.z);
  });
  parent.add(system);
  return system;
}

export function finalizeCarpentryModel(
  root: THREE.Group,
  options: CarpentryFinishOptions,
): THREE.Group {
  let grounding:
    | { axis: "y"; sourceMinY: number; targetMinY: number; appliedOffset: number }
    | undefined;
  if (options.grounded) {
    root.updateMatrixWorld(true);
    const sourceMinY = new THREE.Box3().setFromObject(root).min.y;
    const targetMinY = 0.001;
    const appliedOffset = targetMinY - sourceMinY;
    if (Number.isFinite(appliedOffset)) root.position.y += appliedOffset;
    grounding = { axis: "y", sourceMinY, targetMinY, appliedOffset };
  }
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const nodes: Record<string, THREE.Object3D> = {};
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const destructionGroups: Record<string, string[]> = {};
  const materialIds = new Set<string>();
  let triangles = 0;
  let meshIndex = 0;

  root.traverse((object) => {
    if (object !== root && object.userData.sculptPartDefinition === true) {
      const partId = closestPartId(object);
      nodes[partId] = object;
      const group = String(object.userData.destructionGroup ?? partId);
      (destructionGroups[group] ??= []).push(partId);
    }
    if (object.userData.socket) sockets[object.name] = object;
    if (!(object instanceof THREE.Mesh)) return;
    const partId = closestPartId(object);
    object.userData.sculptPartId = partId;
    if (!object.name) object.name = `${options.id} mesh ${meshIndex + 1}`;
    meshes[`${partId}/${object.name}/${meshIndex}`] = object;
    triangles +=
      triangleCount(object.geometry) * (object instanceof THREE.InstancedMesh ? object.count : 1);
    const assigned = Array.isArray(object.material) ? object.material : [object.material];
    assigned.forEach((material) => materialIds.add(material.uuid));
    meshIndex += 1;
  });

  const tierBudget =
    options.tier === "hero"
      ? { targetTriangles: 3000, maxTriangles: 5000, maxMaterialBatches: 6 }
      : { targetTriangles: 1500, maxTriangles: 3000, maxMaterialBatches: 3 };
  const budget = {
    targetTriangles: options.targetTriangles ?? tierBudget.targetTriangles,
    maxTriangles: options.maxTriangles ?? tierBudget.maxTriangles,
    maxMaterialBatches: options.maxMaterialBatches ?? tierBudget.maxMaterialBatches,
  };
  const collider = {
    id: `${options.id}-bounds`,
    type: options.colliderType ?? "box",
    size: size.toArray(),
    offset: center.toArray(),
    isTrigger: false,
  };
  root.userData.propFamily = options.family;
  root.userData.detailInventory = Object.values(meshes).map((item) => item.name);
  root.userData.sculptRuntime = {
    sourceImage: options.sourceImage ?? `${CARPENTRY_REFERENCE_ROOT}/${options.id}-three-view.png`,
    specification: options.specification ?? `${CARPENTRY_SPEC_ROOT}/${options.id}/spec.json`,
    family: options.family,
    units: "meters",
    nodes,
    meshes,
    sockets,
    colliders: [collider],
    collider,
    destructionGroups,
    parts: nodes,
    lod: { near: 0, mid: 16, far: 30 },
    performance: {
      ...budget,
      instanceCount: options.instanceCount ?? 1,
      triangles: Math.round(triangles),
      trianglesPerInstance: Math.round(triangles / Math.max(1, options.instanceCount ?? 1)),
      sourceMeshes: meshIndex,
      materialBatches: materialIds.size,
      staticBatching: "one merged geometry per shared material in StaticDungeonScene",
    },
    assembly: {
      explodable: true,
      clickable: true,
      partIdentity: "sculptPartId is shared by picking and explode layout",
    },
    grounding,
    limitations: [
      "Procedural low-poly reconstruction; hidden interiors stay approximate.",
      "Reference-derived material evidence is implemented through the project shared PBR stacks.",
      ...(options.limitations ?? []),
    ],
  };
  return root;
}

function addSeatPlanks(
  part: THREE.Group,
  materials: DungeonMaterials,
  count: number,
  width: number,
  depth: number,
  y: number,
): void {
  const gap = 0.014;
  const plankWidth = (width - gap * (count - 1)) / count;
  for (let index = 0; index < count; index += 1) {
    const plank = addCarpentryMesh(
      part,
      taperedChamferBoxGeometry([plankWidth, 0.115, depth], 0.025, 1.01, 0.99),
      materials.wood,
      `Seat plank ${index + 1}`,
    );
    plank.position.set(-width / 2 + plankWidth / 2 + index * (plankWidth + gap), y, 0);
  }
}

function highChair(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted iron-bound high chair v2";

  const seat = createCarpentryPart("seat-frame", "High chair seat frame", "seat-frame");
  addSeatPlanks(seat, materials, 4, 0.76, 0.62, 0.71);
  for (const z of [-0.27, 0.27]) {
    const apron = addCarpentryMesh(
      seat,
      taperedChamferBoxGeometry([0.8, 0.14, 0.09], 0.018),
      z > 0 ? materials.iron : materials.wood,
      z > 0 ? "High chair front iron-bound apron" : "High chair rear timber apron",
    );
    apron.position.set(0, 0.625, z);
  }

  const legs = createCarpentryPart("leg-frame", "High chair tapered leg frame", "leg-frame");
  for (const x of [-0.34, 0.34]) {
    for (const z of [-0.27, 0.27]) {
      const isRear = z < 0;
      const height = isRear ? 1.78 : 0.68;
      const leg = addCarpentryMesh(
        legs,
        taperedChamferBoxGeometry([0.105, height, 0.105], 0.018, 1.16, 0.94),
        materials.wood,
        `${isRear ? "Rear post" : "Front leg"} ${x < 0 ? "left" : "right"}`,
      );
      leg.position.set(x, height / 2, z);
    }
  }
  for (const z of [-0.27, 0.27]) {
    const stretcher = addCarpentryMesh(
      legs,
      taperedChamferBoxGeometry([0.69, 0.075, 0.075], 0.012),
      materials.wood,
      `${z < 0 ? "Rear" : "Front"} lower stretcher`,
    );
    stretcher.position.set(0, 0.27, z);
  }
  for (const x of [-0.34, 0.34]) {
    const stretcher = addCarpentryMesh(
      legs,
      taperedChamferBoxGeometry([0.075, 0.075, 0.55], 0.012),
      materials.wood,
      `${x < 0 ? "Left" : "Right"} lower stretcher`,
    );
    stretcher.position.set(x, 0.29, 0);
  }

  const back = createCarpentryPart("arched-back", "High chair arched back", "back-assembly");
  const panel = addCarpentryMesh(
    back,
    createArchedPanelGeometry(0.64, 1.03, 0.105, 0.68),
    materials.wood,
    "High chair arched plank back panel",
  );
  panel.position.set(0, 0.69, -0.285);
  for (const x of [-0.24, -0.08, 0.08, 0.24]) {
    const seam = addCarpentryMesh(
      back,
      new THREE.BoxGeometry(0.012, 0.72, 0.012),
      materials.iron,
      "High chair recessed back plank seam",
      { surfaceDetail: true },
    );
    seam.position.set(x, 1.12, -0.225);
  }
  for (const x of [-0.35, 0.35]) {
    const strap = addCarpentryMesh(
      back,
      taperedChamferBoxGeometry([0.105, 1.12, 0.035], 0.014),
      materials.iron,
      `${x < 0 ? "Left" : "Right"} high chair back strap`,
      { surfaceDetail: true },
    );
    strap.position.set(x, 1.21, -0.218);
    const cap = addCarpentryMesh(
      back,
      taperedChamferBoxGeometry([0.14, 0.18, 0.14], 0.024, 1.04, 0.88),
      materials.wood,
      `${x < 0 ? "Left" : "Right"} blunt post cap`,
    );
    cap.position.set(x, 1.74, -0.285);
  }
  for (const y of [0.9, 1.36]) {
    const band = addCarpentryMesh(
      back,
      new THREE.BoxGeometry(0.72, 0.065, 0.04),
      materials.iron,
      "High chair horizontal iron back band",
      { surfaceDetail: true },
    );
    band.position.set(0, y, -0.218);
  }
  const crown = addCarpentryMesh(
    back,
    new THREE.TorusGeometry(0.315, 0.038, 4, 12, Math.PI),
    materials.iron,
    "High chair segmented iron crown",
    { surfaceDetail: true },
  );
  crown.position.set(0, 1.38, -0.218);

  const arms = createCarpentryPart("armrests", "High chair armrests", "seat-frame");
  for (const x of [-0.38, 0.38]) {
    const arm = addCarpentryMesh(
      arms,
      taperedChamferBoxGeometry([0.12, 0.1, 0.62], 0.024, 1.04, 0.96),
      materials.wood,
      `${x < 0 ? "Left" : "Right"} high chair armrest`,
    );
    arm.position.set(x, 0.98, -0.01);
    const support = addCarpentryMesh(
      arms,
      taperedChamferBoxGeometry([0.09, 0.3, 0.09], 0.016, 1.12, 0.94),
      materials.wood,
      `${x < 0 ? "Left" : "Right"} arm support`,
    );
    support.position.set(x, 0.82, 0.24);
  }

  addCarpentryRivets(
    back,
    [-0.31, 0.31].flatMap((x) => [0.9, 1.36].map((y) => ({ x, y, z: -0.19 }))),
    materials.brass,
    "High chair back strap rivet system",
  );
  addCarpentryRivets(
    seat,
    [-0.32, 0, 0.32].map((x) => ({ x, y: 0.625, z: 0.332 })),
    materials.brass,
    "High chair apron rivet system",
  );
  root.add(
    seat,
    legs,
    back,
    arms,
    createCarpentrySocket("High chair seat socket", "seated-actor", {
      x: 0,
      y: 0.82,
      z: 0.02,
    }),
  );
  root.scale.set(1.1, 1.045, 1.15);
  return finalizeCarpentryModel(root, {
    id: "high-chair",
    family: "high-chair",
    tier: "repeated",
    colliderType: "compound",
  });
}

function ritualTable(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted ritual worktable v2";

  const top = createCarpentryPart("ritual-top", "Ritual table three-plank top", "top");
  const plankWidth = 1.88 / 3;
  for (let index = 0; index < 3; index += 1) {
    const plank = addCarpentryMesh(
      top,
      taperedChamferBoxGeometry([plankWidth - 0.012, 0.16, 0.98], 0.028, 1.01, 0.99),
      materials.wood,
      `Ritual table top plank ${index + 1}`,
    );
    plank.position.set(-1.88 / 2 + plankWidth / 2 + index * plankWidth, 0.94, 0);
  }
  const sigil = createCarpentryPart("ritual-sigil", "Ritual table radial sigil", "top");
  const ring = addCarpentryMesh(
    sigil,
    new THREE.TorusGeometry(0.2, 0.014, 4, 18),
    materials.brass,
    "Ritual table inset sigil ring",
    { surfaceDetail: true },
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.026;
  for (let index = 0; index < 6; index += 1) {
    const spoke = addCarpentryMesh(
      sigil,
      new THREE.BoxGeometry(0.38, 0.012, 0.018),
      materials.brass,
      `Ritual table sigil spoke ${index + 1}`,
      { surfaceDetail: true },
    );
    spoke.position.y = 1.026;
    spoke.rotation.y = (index / 6) * Math.PI;
  }

  const frame = createCarpentryPart("table-frame", "Ritual table framed base", "frame");
  for (const x of [-0.75, 0.75]) {
    for (const z of [-0.38, 0.38]) {
      const leg = addCarpentryMesh(
        frame,
        taperedChamferBoxGeometry([0.16, 0.86, 0.16], 0.022, 1.14, 0.96),
        materials.wood,
        `Ritual table leg ${x < 0 ? "left" : "right"} ${z < 0 ? "rear" : "front"}`,
      );
      leg.position.set(x, 0.43, z);
      const cuff = addCarpentryMesh(
        frame,
        taperedChamferBoxGeometry([0.23, 0.17, 0.23], 0.02),
        materials.iron,
        "Ritual table iron foot cuff",
        { surfaceDetail: true },
      );
      cuff.position.set(x, 0.1, z);
    }
  }
  for (const z of [-0.46, 0.46]) {
    const apron = addCarpentryMesh(
      frame,
      taperedChamferBoxGeometry([1.68, 0.16, 0.07], 0.016),
      materials.iron,
      `${z > 0 ? "Front" : "Rear"} ritual table iron apron`,
      { surfaceDetail: true },
    );
    apron.position.set(0, 0.82, z);
  }
  for (const x of [-0.84, 0.84]) {
    const apron = addCarpentryMesh(
      frame,
      taperedChamferBoxGeometry([0.07, 0.16, 0.82], 0.016),
      materials.iron,
      "Ritual table side iron apron",
      { surfaceDetail: true },
    );
    apron.position.set(x, 0.82, 0);
  }

  const shelf = createCarpentryPart("lower-shelf", "Ritual table lower shelf", "frame");
  for (let index = 0; index < 3; index += 1) {
    const board = addCarpentryMesh(
      shelf,
      taperedChamferBoxGeometry([0.5, 0.105, 0.75], 0.02),
      materials.wood,
      `Ritual table lower shelf board ${index + 1}`,
    );
    board.position.set((index - 1) * 0.51, 0.38, 0);
  }
  addCarpentryRivets(
    frame,
    [-0.72, -0.24, 0.24, 0.72].map((x) => ({ x, y: 0.82, z: 0.505 })),
    materials.brass,
    "Ritual table apron rivet system",
  );
  root.add(
    top,
    sigil,
    frame,
    shelf,
    createCarpentrySocket("Ritual table offering socket", "ritual-item", {
      x: 0,
      y: 1.06,
      z: 0,
    }),
    createCarpentrySocket("Ritual table candle socket left", "candle", {
      x: -0.66,
      y: 1.05,
      z: -0.26,
    }),
    createCarpentrySocket("Ritual table candle socket right", "candle", {
      x: 0.66,
      y: 1.05,
      z: -0.26,
    }),
  );
  root.scale.set(1.04, 0.98, 1.02);
  return finalizeCarpentryModel(root, {
    id: "ritual-table",
    family: "ritual-table",
    tier: "hero",
    colliderType: "compound",
  });
}

function wallLantern(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted wall oil lantern";
  const body = createCarpentryPart("lantern-body", "Lantern body", "lantern-body");
  const plate = addCarpentryMesh(
    body,
    taperedChamferBoxGeometry([0.42, 0.7, 0.08], 0.018),
    materials.iron,
    "Lantern hammered wall plate",
  );
  plate.position.set(0, 0.68, 0);
  const bracket = addCarpentryMesh(
    body,
    taperedChamferBoxGeometry([0.08, 0.08, 0.42], 0.014),
    materials.iron,
    "Lantern projecting bracket",
  );
  bracket.position.set(0, 0.72, 0.24);
  const reservoir = addCarpentryMesh(
    body,
    new THREE.CylinderGeometry(0.18, 0.23, 0.24, 8),
    materials.brass,
    "Lantern oil reservoir",
  );
  reservoir.position.set(0, 0.44, 0.43);
  for (const y of [0.58, 1.08]) {
    const cageRing = addCarpentryMesh(
      body,
      new THREE.TorusGeometry(0.2, 0.028, 5, 12),
      materials.iron,
      "Lantern cage ring",
    );
    cageRing.rotation.x = Math.PI / 2;
    cageRing.position.set(0, y, 0.43);
  }
  for (const x of [-0.16, 0.16]) {
    const bar = addCarpentryMesh(
      body,
      new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5),
      materials.iron,
      "Lantern cage bar",
    );
    bar.position.set(x, 0.83, 0.43);
  }
  const door = createCarpentryPart("lantern-door", "Lantern cage door hinge", "lantern-body");
  door.position.set(-0.2, 0.83, 0.45);
  door.rotation.y = -1.02;
  door.userData.socket = {
    type: "hinge",
    axis: [0, 1, 0],
    range: [-1.3, 0.05],
    restRadians: -1.02,
  };
  const doorWidth = 0.4;
  const doorHeight = 0.5;
  const rail = 0.028;
  for (const [name, size, x, y] of [
    ["left", [rail, doorHeight - rail * 2, 0.025], rail / 2, 0],
    ["right", [rail, doorHeight - rail * 2, 0.025], doorWidth - rail / 2, 0],
    ["upper", [doorWidth, rail, 0.025], doorWidth / 2, doorHeight / 2 - rail / 2],
    ["lower", [doorWidth, rail, 0.025], doorWidth / 2, -doorHeight / 2 + rail / 2],
  ] as const) {
    const doorRail = addCarpentryMesh(
      door,
      taperedChamferBoxGeometry(size, 0.006),
      materials.iron,
      `Lantern open cage door ${name} rail`,
    );
    doorRail.position.set(x, y, 0);
  }
  const wickCollar = addCarpentryMesh(
    body,
    new THREE.CylinderGeometry(0.075, 0.085, 0.045, 8),
    materials.brass,
    "Lantern brass wick collar",
  );
  wickCollar.position.set(0, 0.59, 0.43);
  const wick = addCarpentryMesh(
    body,
    new THREE.CylinderGeometry(0.018, 0.022, 0.075, 6),
    materials.darkStone,
    "Lantern charred wick",
  );
  wick.position.set(0, 0.64, 0.43);
  addCarpentryRivets(
    body,
    [-0.14, 0.14].flatMap((x) => [0.42, 0.94].map((y) => ({ x, y, z: 0.055 }))),
    materials.brass,
    "Lantern plate rivet repetition system",
  );
  root.add(
    body,
    door,
    createCarpentrySocket("Lantern flame socket", "flame", { x: 0, y: 0.73, z: 0.43 }),
  );
  return finalizeCarpentryModel(root, {
    id: "wall-lantern",
    family: "wall-lantern",
    tier: "repeated",
    sourceImage: "assets-source/imagegen/model-references-v2/lighting/wall-lantern-three-view.png",
    specification: ".scratch/img2threejs/model-references-v2/lighting/wall-lantern/spec.json",
    targetTriangles: 1_100,
    maxTriangles: 1_800,
    limitations: ["Runtime flame and point light remain socket-driven VFX."],
  });
}

function addBone(
  part: THREE.Group,
  boneMaterial: THREE.MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
  height: number,
  name: string,
): void {
  const shaftRadius = Math.min(0.038, height * 0.08);
  const shaft = addCarpentryMesh(
    part,
    new THREE.CylinderGeometry(shaftRadius, shaftRadius, height, 6),
    boneMaterial,
    `${name} shaft`,
  );
  shaft.position.set(x, y, z);
  for (const direction of [-1, 1]) {
    const joint = addCarpentryMesh(
      part,
      new THREE.SphereGeometry(shaftRadius * 1.72, 6, 4),
      boneMaterial,
      `${name} joint end`,
    );
    joint.scale.y = 0.7;
    joint.position.set(x, y + direction * height * 0.5, z);
  }
}

function ossuaryDoor(
  wood: THREE.MeshStandardMaterial,
  iron: THREE.MeshStandardMaterial,
  brass: THREE.MeshStandardMaterial,
  side: -1 | 1,
): THREE.Group {
  const id = side < 0 ? "left-door" : "right-door";
  const pivot = createCarpentryPart(
    id,
    side < 0 ? "Ossuary left door hinge" : "Ossuary right door hinge",
    "door-assembly",
  );
  pivot.position.set(side * 0.5, 0.22, 0.285);
  pivot.userData.socket = {
    type: "hinge",
    axis: [0, 1, 0],
    range: side < 0 ? [0, 1.65] : [-1.65, 0],
  };
  const inward = -side;
  const centerX = inward * 0.245;
  const lower = addCarpentryMesh(
    pivot,
    taperedChamferBoxGeometry([0.46, 0.88, 0.1], 0.018),
    wood,
    `${side < 0 ? "Left" : "Right"} ossuary lower plank door`,
  );
  lower.position.set(centerX, 0.52, 0);
  for (const xOffset of [-0.19, 0.19]) {
    const stile = addCarpentryMesh(
      pivot,
      new THREE.BoxGeometry(0.075, 0.62, 0.075),
      iron,
      "Ossuary gothic grille side stile",
      { surfaceDetail: true },
    );
    stile.position.set(centerX + xOffset, 1.26, 0.005);
  }
  for (const y of [0.96, 1.56]) {
    const rail = addCarpentryMesh(
      pivot,
      new THREE.BoxGeometry(0.46, 0.075, 0.075),
      iron,
      "Ossuary gothic grille horizontal rail",
      { surfaceDetail: true },
    );
    rail.position.set(centerX, y, 0.005);
  }
  for (const direction of [-1, 1]) {
    createBeamBetween(
      pivot,
      new THREE.Vector3(centerX + direction * 0.19, 1.49, 0.006),
      new THREE.Vector3(centerX, 1.64, 0.006),
      0.055,
      0.075,
      0.012,
      iron,
      `${side < 0 ? "Left" : "Right"} ossuary gothic window arch ${direction < 0 ? "left" : "right"}`,
      { surfaceDetail: true },
    );
  }
  for (const xOffset of [-0.11, 0, 0.11]) {
    const bar = addCarpentryMesh(
      pivot,
      new THREE.CylinderGeometry(0.016, 0.016, 0.52, 5),
      iron,
      "Ossuary grille bar",
      { surfaceDetail: true },
    );
    bar.position.set(centerX + xOffset, 1.26, 0.052);
  }
  addCarpentryRivets(
    pivot,
    [-0.19, 0.19].flatMap((x) =>
      [0.4, 1.52].map((y) => ({
        x: centerX + x,
        y,
        z: 0.06,
      })),
    ),
    iron,
    `${side < 0 ? "Left" : "Right"} ossuary door rivets`,
    0.022,
  );

  for (const [index, y] of [0.48, 1.46].entries()) {
    const hingePlate = addCarpentryMesh(
      pivot,
      new THREE.BoxGeometry(0.12, 0.2, 0.035),
      iron,
      `${side < 0 ? "Left" : "Right"} ossuary visible hinge plate ${index + 1}`,
      { surfaceDetail: true },
    );
    hingePlate.position.set(side * -0.015, y, 0.075);
  }
  const knob = addCarpentryMesh(
    pivot,
    new THREE.OctahedronGeometry(0.052, 0),
    brass,
    `${side < 0 ? "Left" : "Right"} ossuary aged brass door knob`,
    { surfaceDetail: true },
  );
  knob.position.set(centerX + inward * 0.17, 0.73, 0.105);
  return pivot;
}

function ossuaryCabinet(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted arched ossuary cabinet v2";

  const cabinetWood = materials.wood.clone();
  cabinetWood.name = "Ossuary dark aged oak PBR material";
  cabinetWood.color.multiplyScalar(0.68);
  cabinetWood.color.lerp(new THREE.Color(0x38271e), 0.16);
  cabinetWood.emissive.copy(cabinetWood.color);
  cabinetWood.emissiveMap = cabinetWood.map;
  cabinetWood.emissiveIntensity = 0.028;
  cabinetWood.roughness = Math.max(0.78, cabinetWood.roughness);
  cabinetWood.envMapIntensity = Math.max(0.36, cabinetWood.envMapIntensity);
  if (cabinetWood.normalMap) cabinetWood.normalScale.multiplyScalar(1.14);
  cabinetWood.userData.localValueScale = 0.68;
  cabinetWood.userData.localIndirectFill = 0.028;
  cabinetWood.userData.indirectFillSource = "albedo map";
  cabinetWood.userData.finish = "dark aged oak with retained relief";
  cabinetWood.userData.biomeSafe = true;

  const cabinetIron = materials.iron.clone();
  cabinetIron.name = "Ossuary readable black iron PBR material";
  cabinetIron.color.multiplyScalar(0.58);
  cabinetIron.color.lerp(new THREE.Color(0x1d2225), 0.28);
  cabinetIron.emissive.setHex(0x030405);
  cabinetIron.emissiveMap = null;
  cabinetIron.emissiveIntensity = 0.008;
  cabinetIron.roughness = THREE.MathUtils.clamp(cabinetIron.roughness, 0.66, 0.74);
  cabinetIron.metalness = Math.max(cabinetIron.metalness, 0.66);
  cabinetIron.envMapIntensity = THREE.MathUtils.clamp(cabinetIron.envMapIntensity, 0.78, 0.94);
  cabinetIron.userData.finish = "dark rough forged iron with restrained highlights";
  cabinetIron.userData.biomeSafe = true;

  const cabinetBrass = materials.brass.clone();
  cabinetBrass.name = "Ossuary aged brass hardware PBR material";
  cabinetBrass.color.multiply(new THREE.Color(0xc59a4a));
  cabinetBrass.emissive.setHex(0x090602);
  cabinetBrass.emissiveMap = null;
  cabinetBrass.emissiveIntensity = 0.016;
  cabinetBrass.roughness = THREE.MathUtils.clamp(cabinetBrass.roughness, 0.5, 0.64);
  cabinetBrass.metalness = Math.max(cabinetBrass.metalness, 0.56);
  cabinetBrass.envMapIntensity = Math.max(cabinetBrass.envMapIntensity, 0.86);
  cabinetBrass.userData.finish = "aged brass control hardware";
  cabinetBrass.userData.biomeSafe = true;

  const displayBoneMaterial = materials.bone.clone();
  displayBoneMaterial.name = "Ossuary warm bone display PBR material";
  displayBoneMaterial.color.multiplyScalar(1.18);
  displayBoneMaterial.color.lerp(new THREE.Color(0xe1d6ad), 0.26);
  displayBoneMaterial.emissive.setHex(0x241e10);
  displayBoneMaterial.emissiveMap = null;
  displayBoneMaterial.emissiveIntensity = 0.07;
  displayBoneMaterial.roughness = Math.max(0.78, displayBoneMaterial.roughness);
  displayBoneMaterial.userData.localValueScale = 1.18;
  displayBoneMaterial.userData.localEmissiveLift = 0.07;
  displayBoneMaterial.userData.biomeSafe = true;

  const shell = createCarpentryPart("cabinet-shell", "Ossuary cabinet shell", "cabinet-shell");
  const back = addCarpentryMesh(
    shell,
    createArchedPanelGeometry(1.02, 2.0, 0.16, 1.55),
    cabinetWood,
    "Ossuary arched plank cabinet back",
  );
  back.position.set(0, 0.22, -0.28);
  back.userData.archProfile = {
    height: 2,
    shoulderHeight: 1.55,
    apexY: 2.22,
  };
  for (const x of [-0.34, -0.17, 0, 0.17, 0.34]) {
    const archRise = Math.sqrt(Math.max(0, 0.44 ** 2 - x ** 2));
    const top = 1.78 + archRise;
    const height = top - 0.28;
    const seam = addCarpentryMesh(
      shell,
      new THREE.BoxGeometry(0.014, height, 0.018),
      cabinetIron,
      "Ossuary rear vertical plank joint",
      { surfaceDetail: true },
    );
    seam.position.set(x, 0.28 + height * 0.5, -0.369);
  }
  for (const x of [-0.49, 0.49]) {
    const post = addCarpentryMesh(
      shell,
      taperedChamferBoxGeometry([0.15, 1.78, 0.68], 0.024, 1.04, 0.98),
      cabinetWood,
      `${x < 0 ? "Left" : "Right"} ossuary cabinet stile`,
    );
    post.position.set(x, 1.04, 0.015);
  }

  const sideRivets: THREE.Vector3Like[] = [];
  for (const side of [-1, 1]) {
    for (const [index, z] of [-0.22, 0, 0.22].entries()) {
      const sidePlank = addCarpentryMesh(
        shell,
        new THREE.BoxGeometry(0.1, 1.54, 0.22),
        cabinetWood,
        `${side < 0 ? "Left" : "Right"} ossuary divided side plank ${index + 1}`,
      );
      sidePlank.position.set(side * 0.5, 1.0, z);
    }
    for (const z of [-0.11, 0.11]) {
      const seam = addCarpentryMesh(
        shell,
        new THREE.BoxGeometry(0.018, 1.45, 0.018),
        cabinetIron,
        `${side < 0 ? "Left" : "Right"} ossuary side vertical plank joint`,
        { surfaceDetail: true },
      );
      seam.position.set(side * 0.557, 1.0, z);
    }
    for (const y of [0.34, 0.98, 1.6]) {
      const sideBand = addCarpentryMesh(
        shell,
        new THREE.BoxGeometry(0.026, 0.12, 0.62),
        cabinetIron,
        `${side < 0 ? "Left" : "Right"} ossuary side reinforcement band`,
        { surfaceDetail: true },
      );
      sideBand.position.set(side * 0.57, y, 0);
      for (const z of [-0.23, 0.23]) sideRivets.push({ x: side * 0.586, y, z });
    }
  }
  addCarpentryRivets(
    shell,
    sideRivets,
    cabinetIron,
    "Ossuary side reinforcement rivet system",
    0.018,
  );

  const plinth = addCarpentryMesh(
    shell,
    taperedChamferBoxGeometry([1.22, 0.2, 0.78], 0.028, 1.04, 0.98),
    cabinetWood,
    "Ossuary cabinet grounded plinth",
  );
  plinth.position.set(0, 0.1, 0.015);
  const crownShelf = addCarpentryMesh(
    shell,
    taperedChamferBoxGeometry([1.16, 0.14, 0.74], 0.025, 1.02, 0.98),
    cabinetWood,
    "Ossuary deep crown shelf",
  );
  crownShelf.position.set(0, 1.79, 0.01);
  const crown = addCarpentryMesh(
    shell,
    new THREE.TorusGeometry(0.52, 0.07, 4, 14, Math.PI),
    cabinetIron,
    "Ossuary segmented iron arch crown",
    { surfaceDetail: true },
  );
  crown.position.set(0, 1.77, 0.29);
  crown.userData.panelAttachment = {
    panelApexY: 2.22,
    innerCrownApexY: 2.22,
    contact: true,
  };
  const rearCrown = addCarpentryMesh(
    shell,
    new THREE.TorusGeometry(0.52, 0.07, 4, 14, Math.PI),
    cabinetIron,
    "Ossuary rear segmented iron arch crown",
    { surfaceDetail: true },
  );
  rearCrown.position.set(0, 1.77, -0.29);
  rearCrown.userData.structuralRole = "rear arch closes against the cabinet back";
  const roof = createCarpentryPart(
    "curved-roof",
    "Ossuary continuous curved plank roof",
    "cabinet-shell",
  );
  const roofPlankCount = 7;
  for (let index = 0; index < roofPlankCount; index += 1) {
    const startAngle = (index / roofPlankCount) * Math.PI;
    const endAngle = ((index + 1) / roofPlankCount) * Math.PI;
    const plank = addCarpentryMesh(
      roof,
      createCurvedRoofPlankGeometry(0.43, 0.55, 0.57, startAngle, endAngle),
      cabinetWood,
      `Ossuary curved roof plank ${index + 1}`,
    );
    plank.position.y = 1.77;
  }
  roof.userData.coverage = {
    type: "continuous segmented barrel roof",
    plankCount: roofPlankCount,
    frontZ: 0.285,
    rearZ: -0.285,
    closed: true,
    overlap: true,
  };
  shell.add(roof);
  for (let index = 1; index <= 5; index += 1) {
    const angle = (index / 6) * Math.PI;
    const crownRib = addCarpentryMesh(
      shell,
      new THREE.BoxGeometry(0.075, 0.075, 0.58),
      cabinetIron,
      `Ossuary crown depth rib ${index}`,
      { surfaceDetail: true },
    );
    crownRib.position.set(Math.cos(angle) * 0.52, 1.77 + Math.sin(angle) * 0.52, 0);
  }
  for (const x of [-0.48, 0.48]) {
    const crownBridge = addCarpentryMesh(
      shell,
      taperedChamferBoxGeometry([0.11, 0.18, 0.62], 0.018),
      cabinetIron,
      `${x < 0 ? "Left" : "Right"} ossuary crown depth bridge`,
      { surfaceDetail: true },
    );
    crownBridge.position.set(x, 1.78, 0);
  }
  for (const y of [0.28, 0.92, 1.54]) {
    const rearBrace = addCarpentryMesh(
      shell,
      new THREE.BoxGeometry(0.88, 0.075, 0.07),
      cabinetIron,
      "Ossuary rear horizontal iron brace",
      { surfaceDetail: true },
    );
    rearBrace.position.set(0, y, -0.39);
  }

  for (const side of [-1, 1]) {
    const displayBacking = addCarpentryMesh(
      shell,
      new THREE.BoxGeometry(0.38, 0.7, 0.045),
      cabinetIron,
      `${side < 0 ? "Left" : "Right"} ossuary recessed iron display backing`,
      { surfaceDetail: true },
    );
    displayBacking.position.set(side * 0.235, 1.32, -0.1);
    displayBacking.userData.displayContrast = {
      behindBoneZ: 0.04,
      preservesSharedBatches: true,
    };
  }

  const bones = createCarpentryPart("bone-display", "Ossuary paired bone display", "cabinet-shell");
  for (const x of [-0.32, -0.15, 0.15, 0.32]) {
    addBone(bones, displayBoneMaterial, x, 1.27, 0.31, 0.46, "Ossuary displayed long bone");
  }

  const leftDoor = ossuaryDoor(cabinetWood, cabinetIron, cabinetBrass, -1);
  const rightDoor = ossuaryDoor(cabinetWood, cabinetIron, cabinetBrass, 1);
  const lock = createCarpentryPart("central-lock", "Ossuary central lock", "door-assembly");
  const lockPlate = addCarpentryMesh(
    lock,
    taperedChamferBoxGeometry([0.22, 0.27, 0.075], 0.022),
    cabinetIron,
    "Ossuary forged lock plate",
  );
  lockPlate.position.set(0, 0.78, 0.4);
  const keySlot = addCarpentryMesh(
    lock,
    new THREE.BoxGeometry(0.045, 0.1, 0.018),
    cabinetBrass,
    "Ossuary recessed lock key slot",
    { surfaceDetail: true },
  );
  keySlot.position.set(0, 0.78, 0.447);

  root.add(
    shell,
    bones,
    leftDoor,
    rightDoor,
    lock,
    createCarpentrySocket("Ossuary offering socket", "ritual-item", {
      x: 0,
      y: 0.46,
      z: 0.43,
    }),
  );
  root.scale.set(0.97, 0.92, 1);
  return finalizeCarpentryModel(root, {
    id: "ossuary-cabinet",
    family: "ossuary-cabinet",
    tier: "hero",
    colliderType: "compound",
    grounded: true,
    targetTriangles: 2800,
    maxTriangles: 3800,
    maxMaterialBatches: 4,
    limitations: ["The closed rear shell keeps the display bay dark while both doors stay usable."],
  });
}

export function createImageSculptedProp(
  family: ImageSculptedPropFamily,
  materials: DungeonMaterials,
): THREE.Group {
  if (family === "high-chair") return highChair(materials);
  if (family === "ritual-table") return ritualTable(materials);
  if (family === "wall-lantern") return wallLantern(materials);
  return ossuaryCabinet(materials);
}
