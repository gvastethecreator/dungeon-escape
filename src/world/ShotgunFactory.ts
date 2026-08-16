import * as THREE from "three";

import type { DungeonMaterials } from "./MaterialLibrary";

/** Overall authored length (muzzle to buttpad), object space. */
export const PUMP_SHOTGUN_LENGTH = 1.0;
export const SHOTGUN_PICKUP_LIGHT_INTENSITY = 0.72;
export const SHOTGUN_PICKUP_GLOW_OPACITY = 0.1;

const TUBE_SIDES = 6;
const PUMP_SIDES = 8;

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function transformed(
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

export interface PumpShotgunAssembly {
  readonly root: THREE.Group;
  readonly pump: THREE.Group;
  readonly muzzle: THREE.Object3D;
  readonly grip: THREE.Object3D;
}

/**
 * Low-poly pump shotgun matching the multi-view reference sheet.
 * Object space: origin at the receiver/grip, +Z muzzle, +Y up, +X ejection-port side.
 */
export function createPumpShotgun(materials: DungeonMaterials): PumpShotgunAssembly {
  const root = new THREE.Group();
  root.name = "Pump-action shotgun";

  const wood = materials.wood.clone();
  wood.color.setHex(0x5c321c);
  wood.roughness = 0.82;
  wood.metalness = 0.02;
  wood.userData.sharedDungeonMaterial = false;

  const woodDark = wood.clone();
  woodDark.color.setHex(0x3f2214);

  const metal = materials.iron.clone();
  metal.color.setHex(0x6a7380);
  metal.roughness = 0.48;
  metal.metalness = 0.78;
  metal.userData.sharedDungeonMaterial = false;

  const metalDark = metal.clone();
  metalDark.color.setHex(0x2a2c30);
  metalDark.roughness = 0.58;
  metalDark.metalness = 0.42;

  const bore = metalDark.clone();
  bore.color.setHex(0x121416);
  bore.metalness = 0.2;
  bore.roughness = 0.7;

  const stock = new THREE.Group();
  stock.name = "Shotgun stock";
  stock.userData.sculptPartId = "stock";
  const butt = mesh(
    transformed(new THREE.BoxGeometry(0.092, 0.132, 0.028), [0, 0.01, -0.486]),
    metalDark,
    "Shotgun buttpad",
  );
  const comb = mesh(
    transformed(new THREE.BoxGeometry(0.078, 0.118, 0.16), [0, 0.012, -0.392], [0.08, 0, 0]),
    wood,
    "Shotgun stock comb",
  );
  const wrist = mesh(
    transformed(new THREE.BoxGeometry(0.058, 0.072, 0.14), [0, -0.012, -0.248], [0.18, 0, 0]),
    woodDark,
    "Shotgun stock wrist",
  );
  stock.add(butt, comb, wrist);

  const receiver = new THREE.Group();
  receiver.name = "Shotgun receiver";
  receiver.userData.sculptPartId = "receiver";
  const body = mesh(
    transformed(new THREE.BoxGeometry(0.052, 0.078, 0.26), [0, 0.006, -0.02]),
    metal,
    "Shotgun receiver body",
  );
  const ejection = mesh(
    transformed(new THREE.BoxGeometry(0.012, 0.028, 0.072), [0.028, 0.018, 0.02]),
    metalDark,
    "Shotgun ejection port",
  );
  const loading = mesh(
    transformed(new THREE.BoxGeometry(0.028, 0.01, 0.07), [0, -0.036, 0.01]),
    metalDark,
    "Shotgun loading port",
  );
  const guard = mesh(
    transformed(
      new THREE.TorusGeometry(0.028, 0.005, 5, 10, Math.PI),
      [0, -0.048, -0.02],
      [0, 0, Math.PI],
    ),
    metalDark,
    "Shotgun trigger guard",
  );
  const trigger = mesh(
    transformed(new THREE.BoxGeometry(0.008, 0.022, 0.012), [0, -0.042, -0.018], [0.35, 0, 0]),
    metalDark,
    "Shotgun trigger",
  );
  receiver.add(body, ejection, loading, guard, trigger);

  const barrelAssembly = new THREE.Group();
  barrelAssembly.name = "Shotgun barrel assembly";
  barrelAssembly.userData.sculptPartId = "barrel-assembly";
  const barrel = mesh(
    transformed(
      new THREE.CylinderGeometry(0.016, 0.016, 0.4, TUBE_SIDES),
      [0, 0.028, 0.3],
      [Math.PI / 2, 0, 0],
    ),
    metal,
    "Shotgun barrel",
  );
  const rib = mesh(
    transformed(new THREE.BoxGeometry(0.01, 0.006, 0.38), [0, 0.046, 0.3]),
    metal,
    "Shotgun barrel rib",
  );
  const magTube = mesh(
    transformed(
      new THREE.CylinderGeometry(0.014, 0.014, 0.34, TUBE_SIDES),
      [0, -0.022, 0.28],
      [Math.PI / 2, 0, 0],
    ),
    metal,
    "Shotgun magazine tube",
  );
  const magCap = mesh(
    transformed(
      new THREE.CylinderGeometry(0.016, 0.016, 0.018, TUBE_SIDES),
      [0, -0.022, 0.458],
      [Math.PI / 2, 0, 0],
    ),
    metal,
    "Shotgun magazine cap",
  );
  const muzzleRing = mesh(
    transformed(
      new THREE.CylinderGeometry(0.018, 0.018, 0.016, TUBE_SIDES),
      [0, 0.028, 0.498],
      [Math.PI / 2, 0, 0],
    ),
    metal,
    "Shotgun muzzle ring",
  );
  const boreDisc = mesh(
    transformed(new THREE.CircleGeometry(0.01, TUBE_SIDES), [0, 0.028, 0.507]),
    bore,
    "Shotgun bore",
  );
  const sight = mesh(
    transformed(new THREE.BoxGeometry(0.008, 0.014, 0.012), [0, 0.056, 0.492]),
    metalDark,
    "Shotgun front sight",
  );
  barrelAssembly.add(barrel, rib, magTube, magCap, muzzleRing, boreDisc, sight);

  const pump = new THREE.Group();
  pump.name = "Shotgun pump";
  pump.userData.sculptPartId = "pump";
  const forend = mesh(
    transformed(
      new THREE.CylinderGeometry(0.032, 0.034, 0.16, PUMP_SIDES),
      [0, -0.02, 0.22],
      [Math.PI / 2, 0, 0],
    ),
    wood,
    "Shotgun pump forend",
  );
  pump.add(forend);
  for (let index = 0; index < 6; index += 1) {
    const z = 0.155 + index * 0.026;
    const ribRing = mesh(
      transformed(
        new THREE.TorusGeometry(0.033, 0.0035, 4, PUMP_SIDES),
        [0, -0.02, z],
        [Math.PI / 2, 0, 0],
      ),
      woodDark,
      `Shotgun pump rib ${index + 1}`,
    );
    ribRing.userData.explodeWithParent = true;
    pump.add(ribRing);
  }

  const muzzle = new THREE.Object3D();
  muzzle.name = "Shotgun muzzle socket";
  muzzle.position.set(0, 0.028, 0.51);
  const grip = new THREE.Object3D();
  grip.name = "Shotgun grip socket";
  grip.position.set(0, -0.02, -0.08);

  root.add(stock, receiver, barrelAssembly, pump, muzzle, grip);
  root.userData.sculptRuntime = {
    rootMotionNode: root,
    pivots: { pump },
    sockets: { muzzle, grip },
    colliders: [{ type: "box", size: [0.1, 0.16, 1.02], offset: [0, 0, 0], isTrigger: true }],
    destructionGroups: { stock, receiver, barrel: barrelAssembly, pump },
  };
  return { root, pump, muzzle, grip };
}

/** Chest pickup: the shotgun on a small iron rest with a cool metal halo. */
export function createShotgunPickup(materials: DungeonMaterials): THREE.Group {
  const pickup = new THREE.Group();
  pickup.name = "Three-dimensional pump shotgun pickup";
  const { root, pump, muzzle, grip } = createPumpShotgun(materials);
  root.name = "Pump shotgun sculpt";
  root.position.set(0, 0.42, 0);
  root.rotation.set(0.18, 0.55, 0.08);
  root.scale.setScalar(0.72);

  const base = materials.darkStone.clone();
  base.color.multiplyScalar(0.74);
  base.roughness = Math.max(base.roughness, 0.88);
  const iron = materials.iron.clone();
  iron.color.setHex(0x3a3e44);
  iron.roughness = 0.55;
  iron.metalness = 0.7;
  const glow = new THREE.MeshBasicMaterial({
    color: 0x8aa0b4,
    transparent: true,
    opacity: SHOTGUN_PICKUP_GLOW_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  const pedestal = mesh(
    new THREE.CylinderGeometry(0.34, 0.42, 0.12, 8),
    base,
    "Shotgun pickup pedestal",
  );
  pedestal.position.y = 0.06;
  const rest = mesh(new THREE.BoxGeometry(0.5, 0.05, 0.16), iron, "Shotgun pickup rest");
  rest.position.set(0, 0.16, 0);
  rest.rotation.y = 0.4;
  const halo = mesh(new THREE.TorusGeometry(0.36, 0.012, 5, 22), glow, "Shotgun pickup halo");
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.42;
  const light = new THREE.PointLight(0x8aa0b4, SHOTGUN_PICKUP_LIGHT_INTENSITY, 6.2, 2);
  light.name = "Shotgun pickup light";
  light.position.y = 0.48;
  const pickupAnchor = new THREE.Object3D();
  pickupAnchor.name = "Shotgun pickup anchor";
  pickupAnchor.position.y = 0.42;
  const glowAnchor = new THREE.Object3D();
  glowAnchor.name = "Shotgun glow anchor";
  glowAnchor.position.set(0, 0.42, 0.16);

  pickup.add(pedestal, rest, root, halo, light, pickupAnchor, glowAnchor);
  pickup.userData.pickupKind = "shotgun";
  pickup.userData.pickupLight = light;
  pickup.userData.pickupGlow = halo;
  pickup.userData.pickupAnchor = pickupAnchor;
  pickup.userData.glowAnchor = glowAnchor;
  pickup.userData.pump = pump;
  pickup.userData.muzzle = muzzle;
  pickup.userData.grip = grip;
  pickup.userData.reference = ".scratch/img2threejs/items/pump-shotgun/reference.png";
  pickup.userData.specification = ".scratch/img2threejs/items/pump-shotgun/spec.json";
  return pickup;
}
