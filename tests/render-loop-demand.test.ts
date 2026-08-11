import { describe, expect, test } from "bun:test";

describe("demand-driven Three render loop", () => {
  test("routes Play, editor, Welcome, and visibility through one scheduler policy", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(source).toContain("return shouldRunGameRenderLoop({");
    expect(source).toContain("engineMode,");
    expect(source).toContain("visibilityState: document.visibilityState,");
    expect(source).toContain("syncThreeRenderLoop();");
    expect(source).toContain('document.addEventListener("visibilitychange", syncThreeRenderLoop)');
    expect(source).toContain("animationFrameId = 0;\n  if (!shouldRunThreeRenderLoop()) return;");
  });
});
