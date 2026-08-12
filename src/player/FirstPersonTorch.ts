import * as THREE from "three";

import type { DungeonMood } from "../systems/DungeonMood";
import { createDungeonMaterials, type DungeonMaterials } from "../world/MaterialLibrary";
import {
  isNoiseFlameMaterial,
  setNoiseFlameLean,
  setNoiseFlameMoodPalette,
  setNoiseFlameWind,
  tickNoiseFlame,
} from "../world/ProceduralFlameVfx";
import { createWallTorch, type WallTorchAssembly } from "../world/WallTorchFactory";

/** Wall-torch mesh scale is authored for sconces; FP holds a tighter grip. */
export const FIRST_PERSON_TORCH_SCALE = 0.48;

/** Camera-local rest pose: right hand, tip angled into the view cone. */
export const FIRST_PERSON_TORCH_POSE = Object.freeze({
  position: Object.freeze({ x: 0.48, y: -0.4, z: -0.5 }),
  rotation: Object.freeze({ x: 0.4, y: -0.62, z: 0.14 }),
});

/** Max tip tilt from walk inertia (radians). */
export const FIRST_PERSON_FLAME_LEAN_MAX = 0.42;
/** How quickly the flame catches up to walk inertia. */
export const FIRST_PERSON_FLAME_LEAN_RESPONSE = 9;
/** Shader curl lean scale from camera-local lateral speed. */
export const FIRST_PERSON_FLAME_SHADER_LEAN = 0.085;
/** Ember wind scale from camera-local velocity (m/s → local offset). */
export const FIRST_PERSON_FLAME_WIND_SCALE = 0.028;

/** Parts that only make sense on masonry — strip for the handheld grip. */
const WALL_ONLY_PART_NAMES = Object.freeze([
  "Torch wall plate",
  "Torch scroll bracket",
  "Wall contact socket",
  "Torch wall glow card",
]);

export interface FirstPersonTorchMotion {
  readonly moving: boolean;
  readonly sprinting: boolean;
  readonly stridePhase: number;
  readonly grounded: boolean;
  /** World-space horizontal velocity (m/s). */
  readonly velocityX: number;
  readonly velocityZ: number;
}

export interface FirstPersonTorchHandle {
  readonly root: THREE.Group;
  readonly flame: THREE.Mesh;
  /**
   * Parent the viewmodel under `scene` (not the camera). The play camera is not
   * in the scene graph, so camera children never render.
   */
  attach(camera: THREE.Camera, scene: THREE.Object3D): void;
  setVisible(visible: boolean): void;
  /** Force the viewmodel into the first warmup draw so grab does not compile shaders. */
  setWarmupVisible(visible: boolean): void;
  setMood(mood: DungeonMood): void;
  update(
    delta: number,
    elapsed: number,
    motion: FirstPersonTorchMotion,
    flameVisibility?: number,
  ): void;
  dispose(): void;
}

/**
 * First-person grip of the authored wall-torch sculpt: same handle, basket, and
 * procedural flame, without the wall plate / bracket / scene PointLight (the
 * LightingRig lantern + forward beam own illumination).
 */
