import { describe, expect, test } from "bun:test";

import type { DungeonDomainState } from "../src/domain/bridge";
import {
  LOCAL_RUN_SAVE_KEY,
  LOCAL_RUN_SAVE_VERSION,
  canContinueLocalRun,
  readLocalRunSave,
  writeLocalRunSave,
  type LocalRunResumeState,
} from "../src/game/LocalRunSave";

function state(overrides: Partial<DungeonDomainState> = {}): DungeonDomainState {
  return {
    floor: 1,
    room: "Entrance",
    mapped: 0.1,
    threat: 0,
    seed: "SAVE-1",
    roomTarget: 16,
    loopRate: 20,
    decorDensity: 60,
    mapWidth: 73,
    mapHeight: 73,
    minRoomSize: 5,
    maxRoomSize: 9,
    corridorRadius: 0,
    roomPadding: 2,
    enemyDensity: 50,
    lightLevel: 70,
    profile: "balanced",
    exploredCells: 1,
    hasRelic: false,
    exitReached: false,
    resolve: 74,
    foundStoneIds: ["ember"],
    portalOpen: false,
    runMode: "playing",
    engineMode: "play",
    topologySignature: "saved-map",
    ...overrides,
  };
}

function resume(overrides: Partial<LocalRunResumeState> = {}): LocalRunResumeState {
  return {
    runSeconds: 187.5,
    difficultyElapsed: 190.2,
    player: {
      x: 4.2,
      y: 1.62,
      z: -11.8,
      yaw: 1.1,
      pitch: -0.2,
      distanceTravelled: 84,
    },
    visitedCells: ["10,12", "11,12", "12,12"],
    timeFreezeRemaining: 2.5,
    luminousWardRemaining: 0,
    perStoneSeconds: { ember: 42 },
    ...overrides,
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe("local dungeon continue save", () => {
  test("round-trips a live domain and session snapshot", () => {
    const storage = memoryStorage();
    expect(writeLocalRunSave(state(), storage, 1234, undefined, "campaign")).toBe(true);
    expect(readLocalRunSave(storage)).toEqual({
      version: LOCAL_RUN_SAVE_VERSION,
      savedAt: 1234,
      runSource: "campaign",
      state: state(),
    });
    expect(canContinueLocalRun(readLocalRunSave(storage))).toBe(true);
  });

  test("round-trips resume clock, pose, and power timers", () => {
    const storage = memoryStorage();
    const payload = resume();
    expect(writeLocalRunSave(state(), storage, 5678, payload)).toBe(true);
    const loaded = readLocalRunSave(storage);
    expect(loaded?.version).toBe(LOCAL_RUN_SAVE_VERSION);
    expect(loaded?.resume).toEqual(payload);
    expect(canContinueLocalRun(loaded)).toBe(true);
  });

  test("continues reproducible custom seeds but fails closed for imported Forge maps", () => {
    const storage = memoryStorage();
    expect(writeLocalRunSave(state(), storage, 7, resume(), "custom", "procedural")).toBe(true);
    expect(readLocalRunSave(storage)).toMatchObject({
      runSource: "custom",
      customMapKind: "procedural",
    });
    expect(canContinueLocalRun(readLocalRunSave(storage))).toBe(true);

    expect(writeLocalRunSave(state(), storage, 8, resume(), "custom", "forge")).toBe(true);
    expect(readLocalRunSave(storage)).toMatchObject({
      runSource: "custom",
      customMapKind: "forge",
    });
    expect(canContinueLocalRun(readLocalRunSave(storage))).toBe(false);

    storage.setItem(
      LOCAL_RUN_SAVE_KEY,
      JSON.stringify({ version: 3, savedAt: 6, state: state(), runSource: "custom" }),
    );
    expect(canContinueLocalRun(readLocalRunSave(storage))).toBe(false);
  });

  test("still reads legacy v1 saves without resume", () => {
    const storage = memoryStorage();
    storage.setItem(LOCAL_RUN_SAVE_KEY, JSON.stringify({ version: 1, savedAt: 9, state: state() }));
    expect(readLocalRunSave(storage)).toEqual({
      version: 1,
      savedAt: 9,
      state: state(),
    });
  });

  test("rejects malformed resume or finished saves", () => {
    const storage = memoryStorage();
    storage.setItem(LOCAL_RUN_SAVE_KEY, JSON.stringify({ version: 1, savedAt: 2, state: {} }));
    expect(readLocalRunSave(storage)).toBeNull();
    expect(canContinueLocalRun({ version: 1, savedAt: 2, state: state({ runMode: "won" }) })).toBe(
      false,
    );
    storage.setItem(
      LOCAL_RUN_SAVE_KEY,
      JSON.stringify({
        version: LOCAL_RUN_SAVE_VERSION,
        savedAt: 3,
        state: state(),
        resume: { ...resume(), runSeconds: -1 },
      }),
    );
    expect(readLocalRunSave(storage)).toBeNull();

    storage.setItem(
      LOCAL_RUN_SAVE_KEY,
      JSON.stringify({
        version: LOCAL_RUN_SAVE_VERSION,
        savedAt: 4,
        state: state(),
        resume: {
          ...resume(),
          difficultyElapsed: 1e300,
          player: { ...resume().player, distanceTravelled: 1e300 },
        },
      }),
    );
    expect(readLocalRunSave(storage)).toBeNull();

    for (const maliciousTimer of [
      { timeFreezeRemaining: 10.01 },
      { luminousWardRemaining: 15.01 },
      { annihilationPulseRemaining: 13.01 },
      { mobilityBoostRemaining: 14.01 },
      { fogClearRemaining: 20.01 },
    ]) {
      storage.setItem(
        LOCAL_RUN_SAVE_KEY,
        JSON.stringify({
          version: LOCAL_RUN_SAVE_VERSION,
          savedAt: 5,
          state: state(),
          resume: { ...resume(), ...maliciousTimer },
        }),
      );
      expect(readLocalRunSave(storage)).toBeNull();
    }
  });

  test("routes changed cells and browser lifecycle through the save coordinator", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const frameStart = source.indexOf("function frame(now: number): void {");
    const changedCellStart = source.indexOf("if (result.changedCell) {", frameStart);
    const changedCellEnd = source.indexOf("\n  } else if (now - lastMapDraw", changedCellStart);

    expect(source).toContain("const localRunSave = new LocalRunSaveCoordinator({");
    expect(source).not.toContain("localSaveTimer");
    expect(source).not.toContain("localSaveFailureNotified");
    expect(source).not.toContain("function scheduleLocalRunSave");
    expect(frameStart).toBeGreaterThanOrEqual(0);
    expect(changedCellStart).toBeGreaterThan(frameStart);
    expect(changedCellEnd).toBeGreaterThan(changedCellStart);
    expect(source.slice(changedCellStart, changedCellEnd)).toContain("localRunSave.schedule();");
    expect(source).toContain('window.addEventListener("pagehide", () => localRunSave.flush());');
    expect(source).toContain(
      'document.addEventListener("visibilitychange", flushLocalRunSaveWhenHidden);',
    );
    expect(source).toContain('if (document.visibilityState === "hidden") localRunSave.flush();');
    const pagehideStart = source.indexOf(
      'window.addEventListener("pagehide", () => localRunSave.flush());',
    );
    const beforeUnloadStart = source.indexOf('window.addEventListener("beforeunload", () => {');
    expect(pagehideStart).toBeGreaterThanOrEqual(0);
    expect(beforeUnloadStart).toBeGreaterThan(pagehideStart);
    expect(source.slice(pagehideStart, beforeUnloadStart)).not.toContain(".dispose()");
    expect(source.slice(beforeUnloadStart)).toContain("localRunSave.flush();");
    expect(source.slice(beforeUnloadStart)).toContain("localRunSave.dispose();");
    expect(source).toContain("if (appDisposed) return;");
    expect(source).toContain("renderer.setAnimationLoop(null);");
    expect(source).toContain("playRendererHandle.dispose();");
  });

  test("keeps storage writes and user failure copy in host callbacks", async () => {
    const blockedStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("Storage quota exceeded");
      },
      removeItem: () => undefined,
    };
    expect(writeLocalRunSave(state(), blockedStorage, 42)).toBe(false);

    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const coordinatorStart = source.indexOf("const localRunSave = new LocalRunSaveCoordinator({");
    const coordinatorEnd = source.indexOf("\n});", coordinatorStart) + 4;
    const coordinatorSource = source.slice(coordinatorStart, coordinatorEnd);

    expect(coordinatorStart).toBeGreaterThanOrEqual(0);
    expect(coordinatorEnd).toBeGreaterThan(coordinatorStart);
    expect(source).toContain("return writeLocalRunSave(");
    expect(source).toContain('dungeon.forge ? "forge" : "procedural"');
    expect(source).toContain("const validSave = canContinueLocalRun(save) ? save : null;");
    expect(source).toContain("Continue is unavailable for imported maps.");
    expect(coordinatorSource).toContain("isActive: () => runHasStarted");
    expect(coordinatorSource).toContain("persist: persistCurrentRun");
    expect(coordinatorSource).toContain(
      'setStatus("Could not save this run locally. Continue may not be available.")',
    );
    expect([...coordinatorSource.matchAll(/setStatus\(/g)]).toHaveLength(1);
  });
});
