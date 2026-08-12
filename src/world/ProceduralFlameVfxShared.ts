import type * as THREE from "three";
import type { MeshBasicNodeMaterial } from "three/webgpu";

export interface NoiseFlamePalette {
  outer: number;
  mid: number;
  core: number;
  glow: number;
}

export interface NoiseFlameOptions {
  name: string;
  width: number;
  height: number;
  phase: number;
  palette?: NoiseFlamePalette;
  opacity?: number;
  turbulence?: number;
  lean?: number;
  intensity?: number;
  emberCount?: number;
}

/** Uniform handles shared by GLSL ShaderMaterial uniforms and TSL UniformNode values. */
export interface NoiseFlameUniformHandles {
  uTime: { value: number };
  uPhase: { value: number };
  uOpacity: { value: number };
  uTurbulence: { value: number };
  uLean: { value: number };
  uIntensity: { value: number };
  uOuterColor: { value: THREE.Color };
  uMidColor: { value: THREE.Color };
  uCoreColor: { value: THREE.Color };
  uGlowColor: { value: THREE.Color };
}

export interface NoiseFlameEmberUniformHandles {
  uTime: { value: number };
  uPhase: { value: number };
  uOpacity: { value: number };
  uColor: { value: THREE.Color };
  /** Camera/local wind drift applied on top of the authored ember path (x, z). */
  uWind: { value: THREE.Vector2 };
}

export type NoiseFlameMaterial = THREE.ShaderMaterial | MeshBasicNodeMaterial;

export interface NoiseFlameAssembly {
  flame: THREE.Mesh;
  details: THREE.Object3D[];
  material: NoiseFlameMaterial;
}
