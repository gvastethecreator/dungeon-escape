import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { DungeonMaterials } from "./MaterialLibrary";
import { createLuminousWardGoldMaterial } from "./LuminousWardMaterial";

export const TIME_FREEZE_PICKUP_LIGHT_INTENSITY = 0.52;
export const LUMINOUS_WARD_PICKUP_LIGHT_INTENSITY = 1.08;
export const LUMINOUS_WARD_PICKUP_GLOW_OPACITY = 0.12;
export const ANNIHILATION_PULSE_PICKUP_LIGHT_INTENSITY = 1.32;
export const ANNIHILATION_PULSE_PICKUP_GLOW_OPACITY = 0.16;

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.castShadow = true;
  return result;
}

function mergeGeometryParts(parts: THREE.BufferGeometry[], name: string): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error(`Could not merge ${name}.`);
  merged.name = name;
  return merged;
}

function transformedGeometry(
  geometry: THREE.BufferGeometry,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
  scale: readonly [number, number, number] = [1, 1, 1],
): THREE.BufferGeometry {
  return geometry.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    ),
  );
}

const WARD_CORE_SEGMENTS = 8;
const WARD_CORE_RADIAL_NOISE = [1, 0.91, 1.07, 0.96, 1.03, 0.89, 1.08, 0.94] as const;
const WARD_CORE_RINGS = [
  { y: 0, radius: 0.19, twist: 0.04, shift: 0 },
  { y: 0.07, radius: 0.31, twist: -0.035, shift: 2 },
  { y: 0.2, radius: 0.4, twist: 0.02, shift: 5 },
  { y: 0.39, radius: 0.38, twist: -0.055, shift: 1 },
  { y: 0.53, radius: 0.28, twist: 0.045, shift: 4 },
  { y: 0.63, radius: 0.16, twist: -0.02, shift: 6 },
  { y: 0.68, radius: 0.12, twist: 0.025, shift: 3 },
] as const;

function wardCorePoint(ringIndex: number, segment: number): THREE.Vector3 {
  const ring = WARD_CORE_RINGS[ringIndex]!;
  const wrapped = ((segment % WARD_CORE_SEGMENTS) + WARD_CORE_SEGMENTS) % WARD_CORE_SEGMENTS;
  const angle = (wrapped / WARD_CORE_SEGMENTS) * Math.PI * 2 + ring.twist;
  const radius = ring.radius * WARD_CORE_RADIAL_NOISE[(wrapped + ring.shift) % WARD_CORE_SEGMENTS]!;
  return new THREE.Vector3(Math.sin(angle) * radius, ring.y, Math.cos(angle) * radius);
}

function wardRingRadiusAtAngle(ringIndex: number, angle: number): number {
  const direction = new THREE.Vector2(Math.sin(angle), Math.cos(angle));
  let radius = 0;
  for (let segment = 0; segment < WARD_CORE_SEGMENTS; segment += 1) {
    const first3d = wardCorePoint(ringIndex, segment);
    const second3d = wardCorePoint(ringIndex, segment + 1);
    const first = new THREE.Vector2(first3d.x, first3d.z);
    const edge = new THREE.Vector2(second3d.x - first3d.x, second3d.z - first3d.z);
    const denominator = direction.x * edge.y - direction.y * edge.x;
    if (Math.abs(denominator) < 1e-6) continue;
    const distance = (first.x * edge.y - first.y * edge.x) / denominator;
    const edgeFraction = (first.x * direction.y - first.y * direction.x) / denominator;
    if (distance > 0 && edgeFraction >= -1e-5 && edgeFraction <= 1 + 1e-5) {
      radius = Math.max(radius, distance);
    }
  }
  return radius;
}

function wardCoreSurfaceRadius(angle: number, worldY: number): number {
  const localY = THREE.MathUtils.clamp(
    worldY - 0.4,
    WARD_CORE_RINGS[0].y,
    WARD_CORE_RINGS.at(-1)!.y,
  );
  for (let index = 0; index < WARD_CORE_RINGS.length - 1; index += 1) {
    const lower = WARD_CORE_RINGS[index]!;
    const upper = WARD_CORE_RINGS[index + 1]!;
    if (localY > upper.y) continue;
    const mix = THREE.MathUtils.inverseLerp(lower.y, upper.y, localY);
    return THREE.MathUtils.lerp(
      wardRingRadiusAtAngle(index, angle),
      wardRingRadiusAtAngle(index + 1, angle),
      mix,
    );
  }
  return wardRingRadiusAtAngle(WARD_CORE_RINGS.length - 1, angle);
}

function createFacetedWardCoreGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const vertex = (position: THREE.Vector3, u: number, v: number): void => {
    positions.push(position.x, position.y, position.z);
    uvs.push(u, v);
  };

  for (let ringIndex = 0; ringIndex < WARD_CORE_RINGS.length - 1; ringIndex += 1) {
    const v0 = WARD_CORE_RINGS[ringIndex]!.y / WARD_CORE_RINGS.at(-1)!.y;
    const v1 = WARD_CORE_RINGS[ringIndex + 1]!.y / WARD_CORE_RINGS.at(-1)!.y;
    for (let segment = 0; segment < WARD_CORE_SEGMENTS; segment += 1) {
      const u0 = segment / WARD_CORE_SEGMENTS;
      const u1 = (segment + 1) / WARD_CORE_SEGMENTS;
      const lower = wardCorePoint(ringIndex, segment);
      const lowerNext = wardCorePoint(ringIndex, segment + 1);
      const upper = wardCorePoint(ringIndex + 1, segment);
      const upperNext = wardCorePoint(ringIndex + 1, segment + 1);
      vertex(lower, u0, v0);
      vertex(lowerNext, u1, v0);
      vertex(upperNext, u1, v1);
      vertex(lower, u0, v0);
      vertex(upperNext, u1, v1);
      vertex(upper, u0, v1);
    }
  }

  const capVertex = (position: THREE.Vector3, radius: number): void => {
    vertex(position, 0.5 + position.x / (radius * 2.4), 0.5 + position.z / (radius * 2.4));
  };
  const bottomCenter = new THREE.Vector3(0, WARD_CORE_RINGS[0]!.y, 0);
  const topCenter = new THREE.Vector3(0, WARD_CORE_RINGS.at(-1)!.y, 0);
  for (let segment = 0; segment < WARD_CORE_SEGMENTS; segment += 1) {
    capVertex(bottomCenter, WARD_CORE_RINGS[0]!.radius);
    capVertex(wardCorePoint(0, segment + 1), WARD_CORE_RINGS[0]!.radius);
    capVertex(wardCorePoint(0, segment), WARD_CORE_RINGS[0]!.radius);
    capVertex(topCenter, WARD_CORE_RINGS.at(-1)!.radius);
    capVertex(wardCorePoint(WARD_CORE_RINGS.length - 1, segment), WARD_CORE_RINGS.at(-1)!.radius);
    capVertex(
      wardCorePoint(WARD_CORE_RINGS.length - 1, segment + 1),
      WARD_CORE_RINGS.at(-1)!.radius,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.name = "Luminous ward irregular faceted mineral geometry";
  geometry.userData.wardCore = {
    ringCount: WARD_CORE_RINGS.length,
    segmentCount: WARD_CORE_SEGMENTS,
    profile: "asymmetric mineral loft",
  };
  return geometry;
}

function createFacetedWardStopperGeometry(): THREE.BufferGeometry {
  const segments = 7;
  const rings = [
    { y: -0.09, radius: 0.13, twist: 0 },
    { y: 0.005, radius: 0.105, twist: 0.11 },
    { y: 0.09, radius: 0.057, twist: 0.04 },
  ] as const;
  const noise = [1, 0.92, 1.05, 0.95, 1.03, 0.9, 1.02] as const;
  const positions: number[] = [];
  const uvs: number[] = [];
  const point = (ringIndex: number, segment: number): THREE.Vector3 => {
    const ring = rings[ringIndex]!;
    const wrapped = ((segment % segments) + segments) % segments;
    const angle = (wrapped / segments) * Math.PI * 2 + ring.twist;
    const radius = ring.radius * noise[(wrapped + ringIndex * 2) % segments]!;
    return new THREE.Vector3(Math.sin(angle) * radius, ring.y, Math.cos(angle) * radius);
  };
  const vertex = (value: THREE.Vector3, u: number, v: number): void => {
    positions.push(value.x, value.y, value.z);
    uvs.push(u, v);
  };
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const u0 = segment / segments;
      const u1 = (segment + 1) / segments;
      const lower = point(ringIndex, segment);
      const lowerNext = point(ringIndex, segment + 1);
      const upper = point(ringIndex + 1, segment);
      const upperNext = point(ringIndex + 1, segment + 1);
      vertex(lower, u0, ringIndex / 2);
      vertex(lowerNext, u1, ringIndex / 2);
      vertex(upperNext, u1, (ringIndex + 1) / 2);
      vertex(lower, u0, ringIndex / 2);
      vertex(upperNext, u1, (ringIndex + 1) / 2);
      vertex(upper, u0, (ringIndex + 1) / 2);
    }
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const u0 = segment / segments;
    const u1 = (segment + 1) / segments;
    vertex(new THREE.Vector3(0, rings[0].y, 0), 0.5, 0.5);
    vertex(point(0, segment + 1), u1, 0);
    vertex(point(0, segment), u0, 0);
    vertex(new THREE.Vector3(0, rings[2].y, 0), 0.5, 0.5);
    vertex(point(2, segment), u0, 1);
    vertex(point(2, segment + 1), u1, 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.name = "Luminous ward asymmetric faceted stopper geometry";
  geometry.userData.wardStopper = {
    ringCount: rings.length,
    segmentCount: segments,
    profile: "short asymmetric mineral cap",
    closedProfile: true,
  };
  return geometry;
}

export function createSkullSeal(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Three-dimensional skull seal relic";
  const brass = materials.brass.clone();
  const bone = materials.bone.clone();
  const ring = mesh(new THREE.TorusGeometry(0.48, 0.075, 7, 18), brass, "Relic seal ring");
  ring.rotation.x = Math.PI / 2;
  const skull = mesh(new THREE.SphereGeometry(0.27, 10, 7), bone, "Relic carved skull");
  skull.scale.set(0.82, 1, 0.7);
  skull.position.y = 0.1;
  const jaw = mesh(new THREE.BoxGeometry(0.28, 0.18, 0.2), bone, "Relic skull jaw");
  jaw.position.set(0, -0.16, 0.03);
  const voidMaterial = new THREE.MeshBasicMaterial({ color: 0x151617 });
  for (const x of [-0.09, 0.09]) {
    const eye = mesh(new THREE.SphereGeometry(0.055, 6, 4), voidMaterial, "Relic hollow eye");
    eye.position.set(x, 0.13, 0.17);
    root.add(eye);
  }
  const runeMaterial = materials.brass.clone();
  runeMaterial.color.setHex(0x9b957f);
  runeMaterial.emissive.setHex(0x454135);
  runeMaterial.emissiveIntensity = 1.2;
  runeMaterial.roughness = 0.55;
  for (let i = 0; i < 8; i += 1) {
    const rune = mesh(new THREE.BoxGeometry(0.06, 0.13, 0.045), runeMaterial, "Seal rim rune");
    const angle = (i / 8) * Math.PI * 2;
    rune.position.set(Math.cos(angle) * 0.48, Math.sin(angle) * 0.48, 0.05);
    rune.rotation.z = angle;
    root.add(rune);
  }
  root.add(ring, skull, jaw);
  root.userData.pickupKind = "relic";
  return root;
}

export function createResolveFlask(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Three-dimensional resolve flask";
  const bodyPivot = new THREE.Group();
  bodyPivot.name = "Resolve flask body pivot";
  const cagePivot = new THREE.Group();
  cagePivot.name = "Resolve flask cage pivot";
  const stopperPivot = new THREE.Group();
  stopperPivot.name = "Resolve flask stopper pivot";

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x858184,
    transparent: true,
    opacity: 0.34,
    roughness: 0.18,
    metalness: 0.02,
    clearcoat: 0.65,
    clearcoatRoughness: 0.16,
    side: THREE.DoubleSide,
    depthWrite: false,
    flatShading: true,
  });
  const liquidMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b0914,
    emissive: 0x4b050d,
    emissiveIntensity: 0.76,
    roughness: 0.34,
    flatShading: true,
  });
  const iron = materials.iron.clone();
  iron.color.multiplyScalar(0.72);
  iron.roughness = 0.54;
  iron.metalness = Math.max(iron.metalness, 0.56);
  const emblem = materials.brass.clone();
  emblem.color.setHex(0xc7c0a9);
  emblem.emissive.setHex(0x3d3028);
  emblem.emissiveIntensity = 0.28;
  emblem.roughness = 0.42;
  emblem.metalness = 0.34;
  const wood = materials.wood.clone();
  wood.color.multiplyScalar(0.48);
  wood.roughness = Math.max(wood.roughness, 0.82);
  wood.flatShading = true;
  wood.needsUpdate = true;

  // Axis endpoints close the glass shell at the base and below the stopper.
  // The integrated neck avoids an open lathe rim hidden behind a loose cap.
  const bottleProfile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.2, 0.025),
    new THREE.Vector2(0.29, 0.15),
    new THREE.Vector2(0.31, 0.35),
    new THREE.Vector2(0.25, 0.5),
    new THREE.Vector2(0.13, 0.61),
    new THREE.Vector2(0.105, 0.66),
    new THREE.Vector2(0.105, 0.82),
    new THREE.Vector2(0, 0.82),
  ];
  const bottleGeometry = new THREE.LatheGeometry(bottleProfile, 12).toNonIndexed();
  bottleGeometry.computeVertexNormals();
  bottleGeometry.userData = {
    closedProfile: true,
    radialSegments: 12,
    profileEndpointsOnAxis: true,
  };
  const bottle = mesh(bottleGeometry, glass, "Faceted flask glass");
  bottle.userData.componentId = "vessel";
  bodyPivot.add(bottle);

  const liquidProfile = [
    new THREE.Vector2(0, 0.025),
    new THREE.Vector2(0.17, 0.04),
    new THREE.Vector2(0.245, 0.16),
    new THREE.Vector2(0.252, 0.37),
    new THREE.Vector2(0, 0.37),
  ];
  const liquid = mesh(
    new THREE.LatheGeometry(liquidProfile, 14),
    liquidMaterial,
    "Resolve flask liquid",
  );
  liquid.userData.componentId = "liquid-volume";
  liquid.userData.closedProfile = true;
  bodyPivot.add(liquid);

  const lowerCollar = mesh(
    new THREE.CylinderGeometry(0.325, 0.35, 0.085, 12),
    iron,
    "Resolve flask lower iron bottle collar",
  );
  lowerCollar.position.y = 0.045;
  lowerCollar.userData.componentId = "lower-collar";
  const upperCollar = mesh(
    new THREE.CylinderGeometry(0.185, 0.185, 0.12, 12),
    iron,
    "Resolve flask bolted upper iron collar",
  );
  upperCollar.position.y = 0.78;
  upperCollar.userData.componentId = "upper-collar";

  // The source has eight broad, flat restraint straps. Merged overlapping box
  // segments keep the angular low-poly read and use one draw call.
  const cageRibParts: THREE.BufferGeometry[] = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const profile = [
      new THREE.Vector2(0.31, 0.075),
      new THREE.Vector2(0.35, 0.2),
      new THREE.Vector2(0.365, 0.49),
      new THREE.Vector2(0.29, 0.62),
      new THREE.Vector2(0.185, 0.715),
    ];
    for (let segment = 0; segment < profile.length - 1; segment += 1) {
      const start = profile[segment]!;
      const end = profile[segment + 1]!;
      const startWorld = new THREE.Vector3(
        Math.sin(angle) * start.x,
        start.y,
        Math.cos(angle) * start.x,
      );
      const endWorld = new THREE.Vector3(Math.sin(angle) * end.x, end.y, Math.cos(angle) * end.x);
      const direction = endWorld.clone().sub(startWorld);
      const orientation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize(),
      );
      const part = new THREE.BoxGeometry(0.052, direction.length() + 0.025, 0.03);
      part.applyMatrix4(
        new THREE.Matrix4().compose(
          startWorld.clone().add(endWorld).multiplyScalar(0.5),
          orientation,
          new THREE.Vector3(1, 1, 1),
        ),
      );
      cageRibParts.push(part);
    }
  }
  const cageRibs = mesh(
    mergeGeometryParts(cageRibParts, "Resolve radial cage ribs geometry"),
    iron,
    "Resolve flask eight-rib iron cage",
  );
  cageRibs.userData = {
    componentId: "cage",
    instanceCount: 8,
    segmentsPerRib: 4,
    crossSection: "flat rectangular strap",
  };
  const collarBoltParts: THREE.BufferGeometry[] = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2 + Math.PI / 8;
    const radial = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const bolt = new THREE.CylinderGeometry(0.026, 0.026, 0.024, 8);
    bolt.applyMatrix4(
      new THREE.Matrix4().compose(
        radial.clone().multiplyScalar(0.197).setY(0.78),
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial),
        new THREE.Vector3(1, 1, 1),
      ),
    );
    collarBoltParts.push(bolt);
  }
  const collarBolts = mesh(
    mergeGeometryParts(collarBoltParts, "Resolve collar bolts geometry"),
    iron,
    "Resolve flask upper collar bolts",
  );
  collarBolts.userData = { componentId: "collar-bolts", instanceCount: 8 };
  cagePivot.add(lowerCollar, upperCollar, cageRibs, collarBolts);

  const stopperProfile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.145, 0),
    new THREE.Vector2(0.165, 0.018),
    new THREE.Vector2(0.17, 0.075),
    new THREE.Vector2(0.158, 0.135),
    new THREE.Vector2(0.145, 0.155),
    new THREE.Vector2(0, 0.155),
  ];
  const stopper = mesh(
    new THREE.LatheGeometry(stopperProfile, 12),
    wood,
    "Resolve flask broad ringed wood stopper",
  );
  stopper.position.y = 0.84;
  stopper.userData = { componentId: "stopper", ringCount: 3, closedProfile: true };
  stopperPivot.add(stopper);

  const shieldShape = new THREE.Shape();
  shieldShape.moveTo(-0.125, 0.14);
  shieldShape.lineTo(0.125, 0.14);
  shieldShape.lineTo(0.135, 0.03);
  shieldShape.lineTo(0.105, -0.14);
  shieldShape.lineTo(0, -0.23);
  shieldShape.lineTo(-0.105, -0.14);
  shieldShape.lineTo(-0.135, 0.03);
  shieldShape.closePath();
  const crossGeometry = new THREE.ExtrudeGeometry(shieldShape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.008,
    bevelThickness: 0.008,
  });
  crossGeometry.translate(0, 0, -0.0175);
  const frontCross = mesh(crossGeometry, emblem, "Raised resolve quartered shield");
  frontCross.position.set(0, 0.36, 0.342);
  const shieldVertical = mesh(
    new THREE.BoxGeometry(0.022, 0.31, 0.024),
    iron,
    "Resolve shield vertical quarter line",
  );
  shieldVertical.position.set(0, 0.375, 0.383);
  const shieldHorizontal = mesh(
    new THREE.BoxGeometry(0.2, 0.022, 0.025),
    iron,
    "Resolve shield horizontal quarter line",
  );
  shieldHorizontal.position.set(0, 0.39, 0.384);
  const shieldRivetParts: THREE.BufferGeometry[] = [];
  for (const [x, y] of [
    [-0.095, 0.465],
    [0.095, 0.465],
    [-0.075, 0.285],
    [0.075, 0.285],
  ] as const) {
    shieldRivetParts.push(
      transformedGeometry(new THREE.OctahedronGeometry(0.018, 0), [x, y, 0.397]),
    );
  }
  const shieldRivets = mesh(
    mergeGeometryParts(shieldRivetParts, "Resolve shield rivets geometry"),
    iron,
    "Resolve shield four iron rivets",
  );
  shieldRivets.userData = { componentId: "shield", instanceCount: 4 };
  const shieldAssembly = new THREE.Group();
  shieldAssembly.name = "Raised resolve cross";
  shieldAssembly.userData = {
    componentId: "shield",
    detailRole: "quartered resolve shield",
  };
  shieldAssembly.add(frontCross, shieldVertical, shieldHorizontal, shieldRivets);
  cagePivot.add(shieldAssembly);

  const loopShape = new THREE.Shape();
  loopShape.moveTo(-0.075, -0.075);
  loopShape.lineTo(0.075, -0.075);
  loopShape.lineTo(0.075, 0.075);
  loopShape.lineTo(-0.075, 0.075);
  loopShape.closePath();
  const loopHole = new THREE.Path();
  loopHole.moveTo(-0.04, -0.04);
  loopHole.lineTo(-0.04, 0.04);
  loopHole.lineTo(0.04, 0.04);
  loopHole.lineTo(0.04, -0.04);
  loopHole.closePath();
  loopShape.holes.push(loopHole);
  for (const side of [-1, 1]) {
    const loop = mesh(
      new THREE.ExtrudeGeometry(loopShape, {
        depth: 0.04,
        bevelEnabled: true,
        bevelSegments: 1,
        bevelSize: 0.008,
        bevelThickness: 0.008,
      }),
      iron,
      `${side < 0 ? "Left" : "Right"} resolve flask open side loop`,
    );
    loop.position.set(side * 0.39, 0.38, -0.02);
    loop.userData = {
      componentId: "side-loops",
      opening: "square through-hole",
      side: side < 0 ? "left" : "right",
    };
    cagePivot.add(loop);
  }

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0x9b1628,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const halo = mesh(
    new THREE.TorusGeometry(0.34, 0.012, 5, 20),
    haloMaterial,
    "Resolve pickup halo",
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.035;
  halo.castShadow = false;
  halo.userData.vfxOnly = true;

  const pickupAnchor = new THREE.Object3D();
  pickupAnchor.name = "Resolve pickup anchor";
  pickupAnchor.position.y = 0.38;
  const glowAnchor = new THREE.Object3D();
  glowAnchor.name = "Resolve glow anchor";
  glowAnchor.position.set(0, 0.34, 0.22);

  root.add(bodyPivot, cagePivot, stopperPivot, halo, pickupAnchor, glowAnchor);
  root.userData.pickupKind = "resolve";
  root.userData.reference =
    "assets-source/imagegen/model-references-v2/magic/resolve-flask-three-view.png";
  root.userData.detailInventory = [
    "faceted glass bulb with dark red fill line",
    "eight-rib radial iron cage",
    "bolted upper collar and broad wood stopper",
    "front quartered brass shield",
    "two open square side loops",
  ];
  root.userData.sculptRuntime = {
    rootMotionNode: root,
    pivots: { body: bodyPivot, cage: cagePivot, stopper: stopperPivot, shield: shieldAssembly },
    sockets: { pickup: pickupAnchor, glow: glowAnchor },
    colliders: [{ type: "sphere", radius: 0.47, offset: [0, 0.48, 0], isTrigger: true }],
    destructionGroups: {
      vessel: bodyPivot,
      restraint: cagePivot,
      stopper: stopperPivot,
      heraldry: shieldAssembly,
    },
  };
  return root;
}

