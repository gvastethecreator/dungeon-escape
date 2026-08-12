/**
 * Type-resolution surface for `three/webgpu` and `three/tsl`.
 * Kept out of the lazy shell import graph; typechecked with the client project.
 * Runtime consumers (WGP-08+) import from here or from the same package paths.
 */

import * as WEBGPU from "three/webgpu";
import { color, float, mix, uv } from "three/tsl";

export type WebGpuRenderer = WEBGPU.WebGPURenderer;
export type WebGpuRenderPipeline = WEBGPU.RenderPipeline;
export type MeshStandardNodeMaterial = WEBGPU.MeshStandardNodeMaterial;
export type SpriteNodeMaterial = WEBGPU.SpriteNodeMaterial;

/** Compile-time proof that the installed three@r185 WebGPU/TSL surface resolves. */
export function createWebGpuTypeSurfaceProbe(canvas: HTMLCanvasElement): {
  renderer: WEBGPU.WebGPURenderer;
  material: WEBGPU.MeshStandardNodeMaterial;
  pipeline: WEBGPU.RenderPipeline;
} {
  const renderer = new WEBGPU.WebGPURenderer({ canvas, antialias: false });
  const material = new WEBGPU.MeshStandardNodeMaterial();
  material.colorNode = mix(color(0x223344), color(0xffaa55), uv().y).mul(float(1.1));
  const pipeline = new WEBGPU.RenderPipeline(renderer);
  return { renderer, material, pipeline };
}

export const WEBGPU_TYPE_SURFACE = {
  WebGPURenderer: WEBGPU.WebGPURenderer,
  RenderPipeline: WEBGPU.RenderPipeline,
  MeshStandardNodeMaterial: WEBGPU.MeshStandardNodeMaterial,
  SpriteNodeMaterial: WEBGPU.SpriteNodeMaterial,
  PMREMGenerator: WEBGPU.PMREMGenerator,
} as const;
