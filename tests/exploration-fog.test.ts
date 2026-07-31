import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  EXPLORATION_FOG_CLEAR,
  EXPLORATION_FOG_HIDDEN_MAX,
  EXPLORATION_FOG_REVEALED,
  resolveExplorationFogMultiplier,
} from "../src/systems/ExplorationFog";
import { LightingRig } from "../src/systems/LightingRig";

describe("exploration-aware first-person fog", () => {
  test("starts deep, softens with exploration, and keeps a soft haze for a revealed map", () => {
    const hidden = resolveExplorationFogMultiplier({
      exploredCount: 0,
      totalWalkableCells: 400,
      mapRevealed: false,
    });
    const traversed = resolveExplorationFogMultiplier({
      exploredCount: 100,
      totalWalkableCells: 400,
      mapRevealed: false,
    });
    expect(hidden).toBeCloseTo(EXPLORATION_FOG_HIDDEN_MAX);
    // Unmapped floors stay near-blind (a few metres); revealed floors keep the
    // previous soft mid haze rather than opening to crystal clarity.
    expect(EXPLORATION_FOG_HIDDEN_MAX).toBeGreaterThan(8);
    expect(EXPLORATION_FOG_REVEALED).toBeGreaterThan(4);
    expect(EXPLORATION_FOG_HIDDEN_MAX).toBeGreaterThan(EXPLORATION_FOG_REVEALED);
    expect(traversed).toBeGreaterThan(EXPLORATION_FOG_REVEALED);
    expect(traversed).toBeLessThan(hidden);
    expect(
      resolveExplorationFogMultiplier({
        exploredCount: 0,
        totalWalkableCells: 400,
        mapRevealed: true,
      }),
    ).toBe(EXPLORATION_FOG_REVEALED);
    expect(EXPLORATION_FOG_REVEALED).toBeGreaterThan(1);
    expect(
      resolveExplorationFogMultiplier({
        exploredCount: 180,
        totalWalkableCells: 400,
        mapRevealed: false,
      }),
    ).toBe(EXPLORATION_FOG_REVEALED);
  });

  test("clears the deep fog wall once all four stones are bound", () => {
    expect(
      resolveExplorationFogMultiplier({
        exploredCount: 0,
        totalWalkableCells: 400,
        mapRevealed: false,
        allStonesBound: true,
      }),
    ).toBe(EXPLORATION_FOG_CLEAR);
    // Bound stones beat both the dark wall and a mid map-reveal haze.
    expect(
      resolveExplorationFogMultiplier({
        exploredCount: 0,
        totalWalkableCells: 400,
        mapRevealed: true,
        allStonesBound: true,
      }),
    ).toBe(EXPLORATION_FOG_CLEAR);
    expect(EXPLORATION_FOG_CLEAR).toBe(1);
    expect(EXPLORATION_FOG_CLEAR).toBeLessThan(EXPLORATION_FOG_REVEALED);
  });

  test("feeds the multiplier into the existing biome and threat fog owner", () => {
    const scene = new THREE.Scene();
    const lighting = new LightingRig(scene);
    const base = lighting.fog.density;
    lighting.update(10, new THREE.Vector3(), null, undefined, 2.2);
    expect(lighting.fog.density).toBeCloseTo(base * 2.2, 4);
    lighting.update(10, new THREE.Vector3(), null, undefined, 1);
    expect(lighting.fog.density).toBeCloseTo(base, 4);
    lighting.dispose();
  });
});
