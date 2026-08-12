import * as THREE from "three";

import type { LaunchRendererPreference } from "../launch/LaunchConfiguration";
import type { DungeonRenderer } from "./DungeonRenderer";
import {
  detectWebGpuAvailability,
  type WebGpuAvailability,
} from "./WebGpuAvailability";

export type PlayRendererBackend = "webgl" | "webgpu";

export interface PlayRendererCreateOptions {
  readonly canvas: HTMLCanvasElement;
  readonly preference: LaunchRendererPreference;
  readonly preferDefaultGpu: boolean;
  /** When true, force WebGPU even if preference is auto (unused until staged flip). */
  readonly preferWebGpuWhenAuto?: boolean;
}

export interface PlayRendererHandle {
  readonly renderer: DungeonRenderer;
  readonly backend: PlayRendererBackend;
  readonly requested: LaunchRendererPreference;
  readonly availability: WebGpuAvailability;
  readonly fellBack: boolean;
  readonly fallbackReason: string | null;
  readonly initDurationMs: number;
  readonly isWebGpuRenderer: boolean;
  /** Concrete Three renderer for diagnostics that still need backend-specific fields. */
  readonly raw: THREE.WebGLRenderer | { isWebGPURenderer?: boolean; backend?: { constructor?: { name?: string } } };
  dispose(): void;
}

function createWebGlRenderer(
  canvas: HTMLCanvasElement,
  preferDefaultGpu: boolean,
): THREE.WebGLRenderer {
  const common = { canvas, antialias: false as const };
  try {
    return new THREE.WebGLRenderer({
      ...common,
      powerPreference: preferDefaultGpu ? "default" : "high-performance",
    });
  } catch (error) {
    console.warn("Primary WebGL context failed; retrying with defaults", error);
    return new THREE.WebGLRenderer(common);
  }
}

async function createWebGpuRenderer(canvas: HTMLCanvasElement): Promise<{
  renderer: DungeonRenderer;
  raw: { isWebGPURenderer?: boolean; backend?: { constructor?: { name?: string } }; dispose(): void };
}> {
  const WEBGPU = await import("three/webgpu");
  const renderer = new WEBGPU.WebGPURenderer({
    canvas,
    antialias: false,
    forceWebGL: false,
  });
  await renderer.init();
  return {
    renderer: renderer as unknown as DungeonRenderer,
    raw: renderer as unknown as {
      isWebGPURenderer?: boolean;
      backend?: { constructor?: { name?: string } };
      dispose(): void;
    },
  };
}

export async function createPlayRendererHandle(
  options: PlayRendererCreateOptions,
): Promise<PlayRendererHandle> {
  const startedAt = performance.now();
  const availability = await detectWebGpuAvailability();
  const wantsWebGpu =
    options.preference === "webgpu" ||
    (options.preference === "auto" && options.preferWebGpuWhenAuto === true);

  if (wantsWebGpu) {
    if (!availability.hasAdapter) {
      if (options.preference === "webgpu") {
        throw new Error(
          `WebGPU was requested (?renderer=webgpu) but no adapter is available (${availability.failureReason ?? "unknown"}).`,
        );
      }
      const webgl = createWebGlRenderer(options.canvas, options.preferDefaultGpu);
      return {
        renderer: webgl,
        backend: "webgl",
        requested: options.preference,
        availability,
        fellBack: true,
        fallbackReason: availability.failureReason ?? "no-adapter",
        initDurationMs: performance.now() - startedAt,
        isWebGpuRenderer: false,
        raw: webgl,
        dispose: () => webgl.dispose(),
      };
    }

    try {
      const created = await createWebGpuRenderer(options.canvas);
      const backendName = created.raw.backend?.constructor?.name ?? "";
      const actuallyWebGpu = /WebGPU/i.test(backendName) || created.raw.isWebGPURenderer === true;
      return {
        renderer: created.renderer,
        backend: actuallyWebGpu ? "webgpu" : "webgl",
        requested: options.preference,
        availability,
        fellBack: !actuallyWebGpu,
        fallbackReason: actuallyWebGpu ? null : "webgpu-renderer-fell-back-to-webgl2",
        initDurationMs: performance.now() - startedAt,
        isWebGpuRenderer: actuallyWebGpu,
        raw: created.raw,
        dispose: () => created.raw.dispose(),
      };
    } catch (error) {
      if (options.preference === "webgpu") {
        throw error instanceof Error
          ? error
          : new Error("WebGPU renderer failed to initialize.");
      }
      console.warn("WebGPU renderer init failed; falling back to WebGL", error);
      const webgl = createWebGlRenderer(options.canvas, options.preferDefaultGpu);
      return {
        renderer: webgl,
        backend: "webgl",
        requested: options.preference,
        availability,
        fellBack: true,
        fallbackReason: "webgpu-init-failed",
        initDurationMs: performance.now() - startedAt,
        isWebGpuRenderer: false,
        raw: webgl,
        dispose: () => webgl.dispose(),
      };
    }
  }

  const webgl = createWebGlRenderer(options.canvas, options.preferDefaultGpu);
  return {
    renderer: webgl,
    backend: "webgl",
    requested: options.preference,
    availability,
    fellBack: false,
    fallbackReason: null,
    initDurationMs: performance.now() - startedAt,
    isWebGpuRenderer: false,
    raw: webgl,
    dispose: () => webgl.dispose(),
  };
}

export function readPlayRendererBackendName(handle: PlayRendererHandle): string {
  if (!handle.isWebGpuRenderer) return "WebGLRenderer";
  const backendName = (handle.raw as { backend?: { constructor?: { name?: string } } }).backend
    ?.constructor?.name;
  return backendName ?? "WebGPURenderer";
}
