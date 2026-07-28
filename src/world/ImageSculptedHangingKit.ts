import * as THREE from "three";

import type { DungeonMaterials } from "./MaterialLibrary";

/**
 * Image-sculpted ceiling hangers (img2threejs hanging-ceiling-kit).
 * Group origin is the ceiling mount; geometry descends on -Y.
 * Shared {@link DungeonMaterials} only so atmosphere InstancedMesh batches stay cheap.
 */
export type ImageSculptedHangingFamily =
  | "iron-cage"
  | "oil-lantern"
  | "tattered-banner"
  | "meat-hooks"
  | "bone-mobile"
  | "root-cluster";

export const IMAGE_SCULPTED_HANGING_FAMILIES: readonly ImageSculptedHangingFamily[] = [
  "iron-cage",
  "oil-lantern",
  "tattered-banner",
  "meat-hooks",
  "bone-mobile",
  "root-cluster",
] as const;

const SOURCE_IMAGE = "/assets/concepts/hanging-ceiling-kit-v1.jpg";
const SOURCE_SPEC = ".scratch/img2threejs/hanging-ceiling-kit/assessment.json";

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
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

function finish(
  root: THREE.Group,
  family: ImageSculptedHangingFamily,
  length: number,
): THREE.Group {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  root.userData.propFamily = family;
  root.userData.sculptRuntime = {
    sourceImage: SOURCE_IMAGE,
    specification: SOURCE_SPEC,
    family,
    units: "meters",
    hangLength: length,
    origin: "ceiling-mount",
    collider: { type: "box", size: size.toArray(), offset: center.toArray() },
    lod: { near: 0, mid: 14, far: 28 },
  };
  return root;
}

/** Short chain suspender shared by cage/lantern. Ends at negative Y. */
function chainSuspender(
  materials: DungeonMaterials,
  length: number,
  variant: number,
): { group: THREE.Group; tipY: number } {
  const group = new THREE.Group();
  group.name = "Hanging chain suspender";
  const mount = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.045, 8), materials.iron, "Ceiling mount plate");
  mount.position.y = -0.022;
  group.add(mount);
  const eye = mesh(new THREE.TorusGeometry(0.06, 0.016, 5, 10), materials.iron, "Ceiling mount eye");
  eye.position.y = -0.1;
  group.add(eye);

  const spacing = 0.17;
  const linkCount = Math.max(2, Math.ceil(length / spacing));
  const linkGeometry = new THREE.TorusGeometry(0.055, 0.014, 5, 9);
  linkGeometry.scale(1, 1.28, 1);
  const lean = ((variant % 3) - 1) * 0.03;
  for (let i = 0; i < linkCount; i += 1) {
    const link = mesh(linkGeometry, materials.iron, "Suspender chain link");
    link.rotation.y = (i % 2) * (Math.PI / 2);
    const t = i / Math.max(1, linkCount - 1);
    link.position.set(lean * t * t, -0.18 - i * spacing, lean * 0.6 * t * t);
    group.add(link);
  }
  const tipY = -0.18 - (linkCount - 1) * spacing - 0.05;
  group.add(socket("Suspender tip socket", "hang-load", [lean, tipY, lean * 0.6]));
  return { group, tipY };
}

