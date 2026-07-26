import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import type { DungeonMaterials } from "./MaterialLibrary";
import { createReliquaryAltar } from "./ReliquaryAltar";
import type { RoomTheme } from "./RoomArtDirection";
import { createImageSculptedClutter } from "./ImageSculptedClutterKit";

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  position: [number, number, number],
): THREE.Mesh {
  const item = new THREE.Mesh(geometry, material);
  item.name = name;
  item.position.set(...position);
  item.castShadow = true;
  item.receiveShadow = true;
  return item;
}

function box(
  size: [number, number, number],
  material: THREE.Material,
  name: string,
  position: [number, number, number],
): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(...size), material, name, position);
}

function roundedBox(
  size: [number, number, number],
  radius: number,
  material: THREE.Material,
  name: string,
  position: [number, number, number],
): THREE.Mesh {
  return mesh(
    new RoundedBoxGeometry(size[0], size[1], size[2], 1, radius),
    material,
    name,
    position,
  );
}

function coffinGeometry(width: number, length: number, height: number): THREE.ExtrudeGeometry {
  const shoulder = length * 0.27;
  const foot = width * 0.62;
  const shape = new THREE.Shape();
  shape.moveTo(-foot / 2, -length / 2);
  shape.lineTo(foot / 2, -length / 2);
  shape.lineTo(width / 2, -shoulder);
  shape.lineTo(width / 2, shoulder);
  shape.lineTo(width * 0.34, length / 2);
  shape.lineTo(-width * 0.34, length / 2);
  shape.lineTo(-width / 2, shoulder);
  shape.lineTo(-width / 2, -shoulder);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: Math.min(0.045, height * 0.18),
    bevelThickness: Math.min(0.035, height * 0.14),
  });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function group(name: string): THREE.Group {
  const result = new THREE.Group();
  result.name = name;
  return result;
}

function mergeStaticProp(root: THREE.Group): THREE.Group {
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.userData.detailInventory = root.children
    .filter((child): child is THREE.Mesh => child instanceof THREE.Mesh)
    .map((child) => child.name);
  root.updateMatrixWorld(true);
  for (const child of root.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    child.updateMatrix();
    const geometry = (
      child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone()
    ).applyMatrix4(child.matrix);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    if (!geometry.getAttribute("uv"))
      geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
          new Float32Array(geometry.getAttribute("position").count * 2),
          2,
        ),
      );
    for (const attribute of Object.keys(geometry.attributes)) {
      if (attribute !== "position" && attribute !== "normal" && attribute !== "uv")
        geometry.deleteAttribute(attribute);
    }
    geometry.clearGroups();
    const list = batches.get(child.material) ?? [];
    list.push(geometry);
    batches.set(child.material, list);
  }
  root.clear();
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) continue;
    const batch = new THREE.Mesh(merged, material);
    batch.name = `${root.name} material batch`;
    batch.castShadow = true;
    batch.receiveShadow = true;
    root.add(batch);
  }
  root.userData.mergedDrawCalls = root.children.length;
  return root;
}

export type PropFamily =
  | "table"
  | "bench"
  | "chair"
  | "bookshelf"
  | "crates"
  | "barrels"
  | "coffin"
  | "urns"
  | "weapon-rack"
  | "lectern"
  | "reliquary";

