import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  clearStaticPropTemplateBatchCache,
  createStaticPropTemplateBatches,
  staticPropTemplateBatchCacheSize,
} from "../src/world/StaticDungeonScene";
import { createDungeonProp } from "../src/world/DungeonPropKit";
import {
  clearDungeonMaterialVariantCache,
  clearDungeonMaterialVariantsFor,
  createDungeonMaterials,
  disposeDungeonMaterials,
  dungeonMaterialVariantCacheSize,
  dungeonMaterialsCacheToken,
  getDungeonMaterialVariant,
} from "../src/world/MaterialLibrary";

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
    const authorBatching = template.userData.renderBatching as {
      sourceMeshes: number;
      drawCalls: number;
      materialBatches: number;
    };

    expect(sourceMeshes).toHaveLength(3);
    expect(authorBatching.sourceMeshes).toBeGreaterThan(100);
    expect(authorBatching.drawCalls).toBe(3);
    expect(authorBatching.materialBatches).toBe(3);
    expect(batches).toHaveLength(3);
    const batchedMaterials = new Set(batches.map((batch) => batch.material));
    expect(batchedMaterials.size).toBe(3);
    expect(batchedMaterials.has(materials.iron)).toBe(true);
    expect(batchedMaterials.has(materials.brass)).toBe(true);
    const crateWoodBatch = batches.find(
      (batch) => !Array.isArray(batch.material) && batch.material.userData.crateWood === true,
    );
    const crateWood = crateWoodBatch?.material as THREE.MeshStandardMaterial;
    expect(crateWood).toBeDefined();
    expect(crateWood.map).toBe(materials.wood.map);
    expect(crateWood.vertexColors).toBe(true);

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

  test("caches template batch geometry by key and returns independent clones", () => {
    clearStaticPropTemplateBatchCache();
    const materials = createDungeonMaterials();
    const token = dungeonMaterialsCacheToken(materials);
    const first = createDungeonProp("crates", materials, 1);
    const firstBatches = createStaticPropTemplateBatches(first, {
      cacheKey: `test:crates:1:${token}`,
    });
    const second = createDungeonProp("crates", materials, 1);
    const secondBatches = createStaticPropTemplateBatches(second, {
      cacheKey: `test:crates:1:${token}`,
    });

    expect(staticPropTemplateBatchCacheSize()).toBe(1);
    expect(secondBatches).toHaveLength(firstBatches.length);
    expect(secondBatches[0]!.geometry).not.toBe(firstBatches[0]!.geometry);
    expect(secondBatches[0]!.geometry.attributes.position.count).toBe(
      firstBatches[0]!.geometry.attributes.position.count,
    );

    firstBatches.forEach((batch) => batch.geometry.dispose());
    secondBatches.forEach((batch) => batch.geometry.dispose());
    clearStaticPropTemplateBatchCache();
  });

  test("does not reuse template cache entries across distinct materials sets", () => {
    clearStaticPropTemplateBatchCache();
    const materialsA = createDungeonMaterials();
    const materialsB = createDungeonMaterials();
    const propA = createDungeonProp("crates", materialsA, 1);
    const propB = createDungeonProp("crates", materialsB, 1);
    createStaticPropTemplateBatches(propA, {
      cacheKey: `test:crates:iso:${dungeonMaterialsCacheToken(materialsA)}`,
    }).forEach((batch) => batch.geometry.dispose());
    createStaticPropTemplateBatches(propB, {
      cacheKey: `test:crates:iso:${dungeonMaterialsCacheToken(materialsB)}`,
    }).forEach((batch) => batch.geometry.dispose());
    expect(staticPropTemplateBatchCacheSize()).toBe(2);
    expect(dungeonMaterialsCacheToken(materialsA)).not.toBe(dungeonMaterialsCacheToken(materialsB));
    clearStaticPropTemplateBatchCache();
  });

  test("shares dungeon material finish variants across prop builds", () => {
    clearDungeonMaterialVariantCache();
    const materials = createDungeonMaterials();
    const first = getDungeonMaterialVariant(materials.wood, "test-finish", (material) => {
      material.color.multiplyScalar(0.5);
      material.name = "Test finish wood";
    });
    const second = getDungeonMaterialVariant(materials.wood, "test-finish", (material) => {
      material.color.multiplyScalar(0.1);
      material.name = "Should not run";
    });
    expect(second).toBe(first);
    expect(dungeonMaterialVariantCacheSize()).toBe(1);
    expect(first.name).toBe("Test finish wood");
    clearDungeonMaterialVariantCache();
  });

  test("disposeDungeonMaterials drops variants for that materials set only", () => {
    clearDungeonMaterialVariantCache();
    const materialsA = createDungeonMaterials();
    const materialsB = createDungeonMaterials();
    getDungeonMaterialVariant(materialsA.wood, "dispose-a", (material) => {
      material.name = "A";
    });
    getDungeonMaterialVariant(materialsB.wood, "dispose-b", (material) => {
      material.name = "B";
    });
    expect(dungeonMaterialVariantCacheSize()).toBe(2);
    disposeDungeonMaterials(materialsA);
    expect(dungeonMaterialVariantCacheSize()).toBe(1);
    clearDungeonMaterialVariantsFor(materialsB);
    disposeDungeonMaterials(materialsB);
    expect(dungeonMaterialVariantCacheSize()).toBe(0);
  });
});
