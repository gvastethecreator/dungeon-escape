import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  activateHandTorch,
  HAND_TORCH_DURATION_SECONDS,
  HAND_TORCH_LIT_LANTERN_MUL,
  HAND_TORCH_UNLIT_LANTERN_MUL,
  handTorchFogMultiplier,
  handTorchLanternMultiplier,
  isHandTorchActive,
  tickHandTorch,
} from "../src/game/HandTorch";
import {
  createRunPowerRuntime,
  equipHandTorchFromWall,
  isHandTorchOn,
  tickRunPowerRuntime,
} from "../src/game/RunPowerRuntime";
import { createNoiseFlame } from "../src/world/ProceduralFlameVfx";
import type { StaticFireEffect } from "../src/world/StaticDungeonScene";
import {
  canTakeWallTorch,
  extinguishTakenWallTorch,
  shouldTakeWallTorch,
  WALL_TORCH_INTERACTION_DISTANCE,
} from "../src/world/WallTorchTake";

describe("hand torch fuel", () => {
  test("equips a full 15 second window and burns out", () => {
    expect(HAND_TORCH_DURATION_SECONDS).toBe(15);
    expect(activateHandTorch()).toBe(15);
    expect(isHandTorchActive(activateHandTorch())).toBe(true);
    expect(tickHandTorch(15, 4)).toBeCloseTo(11);
    expect(tickHandTorch(0.4, 1)).toBe(0);
    expect(isHandTorchActive(0)).toBe(false);
  });

  test("held torch lifts lantern and fog; unarmed stays dim", () => {
    expect(handTorchLanternMultiplier(0)).toBe(HAND_TORCH_UNLIT_LANTERN_MUL);
    expect(handTorchLanternMultiplier(15)).toBe(HAND_TORCH_LIT_LANTERN_MUL);
    expect(HAND_TORCH_LIT_LANTERN_MUL).toBeGreaterThan(HAND_TORCH_UNLIT_LANTERN_MUL * 4);
    expect(handTorchFogMultiplier(15)).toBeLessThan(handTorchFogMultiplier(0));
    expect(handTorchLanternMultiplier(0.4)).toBeLessThan(HAND_TORCH_LIT_LANTERN_MUL);
  });

  test("wall grab refreshes fuel even when a stub remains", () => {
    const state = createRunPowerRuntime();
    state.handTorchSeconds = 3;
    equipHandTorchFromWall(state);
    expect(state.handTorchSeconds).toBe(15);
    expect(isHandTorchOn(state)).toBe(true);
    tickRunPowerRuntime(state, 2);
    expect(state.handTorchSeconds).toBeCloseTo(13);
  });
});

describe("wall torch take", () => {
  test("requires F interact inside reach and extinguishes the sconce", () => {
    expect(shouldTakeWallTorch(true)).toBe(true);
    expect(shouldTakeWallTorch(false)).toBe(false);
    expect(
      canTakeWallTorch(WALL_TORCH_INTERACTION_DISTANCE, { takeable: true, taken: false }),
    ).toBe(true);
    expect(
      canTakeWallTorch(WALL_TORCH_INTERACTION_DISTANCE + 0.05, { takeable: true, taken: false }),
    ).toBe(false);
    expect(canTakeWallTorch(1, { takeable: false, taken: false })).toBe(false);
    expect(canTakeWallTorch(1, { takeable: true, taken: true })).toBe(false);

    const flameAssembly = createNoiseFlame({
      name: "Take test flame",
      width: 0.4,
      height: 0.7,
      phase: 0.2,
    });
    const root = new THREE.Group();
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 8));
    glow.name = "Torch wall glow card";
    root.add(glow, flameAssembly.flame);
    const light = new THREE.PointLight(0xffaa55, 12, 10);
    const effect: StaticFireEffect = {
      root,
      flame: flameAssembly.flame,
      flameDetails: flameAssembly.details,
      halos: [glow],
      light,
      baseIntensity: 12,
      baseY: 0.8,
      baseFlameScaleY: 1,
      currentLightFactor: 1,
      cutoffDistance: 12,
      phase: 0.2,
      losOpen: true,
      losAge: 0,
      takeable: true,
      taken: false,
    };
    extinguishTakenWallTorch(effect);
    expect(effect.taken).toBe(true);
    expect(effect.flame.visible).toBe(false);
    expect(glow.visible).toBe(false);
    expect(light.intensity).toBe(0);
    expect(light.visible).toBe(true);
    expect(canTakeWallTorch(0.5, effect)).toBe(false);
  });
});
