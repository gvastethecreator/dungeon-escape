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
  const postX = safeWidth / 2 - postHalfWidth;
  const openingWidth = safeWidth - postHalfWidth * 4;
  const headerHeight = Math.max(0.2, safeWallHeight - safeOpening - lintelHeight);
  const headerCenterY = safeOpening + lintelHeight + headerHeight / 2;

  // Full-height posts close the jamb into the ceiling band.
  const stoneParts: THREE.BufferGeometry[] = [-postX, postX].map((x) =>
    new THREE.BoxGeometry(postHalfWidth * 2, safeWallHeight, frameDepth).translate(
      x,
      safeWallHeight / 2,
      0,
    ),
  );
  // Lintel over the walkable opening.
  stoneParts.push(
    new THREE.BoxGeometry(
      openingWidth + postHalfWidth * 0.4,
      lintelHeight,
      frameDepth + 0.04,
    ).translate(0, safeOpening + lintelHeight / 2, 0),
  );

  // Low-poly curved trim keeps medieval passages from reading as box cut-outs.
  // Structural lintel/header remain behind it, so topology and collision stay sealed.
  if (curvedArch) {
    stoneParts.push(
      new THREE.TorusGeometry(openingWidth * 0.5, postHalfWidth * 0.72, 5, 18, Math.PI).translate(
        0,
        safeOpening - 0.02,
        frameDepth * 0.28,
      ),
    );
  }
  // Header masonry fills the gap from lintel to ceiling so rooms read as closed.
  stoneParts.push(
    new THREE.BoxGeometry(openingWidth + postHalfWidth * 0.4, headerHeight, frameDepth).translate(
      0,
      headerCenterY,
      0,
    ),
  );
  // Thin cap aligns the top of the frame with the ceiling plane.
  stoneParts.push(
    new THREE.BoxGeometry(safeWidth, 0.12, frameDepth + 0.06).translate(
      0,
      safeWallHeight - 0.06,
      0,
    ),
  );

  const frame = new THREE.Mesh(mergeGeometries(stoneParts, false)!, frameMaterial);
  frame.name = "Joined stone door frame";
  frame.castShadow = true;
  frame.receiveShadow = true;
  root.add(frame);
  if (!doorLeaf) return root;

  const opening = root.userData.clearance as number;
  const leafWidth = opening / 2 - 0.035;
  const leafHeight = safeOpening - 0.12;
  const leafBottom = 0.045;
  const makeLeaf = (side: -1 | 1): THREE.Group => {
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
    const centerX = side < 0 ? leafWidth / 2 : -leafWidth / 2;
    const leafGeometry = new THREE.BoxGeometry(leafWidth, leafHeight, 0.12);
    const uv = leafGeometry.getAttribute("uv") as THREE.BufferAttribute;
    const halfOffset = side < 0 ? 0 : 0.5;
    for (let index = 0; index < uv.count; index += 1) {
      uv.setX(index, uv.getX(index) * 0.5 + halfOffset);
    }
    uv.needsUpdate = true;
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    leaf.name = side < 0 ? "Left closed iron-bound door leaf" : "Right closed iron-bound door leaf";
    leaf.position.set(centerX, leafHeight / 2, 0);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    hinge.add(leaf);
    const strapYs = style === "office" ? [0] : [-leafHeight * 0.32, 0, leafHeight * 0.32];
    const straps = strapYs.map((y) =>
      new THREE.BoxGeometry(
        leafWidth * (style === "office" ? 0.56 : 0.96),
        style === "office" ? 0.055 : 0.075,
        0.15,
      ).translate(
        centerX + (style === "office" ? side * leafWidth * 0.18 : 0),
        leafHeight / 2 + y,
        0.02,
      ),
    );
    const stile = new THREE.BoxGeometry(0.075, leafHeight * 0.94, 0.15).translate(
      centerX + (side < 0 ? leafWidth * 0.38 : -leafWidth * 0.38),
      leafHeight / 2,
      0.02,
    );
    const ironParts = style === "office" ? straps : [...straps, stile];
    const ironBatch = new THREE.Mesh(mergeGeometries(ironParts, false)!, hardwareMaterial);
    ironBatch.name =
      style === "office"
        ? side < 0
          ? "Left office push bar"
          : "Right office push bar"
        : side < 0
          ? "Left door iron straps"
          : "Right door iron straps";
    ironBatch.castShadow = true;
    hinge.add(ironBatch);
    return hinge;
  };
  root.add(makeLeaf(-1), makeLeaf(1));
  root.userData.leafBottom = leafBottom;
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
