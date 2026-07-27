import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  activateLuminousWard,
  isLuminousWardActive,
  LUMINOUS_WARD_DURATION_SECONDS,
  LUMINOUS_WARD_REPEL_RADIUS,
  tickLuminousWard,
} from "../src/game/LuminousWard";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createLuminousWardStone } from "../src/world/ItemFactory";
import { LuminousWardVfx } from "../src/world/LuminousWardVfx";

describe("luminous ward power", () => {
  test("holds the safety field for thirty gameplay seconds", () => {
    expect(LUMINOUS_WARD_DURATION_SECONDS).toBe(30);
    expect(LUMINOUS_WARD_REPEL_RADIUS).toBeGreaterThan(7);
    expect(activateLuminousWard()).toBe(30);
    expect(tickLuminousWard(activateLuminousWard(), 4.5)).toBeCloseTo(25.5, 6);
    expect(tickLuminousWard(0.2, 1)).toBe(0);
    expect(isLuminousWardActive(0)).toBe(false);
    expect(isLuminousWardActive(0.001)).toBe(true);
  });

  test("builds a faceted 3D stone with a trigger and broad pickup light", () => {
    const stone = createLuminousWardStone(createDungeonMaterials());
    const bounds = new THREE.Box3().setFromObject(stone).getSize(new THREE.Vector3());
    const runtime = stone.userData.sculptRuntime as {
      sockets: { pickup: THREE.Object3D; glow: THREE.Object3D };
      colliders: Array<{ type: string; isTrigger: boolean }>;
    };

    expect(bounds.x).toBeGreaterThan(0.8);
    expect(bounds.y).toBeGreaterThan(0.7);
    expect(stone.getObjectByName("Luminous ward faceted crystal")).toBeDefined();
    expect(stone.getObjectByName("Luminous ward iron foot ring")).toBeDefined();
    expect(stone.getObjectByName("Luminous ward pickup light")).toBeInstanceOf(THREE.PointLight);
    expect(runtime.sockets.pickup.name).toBe("Luminous ward pickup anchor");
    expect(runtime.colliders[0]).toMatchObject({ type: "sphere", isTrigger: true });
  });

  test("keeps the player field visible while active and dark after expiry", () => {
    const vfx = new LuminousWardVfx();
    vfx.update(30, 1.2, { x: 2, y: 1.6, z: -1 });
    expect(vfx.light.intensity).toBeGreaterThan(0);
    expect(vfx.root.position.x).toBe(2);
    const ring = vfx.root.getObjectByName("Luminous ward ground radius") as THREE.Mesh;
    expect((ring.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0);

    vfx.update(0, 2, { x: 2, y: 1.6, z: -1 });
    expect(vfx.light.intensity).toBe(0);
    expect((ring.material as THREE.MeshBasicMaterial).opacity).toBe(0);
    vfx.dispose();
  });
});
