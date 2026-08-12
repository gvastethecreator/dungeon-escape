import * as THREE from "three";

import {
  getShaderProgramModeRegistry,
  onShaderProgramModeRegistryChange,
  type ShaderProgramMode,
} from "./ShaderProgramMode";
import { createSoftGroundFogMaterialTsl } from "./SoftGroundFogMaterial.tsl";
import type {
  SoftGroundFogMaterial,
  SoftGroundFogMaterialInput,
  SoftGroundFogUniformHandles,
} from "./AtmosphereMaterialsShared";

export type {
  SoftGroundFogMaterial,
  SoftGroundFogMaterialInput,
  SoftGroundFogUniformHandles,
} from "./AtmosphereMaterialsShared";

/** Matches DungeonWorld wall/tile height. */
export const SOFT_FOG_DEFAULT_WALL_HEIGHT = 4.4;
/** Half-size of the local fog box that follows the player (meters, XZ). */
export const SOFT_FOG_LOCAL_HALF = 12;
/** Max ray length inside the volume — avoids hard “map edge” cuts. */
export const SOFT_FOG_MAX_DIST = 15;
export const SOFT_FOG_HEIGHT_FALLOFF_GROUND = 1.05;
export const SOFT_FOG_HEIGHT_FALLOFF_AIR = 0.34;
/** Kept for tests / tuning of “overall” vertical read (air layer). */
export const SOFT_FOG_HEIGHT_FALLOFF = SOFT_FOG_HEIGHT_FALLOFF_AIR;
export const SOFT_FOG_DIST_FALLOFF = 0.07;
export const SOFT_FOG_DENSITY = 0.62;
export const SOFT_FOG_MAX_ALPHA = 0.26;

/** ShaderProgramMode factory id for soft volumetric ground fog. */
export const SOFT_GROUND_FOG_SHADER_FACTORY_ID = "soft-ground-fog";

/** Register (or refresh) dual-mode support on the active shader program registry. */
export function registerSoftGroundFogShaderFactory(
  registry = getShaderProgramModeRegistry(),
): void {
  registry.register({
    id: SOFT_GROUND_FOG_SHADER_FACTORY_ID,
    supports: ["glsl", "tsl"],
  });
}

registerSoftGroundFogShaderFactory();
onShaderProgramModeRegistryChange(registerSoftGroundFogShaderFactory);

const SOFT_FOG_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const SOFT_FOG_FRAGMENT = /* glsl */ `
  precision mediump float;

  uniform vec3 uColor;
  uniform float uDensity;
  uniform float uHeight;
  uniform float uTime;
  uniform float uBetaGround;
  uniform float uBetaAir;
  uniform float uDistFalloff;
  uniform float uMaxDist;
  uniform float uMaxAlpha;
  uniform float uHalfExtent;
  uniform sampler2D uFloorMask;
  uniform vec2 uWorldMin;
  uniform vec2 uWorldSize;
  uniform vec2 uBoxCenter;

  varying vec3 vWorldPos;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * valueNoise(p);
      p = m * p * 2.03;
      a *= 0.5;
    }
    return v;
  }

  float floorMaskAt(vec2 worldXZ) {
    vec2 uv = (worldXZ - uWorldMin) / uWorldSize;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return texture2D(uFloorMask, uv).r;
  }

  bool rayBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float t0, out float t1) {
    vec3 inv = vec3(
      abs(rd.x) > 1e-5 ? 1.0 / rd.x : 1e6 * sign(rd.x + 1e-6),
      abs(rd.y) > 1e-5 ? 1.0 / rd.y : 1e6 * sign(rd.y + 1e-6),
      abs(rd.z) > 1e-5 ? 1.0 / rd.z : 1e6 * sign(rd.z + 1e-6)
    );
    vec3 tbot = (bmin - ro) * inv;
    vec3 ttop = (bmax - ro) * inv;
    vec3 tminv = min(tbot, ttop);
    vec3 tmaxv = max(tbot, ttop);
    t0 = max(max(tminv.x, tminv.y), tminv.z);
    t1 = min(min(tmaxv.x, tmaxv.y), tmaxv.z);
    return t1 > max(t0, 0.0);
  }

  float localWindow(vec2 worldXZ) {
    vec2 d = (worldXZ - uBoxCenter) / uHalfExtent;
    float r = length(d);
    return 1.0 - smoothstep(0.55, 1.0, r);
  }

  float integrateExp(float A, float C, float tEnter, float T) {
    float A1 = A * exp(-C * tEnter);
    if (abs(C) < 1e-4) return A1 * T;
    return A1 * (1.0 - exp(-C * T)) / C;
  }

  float heightDensity(float y) {
    float yg = max(y, 0.0);
    return 0.52 * exp(-uBetaGround * yg) + 0.48 * exp(-uBetaAir * yg);
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorldPos - ro);

    vec3 bmin = vec3(uBoxCenter.x - uHalfExtent, 0.0, uBoxCenter.y - uHalfExtent);
    vec3 bmax = vec3(uBoxCenter.x + uHalfExtent, uHeight, uBoxCenter.y + uHalfExtent);

    float t0;
    float t1;
    if (!rayBox(ro, rd, bmin, bmax, t0, t1)) discard;
    float tEnter = max(t0, 0.0);
    float tExit = min(min(t1, uMaxDist), tEnter + uMaxDist);
    if (tExit <= tEnter + 0.02) discard;

    float gamma = uDistFalloff;
    float y0 = max(ro.y, 0.0);
    float T = tExit - tEnter;

    vec2 drift = vec2(uTime * 0.01, -uTime * 0.0075);
    float n = fbm(ro.xz * 0.038 + rd.xz * 1.25 + drift);
    float n2 = fbm(ro.xz * 0.09 - rd.xz * 0.6 + drift.yx * 1.3 + 4.0);
    float wisp = 0.78 + 0.28 * n + 0.12 * n2;
    float rho0 = uDensity * wisp;

    float optical =
      integrateExp(rho0 * 0.52 * exp(-uBetaGround * y0), uBetaGround * rd.y + gamma, tEnter, T)
      + integrateExp(rho0 * 0.48 * exp(-uBetaAir * y0), uBetaAir * rd.y + gamma, tEnter, T);

    float maskAcc = 0.0;
    float winAcc = 0.0;
    float detailAcc = 0.0;
    const int SAMPLES = 8;
    for (int i = 0; i < SAMPLES; i++) {
      float ft = (float(i) + 0.5) / float(SAMPLES);
      float u = ft * ft * (3.0 - 2.0 * ft);
      float tt = tEnter + T * u;
      vec3 p = ro + rd * tt;
      maskAcc += floorMaskAt(p.xz);
      winAcc += localWindow(p.xz);
      float hd = heightDensity(p.y);
      float dn = fbm(p.xz * 0.07 + vec2(p.y * 0.2, uTime * 0.02));
      detailAcc += (0.88 + 0.22 * dn) * mix(1.0, 0.55, clamp(p.y / max(uHeight, 0.001), 0.0, 1.0)) * hd;
    }
    float mask = maskAcc / float(SAMPLES);
    float window = winAcc / float(SAMPLES);
    float detail = detailAcc / float(SAMPLES);
    if (mask * window < 0.018) discard;

    float nearSoft = smoothstep(0.2, 1.4, tEnter + T * 0.35);

    optical *= mask * window * nearSoft;
    optical *= mix(0.9, 1.18, clamp(detail, 0.0, 1.5));

    float up = clamp(rd.y, 0.0, 1.0);
    optical *= 1.0 - up * 0.22;

    float alpha = 1.0 - exp(-max(optical, 0.0));
    alpha = uMaxAlpha * (1.0 - exp(-1.35 * alpha));

    float bayer = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    alpha += (bayer - 0.5) * 0.004;

    if (alpha < 0.005) discard;

    vec3 col = mix(uColor * 1.06, uColor * 0.88, clamp(alpha / max(uMaxAlpha, 0.001), 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
  }
`;

