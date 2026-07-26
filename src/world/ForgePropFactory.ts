import * as THREE from "three";

import type { ForgePropMetadata } from "../dungeon/types";
import { createDungeonProp } from "./DungeonPropKit";
import type { DungeonMaterials } from "./MaterialLibrary";
import { createImageSculptedProp, type ImageSculptedPropFamily } from "./ImageSculptedPropKit";

const IMAGE_SCULPTED_FAMILIES = new Set<ImageSculptedPropFamily>([
  "high-chair",
  "ritual-table",
  "wall-lantern",
  "ossuary-cabinet",
]);
const METRIC_PROP_FAMILIES = new Set([
  "table",
  "bench",
  "chair",
  "bookshelf",
  "crates",
  "barrels",
  "coffin",
  "sarco",
  "urns",
  "weapon-rack",
  "lectern",
  ...IMAGE_SCULPTED_FAMILIES,
]);

export function getForgePropScale(prop: ForgePropMetadata): number {
  const source = prop.scale ?? 1;
  // Allow adult dining furniture a bit larger than the old 1.12 ceiling.
  if (
    prop.kind === "table" ||
    prop.kind === "chair" ||
    prop.kind === "bench" ||
    prop.kind === "ritual-table"
  ) {
    return THREE.MathUtils.clamp(source, 0.95, 1.18);
  }
  if (METRIC_PROP_FAMILIES.has(prop.kind)) return THREE.MathUtils.clamp(source, 0.9, 1.12);
  if (prop.kind === "reliquary") return THREE.MathUtils.clamp(source, 0.74, 0.86);
  if (prop.kind === "pillar") return THREE.MathUtils.clamp(source, 0.78, 1.05);
  if (["debris", "bones", "roots", "moss", "crack"].includes(prop.kind))
    return THREE.MathUtils.clamp(source, 0.55, 1.3);
  return THREE.MathUtils.clamp(source, 0.72, 1.24);
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

export interface ForgeChestKit {
  root: THREE.Group;
  lid: THREE.Group;
}

export function createForgeChest(materials: DungeonMaterials): ForgeChestKit {
  const root = new THREE.Group();
  root.name = "Forge iron-bound treasure chest";
  const body = mesh(new THREE.BoxGeometry(1.25, 0.55, 0.72), materials.wood, "Chest oak body");
  body.position.y = 0.32;
  const lid = new THREE.Group();
  lid.name = "Chest lid hinge";
  lid.position.set(0, 0.58, -0.36);
  const lidShell = mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 1.25, 10, 1, false, 0, Math.PI),
    materials.wood,
    "Chest arched lid",
  );
  lidShell.rotation.z = Math.PI / 2;
  lidShell.position.z = 0.36;
  lid.add(lidShell);
  root.add(body, lid);
  for (const x of [-0.48, 0, 0.48]) {
    const bodyStrap = mesh(
      new THREE.BoxGeometry(0.075, 0.55, 0.77),
      materials.iron,
      "Chest body iron rib",
    );
    bodyStrap.position.set(x, 0.34, 0);
    const lidStrap = mesh(
      new THREE.BoxGeometry(0.075, 0.15, 0.76),
      materials.iron,
      "Chest lid iron rib",
    );
    lidStrap.position.set(x, 0.02, 0.36);
    root.add(bodyStrap);
    lid.add(lidStrap);
  }
  const lock = mesh(new THREE.BoxGeometry(0.22, 0.3, 0.1), materials.brass, "Chest lock");
  lock.position.set(0, 0.48, 0.4);
  root.add(lock);
  const hinge = mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.92, 7),
    materials.iron,
    "Chest rear hinge",
  );
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, 0.58, -0.39);
  root.add(hinge);
  return { root, lid };
}

function crystal(materials: DungeonMaterials, boss: boolean): THREE.Group {
  const root = new THREE.Group();
  root.name = boss ? "Forge boss crystal monument" : "Forge shrine crystal";
  const base = mesh(
    new THREE.CylinderGeometry(0.48, 0.62, 0.34, 8),
    materials.darkStone,
    "Crystal carved plinth",
  );
  base.position.y = 0.17;
  const core = mesh(
    new THREE.OctahedronGeometry(boss ? 0.68 : 0.48, 1),
    materials.crystal,
    "Faceted textured ritual crystal",
  );
  core.scale.y = boss ? 1.7 : 1.42;
  core.position.y = boss ? 1.25 : 0.92;
  root.add(base, core);
  for (let i = 0; i < (boss ? 5 : 3); i += 1) {
    const shard = mesh(
      new THREE.ConeGeometry(0.12, 0.72, 5),
      materials.crystal,
      "Crystal textured satellite shard",
    );
    const angle = (i / (boss ? 5 : 3)) * Math.PI * 2;
    shard.position.set(Math.cos(angle) * 0.56, 0.56, Math.sin(angle) * 0.56);
    shard.rotation.z = Math.cos(angle) * 0.35;
    root.add(shard);
  }
  return root;
}

