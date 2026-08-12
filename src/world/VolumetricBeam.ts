import * as THREE from "three";
import {
  getShaderProgramModeRegistry,
  onShaderProgramModeRegistryChange,
  type ShaderProgramMode,
} from "../systems/ShaderProgramMode";
import { createVolumetricBeamMaterialTsl } from "./VolumetricBeam.tsl";
import type {
  VolumetricBeamMaterial,
  VolumetricBeamOptions,
  VolumetricBeamProfile,
  VolumetricBeamUniformHandles,
} from "./VolumetricBeamShared";

export type {
  VolumetricBeamMaterial,
  VolumetricBeamOptions,
  VolumetricBeamProfile,
  VolumetricBeamUniformHandles,
} from "./VolumetricBeamShared";

/** ShaderProgramMode factory id for volumetric light shafts. */
export const VOLUMETRIC_BEAM_SHADER_FACTORY_ID = "volumetric-beam";

/** Register (or refresh) dual-mode support on the active shader program registry. */
export function registerVolumetricBeamShaderFactory(
  registry = getShaderProgramModeRegistry(),
): void {
  registry.register({
    id: VOLUMETRIC_BEAM_SHADER_FACTORY_ID,
    supports: ["glsl", "tsl"],
  });
}

registerVolumetricBeamShaderFactory();
onShaderProgramModeRegistryChange(registerVolumetricBeamShaderFactory);

/**
 * A beam is geometry in the dungeon, never a camera-facing/post-process layer.
 * Keep the source at local y = 0 and let the shaft descend along local -Y.
 */
const BEAM_VERTEX_SHADER = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vLocalPos;
  varying vec3 vBeamAxis;
  varying vec2 vBeamUv;

#if defined(AMBIENT_STRATA_PROFILE) || defined(OBJECTIVE_STRATA_PROFILE)
  attribute float aBeamLayer;
  attribute float aStratumPhase;
  varying float vBeamLayer;
  varying float vStratumPhase;