function createSoftGroundFogMaterialGlsl(input: SoftGroundFogMaterialInput): THREE.ShaderMaterial {
  const {
    color,
    density,
    mask,
    worldMin,
    worldSize,
    wallHeight,
  } = input;
  const material = new THREE.ShaderMaterial({
    vertexShader: SOFT_FOG_VERTEX,
    fragmentShader: SOFT_FOG_FRAGMENT,
    uniforms: {
      uColor: { value: color },
      uDensity: { value: density },
      uHeight: { value: wallHeight },
      uTime: { value: 0 },
      uBetaGround: { value: SOFT_FOG_HEIGHT_FALLOFF_GROUND },
      uBetaAir: { value: SOFT_FOG_HEIGHT_FALLOFF_AIR },
      uDistFalloff: { value: SOFT_FOG_DIST_FALLOFF },
      uMaxDist: { value: SOFT_FOG_MAX_DIST },
      uMaxAlpha: { value: SOFT_FOG_MAX_ALPHA },
      uHalfExtent: { value: SOFT_FOG_LOCAL_HALF },
      uFloorMask: { value: mask },
      uWorldMin: { value: worldMin },
      uWorldSize: { value: worldSize },
      uBoxCenter: { value: new THREE.Vector2(0, 0) },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    fog: false,
    toneMapped: false,
    blending: THREE.NormalBlending,
  });
  material.userData.softGroundFog = true;
  material.userData.shaderProgramMode = "glsl";
  material.userData.softGroundFogHandles = material.uniforms as unknown as SoftGroundFogUniformHandles;
  return material;
}

export function createSoftGroundFogMaterial(
  input: SoftGroundFogMaterialInput,
  mode?: ShaderProgramMode,
): SoftGroundFogMaterial {
  registerSoftGroundFogShaderFactory();
  const registry = getShaderProgramModeRegistry();
  const resolved = mode ?? registry.mode;
  registry.require(SOFT_GROUND_FOG_SHADER_FACTORY_ID, resolved);

  if (resolved === "tsl") {
    return createSoftGroundFogMaterialTsl(input);
  }
  return createSoftGroundFogMaterialGlsl(input);
}

export function softGroundFogHandles(
  material: THREE.Material,
): SoftGroundFogUniformHandles | null {
  if (material.userData.softGroundFog !== true) return null;
  return (material.userData.softGroundFogHandles ??
    (material as THREE.ShaderMaterial).uniforms) as SoftGroundFogUniformHandles | null;
}

export function isSoftGroundFogMaterial(
  material: THREE.Material,
): material is SoftGroundFogMaterial {
  return material.userData.softGroundFog === true;
}
