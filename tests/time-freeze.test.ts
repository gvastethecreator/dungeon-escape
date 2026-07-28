import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  activateTimeFreeze,
  isTimeFreezeActive,
  tickTimeFreeze,
  TIME_FREEZE_DURATION_SECONDS,
} from "../src/game/TimeFreeze";
import {
  createEnemyBillboardMaterial,
  setEnemyFreezeAmount,
} from "../src/world/EnemyBillboardMaterial";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createTimeFreezeRelic } from "../src/world/ItemFactory";
import { TimeFreezeVfx } from "../src/world/TimeFreezeVfx";
import { getDungeonMood } from "../src/systems/DungeonMood";

describe("time-freeze power", () => {
  test("holds enemies for exactly twenty gameplay seconds", () => {
    expect(TIME_FREEZE_DURATION_SECONDS).toBe(20);
    expect(activateTimeFreeze()).toBe(20);
    expect(tickTimeFreeze(activateTimeFreeze(), 2.5)).toBeCloseTo(17.5, 6);
    expect(tickTimeFreeze(0.2, 1)).toBe(0);
    expect(isTimeFreezeActive(0)).toBe(false);
    expect(isTimeFreezeActive(0.001)).toBe(true);
  });

  test("builds a readable three-dimensional hourglass relic", () => {
    const relic = createTimeFreezeRelic(createDungeonMaterials());
    const bounds = new THREE.Box3().setFromObject(relic).getSize(new THREE.Vector3());
    const runtime = relic.userData.sculptRuntime as {
      sockets: { pickup: THREE.Object3D; glow: THREE.Object3D };
      colliders: Array<{ type: string; isTrigger: boolean }>;
    };

    expect(bounds.x).toBeGreaterThan(0.5);
    expect(bounds.y).toBeGreaterThan(0.8);
    expect(relic.getObjectByName("Time freeze frozen core")).toBeDefined();
    expect(relic.getObjectByName("Time freeze eight flush rune strokes")).toBeDefined();
    expect(relic.getObjectByName("Time freeze orbit halo")).toBeDefined();
    expect(relic.getObjectByName("Time freeze pickup light")).toBeInstanceOf(THREE.PointLight);
    expect(runtime.sockets.pickup.name).toBe("Time freeze pickup anchor");
    expect(runtime.colliders[0]).toMatchObject({ type: "sphere", isTrigger: true });
  });

  test("desaturates enemy billboards through the freeze uniform", () => {
    const material = createEnemyBillboardMaterial(new THREE.Texture(), getDungeonMood("frost"));
    expect(material.userData.enemyFreezeAmount?.value).toBe(0);
    setEnemyFreezeAmount(material, 1);
    expect(material.userData.enemyFreezeAmount?.value).toBe(1);
    setEnemyFreezeAmount(material, -2);
    expect(material.userData.enemyFreezeAmount?.value).toBe(0);
    setEnemyFreezeAmount(material, 0.4);
    expect(material.userData.enemyFreezeAmount?.value).toBeCloseTo(0.4, 5);
    material.dispose();
  });

  test("spawns body frost motes while active and clears them after expiry", () => {
    const vfx = new TimeFreezeVfx(1);
    const target = {
      position: { x: 2, y: 0.8, z: -1 },
      phaseVisibility: 1,
      spawnReveal: 1,
      scaleX: 0.8,
      scaleY: 1.4,
    };

    const motes = vfx.root.getObjectByName("Time freeze body motes") as THREE.Points;
    const moteMaterial = motes.material as THREE.PointsMaterial;
    expect(motes).toBeInstanceOf(THREE.Points);
    expect(vfx.root.getObjectByName("Time freeze orbit rings")).toBeUndefined();
    expect(vfx.root.getObjectByName("Time freeze vertical halos")).toBeUndefined();
    expect(vfx.root.getObjectByName("Time freeze suspended shards")).toBeUndefined();

    vfx.update(20, 1.2, [target]);
    const activePositions = motes.geometry.getAttribute("position") as THREE.BufferAttribute;
    expect(motes.visible).toBe(true);
    expect(moteMaterial.opacity).toBeGreaterThan(0.2);
    expect(activePositions.getY(0)).toBeGreaterThan(-10);
    expect(
      Math.hypot(
        activePositions.getX(0) - target.position.x,
        activePositions.getZ(0) - target.position.z,
      ),
    ).toBeLessThan(1.2);

    vfx.update(0, 2, [target]);
    // Stay visible with zero opacity so the Points program is warmup-compiled.
    expect(motes.visible).toBe(true);
    expect(moteMaterial.opacity).toBe(0);
    expect(activePositions.getY(0)).toBeLessThan(-100);
    const clearedVersion = activePositions.version;
    vfx.update(0, 3, [target]);
    expect(activePositions.version).toBe(clearedVersion);
    vfx.dispose();
  });
});
