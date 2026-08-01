import { describe, expect, test } from "bun:test";
import {
  DOOR_DEFAULT_CLOSE_DISTANCE,
  DOOR_DEFAULT_OPEN_DISTANCE,
  isDoorClosed,
  isDoorPassable,
  resolveDoorTargetOpen,
} from "../src/world/DoorOpenPolicy";

describe("DoorOpenPolicy", () => {
  test("opens inside, closes outside, holds in the gap", () => {
    expect(resolveDoorTargetOpen(false, DOOR_DEFAULT_OPEN_DISTANCE - 0.01)).toBe(true);
    expect(resolveDoorTargetOpen(true, DOOR_DEFAULT_CLOSE_DISTANCE + 0.01)).toBe(false);
    expect(resolveDoorTargetOpen(true, 3)).toBe(true);
    expect(resolveDoorTargetOpen(false, 3)).toBe(false);
  });

  test("passable and closed thresholds match world flags", () => {
    expect(isDoorPassable(0.83)).toBe(true);
    expect(isDoorPassable(0.82)).toBe(false);
    expect(isDoorClosed(0.07)).toBe(true);
    expect(isDoorClosed(0.08)).toBe(false);
  });

  test("DoorFactory and world fall back to the same open-distance constant", async () => {
    const factory = await Bun.file(
      new URL("../src/world/DoorFactory.ts", import.meta.url),
    ).text();
    const world = await Bun.file(new URL("../src/world/DungeonWorld.ts", import.meta.url)).text();
    expect(factory).toContain("DOOR_DEFAULT_OPEN_DISTANCE");
    expect(factory).toContain("openDistance = DOOR_DEFAULT_OPEN_DISTANCE");
    expect(world).toContain("DOOR_DEFAULT_OPEN_DISTANCE");
    expect(world).not.toContain("?? 2.65");
  });
});

