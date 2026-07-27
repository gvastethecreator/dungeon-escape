import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { preparePickupOpacity, setPickupOpacity } from "../src/world/ItemFactory";
import { PickupBurstPool } from "../src/world/PickupBurstPool";

describe("pickup frame stability", () => {
  test("prepares transparency once and changes opacity without invalidating materials", () => {
    const material = new THREE.MeshStandardMaterial({ opacity: 0.86 });
    const pickup = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    preparePickupOpacity(pickup);
    const preparedVersion = material.version;

    setPickupOpacity(pickup, 0.6);
    setPickupOpacity(pickup, 0.3);

    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.3);
    expect(material.version).toBe(preparedVersion);
  });

  test("reuses fixed burst geometry and materials across all four stones", () => {
    const pool = new PickupBurstPool(4);
    const children = [...pool.root.children];
    const geometries = children.flatMap((root) =>
      root.children.map((child) => (child as THREE.Mesh).geometry),
    );
    const materials = children.flatMap((root) =>
      root.children.map((child) => (child as THREE.Mesh).material),
    );

    for (let index = 0; index < 4; index += 1)
      pool.trigger({ x: index, y: 0.4, z: -index }, "stone");
    pool.update(0.2);

    expect(pool.activeCount).toBe(4);
    expect(pool.root.children).toEqual(children);
    expect(
      children.flatMap((root) => root.children.map((child) => (child as THREE.Mesh).geometry)),
    ).toEqual(geometries);
    expect(
      children.flatMap((root) => root.children.map((child) => (child as THREE.Mesh).material)),
    ).toEqual(materials);
    pool.update(1);
    expect(pool.activeCount).toBe(0);
  });
});
