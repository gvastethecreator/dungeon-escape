import * as THREE from "three";

import type { DungeonMaterials } from "./MaterialLibrary";

export type ImageSculptedClutterFamily = "barrels" | "crates" | "urns" | "weapon-rack";

const SOURCE_IMAGE = "/assets/concepts/dungeon-clutter-kit-v1.png";

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

function box(
  size: readonly [number, number, number],
  material: THREE.Material,
  name: string,
): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(...size), material, name);
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

function finish(root: THREE.Group, family: ImageSculptedClutterFamily): THREE.Group {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  root.userData.propFamily = family;
  root.userData.sculptRuntime = {
    sourceImage: SOURCE_IMAGE,
    specification: ".scratch/img2threejs/dungeon-clutter-kit/spec.json",
    family,
    units: "meters",
    collider: { type: "box", size: size.toArray(), offset: center.toArray() },
    lod: { near: 0, mid: 16, far: 30 },
  };
  return root;
}

function barrel(materials: DungeonMaterials, index: number): THREE.Group {
  const root = new THREE.Group();
  root.name = `Image-sculpted iron-bound barrel ${index + 1}`;
  const profile = [
    new THREE.Vector2(0.29, 0),
    new THREE.Vector2(0.33, 0.06),
    new THREE.Vector2(0.37, 0.24),
    new THREE.Vector2(0.385, 0.46),
    new THREE.Vector2(0.37, 0.68),
    new THREE.Vector2(0.33, 0.86),
    new THREE.Vector2(0.29, 0.92),
  ];
  const body = mesh(new THREE.LatheGeometry(profile, 12), materials.wood, "Barrel bulged oak body");
  root.add(body);

  const staveSystem = new THREE.Group();
  staveSystem.name = "Barrel stave repetition system";
  const staveGeometry = new THREE.BoxGeometry(0.145, 0.78, 0.026);
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const stave = mesh(staveGeometry, materials.wood, "Barrel raised oak stave");
    stave.position.set(Math.sin(angle) * 0.372, 0.46, Math.cos(angle) * 0.372);
    stave.rotation.y = angle;
    staveSystem.add(stave);
  }
  root.add(staveSystem);

  const hoopSystem = new THREE.Group();
  hoopSystem.name = "Barrel iron hoop repetition system";
  for (const y of [0.13, 0.46, 0.79]) {
    const hoop = mesh(
      new THREE.TorusGeometry(0.375, 0.027, 5, 16),
      materials.iron,
      "Barrel projecting iron hoop",
    );
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = y;
    hoopSystem.add(hoop);
  }
  root.add(hoopSystem);

  const rivetSystem = new THREE.Group();
  rivetSystem.name = "Barrel rivet repetition system";
  const rivetGeometry = new THREE.SphereGeometry(0.025, 5, 4);
  for (const y of [0.13, 0.46, 0.79]) {
    for (const x of [-0.22, 0.22]) {
      const rivet = mesh(rivetGeometry, materials.brass, "Barrel hoop rivet");
      rivet.position.set(x, y, 0.323);
      rivetSystem.add(rivet);
    }
  }
  root.add(rivetSystem);

  for (const y of [0.015, 0.905]) {
    const head = mesh(
      new THREE.CylinderGeometry(0.292, 0.292, 0.03, 12),
      materials.wood,
      "Barrel recessed end cap",
    );
    head.position.y = y;
    root.add(head);
  }
  const bung = mesh(
    new THREE.CylinderGeometry(0.052, 0.045, 0.035, 8),
    materials.brass,
    "Barrel recessed bung",
  );
  bung.rotation.x = Math.PI / 2;
  bung.position.set(0.09, 0.55, 0.382);
  root.add(bung, socket("Barrel bung socket", "pour", [0.09, 0.55, 0.405]));
  return root;
}

function crateBrace(
  material: THREE.Material,
  name: string,
  z: number,
  direction: number,
): THREE.Mesh {
  const brace = box([0.9, 0.085, 0.045], material, name);
  brace.position.set(0, 0.4, z);
  brace.rotation.z = direction * 0.66;
  return brace;
}

