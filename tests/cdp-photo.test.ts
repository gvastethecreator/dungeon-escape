import { describe, expect, test } from "bun:test";

import { listBiomeIds } from "../src/systems/BiomeIdentity";

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

  test("keeps G0 opt-in, real-biome selection, trace validation, and atomic evidence fail-closed", async () => {
    const source = await Bun.file(new URL("../scripts/cdp-photo.ts", import.meta.url)).text();

    expect(source).toContain("DUNGEON_LOAD_G0_SAMPLE_DIR");
    expect(source).toContain("DUNGEON_LOAD_G0_SAMPLE_ID is required in G0 mode.");
    expect(source).toContain("DUNGEON_LOAD_G0_WORKLOAD must match the explicit BIOME.");
    expect(source).toContain("G0 mode does not permit QA_STATE.");
    expect(source).toContain('await send(ws, "Page.addScriptToEvaluateOnNewDocument"');
    expect(source).toContain("blackflag.dungeon.player.v1");
    expect(source).toContain("name: 'unlock'");
    expect(source).toContain("const G0_HIGHEST_UNLOCKED_RANK = listBiomeIds().length - 1;");
    expect(source).toContain("highestUnlockedRank: ${JSON.stringify(G0_HIGHEST_UNLOCKED_RANK)},");
    expect(source).not.toContain("highestUnlockedRank: 20");
    const canonicalBiomeIds = listBiomeIds();
    const highestUnlockedRank = canonicalBiomeIds.length - 1;
    expect(Number.isInteger(highestUnlockedRank)).toBeTrue();
    expect(highestUnlockedRank).toBeGreaterThanOrEqual(0);
    expect(highestUnlockedRank).toBeLessThan(canonicalBiomeIds.length);
    expect(source).toContain("clears: { ancient: 1 }");
    expect(source).toContain("G0 did not open the real biome picker.");
    expect(source).toContain("waitForG0Trace");
    expect(source).toContain("dungeonLoadTrace");
    expect(source).toContain("validateDungeonLoadTrace");
    expect(source).toContain("dungeon-load-g0-browser-started/v1");
    expect(source).toContain("dungeon-load-g0-browser-sample/v1");
    expect(source).toContain("writeG0JsonAtomically");
    expect(source).toContain("await rename(temporary, destination)");
    expect(source).toContain('"timed_out"');
    expect(source).toContain('"cleanup_failed"');
    expect(source).toContain("trace: g0Trace,");
    expect(source).toContain(
      'metrics: status === "passed" && g0Trace ? g0TraceMetrics(g0Trace) : null',
    );
  });

  test("classifies CDP command timeouts by the active G0 phase", async () => {
    const source = await Bun.file(new URL("../scripts/cdp-photo.ts", import.meta.url)).text();

    expect(source).toContain("class CdpCommandTimeoutError extends Error");
    expect(source).toContain("new CdpCommandTimeoutError(method, phase, CDP_COMMAND_TIMEOUT_MS)");
    expect(source).toContain('readReadyState(ws, "app-ready")');
    expect(source).toContain('readReadyState(ws, "renderer-ready")');
    for (const phase of ["crt", "welcome-picker", "biome-start", "trace", "diagnostics"]) {
      expect(source).toContain(`"${phase}"`);
    }
    expect(source).toContain("error instanceof CdpCommandTimeoutError");
    expect(source).toContain("failurePhase: g0FailurePhase");
  });

  test("reports the resident campaign floor count instead of walkable cells", async () => {
    const [source, mainSource, runtimeTypes] = await Promise.all([
      Bun.file(new URL("../scripts/cdp-photo.ts", import.meta.url)).text(),
      Bun.file(new URL("../src/main.ts", import.meta.url)).text(),
      Bun.file(new URL("../src/types/runtime.d.ts", import.meta.url)).text(),
    ]);

    expect(source).toContain("diag?.getResidentFloorCount?.()");
    expect(source).toContain("Number.isInteger(residentFloorCount)");
    expect(source).toContain("residentFloorCount > 0");
    expect(source).not.toContain("runtime?.stats?.floorCount");
    expect(source).toContain("g0Diagnostics.floorCount !== 4");
    expect(mainSource).toContain("getResidentFloorCount: () => campaignFloorSet?.count ?? 1");
    expect(runtimeTypes).toContain("getResidentFloorCount(): number;");
  });
});
