import { describe, expect, test } from "bun:test";

import { BIOME_EVENT_PROFILES, sampleBiomeEvent } from "../src/systems/BiomeEventDirector";
import { listBiomeIds } from "../src/systems/BiomeIdentity";

describe("biome event director", () => {
  test("gives every biome one distinct gameplay event", () => {
    const ids = listBiomeIds();
    expect(Object.keys(BIOME_EVENT_PROFILES)).toEqual([...ids]);
    expect(new Set(ids.map((id) => BIOME_EVENT_PROFILES[id].id)).size).toBe(ids.length);
    for (const id of ids) {
      const event = BIOME_EVENT_PROFILES[id];
      expect(event.label.length).toBeGreaterThan(3);
      expect(event.durationSeconds).toBeGreaterThanOrEqual(7);
      expect(event.durationSeconds).toBeLessThan(event.intervalSeconds);
      expect(
        event.movementScale !== 1 ||
          event.hazardDamageScale !== 1 ||
          event.enemyPressureScale !== 1,
      ).toBe(true);
    }
  });

  test("keeps an opening grace period and emits one deterministic start per cycle", () => {
    expect(sampleBiomeEvent("molten", 0, 101)).toMatchObject({
      active: false,
      started: false,
      cycle: -1,
    });
    const first = sampleBiomeEvent("molten", 18, 0, -1);
    expect(first.active).toBe(true);
    expect(first.started).toBe(true);
    expect(sampleBiomeEvent("molten", 19, 0, first.cycle).started).toBe(false);
    expect(sampleBiomeEvent("molten", 18, 0, -1)).toEqual(first);
  });
});
