/**
 * TSL / WebGPU port of ProceduralFlameVfx (WGP-11).
 * Literal graph port of the GLSL flame card; embers use instanced sprites because
 * WebGPU point primitives are capped at 1px (gl_PointSize > 1 is unsupported).
 */

import * as THREE from "three";
import { registerTslBuilder } from "../systems/TslMaterialModules";
import { NOISE_FLAME_SHADER_FACTORY_ID } from "./ProceduralFlameVfx";
import { MeshBasicNodeMaterial, PointsNodeMaterial } from "three/webgpu";
import {
  Fn,
  abs,
  cos,
  dot,
  float,
  floor,
  fract,
  instancedBufferAttribute,
  length,
  max,
  mix,
  pow,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

import type {
  NoiseFlameAssembly,
  NoiseFlameEmberUniformHandles,
  NoiseFlameOptions,
  NoiseFlamePalette,
  NoiseFlameUniformHandles,
} from "./ProceduralFlameVfxShared";

const flameHash = /*@__PURE__*/ Fn(([pointIn]: [any]) => {
  const point = vec2(pointIn).toVar();
  point.assign(fract(point.mul(vec2(123.34, 345.45))));
  point.addAssign(dot(point, point.add(34.345)));
  return fract(point.x.mul(point.y));
});

const flameNoise = /*@__PURE__*/ Fn(([pointIn]: [any]) => {
  const point = vec2(pointIn);
  const cell = floor(point);
  const local = fract(point).toVar();
  local.assign(local.mul(local).mul(float(3).sub(local.mul(2))));
  const a = flameHash(cell);
  const b = flameHash(cell.add(vec2(1.0, 0.0)));
  const c = flameHash(cell.add(vec2(0.0, 1.0)));
  const d = flameHash(cell.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
});

const flameFbm = /*@__PURE__*/ Fn(([pointIn]: [any]) => {
  const point = vec2(pointIn);
  const value = flameNoise(point).mul(0.58).toVar();
  value.addAssign(flameNoise(point.mul(2.03).add(17.13)).mul(0.29));
  value.addAssign(flameNoise(point.mul(4.11).sub(8.27)).mul(0.13));
  return value;
});

function createNoiseFlameGeometry(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1.16, 1, 1);
  geometry.translate(0, 0.5, 0);
  geometry.name = "Procedural teardrop noise flame card";
  geometry.userData.sourceGeometry = "createNoiseFlameGeometry";
  geometry.userData.referenceTechnique = "teardrop-noise-offset-threshold-palette";
  geometry.userData.edgePadding = { bottom: 0.08, top: 0.08 };
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function emberSeed(index: number, phase: number): number {
  return THREE.MathUtils.euclideanModulo(
    Math.sin((index + 1) * 91.17 + phase * 17.31) * 43758.5453,
    1,
  );
}

function createNoiseFlameEmbersTsl(
  options: NoiseFlameOptions,
  emberColor: THREE.Color,
  baseOpacity: number,
): {
  embers: THREE.Sprite;
  material: PointsNodeMaterial;
  handles: NoiseFlameEmberUniformHandles;
} {
  const count = Math.max(4, Math.min(options.emberCount ?? 7, 10));
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const seed = emberSeed(index, options.phase);
    const lateral = emberSeed(index + count, options.phase + 0.7);
    seeds[index] = seed;
    positions[index * 3] = (lateral * 2 - 1) * 0.22;
    positions[index * 3 + 1] = 0.34 + seed * 0.22;
    positions[index * 3 + 2] = (seed * 2 - 1) * 0.06;
    sizes[index] = 0.052 + lateral * 0.042;
  }

  const positionAttr = new THREE.InstancedBufferAttribute(positions, 3);
  const seedAttr = new THREE.InstancedBufferAttribute(seeds, 1);
  const sizeAttr = new THREE.InstancedBufferAttribute(sizes, 1);

  const uTime = uniform(0);
  const uPhase = uniform(options.phase);
  const uOpacity = uniform(baseOpacity);
  const uColor = uniform(emberColor.clone());
  const uWind = uniform(new THREE.Vector2(0, 0));

  const aBasePosition = instancedBufferAttribute<"vec3">(positionAttr, "vec3");
  const aSeed = instancedBufferAttribute<"float">(seedAttr, "float");
  const aSize = instancedBufferAttribute<"float">(sizeAttr, "float");

  const emberMotion = Fn(() => {
    const cycle = fract(
      uTime
        .mul(float(0.18).add(aSeed.mul(0.07)))
        .add(aSeed.mul(1.73))
        .add(uPhase.mul(0.11)),
    );
    const rise = cycle.mul(float(0.42).add(aSeed.mul(0.2)));
    const drift = sin(
      uTime
        .mul(float(1.05).add(aSeed.mul(0.9)))
        .add(aSeed.mul(19.0))
        .add(uPhase),
    )
      .mul(float(0.035).add(aSeed.mul(0.035)))
      .mul(float(0.35).add(cycle));
    const windScale = float(0.55).add(cycle);
    const emberPosition = vec3(aBasePosition).toVar();
    emberPosition.y.addAssign(rise);
    emberPosition.x.addAssign(
      drift.add(sin(cycle.mul(5.8).add(aSeed.mul(11.0))).mul(0.018)).add(uWind.x.mul(windScale)),
    );
    emberPosition.z.addAssign(
      cos(uTime.mul(0.84).add(aSeed.mul(13.0)).add(uPhase))
        .mul(float(0.018).add(aSeed.mul(0.022)))
        .mul(cycle)
        .add(uWind.y.mul(windScale)),
    );
    const emberLife = smoothstep(0.0, 0.08, cycle).mul(float(1).sub(smoothstep(0.72, 1.0, cycle)));
    return vec4(emberPosition, emberLife);
  });

  const motion = emberMotion();
  const emberLife = motion.w;

  const material = new PointsNodeMaterial();
  material.name = "Procedural flame ember particle material (TSL sprites)";
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  material.toneMapped = true;
  material.fog = true;
  material.sizeAttenuation = true;
  material.positionNode = motion.xyz;
  // World-ish size: GLSL used aSize * 150 / viewZ pixels; sprites honor size via
  // PointsNodeMaterial size attenuation instead of gl_PointSize.
  material.sizeNode = max(float(0.012), aSize.mul(float(0.72).add(emberLife.mul(0.42))));
  material.colorNode = Fn(() => {
    const distanceToCenter = length(uv().sub(vec2(0.5)));
    const spark = float(1).sub(smoothstep(0.18, 0.5, distanceToCenter));
    return uColor.mul(float(1.35).add(spark.mul(1.4)));
  })();
  material.opacityNode = Fn(() => {
    const distanceToCenter = length(uv().sub(vec2(0.5)));
    const spark = float(1).sub(smoothstep(0.18, 0.5, distanceToCenter));
    return spark.mul(emberLife).mul(uOpacity);
  })();
  material.alphaTest = 0.01;

  const handles: NoiseFlameEmberUniformHandles = {
    uTime,
    uPhase,
    uOpacity,
    uColor,
    uWind,
  };
  material.userData.noiseFlameEmber = true;
  material.userData.noiseFlameEmberHandles = handles;
  material.userData.shaderProgramMode = "tsl";
  material.userData.emberPrimitive = "sprite";

  const embers = new THREE.Sprite(material as unknown as THREE.SpriteMaterial);
  embers.name = "Floating flame embers";
  embers.count = count;
  embers.frustumCulled = false;
  embers.renderOrder = 5;
  embers.userData.vfxOnly = true;
  embers.userData.emberPrimitive = "sprite";
  return { embers, material, handles };
}

export interface CreateNoiseFlameTslInput {
  readonly options: NoiseFlameOptions;
  readonly palette: NoiseFlamePalette;
}

/**
 * Build the TSL noise-flame card + instanced ember sprites.
 * Public assembly shape matches the GLSL factory (setters/tick via userData handles).
 */
export function createNoiseFlameTsl(input: CreateNoiseFlameTslInput): NoiseFlameAssembly {
  const { options, palette } = input;
  const baseOpacity = options.opacity ?? 0.9;

  const uTime = uniform(0);
  const uPhase = uniform(options.phase);
  const uOpacity = uniform(baseOpacity);
  const uTurbulence = uniform(options.turbulence ?? 1);
  const uLean = uniform(options.lean ?? 0);
  const uIntensity = uniform(options.intensity ?? 1.28);
  const uOuterColor = uniform(new THREE.Color(palette.outer));
  const uMidColor = uniform(new THREE.Color(palette.mid));
  const uCoreColor = uniform(new THREE.Color(palette.core));
  const uGlowColor = uniform(new THREE.Color(palette.glow));

  const flameSample = Fn(() => {
    const flameUv = uv();
    const y = flameUv.y;
    const x = flameUv.x.sub(0.5).mul(2.0);
    const clock = uTime.mul(0.92).add(uPhase);
    const upper = smoothstep(0.05, 0.94, y);
    const baseFade = smoothstep(0.0, 0.12, y);

    const broadNoise = flameFbm(vec2(y.mul(2.7).sub(clock.mul(0.72)), uPhase.mul(0.37)));
    const curl = broadNoise.sub(0.5).mul(0.5).mul(upper).mul(uTurbulence).toVar();
    curl.addAssign(
      sin(y.mul(7.2).sub(clock.mul(2.1)).add(uPhase))
        .mul(0.075)
        .mul(upper),
    );
    curl.addAssign(uLean.mul(y).mul(y));
    const warpedX = x.sub(curl);

    const tipFade = float(1).sub(smoothstep(0.78, 0.985, y));
    const fineNoise = flameFbm(
      vec2(warpedX.mul(2.4).add(clock.mul(0.13)), y.mul(5.4).sub(clock.mul(1.18))),
    );
    const edgeNoise = fineNoise
      .sub(0.5)
      .mul(mix(float(0.055), float(0.24), upper))
      .mul(uTurbulence)
      .toVar();
    edgeNoise.mulAssign(mix(float(1.0), float(0.2), float(1).sub(tipFade)));

    const baseWidth = mix(float(0.56), float(1.0), smoothstep(0.0, 0.2, y));
    const shapeX = warpedX.div(baseWidth);
    const bulb = float(0.72).sub(length(vec2(shapeX.mul(0.94), y.sub(0.2).mul(2.02))));
    const taperWidth = mix(float(0.78).mul(baseWidth), float(0.012), pow(y, 1.18));
    const tongue = taperWidth.sub(abs(warpedX));
    const flameShape = max(bulb, tongue)
      .add(edgeNoise)
      .sub(float(1).sub(tipFade).mul(0.12))
      .toVar();

    const lobeX = float(0.3).mul(sin(clock.mul(1.17).add(uPhase.mul(1.9))));
    const lobeY = float(0.84).add(float(0.035).mul(sin(clock.mul(1.63).add(uPhase))));
    const lobe = float(0.095)
      .sub(length(vec2(x.sub(lobeX).mul(0.8), y.sub(lobeY).mul(2.5))))
      .toVar();
    lobe.addAssign(
      flameFbm(vec2(x.mul(5.2).sub(clock), y.mul(7.1).sub(clock.mul(1.4))))
        .sub(0.5)
        .mul(0.055),
    );
    flameShape.assign(max(flameShape, lobe));

    const cardMask = baseFade.mul(float(1).sub(smoothstep(0.965, 1.0, y)));
    const softHalo = smoothstep(-0.2, 0.015, flameShape).mul(cardMask);
    const outerMask = smoothstep(-0.045, 0.035, flameShape).mul(cardMask);
    const midMask = smoothstep(0.075, 0.19, flameShape).mul(
      float(1).sub(smoothstep(0.82, 1.02, y)),
    );
    const coreMask = smoothstep(0.21, 0.39, flameShape).mul(float(1).sub(smoothstep(0.62, 0.9, y)));

    const color = mix(uGlowColor, uOuterColor, outerMask).toVar();
    color.assign(mix(color, uMidColor, midMask));
    color.assign(mix(color, uCoreColor, coreMask));
    color.addAssign(uGlowColor.mul(max(softHalo.sub(outerMask), float(0))).mul(1.1));
    color.addAssign(uCoreColor.mul(coreMask).mul(0.38));
    color.mulAssign(uIntensity);

    const alpha = max(outerMask, softHalo.mul(0.42)).mul(uOpacity).mul(tipFade);
    return vec4(color, alpha);
  });

  const sample = flameSample();

  const material = new MeshBasicNodeMaterial();
  material.name = "Procedural layered noise flame material (TSL)";
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.blending = THREE.NormalBlending;
  material.toneMapped = true;
  material.fog = true;
  material.colorNode = sample.rgb;
  material.opacityNode = sample.a;
  // Mirrors GLSL `if (alpha < 0.008) discard`.
  material.alphaTest = 0.008;

  const handles: NoiseFlameUniformHandles = {
    uTime,
    uPhase,
    uOpacity,
    uTurbulence,
    uLean,
    uIntensity,
    uOuterColor,
    uMidColor,
    uCoreColor,
    uGlowColor,
  };
  material.userData.noiseFlame = true;
  material.userData.noiseFlameHandles = handles;
  material.userData.baseOpacity = baseOpacity;
  material.userData.shaderProgramMode = "tsl";
  material.userData.sourceTechnique =
    "teardrop + animated noise offset/map + soft tip cap + palette/glow + floating embers (TSL sprites)";

  const {
    embers,
    material: emberMaterial,
    handles: emberHandles,
  } = createNoiseFlameEmbersTsl(options, new THREE.Color(palette.mid), baseOpacity);
  material.userData.emberMaterial = emberMaterial;
  material.userData.emberHandles = emberHandles;

  const geometry = createNoiseFlameGeometry();
  const flame = new THREE.Mesh(geometry, material as unknown as THREE.Material);
  flame.name = options.name;
  flame.scale.set(options.width, options.height / 1.16, 1);
  flame.renderOrder = 4;
  flame.userData.vfxOnly = true;
  flame.userData.noiseFlame = true;
  flame.add(embers);

  return {
    flame: flame as NoiseFlameAssembly["flame"],
    details: [embers],
    material: material as NoiseFlameAssembly["material"],
  };
}

registerTslBuilder(NOISE_FLAME_SHADER_FACTORY_ID, createNoiseFlameTsl);
