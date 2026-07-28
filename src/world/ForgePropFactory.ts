import * as THREE from "three";

import type { ForgePropMetadata } from "../dungeon/types";
import { createDungeonProp } from "./DungeonPropKit";
import type { DungeonMaterials } from "./MaterialLibrary";
import {
  addCarpentryMesh,
  addCarpentryRivets,
  createCarpentryPart,
  createCarpentrySocket,
  createImageSculptedProp,
  finalizeCarpentryModel,
  taperedChamferBoxGeometry,
  type ImageSculptedPropFamily,
} from "./ImageSculptedPropKit";

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

const LOCAL_MAP_SLOTS = ["map", "normalMap", "roughnessMap", "aoMap", "bumpMap"] as const;

/** Keep one ImageGen PBR family, but give hero props a non-mirrored local texture scale. */
function retileLocalMaterialMaps(
  material: THREE.MeshStandardMaterial,
  repeat: readonly [number, number],
  offset: readonly [number, number],
): void {
  for (const slot of LOCAL_MAP_SLOTS) {
    const source = material[slot];
    if (!source) continue;
    const texture = source.clone();
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
    texture.offset.set(...offset);
    texture.needsUpdate = true;
    material[slot] = texture;
  }
  material.userData.localTextureTransform = { repeat: [...repeat], offset: [...offset] };
  material.needsUpdate = true;
}

/** Stable box/extrude projection prevents radial caps and mirrored bands on hero stone. */
function projectHeroUvs<T extends THREE.BufferGeometry>(
  geometry: T,
  tileSize: number,
  seed: number,
): T {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  if (!position || !normal) return geometry;
  const uv = new Float32Array(position.count * 2);
  const offsetU = (seed * 0.61803398875) % 1;
  const offsetV = (seed * 0.41421356237) % 1;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const nz = Math.abs(normal.getZ(index));
    if (ny >= nx && ny >= nz) {
      uv[index * 2] = x / tileSize + offsetU;
      uv[index * 2 + 1] = z / tileSize + offsetV;
    } else if (nx >= nz) {
      const direction = normal.getX(index) < 0 ? -1 : 1;
      uv[index * 2] = (z * direction) / tileSize + offsetU;
      uv[index * 2 + 1] = y / tileSize + offsetV;
    } else {
      const direction = normal.getZ(index) < 0 ? -1 : 1;
      uv[index * 2] = (x * direction) / tileSize + offsetU;
      uv[index * 2 + 1] = y / tileSize + offsetV;
    }
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.userData.heroUvLayout = { tileSize, seed, mirrored: false };
  return geometry;
}

