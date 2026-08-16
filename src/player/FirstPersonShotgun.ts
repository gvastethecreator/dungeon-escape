import * as THREE from "three";

import { createPumpShotgun } from "../world/ShotgunFactory";
import { createDungeonMaterials, type DungeonMaterials } from "../world/MaterialLibrary";
import { shotgunRackPose } from "../game/Shotgun";

/** Wall-prop scale is authored in meters; FP holds a tighter left-hand grip. */
export const FIRST_PERSON_SHOTGUN_SCALE = 0.42;

/** Camera-local rest pose: left hand, barrel into the view cone. */
export const FIRST_PERSON_SHOTGUN_POSE = Object.freeze({
  position: Object.freeze({ x: -0.38, y: -0.28, z: -0.52 }),
  rotation: Object.freeze({ x: 0.08, y: Math.PI, z: -0.06 }),
});

export interface FirstPersonShotgunMotion {
  readonly moving: boolean;
  readonly sprinting: boolean;
  readonly stridePhase: number;
  readonly grounded: boolean;
  readonly velocityX: number;
  readonly velocityZ: number;
}

export interface FirstPersonShotgunHandle {
  readonly root: THREE.Group;
  attach(camera: THREE.Camera, scene: THREE.Object3D): void;
  setVisible(visible: boolean): void;
  /** Force grip, flash, and sparks into the first warmup draw so fire does not compile them. */
  setWarmupVisible(visible: boolean): void;
  /** 1 while a shot just fired; drives recoil + muzzle flash. */
  kick(strength?: number): void;
  update(
    delta: number,
    elapsed: number,
    motion: FirstPersonShotgunMotion,
    pumpSeconds: number,
  ): void;
  dispose(): void;
}

/**
 * First-person left-hand grip of the authored pump shotgun.
 * Parent under `scene` (not the camera) — the play camera is not in the graph.
 */
