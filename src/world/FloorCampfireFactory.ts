import * as THREE from "three";

import type { DungeonMaterials } from "./MaterialLibrary";
import { FIRE_LIGHT_TUNING } from "../systems/LightTuning";

/** Small floor campfire footprint — replaces floor candles at adult player scale. */
export const FLOOR_CAMPFIRE_MESH_SCALE = 1;
const SOURCE_IMAGE = "/assets/concepts/floor-campfire-v1.jpg";

export interface FloorCampfireAssembly {
  root: THREE.Group;
  flame: THREE.Mesh;
  flameDetails: THREE.Object3D[];
  halos: THREE.Mesh[];
  light: THREE.PointLight | null;
  baseIntensity: number;
  baseY: number;
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

/**
 * Image-sculpted small floor campfire: stone ring, charred logs, coal bed, layered flame.
 * Reference: public/assets/concepts/floor-campfire-v1.jpg
 */
export function createFloorCampfire(
  position: THREE.Vector3,
  lit: boolean,
  materials: DungeonMaterials,
  variant = 0,
): FloorCampfireAssembly {
  const root = new THREE.Group();
  root.name = "Image-sculpted floor campfire";
  root.position.copy(position);
  root.rotation.y = (variant % 4) * (Math.PI / 5);

  const stoneMat = materials.darkStone ?? materials.stone;
  const woodMat = materials.wood;
  const ironMat = materials.iron;

  // Ash disc under the pile (reads as scorched floor).
  const ash = mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.04, 10), stoneMat, "Campfire ash bed");
  ash.position.y = 0.02;
  root.add(ash);

  // Irregular stone ring (8 blocks around a ~0.55 m radius).
  const ring = new THREE.Group();
  ring.name = "Campfire stone ring";
  const ringCount = 8;
  for (let i = 0; i < ringCount; i += 1) {
    const angle = (i / ringCount) * Math.PI * 2 + 0.08 * (i % 3);
    const radius = 0.38 + (i % 3) * 0.025;
    const w = 0.16 + (i % 2) * 0.04;
    const h = 0.12 + (i % 3) * 0.03;
    const d = 0.14 + ((i + 1) % 2) * 0.03;
    const rock = mesh(new THREE.BoxGeometry(w, h, d), stoneMat, "Campfire ring stone");
    rock.position.set(Math.sin(angle) * radius, h * 0.5, Math.cos(angle) * radius);
    rock.rotation.y = angle + 0.35;
    rock.rotation.z = ((i % 2) - 0.5) * 0.12;
    ring.add(rock);
  }
  root.add(ring);

  // Three short charred logs in a triangle lean.
  const logGroup = new THREE.Group();
  logGroup.name = "Campfire log triangle";
  const logAngles = [0.15, 2.2, 4.05];
  logAngles.forEach((angle, index) => {
    const log = mesh(
      new THREE.CylinderGeometry(0.055, 0.07, 0.52, 6),
      woodMat,
      "Campfire charred log",
    );
    log.rotation.z = Math.PI / 2;
    log.rotation.y = angle;
    log.position.set(Math.sin(angle) * 0.12, 0.1 + index * 0.015, Math.cos(angle) * 0.12);
    log.rotation.x = 0.18 + index * 0.05;
    // Char tips as dark iron-ish ends.
    const tip = mesh(new THREE.SphereGeometry(0.06, 5, 4), ironMat, "Campfire log char tip");
    tip.position.set(0.26, 0, 0);
    log.add(tip);
    logGroup.add(log);
  });
  root.add(logGroup);

  // Coal / ember bed (solid pieces + emissive-looking basic cores when lit).
  const coals = new THREE.Group();
  coals.name = "Campfire coal bed";
  const coalOffsets: ReadonlyArray<readonly [number, number, number, number]> = [
    [0.02, 0.08, 0.04, 0.07],
    [-0.08, 0.07, -0.05, 0.055],
    [0.09, 0.075, -0.06, 0.05],
    [-0.04, 0.07, 0.09, 0.048],
    [0.05, 0.065, 0.1, 0.04],
    [-0.1, 0.065, 0.03, 0.045],
  ];
  for (const [x, y, z, r] of coalOffsets) {
    const coal = mesh(new THREE.IcosahedronGeometry(r, 0), ironMat, "Campfire coal lump");
    coal.position.set(x, y, z);
    coal.rotation.set(x * 4, y * 8, z * 3);
    coals.add(coal);
  }
  root.add(coals);

  const baseY = 0.32;
  const emberMat = new THREE.MeshBasicMaterial({
    color: 0xd7a05c,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xffe0a1,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  // Outer soft flame tongue + brighter core (animated by FireEffect on `flame`).
  const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), emberMat);
  flame.name = "Campfire outer flame";
  flame.visible = lit;
  flame.position.set(0, baseY, 0);
  flame.scale.set(0.9, 1.65, 0.9);
  flame.renderOrder = 4;

  const flameCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), coreMat);
  flameCore.name = "Campfire flame core";
  flameCore.visible = lit;
  flameCore.position.set(0.01, baseY + 0.02, -0.01);
  flameCore.scale.set(0.85, 1.5, 0.85);
  flameCore.renderOrder = 5;

  // Secondary lean tongue for silhouette variety.
  const tongue = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), emberMat.clone());
  tongue.name = "Campfire lean tongue";
  tongue.visible = lit;
  tongue.position.set(-0.06, baseY + 0.08, 0.04);
  tongue.scale.set(0.55, 1.35, 0.55);
  tongue.rotation.z = 0.35;
  tongue.renderOrder = 4;

  // Ground warm card under the fire.
  const groundGlow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 14),
    new THREE.MeshBasicMaterial({
      color: 0xb87943,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  groundGlow.name = "Campfire ground glow";
  groundGlow.visible = lit;
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.y = 0.04;
  groundGlow.renderOrder = 1;

  root.add(groundGlow, flame, flameCore, tongue);

  const baseIntensity = 30;
  const light = lit
    ? new THREE.PointLight(0xd18b4c, baseIntensity, FIRE_LIGHT_TUNING.candleRange, 2.1)
    : null;
  const halos: THREE.Mesh[] = [groundGlow];
  if (light) {
    light.name = "Floor campfire point light";
    light.position.set(0, baseY + 0.12, 0);
    root.add(light);
    for (const [radius, opacity] of [
      [0.55, 0.07],
      [1.05, 0.03],
    ] as const) {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 12, 8),
        new THREE.MeshBasicMaterial({
          color: 0xc88a51,
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          toneMapped: false,
        }),
      );
      halo.name = "Floor campfire spherical light halo";
      halo.position.set(0, baseY + 0.06, 0);
      halo.renderOrder = 2;
      halos.push(halo);
      root.add(halo);
    }
  }

  root.scale.setScalar(FLOOR_CAMPFIRE_MESH_SCALE);
  root.userData.sculptRuntime = {
    sourceImage: SOURCE_IMAGE,
    family: "floor-campfire",
    units: "meters",
    collider: { type: "box", size: [0.95, 0.45, 0.95], offset: [0, 0.22, 0] },
    lod: { near: 0, mid: 14, far: 28 },
    sockets: {
      flamePivot: { localPosition: [0, baseY, 0] },
    },
  };

  return {
    root,
    flame,
    flameDetails: [flameCore, tongue],
    halos,
    light,
    baseIntensity,
    baseY,
  };
}