function applyBossCrystalFaceColors<T extends THREE.BufferGeometry>(geometry: T): T {
  const position = geometry.getAttribute("position");
  const palette = [0x7f101b, 0xa91624, 0xc52b36, 0x921522, 0xd4444b];
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let triangle = 0; triangle < position.count; triangle += 3) {
    const centerX =
      (position.getX(triangle) + position.getX(triangle + 1) + position.getX(triangle + 2)) / 3;
    const centerY =
      (position.getY(triangle) + position.getY(triangle + 1) + position.getY(triangle + 2)) / 3;
    const centerZ =
      (position.getZ(triangle) + position.getZ(triangle + 1) + position.getZ(triangle + 2)) / 3;
    const paletteIndex =
      Math.abs(Math.floor(centerX * 37 + centerY * 19 + centerZ * 29 + triangle / 3)) %
      palette.length;
    color.setHex(palette[paletteIndex]!);
    for (let vertex = triangle; vertex < triangle + 3; vertex += 1) {
      colors[vertex * 3] = color.r;
      colors[vertex * 3 + 1] = color.g;
      colors[vertex * 3 + 2] = color.b;
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.userData.crystalFacePalette = palette;
  geometry.userData.faceColorMode = "one restrained red value per large low-poly face";
  return geometry;
}

export interface ForgeChestKit {
  root: THREE.Group;
  lid: THREE.Group;
}

function createChestArchEndGeometry(radius: number, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-radius, 0);
  shape.lineTo(radius, 0);
  for (let index = 0; index <= 8; index += 1) {
    const angle = (index / 8) * Math.PI;
    shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.012,
    bevelThickness: 0.009,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

type ChestUvAxis = "x" | "y" | "z";

function axisValue(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
  axis: ChestUvAxis,
): number {
  if (axis === "x") return attribute.getX(index);
  if (axis === "y") return attribute.getY(index);
  return attribute.getZ(index);
}

/**
 * Keep the oak grain at a stable world scale instead of stretching one whole
 * texture over every plank. The preferred axis follows the board length while
 * the seed moves each cut to a different, repeatable part of the source map.
 */
function orientChestWoodUvs<T extends THREE.BufferGeometry>(
  geometry: T,
  preferredGrainAxis: ChestUvAxis,
  seed: number,
): T {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  if (!position || !normal || !uv) return geometry;

  geometry.computeBoundingBox();
  const size = geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
  const dimensions: Record<ChestUvAxis, number> = { x: size.x, y: size.y, z: size.z };
  const axes: readonly ChestUvAxis[] = ["x", "y", "z"];
  const worldTileSize = 1.15;
  const offsetU = (seed * 0.754877666) % 1;
  const offsetV = (seed * 0.569840291) % 1;

  for (let index = 0; index < position.count; index += 1) {
    const normalAxis = axes.reduce((largest, candidate) =>
      Math.abs(axisValue(normal, index, candidate)) > Math.abs(axisValue(normal, index, largest))
        ? candidate
        : largest,
    );
    const planeAxes = axes.filter((axis) => axis !== normalAxis);
    const grainAxis = planeAxes.includes(preferredGrainAxis)
      ? preferredGrainAxis
      : dimensions[planeAxes[0]] >= dimensions[planeAxes[1]]
        ? planeAxes[0]
        : planeAxes[1];
    const crossAxis = planeAxes.find((axis) => axis !== grainAxis) ?? planeAxes[0];
    const outwardSign = axisValue(normal, index, normalAxis) < 0 ? -1 : 1;
    uv.setXY(
      index,
      (axisValue(position, index, crossAxis) * outwardSign) / worldTileSize + offsetU,
      axisValue(position, index, grainAxis) / worldTileSize + offsetV,
    );
  }
  uv.needsUpdate = true;
  geometry.userData.woodUvLayout = {
    grainAxis: preferredGrainAxis,
    worldTileSize,
    seed,
  };
  return geometry;
}

function chestWoodBoxGeometry(
  size: readonly [number, number, number],
  preferredGrainAxis: ChestUvAxis,
  seed: number,
): THREE.BoxGeometry {
  return orientChestWoodUvs(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    preferredGrainAxis,
    seed,
  );
}

export function createForgeChest(materials: DungeonMaterials): ForgeChestKit {
  const root = new THREE.Group();
  root.name = "Image-sculpted iron-bound treasure chest v2";

  const body = createCarpentryPart("chest-body", "Chest framed plank body", "chest-body");
  root.add(body);
  const plankWidth = 1.22 / 5;
  for (let index = 0; index < 5; index += 1) {
    const x = -0.61 + plankWidth / 2 + index * plankWidth;
    for (const z of [-0.38, 0.38]) {
      const plank = addCarpentryMesh(
        body,
        chestWoodBoxGeometry([plankWidth - 0.009, 0.5, 0.055], "y", index * 2 + (z > 0 ? 1 : 2)),
        materials.wood,
        `${z > 0 ? "Front" : "Rear"} chest body plank ${index + 1}`,
      );
      plank.position.set(x, 0.35, z);
    }
  }
  for (const x of [-0.635, 0.635]) {
    for (let index = 0; index < 4; index += 1) {
      const plank = addCarpentryMesh(
        body,
        chestWoodBoxGeometry([0.055, 0.5, 0.185], "y", 20 + index * 2 + (x > 0 ? 1 : 2)),
        materials.wood,
        `${x > 0 ? "Right" : "Left"} chest side plank ${index + 1}`,
      );
      plank.position.set(x, 0.35, -0.2775 + index * 0.185);
    }
  }
  const panelSeams = createCarpentryPart(
    "chest-panel-seams",
    "Chest recessed plank seam system",
    "chest-body",
  );
  for (const z of [-0.38, 0.38]) {
    for (const x of [-0.366, -0.122, 0.122, 0.366]) {
      const seam = addCarpentryMesh(
        panelSeams,
        new THREE.BoxGeometry(0.012, 0.44, 0.018),
        materials.iron,
        `${z > 0 ? "Front" : "Rear"} chest recessed vertical plank seam`,
        { surfaceDetail: true },
      );
      seam.position.set(x, 0.35, z + Math.sign(z) * 0.034);
    }
  }
  for (const x of [-0.635, 0.635]) {
    for (const z of [-0.185, 0, 0.185]) {
      const seam = addCarpentryMesh(
        panelSeams,
        new THREE.BoxGeometry(0.018, 0.44, 0.012),
        materials.iron,
        `${x > 0 ? "Right" : "Left"} chest recessed side plank seam`,
        { surfaceDetail: true },
      );
      seam.position.set(x + Math.sign(x) * 0.034, 0.35, z);
    }
  }
  body.add(panelSeams);
  const floor = addCarpentryMesh(
    body,
    chestWoodBoxGeometry([1.28, 0.08, 0.82], "x", 31),
    materials.wood,
    "Chest raised bottom board",
  );
  floor.position.y = 0.09;
  const plinth = addCarpentryMesh(
    body,
    orientChestWoodUvs(taperedChamferBoxGeometry([1.42, 0.09, 0.9], 0.018, 1.02, 0.98), "x", 32),
    materials.wood,
    "Chest grounded timber plinth",
  );
  plinth.position.y = 0.055;
  for (const x of [-0.55, 0.55]) {
    for (const z of [-0.32, 0.32]) {
      const foot = addCarpentryMesh(
        body,
        orientChestWoodUvs(
          taperedChamferBoxGeometry([0.2, 0.08, 0.18], 0.015, 1.08, 0.96),
          "y",
          34 + (x > 0 ? 2 : 0) + (z > 0 ? 1 : 0),
        ),
        materials.wood,
        "Chest short timber foot",
      );
      foot.position.set(x, 0.025, z);
    }
  }

  for (const y of [0.14, 0.58]) {
    for (const z of [-0.414, 0.414]) {
      const rail = addCarpentryMesh(
        body,
        taperedChamferBoxGeometry([1.36, 0.1, 0.075], 0.018),
        materials.iron,
        `${y > 0.3 ? "Upper" : "Lower"} ${z > 0 ? "front" : "rear"} iron rail`,
      );
      rail.position.set(0, y, z);
    }
    for (const x of [-0.69, 0.69]) {
      const sideRail = addCarpentryMesh(
        body,
        taperedChamferBoxGeometry([0.075, 0.1, 0.82], 0.018),
        materials.iron,
        `${y > 0.3 ? "Upper" : "Lower"} chest side iron rail`,
      );
      sideRail.position.set(x, y, 0);
    }
  }
  for (const x of [-0.67, 0.67]) {
    for (const z of [-0.4, 0.4]) {
      const post = addCarpentryMesh(
        body,
        taperedChamferBoxGeometry([0.15, 0.58, 0.11], 0.018, 1.02, 0.98),
        materials.iron,
        "Chest iron corner post",
      );
      post.position.set(x, 0.35, z);
    }
  }
  for (const x of [-0.67, 0.67]) {
    for (const y of [0.14, 0.58]) {
      for (const z of [-0.445, 0.445]) {
        const plate = addCarpentryMesh(
          body,
          new THREE.BoxGeometry(0.18, 0.15, 0.055),
          materials.iron,
          "Chest square corner reinforcement plate",
          { surfaceDetail: true },
        );
        plate.position.set(x, y, z);
      }
    }
  }
  for (const x of [-0.43, 0.43]) {
    const anchorPlate = addCarpentryMesh(
      body,
      new THREE.BoxGeometry(0.15, 0.14, 0.055),
      materials.iron,
      "Chest lid strap front anchor plate",
      { surfaceDetail: true },
    );
    anchorPlate.position.set(x, 0.58, 0.448);
  }

  const lid = createCarpentryPart("chest-lid", "Chest lid hinge", "chest-lid");
  lid.position.set(0, 0.62, -0.42);
  lid.userData.hinge = {
    axis: [1, 0, 0],
    closedRadians: 0,
    openRadians: -Math.PI * 0.58,
  };
  root.add(lid);
  const lidShell = createCarpentryPart("chest-lid-shell", "Chest arched lid", "chest-lid");
  lid.add(lidShell);
  const lidRadius = 0.42;
  const lidCenterZ = 0.42;
  const lidPlankCount = 9;
  const lidArcWidth = (Math.PI * lidRadius) / (lidPlankCount - 1);
  for (let index = 0; index < lidPlankCount; index += 1) {
    const angle = Math.PI - (index / (lidPlankCount - 1)) * Math.PI;
    const stave = addCarpentryMesh(
      lidShell,
      chestWoodBoxGeometry([1.28, 0.075, lidArcWidth * 1.04], "x", 40 + index),
      materials.wood,
      `Chest arched lid stave ${index + 1}`,
    );
    stave.position.set(0, Math.sin(angle) * lidRadius, lidCenterZ + Math.cos(angle) * lidRadius);
    stave.rotation.x = Math.PI / 2 - angle;
  }
  const underside = addCarpentryMesh(
    lidShell,
    chestWoodBoxGeometry([1.24, 0.06, 0.78], "x", 51),
    materials.wood,
    "Chest closed lid underside panel",
  );
  underside.position.set(0, 0, lidCenterZ);
  for (const x of [-0.655, 0.655]) {
    const endPanel = addCarpentryMesh(
      lidShell,
      orientChestWoodUvs(createChestArchEndGeometry(lidRadius, 0.055), "y", x < 0 ? 52 : 53),
      materials.wood,
      `${x < 0 ? "Left" : "Right"} chest lid solid arched end panel`,
    );
    endPanel.position.set(x, 0, lidCenterZ);
  }
  const lidStraps = createCarpentryPart(
    "chest-lid-straps",
    "Chest segmented arched lid straps",
    "chest-lid",
  );
  const strapRadius = lidRadius + 0.045;
  for (const x of [-0.43, 0.43]) {
    for (let index = 0; index < lidPlankCount; index += 1) {
      const angle = Math.PI - (index / (lidPlankCount - 1)) * Math.PI;
      const strap = addCarpentryMesh(
        lidStraps,
        new THREE.BoxGeometry(0.075, 0.035, lidArcWidth * 1.045),
        materials.iron,
        "Chest arched lid iron rib",
      );
      strap.position.set(
        x,
        Math.sin(angle) * strapRadius,
        lidCenterZ + Math.cos(angle) * strapRadius,
      );
      strap.rotation.x = Math.PI / 2 - angle;
    }
  }
  lid.add(lidStraps);
  for (const x of [-0.66, 0.66]) {
    const endBand = addCarpentryMesh(
      lid,
      new THREE.TorusGeometry(lidRadius + 0.044, 0.026, 4, 16, Math.PI),
      materials.iron,
      "Chest lid iron end band",
      { surfaceDetail: true },
    );
    endBand.rotation.y = Math.PI / 2;
    endBand.position.set(x, 0, lidCenterZ);
  }

  const lockPart = createCarpentryPart("chest-lock", "Chest lock assembly", "lock");
  const lock = addCarpentryMesh(
    lockPart,
    taperedChamferBoxGeometry([0.3, 0.3, 0.085], 0.025),
    materials.brass,
    "Chest lock",
  );
  lock.position.set(0, 0.52, 0.47);
  const lockBoss = addCarpentryMesh(
    lockPart,
    taperedChamferBoxGeometry([0.19, 0.2, 0.055], 0.018),
    materials.brass,
    "Chest lock raised center boss",
    { surfaceDetail: true },
  );
  lockBoss.position.set(0, 0.52, 0.525);
  const keySlot = addCarpentryMesh(
    lockPart,
    new THREE.BoxGeometry(0.032, 0.09, 0.018),
    materials.iron,
    "Chest lock key slot",
    { surfaceDetail: true },
  );
  keySlot.position.set(0, 0.51, 0.56);
  addCarpentryRivets(
    lockPart,
    [-0.1, 0.1].flatMap((x) => [0.42, 0.62].map((y) => ({ x, y, z: 0.53 }))),
    materials.iron,
    "Chest lock plate fasteners",
    0.018,
  );
  root.add(lockPart);

  const handles = createCarpentryPart("side-handles", "Chest ring handles", "chest-body");
  for (const x of [-0.714, 0.714]) {
    const mountingPlate = addCarpentryMesh(
      handles,
      taperedChamferBoxGeometry([0.055, 0.34, 0.2], 0.018),
      materials.iron,
      "Chest side handle mounting plate",
    );
    mountingPlate.position.set(x, 0.4, 0);
    const ring = addCarpentryMesh(
      handles,
      new THREE.TorusGeometry(0.12, 0.022, 4, 12),
      materials.brass,
      "Chest brass side ring",
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.set(x + Math.sign(x) * 0.026, 0.4, 0);
    for (const y of [0.3, 0.5]) {
      const stud = addCarpentryMesh(
        handles,
        new THREE.CylinderGeometry(0.038, 0.038, 0.035, 6),
        materials.iron,
        "Chest ring mounting stud",
        { surfaceDetail: true },
      );
      stud.rotation.z = Math.PI / 2;
      stud.position.set(x + Math.sign(x) * 0.034, y, 0);
    }
  }
  root.add(handles);

  const hinges = createCarpentryPart("rear-hinges", "Chest rear hinge pair", "chest-lid");
  for (const x of [-0.42, 0.42]) {
    const bodyLeaf = addCarpentryMesh(
      hinges,
      taperedChamferBoxGeometry([0.3, 0.085, 0.055], 0.014),
      materials.iron,
      "Chest rear body hinge leaf",
    );
    bodyLeaf.position.set(x, 0.58, -0.445);
    const hinge = addCarpentryMesh(
      hinges,
      new THREE.CylinderGeometry(0.048, 0.048, 0.24, 6),
      materials.iron,
      "Chest rear hinge barrel",
    );
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(x, 0.63, -0.438);
    const lidLeaf = addCarpentryMesh(
      lid,
      taperedChamferBoxGeometry([0.3, 0.065, 0.16], 0.014),
      materials.iron,
      "Chest moving lid hinge leaf",
      { surfaceDetail: true },
    );
    lidLeaf.position.set(x, 0.035, 0.08);
  }
  root.add(hinges);

  addCarpentryRivets(
    body,
    [-0.56, 0.56].flatMap((x) => [0.17, 0.55].map((y) => ({ x, y, z: 0.456 }))),
    materials.iron,
    "Chest front rail fasteners",
    0.025,
  );
  addCarpentryRivets(
    body,
    [-0.67, 0.67].flatMap((x) => [
      { x, y: 0.14, z: 0.48 },
      { x, y: 0.58, z: 0.48 },
      { x, y: 0.58, z: -0.48 },
    ]),
    materials.brass,
    "Chest corner plate fasteners",
    0.024,
  );
  addCarpentryRivets(
    body,
    [-0.43, 0.43].map((x) => ({ x, y: 0.58, z: 0.488 })),
    materials.brass,
    "Chest lid strap anchor fasteners",
    0.022,
  );
  addCarpentryRivets(
    lid,
    [-0.43, 0.43].flatMap((x) =>
      [0.22, 0.5, 0.78].map((fraction) => {
        const angle = fraction * Math.PI;
        return {
          x,
          y: Math.sin(angle) * (lidRadius + 0.064),
          z: lidCenterZ + Math.cos(angle) * (lidRadius + 0.064),
        };
      }),
    ),
    materials.iron,
    "Chest lid strap fasteners",
    0.023,
  );
  root.add(
    createCarpentrySocket("Chest loot socket", "loot", { x: 0, y: 0.5, z: 0 }),
    createCarpentrySocket("Chest interaction socket", "interaction", {
      x: 0,
      y: 0.42,
      z: 0.78,
    }),
  );
  root.scale.set(0.92, 1, 0.8);
  finalizeCarpentryModel(root, {
    id: "treasure-chest",
    family: "treasure-chest",
    tier: "hero",
    colliderType: "box",
    limitations: ["The chest interior uses a shallow gameplay volume instead of full joinery."],
  });
  return { root, lid };
}

function crystal(materials: DungeonMaterials, boss: boolean): THREE.Group {
  interface LoftRing {
    y: number;
    radiusX: number;
    radiusZ: number;
    x?: number;
    z?: number;
    twist?: number;
  }

  const loftGeometry = (rings: readonly LoftRing[], sides: number, phase = 0) => {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (const [ringIndex, ring] of rings.entries()) {
      for (let side = 0; side < sides; side += 1) {
        const angle = phase + (side / sides) * Math.PI * 2 + (ring.twist ?? 0);
        const chip = 1 + Math.sin(side * 1.83 + ringIndex * 2.17) * 0.045;
        positions.push(
          (ring.x ?? 0) + Math.sin(angle) * ring.radiusX * chip,
          ring.y,
          (ring.z ?? 0) + Math.cos(angle) * ring.radiusZ * chip,
        );
        uvs.push(side / sides, ringIndex / Math.max(1, rings.length - 1));
      }
    }
    for (let ring = 0; ring < rings.length - 1; ring += 1) {
      for (let side = 0; side < sides; side += 1) {
        const next = (side + 1) % sides;
        const lower = ring * sides + side;
        const upper = (ring + 1) * sides + side;
        const upperNext = (ring + 1) * sides + next;
        const lowerNext = ring * sides + next;
        indices.push(lower, upper, upperNext, lower, upperNext, lowerNext);
      }
    }
    const lowerCenter = positions.length / 3;
    positions.push(rings[0].x ?? 0, rings[0].y, rings[0].z ?? 0);
    uvs.push(0.5, 0);
    const top = rings[rings.length - 1];
    const upperCenter = positions.length / 3;
    positions.push(top.x ?? 0, top.y, top.z ?? 0);
    uvs.push(0.5, 1);
    const topOffset = (rings.length - 1) * sides;
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      indices.push(lowerCenter, next, side, upperCenter, topOffset + side, topOffset + next);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    const faceted = geometry.toNonIndexed();
    geometry.dispose();
    const facetedPosition = faceted.getAttribute("position") as THREE.BufferAttribute;
    const facetedUv = faceted.getAttribute("uv") as THREE.BufferAttribute;
    const capBounds = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>();
    for (let triangle = 0; triangle < facetedPosition.count; triangle += 3) {
      const y0 = facetedPosition.getY(triangle);
      const y1 = facetedPosition.getY(triangle + 1);
      const y2 = facetedPosition.getY(triangle + 2);
      if (Math.max(y0, y1, y2) - Math.min(y0, y1, y2) > 1e-6) continue;
      const key = ((y0 + y1 + y2) / 3).toFixed(6);
      const bounds = capBounds.get(key) ?? {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minZ: Number.POSITIVE_INFINITY,
        maxZ: Number.NEGATIVE_INFINITY,
      };
      for (let vertex = triangle; vertex < triangle + 3; vertex += 1) {
        bounds.minX = Math.min(bounds.minX, facetedPosition.getX(vertex));
        bounds.maxX = Math.max(bounds.maxX, facetedPosition.getX(vertex));
        bounds.minZ = Math.min(bounds.minZ, facetedPosition.getZ(vertex));
        bounds.maxZ = Math.max(bounds.maxZ, facetedPosition.getZ(vertex));
      }
      capBounds.set(key, bounds);
    }
    for (let triangle = 0; triangle < facetedPosition.count; triangle += 3) {
      const y0 = facetedPosition.getY(triangle);
      const y1 = facetedPosition.getY(triangle + 1);
      const y2 = facetedPosition.getY(triangle + 2);
      if (Math.max(y0, y1, y2) - Math.min(y0, y1, y2) > 1e-6) continue;
      const key = ((y0 + y1 + y2) / 3).toFixed(6);
      const bounds = capBounds.get(key)!;
      const width = Math.max(1e-6, bounds.maxX - bounds.minX);
      const depth = Math.max(1e-6, bounds.maxZ - bounds.minZ);
      for (let vertex = triangle; vertex < triangle + 3; vertex += 1) {
        facetedUv.setXY(
          vertex,
          (facetedPosition.getX(vertex) - bounds.minX) / width,
          (facetedPosition.getZ(vertex) - bounds.minZ) / depth,
        );
      }
    }
    facetedUv.needsUpdate = true;
    faceted.computeVertexNormals();
    return faceted;
  };

  const root = new THREE.Group();
  const assetId = boss ? "boss-crystal-v2" : "shrine-crystal-v2";
  root.name = boss
    ? "Image-sculpted boss blood crystal v2"
    : "Image-sculpted shrine fork crystal v2";

  const stoneMaterial = materials.darkStone.clone();
  stoneMaterial.name = boss ? "Boss crystal dark load-bearing stone" : stoneMaterial.name;
  if (boss) {
    stoneMaterial.color.setHex(0x888b8e);
    stoneMaterial.emissive.setHex(0xffffff);
    stoneMaterial.emissiveMap = stoneMaterial.map;
    stoneMaterial.emissiveIntensity = 0.035;
    stoneMaterial.envMapIntensity = Math.max(stoneMaterial.envMapIntensity, 0.72);
    retileLocalMaterialMaps(stoneMaterial, [0.76, 0.76], [0.17, 0.09]);
    stoneMaterial.emissiveMap = stoneMaterial.map;
  } else {
    stoneMaterial.color.multiplyScalar(0.78);
  }
  stoneMaterial.roughness = boss ? 0.92 : 0.9;
  const middleBaseMaterial = materials.stone.clone();
  if (boss) {
    middleBaseMaterial.name = "Boss crystal dark dressed stone step";
    middleBaseMaterial.color.setHex(0x9a9996);
    middleBaseMaterial.roughness = 0.88;
    middleBaseMaterial.emissive.setHex(0xffffff);
    middleBaseMaterial.emissiveMap = middleBaseMaterial.map;
    middleBaseMaterial.emissiveIntensity = 0.028;
    retileLocalMaterialMaps(middleBaseMaterial, [0.7, 0.7], [0.53, 0.31]);
    middleBaseMaterial.emissiveMap = middleBaseMaterial.map;
  }
  const ironMaterial = materials.iron.clone();
  ironMaterial.name = boss ? "Boss crystal heavy blackened restraint iron" : ironMaterial.name;
  ironMaterial.color.setHex(boss ? 0x747a82 : 0x675a45);
  ironMaterial.roughness = boss ? 0.58 : 0.58;
  ironMaterial.metalness = boss ? 0.72 : 0.68;
  ironMaterial.envMapIntensity = boss ? 1.2 : ironMaterial.envMapIntensity;
  if (boss) {
    ironMaterial.emissive.setHex(0x111419);
    ironMaterial.emissiveMap = null;
    ironMaterial.emissiveIntensity = 0.035;
    retileLocalMaterialMaps(ironMaterial, [0.92, 0.92], [0.23, 0.41]);
  }
  const lowerBase = mesh(
    boss
      ? projectHeroUvs(
          loftGeometry(
            [
              { y: -0.14, radiusX: 1.02, radiusZ: 0.94 },
              { y: 0.08, radiusX: 1.02, radiusZ: 0.94, x: -0.015, z: 0.01 },
              { y: 0.14, radiusX: 0.92, radiusZ: 0.84, x: 0.012 },
            ],
            8,
            Math.PI / 8,
          ),
          1.35,
          71,
        )
      : new THREE.CylinderGeometry(0.82, 0.88, 0.14, 8),
    stoneMaterial,
    boss ? "Boss crystal cracked broad lower plinth" : "Shrine crystal broad lower step",
  );
  lowerBase.position.y = boss ? 0.14 : 0.07;
  const middleBase = mesh(
    boss
      ? projectHeroUvs(
          loftGeometry(
            [
              { y: -0.07, radiusX: 0.84, radiusZ: 0.78 },
              { y: 0.07, radiusX: 0.78, radiusZ: 0.72, x: 0.012, z: -0.01 },
            ],
            8,
            Math.PI / 8,
          ),
          1.2,
          83,
        )
      : new THREE.CylinderGeometry(0.68, 0.74, 0.16, 8),
    middleBaseMaterial,
    boss ? "Boss crystal broken middle plinth" : "Shrine crystal octagonal middle step",
  );
  middleBase.position.y = boss ? 0.34 : 0.22;
  const upperBase = mesh(
    boss
      ? projectHeroUvs(
          loftGeometry(
            [
              { y: -0.055, radiusX: 0.7, radiusZ: 0.65 },
              { y: 0.055, radiusX: 0.65, radiusZ: 0.6, x: -0.01 },
            ],
            8,
            Math.PI / 8,
          ),
          1.05,
          97,
        )
      : new THREE.CylinderGeometry(0.54, 0.6, 0.14, 8),
    stoneMaterial,
    boss ? "Boss crystal iron-seat upper slab" : "Shrine crystal compact upper step",
  );
  upperBase.position.y = boss ? 0.465 : 0.37;
  const crystalSeat = mesh(
    new THREE.CylinderGeometry(
      boss ? 0.57 : 0.46,
      boss ? 0.62 : 0.51,
      boss ? 0.12 : 0.09,
      8,
      1,
      false,
    ),
    ironMaterial,
    boss ? "Boss crystal recessed iron seat" : "Shrine crystal recessed iron seat",
  );
  crystalSeat.position.y = boss ? 0.565 : 0.485;
  root.add(lowerBase, middleBase, upperBase, crystalSeat);

  const crystalMaterial = boss
    ? new THREE.MeshPhysicalMaterial({
        name: "Boss crystal clean large-plane blood mineral",
        color: 0xffffff,
        vertexColors: true,
        emissive: 0x390307,
        emissiveIntensity: 0.13,
        roughness: 0.34,
        metalness: 0,
        transmission: 0.16,
        thickness: 0.9,
        ior: 1.48,
        attenuationColor: 0x6d0710,
        attenuationDistance: 1.1,
        clearcoat: 0.22,
        clearcoatRoughness: 0.26,
        envMapIntensity: 1.1,
        flatShading: true,
        transparent: false,
        depthWrite: true,
        side: THREE.FrontSide,
      })
    : materials.crystal.clone();
  if (!boss) {
    crystalMaterial.color.setHex(0xa87623);
    crystalMaterial.emissive.setHex(0xb77a20);
    crystalMaterial.emissiveIntensity = 0.42;
    crystalMaterial.roughness = 0.42;
    crystalMaterial.metalness = 0.04;
    crystalMaterial.transparent = false;
    crystalMaterial.opacity = 1;
    crystalMaterial.flatShading = true;
  }

  if (boss) {
    const crystalBody = applyBossCrystalFaceColors(
      projectHeroUvs(
        loftGeometry(
          [
            { y: 0.53, radiusX: 0.38, radiusZ: 0.34, x: 0.04, z: 0.025 },
            { y: 0.7, radiusX: 0.56, radiusZ: 0.47, x: -0.035, z: 0.045, twist: 0.08 },
            { y: 1.04, radiusX: 0.62, radiusZ: 0.52, x: 0.03, z: -0.025, twist: 0.21 },
            { y: 1.39, radiusX: 0.53, radiusZ: 0.46, x: -0.055, z: -0.045, twist: 0.12 },
            { y: 1.73, radiusX: 0.38, radiusZ: 0.33, x: -0.11, z: 0.015, twist: 0.29 },
            { y: 2.02, radiusX: 0.2, radiusZ: 0.17, x: -0.17, z: 0.055, twist: 0.18 },
            { y: 2.21, radiusX: 0.028, radiusZ: 0.024, x: -0.26, z: 0.08 },
          ],
          7,
          0.17,
        ),
        1.25,
        113,
      ),
    );
    const core = mesh(
      crystalBody,
      crystalMaterial,
      "Boss crystal single irregular large-plane blood mass",
    );
    root.add(core);

    const innerGlowMaterial = new THREE.MeshBasicMaterial({
      name: "Boss crystal compact inner ember material",
      color: 0xff3342,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    const innerCore = mesh(
      new THREE.DodecahedronGeometry(0.16, 0),
      innerGlowMaterial,
      "Boss crystal compact inner ember",
    );
    innerCore.position.set(-0.035, 1.23, 0.015);
    innerCore.scale.set(0.88, 1.28, 0.72);
    innerCore.renderOrder = 1;
    innerCore.userData.silhouetteRatio = 0.28;
    const coreLight = new THREE.PointLight(0x9b1825, 0.52, 3.1, 2);
    coreLight.name = "Boss crystal restrained inner cage fill";
    coreLight.position.set(-0.03, 1.18, 0.02);
    coreLight.userData.lightRole = "subtle rear cage readability";
    root.add(innerCore, coreLight);
  } else {
    const joinedBody = mesh(
      loftGeometry(
        [
          { y: 0.46, radiusX: 0.2, radiusZ: 0.18 },
          { y: 0.61, radiusX: 0.33, radiusZ: 0.28, twist: 0.06 },
          { y: 0.88, radiusX: 0.35, radiusZ: 0.29, twist: 0.12 },
          { y: 1.12, radiusX: 0.31, radiusZ: 0.26, twist: 0.04 },
          { y: 1.34, radiusX: 0.22, radiusZ: 0.19 },
        ],
        8,
        0.08,
      ),
      crystalMaterial,
      "Shrine crystal joined faceted gold body",
    );
    const leftProng = mesh(
      loftGeometry(
        [
          { y: 1.08, radiusX: 0.15, radiusZ: 0.14, x: -0.09 },
          { y: 1.29, radiusX: 0.18, radiusZ: 0.16, x: -0.1, twist: 0.08 },
          { y: 1.49, radiusX: 0.13, radiusZ: 0.12, x: -0.12, twist: 0.13 },
          { y: 1.69, radiusX: 0.075, radiusZ: 0.065, x: -0.14, z: 0.015, twist: 0.08 },
          { y: 1.86, radiusX: 0.018, radiusZ: 0.018, x: -0.17, z: 0.035 },
        ],
        6,
        -0.08,
      ),
      crystalMaterial,
      "Shrine crystal left forked gold prong",
    );
    const rightProng = mesh(
      loftGeometry(
        [
          { y: 1.08, radiusX: 0.15, radiusZ: 0.14, x: 0.09 },
          { y: 1.28, radiusX: 0.18, radiusZ: 0.16, x: 0.1, twist: -0.07 },
          { y: 1.47, radiusX: 0.13, radiusZ: 0.12, x: 0.12, twist: -0.12 },
          { y: 1.64, radiusX: 0.07, radiusZ: 0.06, x: 0.14, z: -0.015 },
          { y: 1.8, radiusX: 0.018, radiusZ: 0.018, x: 0.17, z: -0.035 },
        ],
        6,
        0.14,
      ),
      crystalMaterial,
      "Shrine crystal right forked gold prong",
    );
    const leftSatellite = mesh(
      loftGeometry(
        [
          { y: 0.49, radiusX: 0.07, radiusZ: 0.09, x: -0.35, z: 0.03 },
          { y: 0.62, radiusX: 0.14, radiusZ: 0.13, x: -0.38, z: 0.04, twist: 0.08 },
          { y: 0.8, radiusX: 0.1, radiusZ: 0.1, x: -0.41, z: 0.03, twist: 0.14 },
          { y: 0.98, radiusX: 0.018, radiusZ: 0.018, x: -0.45, z: 0.02 },
        ],
        5,
        -0.12,
      ),
      crystalMaterial,
      "Shrine crystal left low gold satellite",
    );
    const rightSatellite = mesh(
      loftGeometry(
        [
          { y: 0.49, radiusX: 0.07, radiusZ: 0.09, x: 0.35, z: -0.03 },
          { y: 0.62, radiusX: 0.14, radiusZ: 0.13, x: 0.38, z: -0.04, twist: -0.08 },
          { y: 0.78, radiusX: 0.1, radiusZ: 0.1, x: 0.41, z: -0.03, twist: -0.14 },
          { y: 0.94, radiusX: 0.018, radiusZ: 0.018, x: 0.45, z: -0.02 },
        ],
        5,
        0.12,
      ),
      crystalMaterial,
      "Shrine crystal right low gold satellite",
    );
    root.add(joinedBody, leftProng, rightProng, leftSatellite, rightSatellite);
  }

  if (boss) {
    const band = mesh(
      new THREE.CylinderGeometry(0.67, 0.7, 0.18, 10, 1, false),
      ironMaterial,
      "Boss crystal complete closed restraint ring",
    );
    band.position.y = 0.91;
    const bandRivets = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.055, 0),
      ironMaterial,
      10,
    );
    bandRivets.name = "Boss crystal ten visible ring bolts";
    const bandTransform = new THREE.Object3D();
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2;
      bandTransform.position.set(Math.sin(angle) * 0.715, 0.91, Math.cos(angle) * 0.715);
      bandTransform.rotation.set(0, angle, 0);
      bandTransform.updateMatrix();
      bandRivets.setMatrixAt(index, bandTransform.matrix);
    }
    bandRivets.instanceMatrix.needsUpdate = true;
    root.add(band, bandRivets);
  }

  const braceCount = boss ? 5 : 4;
  const braceRadius = boss ? 0.74 : 0.5;
  const supportFeet = new THREE.InstancedMesh(
    new THREE.BoxGeometry(boss ? 0.28 : 0.2, boss ? 0.14 : 0.12, boss ? 0.24 : 0.18),
    ironMaterial,
    braceCount,
  );
  supportFeet.name = boss
    ? "Boss crystal broad iron support feet"
    : "Shrine crystal ceremonial support feet";
  const supportRivets = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(boss ? 0.068 : 0.052, 0),
    ironMaterial,
    braceCount,
  );
  supportRivets.name = boss
    ? "Boss crystal restraint rivets"
    : "Shrine crystal ceremonial restraint rivets";
  const transform = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  for (let index = 0; index < braceCount; index += 1) {
    const angle = (index / braceCount) * Math.PI * 2 + (boss ? 0 : Math.PI / 4);
    const radialPoint = (radius: number, y: number) =>
      new THREE.Vector3(Math.sin(angle) * radius, y, Math.cos(angle) * radius);
    const braceStart = radialPoint(braceRadius + (boss ? 0.09 : 0.065), boss ? 0.54 : 0.49);
    const braceEnd = radialPoint(braceRadius - (boss ? 0.13 : 0.085), boss ? 1.49 : 1.2);
    const braceDirection = braceEnd.clone().sub(braceStart);
    const brace = mesh(
      taperedChamferBoxGeometry(
        [boss ? 0.2 : 0.14, braceDirection.length(), boss ? 0.17 : 0.12],
        boss ? 0.022 : 0.016,
        boss ? 1.22 : 1.16,
        boss ? 0.82 : 0.78,
      ),
      ironMaterial,
      boss ? "Boss crystal complete heavy cage post" : "Shrine crystal inclined ceremonial brace",
    );
    brace.position.copy(braceStart).add(braceEnd).multiplyScalar(0.5);
    brace.quaternion.setFromUnitVectors(up, braceDirection.normalize());
    root.add(brace);

    transform.position.copy(radialPoint(braceRadius + 0.085, boss ? 0.57 : 0.51));
    transform.rotation.set(0, angle, 0);
    transform.updateMatrix();
    supportFeet.setMatrixAt(index, transform.matrix);
    transform.position.copy(radialPoint(braceRadius + 0.055, boss ? 0.91 : 0.8));
    transform.rotation.set(0, angle, 0);
    transform.updateMatrix();
    supportRivets.setMatrixAt(index, transform.matrix);
  }
  supportFeet.instanceMatrix.needsUpdate = true;
  supportRivets.instanceMatrix.needsUpdate = true;
  root.add(supportFeet, supportRivets);

  if (boss) {
    const upperClamps = new THREE.InstancedMesh(
      taperedChamferBoxGeometry([0.32, 0.22, 0.26], 0.025, 1.18, 0.84),
      ironMaterial,
      braceCount,
    );
    upperClamps.name = "Boss crystal five thick upper clamp jaws";
    for (let index = 0; index < braceCount; index += 1) {
      const angle = (index / braceCount) * Math.PI * 2;
      transform.position.set(Math.sin(angle) * 0.61, 1.48, Math.cos(angle) * 0.61);
      transform.rotation.set(0, angle, 0);
      transform.updateMatrix();
      upperClamps.setMatrixAt(index, transform.matrix);
    }
    upperClamps.instanceMatrix.needsUpdate = true;
    upperClamps.castShadow = true;
    upperClamps.receiveShadow = true;
    upperClamps.userData.instanceCount = braceCount;
    root.add(upperClamps);

    const lowerCollar = mesh(
      new THREE.TorusGeometry(0.62, 0.055, 5, 20),
      ironMaterial,
      "Boss crystal complete lower cage collar",
    );
    lowerCollar.rotation.x = Math.PI / 2;
    lowerCollar.position.y = 0.64;
    root.add(lowerCollar);
  }

  const reliefMaterial = materials.brass.clone();
  reliefMaterial.color.setHex(boss ? 0xa46f39 : 0xb69a62);
  reliefMaterial.roughness = 0.5;
  const reliefShape = new THREE.Shape();
  if (boss) {
    reliefShape.moveTo(-0.17, -0.08);
    reliefShape.lineTo(-0.17, 0.03);
    reliefShape.lineTo(-0.09, -0.01);
    reliefShape.lineTo(0, 0.14);
    reliefShape.lineTo(0.09, -0.01);
    reliefShape.lineTo(0.17, 0.03);
    reliefShape.lineTo(0.17, -0.08);
  } else {
    reliefShape.moveTo(0, 0.1);
    reliefShape.lineTo(0.078, 0);
    reliefShape.lineTo(0, -0.1);
    reliefShape.lineTo(-0.078, 0);
  }
  reliefShape.closePath();
  const relief = mesh(
    new THREE.ExtrudeGeometry(reliefShape, {
      depth: boss ? 0.04 : 0.026,
      bevelEnabled: false,
      curveSegments: 1,
    }),
    reliefMaterial,
    boss ? "Boss crystal front crown rune" : "Shrine crystal carved front diamond rune",
  );
  relief.position.set(0, boss ? 0.9 : 0.22, boss ? 0.622 : 0.704);
  root.add(relief);

  const interactionSocket = new THREE.Object3D();
  interactionSocket.name = boss
    ? "Boss crystal interaction socket"
    : "Shrine crystal interaction socket";
  interactionSocket.position.set(0, boss ? 0.95 : 0.76, boss ? 0.6 : 0.48);
  const vfxSocket = new THREE.Object3D();
  vfxSocket.name = boss ? "Boss crystal vfx socket" : "Shrine crystal vfx socket";
  vfxSocket.position.y = boss ? 1.28 : 1.03;
  root.add(interactionSocket, vfxSocket);

  root.userData.asset = assetId;
  root.userData.reference = `assets-source/imagegen/model-references-v2/magic/${boss ? "boss" : "shrine"}-crystal-three-view.png`;
  root.userData.collider = boss
    ? { type: "box", size: [1.86, 2.14, 1.76], center: [0, 1.07, 0] }
    : { type: "box", size: [1.58, 1.72, 1.4], center: [0, 0.86, 0] };
  root.userData.detailInventory = boss
    ? [
        "one irregular blood crystal with large colored planes and an offset tip",
        "small compact ember core contained inside the outer silhouette",
        "five complete heavy cage posts with broad feet, clamp jaws, and restraint rivets",
        "closed restraint ring, lower collar, ten ring bolts, and front crown rune",
        "rough dark-stone pedestal with planar UVs and a recessed iron seat",
      ]
    : [
        "clear central gold prism with a narrow forked crown and two low satellites",
        "four inclined ceremonial braces with broad feet and instanced rivets",
        "carved front diamond rune and recessed iron seat",
        "tall four-step octagonal shrine plinth",
      ];
  root.userData.sculptRuntime = {
    topology: boss
      ? "one closed irregular seven-sided blood-crystal loft with no duplicate outer masses"
      : "joined eight-sided prism, two closed crown prongs, and two low satellites",
    materialRoles: boss
      ? ["dark-load-bearing-stone", "blackened-iron", "transmissive-crystal", "inner-glow"]
      : ["darkStone", "stone", "iron", "crystal"],
    nodes: ["stepped-base", "crystal-body", "crystal-lobes", "relief-rune", "curved-braces"],
    sockets: ["interaction", "vfx"],
    pivots: {
      interaction: interactionSocket.position.toArray(),
      vfx: vfxSocket.position.toArray(),
    },
    destructionGroups: ["plinth", "brace-cage", "crystal-core"],
    ...(boss
      ? {
         opticalDepth: {
            transmission: 0.16,
            thickness: 0.9,
            innerGlowOpacity: 0.46,
          },
          localIndirectFill: {
            loadBearingStone: 0.035,
            dressedStone: 0.028,
            blackenedIron: 0.035,
          },
          cage: { posts: 5, ringBolts: 10, lowerCollars: 1 },
          texturePolicy: {
            crystal: "large per-face color fields without tiled albedo",
            pedestal: "non-mirrored local ImageGen stone PBR",
          },
        }
      : {}),
  };
  return root;
}

function createGraveCrossGeometry(depth = 0.04, bevelSize = 0.004): THREE.ExtrudeGeometry {
  const cross = new THREE.Shape();
  cross.moveTo(0, 0.5);
  cross.lineTo(-0.055, 0.58);
  cross.lineTo(-0.055, 0.95);
  cross.lineTo(-0.235, 0.95);
  cross.lineTo(-0.305, 1.01);
  cross.lineTo(-0.235, 1.075);
  cross.lineTo(-0.055, 1.075);
  cross.lineTo(-0.055, 1.285);
  cross.lineTo(0, 1.37);
  cross.lineTo(0.055, 1.285);
  cross.lineTo(0.055, 1.075);
  cross.lineTo(0.235, 1.075);
  cross.lineTo(0.305, 1.01);
  cross.lineTo(0.235, 0.95);
  cross.lineTo(0.055, 0.95);
  cross.lineTo(0.055, 0.58);
  cross.closePath();
  const geometry = new THREE.ExtrudeGeometry(cross, {
    depth,
    steps: 1,
    bevelEnabled: bevelSize > 0,
    bevelSegments: 1,
    bevelSize,
    bevelThickness: bevelSize,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function traceGraveOgive(
  path: THREE.Shape | THREE.Path,
  width: number,
  height: number,
  shoulderY: number,
  clockwise = false,
): void {
  const halfWidth = width / 2;
  const controlX = halfWidth * 0.94;
  const controlY = THREE.MathUtils.lerp(shoulderY, height, 0.64);
  if (clockwise) {
    path.moveTo(-halfWidth, 0);
    path.lineTo(-halfWidth, shoulderY);
    path.quadraticCurveTo(-controlX, controlY, 0, height);
    path.quadraticCurveTo(controlX, controlY, halfWidth, shoulderY);
    path.lineTo(halfWidth, 0);
  } else {
    path.moveTo(-halfWidth, 0);
    path.lineTo(halfWidth, 0);
    path.lineTo(halfWidth, shoulderY);
    path.quadraticCurveTo(controlX, controlY, 0, height);
    path.quadraticCurveTo(-controlX, controlY, -halfWidth, shoulderY);
  }
  path.closePath();
}

function createGraveOgiveShape(width: number, height: number, shoulderY: number): THREE.Shape {
  const shape = new THREE.Shape();
  traceGraveOgive(shape, width, height, shoulderY);
  return shape;
}

function createDamagedGraveSlabShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-0.43, 0);
  shape.lineTo(0.43, 0);
  shape.lineTo(0.43, 0.72);
  shape.lineTo(0.398, 0.81);
  shape.lineTo(0.424, 0.9);
  shape.lineTo(0.37, 1.08);
  shape.lineTo(0.31, 1.23);
  shape.lineTo(0.235, 1.34);
  shape.lineTo(0.168, 1.43);
  shape.lineTo(0.11, 1.47);
  shape.lineTo(0, 1.56);
  shape.lineTo(-0.095, 1.485);
  shape.lineTo(-0.17, 1.43);
  shape.lineTo(-0.225, 1.36);
  shape.lineTo(-0.305, 1.25);
  shape.lineTo(-0.36, 1.1);
  shape.lineTo(-0.405, 0.96);
  shape.lineTo(-0.382, 0.875);
  shape.lineTo(-0.43, 0.79);
  shape.closePath();
  return shape;
}

function createBrokenGraveBaseGeometry(): THREE.BufferGeometry {
  const geometry = taperedChamferBoxGeometry([1.26, 0.34, 0.66], 0.055, 0.96, 0.94);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index += 1) {
    let x = position.getX(index);
    let y = position.getY(index);
    let z = position.getZ(index);
    if (x > 0.45 && z > 0.18) {
      x -= 0.075;
      z -= 0.055;
    }
    if (x < -0.48 && z < -0.14) {
      x += 0.065;
      z += 0.035;
    }
    if (y > 0.11 && x > 0.08 && x < 0.34 && z > 0.2) y -= 0.035;
    if (y < -0.11 && x < -0.22 && z > 0.16) y += 0.02;
    position.setXYZ(index, x, y, z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.damageProfile = "four large asymmetric silhouette chips";
  return projectHeroUvs(geometry, 1.45, 131);
}

function createPointedGraveChannelGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.48);
  shape.lineTo(0.042, -0.415);
  shape.lineTo(0.027, -0.15);
  shape.lineTo(0.058, -0.095);
  shape.lineTo(0.027, -0.035);
  shape.lineTo(0.027, 0.39);
  shape.lineTo(0, 0.48);
  shape.lineTo(-0.027, 0.39);
  shape.lineTo(-0.027, -0.035);
  shape.lineTo(-0.058, -0.095);
  shape.lineTo(-0.027, -0.15);
  shape.lineTo(-0.042, -0.415);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.018,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.004,
    bevelThickness: 0.003,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -0.009);
  geometry.userData.pointedTerminations = true;
  return projectHeroUvs(geometry, 0.9, 149);
}

