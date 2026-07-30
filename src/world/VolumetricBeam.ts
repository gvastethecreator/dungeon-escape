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

  void main() {
    vLocalPos = position;
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

  // Stable 3D value noise. The sample position is in world space so the
  // texture moves with the dungeon instead of sticking to the framebuffer.
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

  void main() {
    float height01 = clamp(-vLocalPos.y / max(uHeight, 0.001), 0.0, 1.0);

    // A shaft is a volume seen through its camera-facing side. This avoids the
    // old UV seam mask, which exposed one hard triangular card to the camera.
    vec3 toCamera = normalize(cameraPosition - vWorldPos);
    float facing = abs(dot(normalize(vWorldNormal), toCamera));
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
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: options.blending ?? THREE.AdditiveBlending,
    toneMapped: options.toneMapped ?? false,
    fog: options.fog ?? false,
  });
  material.name = `${options.role === "ambient" ? "Ambient world" : "World"} volumetric beam material`;
  material.userData.volumetricSpace = "world";
  material.userData.screenSpace = false;
  return material;
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
  // More rings make the radial falloff read as a volume without adding a draw.
  const geometry = new THREE.CylinderGeometry(sourceRadius, bottomRadius, shaftHeight, 20, 8, true);
  // The source sits at local y = 0; the shaft descends into the room.
  geometry.translate(0, -shaftHeight / 2, 0);
  const material = makeBeamMaterial(color, strength, shaftHeight, options);
  const beam = new THREE.Mesh(geometry, material);
  beam.name = "World-space volumetric light shaft";
  beam.renderOrder = 0;
  beam.userData.isVolumetricBeam = true;
  beam.userData.volumetricSpace = "world";
  beam.userData.screenSpace = false;
  beam.userData.beamRole = options.role ?? "signal";
  beam.userData.sourceRadius = sourceRadius;
  beam.userData.bottomRadius = bottomRadius;
  beam.userData.height = shaftHeight;
  return beam;
}
