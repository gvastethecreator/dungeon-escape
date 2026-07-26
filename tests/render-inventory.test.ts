import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { collectVisibleRenderInventory } from "../src/systems/RenderInventory";

describe("render inventory", () => {
  test("groups only visible render calls inside the camera frustum", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    const torch = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    torch.name = "Torch wall plate";
    const enemy = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    enemy.name = "Enemy billboard batch spider";
    enemy.position.x = 200;
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    hidden.name = "Campfire outer flame";
    hidden.visible = false;
    root.add(torch, enemy, hidden);

    const inventory = collectVisibleRenderInventory(root, camera);
    expect(inventory.totalCalls).toBe(1);
    expect(inventory.buckets).toEqual({ "wall-fire": 1 });
  });

  test("counts material groups as separate draw calls", () => {
    const root = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 5;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, [
      new THREE.MeshBasicMaterial(),
      new THREE.MeshBasicMaterial(),
    ]);
    mesh.name = "Potion chest 2,4";
    root.add(mesh);

    expect(collectVisibleRenderInventory(root, camera)).toMatchObject({
      totalCalls: 2,
      buckets: { "potion-chests": 2 },
    });
  });
});
