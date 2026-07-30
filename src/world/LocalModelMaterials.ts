import * as THREE from "three";

import type { DungeonMaterials } from "./MaterialLibrary";
import { registerTextureSource, resolveTextureSource } from "./TextureTreatment";

const textureLoader = new THREE.TextureLoader();
const LOCAL_VARIANTS_KEY = "localModelMaterialVariants";
const bannerClothCache = new WeakMap<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
const brightRootCache = new WeakMap<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
const curedMeatCache = new WeakMap<DungeonMaterials, THREE.MeshStandardMaterial>();

function localVariants(material: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial[] {
  const userData = material.userData as Record<string, unknown>;
  const existing = userData[LOCAL_VARIANTS_KEY] as THREE.MeshStandardMaterial[] | undefined;
  if (existing) return existing;
  const variants: THREE.MeshStandardMaterial[] = [];
  Object.defineProperty(userData, LOCAL_VARIANTS_KEY, {
    configurable: true,
    enumerable: false,
    value: variants,
  });
  return variants;
}

function registerLocalVariant(
  owner: THREE.MeshStandardMaterial,
  variant: THREE.MeshStandardMaterial,
): THREE.MeshStandardMaterial {
  localVariants(owner).push(variant);
  return variant;
}

function syncSharedChannels(
  target: THREE.MeshStandardMaterial,
  source: THREE.MeshStandardMaterial,
): void {
  target.color.copy(source.color);
  target.map = source.map;
  target.normalMap = source.normalMap;
  target.normalScale.copy(source.normalScale);
  target.roughnessMap = source.roughnessMap;
  target.aoMap = source.aoMap;
  target.aoMapIntensity = source.aoMapIntensity;
  target.bumpMap = source.bumpMap;
  target.bumpScale = source.bumpScale;
  target.roughness = source.roughness;
  target.metalness = source.metalness;
  target.envMapIntensity = source.envMapIntensity;
  target.side = source.side;
}

function liftAlbedoValue(color: THREE.Color, scale: number): void {
  // Color values are stored in linear space. Lift the authored/display value
  // so a requested 13–15% change remains visible after sRGB decoding.
  color.convertLinearToSRGB();
  color.setRGB(
    Math.min(1, color.r * scale),
    Math.min(1, color.g * scale),
    Math.min(1, color.b * scale),
  );
  color.convertSRGBToLinear();
}

function localClone(
  source: THREE.MeshStandardMaterial,
  cache: WeakMap<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>,
  name: string,
  role: string,
  valueScale: number,
  indirectFill: number,
): THREE.MeshStandardMaterial {
  let material = cache.get(source);
  if (!material) {
    material = registerLocalVariant(source, source.clone());
    cache.set(source, material);
  }
  syncSharedChannels(material, source);
  material.name = name;
  liftAlbedoValue(material.color, valueScale);
  // White keeps the scalar equal to the requested indirect-fill budget;
  // emissiveMap still supplies the authored albedo and all surface detail.
  material.emissive.set(0xffffff);
  material.emissiveMap = material.map;
  material.emissiveIntensity = indirectFill;
  material.userData.materialRole = role;
  material.userData.localAlbedoValueScale = valueScale;
  material.userData.indirectFill = indirectFill;
  material.userData.sharedDungeonMaterial = true;
  material.needsUpdate = true;
  return material;
}

/** Banner-only cloth lift. Shared cloth on furniture and ropes stays unchanged. */
export function getTatteredBannerClothMaterial(
  materials: DungeonMaterials,
): THREE.MeshStandardMaterial {
  const displayColor = materials.cloth.color.clone().convertLinearToSRGB();
  const displayLuma = displayColor.r * 0.2126 + displayColor.g * 0.7152 + displayColor.b * 0.0722;
  const darkBiomeCompensation = THREE.MathUtils.clamp((0.43 - displayLuma) / 0.04, 0, 1);
  const valueScale = THREE.MathUtils.lerp(1.2, 1.58, darkBiomeCompensation);
  const indirectFill = THREE.MathUtils.lerp(0.1, 0.32, darkBiomeCompensation);
  const normalScale = THREE.MathUtils.lerp(1.45, 1.7, darkBiomeCompensation);
  const material = localClone(
    materials.cloth,
    bannerClothCache,
    "Tattered banner local lifted cloth",
    "tattered-banner-cloth",
    valueScale,
    indirectFill,
  );
  material.normalScale.copy(materials.cloth.normalScale).multiplyScalar(normalScale);
  material.envMapIntensity = Math.max(materials.cloth.envMapIntensity, 0.18);
  material.userData.localNormalScale = normalScale;
  material.userData.darkBiomeCompensation = darkBiomeCompensation;
  return material;
}

/** Vine and ground-tangle bark lift. Other wood and root props keep their base finish. */
export function getReadableRootMaterial(materials: DungeonMaterials): THREE.MeshStandardMaterial {
  return localClone(
    materials.root,
    brightRootCache,
    "Readable local root bark",
    "readable-root-bark",
    1.15,
    0.245,
  );
}

function curedMeatTexture(kind: "albedo" | "normal" | "roughness" | "ao"): THREE.Texture {
  const path = `/assets/textures/model-materials-v2/cured-meat/cured-meat_${kind}.webp`;
  const texture =
    typeof document === "undefined"
      ? new THREE.Texture()
      : textureLoader.load(path, (loaded) => resolveTextureSource(loaded));
  registerTextureSource(texture, path, { seam: "none" });
  texture.name = path;
  texture.colorSpace = kind === "albedo" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, 1);
  texture.userData.uvStrategy = "single-rear-longitudinal-seam-clamp";
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  if (kind === "ao") texture.channel = 0;
  return texture;
}

