import * as THREE from "three";

import {
  BIOME_PARTICLE_MOTION_ID,
  BIOME_PARTICLE_SHAPE_ID,
  type BiomeParticleLayerProfile,
} from "./BiomeParticleProfile";
import {
  getShaderProgramModeRegistry,
  onShaderProgramModeRegistryChange,
  type ShaderProgramMode,
} from "./ShaderProgramMode";
import type {
  BiomeParticleAssembly,
  BiomeParticleGeometryData,
  BiomeParticleMaterial,
  BiomeParticleMaterialInput,
  BiomeParticleUniformHandles,
} from "./AtmosphereMaterialsShared";
import {
  createBiomeParticleAssemblyTsl,
  createBiomeParticleAssemblyTslWithData,
} from "./BiomeParticleMaterial.tsl";

export type {
  BiomeParticleAssembly,
  BiomeParticleGeometryData,
  BiomeParticleMaterial,
  BiomeParticleMaterialInput,
  BiomeParticleUniformHandles,
} from "./AtmosphereMaterialsShared";

/** ShaderProgramMode factory id for biome atmosphere particles. */
export const BIOME_PARTICLE_SHADER_FACTORY_ID = "biome-particle";

/** Register (or refresh) dual-mode support on the active shader program registry. */
export function registerBiomeParticleShaderFactory(
  registry = getShaderProgramModeRegistry(),
): void {
  registry.register({
    id: BIOME_PARTICLE_SHADER_FACTORY_ID,
    supports: ["glsl", "tsl"],
  });
}

registerBiomeParticleShaderFactory();
onShaderProgramModeRegistryChange(registerBiomeParticleShaderFactory);

const BIOME_PARTICLE_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aTint;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uPixelRatio;
  uniform float uAtten;
  uniform float uMotion;
  uniform vec3 uFlow;
  uniform float uSpeed;
  uniform float uTurbulence;
  uniform float uWallHeight;
  uniform vec3 uViewer;
  uniform float uWake;
  varying float vAlpha;
  varying float vTint;
  varying float vPhase;
  varying float vDepthFade;

  float hash11(float p) {
    return fract(sin(p * 127.1) * 43758.5453);
  }

  void main() {
    vec3 pos = position;
    float phase = aPhase * 6.2831853;
    float t = fract(aPhase + uTime * max(uSpeed, 0.01) * 0.16);
    float wave = sin(uTime * (0.55 + uSpeed) + phase);
    float alphaPulse = 0.72 + 0.28 * sin(uTime * (0.8 + uSpeed) + phase * 1.7);
    float sizePulse = 1.0;

    if (uMotion < 0.5) {
      pos += uFlow * sin(uTime * 0.18 + phase) * 2.4;
      pos.x += sin(uTime * 0.42 + phase) * uTurbulence * 0.42;
      pos.z += cos(uTime * 0.36 + phase * 1.3) * uTurbulence * 0.36;
      pos.y += wave * uTurbulence * 0.24;
    } else if (uMotion < 1.5) {
      pos.y = -0.22 + fract((position.y + 0.22) / (uWallHeight + 0.44) + t) * (uWallHeight + 0.44);
      pos.x += sin(uTime * 0.8 + phase) * uTurbulence * 0.38 + uFlow.x * t;
      pos.z += cos(uTime * 0.64 + phase) * uTurbulence * 0.3 + uFlow.z * t;
    } else if (uMotion < 2.5) {
      pos.y = -0.22 + (1.0 - fract((position.y + 0.22) / (uWallHeight + 0.44) + t)) * (uWallHeight + 0.44);
      pos.x += sin(uTime * 0.5 + phase) * uTurbulence * 0.6 + uFlow.x * t;
      pos.z += cos(uTime * 0.44 + phase * 1.2) * uTurbulence * 0.48 + uFlow.z * t;
    } else if (uMotion < 3.5) {
      float radius = 0.18 + hash11(aPhase + 3.7) * (0.38 + uTurbulence * 0.45);
      pos.x += cos(uTime * uSpeed + phase) * radius;
      pos.z += sin(uTime * uSpeed * 0.83 + phase) * radius;
      pos.y += sin(uTime * 0.7 + phase * 1.4) * 0.22;
    } else if (uMotion < 4.5) {
      pos.y = 0.12 + (1.0 - fract(position.y / uWallHeight + t * 0.58)) * (uWallHeight * 0.88);
      pos.x += sin(uTime * 1.1 + phase) * uTurbulence * 0.72;
      pos.z += cos(uTime * 0.76 + phase * 1.5) * uTurbulence * 0.52;
      sizePulse = 0.8 + abs(wave) * 0.36;
    } else if (uMotion < 5.5) {
      float burst = fract(t * 2.0 + hash11(aPhase + 4.0));
      vec3 direction = normalize(uFlow + vec3(sin(phase), 0.22, cos(phase)) * 0.28);
      pos += direction * burst * (0.8 + uTurbulence * 1.7);
      pos.y += sin(burst * 3.1415926) * 0.24;
      alphaPulse = 0.7 + 0.3 * sin(burst * 6.2831853 + phase);
      sizePulse = 0.82 + (1.0 - burst) * 0.28;
    } else if (uMotion < 6.5) {
      pos.x += sin(uTime * 0.4 + phase) * uTurbulence * 0.42;
      pos.z += cos(uTime * 0.37 + phase) * uTurbulence * 0.38;
      pos.y += sin(uTime * 0.5 + phase * 1.2) * 0.24 + uFlow.y * uTime * 0.08;
      alphaPulse = 0.38 + 0.62 * pow(0.5 + 0.5 * wave, 2.0);
      sizePulse = 0.78 + 0.42 * (0.5 + 0.5 * wave);
    } else if (uMotion < 7.5) {
      float gate = step(0.48, hash11(floor(uTime * (3.0 + uSpeed * 5.0)) + aPhase * 31.0));
      pos.x += floor(sin(uTime * 0.34 + phase) * 2.0) * uTurbulence * 0.12;
      alphaPulse = mix(0.56, 1.0, gate);
      sizePulse = mix(0.82, 1.18, gate);
    } else {
      float fall = fract(t * (1.15 + uSpeed * 0.55) + hash11(aPhase + 8.1));
      float span = uWallHeight * 0.98;
      pos.y = uWallHeight * 0.97 - fall * span;
      pos.x += sin(phase) * 0.035 + uFlow.x * fall * 0.2;
      pos.z += cos(phase * 1.3) * 0.035 + uFlow.z * fall * 0.2;
      alphaPulse = 0.62 + 0.38 * (1.0 - smoothstep(0.82, 1.0, fall));
      sizePulse = 0.78 + fall * 0.42;
    }

    vec2 particleWorldXZ = (modelMatrix * vec4(pos, 1.0)).xz;
    vec2 delta = particleWorldXZ - uViewer.xz;
    float distanceToViewer = length(delta);
    float wake = (1.0 - smoothstep(1.1, 4.8, distanceToViewer)) * uWake * 0.42;
    vec2 tangent = distanceToViewer > 0.001 ? vec2(-delta.y, delta.x) / distanceToViewer : vec2(0.0);
    pos.xz += tangent * wake * sin(phase + uTime * 1.3) * 0.32;
    pos.y += wake * 0.1 * sin(phase * 1.9 + uTime);

    vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    float depth = max(0.35, -mvPosition.z);
    gl_PointSize = clamp(aSize * sizePulse * uAtten * uPixelRatio / depth, 1.0, 10.0);
    gl_Position = projectionMatrix * mvPosition;
    vAlpha = uOpacity * max(0.56, alphaPulse) * (0.78 + aPhase * 0.22);
    vTint = aTint;
    vPhase = phase;
    vDepthFade = smoothstep(0.35, 0.9, depth) * (1.0 - smoothstep(13.0, 24.0, depth));
  }
