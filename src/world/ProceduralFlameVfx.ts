import * as THREE from "three";
import {
  getShaderProgramModeRegistry,
  onShaderProgramModeRegistryChange,
  type ShaderProgramMode,
} from "../systems/ShaderProgramMode";
import { requireTslBuilder } from "../systems/TslMaterialModules";
import type {
  NoiseFlameAssembly,
  NoiseFlameEmberUniformHandles,
  NoiseFlameMaterial,
  NoiseFlameOptions,
  NoiseFlamePalette,
  NoiseFlameUniformHandles,
} from "./ProceduralFlameVfxShared";

export type {
  NoiseFlameAssembly,
  NoiseFlameEmberUniformHandles,
  NoiseFlameMaterial,
  NoiseFlameOptions,
  NoiseFlamePalette,
  NoiseFlameUniformHandles,
} from "./ProceduralFlameVfxShared";

/** ShaderProgramMode factory id for procedural noise flames. */
export const NOISE_FLAME_SHADER_FACTORY_ID = "noise-flame";

export const WARM_NOISE_FLAME_PALETTE: NoiseFlamePalette = {
  outer: 0xff5718,
  mid: 0xffa21c,
  core: 0xfff1a0,
  glow: 0xff2e08,
};

export const FROST_NOISE_FLAME_PALETTE: NoiseFlamePalette = {
  outer: 0x287ed8,
  mid: 0x56ccff,
  core: 0xd8f8ff,
  glow: 0x174da8,
};

/** Register (or refresh) dual-mode support on the active shader program registry. */
export function registerNoiseFlameShaderFactory(registry = getShaderProgramModeRegistry()): void {
  registry.register({
    id: NOISE_FLAME_SHADER_FACTORY_ID,
    supports: ["glsl", "tsl"],
  });
}

registerNoiseFlameShaderFactory();
onShaderProgramModeRegistryChange(registerNoiseFlameShaderFactory);

const FLAME_VERTEX_SHADER = /* glsl */ `
  varying vec2 vFlameUv;
  #include <fog_pars_vertex>

  void main() {
    vFlameUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FLAME_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uOpacity;
  uniform float uTurbulence;
  uniform float uLean;
  uniform float uIntensity;
  uniform vec3 uOuterColor;
  uniform vec3 uMidColor;
  uniform vec3 uCoreColor;
  uniform vec3 uGlowColor;

  varying vec2 vFlameUv;
  #include <fog_pars_fragment>

  float flameHash(vec2 point) {
    point = fract(point * vec2(123.34, 345.45));
    point += dot(point, point + 34.345);
    return fract(point.x * point.y);
  }

  float flameNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float a = flameHash(cell);
    float b = flameHash(cell + vec2(1.0, 0.0));
    float c = flameHash(cell + vec2(0.0, 1.0));
    float d = flameHash(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  }

  float flameFbm(vec2 point) {
    float value = flameNoise(point) * 0.58;
    value += flameNoise(point * 2.03 + 17.13) * 0.29;
    value += flameNoise(point * 4.11 - 8.27) * 0.13;
    return value;
  }

  void main() {
    vec2 uv = vFlameUv;
    float y = uv.y;
    float x = (uv.x - 0.5) * 2.0;
    float clock = uTime * 0.92 + uPhase;
    float upper = smoothstep(0.05, 0.94, y);
    float baseFade = smoothstep(0.0, 0.12, y);

    float broadNoise = flameFbm(vec2(y * 2.7 - clock * 0.72, uPhase * 0.37));
    float curl = (broadNoise - 0.5) * 0.5 * upper * uTurbulence;
    curl += sin(y * 7.2 - clock * 2.1 + uPhase) * 0.075 * upper;
    curl += uLean * y * y;
    float warpedX = x - curl;

    float tipFade = 1.0 - smoothstep(0.78, 0.985, y);
    float fineNoise = flameFbm(vec2(warpedX * 2.4 + clock * 0.13, y * 5.4 - clock * 1.18));
    float edgeNoise = (fineNoise - 0.5) * mix(0.055, 0.24, upper) * uTurbulence;
    edgeNoise *= mix(1.0, 0.2, 1.0 - tipFade);

    float baseWidth = mix(0.56, 1.0, smoothstep(0.0, 0.2, y));
    float shapeX = warpedX / baseWidth;
    float bulb = 0.72 - length(vec2(shapeX * 0.94, (y - 0.2) * 2.02));
    float taperWidth = mix(0.78 * baseWidth, 0.012, pow(y, 1.18));
    float tongue = taperWidth - abs(warpedX);
    float flameShape = max(bulb, tongue) + edgeNoise - (1.0 - tipFade) * 0.12;

    float lobeX = 0.3 * sin(clock * 1.17 + uPhase * 1.9);
    float lobeY = 0.84 + 0.035 * sin(clock * 1.63 + uPhase);
    float lobe = 0.095 - length(vec2((x - lobeX) * 0.8, (y - lobeY) * 2.5));
    lobe += (flameFbm(vec2(x * 5.2 - clock, y * 7.1 - clock * 1.4)) - 0.5) * 0.055;
    flameShape = max(flameShape, lobe);

    float cardMask = baseFade * (1.0 - smoothstep(0.965, 1.0, y));
    float softHalo = smoothstep(-0.2, 0.015, flameShape) * cardMask;
    float outerMask = smoothstep(-0.045, 0.035, flameShape) * cardMask;
    float midMask = smoothstep(0.075, 0.19, flameShape) * (1.0 - smoothstep(0.82, 1.02, y));
    float coreMask = smoothstep(0.21, 0.39, flameShape) * (1.0 - smoothstep(0.62, 0.9, y));

    vec3 color = mix(uGlowColor, uOuterColor, outerMask);
    color = mix(color, uMidColor, midMask);
    color = mix(color, uCoreColor, coreMask);
    color += uGlowColor * max(softHalo - outerMask, 0.0) * 1.1;
    color += uCoreColor * coreMask * 0.38;
    color *= uIntensity;

    float alpha = max(outerMask, softHalo * 0.42) * uOpacity * tipFade;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    #include <premultiplied_alpha_fragment>
  }
`;

