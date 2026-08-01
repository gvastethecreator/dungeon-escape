import { describe, expect, test } from "bun:test";

describe("demand-driven Three render loop", () => {
  test("pauses for Welcome and hidden documents and resumes through one scheduler", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(source).toContain('!welcomeOpen && document.visibilityState === "visible"');
    expect(source).toContain("syncThreeRenderLoop();");
    expect(source).toContain('document.addEventListener("visibilitychange", syncThreeRenderLoop)');
    expect(source).toContain("animationFrameId = 0;\n  if (!shouldRunThreeRenderLoop()) return;");
  });
});