/**
 * A compact time-freeze relic: an iron hourglass frame around an emissive ice
 * core, with clock hands and orbit rings that read at pickup distance.
 */
export function createTimeFreezeRelic(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Three-dimensional time freeze relic";

  const iron = materials.iron.clone();
  iron.name = "Time freeze readable iron PBR material";
  iron.color.multiplyScalar(0.55);
  iron.color.lerp(new THREE.Color(0x20282b), 0.35);
  iron.emissive.setHex(0x020405);
  iron.emissiveMap = null;
  iron.emissiveIntensity = 0.008;
  iron.roughness = THREE.MathUtils.clamp(iron.roughness, 0.68, 0.78);
  iron.metalness = Math.max(iron.metalness, 0.7);
  iron.envMapIntensity = THREE.MathUtils.clamp(iron.envMapIntensity, 0.68, 0.82);
  iron.userData.finish = "dominant dark rough iron with restrained cool edges";
  iron.userData.biomeSafe = true;
  const brass = materials.brass.clone();
  brass.name = "Time freeze aged brass PBR material";
  brass.color.lerp(new THREE.Color(0x9c7841), 0.5);
  brass.emissive.setHex(0x120c04);
  brass.emissiveMap = null;
  brass.emissiveIntensity = 0.018;
  brass.roughness = THREE.MathUtils.clamp(brass.roughness, 0.54, 0.64);
  brass.metalness = Math.max(brass.metalness, 0.64);
  brass.envMapIntensity = THREE.MathUtils.clamp(brass.envMapIntensity, 0.78, 0.94);
  brass.userData.finish = "small aged brass accent hardware";
  brass.userData.biomeSafe = true;
  const ice = materials.ice.clone();
  ice.color.setHex(0x78dce6);
  ice.emissive.setHex(0x1b9eac);
  ice.emissiveIntensity = 1.08;
  ice.roughness = 0.3;
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x65e9f3,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const frame = new THREE.Group();
  frame.name = "Time freeze hourglass frame";
  const topCap = mesh(
    new THREE.CylinderGeometry(0.34, 0.37, 0.12, 8),
    iron,
    "Time freeze top cap",
  );
  topCap.position.y = 1.38;
  const bottomCap = mesh(
    new THREE.CylinderGeometry(0.37, 0.34, 0.12, 8),
    iron,
    "Time freeze bottom cap",
  );
  bottomCap.position.y = 0.06;
  const topStep = mesh(
    new THREE.CylinderGeometry(0.28, 0.33, 0.09, 8),
    iron,
    "Time freeze stepped top lid",
  );
  topStep.position.y = 1.485;
  const topInset = mesh(
    new THREE.CylinderGeometry(0.16, 0.19, 0.028, 8),
    iron,
    "Time freeze recessed top socket inset",
  );
  topInset.position.y = 1.545;
  const topBezel = mesh(
    new THREE.TorusGeometry(0.19, 0.026, 5, 12),
    brass,
    "Time freeze raised brass top bezel",
  );
  topBezel.rotation.x = Math.PI / 2;
  topBezel.position.y = 1.553;
  const topRing = mesh(new THREE.TorusGeometry(0.3, 0.045, 5, 8), iron, "Time freeze top ring");
  topRing.rotation.x = Math.PI / 2;
  topRing.position.y = 1.3;
  const bottomRing = topRing.clone();
  bottomRing.name = "Time freeze bottom ring";
  bottomRing.position.y = 0.15;
  const leftRail = mesh(new THREE.BoxGeometry(0.095, 1.15, 0.085), iron, "Time freeze left rail");
  leftRail.position.set(-0.28, 0.73, 0.2);
  const rightRail = leftRail.clone();
  rightRail.name = "Time freeze right rail";
  rightRail.position.x = 0.28;
  const rearLeftRail = leftRail.clone();
  rearLeftRail.name = "Time freeze rear left rail";
  rearLeftRail.position.z = -0.2;
  const rearRightRail = rightRail.clone();
  rearRightRail.name = "Time freeze rear right rail";
  rearRightRail.position.z = -0.2;
  const frontRuneBar = new THREE.Group();
  frontRuneBar.name = "Time freeze front rune bar";
  const rearRuneBar = new THREE.Group();
  rearRuneBar.name = "Time freeze rear rune bar";
  for (const [label, y] of [
    ["lower", 0.37],
    ["upper", 1.12],
  ] as const) {
    const frontPlate = mesh(
      new THREE.BoxGeometry(0.115, 0.37, 0.055),
      iron,
      `Time freeze front ${label} inlaid rune plate`,
    );
    frontPlate.position.set(0, y, 0.285);
    frontRuneBar.add(frontPlate);
    const rearPlate = frontPlate.clone();
    rearPlate.name = `Time freeze rear ${label} iron plate`;
    rearPlate.position.z = -0.285;
    rearRuneBar.add(rearPlate);
  }
  frontRuneBar.userData.coreSightline = { openGap: [0.555, 0.935], clear: true };
  rearRuneBar.userData.coreSightline = { openGap: [0.555, 0.935], clear: true };
  const capBoltParts: THREE.BufferGeometry[] = [];
  for (const y of [0.06, 1.38]) {
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
      capBoltParts.push(
        transformedGeometry(
          new THREE.OctahedronGeometry(0.034, 0),
          [Math.sin(angle) * 0.345, y, Math.cos(angle) * 0.345],
          [0, angle, 0],
        ),
      );
    }
  }
  const capBolts = mesh(
    mergeGeometryParts(capBoltParts, "Time freeze cap bolts geometry"),
    brass,
    "Time freeze eight cap bolts",
  );
  const postSocketParts: THREE.BufferGeometry[] = [];
  for (const y of [0.18, 1.29]) {
    for (const x of [-0.28, 0.28]) {
      for (const z of [-0.2, 0.2]) {
        postSocketParts.push(
          transformedGeometry(new THREE.BoxGeometry(0.14, 0.075, 0.13), [x, y, z]),
        );
      }
    }
  }
  const postSockets = mesh(
    mergeGeometryParts(postSocketParts, "Time freeze post sockets geometry"),
    iron,
    "Time freeze eight reinforced post socket blocks",
  );
  postSockets.userData.instanceCount = 8;
  postSockets.userData.connection = "four rails joined to both cap assemblies";
  frame.add(
    topCap,
    bottomCap,
    topStep,
    topInset,
    topBezel,
    topRing,
    bottomRing,
    leftRail,
    rightRail,
    rearLeftRail,
    rearRightRail,
    frontRuneBar,
    rearRuneBar,
    capBolts,
    postSockets,
  );

  const core = mesh(new THREE.OctahedronGeometry(0.33, 0), ice, "Time freeze frozen core");
  core.position.y = 0.75;
  core.rotation.set(0, Math.PI / 4, 0);
  core.scale.y = 1.12;
  const coreBand = mesh(new THREE.TorusGeometry(0.34, 0.045, 5, 8), iron, "Time freeze core band");
  coreBand.rotation.x = Math.PI / 2;
  coreBand.position.y = 0.75;

  const runeMaterial = materials.ice.clone();
  runeMaterial.name = "Time freeze flush cyan rune inlay material";
  runeMaterial.color.setHex(0xa9f4f7);
  runeMaterial.emissive.setHex(0x2bbbc5);
  runeMaterial.emissiveIntensity = 0.64;
  runeMaterial.roughness = 0.42;
  const runeStrokeParts: THREE.BufferGeometry[] = [];
  for (const y of [1.12, 0.37]) {
    runeStrokeParts.push(
      transformedGeometry(new THREE.BoxGeometry(0.014, 0.09, 0.006), [0, y, 0.316], [0, 0, -0.68]),
      transformedGeometry(new THREE.BoxGeometry(0.014, 0.09, 0.006), [0, y, 0.316], [0, 0, 0.68]),
      transformedGeometry(new THREE.BoxGeometry(0.058, 0.012, 0.006), [0, y, 0.316]),
      transformedGeometry(new THREE.BoxGeometry(0.012, 0.038, 0.006), [0, y, 0.316]),
    );
  }
  const runeStrokes = mesh(
    mergeGeometryParts(runeStrokeParts, "Time freeze flush rune inlays geometry"),
    runeMaterial,
    "Time freeze eight flush rune strokes",
  );
  runeStrokes.userData.inlay = {
    strokeCount: 8,
    plateSurfaceZ: 0.3125,
    centerZ: 0.316,
    maximumRelief: 0.0065,
    flush: true,
  };

  const orbit = mesh(new THREE.TorusGeometry(0.37, 0.03, 5, 16), iron, "Time freeze orbit halo");
  orbit.rotation.x = Math.PI / 2;
  orbit.position.y = 0.75;
  const verticalGlowMaterial = glowMaterial.clone();
  verticalGlowMaterial.opacity = 0.035;
  const verticalHalo = mesh(
    new THREE.TorusGeometry(0.32, 0.009, 5, 16),
    verticalGlowMaterial,
    "Time freeze vertical halo",
  );
  verticalHalo.rotation.x = Math.PI / 2;
  verticalHalo.rotation.z = Math.PI / 2;
  verticalHalo.position.y = 0.75;
  const pickupLight = new THREE.PointLight(0x72e7ef, TIME_FREEZE_PICKUP_LIGHT_INTENSITY, 4.4, 2.1);
  pickupLight.name = "Time freeze pickup light";
  pickupLight.position.y = 0.75;

  const pickupAnchor = new THREE.Object3D();
  pickupAnchor.name = "Time freeze pickup anchor";
  pickupAnchor.position.y = 0.75;
  const glowAnchor = new THREE.Object3D();
  glowAnchor.name = "Time freeze glow anchor";
  glowAnchor.position.set(0, 0.75, 0.3);

  root.add(
    frame,
    core,
    coreBand,
    runeStrokes,
    orbit,
    verticalHalo,
    pickupLight,
    pickupAnchor,
    glowAnchor,
  );
  root.userData.pickupKind = "time-freeze";
  root.userData.reference =
    "assets-source/imagegen/model-references-v2/magic/time-freeze-relic-three-view.png";
  root.userData.detailInventory = [
    "stepped bolted octagonal caps",
    "four dark iron corner posts with split front and rear rune bars",
    "eight dark post sockets with brass bolts and recessed top bezel",
    "mid-height support ring",
    "two thin flush cyan runes and suspended two-pyramid ice core",
  ];
  root.userData.sculptRuntime = {
    rootMotionNode: root,
    pivots: { frame, core },
    sockets: { pickup: pickupAnchor, glow: glowAnchor },
    colliders: [{ type: "sphere", radius: 0.58, offset: [0, 0.78, 0], isTrigger: true }],
    destructionGroups: { frame, core },
  };
  return root;
}

