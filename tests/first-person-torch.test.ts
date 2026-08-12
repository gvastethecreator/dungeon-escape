import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  createFirstPersonTorch,
  FIRST_PERSON_TORCH_POSE,
  FIRST_PERSON_TORCH_SCALE,
} from "../src/player/FirstPersonTorch";
import { getDungeonMood } from "../src/systems/DungeonMood";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import {
  isNoiseFlameMaterial,
  setNoiseFlameLean,
  setNoiseFlameWind,
} from "../src/world/ProceduralFlameVfx";

describe("first-person hand torch", () => {
  test("adapts the wall-torch sculpt without masonry mount or sconce light", () => {
    const torch = createFirstPersonTorch(createDungeonMaterials({ compact: true }));
    expect(torch.root.name).toBe("First-person hand torch");
    expect(torch.root.scale.x).toBeCloseTo(FIRST_PERSON_TORCH_SCALE, 5);
    expect(torch.root.position.x).toBeCloseTo(FIRST_PERSON_TORCH_POSE.position.x, 5);
    expect(FIRST_PERSON_TORCH_POSE.position.x).toBeGreaterThan(0.35);
    expect(torch.root.getObjectByName("Torch tapered handle")).toBeDefined();
    expect(torch.root.getObjectByName("Torch two-ring basket pivot")).toBeDefined();
    expect(torch.root.getObjectByName("Torch wall plate")).toBeUndefined();
    expect(torch.root.getObjectByName("Torch scroll bracket")).toBeUndefined();
    expect(torch.root.getObjectByName("Wall contact socket")).toBeUndefined();
    expect(torch.root.getObjectByName("Torch wall glow card")).toBeUndefined();
    expect(torch.root.getObjectByName("Wall torch radial point light")).toBeUndefined();
    expect(torch.flame.visible).toBe(true);
    torch.dispose();
  });

  test("mounts in the scene (not on the camera) and bobbles while moving", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    const torch = createFirstPersonTorch(createDungeonMaterials({ compact: true }));
    torch.attach(camera, scene);
    expect(scene.children).toContain(torch.root);
    expect(camera.children).not.toContain(torch.root);

    const restY = torch.root.position.y;
    torch.update(1 / 30, 1.2, {
      moving: true,
      sprinting: false,
      stridePhase: Math.PI / 2,
      grounded: true,
      velocityX: 0,
      velocityZ: 0,
    });
    expect(torch.root.position.y).not.toBeCloseTo(restY, 5);

    torch.setMood(getDungeonMood("molten"));
    torch.setWarmupVisible(true);
    expect(torch.root.visible).toBe(true);
    expect(torch.flame.visible).toBe(true);
    torch.setWarmupVisible(false);
    torch.setVisible(false);
    expect(torch.root.visible).toBe(false);
    torch.dispose();
    expect(scene.children).not.toContain(torch.root);
  });

  test("flame tips opposite walk direction and drives ember wind", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    camera.position.set(0, 1.6, 0);
    camera.lookAt(0, 1.6, -1);
    const torch = createFirstPersonTorch(createDungeonMaterials({ compact: true }));
    torch.attach(camera, scene);

    const idle = {
      moving: false,
      sprinting: false,
      stridePhase: 0,
      grounded: true,
      velocityX: 0,
      velocityZ: 0,
    };
    for (let i = 0; i < 8; i += 1) torch.update(1 / 30, i * 0.033, idle);
    const restPitch = torch.flame.rotation.x;
    const restRoll = torch.flame.rotation.z;
    const restFlameX = torch.flame.position.x;

    for (let i = 0; i < 24; i += 1) {
      torch.update(1 / 30, i * 0.033, {
        moving: true,
        sprinting: false,
        stridePhase: i * 0.4,
        grounded: true,
        velocityX: -4.2,
        velocityZ: 0,
      });
    }
    expect(torch.flame.rotation.z).toBeLessThan(restRoll);
    expect(torch.flame.position.x).toBeGreaterThan(restFlameX);

    const flameMaterial = Array.isArray(torch.flame.material)
      ? torch.flame.material[0]
      : torch.flame.material;
    expect(isNoiseFlameMaterial(flameMaterial)).toBe(true);
    const leanHandles = (flameMaterial as THREE.ShaderMaterial).userData?.noiseFlameHandles as
      | { uLean: { value: number } }
      | undefined;
    if (leanHandles?.uLean) {
      expect(leanHandles.uLean.value).toBeGreaterThan(0);
    }

    const emberHandles = flameMaterial.userData.emberHandles as
      | { uWind: { value: THREE.Vector2 } }
      | undefined;
    expect(emberHandles?.uWind).toBeDefined();
    expect(emberHandles!.uWind.value.x).toBeGreaterThan(0);

    for (let i = 0; i < 24; i += 1) {
      torch.update(1 / 30, 1 + i * 0.033, {
        moving: true,
        sprinting: true,
        stridePhase: i * 0.4,
        grounded: true,
        velocityX: 0,
        velocityZ: -5.5,
      });
    }
    expect(torch.flame.rotation.x).toBeGreaterThan(restPitch);
    expect(emberHandles!.uWind.value.y).toBeGreaterThan(0);

    expect(setNoiseFlameLean(flameMaterial, 0.2)).toBe(true);
    expect(setNoiseFlameWind(flameMaterial, 0.1, -0.05)).toBe(true);
    torch.dispose();
  });
});
