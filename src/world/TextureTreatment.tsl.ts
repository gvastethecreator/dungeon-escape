/**
 * TSL / WebGPU half of the dungeon surface treatment (WGP-09).
 * Loaded lazily by TslMaterialModules so the WebGL boot never pulls
 * `three/webgpu` into its critical path.
 */
import {
  Fn,
  Loop,
  abs,
  attribute,
  dot,
  float,
  floor,
  fract,
  materialColor,
  mix,
  normalize,
  normalWorld,
  positionWorld,
  replaceDefaultUV,
  select,
  sin,
  smoothstep,
  uv,
  vec2,
} from "three/tsl";
import type { MeshStandardNodeMaterial } from "three/webgpu";

import { registerTslBuilder } from "../systems/TslMaterialModules";
import {
  DUNGEON_SURFACE_SHADER_FACTORY_ID,
  DUNGEON_SURFACE_WORLD_UV_SCALE,
} from "./TextureTreatment";

const DUNGEON_SURFACE_TSL_CACHE_KEY = "dungeon-surface-tsl-v2";

/**
 * Literal port of the GLSL bfHash21 / bfValueNoise / bfFbm helpers.
 * Intentionally not mx_fractal_noise — keep the authored hash/value FBM.
 * Fn arg types are intentionally loose: @types/three TSL ProxiedTuple inference
 * rejects valid node graphs that three accepts at runtime.
 */
const bfHash21 = /*@__PURE__*/ Fn(([p]: [any]) => {
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
});

const bfValueNoise = /*@__PURE__*/ Fn(([p]: [any]) => {
  const i = floor(p);
  const f = fract(p);
  const u = vec2(f.mul(f).mul(float(3).sub(f.mul(2))));
  const a = bfHash21(i);
  const b = bfHash21(i.add(vec2(1, 0)));
  const c = bfHash21(i.add(vec2(0, 1)));
  const d = bfHash21(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

const bfFbm = /*@__PURE__*/ Fn(([pInput]: [any]) => {
  const p = vec2(pInput).toVar();
  const v = float(0).toVar();
  const amp = float(0.5).toVar();
  Loop(3, () => {
    v.addAssign(amp.mul(bfValueNoise(p)));
    p.assign(p.mul(2.13).add(vec2(17.3, 9.1)));
    amp.mulAssign(0.5);
  });
  return v;
});

const dungeonSurfaceMacroVariation = /*@__PURE__*/ Fn(() => {
  const bfAn = abs(normalize(normalWorld));
  // Project along the dominant axis so walls/floors/ceilings all vary in-plane.
  const bfQ = select(
    bfAn.y.greaterThan(0.6),
    vec2(positionWorld.x, positionWorld.z),
    select(
      bfAn.x.greaterThan(bfAn.z),
      vec2(positionWorld.z, positionWorld.y),
      vec2(positionWorld.x, positionWorld.y),
    ),
  );
  const bfMacro = bfFbm(bfQ.mul(0.33));
  const bfVar = mix(float(0.8), float(1.15), bfMacro).toVar();
  // Damp grime band where vertical masonry meets the floor.
  const bfGrime = smoothstep(1.1, 0.04, positionWorld.y).mul(float(1).sub(bfAn.y));
  bfVar.mulAssign(float(1).sub(bfGrime.mul(0.3)));
  return bfVar;
});

/**
 * TSL / WebGPU path: same tile UV offset, literal FBM macro variation, and floor
 * grime band via MeshStandardNodeMaterial nodes.
 *
 * Requires geometry attribute `aTileUvOffset` (InstancedBufferAttribute, vec2).
 */
export function enableDungeonSurfaceShaderTsl(material: MeshStandardNodeMaterial): void {
  if (material.userData.dungeonSurfaceShader) return;
  material.userData.dungeonSurfaceShader = true;
  material.userData.dungeonSurfaceShaderMode = "tsl";

  const tileUvOffset = attribute("aTileUvOffset", "vec2" as const);
  const uvScale = float(DUNGEON_SURFACE_WORLD_UV_SCALE);

  // Match GLSL: (mapUv + aTileUvOffset) * world scale on map/normal/rough/metal/ao.
  // Missing `aTileUvOffset` generates a vec2(0) constant in r185 AttributeNode.
  // Room surface maps keep identity repeat/offset, so pre-transform UV replacement matches.
  material.contextNode = replaceDefaultUV(() => uv().add(tileUvOffset).mul(uvScale));
  // colorNode replaces NodeMaterial's default diffuse path. `materialColor`
  // already samples `material.map` × `material.color` (MaterialNode.COLOR).
  material.colorNode = materialColor.mul(dungeonSurfaceMacroVariation());
  material.customProgramCacheKey = () => DUNGEON_SURFACE_TSL_CACHE_KEY;
  material.needsUpdate = true;
}

registerTslBuilder(DUNGEON_SURFACE_SHADER_FACTORY_ID, enableDungeonSurfaceShaderTsl);