/**
 * A faceted ward stone with a rough pedestal, iron cage and a lifted crystal
 * core. The stone uses the biome-treated material palette supplied by the
 * dungeon, so its accent shifts with the room mood while its matte base keeps
 * the pickup from looking like a second glossy magic stone.
 */
export function createLuminousWardStone(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Three-dimensional luminous ward stone";

  const base = materials.darkStone.clone();
  base.color.multiplyScalar(0.78);
  base.roughness = Math.max(base.roughness, 0.9);
  const iron = materials.iron.clone();
  iron.color.multiplyScalar(0.72);
  iron.roughness = 0.82;
  iron.metalness = Math.min(0.62, Math.max(iron.metalness, 0.34));
  const compactWardMaterial =
    materials.crystal.normalMap === null &&
    materials.crystal.roughnessMap === null &&
    materials.crystal.bumpMap === null;
  const crystal = createLuminousWardGoldMaterial({
    compact: compactWardMaterial,
    biomeTint: materials.ice.color,
  });
  crystal.color.setHex(0xd1c18f);
  crystal.emissive.setHex(0x4d3b13);
  crystal.emissiveIntensity = 0.44;
  crystal.roughness = crystal.roughnessMap ? 0.52 : 0.46;
  crystal.metalness = 0;
  crystal.envMapIntensity = 0.72;
  crystal.transmission = 0;
  crystal.thickness = 0;
  crystal.ior = 1.43;
  crystal.normalScale.set(0.28, 0.28);
  const core = materials.ice.clone();
  core.color.setHex(0xf0dc90);
  core.emissive.setHex(0xa77c22);
  core.emissiveIntensity = 1.05;
  core.roughness = 0.32;
  core.metalness = Math.min(core.metalness, 0.08);
  core.envMapIntensity = 0.72;
  const glow = new THREE.MeshBasicMaterial({
    color: 0xf2d87d,
    transparent: true,
    opacity: LUMINOUS_WARD_PICKUP_GLOW_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const pedestal = mesh(
    new THREE.CylinderGeometry(0.63, 0.69, 0.28, 8),
    base,
    "Luminous ward stone pedestal",
  );
  pedestal.position.y = 0.14;
  const pedestalStep = mesh(
    new THREE.CylinderGeometry(0.56, 0.62, 0.1, 8),
    base,
    "Luminous ward raised octagonal pedestal step",
  );
  pedestalStep.position.y = 0.33;
  const footRing = mesh(
    new THREE.TorusGeometry(0.53, 0.035, 5, 16),
    iron,
    "Luminous ward iron foot ring",
  );
  footRing.rotation.x = Math.PI / 2;
  footRing.position.y = 0.4;
  footRing.castShadow = false;
  const crystalCore = mesh(
    createFacetedWardCoreGeometry(),
    crystal,
    "Luminous ward faceted crystal",
  );
  crystalCore.position.y = 0.4;
  crystalCore.rotation.y = Math.PI / 16;
  crystalCore.userData.surfaceTreatment =
    "dedicated warm-gold albedo with restrained transmission, low normal strength and faceted reflection";
  const crystalShard = mesh(
    createFacetedWardStopperGeometry(),
    crystal,
    "Luminous ward faceted stopper",
  );
  crystalShard.position.set(0.005, 1.19, -0.005);
  crystalShard.rotation.y = 0.16;
  crystalShard.castShadow = false;

  const neckCollarParts: THREE.BufferGeometry[] = [
    transformedGeometry(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 12), [0, 1.075, 0]),
  ];
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    neckCollarParts.push(
      transformedGeometry(new THREE.SphereGeometry(0.018, 5, 3), [
        Math.sin(angle) * 0.176,
        1.075,
        Math.cos(angle) * 0.176,
      ]),
    );
  }
  const neckCollar = mesh(
    mergeGeometryParts(neckCollarParts, "Luminous ward bolted neck collar geometry"),
    iron,
    "Luminous ward bolted neck collar",
  );
  neckCollar.userData.boltCount = 6;
  neckCollar.userData.attachment = {
    coreOverlap: 0.04,
    stopperOverlap: 0.01,
    wrapsNeck: true,
  };
  const veinParts: THREE.BufferGeometry[] = [];
  // Keep one inlay near the canonical front so the ward reads as enchanted in
  // gameplay, then offset the other two to avoid a machine-perfect radial cage.
  const veinAngles = [0.04, 2.24, 4.45] as const;
  for (const [veinIndex, angle] of veinAngles.entries()) {
    const point = (y: number, angleOffset = 0): THREE.Vector3 => {
      const pointAngle = angle + angleOffset;
      const radius = wardCoreSurfaceRadius(pointAngle, y) + 0.002;
      return new THREE.Vector3(Math.sin(pointAngle) * radius, y, Math.cos(pointAngle) * radius);
    };
    if (veinIndex === 0) {
      const joint = point(0.78);
      veinParts.push(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3([point(0.55), point(0.67), joint]),
          4,
          0.014,
          4,
          false,
        ),
      );
      for (const branchOffset of [-0.34, 0.34]) {
        veinParts.push(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3([
              joint,
              point(0.87, branchOffset * 0.48),
              point(0.97, branchOffset),
            ]),
            4,
            0.014,
            4,
            false,
          ),
        );
      }
      continue;
    }
    veinParts.push(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([point(0.55), point(0.67), point(0.82), point(0.97)]),
        5,
        0.014,
        4,
        false,
      ),
    );
  }
  const goldVeins = mesh(
    mergeGeometryParts(veinParts, "Luminous ward irregular gold facet veins geometry"),
    core,
    "Luminous ward three irregular gold facet inlays",
  );
  goldVeins.userData.instanceCount = veinAngles.length;
  goldVeins.userData.layout = "asymmetric";
  goldVeins.userData.frontAnchorAngle = veinAngles[0];
  goldVeins.userData.frontBranchCount = 2;
  goldVeins.userData.surfaceAttachment = {
    target: "Luminous ward faceted crystal",
    centerOffset: 0.002,
    tubeRadius: 0.014,
    embeddedDepth: 0.012,
  };
  goldVeins.castShadow = false;

  const cageRing = mesh(
    new THREE.TorusGeometry(0.49, 0.035, 5, 18),
    iron,
    "Luminous ward upper cage ring",
  );
  cageRing.rotation.x = Math.PI / 2;
  cageRing.position.y = 0.53;
  const cageRingVertical = cageRing.clone();
  cageRingVertical.name = "Luminous ward lower guard ring";
  cageRingVertical.rotation.x = Math.PI / 2;
  cageRingVertical.position.y = 0.43;
  const guardPostParts: THREE.BufferGeometry[] = [];
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    guardPostParts.push(
      transformedGeometry(
        new THREE.BoxGeometry(0.08, 0.27, 0.09),
        [Math.sin(angle) * 0.5, 0.45, Math.cos(angle) * 0.5],
        [0, angle, 0],
      ),
    );
  }
  const guardPosts = mesh(
    mergeGeometryParts(guardPostParts, "Luminous ward guard posts geometry"),
    iron,
    "Luminous ward six guard posts",
  );
  const halo = mesh(new THREE.TorusGeometry(0.59, 0.012, 5, 22), glow, "Luminous ward pickup halo");
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.56;
  halo.castShadow = false;

  const runePlaqueParts: THREE.BufferGeometry[] = [];
  const runeStrokeParts: THREE.BufferGeometry[] = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    runePlaqueParts.push(
      transformedGeometry(
        new THREE.BoxGeometry(0.13, 0.19, 0.035),
        [Math.sin(angle) * 0.645, 0.15, Math.cos(angle) * 0.645],
        [0, angle, 0],
      ),
    );
    runeStrokeParts.push(
      transformedGeometry(
        new THREE.BoxGeometry(0.025, 0.11, 0.012),
        [Math.sin(angle) * 0.665, 0.15, Math.cos(angle) * 0.665],
        [0, angle, index % 2 === 0 ? 0.4 : -0.4],
      ),
    );
  }
  const runePlaques = mesh(
    mergeGeometryParts(runePlaqueParts, "Luminous ward rune plaques geometry"),
    materials.brass,
    "Luminous ward eight rune plaques",
  );
  runePlaques.userData.instanceCount = 8;
  runePlaques.castShadow = false;
  const runeStrokes = mesh(
    mergeGeometryParts(runeStrokeParts, "Luminous ward rune strokes geometry"),
    core,
    "Luminous ward eight rune strokes",
  );
  runeStrokes.userData.instanceCount = 8;
  runeStrokes.castShadow = false;

  const pickupLight = new THREE.PointLight(0xe6c66f, LUMINOUS_WARD_PICKUP_LIGHT_INTENSITY, 6.4, 2);
  pickupLight.name = "Luminous ward pickup light";
  pickupLight.position.y = 0.78;
  const pickupAnchor = new THREE.Object3D();
  pickupAnchor.name = "Luminous ward pickup anchor";
  pickupAnchor.position.y = 0.7;
  const glowAnchor = new THREE.Object3D();
  glowAnchor.name = "Luminous ward glow anchor";
  glowAnchor.position.set(0, 0.75, 0.28);

  root.add(
    pedestal,
    pedestalStep,
    footRing,
    crystalCore,
    crystalShard,
    neckCollar,
    goldVeins,
    cageRing,
    cageRingVertical,
    guardPosts,
    runePlaques,
    runeStrokes,
    halo,
    pickupLight,
    pickupAnchor,
    glowAnchor,
  );
  root.userData.pickupKind = "luminous-ward";
  root.userData.reference =
    "assets-source/imagegen/model-references-v2/magic/luminous-ward-three-view.png";
  root.userData.detailInventory = [
    "warm gold asymmetric mineral core and faceted stopper",
    "three surface-embedded irregular gold facet inlays",
    "bolted iron collar overlapping core and stopper",
    "broad octagonal plinth with eight rune plaques",
    "six-post outer guard ring",
  ];
  root.userData.sculptRuntime = {
    rootMotionNode: root,
    pivots: { pedestal, vessel: crystalCore, collar: neckCollar, guard: cageRing },
    sockets: { pickup: pickupAnchor, glow: glowAnchor },
    colliders: [{ type: "sphere", radius: 0.69, offset: [0, 0.64, 0], isTrigger: true }],
    destructionGroups: {
      base: pedestal,
      vessel: crystalCore,
      collar: neckCollar,
      guard: cageRing,
    },
  };
  return root;
}

