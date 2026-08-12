/**
 * TSL / WebGPU port of biome atmosphere particles (WGP-14).
 * WebGPU points are 1px — uses instanced sprites (PointsNodeMaterial + Sprite)
 * like ProceduralFlameVfx embers when gl_PointSize would exceed 1.
 */

import * as THREE from "three";
import { PointsNodeMaterial } from "three/webgpu";
import {
  Fn,
  abs,
  atan,
  clamp,
  cos,
  dot,
  float,
  floor,
  fract,
  instancedBufferAttribute,
  length,
  max,
  min,
  mix,
  modelMatrix,
  modelViewMatrix,
  normalize,
  pow,
  select,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

import {
  BIOME_PARTICLE_MOTION_ID,
  BIOME_PARTICLE_SHAPE_ID,
} from "./BiomeParticleProfile";
import type {
  BiomeParticleAssembly,
  BiomeParticleGeometryData,
  BiomeParticleMaterialInput,
  BiomeParticleUniformHandles,
} from "./AtmosphereMaterialsShared";

const hash11 = /*@__PURE__*/ Fn(([pIn]: [any]) => {
  return fract(sin(float(pIn).mul(127.1)).mul(43758.5453));
});

const particleShapeMask = /*@__PURE__*/ Fn(([uvIn, uShape, vPhase]: [any, any, any]) => {
  const pointUv = vec2(uvIn).sub(0.5);
  const cs = cos(vPhase);
  const sn = sin(vPhase);
  const rotated = vec2(
    cs.mul(pointUv.x).sub(sn.mul(pointUv.y)),
    sn.mul(pointUv.x).add(cs.mul(pointUv.y)),
  );
  const d = length(rotated);
  const shape = float(uShape);

  const m0 = smoothstep(0.5, 0.08, d);
  const m1 = smoothstep(0.48, 0.08, length(vec2(rotated.x.mul(3.4), rotated.y)));
  const arms = min(abs(rotated.x), abs(rotated.y));
  const diagonals = min(abs(rotated.x.add(rotated.y)), abs(rotated.x.sub(rotated.y))).mul(0.72);
  const crystal = float(1).sub(smoothstep(0.035, 0.075, min(arms, diagonals)));
  const m2 = crystal.mul(smoothstep(0.37, 0.14, d));
  const roughEdge = float(0.36).add(sin(atan(rotated.y, rotated.x).mul(5.0).add(vPhase)).mul(0.08));
  const m3 = smoothstep(roughEdge.add(0.08), roughEdge.sub(0.08), d);
  const m4 = smoothstep(0.5, 0.05, length(vec2(rotated.x.mul(0.72), rotated.y.mul(2.6)))).mul(
    float(0.7).add(float(0.3).mul(sin(rotated.x.mul(18.0)))),
  );
  const core = smoothstep(0.23, 0.04, d);
  const rim = smoothstep(0.42, 0.35, d).mul(float(1).sub(smoothstep(0.31, 0.37, d)));
  const m5 = max(core, rim.mul(0.52));
  const diamond = abs(rotated.x).mul(0.72).add(abs(rotated.y).mul(1.28));
  const m6 = float(1).sub(smoothstep(0.32, 0.48, diamond));
  const ring = float(1).sub(smoothstep(0.035, 0.09, abs(d.sub(0.32))));
  const glint = smoothstep(0.12, 0.01, length(rotated.sub(vec2(-0.13, 0.13))));
  const m7 = max(ring.mul(0.8), glint);
  const box = max(abs(rotated.x), abs(rotated.y));
  const m8 = float(1).sub(smoothstep(0.32, 0.48, box));
  const dropUv = vec2(rotated.x.mul(1.85), rotated.y.mul(0.78).add(0.1));
  const body = smoothstep(0.42, 0.08, length(dropUv));
  const tip = smoothstep(0.22, 0.02, length(vec2(rotated.x.mul(2.6), rotated.y.add(0.28))));
  const m9 = max(body, tip).mul(smoothstep(0.5, 0.12, abs(rotated.x)));
  const rough = float(0.3).add(sin(atan(rotated.y, rotated.x).mul(4.0).add(vPhase)).mul(0.07));
  const m10 = smoothstep(rough.add(0.07), rough.sub(0.1), d);

  let mask = m0.toVar();
  mask.assign(select(shape.lessThan(0.5), m0, mask));
  mask.assign(select(shape.lessThan(1.5), m1, mask));
  mask.assign(select(shape.lessThan(2.5), m2, mask));
  mask.assign(select(shape.lessThan(3.5), m3, mask));
  mask.assign(select(shape.lessThan(4.5), m4, mask));
  mask.assign(select(shape.lessThan(5.5), m5, mask));
  mask.assign(select(shape.lessThan(6.5), m6, mask));
  mask.assign(select(shape.lessThan(7.5), m7, mask));
  mask.assign(select(shape.lessThan(8.5), m8, mask));
  mask.assign(select(shape.lessThan(9.5), m9, mask));
  mask.assign(select(shape.greaterThanEqual(9.5), m10, mask));
  return mask;
});

function makeUniforms(input: BiomeParticleMaterialInput): BiomeParticleUniformHandles {
  const { map, layer, wallHeight } = input;
  return {
    map: uniform(map),
    uColor: uniform(new THREE.Color(layer.color)),
    uColorAlt: uniform(new THREE.Color(layer.colorAlt)),
    uOpacity: uniform(layer.opacity),
    uTime: uniform(0),
    uPixelRatio: uniform(
      typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 1.5) : 1,
    ),
    uAtten: uniform(350),
    uMotion: uniform(BIOME_PARTICLE_MOTION_ID[layer.motion]),
    uShape: uniform(BIOME_PARTICLE_SHAPE_ID[layer.shape]),
    uFlow: uniform(new THREE.Vector3(layer.flowX, layer.flowY, layer.flowZ)),
    uSpeed: uniform(layer.speed),
    uTurbulence: uniform(layer.turbulence),
    uWallHeight: uniform(wallHeight),
    uViewer: uniform(new THREE.Vector3()),
    uWake: uniform(layer.wake),
  };
}

