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

export type SpecialRoomSignalIdentity = Exclude<SpecialRoomIdentity, "lake">;

function transformed(
  geometry: THREE.BufferGeometry,
  position = new THREE.Vector3(),
  rotation = new THREE.Euler(),
  scale = new THREE.Vector3(1, 1, 1),
): THREE.BufferGeometry {
  return geometry.applyMatrix4(
    new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), scale),
  );
}

function annulusGeometry(
  innerRadius: number,
  outerRadius: number,
  depth: number,
): THREE.ExtrudeGeometry {
  const outer = new THREE.Shape();
  outer.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
  outer.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(outer, {
    depth,
    steps: 1,
    curveSegments: 24,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.012,
    bevelThickness: 0.009,
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function mergeSignalBatch(
  geometries: THREE.BufferGeometry[],
  material: THREE.Material,
  name: string,
): THREE.Mesh {
  const normalized = geometries.map((geometry) => {
    const result = geometry.index ? geometry.toNonIndexed() : geometry;
    result.computeVertexNormals();
    return result;
  });
  const merged = mergeGeometries(normalized, false);
  if (!merged) throw new Error(`Could not merge ${name}`);
  for (const geometry of normalized) if (geometry !== merged) geometry.dispose();
  const batch = new THREE.Mesh(merged, material);
  batch.name = name;
  batch.castShadow = true;
  batch.receiveShadow = true;
  return batch;
}

function createSignalBatches(
  identity: SpecialRoomSignalIdentity,
  stoneMaterial: THREE.Material,
  runeMaterial: THREE.Material,
): [THREE.Mesh, THREE.Mesh] {
  const isBoss = identity === "boss";
  const innerRadius = isBoss ? 0.61 : 0.5;
  const outerRadius = isBoss ? 0.78 : 0.67;
  const nodeCount = isBoss ? 8 : identity === "shrine" ? 6 : 4;
  const stone: THREE.BufferGeometry[] = [annulusGeometry(innerRadius, outerRadius, 0.065)];
  const runes: THREE.BufferGeometry[] = [];

  for (let index = 0; index < nodeCount; index += 1) {
    const angle = (index / nodeCount) * Math.PI * 2;
    const radius = isBoss ? 0.7 : 0.585;
    const position = new THREE.Vector3(Math.sin(angle) * radius, 0.075, Math.cos(angle) * radius);
    const rotation = new THREE.Euler(0, angle, 0);
    stone.push(
      transformed(
        new THREE.BoxGeometry(identity === "grave" ? 0.2 : 0.24, 0.11, isBoss ? 0.4 : 0.36),
        position,
        rotation,
      ),
    );
    runes.push(
      transformed(
        new THREE.BoxGeometry(identity === "grave" ? 0.055 : 0.085, 0.028, isBoss ? 0.27 : 0.23),
        new THREE.Vector3(position.x, 0.145, position.z),
        rotation,
      ),
    );
  }

  if (isBoss) {
    stone.push(transformed(annulusGeometry(0.21, 0.32, 0.052), new THREE.Vector3(0, 0.012, 0)));
    runes.push(
      transformed(
        new THREE.OctahedronGeometry(0.13, 0),
        new THREE.Vector3(0, 0.105, 0),
        new THREE.Euler(0, Math.PI / 4, 0),
        new THREE.Vector3(1, 0.24, 1),
      ),
    );
  }

  return [
    mergeSignalBatch(stone, stoneMaterial, `${identity} signal carved stone batch`),
    mergeSignalBatch(runes, runeMaterial, `${identity} signal emissive inset batch`),
  ];
}

export function createSpecialRoomSignal(
  identity: SpecialRoomSignalIdentity,
  materials: DungeonMaterials,
): THREE.Group {
  const color = SIGNAL_COLORS[identity];
  const stoneMaterial = materials.darkStone.clone();
  stoneMaterial.name = `${identity} room signal carved stone`;
  stoneMaterial.color.multiplyScalar(0.78);
  stoneMaterial.roughness = Math.max(0.72, stoneMaterial.roughness);
  stoneMaterial.metalness = Math.min(0.08, stoneMaterial.metalness);
  stoneMaterial.emissive.setHex(0x000000);
  stoneMaterial.emissiveIntensity = 0;

  const runeMaterial = materials.iron.clone();
  runeMaterial.name = `${identity} room signal luminous inlay`;
  runeMaterial.color.copy(new THREE.Color(color).multiplyScalar(0.7));
  runeMaterial.emissive.setHex(color);
  runeMaterial.emissiveIntensity = identity === "boss" ? 1.15 : 0.72;
  runeMaterial.roughness = 0.4;
  runeMaterial.metalness = 0.34;
  runeMaterial.envMapIntensity = 0.72;

  const signal = new THREE.Group();
  signal.name = `${identity} room floor signal`;
  signal.add(...createSignalBatches(identity, stoneMaterial, runeMaterial));
  signal.userData.roomIdentity = identity;
  signal.userData.asset = `${identity === "grave" ? "tomb" : identity}-room-signal`;
  signal.userData.reference = `assets-source/imagegen/model-references-v2/architecture/${signal.userData.asset}-three-view.png`;
  signal.userData.collider = {
    type: "cylinder",
    radius: identity === "boss" ? 0.78 : 0.67,
    height: 0.16,
  };
  signal.userData.detailInventory = [
    "closed faceted stone annulus",
    `${identity === "boss" ? 8 : identity === "shrine" ? 6 : 4} raised node housings`,
    "narrow luminous metal insets",
    ...(identity === "boss" ? ["carved inner ring", "central boss sigil"] : []),
  ];
  signal.userData.sculptRuntime = {
    topology: "closed extruded annulus with separate emissive relief",
    drawCalls: 2,
    materialRoles: ["darkStone", "iron-emissive-inlay"],
  };
  return signal;
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
    const signal = createSpecialRoomSignal(identity, materials);
    const center = gridToWorld(dungeon, room.center, tileSize);
    signal.position.set(center.x, 0.064, center.z);
    signal.scale.setScalar(Math.min(1.25, Math.max(0.8, Math.min(room.width, room.height) / 5)));
    signal.userData.roomId = room.id;
    root.add(signal);
  }
  if (root.children.length === 0) return null;
  root.userData.materialReference = materials.darkStone.name;
  return root;
}
