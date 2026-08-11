import { describe, expect, test } from "bun:test";

import {
  resolveEditorCanvasPixelRatio,
  shouldRunGameRenderLoop,
} from "../src/editor/EditorRuntimePolicy";

describe("editor runtime policy", () => {
  test("runs the Three.js loop only for a visible Play session", () => {
    const base = {
      appDisposed: false,
      visibilityState: "visible" as const,
      welcomeOpen: false,
    };

    expect(shouldRunGameRenderLoop({ ...base, engineMode: "play" })).toBe(true);
    expect(shouldRunGameRenderLoop({ ...base, engineMode: "editor" })).toBe(false);
    expect(shouldRunGameRenderLoop({ ...base, engineMode: "debug" })).toBe(false);
    expect(
      shouldRunGameRenderLoop({ ...base, engineMode: "play", visibilityState: "hidden" }),
    ).toBe(false);
    expect(shouldRunGameRenderLoop({ ...base, engineMode: "play", welcomeOpen: true })).toBe(false);
  });

  test("caps pixel-art backing buffers without lowering normal CSS resolution", () => {
    expect(resolveEditorCanvasPixelRatio(2, true, 300_000)).toBe(1);
    expect(resolveEditorCanvasPixelRatio(2, false, 1_000_000)).toBe(1);
    expect(resolveEditorCanvasPixelRatio(2, false, 400_000)).toBe(1.25);
    expect(resolveEditorCanvasPixelRatio(Number.NaN, false, 400_000)).toBe(1);
  });
});
