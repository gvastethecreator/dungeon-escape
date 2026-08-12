/**
 * Dual-mode biome decor / environment sprite treatments (WGP-16).
 *
 * GLSL keeps the historical onBeforeCompile map+fog hooks. TSL rebuilds the
 * authored-tone remap on MeshStandardNodeMaterial for the WebGPU path.
 * Fog alpha soft-kill remains GLSL-only for now (stock FogExp2 already fades
 * lit sprites on both backends).
 */
import * as THREE from "three";
import type { MeshStandardNodeMaterial } from "three/webgpu";
import type { DungeonMood } from "../systems/DungeonMood";
import {
  getShaderProgramModeRegistry,
  onShaderProgramModeRegistryChange,
  type ShaderProgramMode,
} from "../systems/ShaderProgramMode";
import { requireTslBuilder } from "../systems/TslMaterialModules";
import type { WallSpriteTextures } from "./AssetLibrary";
import {
  biomeSurfacePalette,
  type BiomeSurfacePaletteRole,
} from "./BiomeSurfacePalettes.generated";
import type { BiomeSpriteDecorPlacement } from "./BiomeSpriteDecorContract";
import type { BiomeSpritePlacement } from "./BiomeSpriteDecorKit";

/** ShaderProgramMode factory id for muted environment wall sprites. */
export const BIOME_MUTED_PROP_SHADER_FACTORY_ID = "biome-muted-prop";
/** ShaderProgramMode factory id for palette-integrated biome decor sprites. */
export const BIOME_INTEGRATED_DECOR_SHADER_FACTORY_ID = "biome-integrated-decor";
/** Second builder slot: floor/ceiling placements of the integrated decor. */
export const BIOME_INTEGRATED_DECOR_FLOOR_TSL_BUILDER_ID = "biome-integrated-decor:floor";

export type BiomeDecorMaterial = THREE.MeshStandardMaterial | MeshStandardNodeMaterial;

export function registerBiomeDecorShaderFactories(registry = getShaderProgramModeRegistry()): void {
  registry.register({
    id: BIOME_MUTED_PROP_SHADER_FACTORY_ID,
    supports: ["glsl", "tsl"],
  });
  registry.register({
    id: BIOME_INTEGRATED_DECOR_SHADER_FACTORY_ID,
    supports: ["glsl", "tsl"],
  });
}

registerBiomeDecorShaderFactories();
onShaderProgramModeRegistryChange(registerBiomeDecorShaderFactories);

export function biomeDecorTint(mood: DungeonMood, surface: BiomeSurfacePaletteRole): THREE.Color {
  return new THREE.Color(biomeSurfacePalette(mood.id, surface).propTint);
}

/**
 * Mute bright atlas cells, then dissolve wall sprites into FogExp2 so distant
 * alpha-tested silhouettes do not punch through the exploration fog wall.
 */
export function muteBiomePropShader(shader: { fragmentShader: string }): void {
  const mapChunk = "#include <map_fragment>";
  if (shader.fragmentShader.includes(mapChunk)) {
    shader.fragmentShader = shader.fragmentShader.replace(
      mapChunk,
      `${mapChunk}
      float biomePropLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      diffuseColor.rgb = mix(vec3(biomePropLuma), diffuseColor.rgb, 0.38);
      diffuseColor.rgb *= 0.78;`,
    );
  }
  const fogChunk = "#include <fog_fragment>";
  if (!shader.fragmentShader.includes(fogChunk)) return;
  shader.fragmentShader = shader.fragmentShader.replace(
    fogChunk,
    `${fogChunk}
  #ifdef USE_FOG
    float biomePropFogVisibility = 1.0 - smoothstep(0.24, 0.62, fogFactor);
    gl_FragColor.a *= biomePropFogVisibility;
  #endif`,
  );
}

/** Pull authored sprite color and value toward the extracted surface palette. */
export function integrateBiomeDecorShader(shader: { fragmentShader: string }): void {
  const mapChunk = "#include <map_fragment>";
  if (shader.fragmentShader.includes(mapChunk)) {
    shader.fragmentShader = shader.fragmentShader.replace(
      mapChunk,
      `${mapChunk}
      float biomeDecorLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      float biomeDecorTintLuma = max(dot(diffuse, vec3(0.2126, 0.7152, 0.0722)), 0.001);
      float biomeDecorRelativeLuma = clamp(biomeDecorLuma / biomeDecorTintLuma, 0.0, 1.0);
      float biomeDecorSurfaceValue = mix(0.32, 0.82, smoothstep(0.08, 0.92, biomeDecorRelativeLuma));
      vec3 biomeDecorSurfaceTone = diffuse * biomeDecorSurfaceValue;
      diffuseColor.rgb = mix(biomeDecorSurfaceTone, diffuseColor.rgb, 0.28);
      diffuseColor.rgb *= 0.86;`,
    );
  }
  const fogChunk = "#include <fog_fragment>";
  if (shader.fragmentShader.includes(fogChunk)) {
    shader.fragmentShader = shader.fragmentShader.replace(
      fogChunk,
      `${fogChunk}
  #ifdef USE_FOG
    float biomeDecorFogVisibility = 1.0 - smoothstep(0.24, 0.62, fogFactor);
    gl_FragColor.a *= biomeDecorFogVisibility;
  #endif`,
    );
  }
}