function ironCage(materials: DungeonMaterials, length: number, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted hanging iron cage";
  const suspendLength = Math.max(0.35, length * 0.28);
  const { group: chain, tipY } = chainSuspender(materials, suspendLength, variant);
  root.add(chain);

  const cage = new THREE.Group();
  cage.name = "Iron cage body";
  cage.position.y = tipY - 0.08;
  const cageH = Math.max(0.7, length * 0.42);
  const radius = 0.28 + (variant % 3) * 0.03;

  const topRing = mesh(
    new THREE.TorusGeometry(radius, 0.025, 5, 12),
    materials.iron,
    "Cage top ring",
  );
  topRing.rotation.x = Math.PI / 2;
  topRing.position.y = 0;
  const botRing = mesh(
    new THREE.TorusGeometry(radius * 0.95, 0.025, 5, 12),
    materials.iron,
    "Cage bottom ring",
  );
  botRing.rotation.x = Math.PI / 2;
  botRing.position.y = -cageH;
  cage.add(topRing, botRing);

  const barCount = 6 + (variant % 3);
  const barGeo = new THREE.CylinderGeometry(0.016, 0.016, cageH, 5);
  for (let i = 0; i < barCount; i += 1) {
    const angle = (i / barCount) * Math.PI * 2;
    const bar = mesh(barGeo, materials.iron, "Cage vertical bar");
    bar.position.set(Math.cos(angle) * radius * 0.92, -cageH * 0.5, Math.sin(angle) * radius * 0.92);
    cage.add(bar);
  }
  // Mid hoop for silhouette weight.
  const mid = mesh(
    new THREE.TorusGeometry(radius * 0.97, 0.018, 4, 12),
    materials.iron,
    "Cage mid hoop",
  );
  mid.rotation.x = Math.PI / 2;
  mid.position.y = -cageH * 0.48;
  cage.add(mid);

  const floor = mesh(
    new THREE.CylinderGeometry(radius * 0.9, radius * 0.9, 0.04, 10),
    materials.iron,
    "Cage floor pan",
  );
  floor.position.y = -cageH - 0.01;
  cage.add(floor);

  // Small hinge stub (readable door cue).
  const hinge = mesh(
    new THREE.BoxGeometry(0.06, cageH * 0.55, 0.04),
    materials.iron,
    "Cage door hinge plate",
  );
  hinge.position.set(radius * 0.95, -cageH * 0.45, 0);
  cage.add(hinge);

  root.add(cage);
  root.add(socket("Cage interior socket", "captive", [0, tipY - cageH * 0.55, 0]));
  return finish(root, "iron-cage", length);
}

function oilLantern(materials: DungeonMaterials, length: number, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted hanging oil lantern";
  const suspendLength = Math.max(0.28, length * 0.35);
  const { group: chain, tipY } = chainSuspender(materials, suspendLength, variant);
  root.add(chain);

  const body = new THREE.Group();
  body.name = "Lantern body";
  body.position.y = tipY;

  const cap = mesh(new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), materials.iron, "Lantern dome cap");
  cap.position.y = -0.02;
  body.add(cap);
  const ring = mesh(new THREE.TorusGeometry(0.12, 0.018, 5, 10), materials.iron, "Lantern top ring");
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.12;
  body.add(ring);

  for (const angle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
    const bar = mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.32, 5),
      materials.iron,
      "Lantern cage bar",
    );
    bar.position.set(Math.cos(angle) * 0.11, -0.28, Math.sin(angle) * 0.11);
    body.add(bar);
  }
  const lower = mesh(new THREE.TorusGeometry(0.13, 0.016, 5, 10), materials.iron, "Lantern lower ring");
  lower.rotation.x = Math.PI / 2;
  lower.position.y = -0.44;
  body.add(lower);

  const reservoir = mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    materials.brass,
    "Lantern oil reservoir",
  );
  reservoir.scale.set(1, 0.75, 1);
  reservoir.position.y = -0.52;
  body.add(reservoir);
  const wick = mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 0.06, 6),
    materials.brass,
    "Lantern wick collar",
  );
  wick.position.y = -0.42;
  body.add(wick);

  // Soft glow cue without a real light (shared iron/brass only for batching).
  const glass = mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.22, 8),
    materials.crystal,
    "Lantern glass body",
  );
  glass.position.y = -0.28;
  body.add(glass);

  root.add(body);
  root.add(socket("Lantern flame socket", "flame", [0, tipY - 0.3, 0]));
  return finish(root, "oil-lantern", length);
}

