import * as THREE from "three";
import type { DungeonMood } from "../systems/DungeonMood";
import type { EnemyAnimationDefinition } from "./EnemySpriteAtlas";

export type EnemyBiomeTintSource = Pick<
  DungeonMood,
  "id" | "surfaceTint" | "surfaceStrength" | "keyColor" | "lanternColor"
>;

export interface EnemyBiomeMaterialPalette {
  diffuse: THREE.Color;
  lowLightFill: THREE.Color;
  tintStrength: number;
}

const ENEMY_NEUTRAL_ALBEDO = new THREE.Color(0xf2eee6);
const ENEMY_TINT_CHANNEL_FLOOR = 0.68;

/** Keep hue while removing value differences that could crush a dark sprite atlas. */
function normalizedChroma(hex: number): THREE.Color {
  const color = new THREE.Color(hex);
  const peak = Math.max(color.r, color.g, color.b, 0.0001);
  return color.multiplyScalar(1 / peak);
}

/**
 * Restrained biome palette for enemy atlas cards.
 * Surface color has the largest weight; authored key and practical light colors
 * add the local illumination hue without turning the whole sprite emissive.
 */
export function resolveEnemyBiomeMaterialPalette(
  mood: EnemyBiomeTintSource,
): EnemyBiomeMaterialPalette {
  const surface = normalizedChroma(mood.surfaceTint);
  const keyLight = normalizedChroma(mood.keyColor);
  const practicalLight = normalizedChroma(mood.lanternColor);
  const illumination = keyLight.lerp(practicalLight, 0.62);
  const biomeColor = surface.lerp(illumination, 0.38);
  const tintStrength = THREE.MathUtils.clamp(0.18 + mood.surfaceStrength * 0.16, 0.2, 0.3);
  const diffuse = ENEMY_NEUTRAL_ALBEDO.clone().lerp(biomeColor, tintStrength);
  diffuse.r = Math.max(diffuse.r, ENEMY_TINT_CHANNEL_FLOOR);
  diffuse.g = Math.max(diffuse.g, ENEMY_TINT_CHANNEL_FLOOR);
  diffuse.b = Math.max(diffuse.b, ENEMY_TINT_CHANNEL_FLOOR);

  // A tiny mood-colored floor keeps shadowed pixels coherent. Scene lights
  // still provide nearly all visible illumination and preserve depth.
  const lowLightFill = illumination.lerp(surface, 0.24);
  const fillPeak = Math.max(lowLightFill.r, lowLightFill.g, lowLightFill.b, 0.0001);
  lowLightFill.multiplyScalar(0.026 / fillPeak);

  return { diffuse, lowLightFill, tintStrength };
}

export type EnemyBillboardMaterial = THREE.MeshStandardMaterial & {
  userData: {
    enemyAtlasFrame?: THREE.Vector4;
    enemyFreezeAmount?: { value: number };
    enemyBiomeMood?: string;
    enemyBiomeTintStrength?: number;
    enemyBiomeSurfaceTint?: number;
    enemyBiomeLightTint?: number;
  } & Record<string, unknown>;
};

export function createEnemyBillboardMaterial(
  map: THREE.Texture,
  mood: EnemyBiomeTintSource,
): EnemyBillboardMaterial {
  const atlasFrame = new THREE.Vector4(0, 0, 1, 1);
  const freezeAmount = { value: 0 };
  const palette = resolveEnemyBiomeMaterialPalette(mood);
  const material = new THREE.MeshStandardMaterial({
    map,
    color: palette.diffuse,
    emissive: palette.lowLightFill,
    emissiveIntensity: 0.1,
    roughness: 0.96,
    metalness: 0,
    transparent: true,
    alphaTest: 0.14,
    depthWrite: true,
    fog: true,
    toneMapped: true,
    side: THREE.DoubleSide,
  }) as EnemyBillboardMaterial;
  material.name = "Lit enemy billboard material";
  material.userData.enemyAtlasFrame = atlasFrame;
  material.userData.enemyFreezeAmount = freezeAmount;
  material.userData.enemyBiomeMood = mood.id;
  material.userData.enemyBiomeTintStrength = palette.tintStrength;
  material.userData.enemyBiomeSurfaceTint = mood.surfaceTint;
  material.userData.enemyBiomeLightTint = mood.lanternColor;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEnemyAtlasFrame = { value: atlasFrame };
    shader.uniforms.uEnemyFreeze = freezeAmount;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aEnemyVisibility;\nvarying float vEnemyVisibility;\nuniform vec4 uEnemyAtlasFrame;",
      )
      .replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\nvMapUv = uEnemyAtlasFrame.xy + vMapUv * uEnemyAtlasFrame.zw;",
      )
      .replace(
        "#include <begin_vertex>",
        "vEnemyVisibility = aEnemyVisibility;\n#include <begin_vertex>",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vEnemyVisibility;\nuniform float uEnemyFreeze;",
      )
      .replace(
        "#include <alphatest_fragment>",
        [
          "diffuseColor.a *= clamp(vEnemyVisibility, 0.0, 1.0);",
          "float enemyFreeze = clamp(uEnemyFreeze, 0.0, 1.0);",
          "if (enemyFreeze > 0.001) {",
          "  float enemyGray = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));",
          "  vec3 enemyCold = mix(vec3(enemyGray), vec3(0.58, 0.74, 0.86), 0.22);",
          "  diffuseColor.rgb = mix(diffuseColor.rgb, enemyCold, enemyFreeze * 0.94);",
          "}",
          "#include <alphatest_fragment>",
        ].join("\n"),
      )
      .replace(
        "#include <emissivemap_fragment>",
        [
          "#include <emissivemap_fragment>",
          "totalEmissiveRadiance *= (1.0 - clamp(uEnemyFreeze, 0.0, 1.0) * 0.72);",
        ].join("\n"),
      );
  };
  material.customProgramCacheKey = () => "enemy-billboard-opacity-atlas-freeze-v5";
  return material;
}