`;

const BIOME_PARTICLE_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 uColor;
  uniform vec3 uColorAlt;
  uniform float uShape;
  varying float vAlpha;
  varying float vTint;
  varying float vPhase;
  varying float vDepthFade;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float cs = cos(vPhase);
    float sn = sin(vPhase);
    uv = mat2(cs, -sn, sn, cs) * uv;
    float d = length(uv);
    float mask = 0.0;

    if (uShape < 0.5) {
      mask = smoothstep(0.5, 0.08, d);
    } else if (uShape < 1.5) {
      mask = smoothstep(0.48, 0.08, length(vec2(uv.x * 3.4, uv.y)));
    } else if (uShape < 2.5) {
      float arms = min(abs(uv.x), abs(uv.y));
      float diagonals = min(abs(uv.x + uv.y), abs(uv.x - uv.y)) * 0.72;
      float crystal = 1.0 - smoothstep(0.035, 0.075, min(arms, diagonals));
      mask = crystal * smoothstep(0.37, 0.14, d);
    } else if (uShape < 3.5) {
      float roughEdge = 0.36 + sin(atan(uv.y, uv.x) * 5.0 + vPhase) * 0.08;
      mask = smoothstep(roughEdge + 0.08, roughEdge - 0.08, d);
    } else if (uShape < 4.5) {
      mask = smoothstep(0.5, 0.05, length(vec2(uv.x * 0.72, uv.y * 2.6))) * (0.7 + 0.3 * sin(uv.x * 18.0));
    } else if (uShape < 5.5) {
      float core = smoothstep(0.23, 0.04, d);
      float rim = smoothstep(0.42, 0.35, d) * (1.0 - smoothstep(0.31, 0.37, d));
      mask = max(core, rim * 0.52);
    } else if (uShape < 6.5) {
      float diamond = abs(uv.x) * 0.72 + abs(uv.y) * 1.28;
      mask = 1.0 - smoothstep(0.32, 0.48, diamond);
    } else if (uShape < 7.5) {
      float ring = 1.0 - smoothstep(0.035, 0.09, abs(d - 0.32));
      float glint = smoothstep(0.12, 0.01, length(uv - vec2(-0.13, 0.13)));
      mask = max(ring * 0.8, glint);
    } else if (uShape < 8.5) {
      float box = max(abs(uv.x), abs(uv.y));
      mask = 1.0 - smoothstep(0.32, 0.48, box);
    } else if (uShape < 9.5) {
      vec2 dropUv = vec2(uv.x * 1.85, uv.y * 0.78 + 0.1);
      float body = smoothstep(0.42, 0.08, length(dropUv));
      float tip = smoothstep(0.22, 0.02, length(vec2(uv.x * 2.6, uv.y + 0.28)));
      mask = max(body, tip) * smoothstep(0.5, 0.12, abs(uv.x));
    } else {
      float rough = 0.3 + sin(atan(uv.y, uv.x) * 4.0 + vPhase) * 0.07;
      mask = smoothstep(rough + 0.07, rough - 0.1, d);
    }

    vec4 tex = texture2D(map, gl_PointCoord);
    float a = mask * mix(0.78, 1.0, tex.a) * vAlpha * vDepthFade;
    if (a < 0.025) discard;
    vec3 color = mix(uColor, uColorAlt, vTint);
    gl_FragColor = vec4(color, a);
  }
`;