function crate(materials: DungeonMaterials, index: number): THREE.Group {
  const root = new THREE.Group();
  root.name = `Image-sculpted broken iron-bound crate ${index + 1}`;
  const brokenCorner = index % 2 === 0;
  const plankSystem = new THREE.Group();
  plankSystem.name = "Crate plank repetition system";
  for (let row = 0; row < 5; row += 1) {
    const y = 0.1 + row * 0.15;
    const shortened = brokenCorner && row >= 3;
    for (const z of [-0.39, 0.39]) {
      const plank = box(
        [shortened ? 0.64 : 0.82, 0.13, 0.055],
        materials.wood,
        shortened ? "Crate jagged broken plank" : "Crate oak plank",
      );
      plank.position.set(shortened ? -0.09 : 0, y, z);
      plankSystem.add(plank);
    }
  }
  for (const x of [-0.43, 0.43]) {
    for (let row = 0; row < 5; row += 1) {
      const side = box([0.055, 0.13, 0.72], materials.wood, "Crate side oak plank");
      side.position.set(x, 0.1 + row * 0.15, 0);
      plankSystem.add(side);
    }
  }
  root.add(plankSystem);

  const frame = new THREE.Group();
  frame.name = "Crate rail and diagonal brace system";
  for (const x of [-0.43, 0.43])
    for (const z of [-0.42, 0.42]) {
      const rail = box([0.085, 0.78, 0.085], materials.iron, "Crate iron corner rail");
      rail.position.set(x, 0.39, z);
      frame.add(rail);
    }
  for (const y of [0.05, 0.73]) {
    for (const z of [-0.42, 0.42]) {
      const rail = box([0.94, 0.08, 0.085], materials.iron, "Crate horizontal iron rail");
      rail.position.set(0, y, z);
      frame.add(rail);
    }
  }
  frame.add(crateBrace(materials.wood, "Crate front diagonal oak brace", 0.452, 1));
  frame.add(crateBrace(materials.wood, "Crate rear diagonal oak brace", -0.452, -1));
  root.add(frame);

  const nails = new THREE.Group();
  nails.name = "Crate nail repetition system";
  const nailGeometry = new THREE.SphereGeometry(0.026, 5, 4);
  for (const z of [-0.5, 0.5])
    for (const x of [-0.34, 0.34])
      for (const y of [0.1, 0.67]) {
        const nail = mesh(nailGeometry, materials.brass, "Crate iron nail head");
        nail.position.set(x, y, z);
        nails.add(nail);
      }
  root.add(nails);
  if (brokenCorner) root.add(socket("Crate broken corner socket", "debris", [0.36, 0.7, 0.43]));
  return root;
}

function urn(materials: DungeonMaterials, index: number): THREE.Group {
  const root = new THREE.Group();
  root.name = `Image-sculpted funerary urn ${index + 1}`;
  const profile = [
    new THREE.Vector2(0.16, 0),
    new THREE.Vector2(0.24, 0.06),
    new THREE.Vector2(0.3, 0.26),
    new THREE.Vector2(0.31, 0.48),
    new THREE.Vector2(0.27, 0.67),
    new THREE.Vector2(0.16, 0.79),
    new THREE.Vector2(0.13, 0.9),
    new THREE.Vector2(0.18, 0.94),
  ];
  root.add(
    mesh(new THREE.LatheGeometry(profile, 12), materials.ceramic, "Urn ash-glazed lathed body"),
  );
  for (const y of [0.11, 0.66, 0.88]) {
    const band = mesh(
      new THREE.TorusGeometry(y === 0.66 ? 0.275 : 0.17, 0.018, 5, 14),
      materials.brass,
      "Urn dull brass collar band",
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    root.add(band);
  }
  const lidPivot = new THREE.Group();
  lidPivot.name = "Urn removable lid pivot";
  lidPivot.position.set(0, 0.93, -0.12);
  lidPivot.userData.socket = { type: "hinge", axis: [1, 0, 0], range: [0, 1.9], detachable: true };
  const lidProfile = [
    new THREE.Vector2(0.17, 0),
    new THREE.Vector2(0.23, 0.045),
    new THREE.Vector2(0.14, 0.12),
    new THREE.Vector2(0.04, 0.18),
  ];
  const lid = mesh(
    new THREE.LatheGeometry(lidProfile, 12),
    materials.ceramic,
    "Urn stepped ceramic lid",
  );
  lid.position.z = 0.12;
  lidPivot.add(lid);
  root.add(lidPivot);

  const handles = new THREE.Group();
  handles.name = "Urn brass ring handle system";
  for (const side of [-1, 1]) {
    const ring = mesh(
      new THREE.TorusGeometry(0.13, 0.018, 5, 12),
      materials.brass,
      "Urn attached brass ring handle",
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.set(side * 0.31, 0.61, 0);
    handles.add(ring);
    const stud = mesh(
      new THREE.SphereGeometry(0.045, 6, 5),
      materials.brass,
      "Urn ring shoulder stud",
    );
    stud.position.set(side * 0.292, 0.71, 0);
    handles.add(stud);
  }
  root.add(handles, socket("Urn offering socket", "ritual-item", [0, 1.14, 0]));
  return root;
}

function weaponShaft(materials: DungeonMaterials, name: string, length: number): THREE.Group {
  const root = new THREE.Group();
  root.name = name;
  root.userData.socket = { type: "detachable-weapon", grip: [0, length * 0.42, 0] };
  const shaft = mesh(
    new THREE.CylinderGeometry(0.025, 0.03, length, 6),
    materials.wood,
    `${name} oak shaft`,
  );
  shaft.position.y = length / 2;
  root.add(shaft);
  return root;
}

function spear(materials: DungeonMaterials, index: number): THREE.Group {
  const length = 1.72 + index * 0.12;
  const root = weaponShaft(materials, `Rack spear ${index + 1}`, length);
  const head = mesh(new THREE.ConeGeometry(0.09, 0.3, 4), materials.iron, "Rack spear forged head");
  head.position.y = length + 0.14;
  root.add(head);
  return root;
}

function axe(materials: DungeonMaterials): THREE.Group {
  const root = weaponShaft(materials, "Rack hand axe", 1.35);
  const shape = new THREE.Shape();
  shape.moveTo(-0.02, -0.18);
  shape.lineTo(0.23, -0.14);
  shape.lineTo(0.3, 0.02);
  shape.lineTo(0.2, 0.19);
  shape.lineTo(-0.02, 0.14);
  shape.closePath();
  const blade = mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: 0.045,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.01,
      bevelSegments: 1,
    }),
    materials.iron,
    "Rack axe forged blade",
  );
  blade.position.set(0, 1.27, -0.022);
  root.add(blade);
  return root;
}