/**
 * A compact pulse relic: a suspended red core inside three crossing iron rings.
 * The silhouette stays readable at chest distance and the sockets expose the
 * same runtime contract as the other power pickups.
 */
export function createAnnihilationPulseRelic(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Three-dimensional annihilation pulse relic";

  const base = materials.darkStone.clone();
  base.color.multiplyScalar(0.72);
  base.roughness = Math.max(base.roughness, 0.9);
  const iron = materials.iron.clone();
  iron.color.setHex(0x3a2632);
  iron.roughness = 0.58;
  iron.metalness = Math.max(iron.metalness, 0.64);
  const coreMaterial = materials.crystal.clone();
  coreMaterial.color.setHex(0xd93664);
  coreMaterial.emissive.setHex(0x7e102d);
  coreMaterial.emissiveIntensity = 1.35;
  coreMaterial.roughness = 0.32;
  const hotCore = materials.ice.clone();
  hotCore.color.setHex(0xffb0bd);
  hotCore.emissive.setHex(0xe7436c);
  hotCore.emissiveIntensity = 1.65;
  hotCore.roughness = 0.2;
  const glow = new THREE.MeshBasicMaterial({
    color: 0xff567f,
    transparent: true,
    opacity: ANNIHILATION_PULSE_PICKUP_GLOW_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const pedestal = mesh(
    new THREE.CylinderGeometry(0.42, 0.54, 0.16, 8),
    base,
    "Annihilation pulse relic pedestal",
  );
  pedestal.position.y = 0.08;
  const footRing = mesh(
    new THREE.TorusGeometry(0.43, 0.038, 6, 16),
    iron,
    "Annihilation pulse relic foot ring",
  );
  footRing.rotation.x = Math.PI / 2;
  footRing.position.y = 0.18;
  const core = mesh(
    new THREE.IcosahedronGeometry(0.29, 1),
    coreMaterial,
    "Annihilation pulse red core",
  );
  core.position.y = 0.58;
  core.rotation.set(0.2, 0.42, -0.12);
  const innerCore = mesh(
    new THREE.OctahedronGeometry(0.13, 0),
    hotCore,
    "Annihilation pulse hot inner core",
  );
  innerCore.position.set(0.01, 0.59, 0.2);

  const ringA = mesh(
    new THREE.TorusGeometry(0.39, 0.025, 6, 24),
    iron,
    "Annihilation pulse iron orbit ring A",
  );
  ringA.rotation.x = Math.PI / 2;
  ringA.position.y = 0.58;
  const ringB = ringA.clone();
  ringB.name = "Annihilation pulse iron orbit ring B";
  ringB.rotation.set(Math.PI / 2, Math.PI / 3, 0.18);
  const ringC = ringA.clone();
  ringC.name = "Annihilation pulse iron orbit ring C";
  ringC.rotation.set(Math.PI / 2, -Math.PI / 3, -0.16);
  const halo = mesh(
    new THREE.TorusGeometry(0.49, 0.012, 5, 28),
    glow,
    "Annihilation pulse pickup halo",
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.58;
  const pulseLight = new THREE.PointLight(
    0xff5d86,
    ANNIHILATION_PULSE_PICKUP_LIGHT_INTENSITY,
    7.2,
    2,
  );
  pulseLight.name = "Annihilation pulse pickup light";
  pulseLight.position.y = 0.62;

  const pickupAnchor = new THREE.Object3D();
  pickupAnchor.name = "Annihilation pulse pickup anchor";
  pickupAnchor.position.y = 0.58;
  const glowAnchor = new THREE.Object3D();
  glowAnchor.name = "Annihilation pulse glow anchor";
  glowAnchor.position.set(0, 0.58, 0.22);

  root.add(
    pedestal,
    footRing,
    core,
    innerCore,
    ringA,
    ringB,
    ringC,
    halo,
    pulseLight,
    pickupAnchor,
    glowAnchor,
  );
  root.userData.pickupKind = "annihilation-pulse";
  root.userData.sculptRuntime = {
    rootMotionNode: root,
    sockets: { pickup: pickupAnchor, glow: glowAnchor },
    colliders: [{ type: "sphere", radius: 0.46, offset: [0, 0.58, 0], isTrigger: true }],
  };
  return root;
}

/** Folded parchment map: its open silhouette remains legible from the chest. */
export function createDungeonMapPickup(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Folded dungeon map pickup";
  const parchment = materials.bone.clone();
  parchment.color.setHex(0xc8b783);
  parchment.roughness = 0.92;
  parchment.metalness = 0;
  parchment.side = THREE.DoubleSide;
  const ink = new THREE.MeshBasicMaterial({
    color: 0x30291f,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  const wood = materials.wood.clone();
  wood.color.setHex(0x4a2d1d);
  wood.roughness = 0.86;

  const sheet = mesh(
    new THREE.PlaneGeometry(0.9, 0.62, 3, 2),
    parchment,
    "Dungeon map parchment",
  );
  sheet.rotation.x = -Math.PI / 2;
  sheet.rotation.z = -0.12;
  sheet.position.y = 0.52;

  const routePoints = [
    new THREE.Vector3(-0.27, 0.532, -0.13),
    new THREE.Vector3(-0.08, 0.532, -0.02),
    new THREE.Vector3(0.04, 0.532, -0.12),
    new THREE.Vector3(0.26, 0.532, 0.12),
  ];
  const route = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(routePoints),
    new THREE.LineBasicMaterial({ color: 0x5c1f18, toneMapped: true }),
  );
  route.name = "Dungeon map marked route";
  const routeMark = mesh(
    new THREE.RingGeometry(0.055, 0.078, 8),
    ink,
    "Dungeon map destination mark",
  );
  routeMark.rotation.x = -Math.PI / 2;
  routeMark.position.set(0.27, 0.534, 0.12);
  for (const z of [-0.31, 0.31]) {
    const rod = mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1.02, 8),
      wood,
      "Dungeon map scroll rod",
    );
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, 0.52, z);
    root.add(rod);
  }
  root.add(sheet, route, routeMark);
  root.userData.pickupKind = "map";
  return root;
}

/**
 * Clarity phial: pale glass with silver-blue mist that lifts dungeon fog for a
 * short window. Distinct from the permanent map scroll.
 */
export function createClarityPhial(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Clarity phial pickup";
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xc8e4f2,
    transparent: true,
    opacity: 0.38,
    roughness: 0.12,
    metalness: 0.04,
    clearcoat: 0.82,
    clearcoatRoughness: 0.1,
    side: THREE.DoubleSide,
  });
  const mist = new THREE.MeshStandardMaterial({
    color: 0xa8d8ef,
    emissive: 0x3a6f8c,
    emissiveIntensity: 0.55,
    roughness: 0.28,
    transparent: true,
    opacity: 0.82,
  });
  const silver = materials.brass.clone();
  silver.color.setHex(0xb8c4d0);
  silver.metalness = 0.78;
  silver.roughness = 0.32;
  const cork = materials.wood.clone();
  cork.color.setHex(0x5a4030);

  const bottle = mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 0.52, 10),
    glass,
    "Clarity phial body",
  );
  bottle.position.y = 0.42;
  const liquid = mesh(
    new THREE.CylinderGeometry(0.12, 0.155, 0.34, 10),
    mist,
    "Clarity phial mist charge",
  );
  liquid.position.y = 0.36;
  const neck = mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 0.16, 8),
    glass,
    "Clarity phial neck",
  );
  neck.position.y = 0.74;
  const stopper = mesh(
    new THREE.CylinderGeometry(0.09, 0.08, 0.11, 8),
    cork,
    "Clarity phial stopper",
  );
  stopper.position.y = 0.86;
  const rim = mesh(new THREE.TorusGeometry(0.11, 0.018, 6, 12), silver, "Clarity phial silver rim");
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.68;
  // Small lens disc so the prop reads as "sight" not just another tonic bottle.
  const lens = mesh(
    new THREE.CircleGeometry(0.11, 12),
    new THREE.MeshStandardMaterial({
      color: 0xd8f0ff,
      emissive: 0x6aa8c8,
      emissiveIntensity: 0.4,
      roughness: 0.18,
      metalness: 0.15,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    }),
    "Clarity phial sight lens",
  );
  lens.position.set(0.18, 0.48, 0);
  lens.rotation.y = Math.PI / 2;
  root.add(bottle, liquid, neck, stopper, rim, lens);
  root.userData.pickupKind = "clarity";
  return root;
}

