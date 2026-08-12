import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  detectRenderCapabilities,
  detectRendererCompileCapabilities,
  isFirefoxUserAgent,
} from "../src/systems/RenderCapabilities";

describe("render capabilities", () => {
  test("production avoids synchronous shader diagnostic reads", () => {
    const source = readFileSync("src/main.ts", "utf8");

    expect(source).toContain("if (import.meta.env.PROD) renderer.debug.checkShaderErrors = false;");
  });

  test("detects Firefox from user agent", () => {
    expect(isFirefoxUserAgent("Mozilla/5.0 Firefox/153.0")).toBe(true);
    expect(isFirefoxUserAgent("Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36")).toBe(false);
    expect(isFirefoxUserAgent("Mozilla/5.0 SeaMonkey/2.53")).toBe(false);
  });

  test("Firefox profile disables CRT and uses the short readiness deadline by default", () => {
    const caps = detectRenderCapabilities({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0",
      hardwareConcurrency: 16,
      search: "",
    });
    expect(caps.isFirefox).toBe(true);
    expect(caps.enableCrtByDefault).toBe(false);
    expect(caps.telemetryPath).toBe("firefox");
    expect(caps.rendererReadyTimeoutMs).toBe(2_500);
    expect(caps.preferDefaultGpu).toBe(true);
    expect(caps.pixelRatioCap).toBe(1);
    expect(caps.allowAsyncShaderWarmup).toBe(false);
  });

  test("Chrome desktop keeps the full readiness deadline with CRT opt-in", () => {
    const caps = detectRenderCapabilities({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      hardwareConcurrency: 16,
      deviceMemory: 16,
      search: "",
    });
    expect(caps.isFirefox).toBe(false);
    expect(caps.enableCrtByDefault).toBe(false);
    expect(caps.telemetryPath).toBe("default");
    expect(caps.rendererReadyTimeoutMs).toBe(8_000);
    expect(caps.preferDefaultGpu).toBe(false);
    expect(caps.pixelRatioCap).toBe(1.25);
    expect(caps.allowAsyncShaderWarmup).toBe(true);
  });

  test("low-end hosts get a safer path without claiming Firefox", () => {
    const caps = detectRenderCapabilities({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      hardwareConcurrency: 4,
      deviceMemory: 4,
      search: "",
    });
    expect(caps.isFirefox).toBe(false);
    expect(caps.isLowEnd).toBe(true);
    expect(caps.enableCrtByDefault).toBe(false);
    expect(caps.preferDefaultGpu).toBe(true);
    expect(caps.telemetryPath).toBe("low-end");
    expect(caps.allowAsyncShaderWarmup).toBe(false);
  });

  test("query overrides force quality or safe render", () => {
    const forced = detectRenderCapabilities({
      userAgent: "Mozilla/5.0 Firefox/153.0",
      hardwareConcurrency: 8,
      search: "?quality=1",
    });
    expect(forced.telemetryPath).toBe("firefox");
    expect(forced.rendererReadyTimeoutMs).toBe(8_000);
    expect(forced.enableCrtByDefault).toBe(false);

    const forcedCrt = detectRenderCapabilities({
      userAgent: "Mozilla/5.0 Firefox/153.0",
      hardwareConcurrency: 8,
      search: "?quality=1&crt=1",
    });
    expect(forcedCrt.enableCrtByDefault).toBe(true);

    const safe = detectRenderCapabilities({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      hardwareConcurrency: 16,
      deviceMemory: 16,
      search: "?safeRender=1",
    });
    expect(safe.telemetryPath).toBe("safe");
    expect(safe.rendererReadyTimeoutMs).toBe(2_500);
    expect(safe.enableCrtByDefault).toBe(false);

    const crtOff = detectRenderCapabilities({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      hardwareConcurrency: 16,
      deviceMemory: 16,
      search: "?crt=0",
    });
    expect(crtOff.enableCrtByDefault).toBe(false);
  });

  test("requires both renderer async compilation and parallel shader completion", () => {
    const supported = detectRendererCompileCapabilities({
      compileAsync() {},
      extensions: { get: (name) => (name === "KHR_parallel_shader_compile" ? {} : null) },
    });
    expect(supported).toEqual({
      hasCompileAsync: true,
      hasParallelShaderCompile: true,
      canCompileAsync: true,
    });

    const missingExtension = detectRendererCompileCapabilities({
      compileAsync() {},
      extensions: { get: () => null },
    });
    expect(missingExtension.canCompileAsync).toBe(false);

    const missingMethod = detectRendererCompileCapabilities({
      extensions: { get: () => ({}) },
    });
    expect(missingMethod.canCompileAsync).toBe(false);
  });

  test("uses a parsed override snapshot without falling back to search", () => {
    const caps = detectRenderCapabilities({
      userAgent: "Mozilla/5.0 Firefox/153.0",
      hardwareConcurrency: 8,
      search: "?quality=1&crt=1",
      overrides: { quality: null, crt: null, safeRender: null, renderer: "auto" },
    });

    expect(caps.telemetryPath).toBe("firefox");
    expect(caps.rendererReadyTimeoutMs).toBe(2_500);
    expect(caps.enableCrtByDefault).toBe(false);
    expect(caps.requestedRenderer).toBe("auto");
  });

  test("publishes requested renderer preference from overrides or search", () => {
    expect(
      detectRenderCapabilities({
        overrides: { quality: null, crt: null, safeRender: null, renderer: "webgpu" },
      }).requestedRenderer,
    ).toBe("webgpu");
    expect(
      detectRenderCapabilities({
        search: "?renderer=webgl",
      }).requestedRenderer,
    ).toBe("webgl");
  });

  test("main incrementally compiles supported resident floors without retaining replacement worlds", () => {
    const source = readFileSync("src/main.ts", "utf8");
    const start = source.indexOf("function startRendererWarmup(");
    const end = source.indexOf("\nfunction clearObjectiveBannerTimers", start);
    const warmup = source.slice(start, end);

    expect(warmup).toContain("renderCaps.allowAsyncShaderWarmup && renderCaps.canCompileAsync");
    expect(warmup).toContain("compileRendererWarmupBatches()");
    expect(warmup).toContain("povPost.warmup(renderer, scene, camera);");
    expect(warmup).toContain("povPost.render(renderer, scene, camera);");
    expect(source).toContain("renderer.compileAsync(scene, camera)");
    expect(source).toContain("await waitAnimationFrames(1);");
    expect(source).toContain("ASYNC_SHADER_WARMUP_BUDGET_MS = 2_000");
    expect(warmup).not.toContain("renderer.compile(");
    expect(warmup).not.toContain("compileScene(");
    expect(warmup).not.toContain("rendererWarmupQueue");
    expect(source).toContain("Do not retain a replaced world's roots");
    expect(warmup).toContain("world.setPickupEffectsWarmupVisible(false);");
  });
});
