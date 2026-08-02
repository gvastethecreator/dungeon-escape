import * as THREE from "three";

import type { DungeonStairDirection } from "../dungeon/types";
import type { WorldCollider } from "../dungeon/gridCollision";
import type { DungeonMaterials } from "./MaterialLibrary";
import {
  DEFAULT_STORY_METRICS,
  STORY_STEP_COUNT,
  type StoryMetrics,
} from "./StoryMetrics";

/** Full walkable flight step count (story-height spanning). */
export const DUNGEON_STAIR_STEP_COUNT = STORY_STEP_COUNT;

export interface StairFlightBuild {
  root: THREE.Group;
  /** Walkable tread tops as world-space colliders (absolute after root placement). */
  treadColliders: WorldCollider[];
  stepCount: number;
  flightLength: number;
  stepRise: number;
  stepRun: number;
  stepWidth: number;
}

/**
 * Full story-height stair flight with one collider per tread.
 * Place `root` at the lower landing world position; treads climb local +Z.
 */
export function createDungeonStaircase(
  direction: DungeonStairDirection,
  materials: DungeonMaterials,
  tileSize: number,
  metrics: StoryMetrics = DEFAULT_STORY_METRICS,
): THREE.Group {
  return buildStairFlight(direction, materials, tileSize, metrics).root;
}

export function buildStairFlight(
  direction: DungeonStairDirection,
  materials: DungeonMaterials,
  tileSize: number,
  metrics: StoryMetrics = DEFAULT_STORY_METRICS,
): StairFlightBuild {
  const stepCount = metrics.stepCount;
  const stepRise = metrics.stepRise;
  const stepRun = metrics.stepRun;
  const width = metrics.stepWidth;
  const root = new THREE.Group();
  root.name =
    direction === "up"
      ? `Ascending ${stepCount}-step staircase`
      : `Descending ${stepCount}-step staircase`;

  const stone = materials.stone.clone();
  stone.color.multiplyScalar(direction === "up" ? 0.82 : 0.68);
  stone.roughness = Math.max(0.78, stone.roughness);
  const iron = materials.iron.clone();
  iron.color.multiplyScalar(0.72);
  const signal = materials.brass.clone();
  signal.color.setHex(direction === "up" ? 0xc6b574 : 0x7898a4);
  signal.emissive.setHex(direction === "up" ? 0x4e421e : 0x213c49);
  signal.emissiveIntensity = 0.46;

  const treadColliders: WorldCollider[] = [];
  // Local flight always climbs +Y as Z advances; "down" on upper floor faces reverse yaw.
  for (let index = 0; index < stepCount; index += 1) {
    const topY = (index + 1) * stepRise;
    const thickness = Math.min(stepRise * 0.92, 0.2);
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(width, thickness, stepRun * 0.94),
      stone,
    );
    step.name = `${direction} stair tread ${index + 1}`;
    const z = (index + 0.5) * stepRun;
    step.position.set(0, topY - thickness * 0.5, z);
    step.receiveShadow = true;
    step.castShadow = index > 0;
    root.add(step);

    // Local-space colliders; caller offsets by root world position/yaw.
    treadColliders.push({
      minX: -width * 0.5,
      maxX: width * 0.5,
      minZ: z - stepRun * 0.47,
      maxZ: z + stepRun * 0.47,
      minY: topY - thickness,
      maxY: topY,
    });
  }

  const flightLength = stepCount * stepRun;
  for (const side of [-1, 1] as const) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, metrics.storyHeight * 0.55, flightLength + stepRun * 0.2),
      iron,
    );
    rail.name = `${direction} stair side rail`;
    rail.position.set(side * (width * 0.5 + 0.06), metrics.storyHeight * 0.28, flightLength * 0.5);
    root.add(rail);
  }

  const landing = new THREE.Mesh(
    new THREE.RingGeometry(tileSize * 0.22, tileSize * 0.32, 8),
    signal,
  );
  landing.name = `${direction} stair direction sigil`;
  landing.rotation.x = -Math.PI / 2;
  landing.position.set(0, 0.03, direction === "up" ? -tileSize * 0.15 : flightLength + tileSize * 0.15);
  root.add(landing);

  root.userData.stairDirection = direction;
  root.userData.stepCount = stepCount;
  root.userData.flightLength = flightLength;
  root.userData.stepRise = stepRise;
  root.userData.stepRun = stepRun;
  root.userData.walkable = true;
  // No interaction radius — stairs are walked, not activated.

  return {
    root,
    treadColliders,
    stepCount,
    flightLength,
    stepRise,
    stepRun,
    stepWidth: width,
  };
}

/** Rotate a local XZ point by yaw (Y-up). */
export function rotateYaw(x: number, z: number, yaw: number): { x: number; z: number } {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return { x: x * cos - z * sin, z: x * sin + z * cos };
}

/** Map local tread colliders into world space given root origin and yaw. */
export function worldTreadColliders(
  local: readonly WorldCollider[],
  originX: number,
  originY: number,
  originZ: number,
  yaw: number,
): WorldCollider[] {
  return local.map((collider) => {
    const corners = [
      rotateYaw(collider.minX, collider.minZ, yaw),
      rotateYaw(collider.minX, collider.maxZ, yaw),
      rotateYaw(collider.maxX, collider.minZ, yaw),
      rotateYaw(collider.maxX, collider.maxZ, yaw),
    ];
    const xs = corners.map((c) => c.x + originX);
    const zs = corners.map((c) => c.z + originZ);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
      minY: originY + (collider.minY ?? 0),
      maxY: originY + (collider.maxY ?? 0),
    };
  });
}
