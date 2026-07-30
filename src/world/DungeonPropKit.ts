import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { DungeonMaterials } from "./MaterialLibrary";
import { createReliquaryAltar } from "./ReliquaryAltar";
import type { RoomTheme } from "./RoomArtDirection";
import { createImageSculptedClutter } from "./ImageSculptedClutterKit";
import {
  addCarpentryMesh,
  addCarpentryRivets,
  createBeamBetween,
  createCarpentryPart,
  createCarpentrySocket,
  finalizeCarpentryModel,
  taperedChamferBoxGeometry,
} from "./ImageSculptedPropKit";

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

function coffinHalfWidthAtZ(width: number, length: number, z: number): number {
  const shoulder = length * 0.27;
  const halfLength = length / 2;
  const distance = Math.abs(z);
  if (distance <= shoulder) return width / 2;
  const endWidth = z > 0 ? width * 0.31 : width * 0.34;
  const taper = THREE.MathUtils.clamp((distance - shoulder) / (halfLength - shoulder), 0, 1);
  return THREE.MathUtils.lerp(width / 2, endWidth, taper);
}

function coffinLidBandGeometry(z: number, depth = 0.12): THREE.ExtrudeGeometry {
  const outerHalfWidth = coffinHalfWidthAtZ(1.12, 2.26, z) + 0.035;
  const shoulderHalfWidth = coffinHalfWidthAtZ(0.92, 2.04, z) + 0.02;
  const panelHalfWidth = coffinHalfWidthAtZ(0.88, 1.98, z) + 0.018;
  const shape = new THREE.Shape();
  shape.moveTo(-outerHalfWidth, -0.005);
  shape.lineTo(-outerHalfWidth, 0.115);
  shape.lineTo(-shoulderHalfWidth, 0.34);
  shape.lineTo(-panelHalfWidth, 0.397);
  shape.lineTo(panelHalfWidth, 0.397);
  shape.lineTo(shoulderHalfWidth, 0.34);
  shape.lineTo(outerHalfWidth, 0.115);
  shape.lineTo(outerHalfWidth, -0.005);
  shape.lineTo(outerHalfWidth - 0.065, -0.005);
  shape.lineTo(outerHalfWidth - 0.065, 0.08);
  shape.lineTo(shoulderHalfWidth - 0.02, 0.3);
  shape.lineTo(panelHalfWidth - 0.025, 0.347);
  shape.lineTo(-panelHalfWidth + 0.025, 0.347);
  shape.lineTo(-shoulderHalfWidth + 0.02, 0.3);
  shape.lineTo(-outerHalfWidth + 0.065, 0.08);
  shape.lineTo(-outerHalfWidth + 0.065, -0.005);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  geometry.name = "Coffin fitted continuous lid band geometry";
  geometry.userData.fittedBand = {
    continuousGeometry: true,
    crossSectionPoints: 16,
    outerHalfWidth,
    panelHalfWidth,
    lowerEdgeY: -0.005,
    crownY: 0.397,
  };
  return geometry;
}

function coffinPlanPoints(width: number, length: number): THREE.Vector2[] {
  const shoulder = length * 0.27;
  return [
    new THREE.Vector2(-width * 0.31, length / 2),
    new THREE.Vector2(width * 0.31, length / 2),
    new THREE.Vector2(width / 2, shoulder),
    new THREE.Vector2(width / 2, -shoulder),
    new THREE.Vector2(width * 0.34, -length / 2),
    new THREE.Vector2(-width * 0.34, -length / 2),
    new THREE.Vector2(-width / 2, -shoulder),
    new THREE.Vector2(-width / 2, shoulder),
  ];
}

