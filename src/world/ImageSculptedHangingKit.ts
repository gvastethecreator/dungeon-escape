import * as THREE from "three";

import {
  getCuredMeatMaterial,
  getReadableRootMaterial,
  getTatteredBannerClothMaterial,
} from "./LocalModelMaterials";
import type { DungeonMaterials } from "./MaterialLibrary";

/**
 * Low-poly ceiling props reconstructed from the accepted three-view sheets.
 * The origin is the ceiling contact and every visible form descends on -Y.
 */
export type ImageSculptedHangingFamily =
  | "iron-cage"
  | "oil-lantern"
  | "tattered-banner"
  | "meat-hooks"
  | "bone-mobile"
  | "root-cluster"
  | "hanging-chain"
  | "hanging-vine";

export const IMAGE_SCULPTED_HANGING_FAMILIES: readonly ImageSculptedHangingFamily[] = [
  "iron-cage",
  "oil-lantern",
  "tattered-banner",
  "meat-hooks",
  "bone-mobile",
  "root-cluster",
  "hanging-chain",
  "hanging-vine",
] as const;

const REFERENCE_ROOT = "assets-source/imagegen/model-references-v2";
const REFERENCE_IMAGES: Readonly<Record<ImageSculptedHangingFamily, string>> = {
  "iron-cage": `${REFERENCE_ROOT}/hanging/iron-cage-three-view.png`,
  "oil-lantern": `${REFERENCE_ROOT}/lighting/oil-lantern-three-view.png`,
  "tattered-banner": `${REFERENCE_ROOT}/hanging/tattered-banner-three-view.png`,
  "meat-hooks": `${REFERENCE_ROOT}/hanging/meat-hooks-three-view.png`,
  "bone-mobile": `${REFERENCE_ROOT}/hanging/bone-mobile-three-view.png`,
  "root-cluster": `${REFERENCE_ROOT}/hanging/root-cluster-three-view.png`,
  "hanging-chain": `${REFERENCE_ROOT}/hanging/hanging-chain-three-view.png`,
  "hanging-vine": `${REFERENCE_ROOT}/hanging/hanging-vine-three-view.png`,
};

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  partId: string,
  surfaceRelief = false,
): THREE.Mesh {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.castShadow = true;
  part.receiveShadow = true;
  part.userData.partId = partId;
  if (surfaceRelief) part.userData.explodeWithParent = true;
  return part;
}

function pivot(name: string, partId: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.userData.partId = partId;
  group.userData.pivot = true;
  return group;
}

function socket(
  name: string,
  type: string,
  position: readonly [number, number, number],
): THREE.Group {
  const node = new THREE.Group();
  node.name = name;
  node.position.set(...position);
  node.userData.socket = { type };
  return node;
}

function triangleCount(root: THREE.Object3D): number {
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    triangles += geometry.index
      ? geometry.index.count / 3
      : geometry.getAttribute("position").count / 3;
  });
  return Math.round(triangles);
}

function finish(
  root: THREE.Group,
  family: ImageSculptedHangingFamily,
  length: number,
): THREE.Group {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const nodes: Record<string, string> = {};
  const sockets: Record<string, { name: string; type: string }> = {};
  const materials = new Set<string>();
  root.traverse((object) => {
    const partId = object.userData.partId as string | undefined;
    if (partId) nodes[partId] = object.name;
    const socketData = object.userData.socket as { type: string } | undefined;
    if (socketData) sockets[object.name] = { name: object.name, type: socketData.type };
    if (object instanceof THREE.Mesh) {
      const entries = Array.isArray(object.material) ? object.material : [object.material];
      entries.forEach((material) => materials.add(material.uuid));
    }
  });
  const specification =
    family === "oil-lantern"
      ? ".scratch/img2threejs/lighting/oil-lantern/spec.json"
      : `.scratch/img2threejs/model-references-v2/hanging/${family}/spec.json`;
  root.userData.propFamily = family;
  root.userData.sculptRuntime = {
    sourceImage: REFERENCE_IMAGES[family],
    specification,
    approximation: "procedural low-poly reconstruction from three generated views",
    family,
    units: "meters",
    hangLength: length,
    origin: "ceiling-mount",
    nodes,
    sockets,
    collider: { type: "box", size: size.toArray(), offset: center.toArray() },
    destructionGroups: {
      mount: ["ceiling-mount"],
      suspension: Object.keys(nodes).filter((id) => id.includes("chain") || id.includes("rope")),
      body: Object.keys(nodes).filter((id) => !id.includes("mount")),
    },
    geometry: {
      triangles: triangleCount(root),
      materialBatches: materials.size,
      targetTriangles: 1500,
      maxTriangles: 3000,
      mergeStrategy: "StaticDungeonScene merges template meshes by shared DungeonMaterial",
    },
    lod: { near: 0, mid: 14, far: 28 },
  };
  return root;
}

export function createTaperedTubeGeometry(
  points: readonly THREE.Vector3[],
  startRadius: number,
  endRadius: number,
  tubularSegments = 8,
  radialSegments = 5,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([...points], false, "centripetal");
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const point = new THREE.Vector3();
  const offset = new THREE.Vector3();
  for (let ring = 0; ring <= tubularSegments; ring += 1) {
    const t = ring / tubularSegments;
    curve.getPointAt(t, point);
    const radius = THREE.MathUtils.lerp(startRadius, endRadius, Math.pow(t, 0.82));
    for (let side = 0; side < radialSegments; side += 1) {
      const angle = (side / radialSegments) * Math.PI * 2 + ring * 0.075;
      offset
        .copy(frames.normals[ring]!)
        .multiplyScalar(Math.cos(angle) * radius)
        .addScaledVector(frames.binormals[ring]!, Math.sin(angle) * radius);
      positions.push(point.x + offset.x, point.y + offset.y, point.z + offset.z);
      uvs.push(side / radialSegments, t);
    }
  }
  for (let ring = 0; ring < tubularSegments; ring += 1) {
    for (let side = 0; side < radialSegments; side += 1) {
      const next = (side + 1) % radialSegments;
      const a = ring * radialSegments + side;
      const b = (ring + 1) * radialSegments + side;
      const c = ring * radialSegments + next;
      const d = (ring + 1) * radialSegments + next;
      indices.push(a, b, c, c, b, d);
    }
  }
  for (const [ring, reverse] of [
    [0, true],
    [tubularSegments, false],
  ] as const) {
    const centerIndex = positions.length / 3;
    curve.getPointAt(ring / tubularSegments, point);
    positions.push(point.x, point.y, point.z);
    uvs.push(0.5, ring / tubularSegments);
    for (let side = 0; side < radialSegments; side += 1) {
      const a = ring * radialSegments + side;
      const b = ring * radialSegments + ((side + 1) % radialSegments);
      indices.push(centerIndex, reverse ? b : a, reverse ? a : b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createLongBoneGeometry(length: number): THREE.LatheGeometry {
  const half = length * 0.5;
  return new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, -half),
      new THREE.Vector2(0.055, -half + length * 0.025),
      new THREE.Vector2(0.075, -half + length * 0.08),
      new THREE.Vector2(0.045, -half + length * 0.2),
      new THREE.Vector2(0.031, 0),
      new THREE.Vector2(0.045, half - length * 0.2),
      new THREE.Vector2(0.075, half - length * 0.08),
      new THREE.Vector2(0.055, half - length * 0.025),
      new THREE.Vector2(0, half),
    ],
    6,
  );
}

function createLeafGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.17);
  shape.lineTo(0.065, 0.075);
  shape.lineTo(0.1, -0.015);
  shape.lineTo(0.055, -0.11);
  shape.lineTo(0, -0.16);
  shape.lineTo(-0.055, -0.11);
  shape.lineTo(-0.1, -0.015);
  shape.lineTo(-0.065, 0.075);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.018,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.008,
    bevelThickness: 0.006,
    steps: 1,
  });
  geometry.translate(0, 0, -0.009);
  return geometry;
}

