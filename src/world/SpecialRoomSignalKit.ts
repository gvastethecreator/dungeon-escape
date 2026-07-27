import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { gridToWorld } from "../dungeon/gridCollision";
import type { DungeonData } from "../dungeon/types";
import type { DungeonMaterials } from "./MaterialLibrary";
import { resolveSpecialRoomIdentity, type SpecialRoomIdentity } from "./SpecialRoomIdentity";

const SIGNAL_COLORS: Record<Exclude<SpecialRoomIdentity, "lake">, number> = {
  grave: 0x71806c,
  treasure: 0xb98a46,
  shrine: 0x7181aa,
  elite: 0xa44e45,
  boss: 0xbd4840,
};

function transformed(
  geometry: THREE.BufferGeometry,
  position: THREE.Vector3,
  rotation: THREE.Euler,
  scale = new THREE.Vector3(1, 1, 1),
): THREE.BufferGeometry {
  const matrix = new THREE.Matrix4().compose(
    position,
    new THREE.Quaternion().setFromEuler(rotation),
    scale,
  );
  return geometry.applyMatrix4(matrix);
}

function createSignalGeometry(
  identity: Exclude<SpecialRoomIdentity, "lake">,
): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [
    transformed(
      new THREE.RingGeometry(
        identity === "boss" ? 0.62 : 0.52,
        identity === "boss" ? 0.76 : 0.64,
        24,
      ),
      new THREE.Vector3(),
      new THREE.Euler(-Math.PI / 2, 0, 0),
    ),
  ];
  const runeCount = identity === "boss" ? 8 : identity === "shrine" ? 6 : 4;
  for (let index = 0; index < runeCount; index += 1) {
    const angle = (index / runeCount) * Math.PI * 2;
    geometries.push(
      transformed(
        new THREE.BoxGeometry(identity === "grave" ? 0.1 : 0.16, 0.018, 0.42),
        new THREE.Vector3(Math.cos(angle) * 0.38, 0.012, Math.sin(angle) * 0.38),
        new THREE.Euler(0, -angle, 0),
      ),
    );
  }
  if (identity === "boss") {
    geometries.push(
      transformed(
        new THREE.RingGeometry(0.23, 0.31, 16),
        new THREE.Vector3(0, 0.018, 0),
        new THREE.Euler(-Math.PI / 2, 0, 0),
      ),
    );
  }
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => {
    if (geometry !== merged) geometry.dispose();
  });
  return merged ?? new THREE.RingGeometry(0.5, 0.65, 16);
}

export function createSpecialRoomSignals(
  dungeon: DungeonData,
  materials: DungeonMaterials,
  tileSize: number,
): THREE.Group | null {
  const root = new THREE.Group();
  root.name = "Special room floor signals";
  for (const room of dungeon.rooms) {
    const identity = resolveSpecialRoomIdentity(dungeon, room);
    if (!identity || identity === "lake") continue;
    const color = SIGNAL_COLORS[identity];
    const material = materials.darkStone.clone();
    material.name = `${identity} room signal material`;
    material.color.copy(new THREE.Color(color).multiplyScalar(0.58));
    material.emissive.setHex(color);
    material.emissiveIntensity = identity === "boss" ? 1.4 : 0.92;
    material.roughness = 0.64;
    material.metalness = 0.18;
    material.envMapIntensity = 0.62;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    const signal = new THREE.Mesh(createSignalGeometry(identity), material);
    signal.name = `${identity} room floor signal`;
    const center = gridToWorld(dungeon, room.center, tileSize);
    signal.position.set(center.x, 0.064, center.z);
    signal.scale.setScalar(Math.min(1.25, Math.max(0.8, Math.min(room.width, room.height) / 5)));
    signal.userData.roomId = room.id;
    signal.userData.roomIdentity = identity;
    root.add(signal);
  }
  if (root.children.length === 0) return null;
  root.userData.materialReference = materials.darkStone.name;
  return root;
}