export function createFirstPersonShotgun(materials?: DungeonMaterials): FirstPersonShotgunHandle {
  const resolved = materials ?? createDungeonMaterials({ compact: true });
  const assembly = createPumpShotgun(resolved);
  const grip = new THREE.Group();
  grip.name = "First-person shotgun";
  grip.frustumCulled = false;
  assembly.root.frustumCulled = false;
  assembly.root.name = "First-person shotgun sculpt";
  grip.add(assembly.root);
  grip.scale.setScalar(FIRST_PERSON_SHOTGUN_SCALE);

  const flash = new THREE.Mesh(
    new THREE.CircleGeometry(0.08, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffe6a8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  flash.name = "Shotgun muzzle flash";
  flash.position.copy(assembly.muzzle.position);
  flash.frustumCulled = false;
  assembly.root.add(flash);

  const flashCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.055, 0.16, 7, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffc45a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  flashCone.name = "Shotgun muzzle cone";
  flashCone.position.copy(assembly.muzzle.position);
  flashCone.position.z += 0.08;
  flashCone.rotation.x = Math.PI / 2;
  flashCone.frustumCulled = false;
  assembly.root.add(flashCone);

  const sparkCount = 10;
  const sparkPositions = new Float32Array(sparkCount * 3);
  const sparkVel = new Float32Array(sparkCount * 3);
  const sparkAges = new Float32Array(sparkCount);
  sparkAges.fill(1);
  for (let index = 0; index < sparkCount; index += 1) {
    sparkPositions[index * 3 + 1] = -10;
  }
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  const sparks = new THREE.Points(
    sparkGeometry,
    new THREE.PointsMaterial({
      color: 0xfff1c0,
      size: 0.018,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
    }),
  );
  sparks.name = "Shotgun muzzle sparks";
  sparks.frustumCulled = false;
  sparks.visible = false;
  assembly.root.add(sparks);

  const restPosition = new THREE.Vector3(
    FIRST_PERSON_SHOTGUN_POSE.position.x,
    FIRST_PERSON_SHOTGUN_POSE.position.y,
    FIRST_PERSON_SHOTGUN_POSE.position.z,
  );
  const restEuler = new THREE.Euler(
    FIRST_PERSON_SHOTGUN_POSE.rotation.x,
    FIRST_PERSON_SHOTGUN_POSE.rotation.y,
    FIRST_PERSON_SHOTGUN_POSE.rotation.z,
    "YXZ",
  );
  grip.position.copy(restPosition);
  grip.rotation.copy(restEuler);
  const pumpRest = assembly.pump.position.z;
  const bob = { x: 0, y: 0, roll: 0 };
  const recoil = { kick: 0, pitch: 0 };
  const rack = { dip: 0, pitch: 0, roll: 0, pumpSlide: 0 };
  let flashAge = 1;
  const cameraPos = new THREE.Vector3();
  const cameraQuat = new THREE.Quaternion();
  const localPos = new THREE.Vector3();
  const localQuat = new THREE.Quaternion();
  const localEuler = new THREE.Euler(0, 0, 0, "YXZ");
  let attachedCamera: THREE.Camera | null = null;

  const syncWorldPose = (): void => {
    const recoilZ = recoil.kick * 0.07;
    const recoilPitch = recoil.pitch;
    const dipY = rack.dip * 0.34;
    const dipZ = rack.dip * 0.05;
    const dipPitch = rack.pitch + recoilPitch;
    const dipRoll = bob.roll + rack.roll;
    if (!attachedCamera) {
      grip.position.set(
        restPosition.x + bob.x,
        restPosition.y + bob.y - dipY,
        restPosition.z + recoilZ + dipZ,
      );
      grip.rotation.set(restEuler.x - dipPitch, restEuler.y, restEuler.z + dipRoll);
      return;
    }
    attachedCamera.updateMatrixWorld();
    attachedCamera.getWorldPosition(cameraPos);
    attachedCamera.getWorldQuaternion(cameraQuat);
    localPos.set(
      restPosition.x + bob.x,
      restPosition.y + bob.y - dipY,
      restPosition.z + recoilZ + dipZ,
    );
    localPos.applyQuaternion(cameraQuat);
    grip.position.copy(cameraPos).add(localPos);
    localEuler.set(restEuler.x - dipPitch, restEuler.y, restEuler.z + dipRoll, "YXZ");
    localQuat.setFromEuler(localEuler);
    grip.quaternion.copy(cameraQuat).multiply(localQuat);
  };

  return {
    root: grip,
    attach(camera: THREE.Camera, scene: THREE.Object3D): void {
      if (attachedCamera === camera && grip.parent === scene) return;
      grip.removeFromParent();
      scene.add(grip);
      attachedCamera = camera;
      syncWorldPose();
    },
    setVisible(visible: boolean): void {
      grip.visible = visible;
    },
    setWarmupVisible(visible: boolean): void {
      this.setVisible(visible);
      const flashMaterial = flash.material;
      const coneMaterial = flashCone.material;
      const sparkMaterial = sparks.material;
      if (visible) {
        syncWorldPose();
        flashAge = 0;
        sparkAges.fill(0);
        flash.visible = true;
        flashCone.visible = true;
        sparks.visible = true;
        if (flashMaterial instanceof THREE.MeshBasicMaterial) flashMaterial.opacity = 0.05;
        if (coneMaterial instanceof THREE.MeshBasicMaterial) coneMaterial.opacity = 0.05;
        if (sparkMaterial instanceof THREE.PointsMaterial) sparkMaterial.opacity = 0.05;
        const muzzle = assembly.muzzle.position;
        for (let index = 0; index < sparkCount; index += 1) {
          sparkPositions[index * 3] = muzzle.x;
          sparkPositions[index * 3 + 1] = muzzle.y;
          sparkPositions[index * 3 + 2] = muzzle.z;
        }
        const sparkAttr = sparkGeometry.getAttribute("position") as THREE.BufferAttribute;
        sparkAttr.needsUpdate = true;
        return;
      }
      flashAge = 1;
      sparkAges.fill(1);
      flash.visible = false;
      flashCone.visible = false;
      sparks.visible = false;
      if (flashMaterial instanceof THREE.MeshBasicMaterial) flashMaterial.opacity = 0;
      if (coneMaterial instanceof THREE.MeshBasicMaterial) coneMaterial.opacity = 0;
      if (sparkMaterial instanceof THREE.PointsMaterial) sparkMaterial.opacity = 0;
    },
    kick(strength = 1): void {
      recoil.kick = Math.min(1, recoil.kick + 0.85 * strength);
      recoil.pitch = Math.min(0.22, recoil.pitch + 0.12 * strength);
      flashAge = 0;
      const muzzle = assembly.muzzle.position;
      for (let index = 0; index < sparkCount; index += 1) {
        const angle = (index / sparkCount) * Math.PI * 2;
        const spread = 0.35 + (index % 3) * 0.12;
        sparkPositions[index * 3] = muzzle.x + Math.cos(angle) * 0.01;
        sparkPositions[index * 3 + 1] = muzzle.y + Math.sin(angle) * 0.01;
        sparkPositions[index * 3 + 2] = muzzle.z;
        sparkVel[index * 3] = Math.cos(angle) * spread * 0.35;
        sparkVel[index * 3 + 1] = Math.sin(angle) * spread * 0.28;
        sparkVel[index * 3 + 2] = 1.8 + (index % 4) * 0.35;
        sparkAges[index] = 0;
      }
      sparks.visible = true;
    },
    update(
      delta: number,
      elapsed: number,
      motion: FirstPersonShotgunMotion,
      pumpSeconds: number,
    ): void {
      if (!grip.visible) return;
      const pace = motion.sprinting ? 1.35 : motion.moving ? 1 : 0.35;
      const stride = motion.grounded ? motion.stridePhase : elapsed * 2.4;
      const targetBobX = Math.sin(stride) * (motion.moving ? 0.012 : 0.003) * pace;
      const targetBobY = Math.cos(stride * 2) * (motion.moving ? 0.008 : 0.002) * pace;
      const targetRoll = Math.sin(stride) * (motion.moving ? 0.02 : 0.006) * pace;
      const follow = 1 - Math.exp(-(motion.moving ? 10 : 6) * Math.max(0, delta));
      bob.x += (targetBobX - bob.x) * follow;
      bob.y += (targetBobY - bob.y) * follow;
      bob.roll += (targetRoll - bob.roll) * follow;
      const settle = 1 - Math.exp(-10 * Math.max(0, delta));
      recoil.kick += (0 - recoil.kick) * settle;
      recoil.pitch += (0 - recoil.pitch) * settle;
      shotgunRackPose(pumpSeconds, rack);
      assembly.pump.position.z = pumpRest - rack.pumpSlide * 0.11;
      flashAge = Math.min(1, flashAge + delta * 14);
      const flashMaterial = flash.material;
      if (flashMaterial instanceof THREE.MeshBasicMaterial) {
        flashMaterial.opacity = flashAge < 1 ? (1 - flashAge) * 0.9 : 0;
      }
      const coneMaterial = flashCone.material;
      if (coneMaterial instanceof THREE.MeshBasicMaterial) {
        coneMaterial.opacity = flashAge < 1 ? (1 - flashAge) * 0.55 : 0;
      }
      flash.visible = flashAge < 1;
      flashCone.visible = flashAge < 1;
      let liveSparks = 0;
      for (let index = 0; index < sparkCount; index += 1) {
        sparkAges[index] = Math.min(1, sparkAges[index] + delta * 11);
        if (sparkAges[index] >= 1) {
          sparkPositions[index * 3 + 1] = -10;
          continue;
        }
        liveSparks += 1;
        sparkPositions[index * 3] += sparkVel[index * 3]! * delta;
        sparkPositions[index * 3 + 1] += sparkVel[index * 3 + 1]! * delta;
        sparkPositions[index * 3 + 2] += sparkVel[index * 3 + 2]! * delta;
        sparkVel[index * 3 + 1]! -= 4.5 * delta;
      }
      const sparkAttr = sparkGeometry.getAttribute("position") as THREE.BufferAttribute;
      sparkAttr.needsUpdate = true;
      sparks.visible = liveSparks > 0;
      const sparkMaterial = sparks.material;
      if (sparkMaterial instanceof THREE.PointsMaterial) {
        sparkMaterial.opacity = liveSparks > 0 ? 0.85 : 0;
      }
      syncWorldPose();
    },
    dispose(): void {
      grip.removeFromParent();
      attachedCamera = null;
      sparkGeometry.dispose();
      if (sparks.material instanceof THREE.PointsMaterial) sparks.material.dispose();
      grip.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry?.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (!material || material.userData?.sharedDungeonMaterial) continue;
          material.dispose();
        }
      });
    },
  };
}
