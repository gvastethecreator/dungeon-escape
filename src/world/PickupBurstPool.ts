import * as THREE from "three";
import type { PointsNodeMaterial } from "three/webgpu";
import {
  getShaderProgramModeRegistry,
  onShaderProgramModeRegistryChange,
  type ShaderProgramMode,
} from "../systems/ShaderProgramMode";
import { requireTslBuilder } from "../systems/TslMaterialModules";

export type PickupBurstKind =
  | "stone"
  | "resolve"
  | "time-freeze"
  | "luminous-ward"
  | "annihilation-pulse"
  | "cull-brand"
  | "shotgun"
  | "phoenix-egg"
  | "map"
  | "mobility"
  | "clarity"
  | "swarm-curse"
  | "slow-curse"
  | "frenzy-curse"
  | "gloom-curse"
  | "mirror-curse"
  | "spin-curse";

type PickupBurstMotion =
  | "bind"
  | "restore"
  | "freeze"
  | "shield"
  | "shockwave"
  | "reveal"
  | "fountain"
  | "swarm"
  | "drag"
  | "eruption"
  | "collapse";

type PickupSparkShape =
  | "diamond"
  | "droplet"
  | "crystal"
  | "orb"
  | "splinter"
  | "compass"
  | "rune"
  | "thorn"
  | "clock"
  | "flame"
  | "void";

interface PickupBurstProfile {
  motion: PickupBurstMotion;
  shape: PickupSparkShape;
  duration: number;
  ringStart: number;
  ringEnd: number;
  ringPeakOpacity: number;
  echoPeakOpacity: number;
  sparkPeakOpacity: number;
  pointSize: number;
  rootLift: number;
  ringTilt: number;
  echoTilt: number;
  ringSpin: number;
  echoDelay: number;
}

interface PickupBurstSlot {
  root: THREE.Group;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  echo: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  sparks: THREE.Points | THREE.Sprite;
  sparkPositionAttribute: THREE.BufferAttribute | THREE.InstancedBufferAttribute;
  active: boolean;
  age: number;
  originY: number;
  profile: PickupBurstProfile;
}

export const BURST_COLORS: Readonly<Record<PickupBurstKind, number>> = {
  stone: 0xc9b97b,
  resolve: 0xb52a3d,
  "time-freeze": 0x72e7ef,
  "luminous-ward": 0xb9e879,
  "annihilation-pulse": 0xff5d86,
  "cull-brand": 0xff7a3a,
  shotgun: 0x8aa0b4,
  "phoenix-egg": 0xff9a3a,
  map: 0xd5bd7a,
  mobility: 0x72d45f,
  clarity: 0xa8d8ef,
  "swarm-curse": 0x8b1e1e,
  "slow-curse": 0x6a6a8a,
  "frenzy-curse": 0xc45a1a,
  "gloom-curse": 0x2a2a38,
  "mirror-curse": 0x7ec8e8,
  "spin-curse": 0xc07ae0,
};

