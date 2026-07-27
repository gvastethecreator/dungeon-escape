import * as THREE from "three";

import type { DungeonMaterials } from "./MaterialLibrary";

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.castShadow = true;
  return result;
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
  });
  const liquidMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b0914,
    emissive: 0x4b050d,
    emissiveIntensity: 1.3,
    roughness: 0.28,
  });
  const iron = materials.iron.clone();
  iron.color.multiplyScalar(0.72);
  iron.roughness = 0.54;
  iron.metalness = Math.max(iron.metalness, 0.56);
  const emblem = materials.brass.clone();
  emblem.color.setHex(0xc7c0a9);
  emblem.emissive.setHex(0x3d3028);
  emblem.emissiveIntensity = 0.5;
  emblem.roughness = 0.42;
  emblem.metalness = 0.34;

  // The sprite reads as a round caged flask. A 14-segment lathe keeps that
  // silhouette at pickup distance without spending a dense asset budget.
  const bottleProfile = [
    new THREE.Vector2(0.02, 0),
    new THREE.Vector2(0.2, 0.025),
    new THREE.Vector2(0.29, 0.15),
    new THREE.Vector2(0.3, 0.35),
    new THREE.Vector2(0.25, 0.5),
    new THREE.Vector2(0.13, 0.61),
    new THREE.Vector2(0.105, 0.66),
  ];
  const bottle = mesh(new THREE.LatheGeometry(bottleProfile, 14), glass, "Faceted flask glass");
  bodyPivot.add(bottle);

  const liquidProfile = [
    new THREE.Vector2(0.01, 0.025),
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
  bodyPivot.add(liquid);

  const neck = mesh(new THREE.CylinderGeometry(0.105, 0.115, 0.17, 12), glass, "Flask neck");
  neck.position.y = 0.705;
  const stopper = mesh(
    new THREE.CylinderGeometry(0.17, 0.145, 0.15, 10),
    materials.wood.clone(),
    "Flask stopper",
  );
  stopper.position.y = 0.82;
  const collar = mesh(new THREE.TorusGeometry(0.13, 0.026, 6, 14), iron, "Flask iron neck collar");
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.64;
  bodyPivot.add(neck, stopper, collar);

  const frontCage = mesh(
    new THREE.TorusGeometry(0.305, 0.022, 6, 18),
    iron,
    "Flask front iron cage",
  );
  frontCage.scale.y = 0.91;
  frontCage.position.y = 0.31;
  const sideCage = frontCage.clone();
  sideCage.name = "Flask side iron cage";
  sideCage.rotation.y = Math.PI / 2;
  cagePivot.add(frontCage, sideCage);

  const crossShape = new THREE.Shape();
  crossShape.moveTo(-0.045, 0.14);
  crossShape.lineTo(0.045, 0.14);
  crossShape.lineTo(0.045, 0.045);
  crossShape.lineTo(0.13, 0.045);
  crossShape.lineTo(0.13, -0.045);
  crossShape.lineTo(0.045, -0.045);
  crossShape.lineTo(0.045, -0.14);
  crossShape.lineTo(-0.045, -0.14);
  crossShape.lineTo(-0.045, -0.045);
  crossShape.lineTo(-0.13, -0.045);
  crossShape.lineTo(-0.13, 0.045);
  crossShape.lineTo(-0.045, 0.045);
  const crossGeometry = new THREE.ExtrudeGeometry(crossShape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.008,
    bevelThickness: 0.008,
  });
  crossGeometry.translate(0, 0, -0.0175);
  const frontCross = mesh(crossGeometry, emblem, "Raised resolve cross");
  frontCross.position.set(0, 0.32, 0.302);
  const rearCross = frontCross.clone();
  rearCross.name = "Rear resolve cross";
  rearCross.position.z = -0.302;
  rearCross.rotation.y = Math.PI;
  cagePivot.add(frontCross, rearCross);

  for (const side of [-1, 1]) {
    const tab = mesh(new THREE.BoxGeometry(0.085, 0.055, 0.038), emblem, "Resolve cage side tab");
    tab.position.set(side * 0.265, 0.32, 0.292);
    tab.rotation.z = side * 0.28;
    cagePivot.add(tab);
  }

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0x9b1628,
    transparent: true,
    opacity: 0.24,
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

  const pickupAnchor = new THREE.Object3D();
  pickupAnchor.name = "Resolve pickup anchor";
  pickupAnchor.position.y = 0.38;
  const glowAnchor = new THREE.Object3D();
  glowAnchor.name = "Resolve glow anchor";
  glowAnchor.position.set(0, 0.34, 0.22);

  root.add(bodyPivot, cagePivot, halo, pickupAnchor, glowAnchor);
  root.userData.pickupKind = "resolve";
  root.userData.sculptRuntime = {
    rootMotionNode: root,
    pivots: { body: bodyPivot, cage: cagePivot },
    sockets: { pickup: pickupAnchor, glow: glowAnchor },
    colliders: [{ type: "sphere", radius: 0.38, offset: [0, 0.38, 0], isTrigger: true }],
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
  iron.color.setHex(0x527985);
  iron.roughness = 0.78;
  iron.metalness = 0.52;
  const brass = materials.brass.clone();
  brass.color.setHex(0x9da46e);
  brass.roughness = 0.64;
  const ice = materials.ice.clone();
  ice.color.setHex(0x78dce6);
  ice.emissive.setHex(0x1b9eac);
  ice.emissiveIntensity = 1.65;
  ice.roughness = 0.34;
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x65e9f3,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const frame = new THREE.Group();
  frame.name = "Time freeze hourglass frame";
  const topCap = mesh(
    new THREE.CylinderGeometry(0.25, 0.29, 0.09, 12),
    brass,
    "Time freeze top cap",
  );
  topCap.position.y = 0.88;
  const bottomCap = mesh(
    new THREE.CylinderGeometry(0.29, 0.25, 0.09, 12),
    brass,
    "Time freeze bottom cap",
  );
  bottomCap.position.y = 0.08;
  const topRing = mesh(new THREE.TorusGeometry(0.245, 0.035, 6, 16), iron, "Time freeze top ring");
  topRing.rotation.x = Math.PI / 2;
  topRing.position.y = 0.8;
  const bottomRing = topRing.clone();
  bottomRing.name = "Time freeze bottom ring";
  bottomRing.position.y = 0.16;
  const leftRail = mesh(new THREE.BoxGeometry(0.055, 0.78, 0.055), iron, "Time freeze left rail");
  leftRail.position.set(-0.25, 0.47, 0);
  leftRail.rotation.z = -0.12;
  const rightRail = leftRail.clone();
  rightRail.name = "Time freeze right rail";
  rightRail.position.x = 0.25;
  rightRail.rotation.z = 0.12;
  frame.add(topCap, bottomCap, topRing, bottomRing, leftRail, rightRail);

  const core = mesh(new THREE.OctahedronGeometry(0.23, 1), ice, "Time freeze frozen core");
  core.position.y = 0.48;
  core.rotation.set(0.24, 0.42, 0.08);
  const coreBand = mesh(
    new THREE.TorusGeometry(0.205, 0.018, 5, 14),
    brass,
    "Time freeze core band",
  );
  coreBand.rotation.x = Math.PI / 2;
  coreBand.position.y = 0.48;

  const handMaterial = materials.ice.clone();
  handMaterial.color.setHex(0xc3fbff);
  handMaterial.emissive.setHex(0x43cdd7);
  handMaterial.emissiveIntensity = 1.2;
  const handMinute = mesh(
    new THREE.BoxGeometry(0.024, 0.17, 0.018),
    handMaterial,
    "Time freeze minute hand",
  );
  handMinute.position.set(0, 0.55, 0.23);
  handMinute.rotation.z = -0.55;
  const handHour = mesh(
    new THREE.BoxGeometry(0.02, 0.11, 0.02),
    handMaterial,
    "Time freeze hour hand",
  );
  handHour.position.set(0.01, 0.43, 0.232);
  handHour.rotation.z = 0.8;

  const orbit = mesh(
    new THREE.TorusGeometry(0.43, 0.018, 5, 18),
    glowMaterial,
    "Time freeze orbit halo",
  );
  orbit.rotation.x = Math.PI / 2;
  orbit.position.y = 0.48;
  const verticalHalo = mesh(
    new THREE.TorusGeometry(0.36, 0.014, 5, 16),
    glowMaterial,
    "Time freeze vertical halo",
  );
  verticalHalo.rotation.x = Math.PI / 2;
  verticalHalo.rotation.z = Math.PI / 2;
  verticalHalo.position.y = 0.48;
  const pickupLight = new THREE.PointLight(0x72e7ef, 1.35, 5.2, 2.1);
  pickupLight.name = "Time freeze pickup light";
  pickupLight.position.y = 0.48;

  const pickupAnchor = new THREE.Object3D();
  pickupAnchor.name = "Time freeze pickup anchor";
  pickupAnchor.position.y = 0.48;
  const glowAnchor = new THREE.Object3D();
  glowAnchor.name = "Time freeze glow anchor";
  glowAnchor.position.set(0, 0.48, 0.26);

  root.add(
    frame,
    core,
    coreBand,
    handMinute,
    handHour,
    orbit,
    verticalHalo,
    pickupLight,
    pickupAnchor,
    glowAnchor,
  );
  root.userData.pickupKind = "time-freeze";
  root.userData.sculptRuntime = {
    rootMotionNode: root,
    sockets: { pickup: pickupAnchor, glow: glowAnchor },
    colliders: [{ type: "sphere", radius: 0.42, offset: [0, 0.48, 0], isTrigger: true }],
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
  const crystal = materials.crystal.clone();
  crystal.color.setHex(0xb4e98c);
  crystal.emissive.setHex(0x4d9e43);
  crystal.emissiveIntensity = 1.45;
  crystal.roughness = 0.48;
  const core = materials.ice.clone();
  core.color.setHex(0xd5f7a9);
  core.emissive.setHex(0x74be4f);
  core.emissiveIntensity = 1.8;
  core.roughness = 0.36;
  const glow = new THREE.MeshBasicMaterial({
    color: 0xbff58d,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const pedestal = mesh(
    new THREE.CylinderGeometry(0.46, 0.58, 0.2, 8),
    base,
    "Luminous ward stone pedestal",
  );
  pedestal.position.y = 0.1;
  const footRing = mesh(
    new THREE.TorusGeometry(0.47, 0.045, 6, 16),
    iron,
    "Luminous ward iron foot ring",
  );
  footRing.rotation.x = Math.PI / 2;
  footRing.position.y = 0.22;
  const crystalCore = mesh(
    new THREE.DodecahedronGeometry(0.31, 1),
    crystal,
    "Luminous ward faceted crystal",
  );
  crystalCore.position.y = 0.58;
  crystalCore.rotation.set(0.2, 0.34, -0.08);
  const crystalShard = mesh(
    new THREE.OctahedronGeometry(0.14, 0),
    core,
    "Luminous ward inner glow crystal",
  );
  crystalShard.position.set(0.01, 0.59, 0.22);
  crystalShard.rotation.set(-0.16, 0.4, 0.2);

  const cageRing = mesh(
    new THREE.TorusGeometry(0.37, 0.026, 5, 18),
    iron,
    "Luminous ward upper cage ring",
  );
  cageRing.rotation.x = Math.PI / 2;
  cageRing.position.y = 0.58;
  const cageRingVertical = cageRing.clone();
  cageRingVertical.name = "Luminous ward vertical cage ring";
  cageRingVertical.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  const halo = mesh(new THREE.TorusGeometry(0.52, 0.018, 5, 22), glow, "Luminous ward pickup halo");
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.58;

  for (let index = 0; index < 6; index += 1) {
    const rune = mesh(new THREE.BoxGeometry(0.045, 0.12, 0.035), core, "Luminous ward rune");
    const angle = (index / 6) * Math.PI * 2;
    rune.position.set(Math.cos(angle) * 0.46, 0.26, Math.sin(angle) * 0.46);
    rune.rotation.y = angle;
    root.add(rune);
  }

  const pickupLight = new THREE.PointLight(0xb9e879, 2.2, 8.5, 2);
  pickupLight.name = "Luminous ward pickup light";
  pickupLight.position.y = 0.62;
  const pickupAnchor = new THREE.Object3D();
  pickupAnchor.name = "Luminous ward pickup anchor";
  pickupAnchor.position.y = 0.58;
  const glowAnchor = new THREE.Object3D();
  glowAnchor.name = "Luminous ward glow anchor";
  glowAnchor.position.set(0, 0.58, 0.22);

  root.add(
    pedestal,
    footRing,
    crystalCore,
    crystalShard,
    cageRing,
    cageRingVertical,
    halo,
    pickupLight,
    pickupAnchor,
    glowAnchor,
  );
  root.userData.pickupKind = "luminous-ward";
  root.userData.sculptRuntime = {
    rootMotionNode: root,
    sockets: { pickup: pickupAnchor, glow: glowAnchor },
    colliders: [{ type: "sphere", radius: 0.48, offset: [0, 0.58, 0], isTrigger: true }],
  };
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
