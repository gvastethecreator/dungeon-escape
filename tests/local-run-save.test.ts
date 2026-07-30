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
  });

  test("keeps the first changed-cell save deadline and flushes it when the page is hidden", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const schedulerStart = source.indexOf("function scheduleLocalRunSave");
    const schedulerEnd = source.indexOf("\n}\n\nfunction flushLocalRunSave", schedulerStart);
    const flushStart = source.indexOf("function flushLocalRunSave(): void {");
    const flushEnd = source.indexOf("\n}\n\nfunction flushLocalRunSaveWhenHidden", flushStart);
    const frameStart = source.indexOf("function frame(now: number): void {");
    const changedCellStart = source.indexOf("if (result.changedCell) {", frameStart);
    const changedCellEnd = source.indexOf("\n  } else if (now - lastMapDraw", changedCellStart);

    expect(source).toContain("const LOCAL_RUN_SAVE_DELAY_MS = 1_000;");
    expect(schedulerStart).toBeGreaterThanOrEqual(0);
    expect(schedulerEnd).toBeGreaterThan(schedulerStart);
    expect(source.slice(schedulerStart, schedulerEnd)).toContain(
      "if (!runHasStarted || localSaveTimer !== null) return;",
    );
    expect(source.slice(schedulerStart, schedulerEnd)).not.toContain(
      "clearTimeout(localSaveTimer);",
    );
    expect(frameStart).toBeGreaterThanOrEqual(0);
    expect(changedCellStart).toBeGreaterThan(frameStart);
    expect(changedCellEnd).toBeGreaterThan(changedCellStart);
    expect(source.slice(changedCellStart, changedCellEnd)).toContain("scheduleLocalRunSave();");
    expect(flushStart).toBeGreaterThan(schedulerEnd);
    expect(flushEnd).toBeGreaterThan(flushStart);
    expect(source.slice(flushStart, flushEnd)).toContain("if (runHasStarted) persistCurrentRun();");
    expect(source).toContain('window.addEventListener("pagehide", flushLocalRunSave);');
    expect(source).toContain(
      'document.addEventListener("visibilitychange", flushLocalRunSaveWhenHidden);',
    );
    const pagehideStart = source.indexOf('window.addEventListener("pagehide", flushLocalRunSave);');
    const beforeUnloadStart = source.indexOf('window.addEventListener("beforeunload", () => {');
    expect(pagehideStart).toBeGreaterThanOrEqual(0);
    expect(beforeUnloadStart).toBeGreaterThan(pagehideStart);
    expect(source.slice(pagehideStart, beforeUnloadStart)).not.toContain(".dispose()");
    expect(source).toContain("if (appDisposed) return;");
    expect(source).toContain("cancelAnimationFrame(animationFrameId);");
    expect([...source.matchAll(/renderer\.dispose\(\)/g)]).toHaveLength(1);
  });

  test("latches local-save failure feedback until a later write succeeds", async () => {
    const blockedStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("Storage quota exceeded");
      },
      removeItem: () => undefined,
    };
    expect(writeLocalRunSave(state(), blockedStorage, 42)).toBe(false);

    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const persistStart = source.indexOf("function persistCurrentRun(): void {");
    const persistEnd = source.indexOf("\n}\n\nfunction scheduleLocalRunSave", persistStart);
    const persistSource = source.slice(persistStart, persistEnd);

    expect(persistStart).toBeGreaterThanOrEqual(0);
    expect(persistEnd).toBeGreaterThan(persistStart);
    expect(persistSource).toContain("const saved = writeLocalRunSave(");
    expect(persistSource).toContain(
      "if (saved) {\n    localSaveFailureNotified = false;\n    return;",
    );
    expect(persistSource).toContain("if (localSaveFailureNotified) return;");
    expect(persistSource).toContain("localSaveFailureNotified = true;");
    expect(persistSource).toContain(
      'setStatus("Could not save this run locally. Continue may not be available.");',
    );
    expect([...persistSource.matchAll(/setStatus\(/g)]).toHaveLength(1);
  });
});
