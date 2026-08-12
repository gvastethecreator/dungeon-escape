import type * as THREE from "three";
import type { MeshBasicNodeMaterial } from "three/webgpu";
import type { PointsNodeMaterial } from "three/webgpu";

import type { BiomeParticleLayerProfile } from "./BiomeParticleProfile";

/** Uniform handles shared by GLSL ShaderMaterial uniforms and TSL UniformNode values. */
export interface SoftGroundFogUniformHandles {
  uColor: { value: THREE.Color };
  uDensity: { value: number };
  uHeight: { value: number };
  uTime: { value: number };
  uBetaGround: { value: number };
  uBetaAir: { value: number };
  uDistFalloff: { value: number };
  uMaxDist: { value: number };
  uMaxAlpha: { value: number };
  uHalfExtent: { value: number };
  uFloorMask: { value: THREE.Texture };
  uWorldMin: { value: THREE.Vector2 };
  uWorldSize: { value: THREE.Vector2 };
  uBoxCenter: { value: THREE.Vector2 };
}

export type SoftGroundFogMaterial = THREE.ShaderMaterial | MeshBasicNodeMaterial;

export interface SoftGroundFogMaterialInput {
  readonly color: THREE.Color;
  readonly density: number;
  readonly mask: THREE.DataTexture;
  readonly worldMin: THREE.Vector2;
  readonly worldSize: THREE.Vector2;
  readonly wallHeight: number;
}

/** Uniform handles shared by GLSL ShaderMaterial uniforms and TSL UniformNode values. */
export interface BiomeParticleUniformHandles {
  map: { value: THREE.Texture };
  uColor: { value: THREE.Color };
  uColorAlt: { value: THREE.Color };
  uOpacity: { value: number };
  uTime: { value: number };
  uPixelRatio: { value: number };
  uAtten: { value: number };
  uMotion: { value: number };
  uShape: { value: number };
  uFlow: { value: THREE.Vector3 };
  uSpeed: { value: number };
  uTurbulence: { value: number };
  uWallHeight: { value: number };
  uViewer: { value: THREE.Vector3 };
  uWake: { value: number };
}

export type BiomeParticleMaterial = THREE.ShaderMaterial | PointsNodeMaterial;

export interface BiomeParticleMaterialInput {
  readonly map: THREE.Texture;
  readonly layer: BiomeParticleLayerProfile;
  readonly wallHeight: number;
}

export interface BiomeParticleGeometryData {
  readonly positions: Float32Array;
  readonly sizes: Float32Array;
  readonly phases: Float32Array;
  readonly tints: Float32Array;
  readonly count: number;
}

export interface BiomeParticleAssembly {
  readonly object: THREE.Points | THREE.Sprite;
  readonly material: BiomeParticleMaterial;
  readonly primitive: "points" | "sprite";
  readonly count: number;
}