const EMBER_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPhase;
  uniform float uOpacity;
  uniform vec2 uWind;
  attribute float aSeed;
  attribute float aSize;
  varying float vEmberLife;
  #include <fog_pars_vertex>

  void main() {
    float cycle = fract(uTime * (0.18 + aSeed * 0.07) + aSeed * 1.73 + uPhase * 0.11);
    float rise = cycle * (0.42 + aSeed * 0.2);
    float drift = sin(uTime * (1.05 + aSeed * 0.9) + aSeed * 19.0 + uPhase) *
      (0.035 + aSeed * 0.035) * (0.35 + cycle);
    vec3 emberPosition = position;
    emberPosition.y += rise;
    emberPosition.x += drift + sin(cycle * 5.8 + aSeed * 11.0) * 0.018 + uWind.x * (0.55 + cycle);
    emberPosition.z += cos(uTime * 0.84 + aSeed * 13.0 + uPhase) *
      (0.018 + aSeed * 0.022) * cycle + uWind.y * (0.55 + cycle);
    vEmberLife = smoothstep(0.0, 0.08, cycle) * (1.0 - smoothstep(0.72, 1.0, cycle));

    vec4 mvPosition = modelViewMatrix * vec4(emberPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = max(1.5, aSize * (150.0 / max(-mvPosition.z, 1.0))) *
      (0.72 + vEmberLife * 0.42);
    #include <fog_vertex>
  }
`;

const EMBER_FRAGMENT_SHADER = /* glsl */ `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying float vEmberLife;
  #include <fog_pars_fragment>

  void main() {
    float distanceToCenter = length(gl_PointCoord - vec2(0.5));
    float spark = 1.0 - smoothstep(0.18, 0.5, distanceToCenter);
    float alpha = spark * vEmberLife * uOpacity;
    if (alpha < 0.01) discard;
    vec3 color = uColor * (1.35 + spark * 1.4);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    #include <premultiplied_alpha_fragment>
  }
`;

function createNoiseFlameGeometry(): THREE.PlaneGeometry {
  // Keep a small transparent margin on both ends so the shader can fade into
  // the socket and finish the tip without intersecting the card boundary.
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

function colorUniform(value: number): { value: THREE.Color } {
  return { value: new THREE.Color(value) };
}

function emberSeed(index: number, phase: number): number {
  return THREE.MathUtils.euclideanModulo(
    Math.sin((index + 1) * 91.17 + phase * 17.31) * 43758.5453,
    1,
  );
}

function createNoiseFlameEmbersGlsl(
  options: NoiseFlameOptions,
  emberColor: THREE.Color,
): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
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
  const geometry = new THREE.BufferGeometry();
  geometry.name = "Procedural flame ember particles";
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    name: "Procedural flame ember particle material",
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uPhase: { value: options.phase },
        uOpacity: { value: options.opacity ?? 0.9 },
        uColor: { value: emberColor.clone() },
        uWind: { value: new THREE.Vector2(0, 0) },
      },
    ]),
    vertexShader: EMBER_VERTEX_SHADER,
    fragmentShader: EMBER_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: true,
    fog: true,
  });
  const emberHandles: NoiseFlameEmberUniformHandles = {
    uTime: material.uniforms.uTime!,
    uPhase: material.uniforms.uPhase!,
    uOpacity: material.uniforms.uOpacity!,
    uColor: material.uniforms.uColor!,
    uWind: material.uniforms.uWind!,
  };
  material.userData.noiseFlameEmber = true;
  material.userData.noiseFlameEmberHandles = emberHandles;
  material.userData.shaderProgramMode = "glsl";
  material.userData.emberPrimitive = "points";

  const embers = new THREE.Points(geometry, material);
  embers.name = "Floating flame embers";
  // Embers rise around dynamic fire lights; keep them drawable near the camera.
  embers.frustumCulled = false;
  embers.renderOrder = 5;
  embers.userData.vfxOnly = true;
  embers.userData.emberPrimitive = "points";
  return embers;
}

function createNoiseFlameGlsl(options: NoiseFlameOptions): NoiseFlameAssembly {
  const palette = options.palette ?? WARM_NOISE_FLAME_PALETTE;
  const baseOpacity = options.opacity ?? 0.9;
  const geometry = createNoiseFlameGeometry();
  const material = new THREE.ShaderMaterial({
    name: "Procedural layered noise flame material",
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uPhase: { value: options.phase },
        uOpacity: { value: baseOpacity },
        uTurbulence: { value: options.turbulence ?? 1 },
        uLean: { value: options.lean ?? 0 },
        uIntensity: { value: options.intensity ?? 1.28 },
        uOuterColor: colorUniform(palette.outer),
        uMidColor: colorUniform(palette.mid),
        uCoreColor: colorUniform(palette.core),
        uGlowColor: colorUniform(palette.glow),
      },
    ]),
    vertexShader: FLAME_VERTEX_SHADER,
    fragmentShader: FLAME_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: true,
    fog: true,
  });
  const handles: NoiseFlameUniformHandles = {
    uTime: material.uniforms.uTime!,
    uPhase: material.uniforms.uPhase!,
    uOpacity: material.uniforms.uOpacity!,
    uTurbulence: material.uniforms.uTurbulence!,
    uLean: material.uniforms.uLean!,
    uIntensity: material.uniforms.uIntensity!,
    uOuterColor: material.uniforms.uOuterColor!,
    uMidColor: material.uniforms.uMidColor!,
    uCoreColor: material.uniforms.uCoreColor!,
    uGlowColor: material.uniforms.uGlowColor!,
  };
  material.userData.noiseFlame = true;
  material.userData.noiseFlameHandles = handles;
  material.userData.baseOpacity = baseOpacity;
  material.userData.shaderProgramMode = "glsl";
  const embers = createNoiseFlameEmbersGlsl(options, new THREE.Color(palette.mid));
  material.userData.emberMaterial = embers.material;
  material.userData.emberHandles = embers.material.userData
    .noiseFlameEmberHandles as NoiseFlameEmberUniformHandles;
  material.userData.sourceTechnique =
    "teardrop + animated noise offset/map + soft tip cap + palette/glow + floating embers";

  const flame = new THREE.Mesh(geometry, material);
  flame.name = options.name;
  flame.scale.set(options.width, options.height / 1.16, 1);
  flame.renderOrder = 4;
  flame.userData.vfxOnly = true;
  flame.userData.noiseFlame = true;
  flame.add(embers);

  const details: THREE.Object3D[] = [embers];
  return { flame, details, material };
}

export function createNoiseFlame(
  options: NoiseFlameOptions,
  mode?: ShaderProgramMode,
): NoiseFlameAssembly {
  registerNoiseFlameShaderFactory();
  const registry = getShaderProgramModeRegistry();
  const resolved = mode ?? registry.mode;
  registry.require(NOISE_FLAME_SHADER_FACTORY_ID, resolved);

  if (resolved === "tsl") {
    const build = requireTslBuilder<typeof import("./ProceduralFlameVfx.tsl").createNoiseFlameTsl>(
      NOISE_FLAME_SHADER_FACTORY_ID,
    );
    return build({
      options,
      palette: options.palette ?? WARM_NOISE_FLAME_PALETTE,
    });
  }
  return createNoiseFlameGlsl(options);
}

function noiseFlameHandles(material: THREE.Material): NoiseFlameUniformHandles | null {
  if (material.userData.noiseFlame !== true) return null;
  const handles = material.userData.noiseFlameHandles as NoiseFlameUniformHandles | undefined;
  return handles ?? null;
}

export function isNoiseFlameMaterial(material: THREE.Material): material is NoiseFlameMaterial {
  return material.userData.noiseFlame === true && noiseFlameHandles(material) !== null;
}

export function setNoiseFlameMoodPalette(
  material: THREE.Material,
  outer: THREE.Color,
  core: THREE.Color,
): boolean {
  const handles = noiseFlameHandles(material);
  if (!handles) return false;
  const vividOuter = outer.clone().offsetHSL(0, 0.22, 0.07);
  const brightCore = core.clone().offsetHSL(0, 0.1, 0.08).lerp(new THREE.Color(0xffffff), 0.22);
  handles.uOuterColor.value.copy(vividOuter);
  handles.uMidColor.value.copy(vividOuter).lerp(brightCore, 0.48);
  handles.uCoreColor.value.copy(brightCore);
  handles.uGlowColor.value.copy(vividOuter).multiplyScalar(0.62);
  const emberHandles = material.userData.emberHandles as NoiseFlameEmberUniformHandles | undefined;
  if (emberHandles) {
    emberHandles.uColor.value.copy(vividOuter).lerp(brightCore, 0.22);
  }
  return true;
}

/** Lateral shader lean for the teardrop card (positive tips the tongue to +X). */
export function setNoiseFlameLean(material: THREE.Material, lean: number): boolean {
  const handles = noiseFlameHandles(material);
  if (!handles) return false;
  handles.uLean.value = THREE.MathUtils.clamp(lean, -1.5, 1.5);
  return true;
}

/** Extra ember drift in local flame space (x lateral, y depth/forward). */
export function setNoiseFlameWind(material: THREE.Material, windX: number, windZ: number): boolean {
  const emberHandles = material.userData.emberHandles as NoiseFlameEmberUniformHandles | undefined;
  if (!emberHandles?.uWind) return false;
  const x = THREE.MathUtils.clamp(windX, -0.45, 0.45);
  const y = THREE.MathUtils.clamp(windZ, -0.45, 0.45);
  const value = emberHandles.uWind.value as THREE.Vector2 | { x: number; y: number } | undefined;
  if (!value) return false;
  if (typeof (value as THREE.Vector2).set === "function") {
    (value as THREE.Vector2).set(x, y);
    return true;
  }
  if ("x" in value && "y" in value) {
    value.x = x;
    value.y = y;
    return true;
  }
  return false;
}

export function tickNoiseFlame(
  material: THREE.Material,
  elapsed: number,
  visibility: number,
): boolean {
  const handles = noiseFlameHandles(material);
  if (!handles) return false;
  const opacity =
    (material.userData.baseOpacity as number) * THREE.MathUtils.clamp(visibility, 0, 1);
  handles.uTime.value = elapsed;
  handles.uOpacity.value = opacity;
  const emberHandles = material.userData.emberHandles as NoiseFlameEmberUniformHandles | undefined;
  if (emberHandles) {
    emberHandles.uTime.value = elapsed;
    emberHandles.uOpacity.value = opacity;
  }
  return true;
}