function createMossPatchGeometry(radius = 0.06): THREE.BufferGeometry {
  const segments = 7;
  const positions = [0, 0, 0.012];
  const uvs = [0.5, 0.5];
  const indices: number[] = [];
  const wobble = [1, 0.84, 1.1, 0.91, 1.06, 0.86, 1.03] as const;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const radial = radius * wobble[index]!;
    positions.push(
      Math.cos(angle) * radial,
      Math.sin(angle) * radial * (1.08 + (index % 2) * 0.08),
      index % 2 === 0 ? 0.002 : -0.003,
    );
    uvs.push(Math.cos(angle) * 0.5 + 0.5, Math.sin(angle) * 0.5 + 0.5);
  }
  for (let index = 0; index < segments; index += 1) {
    indices.push(0, index + 1, ((index + 1) % segments) + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createClothGeometry(width: number, height: number): THREE.BufferGeometry {
  const columns = 21;
  const rows = 12;
  const thickness = 0.038;
  // Four long, unequal tails. The troughs between them are wide enough to
  // survive the normal map and keep the hem from reading as saw teeth.
  const hemDepth = [
    0.82, 0.91, 1.08, 1.22, 1.05, 0.79, 0.9, 1.12, 1.31, 1.08, 0.81, 0.91, 1.08, 1.19, 1.02, 0.77,
    0.92, 1.17, 1.36, 1.12, 0.85,
  ] as const;
  const hemShift = [
    -0.008, -0.003, 0.006, 0.014, 0.004, -0.01, -0.004, 0.008, 0.017, 0.006, -0.009, -0.003, 0.007,
    0.012, 0.002, -0.012, -0.004, 0.008, 0.016, 0.003, -0.01,
  ] as const;
  // Two short side tears interrupt the rectangular outline at different
  // heights. The bottom profile then resolves into four unequal cloth tails.
  const leftInset = [
    0, 0.002, 0.006, 0.011, 0.082, 0.034, 0.014, 0.01, 0.019, 0.014, 0.008, 0.004,
  ] as const;
  const rightInset = [
    0, 0.003, 0.006, 0.011, 0.008, 0.006, 0.012, 0.024, 0.068, 0.026, 0.011, 0.004,
  ] as const;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const side of [-1, 1] as const) {
    for (let row = 0; row < rows; row += 1) {
      const vertical = row / (rows - 1);
      const edgeLeft = -width * 0.5 + leftInset[row]!;
      const edgeRight = width * 0.5 - rightInset[row]!;
      for (let column = 0; column < columns; column += 1) {
        const horizontal = column / (columns - 1);
        const x =
          THREE.MathUtils.lerp(edgeLeft, edgeRight, horizontal) +
          hemShift[column]! * vertical * vertical;
        const topSag =
          Math.sin(horizontal * Math.PI) * 0.046 +
          Math.sin(horizontal * Math.PI * 2.1 + 0.35) * 0.006;
        const y = -topSag - height * vertical * hemDepth[column]!;
        // Phase offsets and a small diagonal drift prevent a mirrored central
        // ridge. The wave grows toward the loose hem but stays soft.
        const fold =
          Math.sin(horizontal * Math.PI * 2.3 + vertical * 0.75 + 0.4) *
            (0.008 + vertical * 0.014) +
          Math.sin(horizontal * Math.PI * 5.2 + vertical * 1.35 + 1.1) * 0.004 +
          (horizontal - 0.5) * vertical * 0.007;
        positions.push(x, y, fold + side * thickness * 0.5);
        uvs.push(horizontal, 1 - vertical);
      }
    }
  }
  const layerSize = columns * rows;
  for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
    const offset = sideIndex * layerSize;
    for (let row = 0; row < rows - 1; row += 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        const a = offset + row * columns + column;
        const b = a + 1;
        const c = a + columns;
        const d = c + 1;
        if (sideIndex === 1) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
  }
  const closeEdge = (frontA: number, frontB: number): void => {
    const backA = frontA + layerSize;
    const backB = frontB + layerSize;
    indices.push(frontA, frontB, backA, frontB, backB, backA);
  };
  for (let column = 0; column < columns - 1; column += 1) {
    closeEdge(column, column + 1);
    const bottom = (rows - 1) * columns;
    closeEdge(bottom + column + 1, bottom + column);
  }
  for (let row = 0; row < rows - 1; row += 1) {
    closeEdge(row * columns + columns - 1, (row + 1) * columns + columns - 1);
    closeEdge((row + 1) * columns, row * columns);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = "Closed low-poly cloth with four irregular tails and two side cuts";
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.userData.hemProfile = [...hemDepth];
  geometry.userData.tearCount = 4;
  geometry.userData.sideCutCount = 2;
  geometry.userData.sideCutDepths = [Math.max(...leftInset), Math.max(...rightInset)];
  geometry.userData.tailDepths = [hemDepth[3], hemDepth[8], hemDepth[13], hemDepth[18]];
  geometry.userData.uvStrategy = "continuous-front-back-no-center-mirror";
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createCuredMeatHaunchGeometry(): THREE.BufferGeometry {
  const radialSegments = 12;
  const profile = [
    { y: 0.36, x: -0.006, z: 0, radiusX: 0.022, radiusZ: 0.018, twist: -0.08 },
    { y: 0.31, x: -0.012, z: 0.003, radiusX: 0.032, radiusZ: 0.025, twist: 0.04 },
    { y: 0.25, x: -0.022, z: -0.003, radiusX: 0.043, radiusZ: 0.034, twist: 0.1 },
    { y: 0.18, x: -0.031, z: 0.005, radiusX: 0.058, radiusZ: 0.044, twist: -0.03 },
    { y: 0.11, x: -0.028, z: 0.009, radiusX: 0.078, radiusZ: 0.058, twist: 0.09 },
    { y: 0.03, x: -0.016, z: 0.004, radiusX: 0.1, radiusZ: 0.071, twist: -0.07 },
    { y: -0.05, x: 0.004, z: -0.006, radiusX: 0.118, radiusZ: 0.083, twist: 0.08 },
    { y: -0.13, x: 0.026, z: -0.009, radiusX: 0.135, radiusZ: 0.094, twist: -0.05 },
    { y: -0.21, x: 0.041, z: 0.008, radiusX: 0.142, radiusZ: 0.101, twist: 0.1 },
    { y: -0.29, x: 0.048, z: 0.011, radiusX: 0.124, radiusZ: 0.09, twist: -0.1 },
    { y: -0.36, x: 0.024, z: -0.005, radiusX: 0.093, radiusZ: 0.068, twist: 0.08 },
    { y: -0.415, x: -0.018, z: -0.002, radiusX: 0.058, radiusZ: 0.045, twist: -0.06 },
    { y: -0.445, x: -0.039, z: 0, radiusX: 0.024, radiusZ: 0.021, twist: 0.02 },
  ] as const;
  const contour = [1, 0.94, 1.04, 0.97, 1.07, 0.92, 1.03, 0.96, 1.06, 0.93, 1.02, 0.95] as const;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ringStride = radialSegments + 1;

  for (const [ring, section] of profile.entries()) {
    const v = THREE.MathUtils.lerp(0.96, 0.04, ring / (profile.length - 1));
    for (let side = 0; side <= radialSegments; side += 1) {
      const seamRatio = side / radialSegments;
      // Put the one UV seam on -Z, away from the canonical front view.
      const angle = seamRatio * Math.PI * 2 - Math.PI / 2 + section.twist;
      const contourScale = contour[side % radialSegments]!;
      const organicRipple =
        1 + Math.sin(angle * 3 + ring * 0.61) * 0.024 + Math.cos(angle * 2 - ring * 0.43) * 0.014;
      positions.push(
        section.x + Math.cos(angle) * section.radiusX * contourScale * organicRipple,
        section.y,
        section.z + Math.sin(angle) * section.radiusZ * (2 - contourScale) * organicRipple,
      );
      uvs.push(THREE.MathUtils.lerp(0.04, 0.96, seamRatio), v);
    }
  }
  for (let ring = 0; ring < profile.length - 1; ring += 1) {
    for (let side = 0; side < radialSegments; side += 1) {
      const a = ring * ringStride + side;
      const b = a + ringStride;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, b, c, c, b, d);
    }
  }
  for (const [ring, reverse] of [
    [0, true],
    [profile.length - 1, false],
  ] as const) {
    const section = profile[ring]!;
    const center = positions.length / 3;
    positions.push(section.x, section.y, section.z);
    uvs.push(0.5, ring === 0 ? 0.98 : 0.02);
    for (let side = 0; side < radialSegments; side += 1) {
      const a = ring * ringStride + side;
      const b = a + 1;
      indices.push(center, reverse ? b : a, reverse ? a : b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = "Elongated low-poly cured meat haunch with narrow neck and off-center lower lobe";
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.userData.uvStrategy = "single-rear-longitudinal-seam-clamp";
  geometry.userData.haunchProfile = profile.map((section) => ({ ...section }));
  geometry.userData.heavyLobeRing = 8;
  geometry.userData.radialSegments = radialSegments;
  geometry.userData.longitudinalFiberAxis = "v";
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A broad, chamfered forged link that keeps its hole visible from side views. */
function createRectangularChainLinkGeometry(): THREE.ExtrudeGeometry {
  const outerWidth = 0.102;
  const outerHeight = 0.145;
  const outerChamfer = 0.035;
  const innerWidth = 0.052;
  const innerHeight = 0.091;
  const innerChamfer = 0.022;
  const shape = new THREE.Shape();
  shape.moveTo(-outerWidth + outerChamfer, -outerHeight);
  shape.lineTo(outerWidth - outerChamfer, -outerHeight);
  shape.lineTo(outerWidth, -outerHeight + outerChamfer);
  shape.lineTo(outerWidth, outerHeight - outerChamfer);
  shape.lineTo(outerWidth - outerChamfer, outerHeight);
  shape.lineTo(-outerWidth + outerChamfer, outerHeight);
  shape.lineTo(-outerWidth, outerHeight - outerChamfer);
  shape.lineTo(-outerWidth, -outerHeight + outerChamfer);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-innerWidth, -innerHeight + innerChamfer);
  hole.lineTo(-innerWidth, innerHeight - innerChamfer);
  hole.lineTo(-innerWidth + innerChamfer, innerHeight);
  hole.lineTo(innerWidth - innerChamfer, innerHeight);
  hole.lineTo(innerWidth, innerHeight - innerChamfer);
  hole.lineTo(innerWidth, -innerHeight + innerChamfer);
  hole.lineTo(innerWidth - innerChamfer, -innerHeight);
  hole.lineTo(-innerWidth + innerChamfer, -innerHeight);
  hole.closePath();
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.052,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.006,
    bevelThickness: 0.006,
  });
  geometry.translate(0, 0, -0.026);
  geometry.name = "Chamfered rectangular forged chain link";
  geometry.userData.linkProfile = "rectangular-chamfered";
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const readableChainIronCache = new WeakMap<
  THREE.MeshStandardMaterial,
  THREE.MeshStandardMaterial
>();

/** Chain-only iron lift so deep links keep their holes in low, cool or rear light. */
function getReadableChainIronMaterial(materials: DungeonMaterials): THREE.MeshStandardMaterial {
  const source = materials.iron;
  let material = readableChainIronCache.get(source);
  if (!material) {
    material = source.clone();
    readableChainIronCache.set(source, material);
  } else {
    material.copy(source);
  }
  material.name = "Readable hanging-chain forged iron";
  material.emissive.set(0xffffff);
  material.emissiveMap = material.map;
  material.emissiveIntensity = 0.17;
  material.roughness = Math.min(material.roughness, 0.62);
  material.envMapIntensity = Math.max(material.envMapIntensity, 1.25);
  material.userData.materialRole = "readable-hanging-chain-iron";
  material.userData.indirectFill = 0.17;
  material.userData.sharedSourceMaterial = source.uuid;
  material.needsUpdate = true;
  return material;
}

function addBoltedCeilingMount(
  root: THREE.Group,
  materials: DungeonMaterials,
  partId = "ceiling-mount",
  radius = 0.16,
  boltPartId = `${partId}-bolts`,
): THREE.Group {
  const mount = pivot("Bolted ceiling mount pivot", partId);
  mount.add(
    mesh(
      new THREE.CylinderGeometry(radius, radius * 1.02, 0.075, 10),
      materials.iron,
      "Blackened iron ceiling plate",
      partId,
    ),
  );
  mount.position.y = -0.038;
  const boltGeometry = new THREE.CylinderGeometry(0.021, 0.023, 0.026, 6);
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
    const bolt = mesh(boltGeometry, materials.iron, "Ceiling plate bolt", boltPartId, true);
    bolt.position.set(Math.cos(angle) * radius * 0.67, -0.047, Math.sin(angle) * radius * 0.67);
    mount.add(bolt);
  }
  root.add(mount, socket("Ceiling contact socket", "ceiling", [0, 0, 0]));
  return mount;
}

function addChainLinks(
  parent: THREE.Group,
  materials: DungeonMaterials,
  count: number,
  startY: number,
  spacing: number,
  radius: number,
  partId: string,
  drift = 0,
  weldBands = false,
): number {
  const links = pivot(`${partId} pivot`, partId);
  const linkGeometry = new THREE.TorusGeometry(radius, radius * 0.24, 5, 10);
  const connectedScaleY = (spacing * 1.04) / (2 * radius * 1.24);
  const scaleY = Math.max(1.3, connectedScaleY);
  linkGeometry.scale(1, scaleY, 1);
  const weldGeometry = weldBands
    ? new THREE.BoxGeometry(radius * 0.34, radius * 0.18, radius * 0.5)
    : null;
  for (let index = 0; index < count; index += 1) {
    const link = mesh(linkGeometry, materials.iron, "Alternating oval chain link", partId);
    link.rotation.y = (index % 2) * (Math.PI / 2);
    const t = index / Math.max(1, count - 1);
    link.position.set(drift * t * t, startY - index * spacing, drift * 0.45 * t * t);
    links.add(link);
    if (weldGeometry) {
      const weld = mesh(weldGeometry, materials.iron, "Forged link weld band", "weld-bands", true);
      weld.rotation.y = link.rotation.y;
      weld.position.set(link.position.x, link.position.y - radius * scaleY, link.position.z);
      links.add(weld);
    }
  }
  parent.add(links);
  return startY - (count - 1) * spacing;
}

function addHookRackSupport(
  root: THREE.Group,
  materials: DungeonMaterials,
  side: -1 | 1,
  rackY: number,
): void {
  const topCenter = new THREE.Vector3(side * 0.11, -0.115, 0);
  const bottomCenter = new THREE.Vector3(side * 0.29, rackY + 0.085, 0);
  const topEye = mesh(
    new THREE.TorusGeometry(0.058, 0.018, 5, 10),
    materials.iron,
    "Hook rack plate suspension eye",
    "plate-suspension-eyes",
  );
  topEye.position.copy(topCenter);
  topEye.userData.attachedTo = ["ceiling-mount", "support-chains"];
  topEye.userData.chainSide = side < 0 ? "left" : "right";
  const bottomEye = mesh(
    new THREE.TorusGeometry(0.054, 0.017, 5, 10),
    materials.iron,
    "Hook rack bar suspension eye",
    "bar-suspension-eyes",
  );
  bottomEye.position.copy(bottomCenter);
  bottomEye.userData.attachedTo = ["support-chains", "rack-bar"];
  bottomEye.userData.chainSide = side < 0 ? "left" : "right";

  const chain = pivot("Four-link hook rack support pivot", "support-chains");
  const linkGeometry = new THREE.TorusGeometry(0.054, 0.014, 5, 10);
  linkGeometry.scale(1, 1.34, 1);
  for (let index = 0; index < 4; index += 1) {
    const t = THREE.MathUtils.lerp(0.22, 0.78, index / 3);
    const link = mesh(
      linkGeometry,
      materials.iron,
      "Hook rack support chain link",
      "support-chains",
    );
    link.position.lerpVectors(topCenter, bottomCenter, t);
    link.rotation.y = index % 2 === 0 ? -0.1 : Math.PI / 2 - 0.48;
    link.userData.interlocked = true;
    link.userData.chainSide = side < 0 ? "left" : "right";
    chain.add(link);
  }
  root.add(topEye, chain, bottomEye);
}

function addInterlockedChainLinks(
  parent: THREE.Group,
  materials: DungeonMaterials,
  count: number,
  startY: number,
  spacing: number,
  drift: number,
): number {
  const links = pivot("Interlocked chain links pivot", "alternating-links");
  const linkGeometry = createRectangularChainLinkGeometry();
  const weldGeometry = new THREE.BoxGeometry(0.036, 0.048, 0.064);
  for (let index = 0; index < count; index += 1) {
    const t = index / Math.max(1, count - 1);
    const frontFacing = index % 2 === 0;
    // Keep a strong alternating twist while leaving both holes readable in
    // front and profile QA. Exact 90 degree links collapse into dark rods.
    const yaw = frontFacing ? -0.42 : 0.82;
    const link = mesh(
      linkGeometry,
      materials.iron,
      "Alternating rectangular forged chain link",
      "alternating-links",
    );
    link.rotation.y = yaw;
    link.position.set(
      drift * t * t,
      startY - index * spacing,
      (frontFacing ? -0.018 : 0.018) + drift * 0.42 * t * t,
    );
    link.userData.interlocked = true;
    link.userData.chainOrientation = frontFacing ? "front" : "cross";
    links.add(link);

    const weldOffset = new THREE.Vector3(0.101, 0, 0).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      yaw,
    );
    const weld = mesh(weldGeometry, materials.iron, "Forged link weld collar", "weld-bands", true);
    weld.rotation.y = yaw;
    weld.position.copy(link.position).add(weldOffset);
    links.add(weld);
  }
  parent.add(links);
  return startY - (count - 1) * spacing;
}

function ironCage(materials: DungeonMaterials, length: number): THREE.Group {
  const root = pivot("Image-sculpted hanging iron cage", "root");
  addBoltedCeilingMount(root, materials, "ceiling-mount", 0.18);
  const eye = mesh(
    new THREE.TorusGeometry(0.07, 0.02, 5, 10),
    materials.iron,
    "Mount anchor eye",
    "anchor-eye",
  );
  eye.position.y = -0.13;
  root.add(eye);
  const chainTip = addChainLinks(root, materials, 4, -0.23, 0.155, 0.058, "suspender-links");

  const cage = pivot("Cylindrical cage body pivot", "cage-body");
  cage.position.y = chainTip - 0.13;
  const cageHeight = THREE.MathUtils.clamp(length * 0.43, 0.82, 1.15);
  const radius = 0.34;
  const roofBrace = mesh(
    new THREE.BoxGeometry(0.052, 0.045, radius * 1.84),
    materials.iron,
    "Cage load-bearing roof brace",
    "upper-frame-brace",
  );
  const roofEye = mesh(
    new THREE.TorusGeometry(0.07, 0.018, 5, 10),
    materials.iron,
    "Cage roof hanger eye",
    "upper-frame-hanger",
  );
  roofEye.position.y = 0.085;
  roofEye.scale.y = 1.08;
  roofEye.userData.attachedTo = ["suspender-links", "upper-frame-brace"];
  cage.add(roofBrace, roofEye);
  const hoopGeometry = new THREE.TorusGeometry(radius, 0.035, 5, 14);
  for (const [index, y] of [0, -cageHeight * 0.51, -cageHeight].entries()) {
    const hoop = mesh(hoopGeometry, materials.iron, "Cage structural hoop", "cage-hoops");
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    hoop.scale.setScalar(index === 2 ? 0.96 : 1);
    cage.add(hoop);
  }
  const barGeometry = new THREE.CylinderGeometry(0.022, 0.026, cageHeight, 5);
  for (let index = 0; index < 7; index += 1) {
    const angle = (index / 7) * Math.PI * 2;
    const bar = mesh(barGeometry, materials.iron, "Cage vertical bar", "vertical-bars");
    bar.position.set(
      Math.cos(angle) * radius * 0.92,
      -cageHeight * 0.5,
      Math.sin(angle) * radius * 0.92,
    );
    cage.add(bar);
  }
  const pan = mesh(
    new THREE.CylinderGeometry(radius * 0.95, radius * 0.91, 0.07, 12),
    materials.iron,
    "Cage shallow floor pan",
    "floor-pan",
  );
  pan.position.y = -cageHeight - 0.025;
  cage.add(pan);
  const door = pivot("Cage barred door hinge pivot", "barred-door");
  door.position.set(0, -cageHeight * 0.49, radius * 0.95);
  const sideGeometry = new THREE.BoxGeometry(0.045, cageHeight * 0.72, 0.035, 1, 1, 1);
  for (const x of [-0.115, 0.115]) {
    const rail = mesh(sideGeometry, materials.iron, "Door side rail", "barred-door");
    rail.position.x = x;
    door.add(rail);
  }
  const crossGeometry = new THREE.BoxGeometry(0.275, 0.045, 0.035);
  for (const y of [-cageHeight * 0.33, cageHeight * 0.33]) {
    const rail = mesh(crossGeometry, materials.iron, "Door cross rail", "barred-door");
    rail.position.y = y;
    door.add(rail);
  }
  const hingeGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.13, 6);
  for (const y of [-cageHeight * 0.24, cageHeight * 0.24]) {
    const hinge = mesh(hingeGeometry, materials.iron, "Door hinge barrel", "door-hinges", true);
    hinge.position.set(-0.155, y, 0);
    door.add(hinge);
  }
  cage.add(door);
  root.add(
    cage,
    socket("Cage captive socket", "captive", [0, cage.position.y - cageHeight * 0.55, 0]),
  );
  return finish(root, "iron-cage", length);
}

function oilLantern(materials: DungeonMaterials, length: number): THREE.Group {
  const root = pivot("Image-sculpted hanging oil lantern", "root");
  addBoltedCeilingMount(root, materials);
  const chainTip = addChainLinks(root, materials, 3, -0.2, 0.15, 0.052, "lantern-chain");
  const body = pivot("Lantern body pivot", "lantern-body");
  body.position.y = chainTip - 0.08;
  const cap = mesh(
    new THREE.SphereGeometry(0.15, 8, 5),
    materials.iron,
    "Lantern faceted cap",
    "lantern-cap",
  );
  cap.scale.y = 0.55;
  const reservoir = mesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    materials.brass,
    "Lantern oil reservoir",
    "reservoir",
  );
  reservoir.scale.y = 0.7;
  reservoir.position.y = -0.48;
  const glass = mesh(
    new THREE.CylinderGeometry(0.1, 0.105, 0.28, 8),
    materials.crystal,
    "Lantern glass chamber",
    "glass-chamber",
  );
  glass.position.y = -0.28;
  body.add(cap, reservoir, glass);
  const cageBarGeometry = new THREE.CylinderGeometry(0.012, 0.012, 0.34, 5);
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2;
    const bar = mesh(cageBarGeometry, materials.iron, "Lantern guard bar", "guard-bars");
    bar.position.set(Math.cos(angle) * 0.12, -0.29, Math.sin(angle) * 0.12);
    body.add(bar);
  }
  root.add(body, socket("Lantern flame socket", "flame", [0, body.position.y - 0.29, 0]));
  return finish(root, "oil-lantern", length);
}

