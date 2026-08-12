/**
 * TSL / WebGPU port of VolumetricBeam (WGP-12).
 * Three separate graphs (signal / ambient / objective) — no preprocessor defines.
 */

import * as THREE from "three";
import { registerTslBuilder } from "../systems/TslMaterialModules";
import { VOLUMETRIC_BEAM_SHADER_FACTORY_ID } from "./VolumetricBeam";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  abs,
  attribute,
  cameraPosition,
  clamp,
  dot,
  exp,
  float,
  floor,
  fract,
  length,
  max,
  mix,
  mod,
  modelWorldMatrix,
  normalize,
  normalLocal,
  positionLocal,
  pow,
  select,
  smoothstep,
  step,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

import type {
  VolumetricBeamOptions,
  VolumetricBeamProfile,
  VolumetricBeamUniformHandles,
} from "./VolumetricBeamShared";

// --- Shared helpers (literal ports; no luminance() — GLSL paths use explicit ops) ---

const hash31 = /*@__PURE__*/ Fn(([pIn]: [any]) => {
  const p = vec3(pIn).toVar();
  p.assign(fract(p.mul(0.1031)));
  p.addAssign(dot(p, p.yzx.add(33.33)));
  return fract(p.x.add(p.y).mul(p.z));
});

const valueNoise3 = /*@__PURE__*/ Fn(([pIn]: [any]) => {
  const p = vec3(pIn);
  const cell = floor(p);
  const local = fract(p).toVar();
  local.assign(local.mul(local).mul(float(3).sub(local.mul(2))));

  const n000 = hash31(cell.add(vec3(0.0, 0.0, 0.0)));
  const n100 = hash31(cell.add(vec3(1.0, 0.0, 0.0)));
  const n010 = hash31(cell.add(vec3(0.0, 1.0, 0.0)));
  const n110 = hash31(cell.add(vec3(1.0, 1.0, 0.0)));
  const n001 = hash31(cell.add(vec3(0.0, 0.0, 1.0)));
  const n101 = hash31(cell.add(vec3(1.0, 0.0, 1.0)));
  const n011 = hash31(cell.add(vec3(0.0, 1.0, 1.0)));
  const n111 = hash31(cell.add(vec3(1.0, 1.0, 1.0)));

  const x0 = mix(n000, n100, local.x);
  const x1 = mix(n010, n110, local.x);
  const x2 = mix(n001, n101, local.x);
  const x3 = mix(n011, n111, local.x);
  return mix(mix(x0, x1, local.y), mix(x2, x3, local.y), local.z);
});

const bayer2 = /*@__PURE__*/ Fn(([cellIn]: [any]) => {
  const p = mod(floor(vec2(cellIn)), 2.0);
  const top = mix(float(0.0), float(2.0), p.x);
  const bottom = mix(float(3.0), float(1.0), p.x);
  return mix(top, bottom, p.y);
});

const bayer4 = /*@__PURE__*/ Fn(([cellIn]: [any]) => {
  const cell = vec2(cellIn);
  const lowBits = bayer2(mod(cell, 2.0));
  const highBits = bayer2(floor(cell.mul(0.5)));
  return float(4).mul(lowBits).add(highBits).add(0.5).div(16.0);
});

const hash21 = /*@__PURE__*/ Fn(([pIn]: [any]) => {
  const p = vec2(pIn).toVar();
  p.assign(fract(p.mul(vec2(123.34, 456.21))));
  p.addAssign(dot(p, p.add(45.32)));
  return fract(p.x.mul(p.y));
});

const retroDensityBand = /*@__PURE__*/ Fn(([bandIn]: [any]) => {
  const band = float(bandIn);
  return select(
    band.lessThan(0.5),
    float(0.82),
    select(band.lessThan(1.5), float(1.0), select(band.lessThan(2.5), float(0.76), float(0.48))),
  );
});

const quantize5Bit = /*@__PURE__*/ Fn(([colorIn]: [any]) => {
  return floor(clamp(vec3(colorIn), 0.0, 1.0).mul(31.0).add(0.5)).div(31.0);
});