function tatteredBanner(materials: DungeonMaterials, length: number, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted tattered hanging banner";
  const mount = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 8), materials.iron, "Banner ceiling mount");
  mount.position.y = -0.02;
  root.add(mount);

  const rodLen = 0.7 + (variant % 3) * 0.08;
  const rod = mesh(new THREE.CylinderGeometry(0.03, 0.03, rodLen, 6), materials.wood, "Banner crossbar");
  rod.rotation.z = Math.PI / 2;
  rod.position.y = -0.16;
  root.add(rod);

  for (const x of [-rodLen * 0.42, rodLen * 0.42]) {
    const ring = mesh(new THREE.TorusGeometry(0.035, 0.01, 4, 8), materials.iron, "Banner hang ring");
    ring.position.set(x, -0.1, 0);
    root.add(ring);
  }

  const clothH = Math.max(0.9, length * 0.75);
  const clothW = rodLen * 0.85;
  const cloth = mesh(
    new THREE.BoxGeometry(clothW, clothH, 0.03),
    materials.cloth,
    "Banner main cloth panel",
  );
  cloth.position.y = -0.2 - clothH * 0.5;
  root.add(cloth);

  // Frayed strips at the bottom for silhouette variety.
  const stripCount = 3 + (variant % 3);
  const stripGeo = new THREE.BoxGeometry(clothW / (stripCount + 0.5), 0.22 + (variant % 2) * 0.1, 0.025);
  for (let i = 0; i < stripCount; i += 1) {
    const strip = mesh(stripGeo, materials.cloth, "Banner fray strip");
    const x = ((i + 0.5) / stripCount - 0.5) * clothW * 0.9;
    const drop = 0.08 + ((i + variant) % 3) * 0.05;
    strip.position.set(x, -0.2 - clothH - drop, 0);
    strip.rotation.z = ((i % 3) - 1) * 0.08;
    root.add(strip);
  }

  // Small brass finials on rod ends.
  for (const x of [-rodLen * 0.5, rodLen * 0.5]) {
    const tip = mesh(new THREE.SphereGeometry(0.04, 6, 5), materials.brass, "Banner rod finial");
    tip.position.set(x, -0.16, 0);
    root.add(tip);
  }

  root.add(socket("Banner cloth socket", "banner-face", [0, -0.2 - clothH * 0.4, 0.02]));
  return finish(root, "tattered-banner", length);
}

function meatHooks(materials: DungeonMaterials, length: number, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted hanging meat hooks";
  const mount = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8), materials.iron, "Hooks ceiling mount");
  mount.position.y = -0.02;
  root.add(mount);

  for (const x of [-0.18, 0.18]) {
    const link = mesh(new THREE.TorusGeometry(0.04, 0.012, 4, 8), materials.iron, "Hooks hang link");
    link.position.set(x, -0.12, 0);
    root.add(link);
  }

  const barLen = 0.75 + (variant % 2) * 0.12;
  const bar = mesh(new THREE.CylinderGeometry(0.028, 0.028, barLen, 6), materials.iron, "Hooks horizontal bar");
  bar.rotation.z = Math.PI / 2;
  bar.position.y = -0.22;
  root.add(bar);

  const hookCount = 3 + (variant % 2);
  const drop = Math.max(0.35, length * 0.22);
  for (let i = 0; i < hookCount; i += 1) {
    const x = ((i + 0.5) / hookCount - 0.5) * barLen * 0.85;
    const stem = mesh(
      new THREE.CylinderGeometry(0.012, 0.012, drop * 0.55, 5),
      materials.iron,
      "Hook stem",
    );
    stem.position.set(x, -0.22 - drop * 0.28, 0);
    root.add(stem);
    // Open torus as S-hook silhouette.
    const hook = mesh(
      new THREE.TorusGeometry(0.07, 0.012, 5, 10, Math.PI * 1.4),
      materials.iron,
      "Hook S curve",
    );
    hook.rotation.set(Math.PI / 2, 0, Math.PI * 0.25);
    hook.position.set(x, -0.22 - drop * 0.62, 0.02);
    root.add(hook);
  }

  // Optional hanging haunch on one hook.
  if (variant % 2 === 0) {
    const meat = mesh(new THREE.SphereGeometry(0.1, 7, 5), materials.cloth, "Hanging meat haunch");
    meat.scale.set(0.85, 1.35, 0.7);
    meat.position.set(-barLen * 0.18, -0.22 - drop * 0.85, 0.02);
    root.add(meat);
    const bone = mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.18, 5), materials.bone, "Meat bone stub");
    bone.position.set(-barLen * 0.18, -0.22 - drop * 0.55, 0.02);
    root.add(bone);
  }

  root.add(socket("Hooks load socket", "hang-load", [0, -0.22 - drop * 0.5, 0]));
  return finish(root, "meat-hooks", length);
}