export const BURST_PROFILES: Readonly<Record<PickupBurstKind, PickupBurstProfile>> = {
  stone: {
    motion: "bind",
    shape: "diamond",
    duration: 0.92,
    ringStart: 0.9,
    ringEnd: 8.4,
    ringPeakOpacity: 0.94,
    echoPeakOpacity: 0.62,
    sparkPeakOpacity: 1,
    pointSize: 0.13,
    rootLift: 2.2,
    ringTilt: 0,
    echoTilt: 0,
    ringSpin: 0.72,
    echoDelay: 0.14,
  },
  resolve: {
    motion: "restore",
    shape: "droplet",
    duration: 0.88,
    ringStart: 1,
    ringEnd: 7.2,
    ringPeakOpacity: 0.78,
    echoPeakOpacity: 0.4,
    sparkPeakOpacity: 0.98,
    pointSize: 0.14,
    rootLift: 2.35,
    ringTilt: 0.18,
    echoTilt: -0.18,
    ringSpin: 0.48,
    echoDelay: 0.18,
  },
  "time-freeze": {
    motion: "freeze",
    shape: "crystal",
    duration: 1.02,
    ringStart: 0.82,
    ringEnd: 5.4,
    ringPeakOpacity: 0.62,
    echoPeakOpacity: 0.36,
    sparkPeakOpacity: 1,
    pointSize: 0.155,
    rootLift: 1.9,
    ringTilt: 0.45,
    echoTilt: -0.45,
    ringSpin: -1.45,
    echoDelay: 0.1,
  },
  "luminous-ward": {
    motion: "shield",
    shape: "orb",
    duration: 1.05,
    ringStart: 1.05,
    ringEnd: 6.2,
    ringPeakOpacity: 0.64,
    echoPeakOpacity: 0.42,
    sparkPeakOpacity: 0.98,
    pointSize: 0.145,
    rootLift: 2.05,
    ringTilt: 0.1,
    echoTilt: -0.12,
    ringSpin: 1.35,
    echoDelay: 0.16,
  },
  "annihilation-pulse": {
    motion: "shockwave",
    shape: "splinter",
    duration: 0.9,
    ringStart: 0.78,
    ringEnd: 9.6,
    ringPeakOpacity: 0.96,
    echoPeakOpacity: 0.72,
    sparkPeakOpacity: 1,
    pointSize: 0.17,
    rootLift: 1.85,
    ringTilt: 0,
    echoTilt: 0.12,
    ringSpin: 2.4,
    echoDelay: 0.1,
  },
  "cull-brand": {
    motion: "shockwave",
    shape: "thorn",
    duration: 0.86,
    ringStart: 0.7,
    ringEnd: 6.8,
    ringPeakOpacity: 0.9,
    echoPeakOpacity: 0.58,
    sparkPeakOpacity: 1,
    pointSize: 0.15,
    rootLift: 1.9,
    ringTilt: 0.08,
    echoTilt: -0.1,
    ringSpin: 1.8,
    echoDelay: 0.1,
  },
  shotgun: {
    motion: "shockwave",
    shape: "splinter",
    duration: 0.82,
    ringStart: 0.62,
    ringEnd: 7.4,
    ringPeakOpacity: 0.88,
    echoPeakOpacity: 0.5,
    sparkPeakOpacity: 1,
    pointSize: 0.14,
    rootLift: 1.7,
    ringTilt: 0.04,
    echoTilt: 0.08,
    ringSpin: 1.55,
    echoDelay: 0.09,
  },
  "phoenix-egg": {
    motion: "fountain",
    shape: "flame",
    duration: 1.12,
    ringStart: 0.85,
    ringEnd: 8.2,
    ringPeakOpacity: 0.92,
    echoPeakOpacity: 0.66,
    sparkPeakOpacity: 1,
    pointSize: 0.18,
    rootLift: 2.4,
    ringTilt: 0.2,
    echoTilt: -0.25,
    ringSpin: 2.6,
    echoDelay: 0.12,
  },
  map: {
    motion: "reveal",
    shape: "compass",
    duration: 1,
    ringStart: 1,
    ringEnd: 7.4,
    ringPeakOpacity: 0.84,
    echoPeakOpacity: 0.52,
    sparkPeakOpacity: 1,
    pointSize: 0.145,
    rootLift: 2,
    ringTilt: 0,
    echoTilt: 0,
    ringSpin: 2.1,
    echoDelay: 0.22,
  },
  mobility: {
    motion: "fountain",
    shape: "orb",
    duration: 1.08,
    ringStart: 0.95,
    ringEnd: 7,
    ringPeakOpacity: 0.72,
    echoPeakOpacity: 0.48,
    sparkPeakOpacity: 1,
    pointSize: 0.16,
    rootLift: 2.55,
    ringTilt: 0.92,
    echoTilt: -0.92,
    ringSpin: 1.95,
    echoDelay: 0.15,
  },
  clarity: {
    motion: "reveal",
    shape: "rune",
    duration: 0.95,
    ringStart: 0.98,
    ringEnd: 7.1,
    ringPeakOpacity: 0.78,
    echoPeakOpacity: 0.46,
    sparkPeakOpacity: 0.98,
    pointSize: 0.14,
    rootLift: 2.2,
    ringTilt: 0.36,
    echoTilt: -0.36,
    ringSpin: -1.3,
    echoDelay: 0.2,
  },
  "swarm-curse": {
    motion: "swarm",
    shape: "thorn",
    duration: 1.08,
    ringStart: 0.88,
    ringEnd: 7.6,
    ringPeakOpacity: 0.8,
    echoPeakOpacity: 0.52,
    sparkPeakOpacity: 1,
    pointSize: 0.145,
    rootLift: 2,
    ringTilt: 0.5,
    echoTilt: -0.5,
    ringSpin: 3.8,
    echoDelay: 0.12,
  },
  "slow-curse": {
    motion: "drag",
    shape: "clock",
    duration: 1.18,
    ringStart: 7.2,
    ringEnd: 1.05,
    ringPeakOpacity: 0.74,
    echoPeakOpacity: 0.44,
    sparkPeakOpacity: 0.94,
    pointSize: 0.15,
    rootLift: 1.55,
    ringTilt: 0.34,
    echoTilt: -0.34,
    ringSpin: -0.7,
    echoDelay: 0.08,
  },
  "frenzy-curse": {
    motion: "eruption",
    shape: "flame",
    duration: 0.95,
    ringStart: 0.78,
    ringEnd: 8.8,
    ringPeakOpacity: 0.9,
    echoPeakOpacity: 0.62,
    sparkPeakOpacity: 1,
    pointSize: 0.165,
    rootLift: 2.45,
    ringTilt: 0.42,
    echoTilt: -0.42,
    ringSpin: 3.1,
    echoDelay: 0.08,
  },
  "gloom-curse": {
    motion: "collapse",
    shape: "void",
    duration: 1.12,
    ringStart: 7.8,
    ringEnd: 0.7,
    ringPeakOpacity: 0.86,
    echoPeakOpacity: 0.64,
    sparkPeakOpacity: 0.96,
    pointSize: 0.175,
    rootLift: 1.4,
    ringTilt: 0.68,
    echoTilt: -0.68,
    ringSpin: -2.5,
    echoDelay: 0.04,
  },
  "mirror-curse": {
    motion: "freeze",
    shape: "crystal",
    duration: 1.05,
    ringStart: 0.9,
    ringEnd: 6.4,
    ringPeakOpacity: 0.78,
    echoPeakOpacity: 0.5,
    sparkPeakOpacity: 1,
    pointSize: 0.15,
    rootLift: 1.85,
    ringTilt: 0.55,
    echoTilt: -0.55,
    ringSpin: -2.2,
    echoDelay: 0.1,
  },
  "spin-curse": {
    motion: "swarm",
    shape: "orb",
    duration: 1,
    ringStart: 0.85,
    ringEnd: 7.2,
    ringPeakOpacity: 0.82,
    echoPeakOpacity: 0.55,
    sparkPeakOpacity: 1,
    pointSize: 0.155,
    rootLift: 2.05,
    ringTilt: 0.9,
    echoTilt: -0.9,
    ringSpin: 4.2,
    echoDelay: 0.08,
  },
};

