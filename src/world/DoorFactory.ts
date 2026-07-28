import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { DungeonMaterials } from "./MaterialLibrary";

export type DungeonDoorStyle = "dungeon" | "office";

export interface DungeonArchOptions {
  width?: number;
  doorLeaf?: boolean;
  /** Full masonry height so the frame seals the room to the ceiling. */
  wallHeight?: number;
  /** Clear height of the walkable opening under the lintel. */
  openingHeight?: number;
  /** Office doors stay square; dungeon doors gain a curved masonry trim. */
  style?: DungeonDoorStyle;
  curvedArch?: boolean;
  frameMaterial?: THREE.Material;
  leafMaterial?: THREE.Material;
  hardwareMaterial?: THREE.Material;
}

/** World placement for a doorway on a room/corridor boundary. */
export interface DoorwayPlacement {
  x: number;
  z: number;
  rotation: number;
}

function boxGeometry(
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  rotationZ = 0,
): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(...size);
  const normal = geometry.getAttribute("normal") as THREE.BufferAttribute;
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  const tileSize = 0.6;
  for (let index = 0; index < uv.count; index += 1) {
    const normalX = Math.abs(normal.getX(index));
    const normalY = Math.abs(normal.getY(index));
    const uScale = (normalX > 0.5 ? size[2] : size[0]) / tileSize;
    const vScale = (normalY > 0.5 ? size[2] : size[1]) / tileSize;
    uv.setXY(index, uv.getX(index) * uScale, uv.getY(index) * vScale);
  }
  uv.needsUpdate = true;
  geometry.rotateZ(rotationZ);
  geometry.translate(...position);
  return geometry;
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error("Door geometry parts could not be merged");
  for (const part of parts) part.dispose();
  return merged;
}

function projectLeafUvs(
  geometry: THREE.BufferGeometry,
  side: -1 | 1,
  leafWidth: number,
  leafHeight: number,
  leafDepth: number,
): void {
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const normal = geometry.getAttribute("normal") as THREE.BufferAttribute;
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  const halfMin = side < 0 ? 0 : 0.5;
  const halfMax = side < 0 ? 0.5 : 1;
  // The generated plate reserves almost all pixels for the front and rear.
  // Use a narrow strip at each edge for the leaf thickness so every textured
  // triangle has area without pulling a full painted panel around the sides.
  const edgeSpan = 1 / 64;
  for (let index = 0; index < position.count; index += 1) {
    const inwardRatio = THREE.MathUtils.clamp((position.getX(index) * -side) / leafWidth, 0, 1);
    const panelU = side < 0 ? inwardRatio * 0.5 : 1 - inwardRatio * 0.5;
    const panelV = THREE.MathUtils.clamp(position.getY(index) / leafHeight, 0, 1);
    const depthRatio = THREE.MathUtils.clamp(position.getZ(index) / leafDepth + 0.5, 0, 1);
    const normalX = normal.getX(index);
    const normalY = normal.getY(index);

    if (Math.abs(normalX) > 0.5) {
      const edgeU = Math.abs(panelU - halfMin) < Math.abs(panelU - halfMax) ? halfMin : halfMax;
      const direction = edgeU === halfMin ? 1 : -1;
      uv.setXY(index, edgeU + direction * depthRatio * edgeSpan, panelV);
    } else if (Math.abs(normalY) > 0.5) {
      uv.setXY(index, panelU, normalY < 0 ? depthRatio * edgeSpan : 1 - depthRatio * edgeSpan);
    } else {
      uv.setXY(index, panelU, panelV);
    }
  }
  uv.needsUpdate = true;
}

