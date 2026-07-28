import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createStaticPropTemplateBatches } from "../src/world/StaticDungeonScene";
import { createDungeonProp } from "../src/world/DungeonPropKit";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";

describe("static Creation prop batching", () => {
  test("bakes source transforms and collapses meshes that share a material", () => {
    const root = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0x777777 });
    const iron = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 1), stone);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), stone);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 5), iron);
    base.position.y = 0.1;
    cap.position.y = 0.35;
    spike.position.y = 0.75;
    root.add(base, cap, spike);

    const batches = createStaticPropTemplateBatches(root);

    expect(batches).toHaveLength(2);
    expect(batches.filter((batch) => batch.material === stone)).toHaveLength(1);
    expect(batches.filter((batch) => batch.material === iron)).toHaveLength(1);
    const stoneBatch = batches.find((batch) => batch.material === stone)!;
    stoneBatch.geometry.computeBoundingBox();
    expect(stoneBatch.geometry.boundingBox?.max.y).toBeGreaterThan(0.45);

    batches.forEach((batch) => batch.geometry.dispose());
    base.geometry.dispose();
    cap.geometry.dispose();
    spike.geometry.dispose();
    stone.dispose();
    iron.dispose();
  });

  test("collapses detailed stock clutter to its three material roles", () => {
    const materials = createDungeonMaterials();
    const template = createDungeonProp("crates", materials, 1);
    const sourceMeshes: THREE.Mesh[] = [];
    template.traverse((object) => {
      if (object instanceof THREE.Mesh) sourceMeshes.push(object);
    });

    const batches = createStaticPropTemplateBatches(template);
    expect(sourceMeshes.length).toBeGreaterThan(30);
    expect(batches).toHaveLength(3);
    expect(new Set(batches.map((batch) => batch.material))).toEqual(
      new Set([materials.wood, materials.iron, materials.brass]),
    );

    batches.forEach((batch) => batch.geometry.dispose());
  });

  test("normalizes mixed primitive indices before merging a weapon rack", () => {
    const materials = createDungeonMaterials();
    const template = createDungeonProp("weapon-rack", materials, 2);
    const batches = createStaticPropTemplateBatches(template);

    expect(batches).toHaveLength(3);
    expect(new Set(batches.map((batch) => batch.material))).toEqual(
      new Set([materials.wood, materials.iron, materials.brass]),
    );
    expect(batches.every((batch) => batch.geometry.index === null)).toBe(true);

    batches.forEach((batch) => batch.geometry.dispose());
  });
});
