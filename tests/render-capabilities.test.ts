import { describe, expect, test } from "bun:test";

import {
  detectRenderCapabilities,
  isFirefoxUserAgent,
  raceWithTimeout,
} from "../src/systems/RenderCapabilities";

describe("render capabilities", () => {
  test("detects Firefox from user agent", () => {
    expect(isFirefoxUserAgent("Mozilla/5.0 Firefox/153.0")).toBe(true);
    expect(isFirefoxUserAgent("Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36")).toBe(false);
    expect(isFirefoxUserAgent("Mozilla/5.0 SeaMonkey/2.53")).toBe(false);
  });

  test("Firefox profile disables CRT and precompile by default", () => {
    const caps = detectRenderCapabilities({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0",
      hardwareConcurrency: 16,
      search: "",
    });
    expect(caps.isFirefox).toBe(true);
    expect(caps.enableCrtByDefault).toBe(false);
    expect(caps.skipShaderPrecompile).toBe(true);
    expect(caps.preferDefaultGpu).toBe(true);
    expect(caps.pixelRatioCap).toBe(1);
    expect(caps.compileTimeoutMs).toBeLessThanOrEqual(2_500);
  });

  test("Chrome desktop keeps CRT and full precompile", () => {
    const caps = detectRenderCapabilities({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      hardwareConcurrency: 16,
      deviceMemory: 16,
      search: "",
    });
    expect(caps.isFirefox).toBe(false);
    expect(caps.enableCrtByDefault).toBe(true);
    expect(caps.skipShaderPrecompile).toBe(false);
    expect(caps.preferDefaultGpu).toBe(false);
    expect(caps.pixelRatioCap).toBe(1.25);
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
  });

  test("query overrides force quality or safe render", () => {
    const forced = detectRenderCapabilities({
      userAgent: "Mozilla/5.0 Firefox/153.0",
      hardwareConcurrency: 8,
      search: "?quality=1",
    });
    expect(forced.skipShaderPrecompile).toBe(false);
    expect(forced.enableCrtByDefault).toBe(true);

    const safe = detectRenderCapabilities({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      hardwareConcurrency: 16,
      deviceMemory: 16,
      search: "?safeRender=1",
    });
    expect(safe.skipShaderPrecompile).toBe(true);
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

  test("uses a parsed override snapshot without falling back to search", () => {
    const caps = detectRenderCapabilities({
      userAgent: "Mozilla/5.0 Firefox/153.0",
      hardwareConcurrency: 8,
      search: "?quality=1&crt=1",
      overrides: { quality: null, crt: null, safeRender: null },
    });

    expect(caps.skipShaderPrecompile).toBe(true);
    expect(caps.enableCrtByDefault).toBe(false);
  });

  test("raceWithTimeout resolves success and timeout", async () => {
    const ok = await raceWithTimeout(Promise.resolve(42), 100);
    expect(ok).toEqual({ ok: true, value: 42 });

    const slow = await raceWithTimeout(
      new Promise<number>((resolve) => setTimeout(() => resolve(1), 200)),
      30,
      "warmup-timeout",
    );
    expect(slow.ok).toBe(false);
    if (!slow.ok) expect(slow.reason).toBe("warmup-timeout");
  });
});
