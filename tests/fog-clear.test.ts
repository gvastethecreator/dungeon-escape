import { describe, expect, test } from "bun:test";

import {
  activateFogClear,
  FOG_CLEAR_DURATION_SECONDS,
  isFogClearActive,
  tickFogClear,
} from "../src/game/FogClear";
import {
  EXPLORATION_FOG_CLARITY,
  EXPLORATION_FOG_CLEAR,
  EXPLORATION_FOG_HIDDEN_MAX,
  EXPLORATION_FOG_REVEALED,
  resolveExplorationFogMultiplier,
} from "../src/systems/ExplorationFog";

describe("fog clear (clarity phial)", () => {
  test("starts a 20 second clarity window and expires cleanly", () => {
    expect(FOG_CLEAR_DURATION_SECONDS).toBe(20);
    expect(activateFogClear()).toBe(20);
    expect(isFogClearActive(activateFogClear())).toBe(true);
    expect(activateFogClear(25)).toBe(25);
    expect(tickFogClear(2, 0.5)).toBeCloseTo(1.5);
    expect(tickFogClear(0.2, 1)).toBe(0);
    expect(isFogClearActive(0)).toBe(false);
  });

  test("temporarily drops exploration fog below map-reveal and stone-clear bands", () => {
    expect(EXPLORATION_FOG_CLARITY).toBeLessThan(EXPLORATION_FOG_CLEAR);
    expect(EXPLORATION_FOG_CLARITY).toBeLessThan(EXPLORATION_FOG_REVEALED);
    expect(EXPLORATION_FOG_CLARITY).toBeLessThan(EXPLORATION_FOG_HIDDEN_MAX);

    expect(
      resolveExplorationFogMultiplier({
        exploredCount: 0,
        totalWalkableCells: 400,
        mapRevealed: false,
        fogClearActive: true,
      }),
    ).toBe(EXPLORATION_FOG_CLARITY);

    // Clarity beats a permanent map reveal while the timer runs.
    expect(
      resolveExplorationFogMultiplier({
        exploredCount: 0,
        totalWalkableCells: 400,
        mapRevealed: true,
        fogClearActive: true,
      }),
    ).toBe(EXPLORATION_FOG_CLARITY);

    // Without the pickup, map reveal still uses the soft mid haze.
    expect(
      resolveExplorationFogMultiplier({
        exploredCount: 0,
        totalWalkableCells: 400,
        mapRevealed: true,
        fogClearActive: false,
      }),
    ).toBe(EXPLORATION_FOG_REVEALED);
  });
});
