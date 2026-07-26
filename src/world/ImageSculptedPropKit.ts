import * as THREE from "three";

import type { DungeonMaterials } from "./MaterialLibrary";

export type ImageSculptedPropFamily =
  | "high-chair"
  | "ritual-table"
  | "wall-lantern"
  | "ossuary-cabinet";

const SOURCE_IMAGE = "/assets/concepts/dungeon-prop-kit-v1.png";

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

function finish(
  root: THREE.Group,
  family: ImageSculptedPropFamily,
  collider: THREE.Vector3,
): THREE.Group {
  root.userData.sculptRuntime = {
    sourceImage: SOURCE_IMAGE,
    family,
    units: "meters",
    collider: { type: "box", size: collider.toArray(), offset: [0, collider.y / 2, 0] },
    lod: { near: 0, mid: 18, far: 34 },
  };
  return root;
}

function socket(name: string, type: string, position: THREE.Vector3Like): THREE.Group {
  const node = new THREE.Group();
  node.name = name;
  node.position.set(position.x, position.y, position.z);
  node.userData.socket = { type };
  return node;
}

function rivets(
  parent: THREE.Object3D,
  material: THREE.Material,
  positions: readonly THREE.Vector3Like[],
  name: string,
): void {
  const system = new THREE.Group();
  system.name = name;
  const geometry = new THREE.SphereGeometry(0.028, 5, 4);
  positions.forEach((position) => {
    const rivet = mesh(geometry, material, "Image-sculpted iron rivet");
    rivet.position.set(position.x, position.y, position.z);
    system.add(rivet);
  });
  parent.add(system);
}

function highChair(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted iron-bound high chair";
  const seat = mesh(new THREE.BoxGeometry(0.72, 0.12, 0.62), materials.wood, "High chair oak seat");
  seat.position.set(0, 0.68, 0);
  const back = mesh(
    new THREE.BoxGeometry(0.64, 0.92, 0.12),
    materials.wood,
    "High chair tall oak back",
  );
  back.position.set(0, 1.18, -0.25);
  root.add(seat, back);
  for (const x of [-0.31, 0.31]) {
    const rear = mesh(
      new THREE.CylinderGeometry(0.055, 0.065, 1.65, 6),
      materials.wood,
      "High chair rear carved post",
    );
    rear.position.set(x, 0.825, -0.28);
    const front = mesh(
      new THREE.CylinderGeometry(0.045, 0.055, 0.68, 6),
      materials.wood,
      "High chair front leg",
    );
    front.position.set(x, 0.34, 0.23);
    const arm = mesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.58),
      materials.wood,
      "High chair arm rest",
    );
    arm.position.set(x, 0.94, 0.01);
    const finial = mesh(
      new THREE.ConeGeometry(0.095, 0.18, 6),
      materials.brass,
      "High chair post finial",
    );
    finial.position.set(x, 1.72, -0.28);
    root.add(rear, front, arm, finial);
  }
  for (const y of [0.89, 1.35]) {
    const band = mesh(
      new THREE.BoxGeometry(0.7, 0.065, 0.15),
      materials.iron,
      "High chair iron back band",
    );
    band.position.set(0, y, -0.245);
    root.add(band);
  }
  rivets(
    root,
    materials.brass,
    [-0.27, 0.27].flatMap((x) => [0.89, 1.35].map((y) => ({ x, y, z: -0.16 }))),
    "High chair rivet repetition system",
  );
  root.add(socket("High chair seat socket", "seated-actor", { x: 0, y: 0.78, z: 0.02 }));
  return finish(root, "high-chair", new THREE.Vector3(0.82, 1.82, 0.76));
}

function ritualTable(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted ritual writing table";
  // ~18% larger so the writing table holds weight next to player height.
  const top = mesh(
    new THREE.BoxGeometry(1.92, 0.15, 0.98),
    materials.wood,
    "Ritual table scarred oak top",
  );
  top.position.y = 0.88;
  root.add(top);
  for (const x of [-0.68, 0.68]) {
    const leg = mesh(
      new THREE.BoxGeometry(0.18, 0.82, 0.72),
      materials.wood,
      "Ritual table trestle",
    );
    leg.position.set(x, 0.42, 0);
    const foot = mesh(
      new THREE.BoxGeometry(0.48, 0.12, 0.98),
      materials.iron,
      "Ritual table trestle foot",
    );
    foot.position.set(x, 0.08, 0);
    root.add(leg, foot);
  }
  const brace = mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 1.38, 6),
    materials.iron,
    "Ritual table cross brace",
  );
  brace.rotation.z = Math.PI / 2;
  brace.position.y = 0.41;
  root.add(brace);
  for (const x of [-0.56, 0, 0.56]) {
    const ring = mesh(
      new THREE.TorusGeometry(0.1, 0.024, 5, 10),
      materials.brass,
      "Ritual table hanging iron ring",
    );
    ring.position.set(x, 0.72, 0.5);
    root.add(ring);
  }
  const parchment = mesh(
    new THREE.PlaneGeometry(0.72, 0.48),
    materials.bone,
    "Ritual table parchment",
  );
  parchment.rotation.x = -Math.PI / 2;
  parchment.rotation.z = -0.12;
  parchment.position.set(0.18, 0.96, 0.02);
  root.add(parchment);
  root.add(socket("Ritual table candle socket left", "candle", { x: -0.68, y: 0.98, z: -0.26 }));
  root.add(socket("Ritual table candle socket right", "candle", { x: 0.68, y: 0.98, z: -0.26 }));
  return finish(root, "ritual-table", new THREE.Vector3(2.02, 1.0, 1.06));
}