/** Green wayfinder draught: restores sprint while granting a short speed window. */
export function createMobilityDraught(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Wayfinder mobility draught pickup";
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x9fb9a5,
    transparent: true,
    opacity: 0.42,
    roughness: 0.16,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
    side: THREE.DoubleSide,
  });
  const tonic = new THREE.MeshStandardMaterial({
    color: 0x4f9d4b,
    emissive: 0x1b4c26,
    emissiveIntensity: 0.72,
    roughness: 0.32,
  });
  const brass = materials.brass.clone();
  brass.color.setHex(0xa79b64);
  const leather = materials.wood.clone();
  leather.color.setHex(0x3b2318);

  const bottle = mesh(
    new THREE.CylinderGeometry(0.2, 0.27, 0.58, 10),
    glass,
    "Mobility draught faceted bottle",
  );
  bottle.position.y = 0.46;
  const liquid = mesh(
    new THREE.CylinderGeometry(0.17, 0.23, 0.39, 10),
    tonic,
    "Mobility draught green tonic",
  );
  liquid.position.y = 0.39;
  const neck = mesh(
    new THREE.CylinderGeometry(0.105, 0.13, 0.2, 9),
    glass,
    "Mobility draught neck",
  );
  neck.position.y = 0.82;
  const stopper = mesh(
    new THREE.CylinderGeometry(0.12, 0.105, 0.13, 8),
    leather,
    "Mobility draught stopper",
  );
  stopper.position.y = 0.94;
  for (const direction of [-1, 1]) {
    const wing = mesh(
      transformedGeometry(
        new THREE.BoxGeometry(0.31, 0.055, 0.13),
        [direction * 0.25, 0.69, 0],
        [0, 0, direction * -0.28],
        [1, 1, 1],
      ),
      brass,
      "Mobility draught wing",
    );
    root.add(wing);
  }
  root.add(bottle, liquid, neck, stopper);
  root.userData.pickupKind = "mobility";
  return root;
}

