/**
 * TSL / WebGPU port of soft ground fog (WGP-13).
 * Literal graph port of the GLSL volume raymarch — no TSL luminance() (Rec.709).
 */

import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  Loop,
  abs,
  cameraPosition,
  clamp,
  dot,
  exp,
  float,
  floor,
  fract,
  length,
  max,
  min,
  mix,
  modelWorldMatrix,
  normalize,
  positionLocal,
  select,
  sign,
  sin,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
  viewportCoordinate,
} from "three/tsl";

import type { SoftGroundFogMaterialInput, SoftGroundFogUniformHandles } from "./AtmosphereMaterialsShared";
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

const integrateExp = /*@__PURE__*/ Fn(([AIn, CIn, tEnterIn, TIn]: [any, any, any, any]) => {
  const A = float(AIn);
  const C = float(CIn);
  const tEnter = float(tEnterIn);
  const T = float(TIn);
  const A1 = A.mul(exp(C.negate().mul(tEnter)));
  return select(
    abs(C).lessThan(1e-4),
    A1.mul(T),
    A1.mul(float(1).sub(exp(C.negate().mul(T)))).div(C),
  );
});

const heightDensity = /*@__PURE__*/ Fn(([yIn, uBetaGround, uBetaAir]: [any, any, any]) => {
  const yg = max(float(yIn), 0.0);
  return float(0.52)
    .mul(exp(uBetaGround.negate().mul(yg)))
    .add(float(0.48).mul(exp(uBetaAir.negate().mul(yg))));
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

const rayBoxHit = /*@__PURE__*/ Fn(
  ([roIn, rdIn, bminIn, bmaxIn]: [any, any, any, any]) => {
    const ro = vec3(roIn);
    const rd = vec3(rdIn);
    const bmin = vec3(bminIn);
    const bmax = vec3(bmaxIn);
    const inv = vec3(
      select(abs(rd.x).greaterThan(1e-5), float(1).div(rd.x), float(1e6).mul(sign(rd.x.add(1e-6)))),
      select(abs(rd.y).greaterThan(1e-5), float(1).div(rd.y), float(1e6).mul(sign(rd.y.add(1e-6)))),
      select(abs(rd.z).greaterThan(1e-5), float(1).div(rd.z), float(1e6).mul(sign(rd.z.add(1e-6)))),
    );
    const tbot = bmin.sub(ro).mul(inv);
    const ttop = bmax.sub(ro).mul(inv);
    const tminv = min(tbot, ttop);
    const tmaxv = max(tbot, ttop);
    const t0 = max(max(tminv.x, tminv.y), tminv.z);
    const t1 = min(min(tmaxv.x, tmaxv.y), tmaxv.z);
    const hit = t1.greaterThan(max(t0, 0.0));
    return vec4(t0, t1, float(0), select(hit, float(1), float(0)));
  },
);

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
  material.depthTest = false;
  material.side = THREE.BackSide;
  material.fog = false;
  material.toneMapped = false;
  material.blending = THREE.NormalBlending;

  const sample = Fn((): any => {
    const vWorldPos = modelWorldMatrix.mul(vec4(positionLocal, 1.0)).xyz;
    const ro = cameraPosition;
    const rd = normalize(vWorldPos.sub(ro));

    const bmin = vec3(
      uBoxCenter.x.sub(uHalfExtent),
      float(0),
      uBoxCenter.y.sub(uHalfExtent),
    );
    const bmax = vec3(
      uBoxCenter.x.add(uHalfExtent),
      uHeight,
      uBoxCenter.y.add(uHalfExtent),
    );

    const boxHit = rayBoxHit(ro, rd, bmin, bmax);
    const t0 = boxHit.x;
    const t1 = boxHit.y;
    boxHit.w.lessThan(0.5).discard();

    const tEnter = max(t0, 0.0);
    const tExit = min(min(t1, uMaxDist), tEnter.add(uMaxDist));
    tExit.lessThanEqual(tEnter.add(0.02)).discard();

    const gamma = uDistFalloff;
    const y0 = max(ro.y, 0.0);
    const T = tExit.sub(tEnter);

    const drift = vec2(uTime.mul(0.01), uTime.mul(-0.0075));
    const n = fbm(ro.xz.mul(0.038).add(rd.xz.mul(1.25)).add(drift));
    const n2 = fbm(ro.xz.mul(0.09).sub(rd.xz.mul(0.6)).add(drift.yx.mul(1.3)).add(4.0));
    const wisp = float(0.78).add(float(0.28).mul(n)).add(float(0.12).mul(n2));
    const rho0 = uDensity.mul(wisp);

    const optical = integrateExp(
      rho0.mul(0.52).mul(exp(uBetaGround.negate().mul(y0))),
      uBetaGround.mul(rd.y).add(gamma),
      tEnter,
      T,
    )
      .add(
        integrateExp(
          rho0.mul(0.48).mul(exp(uBetaAir.negate().mul(y0))),
          uBetaAir.mul(rd.y).add(gamma),
          tEnter,
          T,
        ),
      )
      .toVar();

    const maskAcc = float(0).toVar();
    const winAcc = float(0).toVar();
    const detailAcc = float(0).toVar();
    Loop(8, ({ i }) => {
      const ft = float(i).add(0.5).div(8);
      const u = ft.mul(ft).mul(float(3).sub(ft.mul(2)));
      const tt = tEnter.add(T.mul(u));
      const p = ro.add(rd.mul(tt));
      maskAcc.addAssign(floorMaskAt(p.xz, uWorldMin, uWorldSize, uFloorMask));
      winAcc.addAssign(localWindow(p.xz, uBoxCenter, uHalfExtent));
      const hd = heightDensity(p.y, uBetaGround, uBetaAir);
      const dn = fbm(p.xz.mul(0.07).add(vec2(p.y.mul(0.2), uTime.mul(0.02))));
      detailAcc.addAssign(
        float(0.88)
          .add(float(0.22).mul(dn))
          .mul(mix(float(1.0), float(0.55), clamp(p.y.div(max(uHeight, 0.001)), 0.0, 1.0)))
          .mul(hd),
      );
    });

    const mask = maskAcc.div(8);
    const window = winAcc.div(8);
    const detail = detailAcc.div(8);
    mask.mul(window).lessThan(0.018).discard();

    const nearSoft = smoothstep(0.2, 1.4, tEnter.add(T.mul(0.35)));
    optical.mulAssign(mask.mul(window).mul(nearSoft));
    optical.mulAssign(mix(float(0.9), float(1.18), clamp(detail, 0.0, 1.5)));

    const up = clamp(rd.y, 0.0, 1.0);
    optical.mulAssign(float(1).sub(up.mul(0.22)));

    const alpha = uMaxAlpha
      .mul(
        float(1).sub(
          exp(float(1).sub(exp(max(optical, 0.0).negate())).mul(-1.35)),
        ),
      )
      .toVar();

    const bayer = fract(
      sin(dot(viewportCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453),
    );
    alpha.addAssign(bayer.sub(0.5).mul(0.004));
    alpha.lessThan(0.005).discard();

    const col = mix(
      (uColor as any).mul(1.06),
      (uColor as any).mul(0.88),
      clamp(alpha.div(max(uMaxAlpha, 0.001)), 0.0, 1.0),
    );
    return vec4(col as any, alpha as any);
  })();

  material.colorNode = sample.rgb;
  material.opacityNode = sample.a;
  material.alphaTest = 0.005;

  material.userData.softGroundFog = true;
  material.userData.softGroundFogHandles = handles;
  material.userData.shaderProgramMode = "tsl";

  return material;
}
