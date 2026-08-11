import * as THREE from "three";

import type { DungeonStairDirection } from "../dungeon/types";
import type { WorldCollider, WorldPoint } from "../dungeon/gridCollision";
import type { DungeonMaterials } from "./MaterialLibrary";
import { DEFAULT_STORY_METRICS, STORY_STEP_COUNT, type StoryMetrics } from "./StoryMetrics";

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
  const instanceMatrix = new THREE.Matrix4();
  const instancePosition = new THREE.Vector3();
  const instanceQuaternion = new THREE.Quaternion();
  const instanceScale = new THREE.Vector3(1, 1, 1);
  const treadThickness = Math.min(stepRise * 0.92, 0.2);
  const treadBatch = new THREE.InstancedMesh(
    new THREE.BoxGeometry(width, treadThickness, stepRun * 0.94),
    stone,
    stepCount,
  );
  treadBatch.name = `${direction} stair tread batch`;
  treadBatch.receiveShadow = true;
  treadBatch.castShadow = true;
  // Local flight always climbs +Y as Z advances; "down" on upper floor faces reverse yaw.
  for (let index = 0; index < stepCount; index += 1) {
    const topY = (index + 1) * stepRise;
    const z = (index + 0.5) * stepRun;
    treadBatch.setMatrixAt(
      index,
      instanceMatrix.compose(
        instancePosition.set(0, topY - treadThickness * 0.5, z),
        instanceQuaternion,
        instanceScale,
      ),
    );

    // Local-space colliders; caller offsets by root world position/yaw.
    treadColliders.push({
      minX: -width * 0.5,
      maxX: width * 0.5,
      minZ: z - stepRun * 0.47,
      maxZ: z + stepRun * 0.47,
      minY: topY - treadThickness,
      maxY: topY,
    });
  }
  treadBatch.instanceMatrix.needsUpdate = true;
  treadBatch.computeBoundingBox();
  treadBatch.computeBoundingSphere();
  root.add(treadBatch);

  const flightLength = stepCount * stepRun;
  const railBatch = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.08, metrics.storyHeight * 0.55, flightLength + stepRun * 0.2),
    iron,
    2,
  );
  railBatch.name = `${direction} stair side rail batch`;
  ([-1, 1] as const).forEach((side, index) => {
    railBatch.setMatrixAt(
      index,
      instanceMatrix.compose(
        instancePosition.set(
          side * (width * 0.5 + 0.06),
          metrics.storyHeight * 0.28,
          flightLength * 0.5,
        ),
        instanceQuaternion,
        instanceScale,
      ),
    );
  });
  railBatch.instanceMatrix.needsUpdate = true;
  railBatch.computeBoundingBox();
  railBatch.computeBoundingSphere();
  root.add(railBatch);

  const landing = new THREE.Mesh(
    new THREE.RingGeometry(tileSize * 0.22, tileSize * 0.32, 8),
    signal,
  );
  landing.name = `${direction} stair direction sigil`;
  landing.rotation.x = -Math.PI / 2;
  landing.position.set(
    0,
    0.03,
    direction === "up" ? -tileSize * 0.15 : flightLength + tileSize * 0.15,
  );
  root.add(landing);

  root.userData.stairDirection = direction;
  root.userData.stepCount = stepCount;
  root.userData.flightLength = flightLength;
  root.userData.stepRise = stepRise;
  root.userData.stepRun = stepRun;
  root.userData.stepWidth = width;
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
  // Match THREE.Object3D's positive Y rotation. The previous 2D convention
  // mirrored colliders across the root for quarter-turn stair flights.
  return { x: x * cos + z * sin, z: -x * sin + z * cos };
}

/**
 * Place a flight on the near edge of its first shaft cell. The local run then
 * ends on the far edge of the last shaft cell, next to the supported landing.
 */
export function stairFlightRootPosition(
  anchor: WorldPoint,
  yaw: number,
  tileSize: number,
): WorldPoint {
  const offset = rotateYaw(0, -tileSize * 0.5, yaw);
  return { x: anchor.x + offset.x, z: anchor.z + offset.z };
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
