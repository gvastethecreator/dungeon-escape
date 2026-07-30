import * as THREE from "three";

import type { DungeonStairDirection } from "../dungeon/types";
import type { DungeonMaterials } from "./MaterialLibrary";

export const DUNGEON_STAIR_STEP_COUNT = 7;

/**
 * Compact modeled stair flight. Runtime floor switching happens at its landing;
 * the seven distinct treads provide the visible up/down read requested by play.
 */
export function createDungeonStaircase(
  direction: DungeonStairDirection,
  materials: DungeonMaterials,
  tileSize: number,
): THREE.Group {
  const root = new THREE.Group();
  root.name = `${direction === "up" ? "Ascending" : "Descending"} seven-step staircase`;
  const stone = materials.stone.clone();
  stone.color.multiplyScalar(direction === "up" ? 0.82 : 0.68);
  stone.roughness = Math.max(0.78, stone.roughness);
  const iron = materials.iron.clone();
  iron.color.multiplyScalar(0.72);
  const signal = materials.brass.clone();
  signal.color.setHex(direction === "up" ? 0xc6b574 : 0x7898a4);
  signal.emissive.setHex(direction === "up" ? 0x4e421e : 0x213c49);
  signal.emissiveIntensity = 0.46;

  const width = tileSize * 0.68;
  const depth = tileSize * 0.105;
  const rise = 0.085;
  for (let index = 0; index < DUNGEON_STAIR_STEP_COUNT; index += 1) {
    const visualIndex = direction === "up" ? index : DUNGEON_STAIR_STEP_COUNT - 1 - index;
    const height = 0.07 + visualIndex * rise;
    const step = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), stone);
    step.name = `${direction} stair tread ${index + 1}`;
    step.position.set(
      0,
      height * 0.5 + 0.012,
      (index - (DUNGEON_STAIR_STEP_COUNT - 1) * 0.5) * depth,
    );
    step.receiveShadow = true;
    step.castShadow = index > 0;
    root.add(step);
  }

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.15, depth * (DUNGEON_STAIR_STEP_COUNT + 0.5)),
      iron,
    );
    rail.name = `${direction} stair side rail`;
    rail.position.set(side * (width * 0.5 + 0.055), 0.085, 0);
    root.add(rail);
  }

  const landing = new THREE.Mesh(
    new THREE.RingGeometry(tileSize * 0.25, tileSize * 0.36, 8),
    signal,
  );
  landing.name = `${direction} stair direction sigil`;
  landing.rotation.x = -Math.PI / 2;
  landing.position.set(0, 0.026, direction === "up" ? -tileSize * 0.47 : tileSize * 0.47);
  root.add(landing);
  root.userData.stairDirection = direction;
  root.userData.stepCount = DUNGEON_STAIR_STEP_COUNT;
  root.userData.interactionRadius = 1.72;
  return root;
}
