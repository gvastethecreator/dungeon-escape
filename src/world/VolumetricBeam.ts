import * as THREE from "three";

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
  varying vec2 vBeamUv;

  void main() {
    vLocalPos = position;
    vBeamUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);

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

  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec3 vLocalPos;
  varying vec2 vBeamUv;

#ifndef AMBIENT_RETRO_PROFILE
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
#else
  // Exact recursive 4x4 Bayer ordering. The input is local cylindrical UV,
  // never framebuffer coordinates, so the pattern is fixed to the shaft.
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

  float retroDensityBand(float band) {
    if (band < 0.5) return 0.88;
    if (band < 1.5) return 1.0;
    if (band < 2.5) return 0.82;
    return 0.58;
  }

  vec3 quantize5Bit(vec3 color) {
    return floor(clamp(color, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
  }
#endif

  void main() {
    float height01 = clamp(-vLocalPos.y / max(uHeight, 0.001), 0.0, 1.0);

    vec3 toCamera = normalize(cameraPosition - vWorldPos);
    float facing = abs(dot(normalize(vWorldNormal), toCamera));

#ifdef AMBIENT_RETRO_PROFILE
    // The ambient shaft is intentionally a sparse polygon volume. Flat mesh
    // normals and three view-facing levels keep its sides authored and legible.
    float facingBand = floor(clamp(facing * 3.0, 0.0, 2.999)) * 0.5;
    float viewDensity = mix(0.72, 1.0, facingBand);

    // Fade both open ends before the geometry boundary. This removes the dark
    // ceiling mouth and the hard floor ring of the previous smooth cone.
    float sourceFade = smoothstep(0.0, 0.065, height01);
    float floorFade = 1.0 - smoothstep(0.72, 1.0, height01);

    // Four authored density zones replace expensive interpolated 3D noise.
    // Ordered dither is limited to each zone transition and stays on the mesh.
    float bandCoord = clamp(height01 * 4.0, 0.0, 3.999);
    float band = floor(bandCoord);
    float nextBand = min(band + 1.0, 3.0);
    vec2 ditherCell = vec2(vBeamUv.x * 32.0, vBeamUv.y * 24.0);
    float threshold = bayer4(ditherCell);
    float transition = smoothstep(0.8, 1.0, fract(bandCoord));
    float densityBand = mix(
      retroDensityBand(band),
      retroDensityBand(nextBand),
      step(threshold, transition)
    );

    float alpha = clamp(uStrength * 3.35 * viewDensity * densityBand * sourceFade * floorFade, 0.0, 0.42);
    if (alpha < 0.002) discard;

    // A fixed dungeon-space light vector creates broad faceted value changes.
    // Quantizing after that modulation keeps the shaft inside a 15-bit-era
    // color vocabulary before the renderer's standard output transform.
    vec3 facetLightDirection = normalize(vec3(-0.42, 0.14, 0.9));
    float facetLight = dot(normalize(vWorldNormal), facetLightDirection) * 0.5 + 0.5;
    facetLight = floor(clamp(facetLight * 3.0, 0.0, 2.999)) * 0.5;
    vec3 col = quantize5Bit(uColor * mix(0.82, 1.06, facetLight));
    gl_FragColor = vec4(col, alpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
#else
    // Signal beams retain the smoother portal/stone vocabulary. This avoids
    // applying the ambient PSone profile to authored gameplay indicators.
    float volumeFacing = smoothstep(0.04, 0.78, facing);

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
    float alpha = 1.0 - exp(-max(opticalDepth, 0.0));
    if (alpha < 0.002) discard;

    vec3 col = uColor * mix(0.84, 1.08, broadNoise);
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
#endif
  }
`;

export interface VolumetricBeamOptions {
  /** Use the subdued environment path for ambient shafts. */
  readonly role?: "signal" | "ambient";
  /** Defaults to additive for existing portal and stone signals. */
  readonly blending?: THREE.Blending;
  /** Scene fog is enabled for ambient shafts, disabled for authored beacons. */
  readonly fog?: boolean;
  /** Ambient shafts should participate in the scene's exposure/tone response. */
  readonly toneMapped?: boolean;
  /** Radius at the ceiling opening; defaults to a small non-zero source. */
  readonly topRadius?: number;
}

function makeBeamMaterial(
  color: number,
  strength: number,
  height: number,
  options: VolumetricBeamOptions,
): THREE.ShaderMaterial {
  const ambient = options.role === "ambient";
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
      },
    ]),
    defines: ambient ? { AMBIENT_RETRO_PROFILE: 1 } : {},
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: ambient ? THREE.BackSide : THREE.DoubleSide,
    blending: options.blending ?? THREE.AdditiveBlending,
    toneMapped: options.toneMapped ?? false,
    fog: options.fog ?? false,
  });
  material.forceSinglePass = true;
  material.name = `${ambient ? "Retro ambient world" : "World"} volumetric beam material`;
  material.userData.volumetricSpace = "world";
  material.userData.screenSpace = false;
  return material;
}

function makeBeamGeometry(
  sourceRadius: number,
  bottomRadius: number,
  height: number,
  ambient: boolean,
): THREE.BufferGeometry {
  if (!ambient) {
    const geometry = new THREE.CylinderGeometry(sourceRadius, bottomRadius, height, 20, 8, true);
    geometry.translate(0, -height / 2, 0);
    geometry.userData.radialSegments = 20;
    geometry.userData.heightSegments = 8;
    geometry.userData.triangles = 320;
    return geometry;
  }

  const indexed = new THREE.CylinderGeometry(sourceRadius, bottomRadius, height, 8, 4, true);
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  geometry.translate(0, -height / 2, 0);
  geometry.computeVertexNormals();
  geometry.name = "Eight-sided retro ambient light shaft";
  geometry.userData.radialSegments = 8;
  geometry.userData.heightSegments = 4;
  geometry.userData.triangles = 64;
  geometry.userData.flatFacets = true;
  return geometry;
}

/** Advance shared beam time (call once per frame from world update if desired). */
export function tickVolumetricBeamTime(mesh: THREE.Mesh, time: number): void {
  const material = mesh.material;
  if (material instanceof THREE.ShaderMaterial && material.uniforms.uTime) {
    material.uniforms.uTime.value = time;
  }
}

export function createVolumetricBeam(
  color = 0xb8b4a8,
  height = 4.2,
  radius = 1.25,
  strength = 0.24,
  options: VolumetricBeamOptions = {},
): THREE.Mesh {
  const shaftHeight = Math.max(0.1, height);
  const bottomRadius = Math.max(0.02, radius);
  const sourceRadius = Math.max(0.04, options.topRadius ?? Math.min(bottomRadius * 0.24, 0.28));
  const ambient = options.role === "ambient";
  const geometry = makeBeamGeometry(sourceRadius, bottomRadius, shaftHeight, ambient);
  const material = makeBeamMaterial(color, strength, shaftHeight, options);
  const beam = new THREE.Mesh(geometry, material);
  beam.name = "World-space volumetric light shaft";
  beam.renderOrder = 0;
  beam.userData.isVolumetricBeam = true;
  beam.userData.volumetricSpace = "world";
  beam.userData.screenSpace = false;
  beam.userData.beamRole = options.role ?? "signal";
  beam.userData.profile = ambient ? "retro-faceted" : "signal-smooth";
  beam.userData.sourceRadius = sourceRadius;
  beam.userData.bottomRadius = bottomRadius;
  beam.userData.height = shaftHeight;
  return beam;
}
