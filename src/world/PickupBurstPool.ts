import * as THREE from "three";

export type PickupBurstKind =
  | "stone"
  | "resolve"
  | "time-freeze"
  | "luminous-ward"
  | "annihilation-pulse"
  | "map"
  | "mobility"
  | "clarity";

interface PickupBurstSlot {
  root: THREE.Group;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  sparks: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  active: boolean;
  age: number;
  duration: number;
  ringPeakOpacity: number;
  sparkPeakOpacity: number;
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
};

const SPARK_COUNT = 22;

function createSlot(index: number): PickupBurstSlot {
  const root = new THREE.Group();
  root.name = `Pooled pickup burst ${index + 1}`;
  root.visible = false;

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.16, 0.21, 22),
    new THREE.MeshBasicMaterial({
      color: BURST_COLORS.stone,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  ring.name = "Pickup expanding ring";
  ring.rotation.x = -Math.PI / 2;
  ring.frustumCulled = false;

  const positions = new Float32Array(SPARK_COUNT * 3);
  for (let particle = 0; particle < SPARK_COUNT; particle += 1) {
    const angle = (particle / SPARK_COUNT) * Math.PI * 2 + index * 0.37;
    const radius = 0.08 + (particle % 5) * 0.04;
    positions[particle * 3] = Math.cos(angle) * radius;
    positions[particle * 3 + 1] = 0.05 + (particle % 7) * 0.045;
    positions[particle * 3 + 2] = Math.sin(angle) * radius;
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const sparks = new THREE.Points(
    sparkGeometry,
    new THREE.PointsMaterial({
      color: BURST_COLORS.stone,
      size: 0.06,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
    }),
  );
  sparks.name = "Pickup rising sparks";
  sparks.frustumCulled = false;
  root.add(ring, sparks);
  return {
    root,
    ring,
    sparks,
    active: false,
    age: 0,
    duration: 0.56,
    ringPeakOpacity: 0.72,
    sparkPeakOpacity: 0.88,
  };
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
    const color = colorOverride ?? BURST_COLORS[kind];
    const mobility = kind === "mobility";
    slot.active = true;
    slot.age = 0;
    slot.duration = kind === "stone" ? 0.7 : mobility ? 0.82 : 0.56;
    slot.ringPeakOpacity = kind === "stone" ? 0.8 : mobility ? 0.58 : 0.72;
    slot.sparkPeakOpacity = kind === "stone" ? 0.94 : mobility ? 0.95 : 0.88;
    slot.root.visible = true;
    slot.root.position.copy(position);
    slot.root.rotation.y = position.x * 0.17 + position.z * 0.11;
    slot.root.scale.setScalar(mobility ? 0.9 : 0.72);
    slot.ring.material.color.setHex(color);
    slot.ring.material.opacity = slot.ringPeakOpacity;
    slot.sparks.material.color.setHex(color);
    slot.sparks.material.size =
      kind === "resolve"
        ? 0.075
        : mobility
          ? 0.11
          : kind === "time-freeze" ||
              kind === "luminous-ward" ||
              kind === "annihilation-pulse" ||
              kind === "map"
            ? 0.09
            : kind === "stone"
              ? 0.075
              : 0.06;
    slot.sparks.material.opacity = slot.sparkPeakOpacity;

    // Mobility draught: seed a tall dust fountain instead of a flat spark disc.
    if (mobility) {
      const attr = slot.sparks.geometry.getAttribute("position");
      if (attr) {
        for (let particle = 0; particle < attr.count; particle += 1) {
          const angle = (particle / attr.count) * Math.PI * 2 + slot.root.rotation.y;
          const radius = 0.06 + (particle % 6) * 0.05;
          attr.setXYZ(
            particle,
            Math.cos(angle) * radius,
            0.08 + (particle % 9) * 0.07,
            Math.sin(angle) * radius,
          );
        }
        attr.needsUpdate = true;
      }
    }
  }

  update(delta: number): void {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.age += delta;
      const progress = THREE.MathUtils.clamp(slot.age / slot.duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 2);
      const mobilityDust = slot.sparks.material.size >= 0.105;
      slot.root.scale.setScalar((mobilityDust ? 0.9 : 0.72) + eased * (mobilityDust ? 2.4 : 1.9));
      slot.root.position.y += delta * (mobilityDust ? 0.55 + progress * 0.4 : 0.34 + progress * 0.26);
      slot.ring.material.opacity = (1 - progress) * slot.ringPeakOpacity;
      slot.sparks.material.opacity = (1 - progress) * slot.sparkPeakOpacity;
      if (mobilityDust) {
        // Lift motes individually so the draught reads as rising dust, not a rigid cloud.
        const attr = slot.sparks.geometry.getAttribute("position");
        if (attr) {
          for (let particle = 0; particle < attr.count; particle += 1) {
            const y = attr.getY(particle) + delta * (0.45 + (particle % 5) * 0.08);
            attr.setY(particle, y);
          }
          attr.needsUpdate = true;
        }
      }
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
      slot.sparks.material.opacity = 0;
      slot.root.visible = visible;
    }
  }

  dispose(): void {
    for (const slot of this.slots) {
      slot.ring.geometry.dispose();
      slot.ring.material.dispose();
      slot.sparks.geometry.dispose();
      slot.sparks.material.dispose();
    }
    this.root.clear();
  }
}
