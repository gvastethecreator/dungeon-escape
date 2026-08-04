import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { updateDoorLeafPresentation } from "../src/world/DoorLeafPresentation";
import type { StaticDoorActor } from "../src/world/StaticDungeonScene";

function fakeDoor(openness: number, targetOpen: boolean): StaticDoorActor {
  const root = new THREE.Group();
  const left = new THREE.Group();
  const right = new THREE.Group();
  left.userData.openRotation = 1.2;
  right.userData.openRotation = -1.2;
  return { root, left, right, openness, targetOpen, runtimeBatch: null };
}

describe("DoorLeafPresentation", () => {
  test("damps toward open and marks passable when nearly open", () => {
    const door = fakeDoor(0.2, true);
    updateDoorLeafPresentation(door, 0.5);
    expect(door.openness).toBeGreaterThan(0.2);
    expect(door.left.rotation.y).toBeCloseTo(1.2 * door.openness, 5);
  });

  test("writes closed userData when shut", () => {
    const door = fakeDoor(0.02, false);
    updateDoorLeafPresentation(door, 0.016);
    expect(door.root.userData.closed).toBe(true);
    expect(door.root.userData.passable).toBe(false);
  });
});
