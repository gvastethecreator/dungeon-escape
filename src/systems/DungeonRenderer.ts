import type { Camera, Object3D, ToneMapping, WebGLRenderTarget } from "three";

/**
 * Narrow renderer surface used by Play systems (`LightingRig`, `PovPostFx`).
 * Structural and intentionally smaller than Three's concrete renderers so the
 * expand phase can swap backends without rewriting every call site.
 */
export interface DungeonRenderer {
  render(scene: Object3D, camera: Camera): void;
  setRenderTarget(
    target: WebGLRenderTarget | null,
    activeCubeFace?: number,
    activeMipmapLevel?: number,
  ): void;
  getRenderTarget(): WebGLRenderTarget | null;
  clear(color?: boolean, depth?: boolean, stencil?: boolean): void;
  setAnimationLoop(callback: XRFrameRequestCallback | null): void;
  toneMapping: ToneMapping;
  autoClear: boolean;
}
