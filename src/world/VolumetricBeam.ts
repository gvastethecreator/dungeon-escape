import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  float bayer(vec2 p) {
    vec2 f = mod(floor(p), 4.0);
    return mod(f.x * 2.0 + f.y * 3.0, 4.0) / 4.0;
  }

  // Cheap value noise for soft shaft grit (not a full volume march).
  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    float edge = smoothstep(0.0, 0.28, vUv.x) * smoothstep(1.0, 0.72, vUv.x);
    // Stronger near source (uv.y ~ 0 after cylinder orientation) tapering out.
    float falloff = pow(1.0 - vUv.y, 1.35) * edge;
    float grit = hash21(vWorldPos.xz * 0.55 + uTime * 0.07) * 0.12;
    float alpha = falloff * uStrength * (0.92 + grit);
    // 8-band dither keeps the shaft readable at low opacity without milky blur.
    alpha = floor((alpha + bayer(gl_FragCoord.xy) * 0.08) * 8.0) / 8.0;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function makeBeamMaterial(color: number, strength: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
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
): THREE.Mesh {
  // Enari-style tapered cylinder; dithered alpha keeps an 8-bit shaft read.
  const geometry = new THREE.CylinderGeometry(0.05, radius, height, 12, 4, true);
  geometry.translate(0, -height / 2, 0);
  const material = makeBeamMaterial(color, strength);
  const beam = new THREE.Mesh(geometry, material);
  beam.name = "Dithered volumetric beam";
  beam.renderOrder = 4;
  beam.userData.isVolumetricBeam = true;
  return beam;
}