function addDungeonFrameBlocks(
  parts: THREE.BufferGeometry[],
  postX: number,
  safeOpening: number,
  frameDepth: number,
  openingWidth: number,
): void {
  const blockCount = 5;
  const gap = 0.025;
  const blockHeight = safeOpening / blockCount;
  for (const side of [-1, 1]) {
    for (let index = 0; index < blockCount; index += 1) {
      const height = blockHeight - gap;
      const y = blockHeight * index + blockHeight / 2;
      parts.push(
        boxGeometry(
          [0.33, height, frameDepth + 0.08],
          [side * postX, y, 0.015],
          side * (index % 2 === 0 ? 0.012 : -0.009),
        ),
      );
    }
  }

  const radius = openingWidth * 0.5;
  const voussoirCount = 9;
  const segmentLength = (Math.PI * radius) / voussoirCount + 0.045;
  for (let index = 0; index < voussoirCount; index += 1) {
    const angle = ((index + 0.5) / voussoirCount) * Math.PI;
    parts.push(
      boxGeometry(
        [segmentLength, 0.31, frameDepth + 0.095],
        [Math.cos(angle) * radius, safeOpening + Math.sin(angle) * radius, 0.025],
        angle + Math.PI / 2,
      ),
    );
  }

  const keystone = new THREE.ConeGeometry(0.24, 0.38, 4);
  keystone.rotateZ(Math.PI);
  keystone.rotateY(Math.PI / 4);
  keystone.scale(1, 1, 0.78);
  keystone.translate(0, safeOpening + radius + 0.08, frameDepth * 0.14);
  parts.push(keystone);
}

function addOfficeFrame(
  parts: THREE.BufferGeometry[],
  width: number,
  height: number,
  depth: number,
) {
  const rail = 0.15;
  parts.push(
    boxGeometry([rail, height, depth + 0.04], [-width / 2 + rail / 2, height / 2, 0.01]),
    boxGeometry([rail, height, depth + 0.04], [width / 2 - rail / 2, height / 2, 0.01]),
    boxGeometry([width, rail, depth + 0.04], [0, height - rail / 2, 0.01]),
    boxGeometry([width, 0.09, depth + 0.055], [0, 0.045, 0.02]),
  );
}

function addRectangularDoorFrame(
  parts: THREE.BufferGeometry[],
  width: number,
  openingHeight: number,
  wallHeight: number,
  depth: number,
): void {
  const jambWidth = 0.28;
  const lintelHeight = 0.22;
  const openingWidth = width - jambWidth * 2;
  const framedHeight = openingHeight + lintelHeight;
  const jambX = width / 2 - jambWidth / 2;
  const faceDepth = depth + 0.04;

  parts.push(
    boxGeometry([jambWidth, framedHeight, faceDepth], [-jambX, framedHeight / 2, 0]),
    boxGeometry([jambWidth, framedHeight, faceDepth], [jambX, framedHeight / 2, 0]),
    boxGeometry([openingWidth, lintelHeight, faceDepth], [0, openingHeight + lintelHeight / 2, 0]),
  );

  const headerHeight = Math.max(0, wallHeight - framedHeight);
  if (headerHeight > 0.001) {
    parts.push(
      boxGeometry([openingWidth, headerHeight, depth], [0, framedHeight + headerHeight / 2, -0.02]),
    );
  }
}

/**
 * Sit the frame on the wall plane between a floor cell and the outside opening.
 * Faces into the room so leaves swing clear of the corridor.
 */
export function doorwayPlacement(
  cellWorld: { x: number; z: number },
  outDx: number,
  outDy: number,
  tileSize: number,
): DoorwayPlacement {
  return {
    x: cellWorld.x + outDx * tileSize * 0.5,
    z: cellWorld.z + outDy * tileSize * 0.5,
    // Local +Z is the room-facing side of the frame.
    rotation: Math.atan2(-outDx, -outDy),
  };
}