function createGraveInsetBorderGeometry(): THREE.ExtrudeGeometry {
  const outline = createGraveOgiveShape(0.79, 1.43, 0.87);
  const opening = new THREE.Path();
  traceGraveOgive(opening, 0.69, 1.31, 0.79, true);
  outline.holes.push(opening);
  const depth = 0.018;
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 5,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

interface PillarRing {
  y: number;
  radius: number;
}

/** One closed shell keeps the cap planar and removes stacked-cylinder seams. */
function createSteppedOctagonalPillarGeometry(rings: readonly PillarRing[]): THREE.BufferGeometry {
  const sides = 8;
  const height = rings.at(-1)?.y ?? 1;
  const maximumRadius = Math.max(...rings.map((ring) => ring.radius));
  // The shared stone maps repeat 2.3x with mirrored wrapping. Keep this cap
  // inside one transformed texture cell, away from both mirror axes, so the
  // flat top cannot form a kaleidoscopic rosette around its center.
  const capUvCenter = [0.24, 0.63] as const;
  const capUvSpan = maximumRadius * 5.5;
  const positions: number[] = [];
  const uvs: number[] = [];

  const pushTriangle = (
    a: readonly [number, number, number],
    b: readonly [number, number, number],
    c: readonly [number, number, number],
    uvA: readonly [number, number],
    uvB: readonly [number, number],
    uvC: readonly [number, number],
  ) => {
    positions.push(...a, ...b, ...c);
    uvs.push(...uvA, ...uvB, ...uvC);
  };

  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const lower = rings[ringIndex]!;
    const upper = rings[ringIndex + 1]!;
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      const angle = (side / sides) * Math.PI * 2 + Math.PI / 8;
      const nextAngle = (next / sides) * Math.PI * 2 + Math.PI / 8;
      const a = [Math.sin(angle) * lower.radius, lower.y, Math.cos(angle) * lower.radius] as const;
      const b = [
        Math.sin(nextAngle) * lower.radius,
        lower.y,
        Math.cos(nextAngle) * lower.radius,
      ] as const;
      const c = [
        Math.sin(nextAngle) * upper.radius,
        upper.y,
        Math.cos(nextAngle) * upper.radius,
      ] as const;
      const d = [Math.sin(angle) * upper.radius, upper.y, Math.cos(angle) * upper.radius] as const;
      const u0 = side / sides;
      const u1 = (side + 1) / sides;
      const v0 = lower.y / height;
      const v1 = upper.y / height;
      pushTriangle(a, b, d, [u0, v0], [u1, v0], [u0, v1]);
      pushTriangle(b, c, d, [u1, v0], [u1, v1], [u0, v1]);
    }
  }

  const addCap = (ring: PillarRing, top: boolean) => {
    const center = [0, ring.y, 0] as const;
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      const angle = (side / sides) * Math.PI * 2 + Math.PI / 8;
      const nextAngle = (next / sides) * Math.PI * 2 + Math.PI / 8;
      const a = [Math.sin(angle) * ring.radius, ring.y, Math.cos(angle) * ring.radius] as const;
      const b = [
        Math.sin(nextAngle) * ring.radius,
        ring.y,
        Math.cos(nextAngle) * ring.radius,
      ] as const;
      const uv = (point: readonly [number, number, number]) =>
        [capUvCenter[0] + point[0] / capUvSpan, capUvCenter[1] + point[2] / capUvSpan] as const;
      // Keep cap normals facing away from the closed shell. A reversed top cap
      // makes normal-mapped stone shade as eight separate wedges even though
      // the UV coordinates themselves are planar and continuous.
      if (top) pushTriangle(center, a, b, capUvCenter, uv(a), uv(b));
      else pushTriangle(center, b, a, capUvCenter, uv(b), uv(a));
    }
  };
  addCap(rings[0]!, false);
  addCap(rings.at(-1)!, true);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.planarCapUvs = true;
  return geometry;
}

