import { describe, expect, test } from "bun:test";

describe("CDP live-scene photo tool", () => {
  test("targets real campaign biomes and exact instanced props", async () => {
    const source = await Bun.file(new URL("../scripts/cdp-photo.ts", import.meta.url)).text();

    expect(source).toContain("process.env.BIOME ?? moodParam");
    expect(source).toContain(".biome-picker-option[data-biome-id=");
    expect(source).toContain("target.isInstancedMesh");
    expect(source).toContain("target.getMatrixAt(resolvedIndex, local)");
    expect(source).toContain("target.matrixWorld.clone().multiply(local)");
    expect(source).toContain("ctrl.restorePose({");
    expect(source).toContain("const qaQuery = `&perfAudit=1");
    expect(source).not.toContain("ctrl.position.set(wp.x");
  });

  test("captures explicit CRT states and restores controls before a performance run", async () => {
    const source = await Bun.file(new URL("../scripts/cdp-photo.ts", import.meta.url)).text();

    expect(source).toContain('CRT !== "on" && CRT !== "off"');
    expect(source).toContain('process.env.PHOTO_SIMULATION ?? "on"');
    expect(source).toContain('PHOTO_SIMULATION === "on"');
    expect(source).toContain("Live photo simulation could not start");
    expect(source).toContain("toggle.getAttribute('aria-pressed')");
    expect(source).toContain("ctrl.setEnabled(false)");
    expect(source).toContain("ctrl.setEnabled(true)");
    expect(source).toContain("await waitForGameReady(ws);");
    expect(source).toContain('await send(ws, "Log.enable")');
    expect(source).toContain('await send(ws, "Network.enable")');
    expect(source).toContain("capture-manifest.json");
    expect(source).toContain("browserErrors");
    expect(source).toContain("networkErrors");
    expect(source).toContain("EVAL_ERROR");
    expect(source).toContain("p95: gaps.p95");
    expect(source).toContain("p99: gaps.p99");
    expect(source).toContain("max: gaps.max");
  });

  test("waits for the menu before starting a run and only then requires renderer warmup", async () => {
    const source = await Bun.file(new URL("../scripts/cdp-photo.ts", import.meta.url)).text();
    const appReady = source.indexOf("await waitForAppReady(ws);");
    const picker = source.indexOf("const openedPicker");
    const pickerStarted = source.indexOf("Biome picker did not start a new game.");
    const gameReady = source.indexOf("await waitForGameReady(ws);", pickerStarted);

    expect(appReady).toBeGreaterThan(-1);
    expect(appReady).toBeLessThan(picker);
    expect(gameReady).toBeGreaterThan(pickerStarted);
    expect(source).toContain("if (qaState)");
    expect(source).toContain("boot.hidden = true");
  });
});