export function createDungeonArch(
  materials: DungeonMaterials,
  {
    width = 2.06,
    doorLeaf = false,
    wallHeight = 4.4,
    openingHeight = 2.35,
    style = "dungeon",
    curvedArch = style !== "office",
    frameMaterial = materials.stone,
    leafMaterial = materials.wood,
    hardwareMaterial = materials.iron,
  }: DungeonArchOptions = {},
): THREE.Group {
  const safeWidth = Math.max(1.64, width);
  const safeWallHeight = Math.max(2.8, wallHeight);
  const safeOpening = Math.min(Math.max(2.05, openingHeight), safeWallHeight - 0.55);
  const postHalfWidth = 0.14;
  const frameDepth = 0.42;
  const lintelHeight = 0.28;
  const root = new THREE.Group();
  root.name = doorLeaf ? "Closed dungeon doorway" : "Passable creation arch";
  root.userData.passable = !doorLeaf;
  root.userData.closed = doorLeaf;
  root.userData.clearance = safeWidth - postHalfWidth * 4;
  root.userData.wallHeight = safeWallHeight;
  root.userData.openingHeight = safeOpening;
  root.userData.doorStyle = style;
  root.userData.curvedArch = curvedArch;
  root.userData.frameShape = doorLeaf ? "rectangular" : curvedArch ? "curved" : "rectangular";
  root.userData.rearClosed = doorLeaf;
  root.userData.asset = style === "office" ? "office-door" : "dungeon-door";
  root.userData.reference = `assets-source/imagegen/model-references-v2/architecture/${root.userData.asset}-three-view.png`;
  root.userData.qualityContract = `.scratch/img2threejs/model-references-v2/architecture/${root.userData.asset}/spec.json`;
  root.userData.collider = {
    type: "box-frame",
    size: [safeWidth, safeWallHeight, frameDepth],
    opening: [root.userData.clearance, safeOpening],
  };
  const postX = safeWidth / 2 - postHalfWidth;
  const openingWidth = safeWidth - postHalfWidth * 4;
  const headerHeight = Math.max(0.2, safeWallHeight - safeOpening - lintelHeight);
  const headerCenterY = safeOpening + lintelHeight + headerHeight / 2;

  const stoneParts: THREE.BufferGeometry[] = [];
  if (doorLeaf) {
    addRectangularDoorFrame(stoneParts, safeWidth, safeOpening, safeWallHeight, frameDepth);
  } else {
    stoneParts.push(
      boxGeometry(
        [postHalfWidth * 2, safeWallHeight, frameDepth],
        [-postX, safeWallHeight / 2, -0.035],
      ),
      boxGeometry(
        [postHalfWidth * 2, safeWallHeight, frameDepth],
        [postX, safeWallHeight / 2, -0.035],
      ),
    );
    if (curvedArch) {
      addDungeonFrameBlocks(stoneParts, postX, safeOpening, frameDepth, openingWidth);
    } else {
      addOfficeFrame(stoneParts, safeWidth, safeOpening + lintelHeight, frameDepth);
    }
    stoneParts.push(
      boxGeometry(
        [openingWidth + postHalfWidth * 0.4, headerHeight, frameDepth],
        [0, headerCenterY, -0.035],
      ),
      boxGeometry([safeWidth, 0.12, frameDepth + 0.06], [0, safeWallHeight - 0.06, 0]),
    );
  }

  const frame = new THREE.Mesh(mergeParts(stoneParts), frameMaterial);
  frame.name = "Joined stone door frame";
  frame.castShadow = true;
  frame.receiveShadow = true;
  root.add(frame);
  if (!doorLeaf) return root;

  const opening = root.userData.clearance as number;
  const centerSeam = 0.012;
  const leafWidth = opening / 2 - centerSeam / 2;
  const leafHeight = safeOpening - 0.12;
  const leafBottom = 0.045;
  const makeLeaf = (side: -1 | 1): THREE.Group => {
    const inward = -side;
    const hinge = new THREE.Group();
    hinge.name = side < 0 ? "Door leaf hinge" : "Right door leaf hinge";
    hinge.position.set((side * opening) / 2, leafBottom, 0.12);
    hinge.userData.socket = {
      type: "hinge",
      axis: [0, 1, 0],
      limit: side < 0 ? [-1.42, 0] : [0, 1.42],
    };
    hinge.userData.closedRotation = 0;
    hinge.userData.openRotation = side < 0 ? -1.38 : 1.38;
    hinge.userData.collider = {
      type: "box",
      size: [leafWidth, leafHeight, 0.14],
      center: [inward * leafWidth * 0.5, leafHeight * 0.5, 0],
    };

    const centerX = inward * leafWidth * 0.5;
    const leafGeometry = boxGeometry([leafWidth, leafHeight, 0.12], [centerX, leafHeight / 2, 0]);
    projectLeafUvs(leafGeometry, side, leafWidth, leafHeight, 0.12);
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    leaf.name = side < 0 ? "Left closed iron-bound door leaf" : "Right closed iron-bound door leaf";
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    leaf.userData.component = style === "office" ? "painted-steel-panel" : "oak-plank-leaf";
    hinge.add(leaf);

    const ironParts: THREE.BufferGeometry[] = [];
    if (style === "office") {
      const barY = leafHeight * 0.55;
      const barLength = leafWidth * 0.62;
      const pushBar = new THREE.CylinderGeometry(0.035, 0.035, barLength, 8);
      pushBar.rotateZ(Math.PI / 2);
      pushBar.translate(centerX - inward * leafWidth * 0.08, barY, 0.11);
      ironParts.push(
        pushBar,
        boxGeometry(
          [leafWidth * 0.72, leafHeight * 0.11, 0.035],
          [centerX, leafHeight * 0.12, 0.08],
        ),
      );
      for (const offset of [-0.31, 0.31]) {
        ironParts.push(
          boxGeometry([0.09, 0.15, 0.11], [centerX + inward * leafWidth * offset, barY, 0.065]),
        );
      }
    } else {
      const ring = new THREE.TorusGeometry(0.095, 0.018, 6, 12);
      ring.translate(inward * leafWidth * 0.73, leafHeight * 0.5, 0.105);
      const ringMount = new THREE.CylinderGeometry(0.06, 0.06, 0.028, 6);
      ringMount.rotateX(Math.PI / 2);
      ringMount.translate(inward * leafWidth * 0.73, leafHeight * 0.59, 0.068);
      ironParts.push(ring, ringMount);
    }

    for (const y of [leafHeight * 0.18, leafHeight * 0.5, leafHeight * 0.82]) {
      const barrel = new THREE.CylinderGeometry(0.045, 0.045, 0.18, 8);
      barrel.translate(inward * 0.015, y, 0.075);
      ironParts.push(barrel);
    }

    const ironBatch = new THREE.Mesh(mergeParts(ironParts), hardwareMaterial);
    ironBatch.name =
      style === "office"
        ? side < 0
          ? "Left office push bar"
          : "Right office push bar"
        : side < 0
          ? "Left door iron straps"
          : "Right door iron straps";
    ironBatch.castShadow = true;
    ironBatch.receiveShadow = true;
    ironBatch.userData.repetitionSystem =
      style === "office" ? "push-bar-brackets-and-hinges" : "hinges-and-pull-ring";
    hinge.add(ironBatch);
    return hinge;
  };
  root.add(makeLeaf(-1), makeLeaf(1));
  root.userData.leafBottom = leafBottom;
  root.userData.centerSeam = centerSeam;
  root.userData.transomSealed = true;
  root.userData.openDistance = 2.65;
  return root;
}

export function createDungeonDoor(
  materials: DungeonMaterials,
  width = 2.4,
  wallHeight = 4.4,
  appearance: Omit<DungeonArchOptions, "width" | "wallHeight" | "doorLeaf"> = {},
): THREE.Group {
  return createDungeonArch(materials, { ...appearance, width, doorLeaf: true, wallHeight });
}