function boneMobile(materials: DungeonMaterials, length: number, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted hanging bone mobile";
  const knot = mesh(new THREE.SphereGeometry(0.07, 7, 5), materials.wood, "Bone mobile ceiling knot");
  knot.position.y = -0.04;
  root.add(knot);

  const strandCount = 3 + (variant % 2);
  const totalDrop = Math.max(1.1, length * 0.85);
  for (let i = 0; i < strandCount; i += 1) {
    const angle = (i / strandCount) * Math.PI * 2 + variant * 0.4;
    const radius = 0.08 + (i % 2) * 0.06;
    const ox = Math.cos(angle) * radius;
    const oz = Math.sin(angle) * radius;
    const strandLen = totalDrop * (0.55 + ((i + variant) % 3) * 0.15);
    const rope = mesh(
      new THREE.CylinderGeometry(0.012, 0.012, strandLen, 5),
      materials.wood,
      "Bone mobile rope strand",
    );
    rope.position.set(ox, -0.08 - strandLen * 0.5, oz);
    root.add(rope);

    if (i === 0) {
      const skull = mesh(new THREE.SphereGeometry(0.1, 8, 6), materials.bone, "Bone mobile skull");
      skull.scale.set(1, 0.85, 1.05);
      skull.position.set(ox, -0.08 - strandLen - 0.08, oz);
      root.add(skull);
    } else {
      const bone = mesh(
        new THREE.CylinderGeometry(0.025, 0.03, 0.28 + (i % 2) * 0.08, 6),
        materials.bone,
        "Bone mobile long bone",
      );
      bone.rotation.z = ((i % 3) - 1) * 0.35;
      bone.position.set(ox, -0.08 - strandLen - 0.05, oz);
      root.add(bone);
      // Joint knobs.
      for (const end of [-1, 1]) {
        const knob = mesh(
          new THREE.SphereGeometry(0.035, 5, 4),
          materials.bone,
          "Bone joint knob",
        );
        knob.position.set(
          ox + end * 0.02,
          -0.08 - strandLen - 0.05 + end * 0.12,
          oz,
        );
        root.add(knob);
      }
    }
  }

  root.add(socket("Bone mobile center socket", "ritual-item", [0, -totalDrop * 0.45, 0]));
  return finish(root, "bone-mobile", length);
}

function rootCluster(materials: DungeonMaterials, length: number, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted hanging root cluster";
  const knot = mesh(new THREE.SphereGeometry(0.09, 7, 5), materials.wood, "Root ceiling knot");
  knot.position.y = -0.04;
  root.add(knot);

  const tendrilCount = 4 + (variant % 3);
  const totalDrop = Math.max(1.2, length * 0.9);
  for (let i = 0; i < tendrilCount; i += 1) {
    const sway = ((i + variant) % 5) * 0.02 - 0.04;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.05, 0),
      new THREE.Vector3(sway + Math.cos(i) * 0.08, -totalDrop * 0.3, Math.sin(i * 1.3) * 0.07),
      new THREE.Vector3(-sway * 1.2, -totalDrop * 0.62, Math.cos(i * 0.7) * 0.1),
      new THREE.Vector3(sway * 0.6, -totalDrop * (0.75 + (i % 3) * 0.08), Math.sin(i) * 0.05),
    ]);
    const radius = 0.018 + (i % 3) * 0.006;
    const tendril = mesh(
      new THREE.TubeGeometry(curve, 10, radius, 4, false),
      materials.wood,
      "Root tendril",
    );
    root.add(tendril);
  }

  // Sparse moss nubs near the knot.
  for (let i = 0; i < 3; i += 1) {
    const moss = mesh(
      new THREE.SphereGeometry(0.035, 5, 4),
      materials.darkStone,
      "Root moss clump",
    );
    const a = i * 2.1 + variant;
    moss.position.set(Math.cos(a) * 0.08, -0.12 - i * 0.06, Math.sin(a) * 0.08);
    root.add(moss);
  }

  root.add(socket("Root tip socket", "organic-hang", [0, -totalDrop * 0.85, 0]));
  return finish(root, "root-cluster", length);
}

export function createImageSculptedHanging(
  family: ImageSculptedHangingFamily,
  materials: DungeonMaterials,
  length = 2.2,
  variant = 0,
): THREE.Group {
  const v = Math.abs(variant);
  if (family === "iron-cage") return ironCage(materials, length, v);
  if (family === "oil-lantern") return oilLantern(materials, length, v);
  if (family === "tattered-banner") return tatteredBanner(materials, length, v);
  if (family === "meat-hooks") return meatHooks(materials, length, v);
  if (family === "bone-mobile") return boneMobile(materials, length, v);
  return rootCluster(materials, length, v);
}

export function isImageSculptedHangingFamily(value: string): value is ImageSculptedHangingFamily {
  return (IMAGE_SCULPTED_HANGING_FAMILIES as readonly string[]).includes(value);
}