function coffinRoofGeometry(
  baseWidth: number,
  baseLength: number,
  topWidth: number,
  topLength: number,
  height: number,
): THREE.BufferGeometry {
  const base = coffinPlanPoints(baseWidth, baseLength);
  const top = coffinPlanPoints(topWidth, topLength);
  const positions: number[] = [];
  const uvs: number[] = [];
  const vertex = (point: THREE.Vector2, y: number, u: number, v: number): void => {
    positions.push(point.x, y, point.y);
    uvs.push(u, v);
  };
  for (let index = 0; index < base.length; index += 1) {
    const next = (index + 1) % base.length;
    const u0 = index / base.length;
    const u1 = (index + 1) / base.length;
    vertex(base[index]!, 0, u0, 0);
    vertex(base[next]!, 0, u1, 0);
    vertex(top[next]!, height, u1, 1);
    vertex(base[index]!, 0, u0, 0);
    vertex(top[next]!, height, u1, 1);
    vertex(top[index]!, height, u0, 1);
  }
  const center = new THREE.Vector2();
  const capVertex = (point: THREE.Vector2, y: number, width: number, length: number): void => {
    vertex(point, y, 0.5 + point.x / width, 0.5 + point.y / length);
  };
  for (let index = 0; index < base.length; index += 1) {
    const next = (index + 1) % base.length;
    capVertex(center, 0, baseWidth, baseLength);
    capVertex(base[next]!, 0, baseWidth, baseLength);
    capVertex(base[index]!, 0, baseWidth, baseLength);
    capVertex(center, height, topWidth, topLength);
    capVertex(top[index]!, height, topWidth, topLength);
    capVertex(top[next]!, height, topWidth, topLength);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.name = "Coffin broad faceted sloped roof geometry";
  return geometry;
}

function withVertexColor<T extends THREE.BufferGeometry>(geometry: T, color: THREE.Color): T {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) color.toArray(colors, index * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function projectArchitectureUvs<T extends THREE.BufferGeometry>(geometry: T, tileSize = 0.72): T {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  if (!position || !normal) return geometry;
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const nz = Math.abs(normal.getZ(index));
    if (ny >= nx && ny >= nz) {
      uv[index * 2] = x / tileSize;
      uv[index * 2 + 1] = z / tileSize;
    } else if (nx >= nz) {
      uv[index * 2] = z / tileSize;
      uv[index * 2 + 1] = y / tileSize;
    } else {
      uv[index * 2] = x / tileSize;
      uv[index * 2 + 1] = y / tileSize;
    }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function mergeArchitectureProp(root: THREE.Group): THREE.Group {
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
    if (!geometry.getAttribute("uv")) {
      geometry.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
          new Float32Array(geometry.getAttribute("position").count * 2),
          2,
        ),
      );
    }
    for (const attribute of Object.keys(geometry.attributes)) {
      if (
        attribute !== "position" &&
        attribute !== "normal" &&
        attribute !== "uv" &&
        attribute !== "color"
      ) {
        geometry.deleteAttribute(attribute);
      }
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

function addTaperedLeg(
  part: THREE.Group,
  materials: DungeonMaterials,
  name: string,
  position: THREE.Vector3,
  height: number,
  rotationX: number,
  rotationZ: number,
): THREE.Mesh {
  const leg = addCarpentryMesh(
    part,
    taperedChamferBoxGeometry([0.14, height, 0.14], 0.02, 1.16, 0.94),
    materials.wood,
    name,
  );
  leg.position.copy(position);
  leg.rotation.x = rotationX;
  leg.rotation.z = rotationZ;
  return leg;
}

function createTable(materials: DungeonMaterials, variant: number): THREE.Group {
  const width = [2.24, 2.5, 2.78][variant]!;
  const depth = [1.06, 1.16, 1.12][variant]!;
  const root = new THREE.Group();
  root.name = `Image-sculpted iron-bound trestle table v2 variant ${variant + 1}`;
  const top = createCarpentryPart("tabletop", "Table three-plank chamfered top", "tabletop");
  const plankWidth = width / 3;
  for (let index = 0; index < 3; index += 1) {
    const plank = addCarpentryMesh(
      top,
      taperedChamferBoxGeometry([plankWidth - 0.014, 0.15, depth], 0.028, 1.01, 0.99),
      materials.wood,
      `Table top plank ${index + 1}`,
    );
    plank.position.set(-width / 2 + plankWidth / 2 + plankWidth * index, 0.96, 0);
  }

  const frame = createCarpentryPart("trestle-frame", "Table splayed trestle frame", "frame");
  const legX = width * 0.38;
  const legZ = depth * 0.34;
  for (const x of [-legX, legX]) {
    for (const z of [-legZ, legZ]) {
      addTaperedLeg(
        frame,
        materials,
        `Table tapered leg ${x < 0 ? "left" : "right"} ${z < 0 ? "rear" : "front"}`,
        new THREE.Vector3(x, 0.47, z),
        0.88,
        z * 0.08,
        -x * 0.055,
      );
    }
  }
  for (const x of [-legX, legX]) {
    const apron = addCarpentryMesh(
      frame,
      taperedChamferBoxGeometry([0.13, 0.16, depth * 0.84], 0.018),
      materials.wood,
      `${x < 0 ? "Left" : "Right"} table end apron`,
    );
    apron.position.set(x, 0.84, 0);
  }
  const stretcher = addCarpentryMesh(
    frame,
    taperedChamferBoxGeometry([width * 0.77, 0.11, 0.11], 0.018),
    materials.wood,
    "Table long lower stretcher",
  );
  stretcher.position.set(0, 0.3, 0);

  const hardware = createCarpentryPart(
    "table-hardware",
    "Table iron joint brackets and rivets",
    "frame",
  );
  const rivets: THREE.Vector3Like[] = [];
  for (const x of [-legX, legX]) {
    for (const z of [-legZ, legZ]) {
      const bracket = addCarpentryMesh(
        hardware,
        taperedChamferBoxGeometry([0.2, 0.18, 0.045], 0.016),
        materials.iron,
        "Table iron corner bracket",
        { surfaceDetail: true },
      );
      bracket.position.set(x, 0.85, z + Math.sign(z) * 0.075);
      rivets.push({ x, y: 0.85, z: z + Math.sign(z) * 0.1 });
      const cuff = addCarpentryMesh(
        hardware,
        taperedChamferBoxGeometry([0.2, 0.17, 0.2], 0.016),
        materials.iron,
        "Table lower leg cuff",
        { surfaceDetail: true },
      );
      cuff.position.set(x, 0.2, z);
    }
  }
  addCarpentryRivets(hardware, rivets, materials.brass, "Table joint rivet system", 0.023);
  root.add(
    top,
    frame,
    hardware,
    createCarpentrySocket("Table surface socket", "surface-item", {
      x: 0,
      y: 1.05,
      z: 0,
    }),
  );
  root.scale.set(1.05, 1.02, 1.05);
  root.userData.variant = variant;
  return finalizeCarpentryModel(root, {
    id: "table",
    family: "table",
    tier: "repeated",
    colliderType: "compound",
    grounded: true,
  });
}

function createBench(materials: DungeonMaterials, variant: number): THREE.Group {
  const width = [1.72, 1.92, 2.12][variant]!;
  const depth = [0.5, 0.54, 0.58][variant]!;
  const root = new THREE.Group();
  root.name = `Image-sculpted iron-bound trestle bench v2 variant ${variant + 1}`;
  const seat = createCarpentryPart("bench-seat", "Bench paired seat planks", "bench-seat");
  for (const z of [-depth * 0.24, depth * 0.24]) {
    const plank = addCarpentryMesh(
      seat,
      taperedChamferBoxGeometry([width, 0.13, depth * 0.5 - 0.008], 0.026),
      materials.wood,
      `${z < 0 ? "Rear" : "Front"} bench seat plank`,
    );
    plank.position.set(0, 0.6, z);
  }
  const frame = createCarpentryPart("bench-frame", "Bench splayed trestle frame", "bench-frame");
  const legX = width * 0.4;
  const legZ = depth * 0.32;
  for (const x of [-legX, legX]) {
    for (const z of [-legZ, legZ]) {
      addTaperedLeg(
        frame,
        materials,
        `Bench tapered leg ${x < 0 ? "left" : "right"} ${z < 0 ? "rear" : "front"}`,
        new THREE.Vector3(x, 0.29, z),
        0.54,
        z * 0.12,
        -x * 0.08,
      );
    }
  }
  const stretcher = addCarpentryMesh(
    frame,
    taperedChamferBoxGeometry([width * 0.72, 0.095, 0.095], 0.015),
    materials.wood,
    "Bench long lower stretcher",
  );
  stretcher.position.set(0, 0.24, 0);
  for (const x of [-legX, legX]) {
    const endBrace = addCarpentryMesh(
      frame,
      taperedChamferBoxGeometry([0.1, 0.1, depth * 0.78], 0.015),
      materials.wood,
      "Bench short end brace",
    );
    endBrace.position.set(x, 0.48, 0);
  }
  const hardware = createCarpentryPart("bench-hardware", "Bench iron joint cuffs", "bench-frame");
  const rivets: THREE.Vector3Like[] = [];
  for (const x of [-legX, legX]) {
    for (const z of [-legZ, legZ]) {
      const cuff = addCarpentryMesh(
        hardware,
        taperedChamferBoxGeometry([0.2, 0.16, 0.18], 0.016),
        materials.iron,
        "Bench iron leg cuff",
        { surfaceDetail: true },
      );
      cuff.position.set(x, 0.22, z);
      rivets.push({ x, y: 0.22, z: z + Math.sign(z) * 0.1 });
    }
  }
  addCarpentryRivets(hardware, rivets, materials.iron, "Bench joint rivet system", 0.023);
  root.add(seat, frame, hardware);
  root.scale.set(1.06, 1.02, 0.96);
  root.userData.variant = variant;
  return finalizeCarpentryModel(root, {
    id: "bench",
    family: "bench",
    tier: "repeated",
    colliderType: "compound",
    grounded: true,
  });
}

function createChair(materials: DungeonMaterials, variant: number): THREE.Group {
  const width = [0.62, 0.67, 0.72][variant]!;
  const depth = [0.56, 0.59, 0.62][variant]!;
  const rearPostHeight = [1.44, 1.52, 1.6][variant]!;
  const crestHeight = [1.34, 1.42, 1.5][variant]!;
  const root = new THREE.Group();
  root.name = `Image-sculpted ladder-back chair v2 variant ${variant + 1}`;
  const seat = createCarpentryPart("chair-seat", "Chair four-plank seat", "chair-seat");
  const plankWidth = width / 4;
  for (let index = 0; index < 4; index += 1) {
    const plank = addCarpentryMesh(
      seat,
      taperedChamferBoxGeometry([plankWidth - 0.01, 0.11, depth], 0.022),
      materials.wood,
      `Chair seat plank ${index + 1}`,
    );
    plank.position.set(-width / 2 + plankWidth / 2 + index * plankWidth, 0.55, 0);
  }
  const frame = createCarpentryPart("chair-frame", "Chair tapered leg frame", "chair-frame");
  for (const x of [-width * 0.42, width * 0.42]) {
    for (const z of [-depth * 0.38, depth * 0.38]) {
      const rear = z < 0;
      const height = rear ? rearPostHeight : 0.54;
      addTaperedLeg(
        frame,
        materials,
        `${rear ? "Chair rear post" : "Chair front leg"} ${x < 0 ? "left" : "right"}`,
        new THREE.Vector3(x, height / 2, z),
        height,
        z * 0.06,
        -x * 0.06,
      );
    }
  }
  for (const z of [-depth * 0.38, depth * 0.38]) {
    const stretcher = addCarpentryMesh(
      frame,
      taperedChamferBoxGeometry([width * 0.76, 0.07, 0.07], 0.012),
      materials.wood,
      `${z < 0 ? "Rear" : "Front"} chair lower stretcher`,
    );
    stretcher.position.set(0, 0.22, z);
  }
  for (const x of [-width * 0.42, width * 0.42]) {
    const stretcher = addCarpentryMesh(
      frame,
      taperedChamferBoxGeometry([0.07, 0.07, depth * 0.76], 0.012),
      materials.wood,
      `${x < 0 ? "Left" : "Right"} chair lower stretcher`,
    );
    stretcher.position.set(x, 0.24, 0);
  }
  const back = createCarpentryPart("ladder-back", "Chair three-rail ladder back", "chair-frame");
  for (const [index, y] of [crestHeight - 0.56, crestHeight - 0.28, crestHeight].entries()) {
    const rail = addCarpentryMesh(
      back,
      taperedChamferBoxGeometry([width * 0.78, 0.13, 0.075], 0.018),
      materials.wood,
      index === 0
        ? "Chair open back slat"
        : index === 2
          ? "Chair carved crest rail"
          : "Chair ladder back rail 2",
    );
    rail.position.set(0, y, -depth * 0.39);
  }
  const hardware = createCarpentryPart("chair-hardware", "Chair iron joint plates", "chair-frame");
  const positions = [-width * 0.37, width * 0.37].flatMap((x) =>
    [0.58, crestHeight - 0.56, crestHeight - 0.28, crestHeight].map((y) => ({
      x,
      y,
      z: -depth * 0.33,
    })),
  );
  for (const position of positions) {
    const plate = addCarpentryMesh(
      hardware,
      taperedChamferBoxGeometry([0.09, 0.09, 0.028], 0.01),
      materials.iron,
      "Chair square iron joint plate",
      { surfaceDetail: true },
    );
    plate.position.set(position.x, position.y, position.z);
  }
  addCarpentryRivets(hardware, positions, materials.iron, "Chair joint rivet system", 0.019);
  root.add(
    seat,
    frame,
    back,
    hardware,
    createCarpentrySocket("Chair seat socket", "seated-actor", {
      x: 0,
      y: 0.65,
      z: 0,
    }),
  );
  // Keep rivets and splayed posts inside the 0.75 m gameplay footprint.
  root.scale.set([1.04, 0.98, 0.93][variant]!, 1.04, [1.14, 1.08, 1.02][variant]!);
  root.userData.variant = variant;
  return finalizeCarpentryModel(root, {
    id: "chair",
    family: "chair",
    tier: "repeated",
    colliderType: "compound",
  });
}

function createBookshelf(materials: DungeonMaterials, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = `Image-sculpted iron-bound bookshelf v2 variant ${variant + 1}`;
  const shelfWoodMaterial = materials.wood.clone();
  shelfWoodMaterial.name = "Bookshelf dark aged oak PBR material";
  shelfWoodMaterial.color.multiplyScalar(0.84);
  shelfWoodMaterial.color.lerp(new THREE.Color(0x4a301f), 0.1);
  shelfWoodMaterial.emissive.copy(shelfWoodMaterial.color);
  shelfWoodMaterial.emissiveMap = shelfWoodMaterial.map;
  shelfWoodMaterial.emissiveIntensity = 0.032;
  shelfWoodMaterial.roughness = THREE.MathUtils.clamp(shelfWoodMaterial.roughness, 0.74, 0.84);
  shelfWoodMaterial.envMapIntensity = Math.max(0.48, shelfWoodMaterial.envMapIntensity);
  if (shelfWoodMaterial.normalMap) shelfWoodMaterial.normalScale.multiplyScalar(1.22);
  shelfWoodMaterial.userData.localValueScale = 0.84;
  shelfWoodMaterial.userData.localIndirectFill = 0.032;
  shelfWoodMaterial.userData.indirectFillSource = "albedo map";
  shelfWoodMaterial.userData.finish = "dark aged oak with visible grain relief";
  shelfWoodMaterial.userData.biomeSafe = true;

  const recessedWoodMaterial = shelfWoodMaterial.clone();
  recessedWoodMaterial.name = "Bookshelf recessed dark oak PBR material";
  recessedWoodMaterial.color.multiplyScalar(0.62);
  recessedWoodMaterial.emissive.copy(recessedWoodMaterial.color);
  recessedWoodMaterial.emissiveIntensity = 0.014;
  recessedWoodMaterial.roughness = Math.min(1, recessedWoodMaterial.roughness + 0.08);
  recessedWoodMaterial.envMapIntensity = Math.max(0.3, recessedWoodMaterial.envMapIntensity * 0.72);
  recessedWoodMaterial.userData.localValueScale = 0.52;
  recessedWoodMaterial.userData.localIndirectFill = 0.014;
  recessedWoodMaterial.userData.finish = "matte recessed dark oak";

  const shelfIronMaterial = materials.iron.clone();
  shelfIronMaterial.name = "Bookshelf readable forged iron PBR material";
  shelfIronMaterial.color.offsetHSL(0, 0, 0.045);
  shelfIronMaterial.emissive.setHex(0x000000);
  shelfIronMaterial.emissiveMap = null;
  shelfIronMaterial.emissiveIntensity = 0;
  shelfIronMaterial.roughness = THREE.MathUtils.clamp(shelfIronMaterial.roughness, 0.56, 0.64);
  shelfIronMaterial.metalness = Math.max(shelfIronMaterial.metalness, 0.62);
  shelfIronMaterial.envMapIntensity = Math.max(shelfIronMaterial.envMapIntensity, 1.38);
  shelfIronMaterial.userData.finish = "forged iron with controlled local specular lift";
  shelfIronMaterial.userData.biomeSafe = true;

  const bookSpineMaterial = materials.cloth.clone();
  bookSpineMaterial.name = "Bookshelf muted codex cloth PBR material";
  bookSpineMaterial.color.setHex(0xffffff);
  bookSpineMaterial.emissive.setHex(0x050404);
  bookSpineMaterial.emissiveMap = null;
  bookSpineMaterial.emissiveIntensity = 0.012;
  bookSpineMaterial.vertexColors = true;
  bookSpineMaterial.roughness = Math.max(0.86, bookSpineMaterial.roughness);
  if (bookSpineMaterial.normalMap) bookSpineMaterial.normalScale.multiplyScalar(1.08);
  bookSpineMaterial.userData.palette = "burgundy, olive, slate, umber, muted violet";
  bookSpineMaterial.userData.colorSource = "per-book vertex color";
  bookSpineMaterial.userData.biomeSafe = true;
  const shell = createCarpentryPart("bookcase-shell", "Bookshelf framed shell", "bookcase-shell");
  for (let index = 0; index < 7; index += 1) {
    const plank = addCarpentryMesh(
      shell,
      new THREE.BoxGeometry(0.22, 2.12, 0.065),
      recessedWoodMaterial,
      `Bookshelf recessed back plank ${index + 1}`,
    );
    plank.position.set(-0.66 + index * 0.22, 1.18, -0.2);
  }
  for (const x of [-0.87, 0.87]) {
    const stile = addCarpentryMesh(
      shell,
      taperedChamferBoxGeometry([0.17, 2.35, 0.5], 0.026, 1.02, 0.98),
      shelfWoodMaterial,
      `${x < 0 ? "Left" : "Right"} bookshelf outer stile`,
    );
    stile.position.set(x, 1.22, 0);
  }
  const crown = addCarpentryMesh(
    shell,
    taperedChamferBoxGeometry([1.98, 0.2, 0.56], 0.032, 1.02, 0.98),
    shelfWoodMaterial,
    "Bookshelf chamfered crown",
  );
  crown.position.set(0, 2.38, 0.02);
  const plinth = addCarpentryMesh(
    shell,
    taperedChamferBoxGeometry([1.98, 0.19, 0.58], 0.032, 1.04, 0.98),
    shelfWoodMaterial,
    "Bookshelf grounded plinth",
  );
  plinth.position.set(0, 0.095, 0.02);
  for (const y of [0.18, 0.72, 1.26, 1.8]) {
    const shelf = addCarpentryMesh(
      shell,
      taperedChamferBoxGeometry([1.72, 0.14, 0.56], 0.018),
      shelfWoodMaterial,
      "Bookshelf projecting shelf nose",
    );
    shelf.position.set(0, y, 0.06);
  }
  const header = addCarpentryMesh(
    shell,
    taperedChamferBoxGeometry([1.72, 0.13, 0.14], 0.018),
    shelfWoodMaterial,
    "Bookshelf thick inner crown rail",
  );
  header.position.set(0, 2.22, 0.2);

  const sidePanels = createCarpentryPart(
    "bookcase-side-panels",
    "Bookshelf closed divided side walls",
    "bookcase-shell",
  );
  const sideRivets: THREE.Vector3Like[] = [];
  for (const side of [-1, 1]) {
    for (const [index, z] of [-0.16, 0, 0.16].entries()) {
      const panel = addCarpentryMesh(
        sidePanels,
        new THREE.BoxGeometry(0.09, 2.12, 0.155),
        recessedWoodMaterial,
        `${side < 0 ? "Left" : "Right"} bookshelf side wall plank ${index + 1}`,
      );
      panel.position.set(side * 0.78, 1.18, z);
    }
    for (const y of [0.19, 0.72, 1.8, 2.3]) {
      const band = addCarpentryMesh(
        sidePanels,
        new THREE.BoxGeometry(0.025, 0.13, 0.43),
        shelfIronMaterial,
        `${side < 0 ? "Left" : "Right"} bookshelf side iron band`,
        { surfaceDetail: true },
      );
      // Place the straps on the outside face so the side elevation reads as
      // built carpentry instead of a flat slab hidden behind the corner stile.
      band.position.set(side * 1.03, y, 0);
      const zPositions = y === 0.19 || y === 2.3 ? [-0.13, 0.13] : [0];
      for (const z of zPositions) sideRivets.push({ x: side * 1.05, y, z });
    }
  }
  addCarpentryRivets(
    sidePanels,
    sideRivets,
    shelfIronMaterial,
    "Bookshelf side band rivet system",
    0.018,
  );
  const rearBraces = createCarpentryPart(
    "bookcase-rear-braces",
    "Bookshelf rear diagonal braces",
    "bookcase-shell",
  );
  createBeamBetween(
    rearBraces,
    new THREE.Vector3(-0.7, 0.28, -0.285),
    new THREE.Vector3(0.7, 1.34, -0.285),
    0.16,
    0.11,
    0.004,
    recessedWoodMaterial,
    "Bookshelf rear lower diagonal brace",
  );
  createBeamBetween(
    rearBraces,
    new THREE.Vector3(0.7, 1.34, -0.285),
    new THREE.Vector3(-0.7, 2.16, -0.285),
    0.16,
    0.11,
    0.004,
    recessedWoodMaterial,
    "Bookshelf rear upper diagonal brace",
  );
  rearBraces.userData.attachment = {
    sharedJoint: [0.7, 1.34, -0.285],
    rearOffset: 0.03,
    braceWidth: 0.16,
    braceDepth: 0.11,
    backFaceContactZ: -0.23,
  };

  const books = createCarpentryPart("book-row", "Bookshelf full muted codex row", "books");
  const bookWidths = [0.105, 0.12, 0.095, 0.13, 0.11, 0.09, 0.125, 0.1, 0.115, 0.09, 0.12];
  const bookPalette = [0xb66d70, 0x99a06a, 0x7f95aa, 0xaa7c5d, 0x91769c].map(
    (color) => new THREE.Color(color),
  );
  let cursor = -0.68;
  bookWidths.forEach((bookWidth, index) => {
    const book = addCarpentryMesh(
      books,
      withVertexColor(
        new THREE.BoxGeometry(bookWidth, 0.42 + (index % 4) * 0.025, 0.2),
        bookPalette[index % bookPalette.length]!,
      ),
      bookSpineMaterial,
      `Bookshelf distinct codex ${index + 1}`,
    );
    book.position.set(cursor + bookWidth / 2, 1.0, 0.24);
    book.rotation.z = (index % 4 === 3 ? -1 : index % 5 === 4 ? 1 : 0) * 0.035;
    cursor += bookWidth + 0.016;
    const spineBand = addCarpentryMesh(
      books,
      new THREE.BoxGeometry(bookWidth * 0.82, 0.018, 0.012),
      shelfIronMaterial,
      `Bookshelf codex ${index + 1} spine band`,
      { surfaceDetail: true },
    );
    spineBand.position.set(book.position.x, 0.79, 0.347);
  });

  const hardware = createCarpentryPart(
    "bookcase-hardware",
    "Bookshelf iron corner hardware",
    "bookcase-shell",
  );
  const rivets: THREE.Vector3Like[] = [];
  for (const y of [0.18, 0.72, 1.26, 1.8]) {
    const shelfEdgeBand = addCarpentryMesh(
      hardware,
      new THREE.BoxGeometry(1.62, 0.028, 0.025),
      shelfIronMaterial,
      "Bookshelf iron shelf edge band",
      { surfaceDetail: true },
    );
    shelfEdgeBand.position.set(0, y + 0.002, 0.354);
  }
  for (const x of [-0.87, 0.87]) {
    for (const y of [0.18, 0.72, 1.8, 2.34]) {
      const plate = addCarpentryMesh(
        hardware,
        new THREE.BoxGeometry(0.2, 0.18, 0.045),
        shelfIronMaterial,
        "Bookshelf square iron corner plate",
        { surfaceDetail: true },
      );
      plate.position.set(x, y, 0.28);
      rivets.push({ x, y, z: 0.31 });
    }
  }
  addCarpentryRivets(hardware, rivets, shelfIronMaterial, "Bookshelf corner rivet system", 0.021);
  root.add(shell, sidePanels, rearBraces, books, hardware);
  root.scale.set(0.96, 1, 0.93);
  root.userData.variant = variant;
  return finalizeCarpentryModel(root, {
    id: "bookshelf",
    family: "bookshelf",
    tier: "repeated",
    colliderType: "box",
    grounded: true,
    maxMaterialBatches: 4,
    limitations: ["The full lower-middle shelf carries the accepted muted codex row."],
  });
}

function createUrn(materials: DungeonMaterials, variant: number): THREE.Group {
  const suffix = variant + 1;
  const root = new THREE.Group();
  root.name = `Image-sculpted black ceramic funerary urn v2 variant ${suffix}`;

  const ceramic = materials.ceramic.clone();
  ceramic.name = "Urn black glazed ceramic PBR material";
  ceramic.color.multiplyScalar(0.42);
  ceramic.color.lerp(new THREE.Color(0x111417), 0.28);
  ceramic.emissive.setHex(0x020304);
  ceramic.emissiveMap = null;
  ceramic.emissiveIntensity = 0.018;
  ceramic.roughness = THREE.MathUtils.clamp(ceramic.roughness, 0.58, 0.72);
  ceramic.metalness = Math.min(ceramic.metalness, 0.04);
  ceramic.envMapIntensity = Math.max(ceramic.envMapIntensity, 0.6);
  if (ceramic.normalMap) ceramic.normalScale.multiplyScalar(0.72);
  ceramic.userData.finish = "black fired ceramic with restrained glaze";
  ceramic.userData.biomeSafe = true;

  const brass = materials.brass.clone();
  brass.name = "Urn aged gold brass PBR material";
  brass.color.multiply(new THREE.Color(0xd1ad62));
  brass.emissive.setHex(0x0b0702);
  brass.emissiveMap = null;
  brass.emissiveIntensity = 0.018;
  brass.roughness = THREE.MathUtils.clamp(brass.roughness, 0.48, 0.62);
  brass.metalness = Math.max(brass.metalness, 0.58);
  brass.envMapIntensity = Math.max(brass.envMapIntensity, 0.9);
  brass.userData.finish = "aged gold brass trim";
  brass.userData.biomeSafe = true;

  const vessel = createCarpentryPart(
    `urn-vessel-${suffix}`,
    `Urn ${suffix} black ceramic vessel`,
    `urn-${suffix}`,
  );
  const urnDetailGeometry = (
    geometry: THREE.BufferGeometry,
    position: readonly [number, number, number],
    rotationY: number,
    scale: readonly [number, number, number] = [1, 1, 1],
  ): THREE.BufferGeometry => {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
      new THREE.Vector3(...scale),
    );
    geometry.applyMatrix4(matrix);
    return geometry;
  };
  const profile = [
    new THREE.Vector2(0, 0.2),
    new THREE.Vector2(0.28, 0.2),
    new THREE.Vector2(0.34, 0.26),
    new THREE.Vector2(0.42, 0.38),
    new THREE.Vector2(0.47, 0.58),
    new THREE.Vector2(0.48, 0.77),
    new THREE.Vector2(0.46, 0.94),
    new THREE.Vector2(0.38, 1.07),
    new THREE.Vector2(0.28, 1.15),
    new THREE.Vector2(0.24, 1.2),
    new THREE.Vector2(0.24, 1.31),
  ];
  const body = addCarpentryMesh(
    vessel,
    new THREE.LatheGeometry(profile, 14),
    ceramic,
    `Urn ${suffix} faceted black ceramic lathed body`,
  );
  body.userData.profile = "rounded full body, broad shoulder, short neck, closed foot";

  const foot = addCarpentryMesh(
    vessel,
    new THREE.CylinderGeometry(0.34, 0.39, 0.12, 14),
    ceramic,
    `Urn ${suffix} stepped ceramic pedestal foot`,
  );
  foot.position.y = 0.06;
  const upperFoot = addCarpentryMesh(
    vessel,
    new THREE.CylinderGeometry(0.3, 0.35, 0.12, 14),
    ceramic,
    `Urn ${suffix} raised ceramic foot collar`,
  );
  upperFoot.position.y = 0.16;
  foot.userData.profile = "broad circular pedestal with two low steps";

  for (const [index, trim] of [
    { y: 0.18, radius: 0.34, tube: 0.022, role: "base" },
    { y: 0.9, radius: 0.47, tube: 0.024, role: "shoulder" },
    { y: 1.28, radius: 0.25, tube: 0.022, role: "mouth" },
  ].entries()) {
    const band = addCarpentryMesh(
      vessel,
      new THREE.TorusGeometry(trim.radius, trim.tube, 5, 16),
      brass,
      `Urn ${suffix} ${trim.role} brass rim ${index + 1}`,
      { surfaceDetail: true },
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = trim.y;
  }

  const greekBelt = addCarpentryMesh(
    vessel,
    new THREE.CylinderGeometry(0.47, 0.49, 0.14, 16, 1, true),
    ceramic,
    `Urn ${suffix} incised Greek key shoulder belt`,
    { surfaceDetail: true },
  );
  greekBelt.position.y = 0.98;

  const greekKeyParts: THREE.BufferGeometry[] = [];
  for (let motifIndex = 0; motifIndex < 16; motifIndex += 1) {
    const angle = (motifIndex / 16) * Math.PI * 2;
    const direction = motifIndex % 2 === 0 ? 1 : -1;
    const radius = 0.486;
    const center = [Math.sin(angle) * radius, 0.98, Math.cos(angle) * radius] as const;
    greekKeyParts.push(
      urnDetailGeometry(new THREE.BoxGeometry(0.17, 0.014, 0.004), center, angle),
      urnDetailGeometry(
        new THREE.BoxGeometry(0.014, 0.07, 0.004),
        [
          center[0] + Math.cos(angle) * 0.058 * direction,
          0.995,
          center[2] - Math.sin(angle) * 0.058 * direction,
        ],
        angle,
      ),
      urnDetailGeometry(
        new THREE.BoxGeometry(0.072, 0.014, 0.004),
        [
          center[0] + Math.cos(angle) * 0.034 * direction,
          1.029,
          center[2] - Math.sin(angle) * 0.034 * direction,
        ],
        angle,
      ),
    );
  }
  const greekKeyGeometry = mergeGeometries(greekKeyParts, false);
  if (!greekKeyGeometry) throw new Error("Urn Greek key band geometry could not be merged.");
  greekKeyParts.forEach((part) => part.dispose());
  const greekKeyBand = addCarpentryMesh(
    vessel,
    greekKeyGeometry,
    brass,
    `Urn ${suffix} continuous Greek key brass band`,
    { surfaceDetail: true },
  );
  greekKeyBand.userData.pattern = { type: "greek-key", segments: 16, continuous360: true };

  const inlayParts: THREE.BufferGeometry[] = [];
  let inlayCount = 0;
  for (const [row, y, radius, count] of [
    [0, 0.36, 0.385, 6],
    [1, 0.52, 0.445, 8],
    [2, 0.68, 0.482, 7],
    [3, 0.83, 0.475, 8],
  ] as const) {
    for (let index = 0; index < count; index += 1) {
      const angle = ((index + (row % 2) * 0.5) / count) * Math.PI * 2;
      inlayParts.push(
        urnDetailGeometry(
          new THREE.OctahedronGeometry(0.045 + ((index + row) % 3) * 0.006, 0),
          [Math.sin(angle) * radius, y, Math.cos(angle) * radius],
          angle,
          [0.72, 1.08 + ((index + row) % 2) * 0.22, 0.3],
        ),
      );
      inlayCount += 1;
    }
  }
  const inlayGeometry = mergeGeometries(inlayParts, false);
  if (!inlayGeometry) throw new Error("Urn body inlay geometry could not be merged.");
  inlayParts.forEach((part) => part.dispose());
  const bodyInlays = addCarpentryMesh(
    vessel,
    inlayGeometry,
    brass,
    `Urn ${suffix} worn brass body inlays 360`,
    { surfaceDetail: true },
  );
  bodyInlays.userData.pattern = { rows: 4, count: inlayCount, continuous360: true };

  const lid = createCarpentryPart(
    `urn-lid-${suffix}`,
    `Urn ${suffix} removable domed lid pivot`,
    `urn-${suffix}`,
  );
  lid.position.set(0, 1.29, -0.13);
  lid.userData.socket = {
    type: "hinge",
    axis: [1, 0, 0],
    range: [0, 1.9],
    detachable: true,
  };
  const lidProfile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.24, 0),
    new THREE.Vector2(0.32, 0.04),
    new THREE.Vector2(0.31, 0.09),
    new THREE.Vector2(0.28, 0.15),
    new THREE.Vector2(0.22, 0.21),
    new THREE.Vector2(0.13, 0.25),
    new THREE.Vector2(0.09, 0.26),
  ];
  const lidMesh = addCarpentryMesh(
    lid,
    new THREE.LatheGeometry(lidProfile, 14),
    ceramic,
    `Urn ${suffix} domed ceramic lid and finial`,
  );
  lidMesh.position.z = 0.13;
  const lidRim = addCarpentryMesh(
    lid,
    new THREE.TorusGeometry(0.255, 0.025, 5, 16),
    brass,
    `Urn ${suffix} lid brass rim`,
    { surfaceDetail: true },
  );
  lidRim.rotation.x = Math.PI / 2;
  lidRim.position.set(0, 0.045, 0.13);
  const knobStem = addCarpentryMesh(
    lid,
    new THREE.CylinderGeometry(0.085, 0.095, 0.09, 10),
    ceramic,
    `Urn ${suffix} low lid knob stem`,
  );
  knobStem.position.set(0, 0.3, 0.13);
  const knobCap = addCarpentryMesh(
    lid,
    new THREE.CylinderGeometry(0.12, 0.095, 0.065, 10),
    ceramic,
    `Urn ${suffix} low stepped lid knob`,
  );
  knobCap.position.set(0, 0.377, 0.13);

  const handles = createCarpentryPart(
    `urn-handles-${suffix}`,
    `Urn ${suffix} paired aged brass ring handles`,
    `urn-${suffix}`,
  );
  for (const side of [-1, 1]) {
    const label = side < 0 ? "left" : "right";
    const lug = addCarpentryMesh(
      handles,
      taperedChamferBoxGeometry([0.1, 0.13, 0.11], 0.016),
      brass,
      `Urn ${suffix} ${label} reinforced ring lug`,
    );
    lug.position.set(side * 0.455, 0.91, 0);
    const ring = addCarpentryMesh(
      handles,
      new THREE.TorusGeometry(0.145, 0.022, 5, 14),
      brass,
      `Urn ${suffix} ${label} open ring handle`,
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.set(side * 0.49, 0.76, 0);
  }

  root.add(
    vessel,
    lid,
    handles,
    createCarpentrySocket(`Urn ${suffix} offering socket`, "ritual-item", {
      x: 0,
      y: 1.82,
      z: 0,
    }),
  );
  root.userData.variant = variant;
  return finalizeCarpentryModel(root, {
    id: "urn",
    family: "urns",
    tier: "repeated",
    colliderType: "cylinder",
    grounded: true,
    maxMaterialBatches: 2,
    limitations: ["The removable lid exposes a simplified dark ceramic mouth."],
  });
}

function createLectern(materials: DungeonMaterials, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = `Image-sculpted sloped cabinet lectern v2 variant ${variant + 1}`;
  const body = createCarpentryPart("lectern-body", "Lectern framed cabinet body", "lectern-body");
  const cabinet = addCarpentryMesh(
    body,
    taperedChamferBoxGeometry([0.82, 0.96, 0.62], 0.026, 1.03, 0.99),
    materials.wood,
    "Lectern deep plank cabinet shell",
  );
  cabinet.position.set(0, 0.57, 0);
  for (let index = 0; index < 4; index += 1) {
    const seam = addCarpentryMesh(
      body,
      new THREE.BoxGeometry(0.012, 0.78, 0.012),
      materials.iron,
      `Lectern side plank seam ${index + 1}`,
      { surfaceDetail: true },
    );
    seam.position.set(-0.27 + index * 0.18, 0.62, 0.318);
  }
  const plinth = addCarpentryMesh(
    body,
    taperedChamferBoxGeometry([1.02, 0.18, 0.78], 0.028, 1.06, 0.98),
    materials.wood,
    "Lectern stepped grounded plinth",
  );
  plinth.position.set(0, 0.09, 0.03);

  const deck = createCarpentryPart("reading-deck", "Lectern sloped reading deck", "reading-deck");
  const deckMesh = addCarpentryMesh(
    deck,
    taperedChamferBoxGeometry([1.1, 0.14, 0.78], 0.028),
    materials.wood,
    "Angled lectern desk",
  );
  deckMesh.position.set(0, 1.2, -0.02);
  deckMesh.rotation.x = 0.36;
  deckMesh.userData.readingSurface = {
    front: "+z",
    slopeRadians: 0.36,
    frontEdge: [0, 1.14, 0.34],
  };
  const lip = addCarpentryMesh(
    deck,
    taperedChamferBoxGeometry([1.0, 0.09, 0.08], 0.016),
    materials.wood,
    "Lectern raised reading lip",
  );
  lip.position.set(0, 1.14, 0.34);
  lip.rotation.x = 0.36;
  lip.userData.deckAttachment = { edge: "+z", contact: true };

  const door = createCarpentryPart("lectern-door", "Lectern front door hinge", "lectern-body");
  door.position.set(0.35, 0.32, 0.33);
  door.userData.socket = { type: "hinge", axis: [0, 1, 0], range: [-1.5, 0] };
  const leaf = addCarpentryMesh(
    door,
    taperedChamferBoxGeometry([0.67, 0.68, 0.055], 0.018),
    materials.wood,
    "Lectern hinged plank cabinet door",
  );
  leaf.position.set(-0.335, 0.34, 0);
  for (const y of [0.18, 0.5]) {
    const hinge = addCarpentryMesh(
      door,
      taperedChamferBoxGeometry([0.18, 0.075, 0.035], 0.012),
      materials.iron,
      "Lectern iron door hinge strap",
      { surfaceDetail: true },
    );
    hinge.position.set(-0.08, y, 0.04);
  }
  const ring = addCarpentryMesh(
    door,
    new THREE.TorusGeometry(0.08, 0.014, 5, 12),
    materials.brass,
    "Lectern brass ring pull",
  );
  ring.position.set(-0.46, 0.35, 0.065);

  const brace = createCarpentryPart("lectern-brace", "Lectern rear kick brace", "lectern-body");
  createBeamBetween(
    brace,
    new THREE.Vector3(0, 0.17, -0.45),
    new THREE.Vector3(0, 1.23, -0.315),
    0.13,
    0.12,
    0.018,
    materials.wood,
    "Lectern rear diagonal kick brace",
  );
  brace.userData.deckContact = {
    endpoint: [0, 1.23, -0.315],
    target: "Angled lectern desk underside",
    contact: true,
  };
  addCarpentryRivets(
    body,
    [-0.36, 0.36].flatMap((x) => [0.22, 0.9].map((y) => ({ x, y, z: 0.35 }))),
    materials.iron,
    "Lectern corner rivet system",
    0.021,
  );
  root.add(
    body,
    deck,
    door,
    brace,
    createCarpentrySocket("Lectern manuscript socket", "book", {
      x: 0,
      y: 1.285,
      z: 0.04,
    }),
  );
  root.scale.set(0.98, 1.09, 0.93);
  root.userData.variant = variant;
  return finalizeCarpentryModel(root, {
    id: "lectern",
    family: "lectern",
    tier: "repeated",
    colliderType: "compound",
    grounded: true,
    limitations: ["The closed cabinet interior is intentionally omitted."],
  });
}

function createCoffin(materials: DungeonMaterials, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = `Image-sculpted iron-bound stone coffin v2 variant ${variant + 1}`;
  root.userData.propFamily = "coffin";
  root.userData.variant = variant;
  const metalMaterial = materials.iron.clone();
  metalMaterial.name = "Coffin shared iron and muted brass vertex-color material";
  metalMaterial.color.setHex(0xffffff);
  metalMaterial.map = null;
  metalMaterial.aoMap = null;
  metalMaterial.vertexColors = true;
  metalMaterial.roughness = 0.58;
  metalMaterial.metalness = Math.max(0.68, metalMaterial.metalness);
  metalMaterial.envMapIntensity = Math.max(0.72, metalMaterial.envMapIntensity);
  metalMaterial.emissive.setHex(0x24282b);
  metalMaterial.emissiveIntensity = 0.18;
  const ironColor = new THREE.Color(0x646d74);
  const brassColor = new THREE.Color(0xe2b955);
  const coffinUvTileSize = 1.12;
  const metalBox = (
    size: [number, number, number],
    name: string,
    position: [number, number, number],
    color = ironColor,
  ): THREE.Mesh =>
    mesh(withVertexColor(new THREE.BoxGeometry(...size), color), metalMaterial, name, position);

  const body = new THREE.Group();
  body.name = "Coffin closed faceted body assembly";
  body.add(
    mesh(
      projectArchitectureUvs(coffinGeometry(1.08, 2.22, 0.46), coffinUvTileSize),
      materials.darkStone,
      "Faceted stone sarcophagus hull",
      [0, 0.08, 0],
    ),
    mesh(
      projectArchitectureUvs(coffinGeometry(1.15, 2.3, 0.095), coffinUvTileSize),
      materials.darkStone,
      "Coffin tapered ground plinth",
      [0, 0.015, 0],
    ),
    mesh(
      projectArchitectureUvs(coffinGeometry(1.14, 2.28, 0.085), coffinUvTileSize),
      materials.stone,
      "Coffin tapered upper hull rim",
      [0, 0.5, 0],
    ),
  );

  for (const side of [-1, 1]) {
    body.add(
      box([0.045, 0.28, 1.08], materials.stone, "Coffin long side raised panel", [
        side * 0.558,
        0.31,
        0,
      ]),
    );
  }
  body.add(
    box(
      [0.57, 0.26, 0.04],
      materials.stone,
      "Coffin tapered foot-end inset panel",
      [0, 0.31, 1.122],
    ),
    box(
      [0.64, 0.26, 0.04],
      materials.stone,
      "Coffin tapered head-end inset panel",
      [0, 0.31, -1.122],
    ),
  );

  const lid = new THREE.Group();
  lid.name = "Coffin long-edge lid hinge";
  lid.position.set(-0.59, 0.585, 0);
  lid.userData.socket = { type: "hinge", axis: [0, 0, 1], limit: [0, 1.18] };
  lid.userData.collider = { type: "box", size: [1.2, 0.34, 2.34] };
  lid.add(
    mesh(
      projectArchitectureUvs(coffinGeometry(1.18, 2.34, 0.12), coffinUvTileSize),
      materials.stone,
      "Beveled carved sarcophagus lid",
      [0.59, 0, 0],
    ),
    mesh(
      projectArchitectureUvs(coffinRoofGeometry(1.12, 2.26, 0.92, 2.04, 0.24), coffinUvTileSize),
      materials.stone,
      "Coffin sloped lid shoulder tier",
      [0.59, 0.085, 0],
    ),
    mesh(
      projectArchitectureUvs(coffinGeometry(0.88, 1.98, 0.055), coffinUvTileSize),
      materials.stone,
      "Coffin raised sloped lid panel",
      [0.59, 0.315, 0],
    ),
  );
  const lidStraps = [-0.64, 0, 0.64] as const;
  for (const z of lidStraps) {
    lid.add(
      mesh(
        withVertexColor(coffinLidBandGeometry(z), ironColor),
        metalMaterial,
        "Sarcophagus fitted continuous iron lid strap",
        [0.59, 0, z],
      ),
    );
  }
  lid.add(
    metalBox([0.1, 0.04, 0.98], "Raised coffin long sigil", [0.59, 0.414, 0], brassColor),
    metalBox([0.56, 0.04, 0.1], "Raised coffin cross sigil", [0.59, 0.416, -0.1], brassColor),
  );

  const rivetGeometry = withVertexColor(
    new THREE.CylinderGeometry(0.028, 0.028, 0.018, 6),
    ironColor,
  );
  for (const z of lidStraps) {
    const width = coffinHalfWidthAtZ(0.88, 1.98, z) * 2;
    for (const x of [0.59 - width * 0.42, 0.59 + width * 0.42]) {
      lid.add(mesh(rivetGeometry, metalMaterial, "Coffin strap rivet", [x, 0.407, z]));
    }
  }
  lid.userData.strapAttachment = {
    count: lidStraps.length,
    realization: "one fitted inverted-u extrusion per band",
    continuousGeometry: true,
    crossSectionPoints: 16,
    crownY: 0.397,
    lowerEdgeY: -0.005,
    uvTileSize: coffinUvTileSize,
  };

  mergeArchitectureProp(body);
  mergeArchitectureProp(lid);
  root.add(body, lid);
  for (const [name, type, position] of [
    ["Coffin loot socket", "loot", [0, 0.55, 0]],
    ["Coffin interaction socket", "interaction", [0, 0.6, 1.16]],
  ] as const) {
    const socket = new THREE.Group();
    socket.name = name;
    socket.position.set(position[0], position[1], position[2]);
    socket.userData.socket = { type };
    root.add(socket);
  }
  root.userData.asset = "coffin";
  root.userData.reference =
    "assets-source/imagegen/model-references-v2/architecture/coffin-three-view.png";
  root.userData.collider = {
    type: "compound",
    parts: [
      { type: "box", size: [1.15, 0.57, 2.3], center: [0, 0.3, 0] },
      { type: "box", size: [1.2, 0.34, 2.34], center: [0, 0.75, 0] },
    ],
  };
  root.userData.detailInventory = [
    "Faceted stone sarcophagus hull",
    "Coffin tapered ground plinth",
    "Coffin tapered upper hull rim",
    "Coffin long side raised panel",
    "Coffin tapered foot-end inset panel",
    "Coffin tapered head-end inset panel",
    "Coffin continuous side strap drop",
    "Beveled carved sarcophagus lid",
    "Coffin sloped lid shoulder tier",
    "Coffin raised sloped lid panel",
    "Sarcophagus fitted continuous iron lid strap",
    "Raised coffin long sigil",
    "Raised coffin cross sigil",
    "Coffin strap rivet",
  ];
  root.userData.mergedDrawCalls = body.children.length + lid.children.length;
  root.userData.sculptRuntime = {
    topology: "closed faceted body and hinged relief lid",
    materialRoles: ["darkStone", "stone", "sharedMetalVertexColor"],
    actionPivots: ["Coffin long-edge lid hinge"],
    silhouette: {
      plan: "eight-sided coffin",
      centerWidth: 1.18,
      footWidth: 0.73,
      headWidth: 0.8,
    },
    uvTileSize: coffinUvTileSize,
    strapAttachment: lid.userData.strapAttachment,
  };
  return root;
}

export function createDungeonProp(
  family: PropFamily,
  materials: DungeonMaterials,
  variant = 0,
): THREE.Group {
  if (family === "reliquary") return createReliquaryAltar(materials);
  if (family === "urns") {
    const v = Math.abs(Math.trunc(variant)) % 3;
    return createUrn(materials, v);
  }
  if (family === "crates" || family === "barrels" || family === "weapon-rack") {
    return createImageSculptedClutter(family, materials, variant);
  }
  const v = Math.abs(Math.trunc(variant)) % 3;
  if (family === "table") return createTable(materials, v);
  if (family === "bench") return createBench(materials, v);
  if (family === "chair") return createChair(materials, v);
  if (family === "bookshelf") return createBookshelf(materials, v);
  if (family === "lectern") return createLectern(materials, v);
  return createCoffin(materials, v);
}

export function propFamiliesForTheme(theme: RoomTheme): readonly PropFamily[] {
  if (theme === "library") return ["bookshelf", "lectern", "table", "chair"];
  if (theme === "crypt") return ["coffin", "urns", "bench"];
  if (theme === "treasure") return ["reliquary", "crates", "barrels"];
  if (theme === "shrine") return ["reliquary", "lectern", "urns", "bench"];
  if (theme === "elite" || theme === "combat" || theme === "boss") {
    return ["weapon-rack", "crates", "bench", "barrels"];
  }
  return ["table", "chair", "bookshelf", "barrels"];
}
