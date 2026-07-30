import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { ThreeResourceDisposer } from "../src/world/ThreeResourceDisposer";

describe("ThreeResourceDisposer", () => {
  test("disposes shared geometry and owned material exactly once across roots", () => {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    const left = new THREE.Group();
    const right = new THREE.Group();
    left.add(new THREE.Mesh(geometry, material));
    right.add(new THREE.Mesh(geometry, material));

    let geometryDisposals = 0;
    let materialDisposals = 0;
    geometry.addEventListener("dispose", () => (geometryDisposals += 1));
    material.addEventListener("dispose", () => (materialDisposals += 1));

    const disposer = new ThreeResourceDisposer();
    disposer.dispose(left);
    disposer.dispose(right);

    expect(geometryDisposals).toBe(1);
    expect(materialDisposals).toBe(1);
  });

  test("leaves shared dungeon materials with their library owner", () => {
    const geometry = new THREE.PlaneGeometry();
    const material = new THREE.MeshBasicMaterial();
    material.userData.sharedDungeonMaterial = true;
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));

    let geometryDisposals = 0;
    let materialDisposals = 0;
    geometry.addEventListener("dispose", () => (geometryDisposals += 1));
    material.addEventListener("dispose", () => (materialDisposals += 1));

    new ThreeResourceDisposer().dispose(root);

    expect(geometryDisposals).toBe(1);
    expect(materialDisposals).toBe(0);
  });
});
