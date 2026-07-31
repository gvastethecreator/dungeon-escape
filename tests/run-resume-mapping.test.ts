import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import type { FloorExplorationSnapshot } from "../src/game/FloorExploration";
import type { LocalRunResumeState } from "../src/game/LocalRunSave";
import {
  captureRunResume,
  planFloorTransition,
  planRunResumeRestore,
  type RunSessionSource,
} from "../src/game/RunResumeMapping";

function domain(): RunSessionSource {
  return {
    seed: "DOMAIN-SEED",
    resolve: 63,
    foundStoneIds: ["ember", "crypt"],
    portalOpen: false,
    runMode: "playing",
    exitReached: false,
  };
}

function resume(): LocalRunResumeState {
  return {
    runSeconds: 187.5,
    difficultyElapsed: 166,
    player: {
      x: 4,
      y: 1.62,
      z: 7,
      yaw: 0.5,
      pitch: -0.2,
      distanceTravelled: 84,
    },
    visitedCells: ["10,12", "11,12"],
    timeFreezeRemaining: 2.5,
    luminousWardRemaining: 1.25,
    annihilationPulseRemaining: 0.75,
    mapRevealed: false,
    mobilityBoostRemaining: 3.5,
    fogClearRemaining: 8,
    activeFloor: 1,
    campaignRootSeed: " CAMPAIGN ",
    campaignBiomeId: "frost",
    visitedFloors: { "0": ["1,1"], "1": ["10,12", "11,12"] },
    perStoneSeconds: { ember: 42, crypt: 119 },
  };
}