function wallLantern(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted wall oil lantern";
  const plate = mesh(
    new THREE.BoxGeometry(0.42, 0.7, 0.08),
    materials.iron,
    "Lantern hammered wall plate",
  );
  plate.position.set(0, 0.68, 0);
  const bracket = mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.42),
    materials.iron,
    "Lantern projecting bracket",
  );
  bracket.position.set(0, 0.72, 0.24);
  const reservoir = mesh(
    new THREE.CylinderGeometry(0.18, 0.23, 0.24, 8),
    materials.brass,
    "Lantern oil reservoir",
  );
  reservoir.position.set(0, 0.44, 0.43);
  root.add(plate, bracket, reservoir);
  const cage = new THREE.Group();
  cage.name = "Lantern cage body";
  cage.position.z = 0.43;
  for (const y of [0.58, 1.08]) {
    const ring = mesh(
      new THREE.TorusGeometry(0.2, 0.028, 5, 12),
      materials.iron,
      "Lantern cage ring",
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    cage.add(ring);
  }
  for (const x of [-0.16, 0.16]) {
    const bar = mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.5, 5),
      materials.iron,
      "Lantern cage bar",
    );
    bar.position.set(x, 0.83, 0);
    cage.add(bar);
  }
  const doorPivot = new THREE.Group();
  doorPivot.name = "Lantern cage door hinge";
  doorPivot.position.set(-0.2, 0.83, 0.02);
  doorPivot.userData.socket = { type: "hinge", axis: [0, 1, 0], range: [0, 1.7] };
  const door = mesh(
    new THREE.BoxGeometry(0.4, 0.5, 0.025),
    materials.iron,
    "Lantern hinged cage door",
  );
  door.position.x = 0.2;
  doorPivot.add(door);
  cage.add(doorPivot);
  root.add(cage, socket("Lantern flame socket", "flame", { x: 0, y: 0.73, z: 0.43 }));
  rivets(
    root,
    materials.brass,
    [-0.14, 0.14].flatMap((x) => [0.42, 0.94].map((y) => ({ x, y, z: 0.055 }))),
    "Lantern plate rivet repetition system",
  );
  return finish(root, "wall-lantern", new THREE.Vector3(0.52, 1.14, 0.7));
}

function ossuaryCabinet(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted ossuary cabinet";
  const base = mesh(
    new THREE.BoxGeometry(1.14, 0.2, 0.52),
    materials.stone,
    "Ossuary chipped stone base",
  );
  base.position.y = 0.1;
  const body = mesh(
    new THREE.BoxGeometry(1.02, 1.36, 0.42),
    materials.wood,
    "Ossuary oak cabinet body",
  );
  body.position.y = 0.88;
  root.add(base, body);
  for (let column = 0; column < 3; column += 1) {
    const niche = mesh(
      new THREE.BoxGeometry(0.26, 0.34, 0.08),
      materials.darkStone,
      "Ossuary recessed bone niche",
    );
    niche.position.set((column - 1) * 0.3, 1.28, 0.25);
    const skull = mesh(new THREE.SphereGeometry(0.09, 7, 5), materials.bone, "Ossuary niche skull");
    skull.scale.y = 0.82;
    skull.position.set((column - 1) * 0.3, 1.28, 0.31);
    root.add(niche, skull);
  }
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? "Ossuary left door hinge" : "Ossuary right door hinge";
    pivot.position.set(side * 0.49, 0.66, 0.24);
    pivot.userData.socket = {
      type: "hinge",
      axis: [0, 1, 0],
      range: side < 0 ? [0, 1.7] : [-1.7, 0],
    };
    const leaf = mesh(
      new THREE.BoxGeometry(0.46, 0.72, 0.065),
      materials.wood,
      "Ossuary iron-bound lower door",
    );
    leaf.position.x = -side * 0.23;
    pivot.add(leaf);
    const strap = mesh(
      new THREE.BoxGeometry(0.42, 0.06, 0.085),
      materials.iron,
      "Ossuary door iron strap",
    );
    strap.position.set(-side * 0.23, 0.14, 0.01);
    pivot.add(strap);
    root.add(pivot);
  }
  const crown = mesh(
    new THREE.ConeGeometry(0.62, 0.3, 4),
    materials.darkStone,
    "Ossuary pointed stone crown",
  );
  crown.rotation.y = Math.PI / 4;
  crown.scale.z = 0.44;
  crown.position.y = 1.72;
  root.add(crown, socket("Ossuary offering socket", "ritual-item", { x: 0, y: 0.34, z: 0.3 }));
  return finish(root, "ossuary-cabinet", new THREE.Vector3(1.18, 1.88, 0.62));
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