export const SPARK_SHAPE_ID: Readonly<Record<PickupSparkShape, number>> = {
  diamond: 0,
  droplet: 1,
  crystal: 2,
  orb: 3,
  splinter: 4,
  compass: 5,
  rune: 6,
  thorn: 7,
  clock: 8,
  flame: 9,
  void: 10,
};

const SPARK_COUNT = 36;
const SPARK_CORE_LIGHT = new THREE.Color(0xffffff);

/** ShaderProgramMode factory id for pickup burst spark particles. */
export const PICKUP_BURST_SPARKS_SHADER_FACTORY_ID = "pickup-burst-sparks";

/** Register (or refresh) dual-mode support on the active shader program registry. */
export function registerPickupBurstSparksShaderFactory(
  registry = getShaderProgramModeRegistry(),
): void {
  registry.register({
    id: PICKUP_BURST_SPARKS_SHADER_FACTORY_ID,
    supports: ["glsl", "tsl"],
  });
}

registerPickupBurstSparksShaderFactory();
onShaderProgramModeRegistryChange(registerPickupBurstSparksShaderFactory);

export type PickupSparkUniforms = {
  uColor: { value: THREE.Color };
  uCoreColor: { value: THREE.Color };
  uOpacity: { value: number };
  uPointSize: { value: number };
  uShape: { value: number };
  uTime: { value: number };
  uIntensity: { value: number };
};

