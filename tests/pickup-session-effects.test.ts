import { describe, expect, test } from "bun:test";

import { applyPickupSessionEffects, pickupSessionEffects } from "../src/game/PickupSessionEffects";
import type { RunSessionEffects } from "../src/game/RunSession";
import { COPY } from "../src/ui/copy";

describe("PickupSessionEffects", () => {
  test("maps time freeze without sessionChanged", () => {
    const row = pickupSessionEffects("time-freeze");
    expect(row?.status).toBe(COPY.status.timeFreeze);
    expect(row?.pickup.timeFreeze).toBe(true);
    expect(row?.flash).toBe("event");
    expect(row?.sessionChanged).toBeUndefined();
  });

  test("maps map reveal with sessionChanged", () => {
    const row = pickupSessionEffects("map");
    expect(row?.sessionChanged).toBe(true);
    expect(row?.pickup.mapReveal).toBe(true);
  });

  test("maps curse kinds with damage flash", () => {
    for (const kind of [
      "swarm-curse",
      "slow-curse",
      "frenzy-curse",
      "gloom-curse",
      "mirror-curse",
      "spin-curse",
    ] as const) {
      expect(pickupSessionEffects(kind)?.flash).toBe("damage");
    }
  });

  test("apply merges into effects and returns false for unknown kinds", () => {
    const effects: RunSessionEffects = {};
    expect(applyPickupSessionEffects(effects, "mobility")).toBe(true);
    expect(effects.playPickup).toBe(true);
    expect(effects.sessionChanged).toBe(true);
    expect(applyPickupSessionEffects(effects, "stone")).toBe(false);
    expect(applyPickupSessionEffects(effects, null)).toBe(false);
  });
});
