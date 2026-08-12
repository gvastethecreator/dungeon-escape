/**
 * TSL / WebGPU half of the enemy motion trail (WGP-10).
 * Loaded lazily by TslMaterialModules; the WebGL boot never imports it.
 */
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  attribute,
  clamp,
  float,
  materialOpacity,
  replaceDefaultUV,
  texture,
  uniform,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import { registerTslBuilder } from "../systems/TslMaterialModules";
import type { EnemyBillboardAtlasMaterial } from "./EnemyBillboardMaterial";
import {
  enemyTrailMaterialParams,
  ENEMY_MOTION_TRAIL_SHADER_FACTORY_ID,
} from "./EnemyMotionTrailVfx";

const ENEMY_MOTION_TRAIL_TSL_CACHE_KEY = "enemy-motion-trail-black-atlas-tsl-v1";

/**
 * TSL / WebGPU path: same atlas UV uniform + trail alpha via MeshBasicNodeMaterial.
 * `colorNode` replaces diffuseColor — keep map alpha, force RGB black.
 *
 * Requires geometry attribute `aTrailAlpha` (float).
 */
export function createEnemyTrailMaterialTsl(map: THREE.Texture): EnemyBillboardAtlasMaterial {
  const atlasFrame = new THREE.Vector4(0, 0, 1, 1);
  const material = new MeshBasicNodeMaterial(enemyTrailMaterialParams(map));
  material.name = "Enemy motion trail material";
  material.userData.enemyAtlasFrame = atlasFrame;
  material.userData.enemyMotionTrailShaderMode = "tsl";

  const uEnemyAtlasFrame = uniform(atlasFrame);
  const trailAlpha = attribute<"float">("aTrailAlpha", "float");

  material.contextNode = replaceDefaultUV(() =>
    uEnemyAtlasFrame.xy.add(uv().mul(uEnemyAtlasFrame.zw)),
  );
  // Keep authored silhouette alpha from the atlas; paint the body pure black.
  material.colorNode = vec4(vec3(0), texture(map).a);
  material.opacityNode = materialOpacity.mul(clamp(trailAlpha, float(0), float(1)));
  material.customProgramCacheKey = () => ENEMY_MOTION_TRAIL_TSL_CACHE_KEY;
  material.needsUpdate = true;
  return material;
}

registerTslBuilder(ENEMY_MOTION_TRAIL_SHADER_FACTORY_ID, createEnemyTrailMaterialTsl);