export type PickupSparkMaterial = (THREE.ShaderMaterial | PointsNodeMaterial) & {
  uniforms: PickupSparkUniforms;
};

function createSparkMaterialGlsl(): PickupSparkMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uColor: { value: new THREE.Color(BURST_COLORS.stone) },
        uCoreColor: { value: new THREE.Color(0xffffff) },
        uOpacity: { value: 0 },
        uPointSize: { value: BURST_PROFILES.stone.pointSize },
        uShape: { value: SPARK_SHAPE_ID.diamond },
        uTime: { value: 0 },
        uIntensity: { value: 1.18 },
      },
    ]),
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uPointSize;
      uniform float uTime;
      varying float vSeed;
      varying float vPulse;
      #include <fog_pars_vertex>

      void main() {
        vSeed = aSeed;
        float phase = aSeed * 6.2831853;
        vPulse = 0.84 + 0.16 * sin(uTime * (1.2 + aSeed * 0.8) + phase);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(
          uPointSize * (0.92 + aSeed * 0.58) * (0.92 + vPulse * 0.16) *
            (280.0 / max(0.55, -mvPosition.z)),
          2.0,
          42.0
        );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uCoreColor;
      uniform float uOpacity;
      uniform float uShape;
      uniform float uIntensity;
      varying float vSeed;
      varying float vPulse;
      #include <fog_pars_fragment>

      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float angle = vSeed * 6.2831853;
        float cs = cos(angle);
        float sn = sin(angle);
        uv = mat2(cs, -sn, sn, cs) * uv;
        float d = length(uv);
        float mask = 0.0;

        if (uShape < 0.5) {
          float diamond = abs(uv.x) + abs(uv.y);
          float core = 1.0 - smoothstep(0.24, 0.48, diamond);
          float glint = 1.0 - smoothstep(0.025, 0.07, min(abs(uv.x), abs(uv.y)));
          mask = max(core, glint * smoothstep(0.48, 0.16, d));
        } else if (uShape < 1.5) {
          vec2 drop = vec2(uv.x * 1.7, uv.y * 0.82 + 0.09);
          float body = smoothstep(0.43, 0.08, length(drop));
          float tip = smoothstep(0.2, 0.02, length(vec2(uv.x * 2.6, uv.y + 0.3)));
          mask = max(body, tip) * smoothstep(0.5, 0.13, abs(uv.x));
        } else if (uShape < 2.5) {
          float crystal = abs(uv.x) * 2.5 + abs(uv.y) * 0.72;
          float body = 1.0 - smoothstep(0.28, 0.48, crystal);
          float glint = 1.0 - smoothstep(0.018, 0.055, min(abs(uv.x), abs(uv.y)));
          mask = max(body, glint * smoothstep(0.44, 0.12, d));
        } else if (uShape < 3.5) {
          float core = smoothstep(0.38, 0.06, d);
          float rim = 1.0 - smoothstep(0.035, 0.085, abs(d - 0.31));
          mask = max(core * 0.82, rim * 0.72);
        } else if (uShape < 4.5) {
          float shard = length(vec2(uv.x * 3.8, uv.y * 0.78));
          mask = smoothstep(0.48, 0.08, shard);
        } else if (uShape < 5.5) {
          float ring = 1.0 - smoothstep(0.025, 0.07, abs(d - 0.28));
          float cross = 1.0 - smoothstep(0.025, 0.06, min(abs(uv.x), abs(uv.y)));
          mask = max(ring * 0.72, cross * smoothstep(0.45, 0.12, d));
        } else if (uShape < 6.5) {
          float box = max(abs(uv.x), abs(uv.y));
          float frame = 1.0 - smoothstep(0.025, 0.065, abs(box - 0.29));
          float slash = 1.0 - smoothstep(0.025, 0.065, abs(uv.x + uv.y * 0.42));
          mask = max(frame * 0.8, slash * smoothstep(0.42, 0.14, d));
        } else if (uShape < 7.5) {
          float cardinal = 1.0 - smoothstep(0.035, 0.085, min(abs(uv.x), abs(uv.y)));
          float diagonal = 1.0 - smoothstep(0.03, 0.075, min(abs(uv.x + uv.y), abs(uv.x - uv.y)));
          mask = max(cardinal, diagonal * 0.72) * smoothstep(0.48, 0.16, d);
        } else if (uShape < 8.5) {
          float ring = 1.0 - smoothstep(0.025, 0.065, abs(d - 0.3));
          float handA = 1.0 - smoothstep(0.02, 0.055, abs(uv.x));
          float handB = 1.0 - smoothstep(0.02, 0.055, abs(uv.x + uv.y));
          mask = max(ring * 0.72, max(handA, handB) * smoothstep(0.31, 0.04, d));
        } else if (uShape < 9.5) {
          vec2 flame = vec2(uv.x * (1.55 + max(uv.y, 0.0)), uv.y * 0.86 + 0.08);
          float body = smoothstep(0.42, 0.08, length(flame));
          float split = smoothstep(0.08, 0.16, abs(uv.x + sin(uv.y * 9.0) * 0.04));
          mask = body * mix(0.55, 1.0, split);
        } else {
          float outer = 1.0 - smoothstep(0.035, 0.085, abs(d - 0.31));
          float inner = smoothstep(0.14, 0.05, d) * 0.42;
          mask = max(outer, inner);
        }

        float edge = smoothstep(0.0, 0.16, mask);
        float core = (1.0 - smoothstep(0.2, 0.02, d)) * edge;
        float halo = (1.0 - smoothstep(0.5, 0.12, d)) * edge;
        vec3 sparkColor = mix(uColor, uCoreColor, core * 0.82);
        sparkColor += uCoreColor * halo * (0.08 + vPulse * 0.12);
        sparkColor *= uIntensity;
        float alpha = edge * uOpacity * (0.84 + vPulse * 0.16);
        if (alpha < 0.015) discard;
        gl_FragColor = vec4(sparkColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
        #include <premultiplied_alpha_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: true,
    fog: true,
  });
  material.userData.shaderProgramMode = "glsl";
  material.userData.pickupBurstSparks = true;
  material.userData.sparkPrimitive = "points";
  return material as PickupSparkMaterial;
}