export type CursePickupKind =
  | "swarm-curse"
  | "slow-curse"
  | "frenzy-curse"
  | "gloom-curse"
  | "mirror-curse"
  | "spin-curse";

const CURSE_PICKUP_COLORS: Readonly<
  Record<CursePickupKind, { glass: number; core: number; emissive: number; label: string }>
> = {
  "swarm-curse": {
    glass: 0x4a2a2a,
    core: 0x8b1e1e,
    emissive: 0x4a0c0c,
    label: "Swarm curse vessel",
  },
  "slow-curse": {
    glass: 0x3a3a48,
    core: 0x6a6a8a,
    emissive: 0x222238,
    label: "Slow curse vessel",
  },
  "frenzy-curse": {
    glass: 0x4a2e18,
    core: 0xc45a1a,
    emissive: 0x5a2008,
    label: "Frenzy curse vessel",
  },
  "gloom-curse": {
    glass: 0x1a1a22,
    core: 0x2a2a38,
    emissive: 0x0c0c14,
    label: "Gloom curse vessel",
  },
  "mirror-curse": {
    glass: 0x2a3a48,
    core: 0x7ec8e8,
    emissive: 0x1a4060,
    label: "Mirror curse vessel",
  },
  "spin-curse": {
    glass: 0x3a2848,
    core: 0xc07ae0,
    emissive: 0x401860,
    label: "Spin curse vessel",
  },
};

export const CULL_BRAND_PICKUP_LIGHT_INTENSITY = 1.05;
export const CULL_BRAND_PICKUP_GLOW_OPACITY = 0.14;