function createPillarFluteGeometry(): THREE.ExtrudeGeometry {
  const width = 0.135;
  const height = 1.62;
  const shoulder = 0.075;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2 + shoulder);
  shape.lineTo(0, -height / 2);
  shape.lineTo(width / 2, -height / 2 + shoulder);
  shape.lineTo(width / 2, height / 2 - shoulder);
  shape.lineTo(0, height / 2);
  shape.lineTo(-width / 2, height / 2 - shoulder);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.025,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -0.0125);
  return geometry;
}

function graveMarker(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted gothic grave marker v3";

  const slabStone = materials.darkStone.clone();
  slabStone.name = "Grave charcoal funerary stone";
  slabStone.color.setHex(0x858684);
  slabStone.roughness = 0.96;
  slabStone.envMapIntensity = 0.34;
  retileLocalMaterialMaps(slabStone, [0.72, 0.72], [0.13, 0.27]);
  slabStone.emissive.setHex(0xffffff);
  slabStone.emissiveMap = slabStone.map;
  slabStone.emissiveIntensity = 0.026;
  slabStone.userData.localValueLift = 0.026;

  const edgeStone = materials.stone.clone();
  edgeStone.name = "Grave dry chipped edge stone";
  edgeStone.color.setHex(0xa1a09a);
  edgeStone.roughness = 0.94;
  edgeStone.envMapIntensity = 0.38;
  retileLocalMaterialMaps(edgeStone, [0.66, 0.66], [0.46, 0.08]);
  edgeStone.emissive.setHex(0xffffff);
  edgeStone.emissiveMap = edgeStone.map;
  edgeStone.emissiveIntensity = 0.02;
  edgeStone.userData.localValueLift = 0.02;

  const carvedStone = slabStone.clone();
  carvedStone.name = "Grave recessed carved stone";
  carvedStone.color.setHex(0x3d4041);
  carvedStone.emissive.setHex(0x080909);
  carvedStone.emissiveMap = null;
  carvedStone.emissiveIntensity = 0.01;

  const graveIron = materials.iron.clone();
  graveIron.name = "Grave dark neutral forged iron";
  graveIron.color.setHex(0x555c63);
  graveIron.roughness = 0.58;
  graveIron.metalness = 0.72;
  graveIron.envMapIntensity = 1.2;
  graveIron.emissive.setHex(0x0b0d10);
  graveIron.emissiveMap = null;
  graveIron.emissiveIntensity = 0.025;
  retileLocalMaterialMaps(graveIron, [0.86, 0.86], [0.29, 0.51]);

  const outline = createDamagedGraveSlabShape();
  const slabGeometry = new THREE.ExtrudeGeometry(outline, {
    depth: 0.28,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.024,
    bevelThickness: 0.02,
    curveSegments: 1,
  });
  slabGeometry.translate(0, 0.34, -0.14);
  projectHeroUvs(slabGeometry, 1.32, 163);
  slabGeometry.userData.damagedSilhouette = true;
  const slab = mesh(slabGeometry, slabStone, "Damaged thick gothic grave slab");
  const brokenBase = mesh(
    createBrokenGraveBaseGeometry(),
    edgeStone,
    "Grave one-piece broken thick base",
  );
  brokenBase.position.y = 0.17;

  const insetBorder = mesh(
    createGraveInsetBorderGeometry(),
    edgeStone,
    "Grave gothic inset edge frame",
  );
  projectHeroUvs(insetBorder.geometry, 1.18, 181);
  insetBorder.position.set(0, 0.39, 0.172);

  const carvedCross = mesh(
    createGraveCrossGeometry(0.014, 0),
    carvedStone,
    "Grave recessed central cross carving",
  );
  carvedCross.scale.set(1.17, 1.05, 1);
  carvedCross.position.set(0, 0.04, 0.174);

  const sigilCross = mesh(
    createGraveCrossGeometry(0.04, 0.003),
    graveIron,
    "Grave raised pointed iron cross sigil",
  );
  projectHeroUvs(sigilCross.geometry, 0.95, 193);
  sigilCross.position.set(0, 0.04, 0.184);
  sigilCross.userData.surfaceClearance = 0.006;

  const rearGrooves = new THREE.Group();
  rearGrooves.name = "Grave rear paired carved channels";
  for (const x of [-0.16, 0.16]) {
    const groove = mesh(
      createPointedGraveChannelGeometry(),
      carvedStone,
      "Grave rear pointed carved channel",
    );
    groove.position.set(x, 1.08, -0.172);
    rearGrooves.add(groove);
  }

  const rivetGeometry = new THREE.SphereGeometry(0.018, 6, 4);
  const rivetPositions = [
    [0, 0.57],
    [0, 1.01],
    [0, 1.32],
  ] as const;
  const rivets = new THREE.InstancedMesh(rivetGeometry, graveIron, rivetPositions.length);
  rivets.name = "Grave iron cross rivet";
  rivets.castShadow = true;
  rivets.receiveShadow = true;
  rivets.userData.repetitionSystem = "three restrained cross fasteners";
  rivets.userData.instanceCount = rivetPositions.length;
  const rivetTransform = new THREE.Object3D();
  for (const [index, [x, y]] of rivetPositions.entries()) {
    rivetTransform.position.set(x, y, 0.183);
    rivetTransform.updateMatrix();
    rivets.setMatrixAt(index, rivetTransform.matrix);
  }
  rivets.instanceMatrix.needsUpdate = true;

  root.add(
    slab,
    brokenBase,
    insetBorder,
    carvedCross,
    sigilCross,
    rearGrooves,
    rivets,
  );
  root.userData.asset = "grave-marker";
  root.userData.reference =
    "assets-source/imagegen/model-references-v2/architecture/grave-marker-three-view.png";
  root.userData.collider = { type: "box", size: [1.18, 1.86, 0.58], center: [0, 0.93, 0] };
  root.userData.detailInventory = [
    "damaged low-poly gothic slab with large contour chips",
    "one thick broken and chamfered stone base",
    "carved inset border and recessed central cross",
    "dark forged-iron cross with three restrained rivets",
    "paired rear stone-cut channels with pointed carved terminations",
  ];
  root.userData.sculptRuntime = {
    topology: "closed damaged ogive slab, one thick broken base, and two-sided carved relief",
    materialRoles: ["charcoal-funerary-stone", "dry-edge-stone", "dark-forged-iron"],
    localContrast: {
      slabValueLift: 0.026,
      edgeValueLift: 0.02,
      slabIndirectFill: 0.026,
    },
    texturePolicy: "non-mirrored local ImageGen stone and iron PBR with per-piece UV offsets",
  };
  return root;
}