export function createFirstPersonTorch(materials?: DungeonMaterials): FirstPersonTorchHandle {
  const resolved = materials ?? createDungeonMaterials({ compact: true });
  const assembly = createWallTorch(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), true, resolved);
  stripWallMount(assembly);
  // Rig owns player lighting — keep the mesh warm, drop the sconce PointLight budget.
  assembly.light?.removeFromParent();
  for (const halo of assembly.halos) {
    halo.removeFromParent();
    disposeObject(halo);
  }
  assembly.halos.length = 0;

  const grip = new THREE.Group();
  grip.name = "First-person hand torch";
  grip.frustumCulled = false;
  assembly.root.frustumCulled = false;
  assembly.flame.frustumCulled = false;
  // Wall torch grip sits near (0, ~0, 0.61); pull that point to local origin.
  assembly.root.position.set(0, -0.08, -0.61);
  assembly.root.name = "First-person torch sculpt";
  grip.add(assembly.root);
  grip.scale.setScalar(FIRST_PERSON_TORCH_SCALE);
  // Embers are 1m sprites; at viewmodel range they fill the screen and stall the GPU.
  for (const detail of assembly.flameDetails) {
    detail.scale.setScalar(0.08);
    detail.frustumCulled = false;
  }

  const restPosition = new THREE.Vector3(
    FIRST_PERSON_TORCH_POSE.position.x,
    FIRST_PERSON_TORCH_POSE.position.y,
    FIRST_PERSON_TORCH_POSE.position.z,
  );
  const restEuler = new THREE.Euler(
    FIRST_PERSON_TORCH_POSE.rotation.x,
    FIRST_PERSON_TORCH_POSE.rotation.y,
    FIRST_PERSON_TORCH_POSE.rotation.z,
    "YXZ",
  );
  grip.position.copy(restPosition);
  grip.rotation.copy(restEuler);
  const flameRestPosition = assembly.flame.position.clone();
  const bob = { x: 0, y: 0, roll: 0 };
  const lean = { pitch: 0, roll: 0, shader: 0, windX: 0, windZ: 0 };
  const worldVelocity = new THREE.Vector3();
  const localVelocity = new THREE.Vector3();
  const cameraPos = new THREE.Vector3();
  const cameraQuat = new THREE.Quaternion();
  const inverseCameraQuat = new THREE.Quaternion();
  const localPos = new THREE.Vector3();
  const localQuat = new THREE.Quaternion();
  const localEuler = new THREE.Euler(0, 0, 0, "YXZ");
  let attachedCamera: THREE.Camera | null = null;
  const outer = new THREE.Color();
  const core = new THREE.Color();

  const applyFlameMaterials = (fn: (material: THREE.Material) => void): void => {
    const flameMaterials = Array.isArray(assembly.flame.material)
      ? assembly.flame.material
      : [assembly.flame.material];
    for (const material of flameMaterials) {
      if (material) fn(material);
    }
    for (const detail of assembly.flameDetails) {
      detail.traverse((object) => {
        if (
          !(object instanceof THREE.Points) &&
          !(object instanceof THREE.Mesh) &&
          !(object instanceof THREE.Sprite)
        ) {
          return;
        }
        const detailMaterial = object.material;
        const list = Array.isArray(detailMaterial) ? detailMaterial : [detailMaterial];
        for (const material of list) {
          if (material) fn(material);
        }
      });
    }
  };

  const syncWorldPose = (): void => {
    if (!attachedCamera) {
      grip.position.set(restPosition.x + bob.x, restPosition.y + bob.y, restPosition.z);
      grip.rotation.set(restEuler.x, restEuler.y, restEuler.z + bob.roll);
      return;
    }
    attachedCamera.updateMatrixWorld();
    attachedCamera.getWorldPosition(cameraPos);
    attachedCamera.getWorldQuaternion(cameraQuat);
    localPos.set(restPosition.x + bob.x, restPosition.y + bob.y, restPosition.z);
    localPos.applyQuaternion(cameraQuat);
    grip.position.copy(cameraPos).add(localPos);
    localEuler.set(restEuler.x, restEuler.y, restEuler.z + bob.roll, "YXZ");
    localQuat.setFromEuler(localEuler);
    grip.quaternion.copy(cameraQuat).multiply(localQuat);
  };

  return {
    root: grip,
    flame: assembly.flame,
    attach(camera: THREE.Camera, scene: THREE.Object3D): void {
      if (attachedCamera === camera && grip.parent === scene) return;
      grip.removeFromParent();
      scene.add(grip);
      attachedCamera = camera;
      syncWorldPose();
    },
    setVisible(visible: boolean): void {
      grip.visible = visible;
      assembly.flame.visible = visible;
      for (const detail of assembly.flameDetails) detail.visible = visible;
    },
    setWarmupVisible(visible: boolean): void {
      this.setVisible(visible);
      if (!visible) return;
      syncWorldPose();
      applyFlameMaterials((material) => {
        tickNoiseFlame(material, 0.5, 1);
        if (isNoiseFlameMaterial(material)) {
          setNoiseFlameLean(material, 0.2);
          setNoiseFlameWind(material, 0.05, -0.04);
        }
      });
    },
    setMood(mood: DungeonMood): void {
      outer.setHex(mood.lanternColor);
      core.setHex(mood.lanternColor).lerp(new THREE.Color(0xfff0d0), 0.42);
      applyFlameMaterials((material) => {
        if (isNoiseFlameMaterial(material)) setNoiseFlameMoodPalette(material, outer, core);
      });
    },
    update(
      delta: number,
      elapsed: number,
      motion: FirstPersonTorchMotion,
      flameVisibility = 1,
    ): void {
      if (!grip.visible) return;
      const pace = motion.sprinting ? 1.35 : motion.moving ? 1 : 0.35;
      const stride = motion.grounded ? motion.stridePhase : elapsed * 2.4;
      const targetBobX = Math.sin(stride) * (motion.moving ? 0.014 : 0.004) * pace;
      const targetBobY = Math.cos(stride * 2) * (motion.moving ? 0.01 : 0.003) * pace;
      const targetRoll = Math.sin(stride) * (motion.moving ? 0.03 : 0.008) * pace;
      const follow = 1 - Math.exp(-(motion.moving ? 10 : 6) * Math.max(0, delta));
      bob.x += (targetBobX - bob.x) * follow;
      bob.y += (targetBobY - bob.y) * follow;
      bob.roll += (targetRoll - bob.roll) * follow;
      syncWorldPose();

      const velocityX = Number.isFinite(motion.velocityX) ? motion.velocityX : 0;
      const velocityZ = Number.isFinite(motion.velocityZ) ? motion.velocityZ : 0;
      worldVelocity.set(velocityX, 0, velocityZ);
      if (attachedCamera) {
        inverseCameraQuat.copy(cameraQuat).invert();
        localVelocity.copy(worldVelocity).applyQuaternion(inverseCameraQuat);
      } else {
        localVelocity.copy(worldVelocity);
      }
      const targetPitch = THREE.MathUtils.clamp(
        -localVelocity.z * 0.055,
        -FIRST_PERSON_FLAME_LEAN_MAX,
        FIRST_PERSON_FLAME_LEAN_MAX,
      );
      const targetLeanRoll = THREE.MathUtils.clamp(
        localVelocity.x * 0.055,
        -FIRST_PERSON_FLAME_LEAN_MAX,
        FIRST_PERSON_FLAME_LEAN_MAX,
      );
      const targetShaderLean = THREE.MathUtils.clamp(
        -localVelocity.x * FIRST_PERSON_FLAME_SHADER_LEAN,
        -1.2,
        1.2,
      );
      const targetWindX = THREE.MathUtils.clamp(
        -localVelocity.x * FIRST_PERSON_FLAME_WIND_SCALE,
        -0.35,
        0.35,
      );
      const targetWindZ = THREE.MathUtils.clamp(
        -localVelocity.z * FIRST_PERSON_FLAME_WIND_SCALE,
        -0.35,
        0.35,
      );
      const leanFollow = 1 - Math.exp(-FIRST_PERSON_FLAME_LEAN_RESPONSE * Math.max(0, delta));
      lean.pitch += (targetPitch - lean.pitch) * leanFollow;
      lean.roll += (targetLeanRoll - lean.roll) * leanFollow;
      lean.shader += (targetShaderLean - lean.shader) * leanFollow;
      lean.windX += (targetWindX - lean.windX) * leanFollow;
      lean.windZ += (targetWindZ - lean.windZ) * leanFollow;

      assembly.flame.rotation.set(lean.pitch, 0, lean.roll);
      assembly.flame.position.set(
        flameRestPosition.x - lean.roll * 0.04,
        flameRestPosition.y,
        flameRestPosition.z + lean.pitch * 0.05,
      );

      const visibility = THREE.MathUtils.clamp(flameVisibility, 0, 1);
      applyFlameMaterials((material) => {
        tickNoiseFlame(material, elapsed, visibility);
        if (isNoiseFlameMaterial(material)) {
          setNoiseFlameLean(material, lean.shader);
          setNoiseFlameWind(material, lean.windX, lean.windZ);
        }
      });
      assembly.flame.scale.y = 1;
    },
    dispose(): void {
      grip.removeFromParent();
      attachedCamera = null;
      disposeObject(grip);
    },
  };
}

function stripWallMount(assembly: WallTorchAssembly): void {
  for (const name of WALL_ONLY_PART_NAMES) {
    const part = assembly.root.getObjectByName(name);
    if (!part) continue;
    part.removeFromParent();
    disposeObject(part);
  }
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (
      child instanceof THREE.Mesh ||
      child instanceof THREE.Points ||
      child instanceof THREE.Sprite
    ) {
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material || material.userData?.sharedDungeonMaterial) continue;
        material.dispose();
      }
    }
  });
}
