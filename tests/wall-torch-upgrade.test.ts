import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createWallLantern, createWallTorch } from "../src/world/WallTorchFactory";

describe("authored wall torch", () => {
  test("has a forged silhouette, layered flame and room-scale light", () => {
    const torch = createWallTorch(
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, 1),
      true,
      createDungeonMaterials(),
    );

    expect(torch.root.getObjectByName("Torch forged shield plate")).toBeDefined();
    expect(torch.root.getObjectByName("Torch scroll bracket")).toBeDefined();
    expect(torch.flameDetails.length).toBeGreaterThanOrEqual(1);
    expect(torch.root.scale.x).toBeGreaterThanOrEqual(0.76);
    expect(torch.baseIntensity).toBeGreaterThanOrEqual(56);
    expect(torch.light?.distance).toBeGreaterThanOrEqual(12);
  });

  test("keeps the lantern variant at the same useful room scale", () => {
    const lantern = createWallLantern(
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, 1),
      true,
      createDungeonMaterials(),
    );
    expect(lantern.baseIntensity).toBeGreaterThanOrEqual(50);
    expect(lantern.light?.distance).toBeGreaterThanOrEqual(12);
    expect(lantern.root.scale.x).toBeGreaterThanOrEqual(0.74);
  });
});
