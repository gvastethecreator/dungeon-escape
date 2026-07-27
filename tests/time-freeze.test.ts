import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  activateTimeFreeze,
  isTimeFreezeActive,
  tickTimeFreeze,
  TIME_FREEZE_DURATION_SECONDS,
} from "../src/game/TimeFreeze";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createTimeFreezeRelic } from "../src/world/ItemFactory";
import { TimeFreezeVfx } from "../src/world/TimeFreezeVfx";

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
    expect(relic.getObjectByName("Time freeze minute hand")).toBeDefined();
    expect(relic.getObjectByName("Time freeze orbit halo")).toBeDefined();
    expect(relic.getObjectByName("Time freeze pickup light")).toBeInstanceOf(THREE.PointLight);
    expect(runtime.sockets.pickup.name).toBe("Time freeze pickup anchor");
    expect(runtime.colliders[0]).toMatchObject({ type: "sphere", isTrigger: true });
  });

  test("keeps enemy aura geometry instanced and hides it after expiry", () => {
    const vfx = new TimeFreezeVfx(1);
    const target = {
      position: { x: 2, y: 0.8, z: -1 },
      phaseVisibility: 1,
      spawnReveal: 1,
      scaleX: 0.8,
      scaleY: 1.4,
    };

    expect(vfx.root.getObjectByName("Time freeze orbit rings")).toBeDefined();
    expect(vfx.root.getObjectByName("Time freeze vertical halos")).toBeDefined();
    vfx.update(20, 1.2, [target]);
    const activeMatrix = new THREE.Matrix4();
    const activeScale = new THREE.Vector3();
    const activeMesh = vfx.root.getObjectByName("Time freeze orbit rings") as THREE.InstancedMesh;
    activeMesh.getMatrixAt(0, activeMatrix);
    activeMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), activeScale);
    expect(activeScale.x).toBeGreaterThan(0);

    vfx.update(0, 2, [target]);
    const hiddenMatrix = new THREE.Matrix4();
    const hiddenScale = new THREE.Vector3();
    activeMesh.getMatrixAt(0, hiddenMatrix);
    hiddenMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), hiddenScale);
    expect(hiddenScale.length()).toBe(0);
    vfx.dispose();
  });
});