function tatteredBanner(materials: DungeonMaterials, length: number): THREE.Group {
  const root = pivot("Image-sculpted tattered hanging banner", "root");
  addBoltedCeilingMount(root, materials, "ceiling-mount", 0.18);
  const rodY = -0.48;
  for (const side of [-1, 1] as const) {
    const support = pivot("Banner support chain pivot", "support-chains");
    support.position.x = side * 0.1;
    support.rotation.z = side * 0.35;
    addChainLinks(support, materials, 2, -0.18, 0.15, 0.045, "support-chains");
    root.add(support);
  }
  const rodLength = 0.86;
  const rod = mesh(
    new THREE.CylinderGeometry(0.045, 0.045, rodLength, 7),
    materials.wood,
    "Weathered banner cross rod",
    "wooden-rod",
  );
  rod.rotation.z = Math.PI / 2;
  rod.position.y = rodY;
  root.add(rod);
  for (const x of [-rodLength * 0.53, rodLength * 0.53]) {
    const finial = mesh(
      new THREE.SphereGeometry(0.065, 7, 5),
      materials.iron,
      "Forged banner rod finial",
      "brass-finials",
    );
    finial.scale.x = 1.18;
    finial.position.set(x, rodY, 0);
    root.add(finial);
  }
  for (const x of [-0.23, 0.23]) {
    const anchor = mesh(
      new THREE.TorusGeometry(0.047, 0.014, 5, 10),
      materials.iron,
      "Banner rod suspension eye",
      "rod-suspension-eyes",
    );
    anchor.position.set(x, rodY + 0.078, 0);
    anchor.userData.attachedTo = ["support-chains", "wooden-rod"];
    const strap = mesh(
      new THREE.TorusGeometry(0.055, 0.015, 5, 10),
      materials.iron,
      "Banner cloth retaining strap",
      "cloth-straps",
    );
    strap.rotation.y = Math.PI / 2;
    strap.position.set(x, rodY - 0.012, 0);
    strap.scale.y = 1.55;
    strap.userData.attachedTo = ["wooden-rod", "cloth-panel"];
    root.add(anchor, strap);
  }
  const clothHeight = THREE.MathUtils.clamp(length * 0.65, 1.05, 1.55);
  const cloth = mesh(
    createClothGeometry(0.68, clothHeight),
    getTatteredBannerClothMaterial(materials),
    "Tattered oxblood cloth panel",
    "cloth-panel",
  );
  cloth.position.y = rodY - 0.075;
  cloth.userData.tearCount = 4;
  cloth.userData.sideCutCount = 2;
  root.add(
    cloth,
    socket("Banner face socket", "banner-face", [0, rodY - clothHeight * 0.45, 0.035]),
  );
  return finish(root, "tattered-banner", length);
}

