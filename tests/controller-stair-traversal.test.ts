import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as THREE from "three";

import { FLOOR, WALL } from "../src/dungeon/generateDungeon";
import {
  createFloorDeckColliders,
  gridToWorld,
  type WorldCollider,
} from "../src/dungeon/gridCollision";
import { generateDungeonFloorSet } from "../src/dungeon/generateDungeonFloors";
import type { DungeonData } from "../src/dungeon/types";
import { FirstPersonController } from "../src/player/FirstPersonController";
import {
  buildStairFlight,
  rotateYaw,
  stairFlightRootPosition,
  worldTreadColliders,
} from "../src/world/StaircaseKit";
import {
  activeFloorFromSupportY,
  STORY_FLIGHT_LENGTH,
  STORY_HEIGHT,
} from "../src/world/StoryMetrics";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalHTMLElement = globalThis.HTMLElement;

class FakeElement {
  addEventListener(): void {}
  removeEventListener(): void {}
  closest(): null {
    return null;
  }
}

beforeAll(() => {
  const eventTarget = {
    addEventListener(): void {},
    removeEventListener(): void {},
  };
  Object.assign(globalThis, {
    HTMLElement: FakeElement,
    window: {
      ...eventTarget,
      matchMedia: () => ({ matches: false }),
    },
    document: {
      ...eventTarget,
      hidden: false,
      pointerLockElement: null,
      exitPointerLock: () => undefined,
    },
  });
});

afterAll(() => {
  Object.assign(globalThis, {
    window: originalWindow,
    document: originalDocument,
    HTMLElement: originalHTMLElement,
  });
});

function openDungeon(size = 15): DungeonData {
  const grid = Array.from({ length: size }, (_, y) =>
    Uint8Array.from({ length: size }, (_, x) =>
      x === 0 || y === 0 || x === size - 1 || y === size - 1 ? WALL : FLOOR,
    ),
  );
  return {
    width: size,
    height: size,
    grid,
    spawn: { x: 7, y: 3 },
    exit: { x: 7, y: 12 },
  } as DungeonData;
}

