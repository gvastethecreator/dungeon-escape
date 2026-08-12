import { describe, expect, test } from "bun:test";

import {
  buildVisualParitySceneUrl,
  parseVisualParityCaptureBackends,
  visualParitySceneById,
} from "../src/systems/VisualParityCapture";
import { VISUAL_PARITY_SCENES } from "../src/systems/VisualParityCompare";

describe("visual parity capture matrix", () => {
  test("parses backend selectors", () => {
    expect(parseVisualParityCaptureBackends("webgl")).toEqual(["webgl"]);
    expect(parseVisualParityCaptureBackends("webgpu")).toEqual(["webgpu"]);
    expect(parseVisualParityCaptureBackends("both")).toEqual(["webgl", "webgpu"]);
    expect(parseVisualParityCaptureBackends(undefined)).toEqual(["webgl", "webgpu"]);
    expect(() => parseVisualParityCaptureBackends("metal")).toThrow(/Backend must be/);
  });

  test("builds deterministic scene URLs for every matrix id", () => {
    for (const scene of VISUAL_PARITY_SCENES) {
      const url = buildVisualParitySceneUrl({
        baseUrl: "http://127.0.0.1:24211",
        sceneId: scene.id,
        backend: "webgpu",
        crt: "off",
      });
      expect(url).toContain(`seed=${encodeURIComponent(scene.seed)}`);
      expect(url).toContain(`mood=${scene.mood}`);
      expect(url).toContain("renderer=webgpu");
      expect(url).toContain(`parityScene=${scene.id}`);
      expect(visualParitySceneById(scene.id).channelTolerance).toBe(scene.channelTolerance);
    }
  });
});
