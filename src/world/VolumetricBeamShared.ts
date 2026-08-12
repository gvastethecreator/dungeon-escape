import type * as THREE from "three";
import type { MeshBasicNodeMaterial } from "three/webgpu";

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
  /** Thin open objective strata; the default signal profile remains portal-safe. */
  readonly signalStyle?: "smooth" | "objective";
}

/** Uniform handles shared by GLSL ShaderMaterial uniforms and TSL UniformNode values. */
export interface VolumetricBeamUniformHandles {
  uColor: { value: THREE.Color };
  uStrength: { value: number };
  uTime: { value: number };
  uHeight: { value: number };
  uTopRadius: { value: number };
  uBottomRadius: { value: number };
}

export type VolumetricBeamMaterial = THREE.ShaderMaterial | MeshBasicNodeMaterial;

export type VolumetricBeamProfile = "signal" | "ambient" | "objective";