describe("run resume mapping", () => {
  test("captures every live resume field without retaining aliases", () => {
    const visitedCells = ["2,2"];
    const floorZero = ["1,1"];
    const exploration: FloorExplorationSnapshot = {
      activeFloor: 1,
      visitedCells,
      visitedFloors: { "0": floorZero, "1": visitedCells },
      mapRevealed: true,
    };
    const perStoneSeconds = { ember: 21 };

    const captured = captureRunResume({
      play: { runMode: "playing", runSeconds: 90, perStoneSeconds },
      player: {
        position: { x: 4, y: 1.62, z: 7 },
        lookYaw: 0.5,
        lookPitch: -0.2,
        distanceTravelled: 84,
      },
      world: {
        difficultyElapsed: 70,
        timeFreezeRemaining: 3,
        luminousWardRemaining: 2,
        annihilationPulseRemaining: 1,
        mapRevealed: false,
        mobilityBoostRemaining: 4,
        fogClearRemaining: 9,
      },
      exploration,
      campaign: { rootSeed: "ROOT", biomeId: "frost" },
    });

    expect(captured).toEqual({
      runSeconds: 90,
      difficultyElapsed: 70,
      player: {
        x: 4,
        y: 1.62,
        z: 7,
        yaw: 0.5,
        pitch: -0.2,
        distanceTravelled: 84,
      },
      visitedCells: ["2,2"],
      timeFreezeRemaining: 3,
      luminousWardRemaining: 2,
      annihilationPulseRemaining: 1,
      mapRevealed: true,
      mobilityBoostRemaining: 4,
      fogClearRemaining: 9,
      activeFloor: 1,
      campaignRootSeed: "ROOT",
      campaignBiomeId: "frost",
      visitedFloors: { "0": ["1,1"], "1": ["2,2"] },
      perStoneSeconds: { ember: 21 },
    });

    visitedCells.push("3,2");
    floorZero.push("2,1");
    perStoneSeconds.ember = 99;
    expect(captured?.visitedCells).toEqual(["2,2"]);
    expect(captured?.visitedFloors).toEqual({ "0": ["1,1"], "1": ["2,2"] });
    expect(captured?.perStoneSeconds).toEqual({ ember: 21 });
  });

  test("does not capture finished play state", () => {
    expect(
      captureRunResume({
        play: { runMode: "won", runSeconds: 10 },
        player: {
          position: { x: 0, y: 0, z: 0 },
          lookYaw: 0,
          lookPitch: 0,
          distanceTravelled: 0,
        },
        world: {
          difficultyElapsed: 0,
          timeFreezeRemaining: 0,
          luminousWardRemaining: 0,
          annihilationPulseRemaining: 0,
          mapRevealed: false,
          mobilityBoostRemaining: 0,
          fogClearRemaining: 0,
        },
        exploration: {
          activeFloor: 0,
          visitedCells: [],
          visitedFloors: {},
          mapRevealed: false,
        },
        campaign: { biomeId: "ancient" },
      }),
    ).toBeUndefined();
  });

  test("projects one continue plan for session, runtime, player, generation, and exploration", () => {
    const source = domain();
    const local = resume();
    const plan = planRunResumeRestore(source, local);

    expect(plan).toEqual({
      persistedSession: {
        resolve: 63,
        foundStoneIds: ["ember", "crypt"],
        portalOpen: false,
        runMode: "playing",
        exitReached: false,
        runSeconds: 187.5,
        perStoneSeconds: { ember: 42, crypt: 119 },
      },
      runtimeProgress: {
        progress: {
          difficultyElapsed: 166,
          timeFreezeRemaining: 2.5,
          luminousWardRemaining: 1.25,
          annihilationPulseRemaining: 0.75,
          mapRevealed: false,
          mobilityBoostRemaining: 3.5,
          fogClearRemaining: 8,
        },
        player: { x: 4, z: 7 },
      },
      playerPose: local.player,
      generation: { seed: "CAMPAIGN", activeFloor: 1, campaignBiomeId: "frost" },
      exploration: {
        kind: "restore",
        state: {
          activeFloor: 1,
          visitedCells: ["10,12", "11,12"],
          visitedFloors: { "0": ["1,1"], "1": ["10,12", "11,12"] },
          mapRevealed: false,
        },
      },
    });

    (source.foundStoneIds as string[]).push("ash");
    local.player.x = 99;
    local.visitedCells.push("12,12");
    local.visitedFloors!["0"]!.push("2,1");
    local.perStoneSeconds!.ember = 99;
    expect(plan.persistedSession.foundStoneIds).toEqual(["ember", "crypt"]);
    expect(plan.persistedSession.perStoneSeconds).toEqual({ ember: 42, crypt: 119 });
    expect(plan.playerPose?.x).toBe(4);
    expect(plan.exploration).toEqual({
      kind: "restore",
      state: {
        activeFloor: 1,
        visitedCells: ["10,12", "11,12"],
        visitedFloors: { "0": ["1,1"], "1": ["10,12", "11,12"] },
        mapRevealed: false,
      },
    });
  });

  test("projects legacy domain state without inventing local restore fields", () => {
    const plan = planRunResumeRestore(domain());

    expect(plan).toEqual({
      persistedSession: {
        resolve: 63,
        foundStoneIds: ["ember", "crypt"],
        portalOpen: false,
        runMode: "playing",
        exitReached: false,
        runSeconds: 0,
        perStoneSeconds: undefined,
      },
      generation: { seed: "DOMAIN-SEED", activeFloor: 0, campaignBiomeId: null },
      exploration: { kind: "start" },
    });
  });

  test("floor transition changes only destination pose/floor and requests a switch", () => {
    const local = resume();
    const entryCell = { x: 8, y: 9 };
    const plan = planFloorTransition({
      domain: domain(),
      resume: local,
      destination: {
        floorIndex: 2,
        entryCell,
        position: { x: 12, y: 1.62, z: 18 },
        yaw: 2.5,
        pitch: 0,
      },
    });

    expect(plan.generation).toEqual({ seed: "CAMPAIGN", activeFloor: 2, campaignBiomeId: "frost" });
    expect(plan.playerPose).toEqual({
      x: 12,
      y: 1.62,
      z: 18,
      yaw: 2.5,
      pitch: 0,
      distanceTravelled: 84,
    });
    expect(plan.runtimeProgress).toMatchObject({
      progress: { difficultyElapsed: 166, timeFreezeRemaining: 2.5 },
      player: { x: 12, z: 18 },
    });
    expect(plan.persistedSession).toMatchObject({
      runSeconds: 187.5,
      perStoneSeconds: { ember: 42, crypt: 119 },
    });
    expect(plan.exploration).toEqual({ kind: "switch-floor", entryCell: { x: 8, y: 9 } });
    expect(local.activeFloor).toBe(1);
    expect(local.player.x).toBe(4);
    entryCell.x = 99;
    expect(plan.exploration).toEqual({ kind: "switch-floor", entryCell: { x: 8, y: 9 } });
  });

  test("rejects invalid floor transition destinations", () => {
    expect(() =>
      planFloorTransition({
        domain: domain(),
        resume: resume(),
        destination: {
          floorIndex: -1,
          entryCell: { x: 1, y: 1 },
          position: { x: 1, y: 1.62, z: 1 },
          yaw: 0,
          pitch: 0,
        },
      }),
    ).toThrow(RangeError);
  });

  test("host uses activation plans instead of reconstructing resume fields", () => {
    const main = readFileSync("src/main.ts", "utf8");

    expect(main).not.toContain("function domainToPersistedSession");
    expect(main).not.toContain("function runtimeProgressFromResume");
    expect(main).not.toContain("transitionResume");
    expect(main).not.toContain("options.resume");
    expect(main).toContain("planRunResumeRestore");
    expect(main).toContain("planFloorTransition");
  });
});
