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

/** Apply one explicit sampling policy to every material texture in the live scene. */
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
    texture.magFilter = enabled ? THREE.LinearFilter : THREE.NearestFilter;
    texture.minFilter = enabled
      ? texture.generateMipmaps
        ? THREE.LinearMipmapLinearFilter
        : THREE.LinearFilter
      : texture.generateMipmaps
        ? THREE.NearestMipmapNearestFilter
        : THREE.NearestFilter;
    texture.needsUpdate = true;
  }
  return textures.size;
}
