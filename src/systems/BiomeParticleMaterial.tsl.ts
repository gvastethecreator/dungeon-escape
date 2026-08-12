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
  clamp,
  cos,
  float,
  instancedBufferAttribute,
  length,
  mix,
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

  material.positionNode = Fn(() => {
    const t = uTime.mul(uSpeed).add(aPhase);
    const drift = vec3(
      sin(t.mul(0.7).add(aPhase)).mul(uFlow.x),
      cos(t.mul(0.55).add(aPhase.mul(1.3))).mul(uFlow.y),
      sin(t.mul(0.63).sub(aPhase)).mul(uFlow.z),
    ).mul(uTurbulence.add(0.35));
    const wake = uViewer.sub(aPosition).normalize().mul(uWake.mul(0.08));
    return aPosition.add(drift).sub(wake);
  })();

  material.sizeNode = Fn(() => {
    return float(0.014).add(
      aSize
        .mul(0.04)
        .mul(uPixelRatio)
        .mul(float(120).div(uAtten.add(40))),
    );
  })();

  material.colorNode = Fn(() => {
    const local = uv().sub(vec2(0.5, 0.5));
    const d = length(local);
    const angle = atan(local.y, local.x);
    const shapeOrb = float(1).sub(smoothstep(0.42, 0.08, d));
    const shapeSpark = float(1).sub(
      smoothstep(0.48, 0.1, abs(local.x).add(abs(local.y.mul(0.55)))),
    );
    const shapeAsh = float(1).sub(
      smoothstep(float(0.3).add(sin(angle.mul(4).add(aPhase)).mul(0.07)), 0.12, d),
    );
    const mask = mix(
      shapeOrb,
      mix(shapeSpark, shapeAsh, clamp(uShape.sub(1), 0, 1)),
      clamp(uShape, 0, 1),
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