#endif

  void main() {
    vLocalPos = position;
    vBeamUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vBeamAxis = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;

#if defined(AMBIENT_STRATA_PROFILE) || defined(OBJECTIVE_STRATA_PROFILE)
    vBeamLayer = aBeamLayer;
    vStratumPhase = aStratumPhase;
#endif

    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const BEAM_FRAGMENT_SHADER = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>

  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uTime;
  uniform float uHeight;
  uniform float uTopRadius;
  uniform float uBottomRadius;

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vLocalPos;
  varying vec3 vBeamAxis;
  varying vec2 vBeamUv;

#if defined(AMBIENT_STRATA_PROFILE) || defined(OBJECTIVE_STRATA_PROFILE)
  varying float vBeamLayer;
  varying float vStratumPhase;

  // Exact recursive 4x4 Bayer ordering. Inputs are local stratum UVs, never
  // framebuffer coordinates, so every broken edge stays fixed in the room.
  float bayer2(vec2 cell) {
    vec2 p = mod(floor(cell), 2.0);
    float top = mix(0.0, 2.0, p.x);
    float bottom = mix(3.0, 1.0, p.x);
    return mix(top, bottom, p.y);
  }

  float bayer4(vec2 cell) {
    float lowBits = bayer2(mod(cell, 2.0));
    float highBits = bayer2(floor(cell * 0.5));
    return (4.0 * lowBits + highBits + 0.5) / 16.0;
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float coarseFlow(vec2 cell, float phase) {
    float tick = floor(uTime * 1.35);
    vec2 stepped = floor(cell + vec2(phase * 11.0 + tick * 0.25, -tick * 0.5));
    return hash21(stepped);
  }

  float retroDensityBand(float band) {
    if (band < 0.5) return 0.82;
    if (band < 1.5) return 1.0;
    if (band < 2.5) return 0.76;
    return 0.48;
  }

  vec3 quantize5Bit(vec3 color) {
    return floor(clamp(color, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
  }
#else
  // Stable 3D value noise. The sample position is in world space so the
  // authored signal texture moves with the dungeon instead of the framebuffer.
  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float valueNoise3(vec3 p) {
    vec3 cell = floor(p);
    vec3 local = fract(p);
    local = local * local * (3.0 - 2.0 * local);

    float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
    float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
    float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
    float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
    float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
    float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
    float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
    float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));

    float x0 = mix(n000, n100, local.x);
    float x1 = mix(n010, n110, local.x);
    float x2 = mix(n001, n101, local.x);
    float x3 = mix(n011, n111, local.x);
    return mix(mix(x0, x1, local.y), mix(x2, x3, local.y), local.z);
  }
#endif

  void main() {
    float height01 = clamp(-vLocalPos.y / max(uHeight, 0.001), 0.0, 1.0);

    vec3 toCamera = normalize(cameraPosition - vWorldPos);
    float facing = abs(dot(normalize(vWorldNormal), toCamera));

    // Crossed open planes read as hard diagonal white streaks when edge-on or
    // when the camera walks through the shaft. Kill those silhouettes early:
    // wider proximity fade + a hard edge-on gate (four strata ⇒ four lines).
    float cameraRange = length(cameraPosition.xz - vBeamAxis.xz);
    float proximityFade = smoothstep(1.85, 3.4, cameraRange);
    float edgeOnFade = smoothstep(0.12, 0.38, facing);
    float beamVisibility = proximityFade * edgeOnFade;
    if (beamVisibility < 0.01) discard;

#ifdef AMBIENT_STRATA_PROFILE
    // Six open world-space planes overlap into a volume without enclosing the
    // camera in a visible cone. Three broad strata establish the shaft while
    // three narrow, interleaved strata make its centre deeper and irregular.
    float lateral = clamp(1.0 - abs(vBeamUv.x * 2.0 - 1.0), 0.0, 1.0);
    float edgeCoverage = pow(lateral, mix(0.72, 1.35, vBeamLayer));
    vec2 ditherCell = vec2(
      vBeamUv.x * 12.0 + vStratumPhase * 7.0,
      vBeamUv.y * 14.0 + floor(uTime * 1.35) * 0.25
    );
    float orderedEdge = step(bayer4(ditherCell), clamp(edgeCoverage * 1.12, 0.0, 1.0));
    float edgeMask = mix(orderedEdge, 1.0, smoothstep(0.52, 0.82, lateral));

    float sourceFade = smoothstep(0.0, 0.08, height01);
    float floorFade = 1.0 - smoothstep(0.66, 1.0, height01);
    float bandCoord = clamp(height01 * 4.0, 0.0, 3.999);
    float band = floor(bandCoord);
    float densityBand = retroDensityBand(band);
    float flow = coarseFlow(vec2(vBeamUv.x * 3.5, vBeamUv.y * 8.0), vStratumPhase);
    float flowDensity = mix(0.8, 1.08, step(0.42 - lateral * 0.12, flow));
    float facingBand = floor(clamp(facing * 3.0, 0.0, 2.999)) * 0.5;
    float viewDensity = mix(0.32, 1.0, facingBand);
    float layerDensity = mix(0.62, 1.08, vBeamLayer);

    float alpha = clamp(
      uStrength * 1.9 * viewDensity * layerDensity * densityBand * flowDensity *
        sourceFade * floorFade * edgeMask * beamVisibility,
      0.0,
      0.24
    );
    if (alpha < 0.002) discard;

    float stratumValue = floor(mod(vStratumPhase * 19.0, 3.0)) * 0.5;
    vec3 col = quantize5Bit(uColor * mix(0.72, 1.08, stratumValue));
    gl_FragColor = vec4(col, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
#elif defined(OBJECTIVE_STRATA_PROFILE)
    // Objective beacons use thinner open strata and stepped gaps. They point
    // to the pickup without flattening it behind a broad luminous cylinder.
    float lateral = clamp(1.0 - abs(vBeamUv.x * 2.0 - 1.0), 0.0, 1.0);
    float edgeCoverage = pow(lateral, mix(0.82, 1.55, vBeamLayer));
    vec2 ditherCell = vec2(
      vBeamUv.x * 18.0 + vStratumPhase * 7.0,
      vBeamUv.y * 30.0 - floor(uTime * 2.0) * 0.35
    );
    float edgeMask = step(bayer4(ditherCell), clamp(edgeCoverage * 1.12, 0.0, 1.0));
    float sourceFade = smoothstep(0.0, 0.06, height01);
    float pickupFade = 1.0 - smoothstep(0.82, 1.0, height01);
    float flow = coarseFlow(vec2(vBeamUv.x * 8.0, vBeamUv.y * 21.0), vStratumPhase);
    float steppedGap = mix(0.58, 1.0, step(0.34, flow + lateral * 0.22));
    float viewDensity = mix(0.28, 1.0, smoothstep(0.08, 0.82, facing));
    float layerDensity = mix(0.7, 1.12, vBeamLayer);
    float alpha = clamp(
      uStrength * 2.35 * viewDensity * layerDensity * steppedGap * sourceFade *
        pickupFade * edgeMask * beamVisibility,
      0.0,
      0.32
    );
    if (alpha < 0.002) discard;
    vec3 col = quantize5Bit(uColor * mix(0.78, 1.12, vBeamLayer));
    gl_FragColor = vec4(col, alpha);
#else
    // Signal beams retain the smoother portal/stone vocabulary. This avoids
    // applying the ambient PSone profile to authored gameplay indicators.
    float volumeFacing = smoothstep(0.12, 0.78, facing);

    // Stronger at the ceiling opening, with a quiet fade before the floor so
    // the shaft does not read as a solid cone pasted onto the tiles.
    float sourceFade = 1.0 - smoothstep(0.0, 0.16, height01) * 0.18;
    float floorFade = 1.0 - smoothstep(0.78, 1.0, height01) * 0.34;

    // Two low-frequency world-space layers give the light a slow, dusty body.
    // uTime moves the dust through the room; it never samples screen pixels.
    float broadNoise = valueNoise3(vWorldPos * vec3(0.48, 0.36, 0.48) + vec3(0.0, uTime * 0.035, 0.0));
    float detailNoise = valueNoise3(vWorldPos * vec3(1.45, 1.05, 1.45) + vec3(uTime * 0.018, 0.0, -uTime * 0.014));
    float density = mix(0.72, 1.08, smoothstep(0.18, 0.84, broadNoise));
    density *= mix(0.9, 1.08, detailNoise);

    float opticalDepth = uStrength * 3.2 * volumeFacing * sourceFade * floorFade * density;
    float alpha = (1.0 - exp(-max(opticalDepth, 0.0))) * beamVisibility;
    if (alpha < 0.002) discard;

    vec3 col = uColor * mix(0.84, 1.08, broadNoise);
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
#endif
  }
`;

function makeBeamMaterialGlsl(
  color: number,
  strength: number,
  height: number,
  sourceRadius: number,
  bottomRadius: number,
  options: VolumetricBeamOptions,
): THREE.ShaderMaterial {
  const ambient = options.role === "ambient";
  const objective = !ambient && options.signalStyle === "objective";
  const material = new THREE.ShaderMaterial({
    vertexShader: BEAM_VERTEX_SHADER,
    fragmentShader: BEAM_FRAGMENT_SHADER,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uColor: { value: new THREE.Color(color) },
        uStrength: { value: strength },
        uTime: { value: 0 },
        uHeight: { value: height },
        uTopRadius: { value: sourceRadius },
        uBottomRadius: { value: bottomRadius },
      },
    ]),
    defines: ambient
      ? { AMBIENT_STRATA_PROFILE: 1 }
      : objective
        ? { OBJECTIVE_STRATA_PROFILE: 1 }
        : {},
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: options.blending ?? THREE.AdditiveBlending,
    toneMapped: options.toneMapped ?? false,
    fog: options.fog ?? false,
  });
  material.forceSinglePass = true;
  material.name = `${ambient ? "Retro ambient strata" : objective ? "Objective strata" : "World"} volumetric beam material`;
  material.userData.volumetricSpace = "world";
  material.userData.screenSpace = false;
  material.userData.shaderProgramMode = "glsl";
  const handles: VolumetricBeamUniformHandles = {
    uColor: material.uniforms.uColor!,
    uStrength: material.uniforms.uStrength!,
    uTime: material.uniforms.uTime!,
    uHeight: material.uniforms.uHeight!,
    uTopRadius: material.uniforms.uTopRadius!,
    uBottomRadius: material.uniforms.uBottomRadius!,
  };
  material.userData.volumetricBeamHandles = handles;
  return material;
}

function makeBeamGeometry(
  sourceRadius: number,
  bottomRadius: number,
  height: number,
  profile: VolumetricBeamProfile,
): THREE.BufferGeometry {
  if (profile === "signal") {
    const geometry = new THREE.CylinderGeometry(sourceRadius, bottomRadius, height, 20, 8, true);
    geometry.translate(0, -height / 2, 0);
    geometry.userData.radialSegments = 20;
    geometry.userData.heightSegments = 8;
    geometry.userData.triangles = 320;
    return geometry;
  }

  const ambient = profile === "ambient";
  const strata = ambient ? 6 : 4;
  const broadStrata = ambient ? 3 : 2;
  const heightSegments = ambient ? 3 : 4;
  const widthScales = ambient ? [0.95, 0.78, 0.65, 0.38, 0.32, 0.27] : [0.42, 0.34, 0.25, 0.2];
  const positions: number[] = [];
  const uvs: number[] = [];
  const layers: number[] = [];
  const phases: number[] = [];

  const pushVertex = (
    x: number,
    y: number,
    z: number,
    u: number,
    v: number,
    layer: number,
    phase: number,
  ) => {
    positions.push(x, y, z);
    uvs.push(u, v);
    layers.push(layer);
    phases.push(phase);
  };

  for (let stratum = 0; stratum < strata; stratum += 1) {
    const layer = stratum < broadStrata ? 0 : 1;
    const layerIndex = layer === 0 ? stratum : stratum - broadStrata;
    const layerCount = layer === 0 ? broadStrata : strata - broadStrata;
    const angle = (layerIndex / layerCount) * Math.PI + (layer === 1 ? Math.PI / (strata + 2) : 0);
    const directionX = Math.sin(angle);
    const directionZ = Math.cos(angle);
    const perpendicularX = directionZ;
    const perpendicularZ = -directionX;
    const widthScale = widthScales[stratum]!;
    const phase = stratum / strata;
    const offsetBias = Math.sin((stratum + 1) * 1.73) * bottomRadius * (ambient ? 0.075 : 0.045);

    for (let segment = 0; segment < heightSegments; segment += 1) {
      const topT = segment / heightSegments;
      const bottomT = (segment + 1) / heightSegments;
      const topRadius = THREE.MathUtils.lerp(sourceRadius, bottomRadius, topT) * widthScale;
      const lowerRadius = THREE.MathUtils.lerp(sourceRadius, bottomRadius, bottomT) * widthScale;
      const topOffset = offsetBias * topT;
      const lowerOffset = offsetBias * bottomT;
      const topY = -height * topT;
      const lowerY = -height * bottomT;
      const topLeft: readonly [number, number, number] = [
        perpendicularX * topOffset - directionX * topRadius,
        topY,
        perpendicularZ * topOffset - directionZ * topRadius,
      ];
      const topRight: readonly [number, number, number] = [
        perpendicularX * topOffset + directionX * topRadius,
        topY,
        perpendicularZ * topOffset + directionZ * topRadius,
      ];
      const lowerLeft: readonly [number, number, number] = [
        perpendicularX * lowerOffset - directionX * lowerRadius,
        lowerY,
        perpendicularZ * lowerOffset - directionZ * lowerRadius,
      ];
      const lowerRight: readonly [number, number, number] = [
        perpendicularX * lowerOffset + directionX * lowerRadius,
        lowerY,
        perpendicularZ * lowerOffset + directionZ * lowerRadius,
      ];

      pushVertex(...topLeft, 0, topT, layer, phase);
      pushVertex(...lowerLeft, 0, bottomT, layer, phase);
      pushVertex(...lowerRight, 1, bottomT, layer, phase);
      pushVertex(...topLeft, 0, topT, layer, phase);
      pushVertex(...lowerRight, 1, bottomT, layer, phase);
      pushVertex(...topRight, 1, topT, layer, phase);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aBeamLayer", new THREE.Float32BufferAttribute(layers, 1));
  geometry.setAttribute("aStratumPhase", new THREE.Float32BufferAttribute(phases, 1));
  geometry.computeVertexNormals();
  geometry.name = ambient
    ? "Open crossed retro ambient light strata"
    : "Open crossed objective light strata";
  geometry.userData.closedVolume = false;
  geometry.userData.strata = strata;
  geometry.userData.broadStrata = broadStrata;
  geometry.userData.narrowStrata = strata - broadStrata;
  geometry.userData.heightSegments = heightSegments;
  geometry.userData.triangles = strata * heightSegments * 2;
  return geometry;
}

function beamHandles(source: THREE.Mesh | THREE.Material): VolumetricBeamUniformHandles | null {
  const material = source instanceof THREE.Mesh ? source.material : source;
  if (!(material instanceof THREE.Material)) return null;
  if (!material.userData.volumetricSpace) return null;
  const handles = material.userData.volumetricBeamHandles as
    | VolumetricBeamUniformHandles
    | undefined;
  return handles ?? null;
}

/** Advance shared beam time (call once per frame from world update if desired). */
export function tickVolumetricBeamTime(mesh: THREE.Mesh, time: number): void {
  const handles = beamHandles(mesh);
  if (!handles) return;
  handles.uTime.value = time;
}

/** Runtime strength for distance/FX fading. Clamped to a non-negative range. */
export function setVolumetricBeamStrength(
  mesh: THREE.Mesh | THREE.Material,
  strength: number,
): void {
  const handles = beamHandles(mesh);
  if (!handles) return;
  handles.uStrength.value = Math.max(0, strength);
}

export function getVolumetricBeamStrength(mesh: THREE.Mesh | THREE.Material): number | null {
  const handles = beamHandles(mesh);
  const value = handles?.uStrength.value;
  return typeof value === "number" ? value : null;
}

/** Mood / palette tint. Strength is the lerp factor into the target color. */
export function tintVolumetricBeamColor(
  material: THREE.Material,
  color: THREE.Color,
  strength: number,
): boolean {
  const handles = beamHandles(material);
  if (!handles || !(handles.uColor.value instanceof THREE.Color)) return false;
  handles.uColor.value.lerp(color, THREE.MathUtils.clamp(strength, 0, 1));
  return true;
}

export function createVolumetricBeam(
  color = 0xb8b4a8,
  height = 4.2,
  radius = 1.25,
  strength = 0.24,
  options: VolumetricBeamOptions = {},
  mode?: ShaderProgramMode,
): THREE.Mesh {
  registerVolumetricBeamShaderFactory();
  const registry = getShaderProgramModeRegistry();
  const resolved = mode ?? registry.mode;
  registry.require(VOLUMETRIC_BEAM_SHADER_FACTORY_ID, resolved);

  const shaftHeight = Math.max(0.1, height);
  const bottomRadius = Math.max(0.02, radius);
  const sourceRadius = Math.max(0.04, options.topRadius ?? Math.min(bottomRadius * 0.24, 0.28));
  const ambient = options.role === "ambient";
  const objective = !ambient && options.signalStyle === "objective";
  const profile: VolumetricBeamProfile = ambient
    ? "ambient"
    : objective
      ? "objective"
      : "signal";
  const geometry = makeBeamGeometry(sourceRadius, bottomRadius, shaftHeight, profile);
  const material: VolumetricBeamMaterial =
    resolved === "tsl"
      ? createVolumetricBeamMaterialTsl(
          color,
          strength,
          shaftHeight,
          sourceRadius,
          bottomRadius,
          options,
          profile,
        )
      : makeBeamMaterialGlsl(color, strength, shaftHeight, sourceRadius, bottomRadius, options);
  const beam = new THREE.Mesh(geometry, material as THREE.Material);
  beam.name = "World-space volumetric light shaft";
  beam.renderOrder = 0;
  beam.userData.isVolumetricBeam = true;
  beam.userData.volumetricSpace = "world";
  beam.userData.screenSpace = false;
  beam.userData.beamRole = options.role ?? "signal";
  beam.userData.profile = ambient
    ? "retro-crossed-strata"
    : objective
      ? "objective-strata"
      : "signal-smooth";
  beam.userData.sourceRadius = sourceRadius;
  beam.userData.bottomRadius = bottomRadius;
  beam.userData.height = shaftHeight;
  beam.userData.shaderProgramMode = resolved;
  return beam;
}
