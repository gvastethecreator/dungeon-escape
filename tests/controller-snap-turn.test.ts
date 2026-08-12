import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as THREE from "three";

import { FLOOR, WALL } from "../src/dungeon/generateDungeon";
import type { DungeonData } from "../src/dungeon/types";
import { FirstPersonController } from "../src/player/FirstPersonController";

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

function openDungeon(): DungeonData {
  return {
    width: 5,
    height: 5,
    grid: Array.from({ length: 5 }, (_, y) =>
      Uint8Array.from({ length: 5 }, (_, x) =>
        x === 0 || y === 0 || x === 4 || y === 4 ? WALL : FLOOR,
      ),
    ),
    spawn: { x: 2, y: 2 },
    exit: { x: 2, y: 3 },
  } as DungeonData;
}

describe("FirstPersonController snap turn", () => {
  test("Q/E animate a 90° camera yaw instead of cutting instantly", () => {
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    const controller = new FirstPersonController(camera, new FakeElement() as never, {
      cameraMotion: 0,
    });
    controller.setDungeon(openDungeon());
    expect(
      controller.restorePose({
        x: 0,
        y: 1.62,
        z: 0,
        yaw: 0,
        pitch: 0,
        distanceTravelled: 0,
      }),
    ).toBe(true);

    controller.setVirtualAction("snapTurnRight", true);
    controller.update(1 / 60);
    controller.setVirtualAction("snapTurnRight", false);

    const midYaw = controller.getState().lookYaw;
    expect(midYaw).toBeLessThan(-0.05);
    expect(midYaw).toBeGreaterThan(-Math.PI / 2 + 0.05);

    for (let frame = 0; frame < 45; frame += 1) {
      controller.update(1 / 60);
    }
    expect(controller.getState().lookYaw).toBeCloseTo(-Math.PI / 2, 3);

    controller.setVirtualAction("snapTurnLeft", true);
    for (let frame = 0; frame < 45; frame += 1) {
      controller.update(1 / 60);
      controller.setVirtualAction("snapTurnLeft", false);
    }
    expect(controller.getState().lookYaw).toBeCloseTo(0, 3);

    controller.dispose();
  });

  test("binds Q/E to snap turns and F to interact", () => {
    const source = readFileSync(
      new URL("../src/player/FirstPersonController.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('KeyQ: "snapTurnLeft"');
    expect(source).toContain('KeyE: "snapTurnRight"');
    expect(source).toContain('KeyF: "interact"');
    expect(source).not.toContain('KeyE: "interact"');
    expect(source).toContain("SNAP_TURN_LOOK_RESPONSE");
  });
});
