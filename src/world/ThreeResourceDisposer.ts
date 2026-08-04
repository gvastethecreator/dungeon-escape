import * as THREE from "three";
import type { SceneTextureSink } from "../systems/SceneTextureRegistry";
import { unlinkTextureClone } from "./TextureTreatment";

interface OwnedTextureResources {
  readonly textures: readonly THREE.Texture[];
  readonly textureSink?: SceneTextureSink;
  readonly unlinkClones: boolean;
  readonly deactivate?: () => void;
}

const OWNED_TEXTURE_RESOURCES = Symbol("ownedTextureResources");

/** Explicit ownership tag. Material clones do not inherit symbol-keyed resources. */
export function tagOwnedMaterialTextures(
  material: THREE.Material,
  textures: readonly THREE.Texture[],
  options: {
    textureSink?: SceneTextureSink;
    unlinkClones?: boolean;
    deactivate?: () => void;
  } = {},
): void {
  Object.defineProperty(material, OWNED_TEXTURE_RESOURCES, {
    configurable: true,
    enumerable: false,
    value: {
      textures: [...new Set(textures)],
      textureSink: options.textureSink,
      unlinkClones: options.unlinkClones ?? false,
      deactivate: options.deactivate,
    } satisfies OwnedTextureResources,
  });
}

export function hasTaggedOwnedMaterialTextures(material: THREE.Material): boolean {
  return Boolean(
    (material as THREE.Material & { [OWNED_TEXTURE_RESOURCES]?: OwnedTextureResources })[
      OWNED_TEXTURE_RESOURCES
    ],
  );
}

/**
 * Owns exactly-once cleanup for one Three object lifecycle. Reuse one instance
 * while clearing sibling roots so shared geometry and materials are not
 * disposed more than once.
 */
export class ThreeResourceDisposer {
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textureOwners = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();

  constructor(
    private readonly geometryIsExternallyOwned: (geometry: THREE.BufferGeometry) => boolean = () =>
      false,
  ) {}

  dispose(root: THREE.Object3D): void {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      const geometry = mesh.geometry;
      if (geometry && !this.geometries.has(geometry)) {
        this.geometries.add(geometry);
        if (!this.geometryIsExternallyOwned(geometry)) geometry.dispose();
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
    const externallyOwned =
      material.userData.sharedDungeonMaterial === true ||
      material.userData.sharedDungeonMaterialVariant === true;
    if ((!owned && externallyOwned) || this.materials.has(material)) return;
    const tagged = (
      material as THREE.Material & {
        [OWNED_TEXTURE_RESOURCES]?: OwnedTextureResources;
      }
    )[OWNED_TEXTURE_RESOURCES];
    if (tagged && !this.textureOwners.has(material)) {
      this.textureOwners.add(material);
      tagged.deactivate?.();
      for (const texture of tagged.textures) {
        if (this.textures.has(texture)) continue;
        this.textures.add(texture);
        tagged.textureSink?.unregister(texture);
        if (tagged.unlinkClones) unlinkTextureClone(texture);
        texture.dispose();
      }
    }
    this.materials.add(material);
    material.dispose();
  }
}