describe("FirstPersonController stair traversal", () => {
  test("walks a full story using real movement and tread colliders", () => {
    const tileSize = 2.4;
    const eyeHeight = 1.62;
    const dungeon = openDungeon();
    const origin = gridToWorld(dungeon, { x: 7, y: 5 }, tileSize);
    const flight = buildStairFlight(
      "up",
      {
        stone: new THREE.MeshStandardMaterial(),
        iron: new THREE.MeshStandardMaterial(),
        brass: new THREE.MeshStandardMaterial(),
      } as never,
      tileSize,
    );
    const treads = worldTreadColliders(flight.treadColliders, origin.x, 0, origin.z, 0);
    const upperDeck: WorldCollider = {
      minX: origin.x - tileSize * 0.5,
      maxX: origin.x + tileSize * 0.5,
      minZ: origin.z + STORY_FLIGHT_LENGTH - 0.05,
      maxZ: origin.z + STORY_FLIGHT_LENGTH + tileSize * 2,
      minY: STORY_HEIGHT - 0.35,
      maxY: STORY_HEIGHT,
    };
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    const controller = new FirstPersonController(camera, new FakeElement() as never, {
      tileSize,
      eyeHeight,
      cameraMotion: 0,
    });
    controller.setDungeon(dungeon);
    controller.setSolidColliders([...treads, upperDeck]);
    expect(
      controller.restorePose({
        x: origin.x,
        y: eyeHeight,
        z: origin.z - 0.45,
        yaw: Math.PI,
        pitch: 0,
        distanceTravelled: 0,
      }),
    ).toBe(true);

    controller.setVirtualAction("forward", true);
    let peakY = controller.position.y;
    for (let frame = 0; frame < 360; frame += 1) {
      controller.update(1 / 60);
      peakY = Math.max(peakY, controller.position.y);
      if (controller.position.y > STORY_HEIGHT + eyeHeight - 0.1) break;
    }
    controller.setVirtualAction("forward", false);
    for (let frame = 0; frame < 30; frame += 1) controller.update(1 / 60);

    expect(peakY).toBeGreaterThan(STORY_HEIGHT + eyeHeight - 0.2);
    expect(controller.position.y).toBeGreaterThan(STORY_HEIGHT + eyeHeight - 0.2);
    expect(controller.position.z).toBeGreaterThan(origin.z + STORY_FLIGHT_LENGTH - 0.7);

    expect(
      controller.restorePose({
        x: origin.x,
        y: STORY_HEIGHT + eyeHeight - 0.08,
        z: origin.z + STORY_FLIGHT_LENGTH + 0.25,
        yaw: 0,
        pitch: 0,
        distanceTravelled: 0,
      }),
    ).toBe(true);
    controller.setVirtualAction("forward", true);
    for (let frame = 0; frame < 360; frame += 1) {
      controller.update(1 / 60);
      if (controller.position.y < eyeHeight + 0.1) break;
    }
    controller.setVirtualAction("forward", false);

    expect(controller.position.y).toBeLessThan(eyeHeight + 0.1);
    expect(controller.position.z).toBeLessThan(origin.z + 0.7);
    controller.dispose();
  });

  test("keeps climbing after the generated stack rebinds to the upper floor", () => {
    const tileSize = 2.4;
    const eyeHeight = 1.62;
    const stack = generateDungeonFloorSet("MF-SMOKE-OBSIDIAN-A1", { roomTarget: 20 }, 2);
    const lower = stack.floors[0]!;
    const upper = stack.floors[1]!;
    const link = stack.shaftPlan.links[0]!;
    const anchor = gridToWorld(lower, link.anchor, tileSize);
    const origin = stairFlightRootPosition(anchor, link.yaw, tileSize);
    const flight = buildStairFlight(
      "up",
      {
        stone: new THREE.MeshStandardMaterial(),
        iron: new THREE.MeshStandardMaterial(),
        brass: new THREE.MeshStandardMaterial(),
      } as never,
      tileSize,
    );
    const direction = rotateYaw(0, 1, link.yaw);
    const treads = worldTreadColliders(flight.treadColliders, origin.x, 0, origin.z, link.yaw);
    const upperDeck = createFloorDeckColliders(
      upper,
      tileSize,
      STORY_HEIGHT - 0.06,
      STORY_HEIGHT + 0.02,
    );
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    const controller = new FirstPersonController(camera, new FakeElement() as never, {
      tileSize,
      eyeHeight,
      cameraMotion: 0,
    });
    controller.setDungeon(lower);
    controller.setSolidColliders([...treads, ...upperDeck]);
    expect(
      controller.restorePose({
        x: origin.x - direction.x * 0.8,
        y: eyeHeight,
        z: origin.z - direction.z * 0.8,
        yaw: Math.atan2(-direction.x, -direction.z),
        pitch: 0,
        distanceTravelled: 0,
      }),
    ).toBe(true);

    controller.setVirtualAction("forward", true);
    let active = lower;
    let rebound = false;
    let peakY = controller.position.y;
    for (let frame = 0; frame < 720; frame += 1) {
      controller.update(1 / 60);
      peakY = Math.max(peakY, controller.position.y);
      const nextIndex = activeFloorFromSupportY(
        Math.max(0, controller.position.y - eyeHeight),
        stack.floors.length,
      );
      if (nextIndex !== (active.floor?.index ?? 0)) {
        active = stack.floors[nextIndex]!;
        controller.bindDungeon(active);
        rebound = true;
      }
      if (controller.position.y > STORY_HEIGHT + eyeHeight - 0.1) break;
    }
    controller.setVirtualAction("forward", false);

    expect(rebound).toBe(true);
    expect(peakY).toBeGreaterThan(STORY_HEIGHT + eyeHeight - 0.2);
    expect(controller.position.y).toBeGreaterThan(STORY_HEIGHT + eyeHeight - 0.2);
    controller.dispose();
  });
});
