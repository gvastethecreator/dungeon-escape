import * as THREE from "three";

import { registerTextureSource, resolveTextureSource } from "./TextureTreatment";

const textureLoader = new THREE.TextureLoader();
const FAMILY = "luminous-ward-gold";
const BASE = `/assets/textures/model-materials-v2/${FAMILY}/${FAMILY}`;

interface WardTextureSet {
  albedo: THREE.Texture;
  normal: THREE.Texture | null;
  roughness: THREE.Texture | null;
  ao: THREE.Texture | null;
}

export function createLuminousWardRuntimeTexture(
  kind: "albedo" | "normal" | "roughness" | "ao",
): THREE.Texture {
  const path = `${BASE}_${kind}.png`;
  const texture =
    typeof document === "undefined"
      ? new THREE.Texture()
      : textureLoader.load(path, (loaded) => resolveTextureSource(loaded));
  texture.name = path;
  registerTextureSource(texture, path, { seam: "none" });
  texture.colorSpace = kind === "albedo" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  // Match the former 2x2 canvas density without expanding a 512 px map to 1024 px.
  texture.repeat.set(2, 2);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  if (kind === "ao") texture.channel = 0;
  return texture;
}

function loadWardTextureSet(compact: boolean): WardTextureSet {
  const albedo = createLuminousWardRuntimeTexture("albedo");
  if (compact || typeof document === "undefined") {
    return { albedo, normal: null, roughness: null, ao: null };
  }
  return {
    albedo,
    normal: createLuminousWardRuntimeTexture("normal"),
    roughness: createLuminousWardRuntimeTexture("roughness"),
    ao: createLuminousWardRuntimeTexture("ao"),
  };
}

/**
 * The ward owns this material so its warm mineral does not reuse or recolor
 * the purple arcane-crystal role. The optional biome tint stays weak enough to
 * preserve the gold identity while tying the pickup to cold or warm rooms.
 */
export function createLuminousWardGoldMaterial({
  compact = false,
  biomeTint,
}: {
  compact?: boolean;
  biomeTint?: THREE.Color;
} = {}): THREE.MeshPhysicalMaterial {
  const maps = loadWardTextureSet(compact);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xd1c18f,
    map: maps.albedo,
    normalMap: maps.normal,
    normalScale: new THREE.Vector2(0.28, 0.28),
    roughness: maps.roughness ? 0.52 : 0.46,
    roughnessMap: maps.roughness,
    metalness: 0,
    aoMap: maps.ao,
    aoMapIntensity: 0.62,
    envMapIntensity: 0.72,
    transmission: 0,
    thickness: 0,
    ior: 1.43,
    attenuationColor: new THREE.Color(0xd5b966),
    attenuationDistance: 1.8,
    clearcoat: 0.16,
    clearcoatRoughness: 0.3,
  });
  if (biomeTint) {
    const normalized = biomeTint.clone();
    const peak = Math.max(normalized.r, normalized.g, normalized.b, 1e-4);
    normalized.multiplyScalar(1 / peak);
    material.color.lerp(normalized, 0.1);
  }
  material.emissive.setHex(0x4d3b13);
  material.emissiveIntensity = 0.44;
  material.userData.materialRole = FAMILY;
  material.userData.absoluteRoughnessMap = maps.roughness !== null;
  material.userData.sourceMaps = {
    albedo: maps.albedo.name,
    normal: maps.normal?.name ?? null,
    roughness: maps.roughness?.name ?? null,
    ao: maps.ao?.name ?? null,
  };
  return material;
}