function meatHooks(materials: DungeonMaterials, length: number): THREE.Group {
  const root = pivot("Image-sculpted hanging meat hook rack", "root");
  addBoltedCeilingMount(root, materials, "ceiling-mount", 0.16);
  const rackY = -0.65;
  addHookRackSupport(root, materials, -1, rackY);
  addHookRackSupport(root, materials, 1, rackY);
  const bar = mesh(
    new THREE.BoxGeometry(0.86, 0.08, 0.085),
    materials.iron,
    "Forged hook rack bar",
    "rack-bar",
  );
  bar.position.y = rackY;
  root.add(bar);
  const collarGeometry = new THREE.CylinderGeometry(0.052, 0.058, 0.13, 8);
  for (const x of [-0.29, 0, 0.29]) {
    const collar = mesh(
      collarGeometry,
      materials.iron,
      "Forged rack hook collar",
      "rack-collars",
      true,
    );
    collar.position.set(x, rackY - 0.04, 0);
    collar.userData.attachedTo = ["rack-bar", "hook-system"];
    root.add(collar);
  }
  const hookPath = [
    new THREE.Vector3(0, 0.045, 0),
    new THREE.Vector3(-0.006, -0.06, 0),
    new THREE.Vector3(-0.003, -0.19, 0.002),
    new THREE.Vector3(0.008, -0.31, 0.004),
    new THREE.Vector3(0.052, -0.405, 0.006),
    new THREE.Vector3(0.13, -0.445, 0.006),
    new THREE.Vector3(0.188, -0.398, 0.004),
    new THREE.Vector3(0.194, -0.31, 0.002),
    new THREE.Vector3(0.158, -0.255, 0),
  ];
  for (const [index, x] of [-0.29, 0, 0.29].entries()) {
    const hookPivot = pivot("Open meat hook pivot", `hook-${index + 1}`);
    hookPivot.position.set(x, rackY - 0.035, 0);
    hookPivot.add(
      mesh(
        createTaperedTubeGeometry(hookPath, 0.027, 0.015, 15, 7),
        materials.iron,
        "Round curved forged meat hook",
        "hook-system",
      ),
    );
    root.add(hookPivot);
  }
  const haunch = pivot("Cured meat haunch pivot", "haunch");
  haunch.position.set(-0.14, rackY - 0.64, 0.012);
  const meat = mesh(
    createCuredMeatHaunchGeometry(),
    getCuredMeatMaterial(materials),
    "Low-poly cured meat haunch",
    "haunch",
  );
  const tie = mesh(
    new THREE.TorusGeometry(0.039, 0.01, 5, 10),
    materials.iron,
    "Haunch retaining iron band",
    "haunch-tie",
    true,
  );
  tie.rotation.x = Math.PI / 2;
  tie.rotation.z = -0.12;
  tie.scale.z = 0.78;
  tie.position.set(-0.011, 0.307, 0.003);
  tie.userData.attachedTo = ["hook-system", "haunch"];
  const tendon = mesh(
    createTaperedTubeGeometry(
      [
        new THREE.Vector3(-0.012, 0.35, 0),
        new THREE.Vector3(-0.006, 0.405, 0.002),
        new THREE.Vector3(0.006, 0.45, 0.003),
      ],
      0.018,
      0.012,
      5,
      6,
    ),
    getCuredMeatMaterial(materials),
    "Narrow cured tendon joining band to hook",
    "haunch-tendon",
  );
  tendon.userData.attachedTo = ["haunch-tie", "hook-system"];
  haunch.add(meat, tie, tendon);
  root.add(haunch, socket("Hook load socket", "hang-load", [-0.14, rackY - 0.275, 0.02]));
  return finish(root, "meat-hooks", length);
}

