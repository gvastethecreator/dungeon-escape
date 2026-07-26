import { describe, expect, test } from "bun:test";
import { executeSim, type FullRunSnapshot } from "../src/domain/runtime";
import {
  createDomainBridge,
  engineModeToShell,
  roomLabelForCell,
  shellModeToEngine,
} from "../src/domain/bridge";

describe("dungeon domain bridge", () => {
  test("maps shell and engine modes", () => {
    expect(shellModeToEngine(null)).toBe("editor");
    expect(shellModeToEngine("play")).toBe("play");
    expect(shellModeToEngine("debug")).toBe("debug");
    expect(engineModeToShell("editor")).toBe("editor");
  });

  test("room labels from geometry", () => {
    const rooms = [
      { id: 0, x: 0, y: 0, width: 3, height: 3, role: "entrance" },
      { id: 1, x: 5, y: 5, width: 2, height: 2, role: "exit" },
      { id: 2, x: 8, y: 0, width: 2, height: 2, role: "room" },
    ];
    expect(roomLabelForCell(rooms, { x: 1, y: 1 })).toBe("entrance");
    expect(roomLabelForCell(rooms, { x: 5, y: 5 })).toBe("exit");
    expect(roomLabelForCell(rooms, { x: 8, y: 1 })).toBe("room-2");
    expect(roomLabelForCell(rooms, { x: 9, y: 9 })).toBe("corridor");
  });

  test("seed and explore sync through domain commands", () => {
    const bridge = createDomainBridge("SEED-A");
    expect(bridge.getDungeon().seed).toBe("SEED-A");
    bridge.captureBuild({
      seed: "SEED-B",
      topologySignature: "topo-1",
      roomTarget: 12,
      loopRate: 15,
      decorDensity: 50,
    });
    const d = bridge.getDungeon();
    expect(d.seed).toBe("SEED-B");
    expect(d.roomTarget).toBe(12);
    expect(d.topologySignature).toBe("topo-1");
    bridge.syncExplore({ room: "exit", exploredCells: 40, mapped: 12 });
    bridge.syncSession({
      resolve: 72,
      foundStoneIds: ["ember", "ash", "crypt", "verdant"],
      portalOpen: true,
      runMode: "playing",
      exitReached: false,
    });
    const e = bridge.getDungeon();
    expect(e.room).toBe("exit");
    expect(e.exploredCells).toBe(40);
    expect(e.hasRelic).toBe(true);
    expect(e.resolve).toBe(72);
    bridge.setEngineMode("play");
    expect(bridge.getDungeon().engineMode).toBe("play");
    const proj = bridge.project();
    expect(proj.domainId).toBe("dungeons");
    expect(proj.domain?.metrics.seed).toBe("SEED-B");
  });

  test("descend bumps floor and seed suffix", () => {
    const bridge = createDomainBridge("ROOT");
    bridge.descend();
    const d = bridge.getDungeon();
    expect(d.floor).toBe(2);
    expect(d.seed).toBe("ROOT-F2");
    expect(d.hasRelic).toBe(false);
  });

  test("hydrate command replaces floor without descend loop", () => {
    const bridge = createDomainBridge("ROOT");
    const r = bridge.getRun();
    const result = executeSim(r, {
      type: "dungeons/hydrate",
      payload: {
        seed: "HYDRATED",
        floor: 3,
        room: "exit",
        mapped: 9,
        threat: 4,
        roomTarget: 14,
        loopRate: 10,
        decorDensity: 40,
        exploredCells: 20,
        hasRelic: true,
        exitReached: false,
        engineMode: "play",
        topologySignature: "t-1",
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const d = (result.run as FullRunSnapshot).domains.dungeons as {
        seed: string;
        floor: number;
        hasRelic: boolean;
        engineMode: string;
      };
      expect(d.seed).toBe("HYDRATED");
      expect(d.floor).toBe(3);
      expect(d.hasRelic).toBe(true);
      expect(d.engineMode).toBe("play");
    }
  });
});
