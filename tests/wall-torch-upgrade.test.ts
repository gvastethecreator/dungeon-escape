import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import {
  createWallLantern,
  createWallTorch,
  WALL_LANTERN_LIGHT_INTENSITY,
} from "../src/world/WallTorchFactory";

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
    expect(torch.flame.geometry.name).toBe("Authored low-poly flame tongue");
    expect(torch.flame.geometry).not.toBeInstanceOf(THREE.OctahedronGeometry);
    expect(torch.flameDetails.length).toBeGreaterThanOrEqual(1);
    expect(torch.root.scale.x).toBeGreaterThanOrEqual(0.76);
    expect(torch.baseIntensity).toBeGreaterThanOrEqual(40);
    expect(torch.baseIntensity).toBeLessThanOrEqual(48);
    expect((torch.flame.material as THREE.MeshBasicMaterial).toneMapped).toBe(true);
    expect(torch.light?.distance).toBeGreaterThanOrEqual(12);
  });

  test("keeps the lantern variant at the same useful room scale", () => {
    const lantern = createWallLantern(
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, 1),
      true,
      createDungeonMaterials(),
    );
    expect(lantern.baseIntensity).toBe(WALL_LANTERN_LIGHT_INTENSITY);
    expect(lantern.root.getObjectsByProperty("type", "PointLight")).toHaveLength(1);
    expect((lantern.flame.material as THREE.MeshBasicMaterial).toneMapped).toBe(true);
    expect(lantern.light?.distance).toBeGreaterThanOrEqual(12);
    expect(lantern.root.scale.x).toBeGreaterThanOrEqual(0.74);
  });
});