function boneMobile(materials: DungeonMaterials, length: number): THREE.Group {
  const root = pivot("Image-sculpted hanging bone mobile", "root");
  const ceilingPeg = mesh(
    new THREE.CylinderGeometry(0.15, 0.15, 0.1, 7),
    materials.wood,
    "Rough wooden ceiling peg",
    "ceiling-peg",
  );
  ceilingPeg.position.y = -0.05;
  const ceilingKnot = mesh(
    new THREE.DodecahedronGeometry(0.09, 0),
    materials.wood,
    "Knotted wooden suspension boss",
    "ceiling-knot",
  );
  ceilingKnot.scale.set(0.9, 1.18, 0.86);
  ceilingKnot.position.y = -0.145;
  root.add(ceilingPeg, ceilingKnot, socket("Bone mobile ceiling socket", "ceiling", [0, 0, 0]));

  const support = pivot("Crossed wood and leather mobile support", "wood-support");
  support.position.y = -0.29;
  const longBar = mesh(
    new THREE.BoxGeometry(0.74, 0.072, 0.095),
    materials.wood,
    "Uneven long wooden mobile bar",
    "wood-support",
  );
  longBar.rotation.z = 0.035;
  const crossBar = mesh(
    new THREE.BoxGeometry(0.1, 0.066, 0.56),
    materials.wood,
    "Short crossed wooden mobile bar",
    "wood-support",
  );
  crossBar.rotation.y = -0.13;
  support.add(longBar, crossBar);
  for (const [index, rotation] of [-0.08, 0.09, -0.04].entries()) {
    const wrap = mesh(
      new THREE.BoxGeometry(0.085 + index * 0.006, 0.092, 0.125),
      materials.cloth,
      "Dark leather support binding",
      "leather-bindings",
      true,
    );
    wrap.rotation.y = rotation;
    wrap.position.x = (index - 1) * 0.035;
    support.add(wrap);
  }
  root.add(support);

  const upperRope = mesh(
    createTaperedTubeGeometry(
      [
        new THREE.Vector3(0, -0.14, 0),
        new THREE.Vector3(-0.018, -0.22, 0.014),
        new THREE.Vector3(0, -0.3, 0),
      ],
      0.022,
      0.017,
      6,
      5,
    ),
    materials.cloth,
    "Twisted upper suspension rope",
    "upper-rope",
  );
  upperRope.userData.attachedTo = ["ceiling-peg", "wood-support"];
  root.add(upperRope);

  const wrapGeometry = new THREE.TorusGeometry(0.125, 0.018, 5, 10);
  for (const y of [-0.125, -0.175]) {
    const wrap = mesh(
      wrapGeometry,
      materials.cloth,
      "Leather ceiling rope wrap",
      "rope-knots",
      true,
    );
    wrap.rotation.x = Math.PI / 2;
    wrap.position.y = y;
    root.add(wrap);
  }
  const totalDrop = THREE.MathUtils.clamp(length * 0.72, 1.1, 1.7);
  const strandAssembly = pivot("Five-strand asymmetric hanging assembly", "strand-assembly");
  const anchors = [
    [-0.32, 0.012],
    [-0.13, 0.12],
    [0.01, -0.015],
    [0.16, -0.13],
    [0.33, 0.025],
  ] as const;
  const dropScales = [0.72, 0.88, 0.79, 0.97, 0.84] as const;
  const boneLengths = [0.34, 0.43, 0.31, 0.47] as const;
  let boneIndex = 0;
  anchors.forEach(([x, z], index) => {
    const strandLength = totalDrop * dropScales[index]!;
    const strand = mesh(
      createTaperedTubeGeometry(
        [
          new THREE.Vector3(x, -0.3, z),
          new THREE.Vector3(x * 1.05 + (index - 2) * 0.012, -strandLength * 0.52, z * 0.94),
          new THREE.Vector3(x + (index % 2 === 0 ? -0.018 : 0.022), -strandLength, z * 1.08),
        ],
        0.015,
        0.01,
        8,
        5,
      ),
      materials.cloth,
      "Twisted bone mobile rope strand",
      "rope-routes",
    );
    strandAssembly.add(strand);
    if (index === 2) {
      const skull = pivot("Animal skull pivot", "animal-skull");
      skull.position.set(x, -strandLength - 0.11, z);
      const cranium = mesh(
        new THREE.DodecahedronGeometry(0.145, 0),
        materials.bone,
        "Asymmetric faceted animal skull cranium",
        "animal-skull",
      );
      cranium.scale.set(1.02, 0.84, 0.9);
      cranium.rotation.z = 0.055;
      const muzzle = mesh(
        new THREE.DodecahedronGeometry(0.092, 0),
        materials.bone,
        "Long animal skull snout",
        "animal-skull",
      );
      muzzle.scale.set(0.72, 0.82, 1.2);
      muzzle.position.set(0.008, -0.115, 0.082);
      const eyeSockets = [
        { x: -0.054, y: 0.005, radius: 0.041 },
        { x: 0.058, y: -0.006, radius: 0.034 },
      ] as const;
      for (const eye of eyeSockets) {
        const eyeSocket = mesh(
          new THREE.CircleGeometry(eye.radius, 7),
          materials.darkStone,
          "Deep asymmetric animal skull eye hollow",
          "animal-skull",
          true,
        );
        eyeSocket.position.set(eye.x, eye.y, 0.125);
        skull.add(eyeSocket);
      }
      const noseSocket = mesh(
        new THREE.CircleGeometry(0.026, 5),
        materials.darkStone,
        "Animal skull nasal hollow",
        "animal-skull",
        true,
      );
      noseSocket.position.set(0.012, -0.123, 0.181);
      const jawLeft = mesh(
        createTaperedTubeGeometry(
          [
            new THREE.Vector3(-0.067, -0.11, 0.075),
            new THREE.Vector3(-0.073, -0.205, 0.105),
            new THREE.Vector3(-0.042, -0.252, 0.155),
            new THREE.Vector3(0, -0.258, 0.165),
          ],
          0.022,
          0.014,
          6,
          5,
        ),
        materials.bone,
        "Left animal skull jaw rail",
        "animal-skull-jaw",
      );
      const jawRight = mesh(
        createTaperedTubeGeometry(
          [
            new THREE.Vector3(0.073, -0.115, 0.073),
            new THREE.Vector3(0.078, -0.198, 0.11),
            new THREE.Vector3(0.047, -0.247, 0.154),
            new THREE.Vector3(0, -0.258, 0.165),
          ],
          0.021,
          0.014,
          6,
          5,
        ),
        materials.bone,
        "Right animal skull jaw rail",
        "animal-skull-jaw",
      );
      skull.add(cranium, muzzle, noseSocket, jawLeft, jawRight);
      strandAssembly.add(skull);
    } else {
      const bone = mesh(
        createLongBoneGeometry(boneLengths[boneIndex]!),
        materials.bone,
        "Distinct hanging long bone",
        "long-bones",
      );
      bone.position.set(x, -strandLength - 0.19, z);
      bone.rotation.set(
        (boneIndex - 1.5) * 0.11,
        boneIndex * 0.37,
        [-0.31, 0.18, -0.12, 0.27][boneIndex]!,
      );
      bone.userData.boneIdentity = boneIndex + 1;
      strandAssembly.add(bone);
      boneIndex += 1;
    }
    const knot = mesh(
      new THREE.TorusGeometry(0.034, 0.011, 5, 8),
      materials.cloth,
      "Tight load rope knot",
      "rope-knots",
      true,
    );
    knot.rotation.x = Math.PI / 2;
    knot.position.set(x, -strandLength + 0.02, z);
    strandAssembly.add(knot);
  });
  root.add(strandAssembly);
  root.add(socket("Mobile ritual socket", "ritual-item", [0, -totalDrop * 0.55, 0]));
  return finish(root, "bone-mobile", length);
}