export function createBiomeParticleAssemblyTsl(
  input: BiomeParticleMaterialInput,
  data?: BiomeParticleGeometryData,
  name = "Biome particles (TSL)",
): BiomeParticleAssembly {
  const { layer } = input;
  const handles = makeUniforms(input);
  const {
    map,
    uColor,
    uColorAlt,
    uOpacity,
    uTime,
    uPixelRatio,
    uAtten,
    uMotion,
    uShape,
    uFlow,
    uSpeed,
    uTurbulence,
    uWallHeight,
    uViewer,
    uWake,
  } = handles;

  const count = data?.count ?? 1;
  const positions = data?.positions ?? new Float32Array([0, 0, 0]);
  const sizes = data?.sizes ?? new Float32Array([0.05]);
  const phases = data?.phases ?? new Float32Array([0]);
  const tints = data?.tints ?? new Float32Array([0]);

  const positionAttr = new THREE.InstancedBufferAttribute(positions, 3);
  const sizeAttr = new THREE.InstancedBufferAttribute(sizes, 1);
  const phaseAttr = new THREE.InstancedBufferAttribute(phases, 1);
  const tintAttr = new THREE.InstancedBufferAttribute(tints, 1);

  const aBasePosition = instancedBufferAttribute<"vec3">(positionAttr, "vec3");
  const aSize = instancedBufferAttribute<"float">(sizeAttr, "float");
  const aPhase = instancedBufferAttribute<"float">(phaseAttr, "float");
  const aTint = instancedBufferAttribute<"float">(tintAttr, "float");

  const particleMotion = Fn(() => {
    const pos = vec3(aBasePosition).toVar();
    const phase = aPhase.mul(6.2831853);
    const t = fract(aPhase.add(uTime.mul(max(uSpeed, 0.01)).mul(0.16)));
    const wave = sin(uTime.mul(float(0.55).add(uSpeed)).add(phase));
    const alphaPulse = float(0.72)
      .add(float(0.28).mul(sin(uTime.mul(float(0.8).add(uSpeed)).add(phase.mul(1.7)))))
      .toVar();
    const sizePulse = float(1.0).toVar();
    const motion = uMotion;

    // Drift (motion 0)
    const driftPos = pos.toVar();
    driftPos.addAssign(uFlow.mul(sin(uTime.mul(0.18).add(phase)).mul(2.4)));
    driftPos.x.addAssign(sin(uTime.mul(0.42).add(phase)).mul(uTurbulence).mul(0.42));
    driftPos.z.addAssign(cos(uTime.mul(0.36).add(phase.mul(1.3))).mul(uTurbulence).mul(0.36));
    driftPos.y.addAssign(wave.mul(uTurbulence).mul(0.24));

    // Rise (motion 1)
    const risePos = pos.toVar();
    risePos.y.assign(
      float(-0.22).add(
        fract(aBasePosition.y.add(0.22).div(uWallHeight.add(0.44)).add(t)).mul(uWallHeight.add(0.44)),
      ),
    );
    risePos.x.addAssign(sin(uTime.mul(0.8).add(phase)).mul(uTurbulence).mul(0.38).add(uFlow.x.mul(t)));
    risePos.z.addAssign(cos(uTime.mul(0.64).add(phase)).mul(uTurbulence).mul(0.3).add(uFlow.z.mul(t)));

    // Fall (motion 2)
    const fallPos = pos.toVar();
    fallPos.y.assign(
      float(-0.22).add(
        float(1)
          .sub(fract(aBasePosition.y.add(0.22).div(uWallHeight.add(0.44)).add(t)))
          .mul(uWallHeight.add(0.44)),
      ),
    );
    fallPos.x.addAssign(sin(uTime.mul(0.5).add(phase)).mul(uTurbulence).mul(0.6).add(uFlow.x.mul(t)));
    fallPos.z.addAssign(
      cos(uTime.mul(0.44).add(phase.mul(1.2))).mul(uTurbulence).mul(0.48).add(uFlow.z.mul(t)),
    );

    // Orbit (motion 3)
    const radius = float(0.18).add(hash11(aPhase.add(3.7)).mul(float(0.38).add(uTurbulence.mul(0.45))));
    const orbitPos = pos.toVar();
    orbitPos.x.addAssign(cos(uTime.mul(uSpeed).add(phase)).mul(radius));
    orbitPos.z.addAssign(sin(uTime.mul(uSpeed.mul(0.83)).add(phase)).mul(radius));
    orbitPos.y.addAssign(sin(uTime.mul(0.7).add(phase.mul(1.4))).mul(0.22));

    // Bubble rise (motion 4)
    const bubblePos = pos.toVar();
    bubblePos.y.assign(
      float(0.12).add(
        float(1)
          .sub(fract(aBasePosition.y.div(uWallHeight).add(t.mul(0.58))))
          .mul(uWallHeight.mul(0.88)),
      ),
    );
    bubblePos.x.addAssign(sin(uTime.mul(1.1).add(phase)).mul(uTurbulence).mul(0.72));
    bubblePos.z.addAssign(cos(uTime.mul(0.76).add(phase.mul(1.5))).mul(uTurbulence).mul(0.52));
    const bubbleSizePulse = float(0.8).add(abs(wave).mul(0.36));

    // Burst (motion 5)
    const burst = fract(t.mul(2.0).add(hash11(aPhase.add(4.0))));
    const direction = normalize(
      uFlow.add(vec3(sin(phase), 0.22, cos(phase)).mul(0.28)),
    );
    const burstPos = pos.add(direction.mul(burst).mul(float(0.8).add(uTurbulence.mul(1.7)))).toVar();
    burstPos.y.addAssign(sin(burst.mul(3.1415926)).mul(0.24));
    const burstAlpha = float(0.7).add(float(0.3).mul(sin(burst.mul(6.2831853).add(phase))));
    const burstSize = float(0.82).add(float(1).sub(burst).mul(0.28));

    // Pulse motes (motion 6)
    const pulsePos = pos.toVar();
    pulsePos.x.addAssign(sin(uTime.mul(0.4).add(phase)).mul(uTurbulence).mul(0.42));
    pulsePos.z.addAssign(cos(uTime.mul(0.37).add(phase)).mul(uTurbulence).mul(0.38));
    pulsePos.y.addAssign(
      sin(uTime.mul(0.5).add(phase.mul(1.2))).mul(0.24).add(uFlow.y.mul(uTime).mul(0.08)),
    );
    const pulseAlpha = float(0.38).add(float(0.62).mul(pow(float(0.5).add(wave.mul(0.5)), 2.0)));
    const pulseSize = float(0.78).add(float(0.42).mul(float(0.5).add(wave.mul(0.5))));

    // Gate flicker (motion 7)
    const gate = step(
      0.48,
      hash11(floor(uTime.mul(float(3).add(uSpeed.mul(5)))).add(aPhase.mul(31.0))),
    );
    const gatePos = pos.toVar();
    gatePos.x.addAssign(floor(sin(uTime.mul(0.34).add(phase)).mul(2.0)).mul(uTurbulence).mul(0.12));
    const gateAlpha = mix(float(0.56), float(1.0), gate);
    const gateSize = mix(float(0.82), float(1.18), gate);

    // Drip (motion 8+)
    const fallT = fract(t.mul(float(1.15).add(uSpeed.mul(0.55))).add(hash11(aPhase.add(8.1))));
    const span = uWallHeight.mul(0.98);
    const dripPos = pos.toVar();
    dripPos.y.assign(uWallHeight.mul(0.97).sub(fallT.mul(span)));
    dripPos.x.addAssign(sin(phase).mul(0.035).add(uFlow.x.mul(fallT).mul(0.2)));
    dripPos.z.addAssign(cos(phase.mul(1.3)).mul(0.035).add(uFlow.z.mul(fallT).mul(0.2)));
    const dripAlpha = float(0.62).add(
      float(0.38).mul(float(1).sub(smoothstep(0.82, 1.0, fallT))),
    );
    const dripSize = float(0.78).add(fallT.mul(0.42));

    pos.assign(select(motion.lessThan(0.5), driftPos, pos));
    pos.assign(select(motion.lessThan(1.5).and(motion.greaterThanEqual(0.5)), risePos, pos));
    pos.assign(select(motion.lessThan(2.5).and(motion.greaterThanEqual(1.5)), fallPos, pos));
    pos.assign(select(motion.lessThan(3.5).and(motion.greaterThanEqual(2.5)), orbitPos, pos));
    pos.assign(select(motion.lessThan(4.5).and(motion.greaterThanEqual(3.5)), bubblePos, pos));
    sizePulse.assign(
      select(motion.lessThan(4.5).and(motion.greaterThanEqual(3.5)), bubbleSizePulse, sizePulse),
    );
    pos.assign(select(motion.lessThan(5.5).and(motion.greaterThanEqual(4.5)), burstPos, pos));
    alphaPulse.assign(
      select(motion.lessThan(5.5).and(motion.greaterThanEqual(4.5)), burstAlpha, alphaPulse),
    );
    sizePulse.assign(
      select(motion.lessThan(5.5).and(motion.greaterThanEqual(4.5)), burstSize, sizePulse),
    );
    pos.assign(select(motion.lessThan(6.5).and(motion.greaterThanEqual(5.5)), pulsePos, pos));
    alphaPulse.assign(
      select(motion.lessThan(6.5).and(motion.greaterThanEqual(5.5)), pulseAlpha, alphaPulse),
    );
    sizePulse.assign(
      select(motion.lessThan(6.5).and(motion.greaterThanEqual(5.5)), pulseSize, sizePulse),
    );
    pos.assign(select(motion.lessThan(7.5).and(motion.greaterThanEqual(6.5)), gatePos, pos));
    alphaPulse.assign(
      select(motion.lessThan(7.5).and(motion.greaterThanEqual(6.5)), gateAlpha, alphaPulse),
    );
    sizePulse.assign(
      select(motion.lessThan(7.5).and(motion.greaterThanEqual(6.5)), gateSize, sizePulse),
    );
    pos.assign(select(motion.greaterThanEqual(7.5), dripPos, pos));
    alphaPulse.assign(select(motion.greaterThanEqual(7.5), dripAlpha, alphaPulse));
    sizePulse.assign(select(motion.greaterThanEqual(7.5), dripSize, sizePulse));

    const particleWorldXZ = modelMatrix.mul(vec4(pos, 1.0)).xz;
    const delta = particleWorldXZ.sub(uViewer.xz);
    const distanceToViewer = length(delta);
    const wake = float(1)
      .sub(smoothstep(1.1, 4.8, distanceToViewer))
      .mul(uWake)
      .mul(0.42);
    const tangent = select(
      distanceToViewer.greaterThan(0.001),
      vec2(delta.y.negate(), delta.x).div(distanceToViewer),
      vec2(0),
    );
    pos.x.addAssign(tangent.x.mul(wake).mul(sin(phase.add(uTime.mul(1.3)))).mul(0.32));
    pos.z.addAssign(tangent.y.mul(wake).mul(sin(phase.add(uTime.mul(1.3)))).mul(0.32));
    pos.y.addAssign(wake.mul(0.1).mul(sin(phase.mul(1.9).add(uTime))));

    const worldPosition = modelMatrix.mul(vec4(pos, 1.0));
    const mvPosition = modelViewMatrix.mul(vec4(pos, 1.0));
    const depth = max(0.35, mvPosition.z.negate());
    const vAlpha = uOpacity
      .mul(max(0.56, alphaPulse))
      .mul(float(0.78).add(aPhase.mul(0.22)));
    const vDepthFade = smoothstep(0.35, 0.9, depth).mul(
      float(1).sub(smoothstep(13.0, 24.0, depth)),
    );

    return vec4(worldPosition.xyz, sizePulse.mul(aSize).mul(uAtten).mul(uPixelRatio).div(depth));
  });

  const motion = particleMotion();
  const animatedSize = motion.w;
  const vPhase = aPhase.mul(6.2831853);

  const material = new PointsNodeMaterial();
  material.name = "Biome particle material (TSL sprites)";
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.blending = layer.glow ? THREE.AdditiveBlending : THREE.NormalBlending;
  material.fog = false;
  material.toneMapped = false;
  material.sizeAttenuation = true;
  material.positionNode = motion.xyz;
  material.sizeNode = clamp(animatedSize.mul(0.00032), 0.006, 0.14);

  material.colorNode = Fn(() => {
    const mask = particleShapeMask(uv(), uShape, vPhase);
    const tex = texture(map, uv());
    const vAlpha = uOpacity
      .mul(max(0.56, float(0.72)))
      .mul(float(0.78).add(aPhase.mul(0.22)));
    const mvPosition = modelViewMatrix.mul(vec4(motion.xyz, 1.0));
    const depth = max(0.35, mvPosition.z.negate());
    const vDepthFade = smoothstep(0.35, 0.9, depth).mul(
      float(1).sub(smoothstep(13.0, 24.0, depth)),
    );
    const a = mask.mul(mix(0.78, 1.0, tex.a)).mul(vAlpha).mul(vDepthFade);
    a.lessThan(0.025).discard();
    return mix(uColor, uColorAlt, aTint);
  })();

  material.opacityNode = Fn(() => {
    const mask = particleShapeMask(uv(), uShape, vPhase);
    const tex = texture(map, uv());
    const vAlpha = uOpacity
      .mul(max(0.56, float(0.72)))
      .mul(float(0.78).add(aPhase.mul(0.22)));
    const mvPosition = modelViewMatrix.mul(vec4(motion.xyz, 1.0));
    const depth = max(0.35, mvPosition.z.negate());
    const vDepthFade = smoothstep(0.35, 0.9, depth).mul(
      float(1).sub(smoothstep(13.0, 24.0, depth)),
    );
    return mask.mul(mix(0.78, 1.0, tex.a)).mul(vAlpha).mul(vDepthFade);
  })();
  material.alphaTest = 0.025;

  material.userData.biomeParticle = true;
  material.userData.biomeParticleHandles = handles;
  material.userData.shaderProgramMode = "tsl";
  material.userData.particlePrimitive = "sprite";
  (material as unknown as THREE.ShaderMaterial).uniforms = handles;

  const sprite = new THREE.Sprite(material as unknown as THREE.SpriteMaterial);
  sprite.name = name;
  sprite.count = count;
  sprite.frustumCulled = true;
  sprite.renderOrder = layer.glow ? 2 : 1;
  sprite.userData.particlePrimitive = "sprite";

  return { object: sprite, material, primitive: "sprite", count };
}
