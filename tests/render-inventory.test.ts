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
    expect(inventory.mappedLitCalls).toBe(0);
    expect(inventory.mappedWithoutUvCalls).toBe(0);
    expect(inventory.degenerateUvCalls).toBe(0);
    expect(inventory.unreadyMappedCalls).toBe(0);
    expect(inventory.untexturedLitCalls).toBe(0);
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

  test("reports mapped and untextured lit calls by visible bucket", () => {
    const root = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 5;
    const readyMap = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    readyMap.needsUpdate = true;
    const mapped = new THREE.MeshStandardMaterial({ map: readyMap });
    const flat = new THREE.MeshStandardMaterial({ color: 0x777777 });
    const bookshelf = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mapped);
    bookshelf.name = "Classic bookshelf:1 batch 1";
    const rubble = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), flat);
    rubble.name = "Atmosphere rubble pile batch 1";
    rubble.position.x = 1.5;
    root.add(bookshelf, rubble);

    expect(collectVisibleRenderInventory(root, camera)).toMatchObject({
      mappedLitCalls: 1,
      mappedWithoutUvCalls: 0,
      degenerateUvCalls: 0,
      unreadyMappedCalls: 0,
      untexturedLitCalls: 1,
      untexturedLitBuckets: { "atmosphere-dressing": 1 },
    });
  });

  test("reports mapped materials that cannot sample a UV", () => {
    const root = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 5;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 0, 1, 0], 3),
    );
    const rubble = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        map: new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1),
      }),
    );
    rubble.name = "Atmosphere rubble pile batch 1";
    root.add(rubble);

    expect(collectVisibleRenderInventory(root, camera)).toMatchObject({
      mappedLitCalls: 1,
      mappedWithoutUvCalls: 1,
      mappedWithoutUvBuckets: { "atmosphere-dressing": 1 },
    });
  });

  test("reports mapped materials whose image is still unavailable", () => {
    const root = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 5;
    const bookshelf = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ map: new THREE.Texture() }),
    );
    bookshelf.name = "Classic bookshelf:1 batch 1";
    root.add(bookshelf);

    expect(collectVisibleRenderInventory(root, camera)).toMatchObject({
      mappedLitCalls: 1,
      unreadyMappedCalls: 1,
      unreadyMappedBuckets: { "classic:bookshelf:1": 1 },
    });
  });

  test("reports UVs that collapse to one line", () => {
    const root = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 5;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 0, 1, 0], 3),
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 0, 0.5, 0, 1], 2));
    const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map }));
    mesh.name = "Classic bookshelf:1 batch 1";
    root.add(mesh);

    expect(collectVisibleRenderInventory(root, camera)).toMatchObject({
      mappedLitCalls: 1,
      degenerateUvCalls: 1,
      degenerateUvBuckets: { "classic:bookshelf:1": 1 },
    });
  });
});
