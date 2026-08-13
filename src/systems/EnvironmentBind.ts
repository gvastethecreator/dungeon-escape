import * as THREE from "three";

import type { DungeonRenderer } from "./DungeonRenderer";

export interface PmremAdapter {
  compileEquirectangularShader(): void | Promise<void>;
  fromScene(scene: THREE.Object3D, sigma?: number): { texture: THREE.Texture };
  dispose(): void;
}

function isWebGpuRenderer(renderer: DungeonRenderer): boolean {
  const raw = renderer as {
    backend?: { isWebGPUBackend?: boolean };
  };
  return raw.backend?.isWebGPUBackend === true;
}

/**
 * WebGL uses `THREE.PMREMGenerator`. WebGPU lazily loads `three/webgpu`.
 * The WebGL critical path never value-imports the WebGPU module.
 */
export async function createPmremAdapter(renderer: DungeonRenderer): Promise<PmremAdapter | null> {
  if (isWebGpuRenderer(renderer)) {
    const { PMREMGenerator } = await import("three/webgpu");
    return new PMREMGenerator(renderer as never) as unknown as PmremAdapter;
  }
  return new THREE.PMREMGenerator(renderer as unknown as THREE.WebGLRenderer);
}
