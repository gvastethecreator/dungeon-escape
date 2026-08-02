import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import {
  buildStairFlight,
  createDungeonStaircase,
  DUNGEON_STAIR_STEP_COUNT,
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
      expect(treads).toHaveLength(DUNGEON_STAIR_STEP_COUNT);
      expect(treads.every((tread) => tread instanceof THREE.Mesh)).toBe(true);
      const top = flight.treadColliders.at(-1)!;
      expect(top.maxY).toBeCloseTo(flight.stepCount * STORY_STEP_RISE, 5);
      expect(flight.root.userData.walkable).toBe(true);
      expect(flight.root.userData.interactionRadius).toBeUndefined();
    }
  });

  test("worldTreadColliders preserve tops under yaw rotation", () => {
    const materials = createDungeonMaterials();
    const flight = buildStairFlight("up", materials, 2.4);
    const world = worldTreadColliders(flight.treadColliders, 10, 0, -5, Math.PI / 2);
    expect(world).toHaveLength(flight.treadColliders.length);
    expect(world[0]!.maxY).toBeCloseTo(flight.treadColliders[0]!.maxY!, 5);
    expect(world.at(-1)!.maxY).toBeCloseTo(flight.treadColliders.at(-1)!.maxY!, 5);
  });

  test("createDungeonStaircase remains a thin wrapper over the flight builder", () => {
    const materials = createDungeonMaterials();
    const root = createDungeonStaircase("up", materials, 2.4);
    expect(root.userData.stepCount).toBe(DUNGEON_STAIR_STEP_COUNT);
  });
});