/** Lazy meat-only PBR material; the model pays its four texture maps only when used. */
export function getCuredMeatMaterial(materials: DungeonMaterials): THREE.MeshStandardMaterial {
  let material = curedMeatCache.get(materials);
  if (!material) {
    const albedo = curedMeatTexture("albedo");
    const normal = curedMeatTexture("normal");
    const roughness = curedMeatTexture("roughness");
    const ao = curedMeatTexture("ao");
    material = registerLocalVariant(
      materials.cloth,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: albedo,
        normalMap: normal,
        normalScale: new THREE.Vector2(0.72, 0.72),
        roughness: 1,
        roughnessMap: roughness,
        aoMap: ao,
        aoMapIntensity: 0.58,
        metalness: 0,
        envMapIntensity: 0.16,
      }),
    );
    material.name = "Cured meat local ImageGen PBR";
    material.userData.materialRole = "cured-meat";
    material.userData.sourceImage =
      "assets-source/imagegen/material-textures-v2/cured-meat-albedo-source.png";
    material.userData.effectiveRoughnessRange = [0.75, 0.81];
    material.userData.organicSurface = true;
    material.userData.uvStrategy = "single-rear-longitudinal-seam-clamp";
    material.userData.sharedDungeonMaterial = true;
    curedMeatCache.set(materials, material);
  }
  // Keep a restrained share of the active cloth tint so the meat sits in the
  // current biome while the authored dark-red albedo remains dominant.
  material.color.copy(materials.cloth.color).lerp(new THREE.Color(0xffffff), 0.72);
  material.emissive.copy(material.color);
  material.emissiveMap = material.map;
  material.emissiveIntensity = 0.035;
  return material;
}

export function getAttachedLocalModelMaterialVariants(
  material: THREE.MeshStandardMaterial,
): readonly THREE.MeshStandardMaterial[] {
  return (
    ((material.userData as Record<string, unknown>)[LOCAL_VARIANTS_KEY] as
      | THREE.MeshStandardMaterial[]
      | undefined) ?? []
  );
}