function graveMarker(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Forge grave marker";
  const outline = new THREE.Shape();
  outline.moveTo(-0.39, 0);
  outline.lineTo(0.39, 0);
  outline.lineTo(0.39, 0.92);
  outline.quadraticCurveTo(0.37, 1.24, 0, 1.42);
  outline.quadraticCurveTo(-0.37, 1.24, -0.39, 0.92);
  outline.closePath();
  const slabGeometry = new THREE.ExtrudeGeometry(outline, {
    depth: 0.18,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.035,
    bevelThickness: 0.025,
  });
  slabGeometry.translate(0, 0.08, -0.09);
  const slab = mesh(slabGeometry, materials.darkStone, "Beveled arched grave slab");
  const plinth = mesh(
    new THREE.BoxGeometry(0.98, 0.16, 0.42),
    materials.stone,
    "Grave grounded stone plinth",
  );
  plinth.position.y = 0.08;
  const sigilLong = mesh(
    new THREE.BoxGeometry(0.095, 0.7, 0.045),
    materials.iron,
    "Grave iron long sigil",
  );
  sigilLong.position.set(0, 0.78, 0.11);
  const sigilCross = mesh(
    new THREE.BoxGeometry(0.42, 0.09, 0.05),
    materials.iron,
    "Grave iron cross sigil",
  );
  sigilCross.position.set(0, 0.88, 0.115);
  root.add(slab, plinth, sigilLong, sigilCross);
  return root;
}

function pillar(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Forge carved pillar";
  for (const [radius, height, y] of [
    [0.48, 0.24, 0.12],
    [0.34, 2.35, 1.41],
    [0.5, 0.3, 2.72],
  ] as const) {
    const part = mesh(
      new THREE.CylinderGeometry(radius, radius * 1.06, height, 8),
      materials.stone,
      "Octagonal pillar section",
    );
    part.position.y = y;
    root.add(part);
  }
  for (const y of [0.28, 2.54]) {
    const collar = mesh(
      new THREE.TorusGeometry(y < 1 ? 0.39 : 0.41, 0.055, 5, 12),
      materials.darkStone,
      "Pillar carved collar",
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.y = y;
    root.add(collar);
  }
  for (let side = 0; side < 8; side += 1) {
    const angle = (side / 8) * Math.PI * 2;
    const flute = mesh(
      new THREE.BoxGeometry(0.045, 1.86, 0.065),
      materials.darkStone,
      "Pillar recessed vertical flute",
    );
    flute.position.set(Math.sin(angle) * 0.335, 1.42, Math.cos(angle) * 0.335);
    flute.rotation.y = angle;
    root.add(flute);
  }
  return root;
}

function banner(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Forge wall banner";
  const rail = mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 1.25, 6),
    materials.iron,
    "Banner rail",
  );
  rail.rotation.z = Math.PI / 2;
  rail.position.y = 1.82;
  const cloth = mesh(new THREE.PlaneGeometry(1.05, 1.6), materials.cloth, "Torn heraldic banner");
  cloth.position.set(0, 1, 0.04);
  root.add(rail, cloth);
  return root;
}

