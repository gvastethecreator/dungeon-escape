import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createWallLantern, createWallTorch } from "../src/world/WallTorchFactory";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";

describe("wall torch assembly", () => {
  test("keeps the flame on the wall and uses radial spherical light only", () => {
    const position = new THREE.Vector3(3, 1.42, -4);
    const torch = createWallTorch(position, new THREE.Vector3(0, 0, 1), true);
    torch.root.updateMatrixWorld(true);
    const flameWorld = torch.flame.getWorldPosition(new THREE.Vector3());
    expect(torch.root.name).toBe("Wall torch sconce");
    expect(torch.root.position.y).toBeCloseTo(1.42);
    expect(torch.root.scale.x).toBeCloseTo(0.78);
    // Compact sconce: flame still sits above the mount and projects into the room.
    expect(flameWorld.y).toBeGreaterThan(1.95);
    expect(flameWorld.z).toBeGreaterThan(position.z + 0.35);
    expect(torch.light?.position.z).toBeGreaterThan(0.8);
    expect(torch.root.getObjectByName("Torch wall plate")).toBeDefined();
    expect(torch.light?.isPointLight).toBe(true);
    expect(torch.root.getObjectsByProperty("name", "Wall torch spherical light halo")).toHaveLength(
      2,
    );
    // glow card + 2 spherical halos (no forward light cone)
    expect(torch.halos).toHaveLength(3);
    expect(torch.flameDetails).toHaveLength(1);
    expect(torch.root.getObjectByName("Wall torch light volume")).toBeUndefined();
    expect(torch.root.getObjectByName("Torch projected volume")).toBeUndefined();
  });

  test("image-sculpted lantern keeps the light and action hinge on the wall mount", () => {
    const lantern = createWallLantern(
      new THREE.Vector3(1, 1.4, 2),
      new THREE.Vector3(1, 0, 0),
      true,
      createDungeonMaterials(),
    );
    expect(lantern.root.name).toBe("Image-sculpted wall lantern sconce");
    expect(lantern.root.scale.x).toBeCloseTo(0.76);
    expect(lantern.root.getObjectByName("Lantern cage door hinge")?.userData.socket.type).toBe(
      "hinge",
    );
    expect(lantern.light?.isPointLight).toBe(true);
    // spherical halo only (no forward light cone)
    expect(lantern.halos).toHaveLength(1);
    expect(lantern.root.getObjectByName("Wall lantern spherical light halo")).toBeDefined();
    expect(lantern.root.getObjectByName("Wall torch light volume")).toBeUndefined();
  });
});