/** Brand iron brand: dark pedestal, hot iron plate, ember runes. */
export function createCullBrandRelic(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Three-dimensional cull brand relic";

  const base = materials.darkStone.clone();
  base.color.multiplyScalar(0.78);
  base.roughness = Math.max(base.roughness, 0.88);
  const iron = materials.iron.clone();
  iron.color.setHex(0x4a2a18);
  iron.roughness = 0.48;
  iron.metalness = Math.max(iron.metalness, 0.7);
  const brand = materials.crystal.clone();
  brand.color.setHex(0xff8a3a);
  brand.emissive.setHex(0xa03810);
  brand.emissiveIntensity = 1.25;
  brand.roughness = 0.35;
  const glow = new THREE.MeshBasicMaterial({
    color: 0xff7a3a,
    transparent: true,
    opacity: CULL_BRAND_PICKUP_GLOW_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const pedestal = mesh(
    new THREE.CylinderGeometry(0.36, 0.46, 0.14, 8),
    base,
    "Cull brand pedestal",
  );
  pedestal.position.y = 0.07;
  const plate = mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), iron, "Cull brand iron plate");
  plate.position.y = 0.28;
  const rune = mesh(new THREE.OctahedronGeometry(0.16, 0), brand, "Cull brand rune core");
  rune.position.y = 0.52;
  rune.rotation.set(0.35, 0.5, -0.2);
  const spikeA = mesh(new THREE.ConeGeometry(0.05, 0.28, 5), iron, "Cull brand spike A");
  spikeA.position.set(0.16, 0.48, 0.12);
  spikeA.rotation.z = -0.45;
  const spikeB = spikeA.clone();
  spikeB.name = "Cull brand spike B";
  spikeB.position.set(-0.14, 0.46, -0.1);
  spikeB.rotation.z = 0.4;
  const halo = mesh(new THREE.TorusGeometry(0.34, 0.014, 5, 22), glow, "Cull brand halo");
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.52;
  const light = new THREE.PointLight(0xff7a3a, CULL_BRAND_PICKUP_LIGHT_INTENSITY, 6.4, 2);
  light.name = "Cull brand pickup light";
  light.position.y = 0.55;
  const pickupAnchor = new THREE.Object3D();
  pickupAnchor.name = "Cull brand pickup anchor";
  pickupAnchor.position.y = 0.52;
  const glowAnchor = new THREE.Object3D();
  glowAnchor.name = "Cull brand glow anchor";
  glowAnchor.position.set(0, 0.52, 0.16);

  root.add(pedestal, plate, rune, spikeA, spikeB, halo, light, pickupAnchor, glowAnchor);
  root.userData.pickupKind = "cull-brand";
  root.userData.pickupLight = light;
  root.userData.pickupGlow = halo;
  root.userData.pickupAnchor = pickupAnchor;
  root.userData.glowAnchor = glowAnchor;
  return root;
}

export const PHOENIX_EGG_PICKUP_LIGHT_INTENSITY = 1.15;
export const PHOENIX_EGG_PICKUP_GLOW_OPACITY = 0.18;

/** Ash-and-amber phoenix egg on a small cinder pedestal. */
export function createPhoenixEggRelic(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Three-dimensional phoenix egg relic";

  const base = materials.darkStone.clone();
  base.color.multiplyScalar(0.7);
  base.roughness = Math.max(base.roughness, 0.9);
  const shell = materials.crystal.clone();
  shell.color.setHex(0xd46a28);
  shell.emissive.setHex(0x7a2808);
  shell.emissiveIntensity = 1.15;
  shell.roughness = 0.38;
  const crack = materials.ice.clone();
  crack.color.setHex(0xffc878);
  crack.emissive.setHex(0xff8a30);
  crack.emissiveIntensity = 1.55;
  crack.roughness = 0.22;
  const iron = materials.iron.clone();
  iron.color.setHex(0x3a2418);
  iron.roughness = 0.72;
  const glow = new THREE.MeshBasicMaterial({
    color: 0xff9a3a,
    transparent: true,
    opacity: PHOENIX_EGG_PICKUP_GLOW_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const pedestal = mesh(
    new THREE.CylinderGeometry(0.34, 0.44, 0.12, 8),
    base,
    "Phoenix egg pedestal",
  );
  pedestal.position.y = 0.06;
  const ring = mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 16), iron, "Phoenix egg iron ring");
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.14;
  const egg = mesh(new THREE.SphereGeometry(0.28, 12, 10), shell, "Phoenix egg shell");
  egg.scale.set(0.92, 1.18, 0.92);
  egg.position.y = 0.48;
  const seam = mesh(new THREE.TorusGeometry(0.2, 0.018, 5, 18), crack, "Phoenix egg seam");
  seam.rotation.x = Math.PI / 2;
  seam.position.y = 0.5;
  const core = mesh(new THREE.OctahedronGeometry(0.1, 0), crack, "Phoenix egg core");
  core.position.y = 0.5;
  const halo = mesh(new THREE.TorusGeometry(0.38, 0.014, 5, 22), glow, "Phoenix egg halo");
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.48;
  const light = new THREE.PointLight(0xff9a3a, PHOENIX_EGG_PICKUP_LIGHT_INTENSITY, 6.8, 2);
  light.name = "Phoenix egg pickup light";
  light.position.y = 0.55;

  root.add(pedestal, ring, egg, seam, core, halo, light);
  root.userData.pickupKind = "phoenix-egg";
  root.userData.pickupLight = light;
  root.userData.pickupGlow = halo;
  return root;
}

/** Compact cursed phial: dark glass, cracked iron ring, colored core. */
export function createCurseVessel(
  materials: DungeonMaterials,
  kind: CursePickupKind,
): THREE.Group {
  const palette = CURSE_PICKUP_COLORS[kind];
  const root = new THREE.Group();
  root.name = palette.label;
  const glass = new THREE.MeshPhysicalMaterial({
    color: palette.glass,
    transparent: true,
    opacity: 0.48,
    roughness: 0.28,
    metalness: 0.08,
    clearcoat: 0.45,
    clearcoatRoughness: 0.22,
    side: THREE.DoubleSide,
  });
  const core = new THREE.MeshStandardMaterial({
    color: palette.core,
    emissive: palette.emissive,
    emissiveIntensity: 0.85,
    roughness: 0.42,
  });
  const iron = materials.iron.clone();
  iron.color.setHex(0x2a2420);
  iron.roughness = 0.92;

  const bottle = mesh(
    new THREE.CylinderGeometry(0.18, 0.24, 0.52, 9),
    glass,
    `${palette.label} glass`,
  );
  bottle.position.y = 0.42;
  const charge = mesh(
    new THREE.IcosahedronGeometry(0.14, 0),
    core,
    `${palette.label} core`,
  );
  charge.position.y = 0.4;
  const neck = mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 0.16, 8),
    glass,
    `${palette.label} neck`,
  );
  neck.position.y = 0.74;
  const stopper = mesh(
    new THREE.CylinderGeometry(0.11, 0.09, 0.1, 7),
    iron,
    `${palette.label} stopper`,
  );
  stopper.position.y = 0.86;
  const ring = mesh(
    new THREE.TorusGeometry(0.22, 0.035, 6, 14),
    iron,
    `${palette.label} iron ring`,
  );
  ring.position.y = 0.48;
  ring.rotation.x = Math.PI / 2;
  root.add(bottle, charge, neck, stopper, ring);
  root.userData.pickupKind = kind;
  return root;
}

/**
 * Locks the pickup into its fade-capable shader variant before renderer warmup.
 * Runtime opacity changes can then reuse the compiled program.
 */
export function preparePickupOpacity(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material.userData.baseOpacity === undefined)
        material.userData.baseOpacity = material.opacity;
      if (!material.transparent) {
        material.transparent = true;
        material.needsUpdate = true;
      }
    }
  });
  object.userData.pickupOpacityPrepared = true;
}

export function setPickupOpacity(object: THREE.Object3D, opacity: number): void {
  if (object.userData.pickupOpacityPrepared !== true) preparePickupOpacity(object);
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material.opacity = Math.min(material.userData.baseOpacity as number, opacity);
    }
  });
}

/**
 * Hide pickup meshes without removing the root or its PointLights. Materials
 * remain compiled while dormant geometry stops reaching the draw list.
 */
export const PICKUP_DORMANT_SCALE = 0.001;

export function setPickupDormant(object: THREE.Object3D, dormant: boolean): void {
  object.visible = true;
  object.userData.pickupDormant = dormant;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (dormant) {
      if (child.userData.pickupVisibleBeforeDormant === undefined) {
        child.userData.pickupVisibleBeforeDormant = child.visible;
      }
      child.visible = false;
      return;
    }
    const previous = child.userData.pickupVisibleBeforeDormant;
    child.visible = typeof previous === "boolean" ? previous : true;
    delete child.userData.pickupVisibleBeforeDormant;
  });
  if (dormant) object.scale.setScalar(PICKUP_DORMANT_SCALE);
}