function makeBiomeParticleUniforms(
  map: THREE.Texture,
  layer: BiomeParticleLayerProfile,
  wallHeight: number,
): BiomeParticleUniformHandles {
  return {
    map: { value: map },
    uColor: { value: new THREE.Color(layer.color) },
    uColorAlt: { value: new THREE.Color(layer.colorAlt) },
    uOpacity: { value: layer.opacity },
    uTime: { value: 0 },
    uPixelRatio: {
      value: typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 1.5) : 1,
    },
    uAtten: { value: 350 },
    uMotion: { value: BIOME_PARTICLE_MOTION_ID[layer.motion] },
    uShape: { value: BIOME_PARTICLE_SHAPE_ID[layer.shape] },
    uFlow: { value: new THREE.Vector3(layer.flowX, layer.flowY, layer.flowZ) },
    uSpeed: { value: layer.speed },
    uTurbulence: { value: layer.turbulence },
    uWallHeight: { value: wallHeight },
    uViewer: { value: new THREE.Vector3() },
    uWake: { value: layer.wake },
  };
}

function createBiomeParticleMaterialGlsl(input: BiomeParticleMaterialInput): THREE.ShaderMaterial {
  const { map, layer } = input;
  const uniforms = makeBiomeParticleUniforms(map, layer, input.wallHeight);
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as THREE.ShaderMaterial["uniforms"],
    vertexShader: BIOME_PARTICLE_VERTEX,
    fragmentShader: BIOME_PARTICLE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: layer.glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: false,
    toneMapped: false,
  });
  material.userData.biomeParticle = true;
  material.userData.shaderProgramMode = "glsl";
  material.userData.biomeParticleHandles = uniforms;
  material.userData.particlePrimitive = "points";
  return material;
}

export function createBiomeParticleMaterial(
  input: BiomeParticleMaterialInput,
  mode?: ShaderProgramMode,
): BiomeParticleMaterial {
  registerBiomeParticleShaderFactory();
  const registry = getShaderProgramModeRegistry();
  const resolved = mode ?? registry.mode;
  registry.require(BIOME_PARTICLE_SHADER_FACTORY_ID, resolved);

  if (resolved === "tsl") {
    return createBiomeParticleAssemblyTsl(input).material;
  }
  return createBiomeParticleMaterialGlsl(input);
}

function buildPointsGeometry(data: BiomeParticleGeometryData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(data.sizes, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(data.phases, 1));
  geometry.setAttribute("aTint", new THREE.BufferAttribute(data.tints, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createBiomeParticleAssembly(
  input: BiomeParticleMaterialInput,
  data: BiomeParticleGeometryData,
  name: string,
  mode?: ShaderProgramMode,
): BiomeParticleAssembly {
  registerBiomeParticleShaderFactory();
  const registry = getShaderProgramModeRegistry();
  const resolved = mode ?? registry.mode;
  registry.require(BIOME_PARTICLE_SHADER_FACTORY_ID, resolved);

  if (resolved === "tsl") {
    return createBiomeParticleAssemblyTslWithData(input, data, name);
  }

  const material = createBiomeParticleMaterialGlsl(input);
  const geometry = buildPointsGeometry(data);
  const points = new THREE.Points(geometry, material);
  points.name = name;
  points.frustumCulled = true;
  points.renderOrder = input.layer.glow ? 2 : 1;
  return { object: points, material, primitive: "points", count: data.count };
}

export function biomeParticleHandles(
  material: THREE.Material,
): BiomeParticleUniformHandles | null {
  if (material.userData.biomeParticle !== true) return null;
  return (material.userData.biomeParticleHandles ??
    (material as THREE.ShaderMaterial).uniforms) as BiomeParticleUniformHandles | null;
}

export function isBiomeParticleMaterial(
  material: THREE.Material,
): material is BiomeParticleMaterial {
  return material.userData.biomeParticle === true;
}
