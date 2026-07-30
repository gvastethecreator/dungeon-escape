import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { resolveExplorationFogMultiplier } from "../src/systems/ExplorationFog";
import { LightingRig } from "../src/systems/LightingRig";

describe("exploration-aware first-person fog", () => {
  test("starts dense, clears with exploration, and clears immediately for a revealed map", () => {
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
    expect(hidden).toBeCloseTo(2.2);
    expect(traversed).toBeGreaterThan(1);
    expect(traversed).toBeLessThan(hidden);
    expect(
      resolveExplorationFogMultiplier({
        exploredCount: 0,
        totalWalkableCells: 400,
        mapRevealed: true,
      }),
    ).toBe(1);
    expect(
      resolveExplorationFogMultiplier({
        exploredCount: 180,
        totalWalkableCells: 400,
        mapRevealed: false,
      }),
    ).toBe(1);
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