function makeHandles(
  color: number,
  strength: number,
  height: number,
  sourceRadius: number,
  bottomRadius: number,
) {
  const uColor = uniform(new THREE.Color(color));
  const uStrength = uniform(strength);
  const uTime = uniform(0);
  const uHeight = uniform(height);
  const uTopRadius = uniform(sourceRadius);
  const uBottomRadius = uniform(bottomRadius);
  const handles: VolumetricBeamUniformHandles = {
    uColor,
    uStrength,
    uTime,
    uHeight,
    uTopRadius,
    uBottomRadius,
  };
  return {
    handles,
    uColor,
    uStrength,
    uTime,
    uHeight,
    uTopRadius,
    uBottomRadius,
  };
}

/** Prototype float uniform — use `typeof floatUniform` so overload ReturnType stays precise. */
const floatUniform = uniform(0);

function beamVisibilityNodes(uHeight: typeof floatUniform) {
  const vLocalPos = positionLocal;
  const vWorldPos = modelWorldMatrix.mul(vec4(positionLocal, 1.0)).xyz;
  const vWorldNormal = normalize(modelWorldMatrix.mul(vec4(normalLocal, 0.0)).xyz);
  const vBeamAxis = modelWorldMatrix.mul(vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  const vBeamUv = uv();

  const height01 = clamp(vLocalPos.y.negate().div(max(uHeight, float(0.001))), 0.0, 1.0);
  const toCamera = normalize(cameraPosition.sub(vWorldPos));
  const facing = abs(dot(normalize(vWorldNormal), toCamera));
  const cameraRange = length(cameraPosition.xz.sub(vBeamAxis.xz));
  const proximityFade = smoothstep(1.85, 3.4, cameraRange);
  const edgeOnFade = smoothstep(0.12, 0.38, facing);
  const beamVisibility = proximityFade.mul(edgeOnFade);

  return {
    vLocalPos,
    vWorldPos,
    vWorldNormal,
    vBeamAxis,
    vBeamUv,
    height01,
    facing,
    beamVisibility,
  };
}

function finalizeBeamMaterial(
  material: MeshBasicNodeMaterial,
  options: VolumetricBeamOptions,
  profile: VolumetricBeamProfile,
  handles: VolumetricBeamUniformHandles,
  name: string,
): MeshBasicNodeMaterial {
  const ambient = profile === "ambient";
  const objective = profile === "objective";
  material.name = name;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.side = THREE.DoubleSide;
  material.blending = options.blending ?? THREE.AdditiveBlending;
  material.toneMapped = options.toneMapped ?? false;
  material.fog = options.fog ?? false;
  material.forceSinglePass = true;
  material.userData.volumetricSpace = "world";
  material.userData.screenSpace = false;
  material.userData.volumetricBeamHandles = handles;
  material.userData.shaderProgramMode = "tsl";
  material.userData.beamProfile = ambient
    ? "retro-crossed-strata"
    : objective
      ? "objective-strata"
      : "signal-smooth";
  return material;
}

/** Signal / portal-stone smooth dusty beam (GLSL `#else` branch). */
export function createSignalBeamMaterialTsl(
  color: number,
  strength: number,
  height: number,
  sourceRadius: number,
  bottomRadius: number,
  options: VolumetricBeamOptions,
): MeshBasicNodeMaterial {
  const { handles, uColor, uStrength, uTime, uHeight } = makeHandles(
    color,
    strength,
    height,
    sourceRadius,
    bottomRadius,
  );

  const material = new MeshBasicNodeMaterial();
  const sample = Fn(() => {
    const { vWorldPos, height01, facing, beamVisibility } = beamVisibilityNodes(uHeight);
    beamVisibility.lessThan(0.01).discard();

    const volumeFacing = smoothstep(0.12, 0.78, facing);
    const sourceFade = float(1).sub(smoothstep(0.0, 0.16, height01).mul(0.18));
    const floorFade = float(1).sub(smoothstep(0.78, 1.0, height01).mul(0.34));

    const broadNoise = valueNoise3(
      vWorldPos.mul(vec3(0.48, 0.36, 0.48)).add(vec3(0.0, uTime.mul(0.035), 0.0)),
    );
    const detailNoise = valueNoise3(
      vWorldPos.mul(vec3(1.45, 1.05, 1.45)).add(vec3(uTime.mul(0.018), 0.0, uTime.mul(-0.014))),
    );
    const density = mix(float(0.72), float(1.08), smoothstep(0.18, 0.84, broadNoise))
      .mul(mix(float(0.9), float(1.08), detailNoise))
      .toVar();

    const opticalDepth = uStrength
      .mul(3.2)
      .mul(volumeFacing)
      .mul(sourceFade)
      .mul(floorFade)
      .mul(density);
    const alpha = float(1)
      .sub(exp(max(opticalDepth, 0.0).negate()))
      .mul(beamVisibility);
    alpha.lessThan(0.002).discard();

    const col = uColor.mul(mix(float(0.84), float(1.08), broadNoise));
    return vec4(col, alpha);
  })();

  material.colorNode = sample.rgb;
  material.opacityNode = sample.a;
  material.alphaTest = 0.002;
  return finalizeBeamMaterial(
    material,
    options,
    "signal",
    handles,
    "World volumetric beam material (TSL)",
  );
}

/** Ambient open crossed strata (GLSL `AMBIENT_STRATA_PROFILE`). */
export function createAmbientBeamMaterialTsl(
  color: number,
  strength: number,
  height: number,
  sourceRadius: number,
  bottomRadius: number,
  options: VolumetricBeamOptions,
): MeshBasicNodeMaterial {
  const { handles, uColor, uStrength, uTime, uHeight } = makeHandles(
    color,
    strength,
    height,
    sourceRadius,
    bottomRadius,
  );
  const aBeamLayer = attribute<"float">("aBeamLayer", "float");
  const aStratumPhase = attribute<"float">("aStratumPhase", "float");

  const coarseFlow = Fn(([cellIn, phaseIn]: [any, any]) => {
    const cell = vec2(cellIn);
    const phase = float(phaseIn);
    const tick = floor(uTime.mul(1.35));
    const stepped = floor(cell.add(vec2(phase.mul(11.0).add(tick.mul(0.25)), tick.mul(-0.5))));
    return hash21(stepped);
  });

  const material = new MeshBasicNodeMaterial();
  const sample = Fn(() => {
    const { vBeamUv, height01, facing, beamVisibility } = beamVisibilityNodes(uHeight);
    beamVisibility.lessThan(0.01).discard();

    const lateral = clamp(float(1).sub(abs(vBeamUv.x.mul(2.0).sub(1.0))), 0.0, 1.0);
    const edgeCoverage = pow(lateral, mix(float(0.72), float(1.35), aBeamLayer));
    const ditherCell = vec2(
      vBeamUv.x.mul(12.0).add(aStratumPhase.mul(7.0)),
      vBeamUv.y.mul(14.0).add(floor(uTime.mul(1.35)).mul(0.25)),
    );
    const orderedEdge = step(bayer4(ditherCell), clamp(edgeCoverage.mul(1.12), 0.0, 1.0));
    const edgeMask = mix(orderedEdge, float(1.0), smoothstep(0.52, 0.82, lateral));

    const sourceFade = smoothstep(0.0, 0.08, height01);
    const floorFade = float(1).sub(smoothstep(0.66, 1.0, height01));
    const bandCoord = clamp(height01.mul(4.0), 0.0, 3.999);
    const band = floor(bandCoord);
    const densityBand = retroDensityBand(band);
    const flow = coarseFlow(vec2(vBeamUv.x.mul(3.5), vBeamUv.y.mul(8.0)), aStratumPhase);
    const flowDensity = mix(
      float(0.8),
      float(1.08),
      step(float(0.42).sub(lateral.mul(0.12)), flow),
    );
    const facingBand = floor(clamp(facing.mul(3.0), 0.0, 2.999)).mul(0.5);
    const viewDensity = mix(float(0.32), float(1.0), facingBand);
    const layerDensity = mix(float(0.62), float(1.08), aBeamLayer);

    const alpha = clamp(
      uStrength
        .mul(1.9)
        .mul(viewDensity)
        .mul(layerDensity)
        .mul(densityBand)
        .mul(flowDensity)
        .mul(sourceFade)
        .mul(floorFade)
        .mul(edgeMask)
        .mul(beamVisibility),
      0.0,
      0.24,
    );
    alpha.lessThan(0.002).discard();

    const stratumValue = floor(mod(aStratumPhase.mul(19.0), 3.0)).mul(0.5);
    const col = quantize5Bit(uColor.mul(mix(float(0.72), float(1.08), stratumValue)));
    return vec4(col, alpha);
  })();

  material.colorNode = sample.rgb;
  material.opacityNode = sample.a;
  material.alphaTest = 0.002;
  return finalizeBeamMaterial(
    material,
    options,
    "ambient",
    handles,
    "Retro ambient strata volumetric beam material (TSL)",
  );
}

/** Objective thin open strata (GLSL `OBJECTIVE_STRATA_PROFILE`). */
export function createObjectiveBeamMaterialTsl(
  color: number,
  strength: number,
  height: number,
  sourceRadius: number,
  bottomRadius: number,
  options: VolumetricBeamOptions,
): MeshBasicNodeMaterial {
  const { handles, uColor, uStrength, uTime, uHeight } = makeHandles(
    color,
    strength,
    height,
    sourceRadius,
    bottomRadius,
  );
  const aBeamLayer = attribute<"float">("aBeamLayer", "float");
  const aStratumPhase = attribute<"float">("aStratumPhase", "float");

  const coarseFlow = Fn(([cellIn, phaseIn]: [any, any]) => {
    const cell = vec2(cellIn);
    const phase = float(phaseIn);
    const tick = floor(uTime.mul(1.35));
    const stepped = floor(cell.add(vec2(phase.mul(11.0).add(tick.mul(0.25)), tick.mul(-0.5))));
    return hash21(stepped);
  });

  const material = new MeshBasicNodeMaterial();
  const sample = Fn(() => {
    const { vBeamUv, height01, facing, beamVisibility } = beamVisibilityNodes(uHeight);
    beamVisibility.lessThan(0.01).discard();

    const lateral = clamp(float(1).sub(abs(vBeamUv.x.mul(2.0).sub(1.0))), 0.0, 1.0);
    const edgeCoverage = pow(lateral, mix(float(0.82), float(1.55), aBeamLayer));
    const ditherCell = vec2(
      vBeamUv.x.mul(18.0).add(aStratumPhase.mul(7.0)),
      vBeamUv.y.mul(30.0).sub(floor(uTime.mul(2.0)).mul(0.35)),
    );
    const edgeMask = step(bayer4(ditherCell), clamp(edgeCoverage.mul(1.12), 0.0, 1.0));
    const sourceFade = smoothstep(0.0, 0.06, height01);
    const pickupFade = float(1).sub(smoothstep(0.82, 1.0, height01));
    const flow = coarseFlow(vec2(vBeamUv.x.mul(8.0), vBeamUv.y.mul(21.0)), aStratumPhase);
    const steppedGap = mix(float(0.58), float(1.0), step(0.34, flow.add(lateral.mul(0.22))));
    const viewDensity = mix(float(0.28), float(1.0), smoothstep(0.08, 0.82, facing));
    const layerDensity = mix(float(0.7), float(1.12), aBeamLayer);
    const alpha = clamp(
      uStrength
        .mul(2.35)
        .mul(viewDensity)
        .mul(layerDensity)
        .mul(steppedGap)
        .mul(sourceFade)
        .mul(pickupFade)
        .mul(edgeMask)
        .mul(beamVisibility),
      0.0,
      0.32,
    );
    alpha.lessThan(0.002).discard();
    const col = quantize5Bit(uColor.mul(mix(float(0.78), float(1.12), aBeamLayer)));
    return vec4(col, alpha);
  })();

  material.colorNode = sample.rgb;
  material.opacityNode = sample.a;
  material.alphaTest = 0.002;
  return finalizeBeamMaterial(
    material,
    options,
    "objective",
    handles,
    "Objective strata volumetric beam material (TSL)",
  );
}

export function createVolumetricBeamMaterialTsl(
  color: number,
  strength: number,
  height: number,
  sourceRadius: number,
  bottomRadius: number,
  options: VolumetricBeamOptions,
  profile: VolumetricBeamProfile,
): MeshBasicNodeMaterial {
  if (profile === "ambient") {
    return createAmbientBeamMaterialTsl(
      color,
      strength,
      height,
      sourceRadius,
      bottomRadius,
      options,
    );
  }
  if (profile === "objective") {
    return createObjectiveBeamMaterialTsl(
      color,
      strength,
      height,
      sourceRadius,
      bottomRadius,
      options,
    );
  }
  return createSignalBeamMaterialTsl(color, strength, height, sourceRadius, bottomRadius, options);
}

registerTslBuilder(VOLUMETRIC_BEAM_SHADER_FACTORY_ID, createVolumetricBeamMaterialTsl);