function createWallSpriteMaterialGlsl(
  textures: WallSpriteTextures,
  mood: DungeonMood,
  roughness: number,
  opacity: number,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
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
  material.onBeforeCompile = muteBiomePropShader;
  material.customProgramCacheKey = () => "environment-sprite-muted-fog-v4";
  material.userData.depthTexture = textures.depth;
  material.userData.wallSpritePbr = true;
  material.userData.environmentSpriteTreatment = "muted-biome-fog-v4";
  material.userData.shaderProgramMode = "glsl";
  return material;
}

export function createWallSpriteMaterial(
  textures: WallSpriteTextures,
  mood: DungeonMood,
  roughness: number,
  opacity = 1,
  mode?: ShaderProgramMode,
): BiomeDecorMaterial {
  registerBiomeDecorShaderFactories();
  const registry = getShaderProgramModeRegistry();
  const resolved = mode ?? registry.mode;
  registry.require(BIOME_MUTED_PROP_SHADER_FACTORY_ID, resolved);
  if (resolved === "tsl") {
    const build = requireTslBuilder<
      typeof import("./BiomeDecorMaterial.tsl").createWallSpriteMaterialTsl
    >(BIOME_MUTED_PROP_SHADER_FACTORY_ID);
    return build(textures, mood, roughness, opacity);
  }
  return createWallSpriteMaterialGlsl(textures, mood, roughness, opacity);
}

function createBiomeWallDecalMaterialGlsl(
  texture: THREE.Texture,
  mood: DungeonMood,
  alphaTest: number,
): THREE.MeshStandardMaterial {
  const palette = biomeSurfacePalette(mood.id, "wall");
  const material = new THREE.MeshStandardMaterial({
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
  material.onBeforeCompile = integrateBiomeDecorShader;
  material.customProgramCacheKey = () => "biome-prop-v2-wall-integrated-v6";
  material.userData.sharedDungeonMaterial = true;
  material.userData.biomeSpriteWallDecal = true;
  material.userData.authoredColorWeight = 0.28;
  material.userData.brightness = 0.86;
  material.userData.mapBlend = "authored-v2-biome-surface-tone-v6";
  material.userData.biomeMood = mood.id;
  material.userData.biomeSurfacePalette = palette;
  material.userData.biomeSurfacePaletteRole = "wall";
  material.userData.visibilityBoost = 0.06;
  material.userData.shaderProgramMode = "glsl";
  return material;
}

export function createBiomeWallDecalMaterial(
  texture: THREE.Texture,
  mood: DungeonMood,
  alphaTest: number,
  mode?: ShaderProgramMode,
): BiomeDecorMaterial {
  registerBiomeDecorShaderFactories();
  const registry = getShaderProgramModeRegistry();
  const resolved = mode ?? registry.mode;
  registry.require(BIOME_INTEGRATED_DECOR_SHADER_FACTORY_ID, resolved);
  if (resolved === "tsl") {
    const build = requireTslBuilder<
      typeof import("./BiomeDecorMaterial.tsl").createBiomeWallDecalMaterialTsl
    >(BIOME_INTEGRATED_DECOR_SHADER_FACTORY_ID);
    return build(texture, mood, alphaTest);
  }
  return createBiomeWallDecalMaterialGlsl(texture, mood, alphaTest);
}

function createBiomeFloorSpriteMaterialGlsl(
  texture: THREE.Texture,
  mood: DungeonMood,
  placement: BiomeSpritePlacement | BiomeSpriteDecorPlacement,
  alphaTest: number,
): THREE.MeshStandardMaterial {
  const isFloorDecal = placement === "floor-decal";
  const paletteRole: BiomeSurfacePaletteRole =
    placement === "ceiling-hanging" ? "ceiling" : "floor";
  const palette = biomeSurfacePalette(mood.id, paletteRole);
  const material = new THREE.MeshStandardMaterial({
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
  material.onBeforeCompile = integrateBiomeDecorShader;
  material.customProgramCacheKey = () => `biome-prop-v2-${placement}-integrated-v6`;
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
  material.userData.shaderProgramMode = "glsl";
  return material;
}

export function createBiomeFloorSpriteMaterial(
  texture: THREE.Texture,
  mood: DungeonMood,
  placement: BiomeSpritePlacement | BiomeSpriteDecorPlacement,
  alphaTest: number,
  mode?: ShaderProgramMode,
): BiomeDecorMaterial {
  registerBiomeDecorShaderFactories();
  const registry = getShaderProgramModeRegistry();
  const resolved = mode ?? registry.mode;
  registry.require(BIOME_INTEGRATED_DECOR_SHADER_FACTORY_ID, resolved);
  if (resolved === "tsl") {
    const build = requireTslBuilder<
      typeof import("./BiomeDecorMaterial.tsl").createBiomeFloorSpriteMaterialTsl
    >(BIOME_INTEGRATED_DECOR_FLOOR_TSL_BUILDER_ID);
    return build(texture, mood, placement, alphaTest);
  }
  return createBiomeFloorSpriteMaterialGlsl(texture, mood, placement, alphaTest);
}