function createSparkObject(
  positionAttribute: THREE.BufferAttribute | THREE.InstancedBufferAttribute,
  seedAttribute: THREE.BufferAttribute | THREE.InstancedBufferAttribute,
  mode: ShaderProgramMode,
): THREE.Points | THREE.Sprite {
  if (mode === "tsl") {
    const build = requireTslBuilder<typeof import("./PickupBurstPool.tsl").createSparkMaterialTsl>(
      PICKUP_BURST_SPARKS_SHADER_FACTORY_ID,
    );
    const material = build(
      positionAttribute as THREE.InstancedBufferAttribute,
      seedAttribute as THREE.InstancedBufferAttribute,
    );
    const sprite = new THREE.Sprite(material as unknown as THREE.SpriteMaterial);
    sprite.name = "Pickup rising sparks";
    sprite.count = SPARK_COUNT;
    // Spark offsets only exist in the node graph, so the origin-quad bounds
    // would cull the burst as soon as the pickup nears the screen edge.
    sprite.frustumCulled = false;
    sprite.userData.sparkPrimitive = "sprite";
    return sprite;
  }

  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", positionAttribute);
  sparkGeometry.setAttribute("aSeed", seedAttribute);
  return new THREE.Points(sparkGeometry, createSparkMaterialGlsl());
}