/** 0 = live color, 1 = fully desaturated cold freeze look. */
export function setEnemyFreezeAmount(
  material: EnemyBillboardMaterial | THREE.Material,
  amount: number,
): void {
  const freeze = material.userData.enemyFreezeAmount as { value: number } | undefined;
  if (!freeze) return;
  freeze.value = THREE.MathUtils.clamp(amount, 0, 1);
}

/** Material that stores atlas UV rect in `userData.enemyAtlasFrame`. */
export type EnemyBillboardAtlasMaterial = THREE.Material & {
  userData: { enemyAtlasFrame?: THREE.Vector4 } & Record<string, unknown>;
};

export function setEnemyBillboardFrame(
  material: EnemyBillboardAtlasMaterial,
  animation: EnemyAnimationDefinition,
  frameIndex: number,
): void {
  const frame = animation.frames[frameIndex % animation.frames.length]!;
  const target = material.userData.enemyAtlasFrame;
  if (!target) return;
  target.set(
    frame.x / animation.size[0],
    1 - (frame.y + frame.h) / animation.size[1],
    frame.w / animation.size[0],
    frame.h / animation.size[1],
  );
}

/** Soft floor disc under an enemy billboard. Shared by play + forge previews. */
export const ENEMY_CONTACT_SHADOW_Y = 0.028;

export interface EnemyContactShadowLayout {
  /** Floor lift so the disc clears the ground plane without z-fighting. */
  y: number;
  /** World X extent of the radial disc. */
  width: number;
  /** World Z extent of the radial disc. */
  depth: number;
}

/**
 * Size a ground contact shadow from body silhouette and feet elevation.
 * Grounded creatures cast a firm ellipse; hover / ceiling threats shrink as
 * their opaque feet rise above the floor. Visibility fades phased-out ghosts.
 */
export function resolveEnemyContactShadowLayout(input: {
  bodyWidth: number;
  lowProfile: boolean;
  /** World Y of the opaque sprite feet (not billboard center). */
  feetY: number;
  /** 0 hidden … 1 fully present (phase × spawn reveal). */
  visibility: number;
  spectral?: boolean;
}): EnemyContactShadowLayout {
  const visible = THREE.MathUtils.clamp(input.visibility, 0, 1);
  const elevation = Math.max(0, input.feetY);
  // Soft inverse falloff: low skitterers stay crisp; ceiling imps leave a small stain.
  const heightFactor = 1 / (1 + elevation * 1.35);
  const base = input.bodyWidth * (input.lowProfile ? 0.86 : 0.62);
  const spectralSoft = input.spectral ? 0.78 : 1;
  const strength = visible * heightFactor * spectralSoft;
  const width = base * strength;
  const depth = width * (input.lowProfile ? 0.72 : 0.48);
  return {
    y: ENEMY_CONTACT_SHADOW_Y,
    width,
    depth,
  };
}

/** Opaque-feet world Y from billboard center + sprite padding metrics. */
export function enemyOpaqueFeetY(
  positionY: number,
  planeHeight: number,
  bottomPaddingRatio: number,
): number {
  return positionY - planeHeight * 0.5 + bottomPaddingRatio * planeHeight;
}

export function createEnemyContactShadowMaterial(): THREE.MeshBasicMaterial {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = ((y + 0.5) / size) * 2 - 1;
      const distance = Math.sqrt(nx * nx + ny * ny);
      const alpha = Math.max(0, 1 - distance);
      const offset = (y * size + x) * 4;
      data[offset] = 8;
      data[offset + 1] = 7;
      data[offset + 2] = 6;
      // Slightly stronger core so basals read under dim biome light.
      data[offset + 3] = Math.round(alpha * alpha * 210);
    }
  }
  const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  map.name = "Enemy radial contact shadow";
  map.needsUpdate = true;
  map.colorSpace = THREE.NoColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.generateMipmaps = false;
  const material = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  material.name = "Enemy contact shadow material";
  material.userData.sharedDungeonMaterial = true;
  return material;
}

export function disposeEnemyContactShadowMaterial(material: THREE.MeshBasicMaterial): void {
  material.map?.dispose();
  material.dispose();
}
