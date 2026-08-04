import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { StaticResourceCatalog } from "../src/world/StaticResourceCatalog";

describe("StaticResourceCatalog", () => {
  test("reuses one owned geometry and disposes it exactly once", () => {
    const catalog = new StaticResourceCatalog();
    const geometry = new THREE.BoxGeometry();
    let factoryCalls = 0;
    let disposals = 0;
    geometry.addEventListener("dispose", () => (disposals += 1));

    const first = catalog.borrowGeometry(
      "classic:weapon-rack:0:part:0",
      () => {
        factoryCalls += 1;
        return geometry;
      },
      "classic-weapon-rack-batch-geometry/v1",
    );
    const second = catalog.borrowGeometry(
      "classic:weapon-rack:0:part:0",
      () => {
        factoryCalls += 1;
        return new THREE.BoxGeometry();
      },
      "classic-weapon-rack-batch-geometry/v1",
    );

    expect(second).toBe(first);
    expect(factoryCalls).toBe(1);
    expect(catalog.ownsGeometry(geometry)).toBe(true);
    expect(catalog.snapshot()).toEqual({
      keys: ["classic:weapon-rack:0:part:0"],
      live: 1,
      hits: 1,
      misses: 1,
    });
    catalog.dispose();
    catalog.dispose();
    expect(disposals).toBe(1);
    expect(catalog.ownsGeometry(geometry)).toBe(false);
    expect(catalog.snapshot()).toEqual({ keys: [], live: 0, hits: 1, misses: 1 });
    expect(() => catalog.borrowGeometry("late", () => new THREE.BoxGeometry())).toThrow(
      "StaticResourceCatalog has been disposed.",
    );
  });

  test("rejects type-key collisions and duplicate ownership", () => {
    const catalog = new StaticResourceCatalog();
    const geometry = new THREE.BoxGeometry();
    catalog.borrowGeometry("stable-key", () => geometry, "weapon-rack/v1");

    expect(() =>
      catalog.borrowGeometry("stable-key", () => new THREE.PlaneGeometry(), "floor-tile/v1"),
    ).toThrow("key collision");
    expect(() => catalog.borrowGeometry("duplicate-key", () => geometry, "weapon-rack/v1")).toThrow(
      'already owned as "stable-key"',
    );

    catalog.dispose();
  });

  test("keeps a failed factory isolated and ownership local to each catalog", () => {
    const left = new StaticResourceCatalog();
    const right = new StaticResourceCatalog();
    expect(() =>
      left.borrowGeometry("retryable", () => {
        throw new Error("factory failed");
      }),
    ).toThrow("factory failed");

    const leftGeometry = left.borrowGeometry("retryable", () => new THREE.BoxGeometry());
    const rightGeometry = right.borrowGeometry("retryable", () => new THREE.BoxGeometry());
    const material = new THREE.MeshBasicMaterial();
    const mountedConsumer = new THREE.Mesh(leftGeometry, material);
    let leftDisposals = 0;
    let rightDisposals = 0;
    let materialDisposals = 0;
    leftGeometry.addEventListener("dispose", () => (leftDisposals += 1));
    rightGeometry.addEventListener("dispose", () => (rightDisposals += 1));
    material.addEventListener("dispose", () => (materialDisposals += 1));

    expect(rightGeometry).not.toBe(leftGeometry);
    expect(left.ownsGeometry(leftGeometry)).toBe(true);
    expect(left.ownsGeometry(rightGeometry)).toBe(false);
    expect(right.ownsGeometry(rightGeometry)).toBe(true);
    expect(right.ownsGeometry(leftGeometry)).toBe(false);
    expect(mountedConsumer.material).toBe(material);
    left.dispose();
    left.dispose();
    right.dispose();

    expect(leftDisposals).toBe(1);
    expect(rightDisposals).toBe(1);
    expect(materialDisposals).toBe(0);
    (mountedConsumer.material as THREE.Material).dispose();
  });
});