export function createDungeonProp(
  family: PropFamily,
  materials: DungeonMaterials,
  variant = 0,
): THREE.Group {
  if (family === "reliquary") return createReliquaryAltar(materials);
  if (
    family === "crates" ||
    family === "barrels" ||
    family === "urns" ||
    family === "weapon-rack"
  ) {
    return createImageSculptedClutter(family, materials, variant);
  }
  const v = Math.abs(Math.trunc(variant)) % 3;
  const root = group(`Dungeon prop ${family} variant ${v + 1}`);
  root.userData.propFamily = family;
  root.userData.variant = v;
  if (family === "table" || family === "bench") {
    // Adult first-person dining/desk scale (player eye ~1.62 m, tile ~2.4 m).
    const width = family === "table" ? [2.15, 2.55, 2.95][v]! : [1.55, 1.85, 2.15][v]!;
    const height = family === "table" ? 1.0 : 0.6;
    const depth = family === "table" ? [1.15, 1.28, 1.2][v]! : [0.5, 0.54, 0.58][v]!;
    root.add(
      roundedBox(
        [width, 0.14 + v * 0.015, depth],
        0.045,
        materials.wood,
        "Chamfered worn timber top",
        [0, height, 0],
      ),
    );
    const legInset = v === 2 ? 0.34 : 0.4;
    const legThick = 0.12 + v * 0.015;
    for (const x of [-width * legInset, width * legInset]) {
      for (const z of [-depth * 0.32, depth * 0.32]) {
        root.add(
          box([legThick, height, legThick], materials.wood, "Timber leg", [x, height / 2, z]),
        );
      }
    }
    const apronY = height - 0.12;
    root.add(
      box([width * 0.82, 0.12, 0.08], materials.wood, "Front timber apron", [
        0,
        apronY,
        depth * 0.39,
      ]),
      box([width * 0.82, 0.12, 0.08], materials.wood, "Rear timber apron", [
        0,
        apronY,
        -depth * 0.39,
      ]),
    );
    if (family === "bench" || v === 2)
      root.add(
        box(
          [width * 0.72, 0.09, 0.1],
          v === 2 ? materials.iron : materials.wood,
          family === "bench" ? "Bench lower stretcher" : "Table foot brace",
          [0, 0.28, 0],
        ),
      );
  } else if (family === "chair") {
    // Tops stay ≤1.7 m (player eye ~1.62); three distinct silhouettes for variants.
    const seatWidth = [0.58, 0.64, 0.7][v]!;
    const seatDepth = [0.56, 0.6, 0.58][v]!;
    const seatY = v === 2 ? 0.56 : 0.52;
    root.add(
      roundedBox([seatWidth, 0.1, seatDepth], 0.035, materials.wood, "Chamfered chair seat", [
        0,
        seatY,
        0,
      ]),
    );
    const backHeight = [0.9, 1.03, 1.12][v]!;
    const backZ = -seatDepth * 0.44;
    for (const x of [-seatWidth * 0.42, seatWidth * 0.42])
      root.add(
        roundedBox([0.085, backHeight, 0.09], 0.02, materials.wood, "Chair carved back post", [
          x,
          seatY + backHeight / 2,
          backZ,
        ]),
      );
    const slatCount = v + 2;
    for (let index = 0; index < slatCount; index += 1) {
      const x =
        slatCount === 1 ? 0 : -seatWidth * 0.24 + (index / (slatCount - 1)) * seatWidth * 0.48;
      root.add(
        roundedBox(
          [0.055, backHeight * 0.62, 0.055],
          0.015,
          materials.wood,
          "Chair open back slat",
          [x, seatY + backHeight * 0.48, backZ + 0.01],
        ),
      );
    }
    root.add(
      roundedBox(
        [seatWidth * 1.06, 0.12, 0.12],
        0.03,
        v === 2 ? materials.iron : materials.wood,
        "Chair carved crest rail",
        [0, seatY + backHeight - 0.045, backZ],
      ),
    );
    for (const x of [-seatWidth * 0.38, seatWidth * 0.38]) {
      for (const z of [-seatDepth * 0.34, seatDepth * 0.34]) {
        root.add(box([0.085, seatY, 0.085], materials.wood, "Chair leg", [x, seatY / 2, z]));
      }
    }
    if (v === 2)
      root.add(
        box([seatWidth * 0.72, 0.09, 0.09], materials.iron, "Chair back brace", [
          0,
          seatY + backHeight * 0.66,
          -seatDepth * 0.39,
        ]),
      );
  } else if (family === "bookshelf") {
    // Tall case with real presence; faces +Z (front). Place with back against a wall.
    root.add(
      box([1.58, 2.2, 0.12], materials.darkStone, "Recessed bookcase back", [0, 1.23, -0.15]),
      roundedBox(
        [0.18, 2.48, 0.48],
        0.035,
        materials.wood,
        "Left bookcase stile",
        [-0.87, 1.24, 0],
      ),
      roundedBox(
        [0.18, 2.48, 0.48],
        0.035,
        materials.wood,
        "Right bookcase stile",
        [0.87, 1.24, 0],
      ),
      roundedBox([1.98, 0.2, 0.54], 0.045, materials.wood, "Bookcase crown", [0, 2.42, 0.02]),
      roundedBox([1.98, 0.18, 0.56], 0.045, materials.wood, "Bookcase plinth", [0, 0.09, 0.03]),
    );
    for (const y of [0.12, 0.68, 1.24, 1.8, 2.36]) {
      root.add(box([1.92, 0.1, 0.52], materials.wood, "Bookcase shelf", [0, y, 0.08]));
    }
    for (let index = 0; index < 16; index += 1) {
      root.add(
        box(
          [0.09 + (index % 3) * 0.03, 0.32 + (index % 2) * 0.1, 0.14],
          index % 3 === 0 ? materials.cloth : materials.bone,
          "Dusty codex",
          [-0.78 + (index % 8) * 0.22, 0.42 + Math.floor(index / 8) * 0.56, 0.28],
        ),
      );
    }
  } else if (family === "coffin") {
    root.add(
      mesh(
        coffinGeometry(1.08, 2.22, 0.5),
        materials.darkStone,
        "Faceted stone sarcophagus hull",
        [0, 0.02, 0],
      ),
      mesh(
        coffinGeometry(1.13, 2.28, 0.16),
        materials.stone,
        "Beveled carved sarcophagus lid",
        [0, 0.57, 0],
      ),
    );
    for (const z of [-0.63, 0, 0.63])
      root.add(
        box([1.04, 0.055, 0.085], materials.iron, "Sarcophagus iron lid strap", [0, 0.77, z]),
      );
    root.add(
      box([0.1, 0.065, 0.92], materials.brass, "Raised coffin long sigil", [0, 0.785, 0]),
      box([0.54, 0.065, 0.1], materials.brass, "Raised coffin cross sigil", [0, 0.79, -0.1]),
    );
  } else if (family === "lectern") {
    root.add(
      roundedBox([0.62, 0.12, 0.5], 0.035, materials.wood, "Lectern grounded plinth", [0, 0.06, 0]),
      box([0.24, 1.02, 0.24], materials.wood, "Lectern stem", [0, 0.58, 0]),
      box([0.72, 0.1, 0.12], materials.iron, "Lectern lower brace", [0, 0.38, 0]),
    );
    const desk = roundedBox(
      [1.05, 0.12, 0.72],
      0.035,
      materials.wood,
      "Angled lectern desk",
      [0, 1.14, 0.06],
    );
    desk.rotation.x = -0.24;
    const book = roundedBox(
      [0.72, 0.075, 0.5],
      0.025,
      materials.cloth,
      "Open ritual book",
      [0, 1.27, 0.02],
    );
    book.rotation.x = -0.24;
    book.rotation.y = 0.05;
    root.add(desk, book);
  }
  return mergeStaticProp(root);
}

export function propFamiliesForTheme(theme: RoomTheme): readonly PropFamily[] {
  if (theme === "library") return ["bookshelf", "lectern", "table", "chair"];
  if (theme === "crypt") return ["coffin", "urns", "bench"];
  if (theme === "treasure") return ["reliquary", "crates", "barrels"];
  if (theme === "shrine") return ["reliquary", "lectern", "urns", "bench"];
  if (theme === "elite" || theme === "combat" || theme === "boss")
    return ["weapon-rack", "crates", "bench", "barrels"];
  return ["table", "chair", "bookshelf", "barrels"];
}
