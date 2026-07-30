import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { FLOOR, WALL } from "../src/dungeon/generateDungeon";
import type { DungeonData } from "../src/dungeon/types";
import { resolveRestorableControllerPose } from "../src/player/FirstPersonController";

function dungeon(): DungeonData {
  return {
    width: 5,
    height: 3,
    grid: [
      Uint8Array.from([WALL, WALL, WALL, WALL, WALL]),
      Uint8Array.from([WALL, FLOOR, FLOOR, FLOOR, WALL]),
      Uint8Array.from([WALL, WALL, WALL, WALL, WALL]),
    ],
    spawn: { x: 1, y: 1 },
  } as DungeonData;
}

const OPTIONS = {
  tileSize: 2,
  eyeHeight: 1.68,
  radius: 0.3,
  headClearance: 0.18,
};

describe("controller pose restore boundary", () => {
  test("accepts a walkable pose and normalizes look angles", () => {
    const restored = resolveRestorableControllerPose(
      dungeon(),
      { x: 0, y: 1.68, z: 0, yaw: Math.PI * 5, pitch: 4, distanceTravelled: 42 },
      OPTIONS,
    );

    expect(restored).toMatchObject({
      x: 0,
      y: 1.68,
      z: 0,
      pitch: 1.18,
      distanceTravelled: 42,
    });
    expect(restored?.yaw).toBeCloseTo(Math.PI, 12);

    expect(
      resolveRestorableControllerPose(
        dungeon(),
        { x: 0, y: 2.5, z: 0, yaw: 0, pitch: 0, distanceTravelled: 1 },
        OPTIONS,
      )?.y,
    ).toBe(OPTIONS.eyeHeight);
  });

  test("rejects out-of-grid, wall, blocked, collider, and extreme poses", () => {
    const base = { x: 0, y: 1.68, z: 0, yaw: 0, pitch: 0, distanceTravelled: 0 };

    expect(resolveRestorableControllerPose(dungeon(), { ...base, x: 1e300 }, OPTIONS)).toBeNull();
    expect(resolveRestorableControllerPose(dungeon(), { ...base, x: -4 }, OPTIONS)).toBeNull();
    expect(
      resolveRestorableControllerPose(dungeon(), base, {
        ...OPTIONS,
        isBlockedCell: (cell) => cell.x === 2,
      }),
    ).toBeNull();
    expect(
      resolveRestorableControllerPose(dungeon(), base, {
        ...OPTIONS,
        colliders: [{ minX: -0.2, maxX: 0.2, minZ: -0.2, maxZ: 0.2 }],
      }),
    ).toBeNull();
    expect(resolveRestorableControllerPose(dungeon(), { ...base, y: 1e300 }, OPTIONS)).toBeNull();
    expect(
      resolveRestorableControllerPose(
        dungeon(),
        { ...base, distanceTravelled: 1e300 },
        OPTIONS,
      ),
    ).toBeNull();
  });

  test("host restores world pressure from the controller's validated seat", () => {
    const source = readFileSync("src/main.ts", "utf8");
    const start = source.indexOf("function activateDungeon(");
    const end = source.indexOf("\nfunction buildDungeon(", start);
    const activation = source.slice(start, end);

    const applyPose = activation.indexOf("applyRunResumePlan(options.restore);");
    const readSeat = activation.indexOf("const restoredPlayer = controller.getState().position;");
    const restoreRuntime = activation.indexOf("state = playRuntime.restore(");
    expect(applyPose).toBeGreaterThanOrEqual(0);
    expect(readSeat).toBeGreaterThan(applyPose);
    expect(restoreRuntime).toBeGreaterThan(readSeat);
    expect(activation).toContain("player: { x: restoredPlayer.x, z: restoredPlayer.z }");
    expect(activation).not.toContain("runtimeProgress: options.restore?.runtimeProgress");
  });
});
