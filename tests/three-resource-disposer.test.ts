import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { ThreeResourceDisposer } from "../src/world/ThreeResourceDisposer";
import { StaticResourceCatalog } from "../src/world/StaticResourceCatalog";

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

  test("leaves shared material variants borrowed when a mesh uses a material array", () => {
    const geometry = new THREE.BoxGeometry();
    const base = new THREE.MeshBasicMaterial();
    const variant = new THREE.MeshBasicMaterial();
    base.userData.sharedDungeonMaterial = true;
    variant.userData.sharedDungeonMaterialVariant = true;
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, [base, variant]));
    let baseDisposals = 0;
    let variantDisposals = 0;
    base.addEventListener("dispose", () => (baseDisposals += 1));
    variant.addEventListener("dispose", () => (variantDisposals += 1));

    new ThreeResourceDisposer().dispose(root);

    expect(baseDisposals).toBe(0);
    expect(variantDisposals).toBe(0);
  });

  test("leaves catalog geometry mounted consumers do not own", () => {
    const catalog = new StaticResourceCatalog();
    const geometry = catalog.borrowGeometry("borrowed", () => new THREE.BoxGeometry());
    const material = new THREE.MeshBasicMaterial();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));
    let geometryDisposals = 0;
    let materialDisposals = 0;
    geometry.addEventListener("dispose", () => (geometryDisposals += 1));
    material.addEventListener("dispose", () => (materialDisposals += 1));

    new ThreeResourceDisposer((candidate) => catalog.ownsGeometry(candidate)).dispose(root);

    expect(geometryDisposals).toBe(0);
    expect(materialDisposals).toBe(1);
    catalog.dispose();
    catalog.dispose();
    expect(geometryDisposals).toBe(1);
  });
});
