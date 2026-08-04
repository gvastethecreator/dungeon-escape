import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  beginChestRewardReveal,
  CHEST_LID_OPEN_RADIANS,
  updateChestPresentation,
} from "../src/world/ChestPresentation";
import {
  PICKUP_COLLECT_DURATION,
  updateCollectedPickupMotion,
} from "../src/world/PickupMotionPresentation";
import type { StaticChestActor, StaticPickupActor } from "../src/world/StaticDungeonScene";

function fakeChest(opened: boolean): StaticChestActor {
  const root = new THREE.Group();
  const lid = new THREE.Group();
  const rewardObject = new THREE.Object3D();
  const reward: StaticPickupActor = {
    floorIndex: 0,
    kind: "resolve",
    object: rewardObject,
    collected: false,
    collectTime: 0,
    collectOriginX: 0,
    collectOriginY: 0,
    collectOriginZ: 0,
    available: false,
    revealTime: 0,
    baseY: 1,
    baseScale: new THREE.Vector3(1, 1, 1),
  };
  return {
    id: "chest-test",
    root,
    lid,
    reward,
    opened,
    openness: opened ? 0.1 : 0,
    runtimeBatch: null,
  };
}

describe("ChestPresentation", () => {
  test("damps lid open rotation when opened", () => {
    const chest = fakeChest(true);
    updateChestPresentation(chest, 0.5);
    expect(chest.openness).toBeGreaterThan(0.1);
    expect(chest.lid.rotation.x).toBeCloseTo(CHEST_LID_OPEN_RADIANS * chest.openness, 5);
  });

  test("beginChestRewardReveal tucks the reward for the rise", () => {
    const chest = fakeChest(true);
    beginChestRewardReveal(chest);
    expect(chest.reward.revealTime).toBe(0);
    expect(chest.reward.object.position.y).toBeCloseTo(chest.reward.baseY - 0.34, 5);
  });

  test("flies a resident pickup toward the player in the parent-local frame", () => {
    const residentRoot = new THREE.Group();
    residentRoot.position.y = 8.8;
    const object = new THREE.Group();
    object.position.set(1, 0.5, 2);
    residentRoot.add(object);
    const pickup: StaticPickupActor = {
      floorIndex: 1,
      kind: "resolve",
      object,
      collected: true,
      collectTime: 0,
      collectOriginX: 1,
      collectOriginY: 0.5,
      collectOriginZ: 2,
      available: true,
      revealTime: 1,
      baseY: 0.5,
      baseScale: new THREE.Vector3(1, 1, 1),
    };

    updateCollectedPickupMotion(pickup, {
      player: new THREE.Vector3(5, 10, 6),
      elapsed: 0,
      delta: PICKUP_COLLECT_DURATION,
    });

    expect(object.position.x).toBeCloseTo(5, 5);
    expect(object.position.y).toBeCloseTo(1.08, 5);
    expect(object.position.z).toBeCloseTo(6, 5);
    expect(object.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(9.88, 5);
  });
});