function groundDetail(kind: string, materials: DungeonMaterials, variant = 0): THREE.Group {
  const root = new THREE.Group();
  root.name = `Forge ground detail ${kind}`;
  if (kind === "bones") {
    for (let i = 0; i < 5; i += 1) {
      const bone = mesh(
        new THREE.CylinderGeometry(0.035, 0.045, 0.52 + i * 0.04, 5),
        materials.bone,
        "Scattered bone",
      );
      bone.rotation.z = Math.PI / 2;
      bone.rotation.y = i * 1.19;
      bone.position.set(Math.cos(i * 2.1) * 0.28, 0.07, Math.sin(i * 1.7) * 0.25);
      root.add(bone);
    }
  } else if (kind === "roots") {
    for (let i = 0; i < 4; i += 1) {
      const rootMesh = mesh(
        new THREE.CylinderGeometry(0.025, 0.07, 1.3 - i * 0.16, 5),
        materials.wood,
        "Gnarled root",
      );
      rootMesh.rotation.z = Math.PI / 2;
      rootMesh.rotation.y = i * 0.7 - 1;
      rootMesh.position.y = 0.055;
      root.add(rootMesh);
    }
  } else if (kind === "moss" || kind === "crack") {
    const color = kind === "moss" ? 0x485343 : 0x202222;
    const detail = mesh(
      new THREE.CircleGeometry(0.65, 8),
      new THREE.MeshLambertMaterial({
        map: materials.darkStone.map,
        color,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
      `${kind} textured floor decal`,
    );
    detail.rotation.x = -Math.PI / 2;
    detail.position.y = 0.012;
    root.add(detail);
  } else {
    const count = 3 + Math.abs(variant % 3);
    for (let i = 0; i < count; i += 1) {
      const radius = 0.12 + ((i + variant) % 4) * 0.045;
      const rock = mesh(
        new THREE.DodecahedronGeometry(radius, 0),
        materials.darkStone,
        `Forge stone debris variant ${variant % 3}`,
      );
      rock.scale.set(
        1 + (i % 2) * 0.35,
        0.55 + ((i + variant) % 3) * 0.16,
        0.82 + ((i * 2 + variant) % 3) * 0.2,
      );
      rock.rotation.set((i + variant) * 0.31, i * 1.17, variant * 0.23);
      rock.position.set(
        Math.cos(i * 2.4 + variant) * (0.3 + radius),
        radius * rock.scale.y,
        Math.sin(i * 2.4 + variant) * (0.28 + radius),
      );
      root.add(rock);
    }
  }
  return root;
}

export function createForgeProp(
  prop: ForgePropMetadata,
  materials: DungeonMaterials,
): THREE.Group | null {
  if (prop.kind === "brazier" || prop.kind === "candle" || prop.kind === "campfire") return null;
  if (prop.kind === "chest") return createForgeChest(materials).root;
  if (prop.kind === "bossCrystal" || prop.kind === "shrineCrystal")
    return crystal(materials, prop.kind === "bossCrystal");
  if (prop.kind === "pillar") return pillar(materials);
  if (prop.kind === "grave") return graveMarker(materials);
  if (IMAGE_SCULPTED_FAMILIES.has(prop.kind as ImageSculptedPropFamily))
    return createImageSculptedProp(prop.kind as ImageSculptedPropFamily, materials);
  if (prop.kind === "sarco") return createDungeonProp("coffin", materials, prop.v);
  if (
    [
      "table",
      "bench",
      "chair",
      "bookshelf",
      "crates",
      "barrels",
      "coffin",
      "urns",
      "weapon-rack",
      "lectern",
      "reliquary",
    ].includes(prop.kind)
  ) {
    return createDungeonProp(
      prop.kind as Parameters<typeof createDungeonProp>[0],
      materials,
      prop.v,
    );
  }
  if (prop.kind === "banner") return banner(materials);
  if (prop.kind === "ring") {
    const root = new THREE.Group();
    root.name = "Forge entrance ring";
    const ring = mesh(
      new THREE.TorusGeometry(0.75, 0.07, 6, 16),
      materials.iron,
      "Entrance floor ring",
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    root.add(ring);
    return root;
  }
  if (prop.kind === "icicle" || prop.kind === "shardIce") {
    const root = new THREE.Group();
    root.name = `Forge ${prop.kind}`;
    const shard = mesh(
      new THREE.ConeGeometry(
        prop.kind === "icicle" ? 0.16 : 0.25,
        prop.kind === "icicle" ? 1.25 : 0.82,
        5,
      ),
      materials.ice,
      "Faceted textured ice shard",
    );
    shard.position.y = prop.kind === "icicle" ? 3.75 : 0.42;
    if (prop.kind === "icicle") shard.rotation.z = Math.PI;
    root.add(shard);
    return root;
  }
  if (["bones", "roots", "moss", "crack", "debris"].includes(prop.kind))
    return groundDetail(prop.kind, materials, prop.v);
  return createDungeonProp(prop.kind === "shrine" ? "lectern" : "urns", materials, prop.v);
}
