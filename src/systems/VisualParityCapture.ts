/**
 * Pure helpers for the WGP-02 visual parity browser capture matrix.
 */

import { VISUAL_PARITY_SCENES, type VisualParitySceneConfig } from "./VisualParityCompare";

export type VisualParityCaptureBackend = "webgl" | "webgpu";

export function parseVisualParityCaptureBackends(
  arg: string | undefined,
): VisualParityCaptureBackend[] {
  const raw = (arg ?? "both").trim().toLowerCase();
  if (raw === "webgl") return ["webgl"];
  if (raw === "webgpu") return ["webgpu"];
  if (raw === "both") return ["webgl", "webgpu"];
  throw new Error(`Backend must be webgl|webgpu|both; received ${JSON.stringify(arg)}`);
}

export function visualParitySceneById(sceneId: string): VisualParitySceneConfig {
  const scene = VISUAL_PARITY_SCENES.find((entry) => entry.id === sceneId);
  if (!scene) throw new Error(`Unknown parity scene ${sceneId}`);
  return scene;
}

export function buildVisualParitySceneUrl(options: {
  readonly baseUrl: string;
  readonly sceneId: string;
  readonly backend: VisualParityCaptureBackend;
  readonly crt?: "on" | "off";
}): string {
  const scene = visualParitySceneById(options.sceneId);
  const base = options.baseUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    seed: scene.seed,
    mood: scene.mood,
    floor: String(scene.floorIndex),
    renderer: options.backend,
    crt: options.crt === "on" ? "1" : "0",
    parityScene: scene.id,
  });
  return `${base}/?${params.toString()}`;
}