function rootCluster(materials: DungeonMaterials, length: number): THREE.Group {
  const root = pivot("Image-sculpted hanging root cluster", "root");
  const rootMaterial = getReadableRootMaterial(materials);
  const crown = mesh(
    new THREE.CylinderGeometry(0.18, 0.235, 0.38, 8),
    rootMaterial,
    "Closed cut woody ceiling stump",
    "cut-crown",
  );
  crown.position.y = -0.19;
  crown.userData.closedStump = true;
  const cutTop = mesh(
    new THREE.CircleGeometry(0.177, 14),
    materials.wood,
    "Exposed root crown cut top",
    "cut-top",
  );
  cutTop.rotation.x = -Math.PI / 2;
  cutTop.position.y = 0.003;
  root.add(crown, cutTop, socket("Root crown ceiling socket", "ceiling", [0, 0, 0]));
  for (const [index, radius] of [0.065, 0.125].entries()) {
    const ring = mesh(
      new THREE.TorusGeometry(radius, 0.005, 3, 12),
      rootMaterial,
      "Raised growth ring",
      `growth-ring-${index + 1}`,
      true,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.008 + index * 0.002;
    root.add(ring);
  }
  const network = pivot("Crossing bifurcated root network pivot", "root-network");
  const primaryRoots = pivot("Five unequal primary roots pivot", "primary-roots");
  const drop = THREE.MathUtils.clamp(length * 0.7, 1.15, 1.65);
  const primaryPaths = [
    [
      [-0.08, -0.18, 0.02],
      [-0.21, -0.39, 0.12],
      [0.055, -drop * 0.58, 0.18],
      [0.31, -drop * 0.86, 0.1],
    ],
    [
      [0.07, -0.18, -0.04],
      [0.2, -0.41, -0.13],
      [-0.08, -drop * 0.55, -0.2],
      [-0.26, -drop * 0.98, -0.06],
    ],
    [
      [0.02, -0.18, 0.08],
      [0.15, -0.34, 0.25],
      [0.3, -drop * 0.49, 0.12],
      [0.17, -drop * 0.74, -0.22],
    ],
    [
      [-0.03, -0.19, -0.1],
      [-0.16, -0.43, -0.25],
      [0.08, -drop * 0.62, -0.26],
      [0.31, -drop * 0.92, -0.35],
    ],
    [
      [0.1, -0.2, 0.03],
      [0.04, -0.49, 0.04],
      [-0.24, -drop * 0.59, 0.06],
      [-0.14, -drop * 0.79, 0.28],
    ],
  ] as const;
  const resolvedPaths = primaryPaths.map((path) =>
    path.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  );
  resolvedPaths.forEach((points, index) => {
    primaryRoots.add(
      mesh(
        createTaperedTubeGeometry(points, 0.115 - index * 0.006, 0.026, 8, 6),
        rootMaterial,
        "Angular crossing crown root",
        `primary-root-${index + 1}`,
      ),
    );
  });
  network.add(primaryRoots);
  const branchDefinitions = [
    [
      resolvedPaths[0]![2]!,
      new THREE.Vector3(-0.13, -drop * 0.72, 0.29),
      new THREE.Vector3(-0.3, -drop * 0.91, 0.22),
    ],
    [
      resolvedPaths[1]![2]!,
      new THREE.Vector3(0.12, -drop * 0.69, -0.08),
      new THREE.Vector3(0.29, -drop * 0.84, 0.03),
    ],
    [
      resolvedPaths[4]![2]!,
      new THREE.Vector3(-0.02, -drop * 0.72, -0.04),
      new THREE.Vector3(0.14, -drop * 0.88, -0.17),
    ],
  ] as const;
  branchDefinitions.forEach((points, index) => {
    const branch = mesh(
      createTaperedTubeGeometry(points, 0.05, 0.018, 6, 5),
      rootMaterial,
      "Joined bifurcated hanging root",
      `root-branch-${index + 1}`,
    );
    branch.userData.attachedTo = [`primary-root-${[1, 2, 5][index]}`];
    network.add(branch);
  });
  const knotPoints = [resolvedPaths[0]![1]!, resolvedPaths[1]![1]!, resolvedPaths[4]![2]!] as const;
  knotPoints.forEach((position, index) => {
    const knot = mesh(
      new THREE.DodecahedronGeometry(0.085 - index * 0.009, 0),
      rootMaterial,
      "Woody root junction knot",
      "root-knots",
      true,
    );
    knot.position.copy(position);
    knot.scale.set(1.25, 0.82, 0.94 + index * 0.05);
    network.add(knot);
  });
  root.add(network);
  for (let index = 0; index < 3; index += 1) {
    const angle = index * 2.15 + 0.6;
    const moss = mesh(
      createMossPatchGeometry(0.06),
      materials.darkStone,
      "Attached moss clump",
      "moss-clumps",
      true,
    );
    moss.scale.set(1, 1.12, 1);
    moss.rotation.y = Math.PI / 2 - angle;
    moss.position.set(Math.cos(angle) * 0.218, -0.27 - index * 0.085, Math.sin(angle) * 0.218);
    root.add(moss);
  }
  root.add(socket("Lowest root effect socket", "organic-hang", [0, -drop, 0]));
  return finish(root, "root-cluster", length);
}

function hangingChain(materials: DungeonMaterials, length: number): THREE.Group {
  const root = pivot("Image-sculpted hanging chain", "root");
  const chainMaterials: DungeonMaterials = {
    ...materials,
    iron: getReadableChainIronMaterial(materials),
  };
  addBoltedCeilingMount(root, chainMaterials, "ceiling-mount", 0.22, "mount-bolts");
  const assembly = pivot("Nine-link chain assembly pivot", "chain-assembly");
  const mountNeck = mesh(
    new THREE.CylinderGeometry(0.058, 0.072, 0.14, 8),
    chainMaterials.iron,
    "Heavy forged mount neck",
    "mount-neck",
  );
  mountNeck.position.y = -0.125;
  mountNeck.userData.attachedTo = ["ceiling-mount", "anchor-eye"];
  const eye = mesh(
    new THREE.TorusGeometry(0.092, 0.031, 6, 12),
    chainMaterials.iron,
    "Heavy welded chain anchor eye",
    "anchor-eye",
  );
  eye.position.y = -0.205;
  const shacklePin = mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.19, 8),
    chainMaterials.iron,
    "Forged anchor shackle pin",
    "anchor-shackle",
  );
  shacklePin.rotation.z = Math.PI / 2;
  shacklePin.position.set(0, -0.205, 0);
  assembly.add(mountNeck, eye, shacklePin);
  const available = THREE.MathUtils.clamp(length, 1.65, 3.2);
  const spacing = THREE.MathUtils.clamp((available - 0.53) / 8, 0.19, 0.265);
  const tipY = addInterlockedChainLinks(assembly, chainMaterials, 9, -0.32, spacing, 0.028);
  const hookPoints = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.004, -0.11, 0),
    new THREE.Vector3(0.008, -0.23, 0.004),
    new THREE.Vector3(0.045, -0.34, 0.006),
    new THREE.Vector3(0.13, -0.405, 0.006),
    new THREE.Vector3(0.225, -0.37, 0.004),
    new THREE.Vector3(0.265, -0.275, 0.002),
    new THREE.Vector3(0.245, -0.18, 0),
    new THREE.Vector3(0.202, -0.13, 0),
  ];
  const hook = mesh(
    createTaperedTubeGeometry(hookPoints, 0.055, 0.026, 15, 7),
    chainMaterials.iron,
    "Heavy round open chain hook",
    "end-hook",
  );
  hook.position.set(0.028, tipY - spacing * 0.55, 0.012);
  assembly.add(hook);
  root.add(
    assembly,
    socket("Chain hook load socket", "hang-load", [0.13, hook.position.y - 0.2, 0]),
  );
  return finish(root, "hanging-chain", length);
}