function pillar(materials: DungeonMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted carved octagonal pillar v2";
  const shellStone = materials.stone.clone();
  shellStone.name = "Pillar locally lifted structural stone";
  shellStone.color.offsetHSL(0, -0.01, 0.07);
  shellStone.roughness = Math.min(shellStone.roughness, 0.94);
  shellStone.emissive.copy(shellStone.color);
  shellStone.emissiveMap = shellStone.map;
  shellStone.emissiveIntensity = 0.065;
  shellStone.userData.localValueLift = 0.07;

  const carvedStone = materials.darkStone.clone();
  carvedStone.name = "Pillar locally separated carved relief";
  carvedStone.color.offsetHSL(0, -0.01, 0.018);
  carvedStone.emissive.copy(carvedStone.color);
  carvedStone.emissiveMap = carvedStone.map;
  carvedStone.emissiveIntensity = 0.028;
  carvedStone.userData.localValueLift = 0.018;

  const friezeStone = materials.darkStone.clone();
  friezeStone.name = "Pillar locally lifted geometric frieze";
  friezeStone.color.offsetHSL(0, -0.015, 0.085);
  friezeStone.roughness = Math.min(friezeStone.roughness, 0.93);
  friezeStone.emissive.copy(friezeStone.color);
  friezeStone.emissiveMap = friezeStone.map;
  friezeStone.emissiveIntensity = 0.085;
  friezeStone.userData.localValueLift = 0.085;

  const motifStone = materials.darkStone.clone();
  motifStone.name = "Pillar Frost-readable raised diamond motif";
  motifStone.color.offsetHSL(0, -0.02, 0.14);
  motifStone.roughness = Math.min(motifStone.roughness, 0.9);
  motifStone.emissive.copy(motifStone.color);
  motifStone.emissiveMap = motifStone.map;
  motifStone.emissiveIntensity = 0.105;
  motifStone.userData.localValueLift = 0.14;
  const shell = mesh(
    createSteppedOctagonalPillarGeometry([
      { y: 0, radius: 0.52 },
      { y: 0.18, radius: 0.52 },
      { y: 0.18, radius: 0.46 },
      { y: 0.34, radius: 0.46 },
      { y: 0.34, radius: 0.34 },
      { y: 2.35, radius: 0.315 },
      { y: 2.35, radius: 0.35 },
      { y: 2.53, radius: 0.43 },
      { y: 2.53, radius: 0.46 },
      { y: 2.73, radius: 0.52 },
    ]),
    shellStone,
    "Pillar seamless stepped octagonal shell",
  );
  shell.userData.closedVolume = true;
  shell.userData.planarCapUvs = true;
  root.add(shell);

  const collarGeometry = new THREE.CylinderGeometry(1, 1, 1, 8);
  const collars = new THREE.InstancedMesh(collarGeometry, friezeStone, 2);
  collars.name = "Pillar continuous octagonal frieze band";
  collars.castShadow = true;
  collars.receiveShadow = true;
  collars.userData.instanceCount = 2;
  const transform = new THREE.Object3D();
  for (const [index, [radius, y]] of [
    [0.37, 0.45],
    [0.37, 2.25],
  ].entries()) {
    transform.position.set(0, y, 0);
    transform.scale.set(radius, 0.2, radius);
    transform.updateMatrix();
    collars.setMatrixAt(index, transform.matrix);
  }
  collars.instanceMatrix.needsUpdate = true;
  root.add(collars);

  const fluteGeometry = createPillarFluteGeometry();
  const flutes = new THREE.InstancedMesh(fluteGeometry, carvedStone, 8);
  flutes.name = "Pillar recessed vertical flute";
  flutes.castShadow = true;
  flutes.receiveShadow = true;
  flutes.userData.instanceCount = 8;
  const fluteDistance = 0.323;
  for (let side = 0; side < 8; side += 1) {
    const angle = (side / 8) * Math.PI * 2;
    transform.position.set(Math.sin(angle) * fluteDistance, 1.35, Math.cos(angle) * fluteDistance);
    transform.rotation.set(0, angle, 0);
    transform.scale.set(1, 1, 1);
    transform.updateMatrix();
    flutes.setMatrixAt(side, transform.matrix);
  }
  flutes.instanceMatrix.needsUpdate = true;
  root.add(flutes);

  const diamondGeometry = new THREE.BoxGeometry(0.08, 0.08, 0.032);
  const diamonds = new THREE.InstancedMesh(diamondGeometry, motifStone, 32);
  diamonds.name = "Pillar continuous double-diamond frieze relief";
  diamonds.castShadow = true;
  diamonds.receiveShadow = true;
  diamonds.userData.instanceCount = 32;
  diamonds.userData.repetitionSystem = "two continuous octagonal double-diamond friezes";
  let diamondIndex = 0;
  for (const y of [0.45, 2.25]) {
    for (let side = 0; side < 8; side += 1) {
      const angle = (side / 8) * Math.PI * 2;
      for (const tangentOffset of [-0.053, 0.053]) {
        transform.position.set(
          Math.sin(angle) * 0.358 + Math.cos(angle) * tangentOffset,
          y,
          Math.cos(angle) * 0.358 - Math.sin(angle) * tangentOffset,
        );
        transform.rotation.set(0, angle, Math.PI / 4);
        transform.scale.set(1, 1, 1);
        transform.updateMatrix();
        diamonds.setMatrixAt(diamondIndex, transform.matrix);
        diamondIndex += 1;
      }
    }
  }
  diamonds.instanceMatrix.needsUpdate = true;
  root.add(diamonds);
  root.userData.asset = "carved-pillar";
  root.userData.reference =
    "assets-source/imagegen/model-references-v2/architecture/carved-pillar-three-view.png";
  root.userData.collider = { type: "cylinder", radius: 0.52, height: 2.73, center: [0, 1.365, 0] };
  root.userData.detailInventory = [
    "stepped octagonal base",
    "eight recessed shaft flutes",
    "two continuous octagonal double-diamond friezes",
    "stepped octagonal capital",
  ];
  root.userData.sculptRuntime = {
    topology: "single closed stepped octagonal shell with planar cap UVs and instanced relief",
    materialRoles: ["stone", "darkStone", "liftedFriezeStone", "raisedMotifStone"],
    drawCalls: 4,
    localContrast: {
      structuralStoneValueLift: 0.07,
      carvedReliefValueLift: 0.018,
      geometricFriezeValueLift: 0.085,
      raisedMotifValueLift: 0.14,
      structuralStoneIndirectFill: 0.065,
      carvedReliefIndirectFill: 0.028,
      geometricFriezeIndirectFill: 0.085,
      raisedMotifIndirectFill: 0.105,
    },
  };
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
