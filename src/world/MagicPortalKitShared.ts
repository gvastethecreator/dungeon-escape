import type * as THREE from "three";
import type { MeshBasicNodeMaterial } from "three/webgpu";

/** Field vortex vs spiral current layer. */
export type MagicPortalShaderVariant = "field" | "spiral";

/** Uniform handles shared by GLSL ShaderMaterial uniforms and TSL UniformNode values. */
export interface MagicPortalUniformHandles {
  uTime: { value: number };
  uDeepColor: { value: THREE.Color };
  uMagicColor: { value: THREE.Color };
  uBrightColor: { value: THREE.Color };
  uPrimaryArms: { value: number };
  uSecondaryArms: { value: number };
  uRadialFrequency: { value: number };
  uFlowSpeed: { value: number };
  uCounterSpeed: { value: number };
  uSpiralSharpness: { value: number };
}

export type MagicPortalShaderMaterial = THREE.ShaderMaterial | MeshBasicNodeMaterial;
