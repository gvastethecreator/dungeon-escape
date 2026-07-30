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
      for (const material of materials) {
        if (material.userData.sharedDungeonMaterial || this.materials.has(material)) continue;
        this.materials.add(material);
        material.dispose();
      }
    });
  }
}
