import { describe, expect, test } from "bun:test";
import {
  BIOME_EVENT_MOVEMENT_MAX,
  BIOME_EVENT_MOVEMENT_MIN,
  composeDifficultyWithBiomeEvent,
  composeHazardWithBiomeEvent,
} from "../src/systems/BiomeEventSurface";

describe("BiomeEventSurface", () => {
  test("identity scales leave damage and movement unchanged inside clamp", () => {
    const surface = {
      kind: "fire" as const,
      label: "BURNING FLOOR",
      damage: 5,
      movementScale: 1,
      traction: 1,
    };
    const next = composeHazardWithBiomeEvent(surface, {
      hazardDamageScale: 1,
      movementScale: 1,
    });
    expect(next.damage).toBe(5);
    expect(next.movementScale).toBe(1);
  });

  test("applies event scales and clamps movement", () => {
    const hot = composeHazardWithBiomeEvent(
      { kind: "fire", label: "x", damage: 10, movementScale: 1, traction: 1 },
      { hazardDamageScale: 1.25, movementScale: 0.5 },
    );
    expect(hot.damage).toBe(12.5);
    expect(hot.movementScale).toBe(BIOME_EVENT_MOVEMENT_MIN);

    const rush = composeHazardWithBiomeEvent(
      { kind: null, label: "", damage: 0, movementScale: 1, traction: 1 },
      { hazardDamageScale: 1, movementScale: 2 },
    );
    expect(rush.movementScale).toBe(BIOME_EVENT_MOVEMENT_MAX);
  });

  test("composes difficulty pressure into 0..1", () => {
    expect(composeDifficultyWithBiomeEvent(0.5, 1.1)).toBeCloseTo(0.55, 5);
    expect(composeDifficultyWithBiomeEvent(0.9, 2)).toBe(1);
    expect(composeDifficultyWithBiomeEvent(0.2, 0)).toBe(0);
  });
});