function createSlot(index: number, mode: ShaderProgramMode): PickupBurstSlot {
  const root = new THREE.Group();
  root.name = `Pooled pickup burst ${index + 1}`;
  root.visible = false;

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: BURST_COLORS.stone,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const ringGeometry = new THREE.RingGeometry(0.22, 0.34, 32);
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.name = "Pickup expanding ring";
  // Pickup FX is spawned at the loot site near the camera.
  ring.frustumCulled = false;

  const echoMaterial = ringMaterial.clone();
  echoMaterial.opacity = 0;
  const echo = new THREE.Mesh(ringGeometry, echoMaterial);
  echo.name = "Pickup secondary echo ring";
  // Secondary echo shares the pickup burst origin.
  echo.frustumCulled = false;

  const positions = new Float32Array(SPARK_COUNT * 3);
  const seeds = new Float32Array(SPARK_COUNT);
  for (let particle = 0; particle < SPARK_COUNT; particle += 1) {
    seeds[particle] = (particle * 0.6180339887 + index * 0.137) % 1;
  }
  const sparkGeometry = new THREE.BufferGeometry();
  const positionAttribute =
    mode === "tsl"
      ? new THREE.InstancedBufferAttribute(positions, 3)
      : new THREE.BufferAttribute(positions, 3);
  const seedAttribute =
    mode === "tsl"
      ? new THREE.InstancedBufferAttribute(seeds, 1)
      : new THREE.BufferAttribute(seeds, 1);
  sparkGeometry.setAttribute("position", positionAttribute);
  sparkGeometry.setAttribute("aSeed", seedAttribute);
  const sparks = createSparkObject(positionAttribute, seedAttribute, mode);
  sparks.name = "Pickup rising sparks";
  // Rising sparks are short-lived camera-near VFX.
  sparks.frustumCulled = false;
  sparks.renderOrder = 5;

  root.add(ring, echo, sparks);
  return {
    root,
    ring,
    echo,
    sparks,
    sparkPositionAttribute: positionAttribute,
    active: false,
    age: 0,
    originY: 0,
    profile: BURST_PROFILES.stone,
  };
}

