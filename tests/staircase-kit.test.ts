import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import {
  buildStairFlight,
  createDungeonStaircase,
  DUNGEON_STAIR_STEP_COUNT,
  stairFlightRootPosition,
  worldTreadColliders,
} from "../src/world/StaircaseKit";
import { STORY_HEIGHT, STORY_STEP_RISE } from "../src/world/StoryMetrics";

describe("modeled dungeon staircases", () => {
  test("builds a full-story walkable flight with one collider per tread", () => {
    const materials = createDungeonMaterials();
    for (const direction of ["up", "down"] as const) {
      const flight = buildStairFlight(direction, materials, 2.4);
      expect(flight.root.userData.stairDirection).toBe(direction);
      expect(flight.stepCount).toBe(DUNGEON_STAIR_STEP_COUNT);
      expect(flight.stepCount * flight.stepRise).toBeGreaterThanOrEqual(STORY_HEIGHT - 1e-6);
      expect(flight.treadColliders).toHaveLength(flight.stepCount);
      const treads = flight.root.children.filter((child) => child.name.includes("stair tread"));
      expect(treads).toHaveLength(1);
      expect(treads[0]).toBeInstanceOf(THREE.InstancedMesh);
      expect((treads[0] as THREE.InstancedMesh).count).toBe(DUNGEON_STAIR_STEP_COUNT);
      const top = flight.treadColliders.at(-1)!;
      expect(top.maxY).toBeCloseTo(flight.stepCount * STORY_STEP_RISE, 5);
      expect(flight.root.userData.walkable).toBe(true);
      expect(flight.root.userData.interactionRadius).toBeUndefined();
    }
  });

  test("worldTreadColliders align with the rendered treads under yaw rotation", () => {
    const materials = createDungeonMaterials();
    const flight = buildStairFlight("up", materials, 2.4);
    flight.root.position.set(10, 0, -5);
    flight.root.rotation.y = Math.PI / 2;
    flight.root.updateWorldMatrix(true, true);
    const world = worldTreadColliders(flight.treadColliders, 10, 0, -5, Math.PI / 2);
    expect(world).toHaveLength(flight.treadColliders.length);
    const renderedTreads = flight.root.children.find((child) =>
      child.name.includes("stair tread"),
    ) as THREE.InstancedMesh;
    const instanceMatrix = new THREE.Matrix4();
    for (const index of [0, renderedTreads.count - 1]) {
      renderedTreads.getMatrixAt(index, instanceMatrix);
      const renderedCenter = new THREE.Vector3().setFromMatrixPosition(
        new THREE.Matrix4().multiplyMatrices(renderedTreads.matrixWorld, instanceMatrix),
      );
      const collider = world[index]!;
      expect((collider.minX + collider.maxX) * 0.5).toBeCloseTo(renderedCenter.x, 5);
      expect((collider.minZ + collider.maxZ) * 0.5).toBeCloseTo(renderedCenter.z, 5);
      expect(collider.maxY).toBeCloseTo(flight.treadColliders[index]!.maxY!, 5);
    }
  });

  test("aligns a flight between the near and far landing edges", () => {
    const anchor = { x: 12, z: -4 };
    const tileSize = 2.4;
    expect(stairFlightRootPosition(anchor, 0, tileSize)).toEqual({ x: 12, z: -5.2 });
    expect(stairFlightRootPosition(anchor, Math.PI / 2, tileSize).x).toBeCloseTo(10.8, 5);
    expect(stairFlightRootPosition(anchor, Math.PI / 2, tileSize).z).toBeCloseTo(-4, 5);
  });

  test("createDungeonStaircase remains a thin wrapper over the flight builder", () => {
    const materials = createDungeonMaterials();
    const root = createDungeonStaircase("up", materials, 2.4);
    expect(root.userData.stepCount).toBe(DUNGEON_STAIR_STEP_COUNT);
  });
});
