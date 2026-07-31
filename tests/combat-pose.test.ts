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
});
