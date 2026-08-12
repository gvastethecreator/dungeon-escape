// @ts-nocheck
/**
 * TSL / WebGPU port of biome atmosphere particles (WGP-14).
 * Uses instanced sprites — WebGPU point primitives are capped at 1px.
 *
 * @types/three TSL ProxiedTuple inference rejects valid runtime graphs; this
 * file is intentionally unchecked like other expand-phase TSL ports.
 */

import * as THREE from "three";
import { PointsNodeMaterial } from "three/webgpu";
import {
  Fn,
  abs,
  atan,
  cos,
  float,
  floor,
  fract,
  instancedBufferAttribute,
  length,
  max,
  mix,
  normalize,
  select,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

import { BIOME_PARTICLE_MOTION_ID, BIOME_PARTICLE_SHAPE_ID } from "./BiomeParticleProfile";
import type {
  BiomeParticleAssembly,
  BiomeParticleGeometryData,
  BiomeParticleMaterial,
  BiomeParticleMaterialInput,
  BiomeParticleUniformHandles,
} from "./AtmosphereMaterialsShared";
import {
  BIOME_PARTICLE_ASSEMBLY_TSL_BUILDER_ID,
  BIOME_PARTICLE_SHADER_FACTORY_ID,
} from "./BiomeParticleMaterial";
import { registerTslBuilder } from "./TslMaterialModules";

function createMaterialTsl(input: BiomeParticleMaterialInput): PointsNodeMaterial {
  const { map, layer, wallHeight } = input;
  const uMap = uniform(map);
  const uColor = uniform(new THREE.Color(layer.color));
  const uColorAlt = uniform(new THREE.Color(layer.colorAlt));
  const uOpacity = uniform(layer.opacity);
  const uTime = uniform(0);
  const uPixelRatio = uniform(
    typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 1.5) : 1,
  );
  const uAtten = uniform(350);
  const uMotion = uniform(BIOME_PARTICLE_MOTION_ID[layer.motion]);
  const uShape = uniform(BIOME_PARTICLE_SHAPE_ID[layer.shape]);
  const uFlow = uniform(new THREE.Vector3(layer.flowX, layer.flowY, layer.flowZ));
  const uSpeed = uniform(layer.speed);
  const uTurbulence = uniform(layer.turbulence);
  const uWallHeight = uniform(wallHeight);
  const uViewer = uniform(new THREE.Vector3());
  const uWake = uniform(layer.wake);

  const handles = {
    map: uMap,
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
  } as BiomeParticleUniformHandles;

  const material = new PointsNodeMaterial();
  material.name = `Biome particle ${layer.motion}/${layer.shape} (TSL sprites)`;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.blending = layer.glow ? THREE.AdditiveBlending : THREE.NormalBlending;
  material.fog = false;
  material.toneMapped = false;
  material.sizeAttenuation = true;
  material.userData.biomeParticle = true;
  material.userData.shaderProgramMode = "tsl";
  material.userData.biomeParticleHandles = handles;
  material.userData.particlePrimitive = "sprite";
  return material;
}

/** Material-only path for createBiomeParticleMaterial(tsl). */
export function createBiomeParticleAssemblyTsl(input: BiomeParticleMaterialInput): {
  material: BiomeParticleMaterial;
} {
  const material = createMaterialTsl(input);
  material.colorNode = Fn(() => vec4(0.5, 0.5, 0.5, 0.01))();
  return { material };
}

