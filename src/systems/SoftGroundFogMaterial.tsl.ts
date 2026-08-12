/**
 * TSL / WebGPU port of soft ground fog (WGP-13).
 * Literal graph port of the GLSL volume raymarch — no TSL luminance() (Rec.709).
 */

import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  dot,
  float,
  floor,
  fract,
  length,
  mix,
  modelWorldMatrix,
  positionLocal,
  select,
  sin,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec4,
} from "three/tsl";

import type {
  SoftGroundFogMaterialInput,
  SoftGroundFogUniformHandles,
} from "./AtmosphereMaterialsShared";
import { SOFT_GROUND_FOG_SHADER_FACTORY_ID } from "./SoftGroundFogMaterial";
import { registerTslBuilder } from "./TslMaterialModules";
import {
  SOFT_FOG_DIST_FALLOFF,
  SOFT_FOG_HEIGHT_FALLOFF_AIR,
  SOFT_FOG_HEIGHT_FALLOFF_GROUND,
  SOFT_FOG_LOCAL_HALF,
  SOFT_FOG_MAX_ALPHA,
  SOFT_FOG_MAX_DIST,
} from "./SoftGroundFogMaterial";

const hash21 = /*@__PURE__*/ Fn(([pIn]: [any]) => {
  const p = vec2(pIn);
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
});

const valueNoise = /*@__PURE__*/ Fn(([pIn]: [any]) => {
  const p = vec2(pIn);
  const cell = floor(p);
  const local = fract(p).toVar();
  local.assign(local.mul(local).mul(float(3).sub(local.mul(2))));
  const a = hash21(cell);
  const b = hash21(cell.add(vec2(1.0, 0.0)));
  const c = hash21(cell.add(vec2(0.0, 1.0)));
  const d = hash21(cell.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
});

const fbm = /*@__PURE__*/ Fn(([pIn]: [any]) => {
  const p = vec2(pIn).toVar();
  const v = float(0).toVar();
  const a = float(0.5).toVar();
  for (let i = 0; i < 4; i += 1) {
    v.addAssign(a.mul(valueNoise(p)));
    const px = p.x.mul(0.8).sub(p.y.mul(0.6));
    const py = p.x.mul(0.6).add(p.y.mul(0.8));
    p.assign(vec2(px, py).mul(2.03));
    a.mulAssign(0.5);
  }
  return v;
});

const floorMaskAt = /*@__PURE__*/ Fn(
  ([worldXZIn, uWorldMin, uWorldSize, uFloorMask]: [any, any, any, any]) => {
    const worldXZ = vec2(worldXZIn);
    const uv = worldXZ.sub(uWorldMin).div(uWorldSize);
    const inBounds = uv.x
      .greaterThanEqual(0.0)
      .and(uv.y.greaterThanEqual(0.0))
      .and(uv.x.lessThanEqual(1.0))
      .and(uv.y.lessThanEqual(1.0));
    return select(inBounds, texture(uFloorMask, uv).r, float(0));
  },
);

const localWindow = /*@__PURE__*/ Fn(([worldXZIn, uBoxCenter, uHalfExtent]: [any, any, any]) => {
  const d = vec2(worldXZIn).sub(uBoxCenter).div(uHalfExtent);
  const r = length(d);
  return float(1).sub(smoothstep(0.55, 1.0, r));
});

export function createSoftGroundFogMaterialTsl(
  input: SoftGroundFogMaterialInput,
): MeshBasicNodeMaterial {
  const { color, density, mask, worldMin, worldSize, wallHeight } = input;

  const uColor = uniform(color.clone());
  const uDensity = uniform(density);
  const uHeight = uniform(wallHeight);
  const uTime = uniform(0);
  const uBetaGround = uniform(SOFT_FOG_HEIGHT_FALLOFF_GROUND);
  const uBetaAir = uniform(SOFT_FOG_HEIGHT_FALLOFF_AIR);
  const uDistFalloff = uniform(SOFT_FOG_DIST_FALLOFF);
  const uMaxDist = uniform(SOFT_FOG_MAX_DIST);
  const uMaxAlpha = uniform(SOFT_FOG_MAX_ALPHA);
  const uHalfExtent = uniform(SOFT_FOG_LOCAL_HALF);
  const uFloorMask = uniform(mask as any) as any;
  const uWorldMin = uniform(worldMin.clone());
  const uWorldSize = uniform(worldSize.clone());
  const uBoxCenter = uniform(new THREE.Vector2(0, 0));

  const handles = {
    uColor,
    uDensity,
    uHeight,
    uTime,
    uBetaGround,
    uBetaAir,
    uDistFalloff,
    uMaxDist,
    uMaxAlpha,
    uHalfExtent,
    uFloorMask,
    uWorldMin,
    uWorldSize,
    uBoxCenter,
  } as unknown as SoftGroundFogUniformHandles;

  const material = new MeshBasicNodeMaterial();
  material.name = "Soft volumetric ground fog (TSL)";
  material.transparent = true;
  material.depthWrite = false;
  // Three's WebGPU scene pass currently loses transparent blending for this
  // depth-disabled volume and emits an opaque black shell. Depth testing keeps
  // the TSL fog behind foreground geometry until that renderer bug is removed.
  material.depthTest = true;
  material.side = THREE.BackSide;
  material.fog = false;
  material.toneMapped = false;
  material.blending = THREE.NormalBlending;

  // The full eight-sample volume is too expensive on the current WebGPU
  // backend. Keep the same floor mask, local window, palette, animation and
  // authored alpha in a single ground-layer sample.
  const groundSample = Fn((): any => {
    const worldPos = modelWorldMatrix.mul(vec4(positionLocal, 1.0)).xyz;
    const maskValue = floorMaskAt(worldPos.xz, uWorldMin, uWorldSize, uFloorMask);
    const windowValue = localWindow(worldPos.xz, uBoxCenter, uHalfExtent);
    const drift = vec2(uTime.mul(0.012), uTime.mul(-0.009));
    const noise = fbm(worldPos.xz.mul(0.075).add(drift));
    const alpha = uMaxAlpha
      .mul(0.62)
      .mul(maskValue)
      .mul(windowValue)
      .mul(mix(float(0.68), float(1), noise));
    alpha.lessThan(0.005).discard();
    const color = mix((uColor as any).mul(0.92), (uColor as any).mul(1.06), noise);
    return vec4(color as any, alpha as any);
  })();

  material.colorNode = groundSample.rgb;
  material.opacityNode = groundSample.a;
  material.alphaTest = 0.005;

  material.userData.softGroundFog = true;
  material.userData.softGroundFogHandles = handles;
  material.userData.shaderProgramMode = "tsl";
  material.userData.softGroundFogPlane = true;
  (material as any).uniforms = handles;

  return material;
}

registerTslBuilder(SOFT_GROUND_FOG_SHADER_FACTORY_ID, createSoftGroundFogMaterialTsl);
