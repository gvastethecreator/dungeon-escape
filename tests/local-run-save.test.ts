import { describe, expect, test } from "bun:test";

import type { DungeonDomainState } from "../src/domain/bridge";
import {
  LOCAL_RUN_SAVE_KEY,
  canContinueLocalRun,
  readLocalRunSave,
  writeLocalRunSave,
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
    expect(writeLocalRunSave(state(), storage, 1234)).toBe(true);
    expect(readLocalRunSave(storage)).toEqual({ version: 1, savedAt: 1234, state: state() });
    expect(canContinueLocalRun(readLocalRunSave(storage))).toBe(true);
  });

  test("rejects malformed or finished saves", () => {
    const storage = memoryStorage();
    storage.setItem(LOCAL_RUN_SAVE_KEY, JSON.stringify({ version: 1, savedAt: 2, state: {} }));
    expect(readLocalRunSave(storage)).toBeNull();
    expect(canContinueLocalRun({ version: 1, savedAt: 2, state: state({ runMode: "won" }) })).toBe(
      false,
    );
  });
});
