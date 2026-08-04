import * as THREE from "three";
import type { SceneTextureSink } from "../systems/SceneTextureRegistry";

import { registerTextureSource, resolveTextureSource } from "./TextureTreatment";
import { tagOwnedMaterialTextures } from "./ThreeResourceDisposer";

const textureLoader = new THREE.TextureLoader();
const FAMILY = "luminous-ward-gold";
const BASE = `/assets/textures/model-materials-v2/${FAMILY}/${FAMILY}`;

interface WardTextureSet {
  albedo: THREE.Texture;
  normal: THREE.Texture | null;
  roughness: THREE.Texture | null;
  ao: THREE.Texture | null;
}

interface WardTextureLifecycle {
  active: boolean;
  textureSink?: SceneTextureSink;
}

function loadWardRuntimeTexture(
  kind: "albedo" | "normal" | "roughness" | "ao",
  lifecycle?: WardTextureLifecycle,
): THREE.Texture {
  const path = `${BASE}_${kind}.webp`;
  const texture =
    typeof document === "undefined"
      ? new THREE.Texture()
      : textureLoader.load(path, (loaded) => {
          if (lifecycle && !lifecycle.active) return;
          resolveTextureSource(loaded);
          lifecycle?.textureSink?.markRenderable(loaded);
        });
  texture.name = path;
  registerTextureSource(texture, path, { seam: "none" });
  texture.colorSpace = kind === "albedo" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.repeat.set(2, 2);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  if (kind === "ao") texture.channel = 0;
  if (typeof document !== "undefined") lifecycle?.textureSink?.register(texture);
  return texture;
}

export function createLuminousWardRuntimeTexture(
  kind: "albedo" | "normal" | "roughness" | "ao",
  textureSink?: SceneTextureSink,
): THREE.Texture {
  return loadWardRuntimeTexture(kind, { active: true, textureSink });
}

function loadWardTextureSet(compact: boolean, lifecycle: WardTextureLifecycle): WardTextureSet {
  const albedo = loadWardRuntimeTexture("albedo", lifecycle);
  if (compact || typeof document === "undefined") {
    return { albedo, normal: null, roughness: null, ao: null };
  }
  return {
    albedo,
    normal: loadWardRuntimeTexture("normal", lifecycle),
    roughness: loadWardRuntimeTexture("roughness", lifecycle),
    ao: loadWardRuntimeTexture("ao", lifecycle),
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
  textureSink,
}: {
  compact?: boolean;
  biomeTint?: THREE.Color;
  textureSink?: SceneTextureSink;
} = {}): THREE.MeshPhysicalMaterial {
  const lifecycle: WardTextureLifecycle = { active: true, textureSink };
  const maps = loadWardTextureSet(compact, lifecycle);
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
  tagOwnedMaterialTextures(
    material,
    [maps.albedo, maps.normal, maps.roughness, maps.ao].filter(
      (texture): texture is THREE.Texture => texture !== null,
    ),
    {
      textureSink,
      deactivate: () => {
        lifecycle.active = false;
        lifecycle.textureSink = undefined;
      },
    },
  );
  return material;
}
