/**
 * TSL / WebGPU half of the biome decor treatments (WGP-16).
 * Loaded lazily by TslMaterialModules; the WebGL boot never imports it.
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  clamp,
  dot,
  float,
  materialColor,
  max,
  mix,
  smoothstep,
  texture,
  uniform,
  vec3,
  vec4,
} from "three/tsl";
import type { DungeonMood } from "../systems/DungeonMood";
import { registerTslBuilder } from "../systems/TslMaterialModules";
import type { WallSpriteTextures } from "./AssetLibrary";
import {
  biomeDecorTint,
  BIOME_INTEGRATED_DECOR_FLOOR_TSL_BUILDER_ID,
  BIOME_INTEGRATED_DECOR_SHADER_FACTORY_ID,
  BIOME_MUTED_PROP_SHADER_FACTORY_ID,
} from "./BiomeDecorMaterial";
import type { BiomeSpriteDecorPlacement } from "./BiomeSpriteDecorContract";
import type { BiomeSpritePlacement } from "./BiomeSpriteDecorKit";
import {
  biomeSurfacePalette,
  type BiomeSurfacePaletteRole,
} from "./BiomeSurfacePalettes.generated";

/** Rec.601 — mute path matches the historical GLSL wall-sprite treatment. */
const REC601_LUMA = vec3(0.299, 0.587, 0.114);
/** Rec.709 — integrate path matches the authored-tone GLSL remap. */
const REC709_LUMA = vec3(0.2126, 0.7152, 0.0722);

/**
 * `colorNode` replaces the whole diffuseColor, alpha included. These sprites are
 * alpha-tested cut-outs, so the map alpha has to be carried through or every
 * decal renders as an opaque quad.
 */
function applyMutedPropTslColor(material: MeshStandardNodeMaterial, map: THREE.Texture): void {
  const baseRgb = vec3(materialColor);
  const luma = dot(baseRgb, REC601_LUMA);
  const muted = mix(vec3(luma), baseRgb, float(0.38)).mul(0.78);
  material.colorNode = vec4(muted, texture(map).a);
}

function applyIntegratedDecorTslColor(
  material: MeshStandardNodeMaterial,
  map: THREE.Texture,
): void {
  // materialColor already includes map × material.color (palette tint = GLSL `diffuse`).
  const sampled = vec3(materialColor);
  const tint = uniform(material.color) as any;
  const decorLuma = dot(sampled, REC709_LUMA);
  const tintLuma = max(dot(tint, REC709_LUMA), float(0.001));
  const relative = clamp(decorLuma.div(tintLuma), float(0), float(1));
  const surfaceValue = mix(
    float(0.32),
    float(0.82),
    smoothstep(float(0.08), float(0.92), relative),
  );
  const surfaceTone = tint.mul(surfaceValue);
  const integrated = mix(surfaceTone, sampled, float(0.28)).mul(0.86);
  material.colorNode = vec4(integrated, texture(map).a) as any;
}

export function createWallSpriteMaterialTsl(
  textures: WallSpriteTextures,
  mood: DungeonMood,
  roughness: number,
  opacity: number,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    map: textures.albedo,
    normalMap: textures.normal,
    roughnessMap: textures.rough,
    color: new THREE.Color(mood.surfaceTint).lerp(new THREE.Color(0xffffff), 0.72),
    transparent: true,
    opacity: Math.min(opacity, 0.9),
    alphaTest: opacity < 1 ? 0.16 : 0.1,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: THREE.MathUtils.clamp(roughness, 0.78, 1),
    metalness: 0,
    envMapIntensity: THREE.MathUtils.clamp(mood.environmentIntensity * 1.1, 0.08, 0.32),
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.normalScale.set(0.24, 0.24);
  applyMutedPropTslColor(material, textures.albedo);
  material.customProgramCacheKey = () => "environment-sprite-muted-tsl-v1";
  material.userData.depthTexture = textures.depth;
  material.userData.wallSpritePbr = true;
  material.userData.environmentSpriteTreatment = "muted-biome-fog-v4";
  material.userData.shaderProgramMode = "tsl";
  material.needsUpdate = true;
  return material;
}

