import { describe, expect, test } from "bun:test";
import {
  isPlayerAirborneFromJumpHeight,
  PLAYER_AIRBORNE_JUMP_HEIGHT,
  PLAYER_COMBAT_EYE_HEIGHT,
  playerFeetY,
} from "../src/player/CombatPose";

describe("CombatPose", () => {
  test("recovers feet Y from eye height", () => {
    expect(playerFeetY(PLAYER_COMBAT_EYE_HEIGHT)).toBeCloseTo(0, 5);
    expect(playerFeetY(PLAYER_COMBAT_EYE_HEIGHT + 0.8)).toBeCloseTo(0.8, 5);
  });

  test("airborne threshold ignores micro jitter", () => {
    expect(isPlayerAirborneFromJumpHeight(0)).toBe(false);
    expect(isPlayerAirborneFromJumpHeight(PLAYER_AIRBORNE_JUMP_HEIGHT)).toBe(false);
    expect(isPlayerAirborneFromJumpHeight(PLAYER_AIRBORNE_JUMP_HEIGHT + 0.01)).toBe(true);
  });

  test("movement and floor transitions use the canonical standing height", async () => {
    const controller = await Bun.file(
      new URL("../src/player/FirstPersonController.ts", import.meta.url),
    ).text();
    const shell = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();

    expect(controller).toContain("options.eyeHeight ?? PLAYER_COMBAT_EYE_HEIGHT");
    expect(shell).toContain("position: { x: entry.x, y: PLAYER_COMBAT_EYE_HEIGHT, z: entry.z }");
    expect(shell).not.toContain("eyeHeight: 1.62");
    expect(shell).not.toContain("position: { x: entry.x, y: 1.62, z: entry.z }");
  });
});
