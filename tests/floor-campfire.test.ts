import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { FIRE_LIGHT_TUNING } from "../src/systems/LightTuning";
import { createFloorCampfire, FLOOR_CAMPFIRE_MESH_SCALE } from "../src/world/FloorCampfireFactory";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";

describe("floor campfire assembly", () => {
  test("image-sculpted campfire has stone ring, logs, layered flame and radial light", () => {
    const materials = createDungeonMaterials();
    const fire = createFloorCampfire(new THREE.Vector3(2, 0, -3), true, materials, 1);
    fire.root.updateMatrixWorld(true);

    expect(fire.root.name).toBe("Image-sculpted floor campfire");
    expect(fire.root.position.y).toBe(0);
    expect(fire.root.scale.x).toBeCloseTo(FLOOR_CAMPFIRE_MESH_SCALE);
    expect(fire.root.getObjectByName("Campfire stone ring")).toBeDefined();
    expect(fire.root.getObjectByName("Campfire log triangle")).toBeDefined();
    expect(fire.root.getObjectByName("Campfire coal bed")).toBeDefined();
    expect(fire.root.getObjectByName("Campfire procedural noise flame")).toBe(fire.flame);
    expect(fire.flame.geometry.name).toBe("Procedural teardrop noise flame card");
    expect(fire.flameDetails).toHaveLength(1);
    expect(fire.flameDetails[0]).toBeInstanceOf(THREE.Points);
    expect(fire.light?.isPointLight).toBe(true);
    expect(fire.light?.distance).toBe(FIRE_LIGHT_TUNING.candleRange);
    expect(fire.baseIntensity).toBeGreaterThanOrEqual(24);
    expect(fire.baseIntensity).toBeLessThanOrEqual(28);
    expect(fire.flame.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect((fire.flame.material as THREE.ShaderMaterial).toneMapped).toBe(true);
    expect(fire.baseY).toBeGreaterThan(0.2);
    expect(fire.baseY).toBeLessThan(0.55);
    expect(fire.halos.length).toBeGreaterThanOrEqual(2);
    expect(fire.root.userData.sculptRuntime?.sourceImage).toContain("floor-campfire");
    expect(fire.root.userData.sculptRuntime?.family).toBe("floor-campfire");

    // Measure solid material batches only; additive light geometry is tagged VFX.
    const solid = new THREE.Group();
    fire.root.traverse((part) => {
      if (part instanceof THREE.Mesh && !part.userData.vfxOnly) solid.add(part.clone());
    });
    const size = new THREE.Box3().setFromObject(solid).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(0.55);
    expect(size.x).toBeLessThan(1.15);
    expect(size.z).toBeGreaterThan(0.55);
    expect(size.z).toBeLessThan(1.15);
    expect(size.y).toBeGreaterThan(0.12);
    expect(size.y).toBeLessThan(0.55);
  });

  test("unlit campfire keeps geometry but hides flame and light", () => {
    const fire = createFloorCampfire(new THREE.Vector3(), false, createDungeonMaterials());
    expect(fire.flame.visible).toBe(false);
    expect(fire.light).toBeNull();
  });
});
