import * as THREE from "three";

export type PickupBurstKind =
  | "stone"
  | "resolve"
  | "time-freeze"
  | "luminous-ward"
  | "annihilation-pulse"
  | "map"
  | "mobility"
  | "clarity"
  | "swarm-curse"
  | "slow-curse"
  | "frenzy-curse"
  | "gloom-curse";

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
  sparks: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  active: boolean;
  age: number;
  originY: number;
  profile: PickupBurstProfile;
}

const BURST_COLORS: Readonly<Record<PickupBurstKind, number>> = {
  stone: 0xc9b97b,
  resolve: 0xb52a3d,
  "time-freeze": 0x72e7ef,
  "luminous-ward": 0xb9e879,
  "annihilation-pulse": 0xff5d86,
  map: 0xd5bd7a,
  mobility: 0x72d45f,
  clarity: 0xa8d8ef,
  "swarm-curse": 0x8b1e1e,
  "slow-curse": 0x6a6a8a,
  "frenzy-curse": 0xc45a1a,
  "gloom-curse": 0x2a2a38,
};

const BURST_PROFILES: Readonly<Record<PickupBurstKind, PickupBurstProfile>> = {
  stone: {
    motion: "bind",
    shape: "diamond",
    duration: 0.72,
    ringStart: 0.72,
    ringEnd: 5.6,
    ringPeakOpacity: 0.82,
    echoPeakOpacity: 0.46,
    sparkPeakOpacity: 0.96,
    pointSize: 0.074,
    rootLift: 0.32,
    ringTilt: 0,
    echoTilt: 0,
    ringSpin: 0.55,
    echoDelay: 0.16,
  },
  resolve: {
    motion: "restore",
    shape: "droplet",
    duration: 0.68,
    ringStart: 0.82,
    ringEnd: 4.5,
    ringPeakOpacity: 0.62,
    echoPeakOpacity: 0.26,
    sparkPeakOpacity: 0.9,
    pointSize: 0.082,
    rootLift: 0.48,
    ringTilt: 0.18,
    echoTilt: -0.18,
    ringSpin: 0.35,
    echoDelay: 0.22,
  },
  "time-freeze": {
    motion: "freeze",
    shape: "crystal",
    duration: 0.84,
    ringStart: 0.62,
    ringEnd: 2.8,
    ringPeakOpacity: 0.42,
    echoPeakOpacity: 0.2,
    sparkPeakOpacity: 0.98,
    pointSize: 0.1,
    rootLift: 0.12,
    ringTilt: 0.45,
    echoTilt: -0.45,
    ringSpin: -1.25,
    echoDelay: 0.1,
  },
  "luminous-ward": {
    motion: "shield",
    shape: "orb",
    duration: 0.88,
    ringStart: 0.86,
    ringEnd: 3.4,
    ringPeakOpacity: 0.44,
    echoPeakOpacity: 0.28,
    sparkPeakOpacity: 0.92,
    pointSize: 0.09,
    rootLift: 0.24,
    ringTilt: 0.1,
    echoTilt: -0.12,
    ringSpin: 1.2,
    echoDelay: 0.2,
  },
  "annihilation-pulse": {
    motion: "shockwave",
    shape: "splinter",
    duration: 0.7,
    ringStart: 0.58,
    ringEnd: 6.2,
    ringPeakOpacity: 0.86,
    echoPeakOpacity: 0.58,
    sparkPeakOpacity: 1,
    pointSize: 0.11,
    rootLift: 0.08,
    ringTilt: 0,
    echoTilt: 0.12,
    ringSpin: 2.1,
    echoDelay: 0.12,
  },
  map: {
    motion: "reveal",
    shape: "compass",
    duration: 0.82,
    ringStart: 0.8,
    ringEnd: 4.4,
    ringPeakOpacity: 0.68,
    echoPeakOpacity: 0.38,
    sparkPeakOpacity: 0.94,
    pointSize: 0.09,
    rootLift: 0.18,
    ringTilt: 0,
    echoTilt: 0,
    ringSpin: 1.8,
    echoDelay: 0.28,
  },
  mobility: {
    motion: "fountain",
    shape: "orb",
    duration: 0.92,
    ringStart: 0.74,
    ringEnd: 4,
    ringPeakOpacity: 0.52,
    echoPeakOpacity: 0.34,
    sparkPeakOpacity: 0.96,
    pointSize: 0.105,
    rootLift: 0.52,
    ringTilt: 0.92,
    echoTilt: -0.92,
    ringSpin: 1.7,
    echoDelay: 0.18,
  },
  clarity: {
    motion: "reveal",
    shape: "rune",
    duration: 0.76,
    ringStart: 0.78,
    ringEnd: 4.2,
    ringPeakOpacity: 0.6,
    echoPeakOpacity: 0.3,
    sparkPeakOpacity: 0.9,
    pointSize: 0.082,
    rootLift: 0.38,
    ringTilt: 0.36,
    echoTilt: -0.36,
    ringSpin: -1.1,
    echoDelay: 0.24,
  },
  "swarm-curse": {
    motion: "swarm",
    shape: "thorn",
    duration: 0.9,
    ringStart: 0.66,
    ringEnd: 4.5,
    ringPeakOpacity: 0.62,
    echoPeakOpacity: 0.38,
    sparkPeakOpacity: 0.96,
    pointSize: 0.084,
    rootLift: 0.18,
    ringTilt: 0.5,
    echoTilt: -0.5,
    ringSpin: 3.4,
    echoDelay: 0.16,
  },
  "slow-curse": {
    motion: "drag",
    shape: "clock",
    duration: 1.04,
    ringStart: 4.8,
    ringEnd: 0.84,
    ringPeakOpacity: 0.58,
    echoPeakOpacity: 0.32,
    sparkPeakOpacity: 0.82,
    pointSize: 0.088,
    rootLift: -0.12,
    ringTilt: 0.34,
    echoTilt: -0.34,
    ringSpin: -0.55,
    echoDelay: 0.08,
  },
  "frenzy-curse": {
    motion: "eruption",
    shape: "flame",
    duration: 0.76,
    ringStart: 0.58,
    ringEnd: 5.6,
    ringPeakOpacity: 0.76,
    echoPeakOpacity: 0.48,
    sparkPeakOpacity: 1,
    pointSize: 0.104,
    rootLift: 0.44,
    ringTilt: 0.42,
    echoTilt: -0.42,
    ringSpin: 2.8,
    echoDelay: 0.1,
  },
  "gloom-curse": {
    motion: "collapse",
    shape: "void",
    duration: 0.98,
    ringStart: 5.2,
    ringEnd: 0.5,
    ringPeakOpacity: 0.72,
    echoPeakOpacity: 0.5,
    sparkPeakOpacity: 0.88,
    pointSize: 0.115,
    rootLift: -0.3,
    ringTilt: 0.68,
    echoTilt: -0.68,
    ringSpin: -2.2,
    echoDelay: 0.04,
  },
};