function sword(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Rack short sword";
  root.userData.socket = { type: "detachable-weapon", grip: [0, 0.3, 0] };
  const grip = mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6),
    materials.wood,
    "Rack sword leather grip",
  );
  grip.position.y = 0.23;
  const guard = box([0.34, 0.045, 0.065], materials.brass, "Rack sword crossguard");
  guard.position.y = 0.4;
  const blade = box([0.09, 0.92, 0.025], materials.iron, "Rack sword forged blade");
  blade.position.y = 0.88;
  const tip = mesh(new THREE.ConeGeometry(0.065, 0.2, 4), materials.iron, "Rack sword point");
  tip.position.y = 1.44;
  root.add(grip, guard, blade, tip);
  return root;
}

function weaponRack(materials: DungeonMaterials, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = `Image-sculpted stocked weapon rack ${variant + 1}`;
  for (const x of [-0.68, 0.68]) {
    const post = box([0.12, 1.38, 0.14], materials.wood, "Rack oak upright");
    post.position.set(x, 0.74, 0);
    const foot = box([0.54, 0.12, 0.58], materials.wood, "Rack splayed foot");
    foot.position.set(x, 0.06, 0);
    foot.rotation.y = x * 0.18;
    root.add(post, foot);
  }
  for (const y of [0.32, 1.18]) {
    const rail = box([1.52, 0.13, 0.16], materials.wood, "Rack horizontal oak rail");
    rail.position.set(0, y, 0);
    root.add(rail);
  }
  const braceLeft = box([0.92, 0.075, 0.11], materials.iron, "Rack left diagonal iron brace");
  braceLeft.position.set(-0.34, 0.68, -0.02);
  braceLeft.rotation.z = 0.9;
  const braceRight = braceLeft.clone();
  braceRight.name = "Rack right diagonal iron brace";
  braceRight.position.x = 0.34;
  braceRight.rotation.z = -0.9;
  root.add(braceLeft, braceRight);

  const weapons = [spear(materials, 0), axe(materials), sword(materials), spear(materials, 1)];
  const xs = [-0.52, -0.17, 0.2, 0.53];
  weapons.forEach((weapon, index) => {
    weapon.position.set(xs[index]!, 0.14, 0.13);
    weapon.rotation.z = [-0.08, 0.06, -0.04, 0.09][(index + variant) % 4]!;
    root.add(weapon);
    const peg = mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6),
      materials.brass,
      "Rack weapon retaining peg",
    );
    peg.rotation.x = Math.PI / 2;
    peg.position.set(xs[index]!, 1.18, 0.12);
    root.add(peg, socket(`Weapon rack slot ${index + 1}`, "weapon", [xs[index]!, 1.18, 0.18]));
  });
  return root;
}

export function createImageSculptedClutter(
  family: ImageSculptedClutterFamily,
  materials: DungeonMaterials,
  variant = 0,
): THREE.Group {
  const v = Math.abs(Math.trunc(variant)) % 3;
  const root = new THREE.Group();
  root.name = `Image-sculpted dungeon clutter ${family} variant ${v + 1}`;
  if (family === "weapon-rack") {
    root.add(weaponRack(materials, v));
    return finish(root, family);
  }
  const layouts: ReadonlyArray<ReadonlyArray<readonly [number, number]>> =
    family === "barrels"
      ? [
          [
            [-0.4, 1],
            [0.4, 0.94],
          ],
          [[0, 1.08]],
          [
            [-0.76, 0.92],
            [0, 1.03],
            [0.76, 0.88],
          ],
        ]
      : family === "crates"
        ? [
            [
              [-0.48, 0.86],
              [0.45, 1],
            ],
            [
              [-0.28, 1],
              [0.42, 0.82],
            ],
            [
              [-0.48, 0.82],
              [0.36, 0.94],
            ],
          ]
        : [
            [
              [-0.42, 0.82],
              [0, 1.02],
              [0.42, 0.76],
            ],
            [
              [-0.3, 1.08],
              [0.34, 0.88],
            ],
            [[0, 1.18]],
          ];
  for (const [index, [x, scale]] of layouts[v]!.entries()) {
    const prop =
      family === "barrels"
        ? barrel(materials, index)
        : family === "crates"
          ? crate(materials, index + v)
          : urn(materials, index);
    prop.position.x = x;
    prop.scale.setScalar(scale);
    root.add(prop);
  }
  return finish(root, family);
}
