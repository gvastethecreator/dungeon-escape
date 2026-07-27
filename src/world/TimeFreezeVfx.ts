import * as THREE from "three";

import { TIME_FREEZE_DURATION_SECONDS } from "../game/TimeFreeze";

export interface TimeFreezeVfxTarget {
  position: THREE.Vector3Like;
  phaseVisibility: number;
  spawnReveal: number;
  scaleX: number;
  scaleY: number;
}

const ZERO_SCALE = new THREE.Vector3(0, 0, 0);

/**
 * A small instanced aura that makes a frozen enemy readable without adding a
 * scene graph node or light for every billboard. The rings keep animating while
 * the enemy simulation is paused, so the player can see that the power is live.
 */
export class TimeFreezeVfx {
  readonly root = new THREE.Group();
  private readonly orbit: THREE.InstancedMesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly halo: THREE.InstancedMesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  private readonly shards: THREE.InstancedMesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  private readonly capacity: number;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly orbitQuaternion = new THREE.Quaternion();
  private readonly haloQuaternion = new THREE.Quaternion();
  private readonly shardQuaternion = new THREE.Quaternion();
  private readonly spinQuaternion = new THREE.Quaternion();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly shardAxis = new THREE.Vector3(1, 1, 0).normalize();

  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.trunc(capacity));
    this.root.name = "Time freeze enemy aura field";

    const orbitMaterial = new THREE.MeshBasicMaterial({
      color: 0x83e6ee,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0x376eaa,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const shardMaterial = new THREE.MeshBasicMaterial({
      color: 0xb9fbff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.orbit = new THREE.InstancedMesh(
      new THREE.TorusGeometry(0.46, 0.022, 5, 18),
      orbitMaterial,
      this.capacity,
    );
    this.orbit.name = "Time freeze orbit rings";
    this.orbit.frustumCulled = false;

    this.halo = new THREE.InstancedMesh(
      new THREE.TorusGeometry(0.34, 0.028, 5, 16),
      haloMaterial,
      this.capacity,
    );
    this.halo.name = "Time freeze vertical halos";
    this.halo.frustumCulled = false;

    this.shards = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.095, 0),
      shardMaterial,
      this.capacity,
    );
    this.shards.name = "Time freeze suspended shards";
    this.shards.frustumCulled = false;
    this.root.add(this.orbit, this.halo, this.shards);

    this.orbitQuaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    this.haloQuaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    this.update(0, 0, []);
  }

  update(remaining: number, elapsed: number, targets: readonly TimeFreezeVfxTarget[]): void {
    const active = remaining > 0.0001;
    const life = THREE.MathUtils.clamp(remaining / TIME_FREEZE_DURATION_SECONDS, 0, 1);
    const pulse = 0.93 + Math.sin(elapsed * 7.2) * 0.07;
    const orbitSpin = elapsed * 1.55;
    const haloSpin = -elapsed * 1.1;

    for (let index = 0; index < this.capacity; index += 1) {
      const target = targets[index];
      const visible =
        active &&
        target !== undefined &&
        target.spawnReveal > 0.001 &&
        target.phaseVisibility > 0.001 &&
        target.scaleX > 0.001 &&
        target.scaleY > 0.001;
      if (!visible) {
        this.orbit.setMatrixAt(
          index,
          this.matrix.compose(this.position, this.quaternion, ZERO_SCALE),
        );
        this.halo.setMatrixAt(
          index,
          this.matrix.compose(this.position, this.quaternion, ZERO_SCALE),
        );
        this.shards.setMatrixAt(
          index,
          this.matrix.compose(this.position, this.quaternion, ZERO_SCALE),
        );
        continue;
      }

      const visibility = THREE.MathUtils.clamp(target.phaseVisibility * target.spawnReveal, 0, 1);
      const strength = THREE.MathUtils.clamp(0.58 + life * 0.42, 0, 1) * visibility;
      this.position.set(
        target.position.x,
        target.position.y + target.scaleY * 0.46,
        target.position.z,
      );

      this.quaternion.copy(this.orbitQuaternion);
      this.spinQuaternion.setFromAxisAngle(this.yAxis, orbitSpin);
      this.quaternion.multiply(this.spinQuaternion);
      this.scale.setScalar((0.76 + strength * 0.22) * pulse);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.orbit.setMatrixAt(index, this.matrix);

      this.quaternion.copy(this.haloQuaternion);
      this.spinQuaternion.setFromAxisAngle(this.yAxis, haloSpin);
      this.quaternion.multiply(this.spinQuaternion);
      this.scale.setScalar((0.8 + strength * 0.16) * (1.02 - life * 0.08));
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.halo.setMatrixAt(index, this.matrix);

      this.position.y += Math.sin(elapsed * 3.8 + index * 1.7) * 0.13;
      this.quaternion.copy(this.shardQuaternion);
      this.spinQuaternion.setFromAxisAngle(this.shardAxis, elapsed * 2.4 + index);
      this.quaternion.multiply(this.spinQuaternion);
      this.scale.setScalar((0.72 + strength * 0.24) * pulse);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.shards.setMatrixAt(index, this.matrix);
    }

    const ringOpacity = active ? 0.28 + life * 0.52 : 0;
    const haloOpacity = active ? 0.18 + life * 0.3 : 0;
    const shardOpacity = active ? 0.32 + life * 0.48 : 0;
    this.orbit.material.opacity = ringOpacity;
    this.halo.material.opacity = haloOpacity;
    this.shards.material.opacity = shardOpacity;
    this.orbit.instanceMatrix.needsUpdate = true;
    this.halo.instanceMatrix.needsUpdate = true;
    this.shards.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.orbit.geometry.dispose();
    this.orbit.material.dispose();
    this.halo.geometry.dispose();
    this.halo.material.dispose();
    this.shards.geometry.dispose();
    this.shards.material.dispose();
    this.root.clear();
  }
}
