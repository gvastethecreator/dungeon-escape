import * as THREE from "three";

/**
 * Owns exactly-once cleanup for one Three object lifecycle. Reuse one instance
 * while clearing sibling roots so shared geometry and materials are not
 * disposed more than once.
 */
export class ThreeResourceDisposer {
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();

  dispose(root: THREE.Object3D): void {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const geometry = mesh.geometry;
      if (geometry && !this.geometries.has(geometry)) {
        this.geometries.add(geometry);
        geometry.dispose();
      }

      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];
      for (const material of materials) this.#disposeMaterial(material, false);
    });
  }

  /** Dispose an explicitly owned cache entry through the same ledger as mounted roots. */
  disposeOwnedMaterial(material: THREE.Material): void {
    this.#disposeMaterial(material, true);
  }

  #disposeMaterial(material: THREE.Material, owned: boolean): void {
    if ((!owned && material.userData.sharedDungeonMaterial) || this.materials.has(material)) return;
    this.materials.add(material);
    material.dispose();
  }
}
