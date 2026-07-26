import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createMagicStone } from "../src/world/MagicStoneKit";
import { selectMagicStonePlacements } from "../src/world/MagicStonePlacement";
import { generateDungeon } from "../src/dungeon/generateDungeon";

describe("magic stone long-range signal", () => {
  test("keeps illumination attached to the pickup and gives it useful reach", () => {
    const stone = createMagicStone("ember", createDungeonMaterials());
    stone.root.position.set(12, 0, -7);
    stone.root.updateMatrixWorld(true);
    const lightWorld = stone.light.getWorldPosition(new THREE.Vector3());

    expect(stone.light.parent).toBe(stone.root);
    expect(lightWorld.x).toBeCloseTo(12);
    expect(lightWorld.z).toBeCloseTo(-7);
    expect(stone.light.intensity).toBeGreaterThanOrEqual(18);
    expect(stone.light.distance).toBeGreaterThanOrEqual(11);
    expect(stone.root.getObjectByName("ember distant beacon crown")).toBeDefined();
    expect(stone.root.getObjectByName("ember crystal shard cluster")).toBeDefined();
    expect(stone.root.getObjectByName("ember rim rune ring")).toBeDefined();
    expect(
      stone.root.children.filter((child) => child.userData.compactPreviewOptional).length,
    ).toBe(4);
    const renderableParts = stone.root.children.filter((child) => child instanceof THREE.Mesh);
    expect(renderableParts.length).toBeLessThanOrEqual(7);
  });

  test("shares deterministic stone rooms between editor and world", () => {
    const dungeon = generateDungeon("STONE-PLACEMENT");
    const first = selectMagicStonePlacements(dungeon);
    const second = selectMagicStonePlacements(dungeon);

    expect(first).toEqual(second);
    expect(first.map((placement) => placement.stoneId)).toEqual([
      "ember",
      "ash",
      "crypt",
      "verdant",
    ]);
    expect(new Set(first.map((placement) => placement.room.id)).size).toBe(4);
  });
});