function hangingVine(materials: DungeonMaterials, length: number): THREE.Group {
  const root = pivot("Image-sculpted hanging vine", "root");
  const rootMaterial = getReadableRootMaterial(materials);
  const ceilingPlate = mesh(
    new THREE.CylinderGeometry(0.2, 0.18, 0.08, 7),
    rootMaterial,
    "Irregular cut vine ceiling plate",
    "ceiling-root",
  );
  ceilingPlate.position.y = -0.04;
  const knot = mesh(
    new THREE.DodecahedronGeometry(0.15, 0),
    rootMaterial,
    "Knotted ceiling root mass",
    "root-knot",
  );
  knot.scale.set(1, 1.25, 0.9);
  knot.position.y = -0.17;
  root.add(ceilingPlate, knot, socket("Vine ceiling socket", "ceiling", [0, 0, 0]));
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2 + 0.2;
    const reach = 0.2 + (index % 2) * 0.045;
    const prong = mesh(
      createTaperedTubeGeometry(
        [
          new THREE.Vector3(Math.cos(angle) * 0.07, -0.12, Math.sin(angle) * 0.07),
          new THREE.Vector3(
            Math.cos(angle + 0.14) * reach * 0.72,
            -0.18 - (index % 2) * 0.025,
            Math.sin(angle + 0.14) * reach * 0.72,
          ),
          new THREE.Vector3(
            Math.cos(angle - 0.08) * reach,
            -0.15 - (index % 3) * 0.025,
            Math.sin(angle - 0.08) * reach,
          ),
        ],
        0.045,
        0.014,
        5,
        5,
      ),
      rootMaterial,
      "Lateral ceiling root prong",
      "root-prongs",
    );
    root.add(prong);
  }
  const drop = THREE.MathUtils.clamp(length, 1.7, 3.2);
  const stemPoints = [
    new THREE.Vector3(0.015, -0.14, 0),
    new THREE.Vector3(0.035, -0.28, -0.02),
    new THREE.Vector3(-0.09, -drop * 0.25, 0.035),
    new THREE.Vector3(0.08, -drop * 0.52, -0.03),
    new THREE.Vector3(-0.055, -drop * 0.76, 0.025),
    new THREE.Vector3(0.015, -drop, 0),
  ];
  root.add(
    mesh(
      createTaperedTubeGeometry(stemPoints, 0.078, 0.018, 15, 6),
      rootMaterial,
      "Single S-curved vine stem",
      "main-stem",
    ),
  );
  const leaves = createLeafGeometry();
  const branchHeights = [0.27, 0.54, 0.78];
  const leafYaw = [0.52, -0.46, 0.62];
  branchHeights.forEach((fraction, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const y = -drop * fraction;
    const branchStart = new THREE.Vector3(side * 0.03, y, 0);
    const branchEnd = new THREE.Vector3(side * (0.18 + index * 0.025), y - 0.1, 0.04 * side);
    const tendril = mesh(
      createTaperedTubeGeometry([branchStart, branchEnd], 0.026, 0.012, 4, 4),
      rootMaterial,
      "Attached vine tendril",
      "side-tendrils",
    );
    root.add(tendril);
    const leaf = mesh(leaves, rootMaterial, "Pointed low-poly vine leaf", "leaf-cluster");
    leaf.position.copy(branchEnd).add(new THREE.Vector3(side * 0.055, -0.06, 0));
    leaf.rotation.set(0.12 * side, leafYaw[index]!, -0.5 * side);
    leaf.scale.set(1.08, 1.15, 1);
    root.add(leaf);
  });
  root.add(socket("Vine tip socket", "organic-hang", [0.015, -drop, 0]));
  return finish(root, "hanging-vine", length);
}

export function createImageSculptedHanging(
  family: ImageSculptedHangingFamily,
  materials: DungeonMaterials,
  length = 2.2,
  _variant = 0,
): THREE.Group {
  if (family === "iron-cage") return ironCage(materials, length);
  if (family === "oil-lantern") return oilLantern(materials, length);
  if (family === "tattered-banner") return tatteredBanner(materials, length);
  if (family === "meat-hooks") return meatHooks(materials, length);
  if (family === "bone-mobile") return boneMobile(materials, length);
  if (family === "root-cluster") return rootCluster(materials, length);
  if (family === "hanging-chain") return hangingChain(materials, length);
  return hangingVine(materials, length);
}

export function isImageSculptedHangingFamily(value: string): value is ImageSculptedHangingFamily {
  return (IMAGE_SCULPTED_HANGING_FAMILIES as readonly string[]).includes(value);
}
