import * as THREE from "three";

import type { DungeonMaterials } from "./MaterialLibrary";

function box(
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
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

/** Procedural reconstruction of the generated reliquary reference. */
export function createReliquaryAltar(materials: DungeonMaterials): THREE.Group {
  const root = pivot("Reliquary altar action root", [0, 0, 0]);
  root.userData.asset = "reliquary-altar";
  root.userData.source = "/assets/concepts/reliquary-altar-reference.png";
  root.userData.collider = { type: "box", size: [1.85, 2.95, 0.74], center: [0, 1.48, 0] };
  root.userData.qualityContract = "proof/img2threejs/reliquary-altar/sculpt-spec.json";

  const plinth = pivot("Stone plinth pivot", [0, 0, 0]);
  plinth.add(
    box("Broad chipped plinth", [2.08, 0.18, 0.9], [0, 0.09, 0], materials.darkStone),
    box("Stepped stone base", [1.82, 0.18, 0.78], [0, 0.25, 0], materials.stone),
  );

  const cabinet = pivot("Oak cabinet pivot", [0, 0.34, 0]);
  cabinet.add(box("Reliquary oak carcass", [1.62, 1.34, 0.64], [0, 0.73, 0], materials.wood));
  for (const x of [-0.72, 0.72])
    cabinet.add(box("Iron corner strap", [0.11, 1.3, 0.7], [x, 0.73, 0], materials.iron));
  for (const y of [0.18, 1.28])
    cabinet.add(box("Iron cross strap", [1.52, 0.09, 0.7], [0, y, 0], materials.iron));

  for (const side of [-1, 1]) {
    const door = pivot(`${side < 0 ? "Left" : "Right"} reliquary door hinge`, [
      side * 0.78,
      0.76,
      0.34,
    ]);
    door.userData.socket = {
      type: "hinge",
      axis: [0, 1, 0],
      limit: side < 0 ? [-1.2, 0.05] : [-0.05, 1.2],
    };
    door.userData.collider = { type: "box", size: [0.72, 1.02, 0.08] };
    door.add(box("Recessed oak door", [0.7, 1.02, 0.08], [-side * 0.35, 0, 0], materials.wood));
    for (const y of [-0.39, 0.39])
      door.add(
        box("Door iron strap", [0.68, 0.07, 0.105], [-side * 0.35, y, 0.045], materials.iron),
      );
    door.add(box("Door iron stile", [0.07, 0.98, 0.105], [-side * 0.68, 0, 0.045], materials.iron));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 12), materials.brass);
    ring.name = "Door pull ring";
    ring.position.set(-side * 0.13, 0, 0.065);
    door.add(ring);
    cabinet.add(door);
  }

  const shrine = pivot("Peaked shrine back pivot", [0, 1.62, -0.04]);
  shrine.add(
    box("Shrine upright", [1.52, 0.82, 0.38], [0, 0.4, 0], materials.darkStone),
    box("Stone altar ledge", [1.88, 0.2, 0.82], [0, 0.05, 0.08], materials.stone),
  );
  shrine.add(box("Shadowed saint niche", [0.56, 0.62, 0.05], [0, 0.49, 0.205], materials.iron));
  for (const x of [-0.39, 0.39])
    shrine.add(box("Niche stone upright", [0.12, 0.62, 0.18], [x, 0.47, 0.22], materials.stone));
  for (const side of [-1, 1]) {
    const archBeam = box(
      "Pointed niche arch beam",
      [0.58, 0.12, 0.18],
      [side * 0.2, 0.83, 0.22],
      materials.stone,
    );
    archBeam.rotation.z = side * 0.58;
    shrine.add(archBeam);
  }
  for (const x of [-0.68, 0.68])
    shrine.add(box("Shrine side pilaster", [0.18, 0.84, 0.42], [x, 0.42, 0], materials.stone));

  const pediment = pivot("Stone pediment pivot", [0, 2.5, -0.04]);
  pediment.add(box("Pediment lintel", [1.72, 0.18, 0.48], [0, 0, 0], materials.stone));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 0.62, 4), materials.darkStone);
  roof.name = "Peaked reliquary crown";
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.48;
  roof.position.y = 0.35;
  roof.castShadow = true;
  pediment.add(roof);
  for (const x of [-0.82, 0, 0.82]) {
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 4), materials.iron);
    finial.name = "Reliquary iron finial";
    finial.position.set(x, x === 0 ? 0.78 : 0.26, 0.05);
    pediment.add(finial);
  }

  const cornerBlocks = pivot("Cabinet corner block system", [0, 0, 0]);
  for (const x of [-0.87, 0.87])
    for (const y of [0.45, 1.45])
      cornerBlocks.add(box("Iron corner boss", [0.22, 0.22, 0.74], [x, y, 0], materials.iron));

  const candleSockets = pivot("Candle socket rail", [0, 2.55, 0.28]);
  for (const x of [-0.62, 0.62]) {
    const socket = pivot(`Candle socket ${x < 0 ? "left" : "right"}`, [x, 0, 0]);
    socket.userData.socket = { type: "prop", accepts: "candle", localPosition: [0, 0.1, 0] };
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.12, 8), materials.iron);
    socket.add(cup);
    candleSockets.add(socket);
  }

  const rivetGeometry = new THREE.SphereGeometry(0.035, 6, 4);
  const rivets = pivot("Iron rivet repetition system", [0, 0, 0]);
  for (const x of [-0.72, 0.72])
    for (const y of [0.57, 1.1, 1.55]) {
      const rivet = new THREE.Mesh(rivetGeometry, materials.iron);
      rivet.position.set(x, y, 0.39);
      rivets.add(rivet);
    }

  root.add(plinth, cabinet, shrine, pediment, candleSockets, cornerBlocks, rivets);
  return root;
}
