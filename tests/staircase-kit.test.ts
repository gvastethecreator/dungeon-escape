import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import {
  createDungeonStaircase,
  DUNGEON_STAIR_STEP_COUNT,
} from "../src/world/StaircaseKit";

describe("modeled dungeon staircases", () => {
  test("builds distinct up and down flights with seven physical treads", () => {
    const materials = createDungeonMaterials();
    for (const direction of ["up", "down"] as const) {
      const stair = createDungeonStaircase(direction, materials, 2);
      expect(stair.userData.stairDirection).toBe(direction);
      expect(stair.userData.stepCount).toBe(DUNGEON_STAIR_STEP_COUNT);
      const treads = stair.children.filter((child) => child.name.includes("stair tread"));
      expect(treads).toHaveLength(DUNGEON_STAIR_STEP_COUNT);
      expect(treads.every((tread) => tread instanceof THREE.Mesh)).toBe(true);
      const heights = treads.map((tread) => new THREE.Box3().setFromObject(tread).max.y);
      expect(new Set(heights.map((height) => height.toFixed(3))).size).toBe(
        DUNGEON_STAIR_STEP_COUNT,
      );
      expect(stair.getObjectByName(`${direction} stair direction sigil`)).toBeDefined();
    }
  });
});