function writeSparkPositions(slot: PickupBurstSlot, progress: number): void {
  const attr = slot.sparkPositionAttribute;
  const motion = slot.profile.motion;
  for (let particle = 0; particle < attr.count; particle += 1) {
    const seed = (particle * 0.6180339887) % 1;
    const angle = (particle / attr.count) * Math.PI * 2 + seed * 0.72;
    const wave = Math.sin(progress * Math.PI);
    const wobble = Math.sin(progress * 8 + seed * Math.PI * 2);
    let x = 0;
    let y = 0.08;
    let z = 0;

    switch (motion) {
      case "bind": {
        const radius = 0.12 + progress * (1.15 + seed * 0.62);
        x = Math.cos(angle + progress * 0.55) * radius;
        z = Math.sin(angle + progress * 0.55) * radius;
        y = 0.12 + wave * (0.62 + seed * 0.42) + progress * 0.38;
        break;
      }
      case "restore": {
        const radius = 0.12 + wave * (0.28 + seed * 0.28);
        x = Math.cos(angle + progress * 1.4) * radius;
        z = Math.sin(angle + progress * 1.4) * radius;
        y = 0.08 + progress * (1.15 + seed * 0.72);
        break;
      }
      case "freeze": {
        const staggered = THREE.MathUtils.clamp(progress * 1.12 - seed * 0.1, 0, 1);
        const radius = 0.12 + staggered * (0.95 + seed * 0.68);
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        y = 0.85 - staggered * (0.72 + seed * 0.38) + wobble * 0.04;
        break;
      }
      case "shield": {
        const radius = 0.24 + progress * (0.78 + seed * 0.48);
        const orbit = angle + progress * (2.2 + seed * 1.4);
        x = Math.cos(orbit) * radius;
        z = Math.sin(orbit) * radius;
        y = 0.28 + progress * 0.78 + Math.sin(orbit * 2) * (0.12 + wave * 0.2);
        break;
      }
      case "shockwave": {
        const radius = 0.1 + progress * (1.85 + seed * 0.9);
        x = Math.cos(angle + seed * progress) * radius;
        z = Math.sin(angle + seed * progress) * radius;
        y = 0.12 + wave * (0.28 + seed * 0.32) - progress * 0.06;
        break;
      }
      case "reveal": {
        const arm = particle % 4;
        const direction = arm * (Math.PI / 2);
        const distance = 0.12 + progress * (1.15 + seed * 0.7);
        const lateral = Math.sin(seed * 17 + progress * 4) * 0.12 * wave;
        x = Math.cos(direction) * distance + Math.cos(direction + Math.PI / 2) * lateral;
        z = Math.sin(direction) * distance + Math.sin(direction + Math.PI / 2) * lateral;
        y = 0.12 + wave * 0.36 + (particle % 3) * 0.055;
        break;
      }
      case "fountain": {
        const radius = 0.08 + progress * (0.52 + seed * 0.48);
        x = Math.cos(angle + progress * 1.8) * radius;
        z = Math.sin(angle + progress * 1.8) * radius;
        y = 0.08 + wave * (1.45 + seed * 0.85) - progress * 0.12;
        break;
      }
      case "swarm": {
        const radius = 0.16 + progress * (0.78 + seed * 0.62);
        const orbit = angle + progress * (3.8 + seed * 3.2);
        x = Math.cos(orbit) * radius;
        z = Math.sin(orbit) * radius;
        y = 0.24 + wave * 0.52 + wobble * (0.14 + seed * 0.1);
        break;
      }
      case "drag": {
        const radius = 1.45 * (1 - progress) + 0.12 + seed * 0.2;
        x = Math.cos(angle - progress * 0.45) * radius;
        z = Math.sin(angle - progress * 0.45) * radius;
        y = 1.1 * (1 - progress) + progress * 0.35 - progress * (0.12 + seed * 0.16);
        break;
      }
      case "eruption": {
        const radius = 0.08 + progress * (0.68 + seed * 0.68);
        x = Math.cos(angle + wobble * 0.16) * radius;
        z = Math.sin(angle + wobble * 0.16) * radius;
        y = 0.08 + wave * (1.4 + seed * 0.9) + progress * 0.4;
        break;
      }
      case "collapse": {
        const radius = 1.65 * (1 - progress) + 0.05 + seed * 0.12;
        const orbit = angle - progress * (2.4 + seed * 1.6);
        x = Math.cos(orbit) * radius;
        z = Math.sin(orbit) * radius;
        y = 0.55 * (1 - progress) + wobble * 0.1 + progress * 0.2;
        break;
      }
    }

    attr.setXYZ(particle, x, y, z);
  }
  attr.needsUpdate = true;
}

export class PickupBurstPool {
  readonly root = new THREE.Group();
  private readonly slots: PickupBurstSlot[];

  constructor(capacity = 4, mode?: ShaderProgramMode) {
    registerPickupBurstSparksShaderFactory();
    const registry = getShaderProgramModeRegistry();
    const resolved = mode ?? registry.mode;
    registry.require(PICKUP_BURST_SPARKS_SHADER_FACTORY_ID, resolved);
    this.root.name = "Pickup burst pool";
    this.root.userData.shaderProgramMode = resolved;
    this.root.userData.pickupBurstSparksFactoryId = PICKUP_BURST_SPARKS_SHADER_FACTORY_ID;
    this.slots = Array.from({ length: Math.max(1, capacity) }, (_, index) =>
      createSlot(index, resolved),
    );
    this.root.add(...this.slots.map((slot) => slot.root));
  }

  get activeCount(): number {
    return this.slots.filter((slot) => slot.active).length;
  }

