import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  createLuminousWardStone,
  createTimeFreezeRelic,
  preparePickupOpacity,
  setPickupDormant,
  setPickupOpacity,
  PICKUP_DORMANT_SCALE,
} from "../src/world/ItemFactory";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { PickupBurstPool } from "../src/world/PickupBurstPool";
import { TimeFreezeVfx } from "../src/world/TimeFreezeVfx";

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

  test("dormant power pickups stay visible so their PointLights keep the light count", () => {
    const materials = createDungeonMaterials();
    const freeze = createTimeFreezeRelic(materials);
    const ward = createLuminousWardStone(materials);
    const freezeLight = freeze.getObjectByName("Time freeze pickup light") as THREE.PointLight;
    const wardLight = ward.getObjectByName("Luminous ward pickup light") as THREE.PointLight;

    setPickupDormant(freeze, true);
    setPickupDormant(ward, true);
    freezeLight.intensity = 0;
    wardLight.intensity = 0;

    expect(freeze.visible).toBe(true);
    expect(ward.visible).toBe(true);
    expect(freeze.scale.x).toBe(PICKUP_DORMANT_SCALE);
    expect(ward.scale.x).toBe(PICKUP_DORMANT_SCALE);
    expect(freezeLight.parent).toBe(freeze);
    expect(wardLight.parent).toBe(ward);
    expect(freezeLight.intensity).toBe(0);
    expect(wardLight.intensity).toBe(0);

    // Simulated collect end: still visible, still dormant, lights stay zeroed.
    setPickupDormant(freeze, true);
    setPickupDormant(ward, true);
    expect(freeze.visible).toBe(true);
    expect(ward.visible).toBe(true);
  });

  test("time freeze frost points stay in the scene while inactive for shader warmup", () => {
    const vfx = new TimeFreezeVfx(2);
    const motes = vfx.root.children[0] as THREE.Points;
    vfx.update(0, 0, []);
    expect(motes.visible).toBe(true);
    expect((motes.material as THREE.PointsMaterial).opacity).toBe(0);

    vfx.setWarmupVisible(true);
    expect(motes.visible).toBe(true);
    expect((motes.material as THREE.PointsMaterial).opacity).toBeGreaterThan(0);

    vfx.setWarmupVisible(false);
    expect(motes.visible).toBe(true);
    vfx.dispose();
  });
});