/** Full assembly with instanced sprite attributes. */
export function createBiomeParticleAssemblyTslWithData(
  input: BiomeParticleMaterialInput,
  data: BiomeParticleGeometryData,
  name: string,
): BiomeParticleAssembly {
  const material = createMaterialTsl(input);
  const positionAttr = new THREE.InstancedBufferAttribute(data.positions, 3);
  const sizeAttr = new THREE.InstancedBufferAttribute(data.sizes, 1);
  const phaseAttr = new THREE.InstancedBufferAttribute(data.phases, 1);
  const tintAttr = new THREE.InstancedBufferAttribute(data.tints, 1);

  const aPosition = instancedBufferAttribute(positionAttr, "vec3");
  const aSize = instancedBufferAttribute(sizeAttr, "float");
  const aPhase = instancedBufferAttribute(phaseAttr, "float");
  const aTint = instancedBufferAttribute(tintAttr, "float");
  const handles = material.userData.biomeParticleHandles as BiomeParticleUniformHandles;
  const uTime = handles.uTime;
  const uSpeed = handles.uSpeed;
  const uFlow = handles.uFlow;
  const uTurbulence = handles.uTurbulence;
  const uViewer = handles.uViewer;
  const uWake = handles.uWake;
  const uOpacity = handles.uOpacity;
  const uShape = handles.uShape;
  const uColor = handles.uColor;
  const uColorAlt = handles.uColorAlt;
  const uMap = handles.map;
  const uPixelRatio = handles.uPixelRatio;
  const uAtten = handles.uAtten;

  const hash11 = Fn(([pIn]: [any]) => {
    return fract(sin(float(pIn).mul(127.1)).mul(43758.5453));
  });

  // Same nine motion modes as the GLSL vertex shader — WebGPU has no conditional
  // early-return blocks, so each branch is computed and selected.
  const movedPosition = Fn(([posIn, phaseIn, uMotionIn]: [any, any, any]) => {
    const pos = vec3(posIn).toVar();
    const phase = float(phaseIn).mul(6.2831853);
    const t = fract(float(phaseIn).add(uTime.mul(max(uSpeed, float(0.01))).mul(0.16)));
    const wave = sin(uTime.mul(float(0.55).add(uSpeed)).add(phase));

    const drift = pos.add(uFlow.mul(sin(uTime.mul(0.18).add(phase))).mul(2.4)).add(
      vec3(
        sin(uTime.mul(0.42).add(phase)).mul(uTurbulence).mul(0.42),
        wave.mul(uTurbulence).mul(0.24),
        cos(uTime.mul(0.36).add(phase.mul(1.3)))
          .mul(uTurbulence)
          .mul(0.36),
      ),
    );
    const rise = vec3(
      pos.x.add(sin(uTime.mul(0.8).add(phase)).mul(uTurbulence).mul(0.38)).add(uFlow.x.mul(t)),
      float(-0.22).add(
        fract(pos.y.add(0.22).div(uWallHeight.add(0.44)).add(t)).mul(uWallHeight.add(0.44)),
      ),
      pos.z.add(cos(uTime.mul(0.64).add(phase)).mul(uTurbulence).mul(0.3)).add(uFlow.z.mul(t)),
    );
    const fall = vec3(
      pos.x.add(sin(uTime.mul(0.5).add(phase)).mul(uTurbulence).mul(0.6)).add(uFlow.x.mul(t)),
      float(-0.22).add(
        float(1)
          .sub(fract(pos.y.add(0.22).div(uWallHeight.add(0.44)).add(t)))
          .mul(uWallHeight.add(0.44)),
      ),
      pos.z
        .add(
          cos(uTime.mul(0.44).add(phase.mul(1.2)))
            .mul(uTurbulence)
            .mul(0.48),
        )
        .add(uFlow.z.mul(t)),
    );
    const orbitRadius = float(0.18).add(
      hash11(float(phaseIn).add(3.7)).mul(float(0.38).add(uTurbulence.mul(0.45))),
    );
    const orbit = pos.add(
      vec3(
        cos(uTime.mul(uSpeed).add(phase)).mul(orbitRadius),
        sin(uTime.mul(0.7).add(phase.mul(1.4))).mul(0.22),
        sin(uTime.mul(uSpeed).mul(0.83).add(phase)).mul(orbitRadius),
      ),
    );
    const flutter = vec3(
      pos.x.add(sin(uTime.mul(1.1).add(phase)).mul(uTurbulence).mul(0.72)),
      float(0.12).add(
        float(1)
          .sub(fract(pos.y.div(uWallHeight).add(t.mul(0.58))))
          .mul(uWallHeight.mul(0.88)),
      ),
      pos.z.add(
        cos(uTime.mul(0.76).add(phase.mul(1.5)))
          .mul(uTurbulence)
          .mul(0.52),
      ),
    );
    const burst = fract(t.mul(2.0).add(hash11(float(phaseIn).add(4.0))));
    const sparkDirection = normalize(uFlow.add(vec3(sin(phase), 0.22, cos(phase)).mul(0.28)));
    const spark = pos
      .add(sparkDirection.mul(burst.mul(float(0.8).add(uTurbulence.mul(1.7)))))
      .add(vec3(0, sin(burst.mul(3.1415926)).mul(0.24), 0));
    const pulse = pos.add(
      vec3(
        sin(uTime.mul(0.4).add(phase)).mul(uTurbulence).mul(0.42),
        sin(uTime.mul(0.5).add(phase.mul(1.2)))
          .mul(0.24)
          .add(uFlow.y.mul(uTime).mul(0.08)),
        cos(uTime.mul(0.37).add(phase)).mul(uTurbulence).mul(0.38),
      ),
    );
    const flicker = vec3(
      pos.x.add(
        floor(sin(uTime.mul(0.34).add(phase)).mul(2.0))
          .mul(uTurbulence)
          .mul(0.12),
      ),
      pos.y,
      pos.z,
    );
    const dripFall = fract(
      t.mul(float(1.15).add(uSpeed.mul(0.55))).add(hash11(float(phaseIn).add(8.1))),
    );
    const dripSpan = uWallHeight.mul(0.98);
    const drip = vec3(
      pos.x.add(sin(phase).mul(0.035)).add(uFlow.x.mul(dripFall).mul(0.2)),
      uWallHeight.mul(0.97).sub(dripFall.mul(dripSpan)),
      pos.z.add(cos(phase.mul(1.3)).mul(0.035)).add(uFlow.z.mul(dripFall).mul(0.2)),
    );

    const m = uMotionIn;
    return select(
      m.lessThan(0.5),
      drift,
      select(
        m.lessThan(1.5),
        rise,
        select(
          m.lessThan(2.5),
          fall,
          select(
            m.lessThan(3.5),
            orbit,
            select(
              m.lessThan(4.5),
              flutter,
              select(
                m.lessThan(5.5),
                spark,
                select(m.lessThan(6.5), pulse, select(m.lessThan(7.5), flicker, drip)),
              ),
            ),
          ),
        ),
      ),
    );
  });

  material.positionNode = Fn(() => {
    const pos = movedPosition(aPosition, aPhase, uMotion);
    const worldXZ = pos.xz;
    const delta = worldXZ.sub(uViewer.xz);
    const dist = length(delta).max(0.001);
    const wakeStrength = float(1)
      .sub(smoothstep(1.1, 4.8, dist))
      .mul(uWake)
      .mul(0.42);
    const tangent = vec2(delta.y.negate(), delta.x).div(dist);
    const wob = sin(aPhase.mul(6.2831853).add(uTime.mul(1.3)));
    return pos.add(
      vec3(
        tangent.x.mul(wakeStrength).mul(wob).mul(0.32),
        wakeStrength.mul(0.1).mul(sin(aPhase.mul(6.2831853).mul(1.9).add(uTime))),
        tangent.y.mul(wakeStrength).mul(wob).mul(0.32),
      ),
    );
  })();

  material.sizeNode = Fn(() => {
    const alphaPulse = float(0.72).add(
      sin(uTime.mul(float(0.8).add(uSpeed)).add(aPhase.mul(6.2831853).mul(1.7))).mul(0.28),
    );
    const sizePulse = select(
      uMotion.greaterThan(4.5).and(uMotion.lessThan(5.5)),
      float(0.82).add(
        float(1)
          .sub(
            fract(
              aPhase
                .add(uTime.mul(max(uSpeed, float(0.01))).mul(0.16))
                .mul(2.0)
                .add(hash11(aPhase.add(4.0))),
            ),
          )
          .mul(0.28),
      ),
      select(
        uMotion.lessThan(0.5).or(uMotion.lessThan(1.5)).or(uMotion.lessThan(2.5)),
        float(1.0),
        float(0.78).add(
          abs(sin(uTime.mul(float(0.55).add(uSpeed)).add(aPhase.mul(6.2831853)))).mul(0.42),
        ),
      ),
    );
    return float(0.014).add(
      aSize
        .mul(sizePulse)
        .mul(0.04)
        .mul(uPixelRatio)
        .mul(float(120).div(uAtten.add(40)))
        .mul(alphaPulse.max(0.56)),
    );
  })();

  material.colorNode = Fn(() => {
    const local = uv().sub(vec2(0.5, 0.5));
    const angle = atan(local.y, local.x);
    const d = length(local);
    const s = uShape;
    const shapeMote = float(1).sub(smoothstep(0.42, 0.08, d));
    const shapeStreak = float(1).sub(
      smoothstep(0.48, 0.08, abs(local.x.mul(3.4)).add(abs(local.y))),
    );
    const shapeFlake = float(1).sub(
      smoothstep(
        float(0.36).add(sin(angle.mul(5).add(aPhase.mul(6.2831853))).mul(0.08)),
        float(0.28),
        d,
      ),
    );
    const shapeAsh = float(1).sub(
      smoothstep(float(0.3).add(sin(angle.mul(4).add(aPhase.mul(6.2831853))).mul(0.07)), 0.12, d),
    );
    const shapeWisp = smoothstep(0.5, 0.05, length(vec2(local.x.mul(0.72), local.y.mul(2.6)))).mul(
      float(0.7).add(sin(local.x.mul(18.0)).mul(0.3)),
    );
    const shapeSpore = max(
      smoothstep(0.23, 0.04, d),
      smoothstep(0.42, 0.35, d)
        .mul(float(1).sub(smoothstep(0.31, 0.37, d)))
        .mul(0.52),
    );
    const shapeShard = float(1).sub(
      smoothstep(0.32, 0.48, abs(local.x).mul(0.72).add(abs(local.y).mul(1.28))),
    );
    const shapeBubble = max(
      float(1)
        .sub(smoothstep(0.035, 0.09, abs(d.sub(0.32))))
        .mul(0.8),
      smoothstep(0.12, 0.01, length(local.sub(vec2(-0.13, 0.13)))),
    );
    const shapeBlock = float(1).sub(smoothstep(0.32, 0.48, max(abs(local.x), abs(local.y))));
    const dropUv = vec2(local.x.mul(1.85), local.y.mul(0.78).add(0.1));
    const shapeDrop = max(
      smoothstep(0.42, 0.08, length(dropUv)),
      smoothstep(0.22, 0.02, length(vec2(local.x.mul(2.6), local.y.add(0.28)))),
    ).mul(smoothstep(0.5, 0.12, abs(local.x)));
    const shapeCrumb = float(1).sub(
      smoothstep(float(0.3).add(sin(angle.mul(4).add(aPhase.mul(6.2831853))).mul(0.07)), 0.17, d),
    );

    const mask = select(
      s.lessThan(0.5),
      shapeMote,
      select(
        s.lessThan(1.5),
        shapeStreak,
        select(
          s.lessThan(2.5),
          shapeFlake,
          select(
            s.lessThan(3.5),
            shapeAsh,
            select(
              s.lessThan(4.5),
              shapeWisp,
              select(
                s.lessThan(5.5),
                shapeSpore,
                select(
                  s.lessThan(6.5),
                  shapeShard,
                  select(
                    s.lessThan(7.5),
                    shapeBubble,
                    select(
                      s.lessThan(8.5),
                      shapeBlock,
                      select(s.lessThan(9.5), shapeDrop, shapeCrumb),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    const tex = texture(uMap, uv());
    const alpha = mask.mul(mix(0.78, 1, tex.a)).mul(uOpacity);
    const color = mix(uColor, uColorAlt, aTint);
    return vec4(color, alpha);
  })();

  const sprite = new THREE.Sprite(material as unknown as THREE.SpriteMaterial);
  sprite.name = name;
  sprite.count = data.count;
  // Instance offsets live in the node graph, so the CPU-side sprite bounds only
  // cover the origin quad — culling here would drop the whole field.
  sprite.frustumCulled = false;
  sprite.renderOrder = input.layer.glow ? 2 : 1;
  sprite.userData.particlePrimitive = "sprite";

  return {
    object: sprite,
    material,
    primitive: "sprite",
    count: data.count,
  };
}

registerTslBuilder(BIOME_PARTICLE_SHADER_FACTORY_ID, createBiomeParticleAssemblyTsl);
registerTslBuilder(BIOME_PARTICLE_ASSEMBLY_TSL_BUILDER_ID, createBiomeParticleAssemblyTslWithData);