const SPARK_SHAPE_ID: Readonly<Record<PickupSparkShape, number>> = {
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

const SPARK_COUNT = 22;

function createSparkMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(BURST_COLORS.stone) },
      uOpacity: { value: 0 },
      uPointSize: { value: BURST_PROFILES.stone.pointSize },
      uShape: { value: SPARK_SHAPE_ID.diamond },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uPointSize;
      varying float vSeed;
      void main() {
        vSeed = aSeed;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(
          uPointSize * (0.82 + aSeed * 0.46) * (230.0 / max(0.65, -mvPosition.z)),
          1.0,
          20.0
        );
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uShape;
      varying float vSeed;

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
        if (edge * uOpacity < 0.015) discard;
        gl_FragColor = vec4(uColor, edge * uOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
}

function createSlot(index: number): PickupBurstSlot {
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
  const ringGeometry = new THREE.RingGeometry(0.16, 0.21, 24);
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.name = "Pickup expanding ring";
  ring.frustumCulled = false;

  const echoMaterial = ringMaterial.clone();
  echoMaterial.opacity = 0;
  const echo = new THREE.Mesh(ringGeometry, echoMaterial);
  echo.name = "Pickup secondary echo ring";
  echo.frustumCulled = false;

  const positions = new Float32Array(SPARK_COUNT * 3);
  const seeds = new Float32Array(SPARK_COUNT);
  for (let particle = 0; particle < SPARK_COUNT; particle += 1) {
    seeds[particle] = (particle * 0.6180339887 + index * 0.137) % 1;
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  sparkGeometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  const sparks = new THREE.Points(sparkGeometry, createSparkMaterial());
  sparks.name = "Pickup rising sparks";
  sparks.frustumCulled = false;
  sparks.renderOrder = 5;

  root.add(ring, echo, sparks);
  return {
    root,
    ring,
    echo,
    sparks,
    active: false,
    age: 0,
    originY: 0,
    profile: BURST_PROFILES.stone,
  };
}

function writeSparkPositions(slot: PickupBurstSlot, progress: number): void {
  const attr = slot.sparks.geometry.getAttribute("position") as THREE.BufferAttribute;
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
        const radius = 0.08 + progress * (0.72 + seed * 0.42);
        x = Math.cos(angle + progress * 0.55) * radius;
        z = Math.sin(angle + progress * 0.55) * radius;
        y = 0.08 + wave * (0.36 + seed * 0.28) + progress * 0.18;
        break;
      }
      case "restore": {
        const radius = 0.08 + wave * (0.16 + seed * 0.18);
        x = Math.cos(angle + progress * 1.4) * radius;
        z = Math.sin(angle + progress * 1.4) * radius;
        y = 0.04 + progress * (0.72 + seed * 0.48);
        break;
      }
      case "freeze": {
        const staggered = THREE.MathUtils.clamp(progress * 1.12 - seed * 0.1, 0, 1);
        const radius = 0.07 + staggered * (0.58 + seed * 0.46);
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius;
        y = 0.52 - staggered * (0.58 + seed * 0.32) + wobble * 0.025;
        break;
      }
      case "shield": {
        const radius = 0.16 + progress * (0.48 + seed * 0.32);
        const orbit = angle + progress * (2.2 + seed * 1.4);
        x = Math.cos(orbit) * radius;
        z = Math.sin(orbit) * radius;
        y = 0.18 + progress * 0.46 + Math.sin(orbit * 2) * (0.08 + wave * 0.14);
        break;
      }
      case "shockwave": {
        const radius = 0.06 + progress * (1.18 + seed * 0.62);
        x = Math.cos(angle + seed * progress) * radius;
        z = Math.sin(angle + seed * progress) * radius;
        y = 0.08 + wave * (0.16 + seed * 0.22) - progress * 0.08;
        break;
      }
      case "reveal": {
        const arm = particle % 4;
        const direction = arm * (Math.PI / 2);
        const distance = 0.08 + progress * (0.72 + seed * 0.46);
        const lateral = Math.sin(seed * 17 + progress * 4) * 0.07 * wave;
        x = Math.cos(direction) * distance + Math.cos(direction + Math.PI / 2) * lateral;
        z = Math.sin(direction) * distance + Math.sin(direction + Math.PI / 2) * lateral;
        y = 0.08 + wave * 0.2 + (particle % 3) * 0.035;
        break;
      }
      case "fountain": {
        const radius = 0.05 + progress * (0.32 + seed * 0.34);
        x = Math.cos(angle + progress * 1.8) * radius;
        z = Math.sin(angle + progress * 1.8) * radius;
        y = 0.05 + wave * (0.92 + seed * 0.58) - progress * 0.18;
        break;
      }
      case "swarm": {
        const radius = 0.1 + progress * (0.48 + seed * 0.44);
        const orbit = angle + progress * (3.8 + seed * 3.2);
        x = Math.cos(orbit) * radius;
        z = Math.sin(orbit) * radius;
        y = 0.16 + wave * 0.32 + wobble * (0.09 + seed * 0.08);
        break;
      }
      case "drag": {
        const radius = 0.92 * (1 - progress) + 0.08 + seed * 0.14;
        x = Math.cos(angle - progress * 0.45) * radius;
        z = Math.sin(angle - progress * 0.45) * radius;
        y = 0.72 * (1 - progress) - progress * (0.18 + seed * 0.2);
        break;
      }
      case "eruption": {
        const radius = 0.05 + progress * (0.42 + seed * 0.46);
        x = Math.cos(angle + wobble * 0.16) * radius;
        z = Math.sin(angle + wobble * 0.16) * radius;
        y = 0.04 + wave * (0.88 + seed * 0.62) + progress * 0.24;
        break;
      }
      case "collapse": {
        const radius = 1.05 * (1 - progress) + 0.035 + seed * 0.08;
        const orbit = angle - progress * (2.4 + seed * 1.6);
        x = Math.cos(orbit) * radius;
        z = Math.sin(orbit) * radius;
        y = 0.32 * (1 - progress) + wobble * 0.06 - progress * 0.26;
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

  constructor(capacity = 4) {
    this.root.name = "Pickup burst pool";
    this.slots = Array.from({ length: Math.max(1, capacity) }, (_, index) => createSlot(index));
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

    slot.sparks.material.uniforms.uColor.value.setHex(color);
    slot.sparks.material.uniforms.uOpacity.value = profile.sparkPeakOpacity;
    slot.sparks.material.uniforms.uPointSize.value = profile.pointSize;
    slot.sparks.material.uniforms.uShape.value = SPARK_SHAPE_ID[profile.shape];
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

      slot.sparks.material.uniforms.uOpacity.value =
        Math.pow(1 - progress, 0.82) * profile.sparkPeakOpacity;
      slot.sparks.material.uniforms.uPointSize.value = profile.pointSize * (1 - progress * 0.22);
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
      slot.sparks.material.uniforms.uOpacity.value = 0;
      slot.root.visible = visible;
    }
  }

  dispose(): void {
    for (const slot of this.slots) {
      slot.ring.geometry.dispose();
      slot.ring.material.dispose();
      slot.echo.material.dispose();
      slot.sparks.geometry.dispose();
      slot.sparks.material.dispose();
    }
    this.root.clear();
  }
}