  trigger(position: THREE.Vector3Like, kind: PickupBurstKind, colorOverride?: number): void {
    const slot = this.slots.find((candidate) => !candidate.active) ?? this.slots[0]!;
    const profile = BURST_PROFILES[kind];
    const color = colorOverride ?? BURST_COLORS[kind];
    slot.active = true;
    slot.age = 0;
    slot.originY = position.y;
    slot.profile = profile;
    slot.root.visible = true;
    slot.root.position.copy(position);
    slot.root.rotation.set(0, position.x * 0.17 + position.z * 0.11, 0);
    slot.root.scale.setScalar(1);
    slot.root.userData.pickupBurstKind = kind;
    slot.root.userData.pickupBurstMotion = profile.motion;
    slot.root.userData.pickupSparkShape = profile.shape;

    slot.ring.material.color.setHex(color);
    slot.ring.material.opacity = profile.ringPeakOpacity;
    slot.ring.rotation.set(-Math.PI / 2 + profile.ringTilt, 0, 0);
    slot.ring.scale.setScalar(profile.ringStart);

    slot.echo.material.color.setHex(color).offsetHSL(0, -0.08, 0.14);
    slot.echo.material.opacity = 0;
    slot.echo.rotation.set(-Math.PI / 2 + profile.echoTilt, 0, Math.PI / 4);
    slot.echo.scale.setScalar(profile.ringStart * 0.72);

    const uniforms = (slot.sparks.material as PickupSparkMaterial).uniforms;
    uniforms.uColor.value.setHex(color);
    uniforms.uCoreColor.value.setHex(color).lerp(SPARK_CORE_LIGHT, 0.72);
    uniforms.uOpacity.value = profile.sparkPeakOpacity;
    uniforms.uPointSize.value = profile.pointSize;
    uniforms.uShape.value = SPARK_SHAPE_ID[profile.shape];
    uniforms.uTime.value = 0;
    uniforms.uIntensity.value = 1.18;
    writeSparkPositions(slot, 0);
  }

  update(delta: number): void {
    const safeDelta = Math.max(0, Number.isFinite(delta) ? delta : 0);
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.age += safeDelta;
      const profile = slot.profile;
      const progress = THREE.MathUtils.clamp(slot.age / profile.duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const ringScale = THREE.MathUtils.lerp(profile.ringStart, profile.ringEnd, eased);
      const echoProgress = THREE.MathUtils.clamp(
        (progress - profile.echoDelay) / Math.max(0.001, 1 - profile.echoDelay),
        0,
        1,
      );

      slot.root.position.y = slot.originY + profile.rootLift * eased;
      slot.ring.scale.setScalar(ringScale);
      slot.ring.rotation.y += safeDelta * profile.ringSpin;
      slot.ring.material.opacity = Math.pow(1 - progress, 1.15) * profile.ringPeakOpacity;

      slot.echo.scale.setScalar(
        THREE.MathUtils.lerp(profile.ringStart * 0.72, profile.ringEnd * 0.86, echoProgress),
      );
      slot.echo.rotation.y -= safeDelta * profile.ringSpin * 0.72;
      slot.echo.material.opacity =
        Math.sin(echoProgress * Math.PI) * profile.echoPeakOpacity * (1 - progress * 0.35);

      const uniforms = (slot.sparks.material as PickupSparkMaterial).uniforms;
      uniforms.uOpacity.value = Math.pow(1 - progress, 0.82) * profile.sparkPeakOpacity;
      uniforms.uPointSize.value = profile.pointSize * (1 - progress * 0.22);
      uniforms.uTime.value = slot.age;
      writeSparkPositions(slot, progress);

      if (progress < 1) continue;
      slot.active = false;
      slot.root.visible = false;
    }
  }

  setWarmupVisible(visible: boolean, position: THREE.Vector3Like): void {
    for (const slot of this.slots) {
      if (slot.active) continue;
      slot.root.position.copy(position);
      slot.root.scale.setScalar(0.001);
      slot.ring.material.opacity = 0;
      slot.echo.material.opacity = 0;
      (slot.sparks.material as PickupSparkMaterial).uniforms.uOpacity.value = 0;
      slot.root.visible = visible;
    }
  }

  dispose(): void {
    for (const slot of this.slots) {
      slot.ring.geometry.dispose();
      slot.ring.material.dispose();
      slot.echo.material.dispose();
      if (slot.sparks instanceof THREE.Points) slot.sparks.geometry.dispose();
      const sparkMaterial = slot.sparks.material;
      if (Array.isArray(sparkMaterial)) {
        for (const entry of sparkMaterial) entry.dispose();
      } else {
        sparkMaterial.dispose();
      }
    }
    this.root.clear();
  }
}
