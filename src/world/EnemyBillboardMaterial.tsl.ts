/**
 * TSL / WebGPU half of the lit enemy billboard (WGP-10).
 * Loaded lazily by TslMaterialModules; the WebGL boot never imports it.
 */
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  attribute,
  clamp,
  dot,
  float,
  materialColor,
  materialEmissive,
  materialOpacity,
  mix,
  reference,
  replaceDefaultUV,
  texture,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import { registerTslBuilder } from "../systems/TslMaterialModules";
import {
  applyEnemyBillboardUserData,
  enemyBillboardParams,
  ENEMY_BILLBOARD_SHADER_FACTORY_ID,
  resolveEnemyBiomeMaterialPalette,
  type EnemyBillboardMaterial,
  type EnemyBiomeTintSource,
} from "./EnemyBillboardMaterial";

const ENEMY_BILLBOARD_TSL_CACHE_KEY = "enemy-billboard-instance-atlas-freeze-tsl-v1";
/** Rec.601 luma weights — keep literal; do not use TSL luminance(). */
const REC601_LUMA = vec3(0.299, 0.587, 0.114);

/**
 * TSL / WebGPU path: same instance atlas UV, visibility, Rec.601 freeze, and
 * emissive damp via MeshStandardNodeMaterial nodes.
 *
 * `colorNode` replaces diffuseColor, so it starts from `materialColor` (map ×
 * biome palette tint) before freeze desaturation.
 *
 * Requires geometry attributes `aEnemyVisibility` (float) and `aEnemyAtlasFrame` (vec4).
 */
export function createEnemyBillboardMaterialTsl(
  map: THREE.Texture,
  mood: EnemyBiomeTintSource,
): EnemyBillboardMaterial {
  const atlasFrame = new THREE.Vector4(0, 0, 1, 1);
  const freezeAmount = { value: 0 };
  const palette = resolveEnemyBiomeMaterialPalette(mood);
  const material = new MeshStandardNodeMaterial(
    enemyBillboardParams(map, palette),
  ) as unknown as EnemyBillboardMaterial;
  applyEnemyBillboardUserData(material, mood, palette, atlasFrame, freezeAmount);
  material.userData.enemyBillboardShaderMode = "tsl";

  const nodeMaterial = material as unknown as MeshStandardNodeMaterial;
  const uEnemyFreeze = reference("value", "float", freezeAmount);
  const atlasFrameAttr = attribute<"vec4">("aEnemyAtlasFrame", "vec4");
  const visibilityAttr = attribute<"float">("aEnemyVisibility", "float");

  nodeMaterial.contextNode = replaceDefaultUV(() =>
    atlasFrameAttr.xy.add(uv().mul(atlasFrameAttr.zw)),
  );

  // materialColor keeps map × biome palette (typed vec3); map alpha is separate.
  // colorNode replaces diffuseColor, so both must be rebuilt here.
  const enemyFreeze = clamp(uEnemyFreeze, float(0), float(1));
  const baseRgb = vec3(materialColor);
  const enemyGray = dot(baseRgb, REC601_LUMA);
  const enemyCold = mix(vec3(enemyGray), vec3(0.58, 0.74, 0.86), float(0.22));
  const frozenRgb = mix(baseRgb, enemyCold, enemyFreeze.mul(0.94));
  nodeMaterial.colorNode = vec4(frozenRgb, texture(map).a);
  nodeMaterial.opacityNode = materialOpacity.mul(clamp(visibilityAttr, float(0), float(1)));
  nodeMaterial.emissiveNode = materialEmissive.mul(float(1).sub(enemyFreeze.mul(0.72)));
  nodeMaterial.customProgramCacheKey = () => ENEMY_BILLBOARD_TSL_CACHE_KEY;
  nodeMaterial.needsUpdate = true;
  return material;
}

registerTslBuilder(ENEMY_BILLBOARD_SHADER_FACTORY_ID, createEnemyBillboardMaterialTsl);
