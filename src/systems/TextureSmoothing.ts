import * as THREE from "three";

function materialTextures(material: THREE.Material): THREE.Texture[] {
  const textures = new Set<THREE.Texture>();
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) textures.add(value);
  }
  if (material instanceof THREE.ShaderMaterial) {
    for (const uniform of Object.values(material.uniforms)) {
      if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
    }
  }
  return [...textures];
}

export function textureHasRenderableImage(texture: THREE.Texture): boolean {
  const image = texture.image as
    | {
        width?: number;
        height?: number;
        naturalWidth?: number;
        naturalHeight?: number;
        videoWidth?: number;
        videoHeight?: number;
      }
    | undefined;
  if (!image) return false;
  const widths = [image.width, image.naturalWidth, image.videoWidth].map(Number);
  const heights = [image.height, image.naturalHeight, image.videoHeight].map(Number);
  return (
    widths.some((value) => Number.isFinite(value) && value > 0) &&
    heights.some((value) => Number.isFinite(value) && value > 0)
  );
}

/** Resolve the sampling filters for one texture under the current smoothing policy. */
export function resolveTextureSmoothingFilters(
  texture: THREE.Texture,
  enabled: boolean,
): { magFilter: THREE.MagnificationTextureFilter; minFilter: THREE.MinificationTextureFilter } {
  // When smoothing is off, always use non-mip nearest filters. Forcing
  // NearestMipmapNearest on atlases that are still decoding (or have no mips
  // yet) leaves walls/floors black after a map load.
  if (!enabled) {
    return {
      magFilter: THREE.NearestFilter,
      minFilter: THREE.NearestFilter,
    };
  }
  return {
    magFilter: THREE.LinearFilter,
    minFilter: texture.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
  };
}

/** Apply the current policy to one ready texture, returning whether filters changed. */
export function applyTextureSmoothingToTexture(texture: THREE.Texture, enabled: boolean): boolean {
  if (!textureHasRenderableImage(texture)) return false;
  const next = resolveTextureSmoothingFilters(texture, enabled);
  let changed = false;
  if (texture.magFilter !== next.magFilter) {
    texture.magFilter = next.magFilter;
    changed = true;
  }
  if (texture.minFilter !== next.minFilter) {
    texture.minFilter = next.minFilter;
    changed = true;
  }
  if (changed) texture.needsUpdate = true;
  return changed;
}

/**
 * Apply one explicit sampling policy to every material texture in the live scene.
 * Only marks `needsUpdate` when a filter actually changes so successive map loads
 * do not re-upload every shared biome atlas to the GPU.
 */
export function applyTextureSmoothing(scene: THREE.Scene, enabled: boolean): number {
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const texture of materialTextures(material)) textures.add(texture);
    }
  });
  for (const texture of textures) {
    // Incomplete TextureLoader placeholders: changing filters + needsUpdate can
    // poison the first GPU upload and leave the map untextured until reload.
    applyTextureSmoothingToTexture(texture, enabled);
  }
  return textures.size;
}
