import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createMagicStone } from "../src/world/MagicStoneKit";
import { selectMagicStonePlacements } from "../src/world/MagicStonePlacement";
import { generateDungeon } from "../src/dungeon/generateDungeon";

describe("magic stone world signal", () => {
  test("keeps a bounded practical attached to the pickup", () => {
    const materials = createDungeonMaterials();
    const stone = createMagicStone("ember", materials);
    stone.root.position.set(12, 0, -7);
    stone.root.updateMatrixWorld(true);
    const lightWorld = stone.light.getWorldPosition(new THREE.Vector3());

    expect(stone.light.parent).toBe(stone.root);
    expect(lightWorld.x).toBeCloseTo(12);
    expect(lightWorld.z).toBeCloseTo(-7);
    expect(stone.light.intensity).toBeGreaterThanOrEqual(3);
    expect(stone.light.intensity).toBeLessThanOrEqual(5);
    expect(stone.light.distance).toBeGreaterThanOrEqual(4);
    expect(stone.light.distance).toBeLessThanOrEqual(5);
    expect(stone.root.getObjectByName("ember distant beacon crown")).toBeDefined();
    expect(stone.root.getObjectByName("ember crystal shard cluster")).toBeDefined();
    expect(stone.root.getObjectByName("ember rim rune ring")).toBeDefined();
    expect(stone.crown.scale.x).toBeLessThanOrEqual(0.7);
    expect(stone.glow.geometry.userData.closedDisc).toBe(false);
    expect(
      (
        stone.root.getObjectByName("ember crystal core") as THREE.Mesh<
          THREE.BufferGeometry,
          THREE.MeshStandardMaterial
        >
      ).material.map,
    ).toBe(materials.crystal.map);
    const optionalDetails: THREE.Object3D[] = [];
    const renderableParts: THREE.Mesh[] = [];
    stone.root.traverse((child) => {
      if (child.userData.compactPreviewOptional) optionalDetails.push(child);
      if (child instanceof THREE.Mesh) renderableParts.push(child);
    });
    expect(optionalDetails).toHaveLength(4);
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