export function createBiomeWallDecalMaterialTsl(
  texture: THREE.Texture,
  mood: DungeonMood,
  alphaTest: number,
): MeshStandardNodeMaterial {
  const palette = biomeSurfacePalette(mood.id, "wall");
  const material = new MeshStandardNodeMaterial({
    map: texture,
    color: biomeDecorTint(mood, "wall"),
    emissive: new THREE.Color(palette.base),
    emissiveMap: texture,
    emissiveIntensity: 0.045,
    transparent: true,
    opacity: 1,
    alphaTest,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
    roughness: 0.92,
    metalness: 0,
    envMapIntensity: THREE.MathUtils.clamp(mood.environmentIntensity, 0.08, 0.28),
    fog: true,
  });
  material.toneMapped = true;
  applyIntegratedDecorTslColor(material, texture);
  material.customProgramCacheKey = () => "biome-prop-v2-tsl-wall-integrated-v1";
  material.userData.sharedDungeonMaterial = true;
  material.userData.biomeSpriteWallDecal = true;
  material.userData.authoredColorWeight = 0.28;
  material.userData.brightness = 0.86;
  material.userData.mapBlend = "authored-v2-biome-surface-tone-v6";
  material.userData.biomeMood = mood.id;
  material.userData.biomeSurfacePalette = palette;
  material.userData.biomeSurfacePaletteRole = "wall";
  material.userData.visibilityBoost = 0.06;
  material.userData.shaderProgramMode = "tsl";
  material.needsUpdate = true;
  return material;
}

export function createBiomeFloorSpriteMaterialTsl(
  texture: THREE.Texture,
  mood: DungeonMood,
  placement: BiomeSpritePlacement | BiomeSpriteDecorPlacement,
  alphaTest: number,
): MeshStandardNodeMaterial {
  const isFloorDecal = placement === "floor-decal";
  const paletteRole: BiomeSurfacePaletteRole =
    placement === "ceiling-hanging" ? "ceiling" : "floor";
  const palette = biomeSurfacePalette(mood.id, paletteRole);
  const material = new MeshStandardNodeMaterial({
    map: texture,
    color: biomeDecorTint(mood, paletteRole),
    emissive: new THREE.Color(palette.base),
    emissiveMap: texture,
    emissiveIntensity: 0.045,
    transparent: true,
    opacity: 1,
    alphaTest,
    depthWrite: false,
    depthTest: true,
    polygonOffset: isFloorDecal,
    polygonOffsetFactor: isFloorDecal ? -3 : 0,
    polygonOffsetUnits: isFloorDecal ? -3 : 0,
    side: THREE.DoubleSide,
    roughness: isFloorDecal ? 1 : 0.98,
    metalness: 0,
    envMapIntensity: THREE.MathUtils.clamp(mood.environmentIntensity * 0.8, 0.06, 0.22),
    fog: true,
  });
  material.toneMapped = true;
  applyIntegratedDecorTslColor(material, texture);
  material.customProgramCacheKey = () => `biome-prop-v2-tsl-${placement}-integrated-v1`;
  material.userData.sharedDungeonMaterial = true;
  material.userData.biomeSpritePlacement = placement;
  material.userData.biomeSpriteBillboard =
    placement === "floor-decal" ? "floor-fixed" : "yaw-to-player";
  material.userData.authoredColorWeight = 0.28;
  material.userData.brightness = 0.86;
  material.userData.mapBlend = "authored-v2-biome-surface-tone-v6";
  material.userData.biomeMood = mood.id;
  material.userData.biomeSurfacePalette = palette;
  material.userData.biomeSurfacePaletteRole = paletteRole;
  material.userData.visibilityBoost = 0.06;
  material.userData.shaderProgramMode = "tsl";
  material.needsUpdate = true;
  return material;
}

registerTslBuilder(BIOME_MUTED_PROP_SHADER_FACTORY_ID, createWallSpriteMaterialTsl);
registerTslBuilder(BIOME_INTEGRATED_DECOR_SHADER_FACTORY_ID, createBiomeWallDecalMaterialTsl);
registerTslBuilder(BIOME_INTEGRATED_DECOR_FLOOR_TSL_BUILDER_ID, createBiomeFloorSpriteMaterialTsl);
