import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { FLOOR, WALL } from "../src/dungeon/generateDungeon";
import type { DungeonData } from "../src/dungeon/types";
import { FloorExploration } from "../src/game/FloorExploration";

function makeFloor(index: number, count = 2): DungeonData {
  return {
    seed: `floor-${index}`,
    seedHash: index,
    options: {} as DungeonData["options"],
    grid: [
      Uint8Array.from([WALL, WALL, WALL, WALL, WALL, WALL, WALL]),
      Uint8Array.from([WALL, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, WALL]),
      Uint8Array.from([WALL, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, WALL]),
      Uint8Array.from([WALL, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, WALL]),
      Uint8Array.from([WALL, WALL, WALL, WALL, WALL, WALL, WALL]),
    ],
    width: 7,
    height: 5,
    rooms: [],
    edges: [],
    spawn: { x: 1, y: 2 },
    exit: { x: 5, y: 2 },
    entranceRoomId: 0,
    exitRoomId: 0,
    distances: new Int32Array(),
    topologySignature: `floor-${index}`,
    stats: {} as DungeonData["stats"],
    floor: {
      index,
      number: index + 1,
      count,
      rootSeed: "campaign",
      stairs: [],
    },
  };
}

describe("floor exploration", () => {
  test("starts with entry fog and reports cell changes independently from new cells", () => {
    const exploration = new FloorExploration({ revealRadius: 1 });
    exploration.start(makeFloor(0), { x: 2, y: 2 });

    expect(exploration.activeView().exploredCount).toBe(9);
    expect(exploration.reveal({ x: 4, y: 2 })).toEqual({
      cellChanged: true,
      cellsAdded: 6,
      exploredCount: 15,
    });
    expect(exploration.reveal({ x: 4, y: 2 })).toEqual({
      cellChanged: false,
      cellsAdded: 0,
      exploredCount: 15,
    });
  });

  test("keeps floor cells isolated and seeds every new or empty floor", () => {
    const exploration = new FloorExploration({ revealRadius: 0 });
    exploration.start(makeFloor(0), { x: 1, y: 2 });
    exploration.reveal({ x: 2, y: 2 });

    exploration.switchFloor(makeFloor(1), { x: 5, y: 2 });
    expect([...exploration.activeView().explored!]).toEqual(["5,2"]);
    exploration.reveal({ x: 4, y: 2 });

    exploration.switchFloor(makeFloor(0), { x: 1, y: 2 });
    expect([...exploration.activeView().explored!].sort()).toEqual(["1,2", "2,2"]);
    expect(exploration.snapshot().visitedFloors).toEqual({
      "0": ["1,2", "2,2"],
      "1": ["4,2", "5,2"],
    });
  });

  test("restores legacy and per-floor state without retaining mutable aliases", () => {
    const exploration = new FloorExploration({ revealRadius: 0 });
    const floor = makeFloor(1);
    const legacy = ["4,2"];
    const otherFloor = ["1,2"];
    const restore = {
      activeFloor: 1,
      visitedCells: legacy,
      visitedFloors: { "0": otherFloor },
      mapRevealed: false,
    };

    expect(exploration.restore(floor, restore, { x: 5, y: 2 })).toEqual({ ok: true });
    legacy.push("3,2");
    otherFloor.push("2,2");
    const firstSnapshot = exploration.snapshot();
    firstSnapshot.visitedCells.push("2,1");
    firstSnapshot.visitedFloors["0"]!.push("3,1");

    expect(exploration.snapshot()).toEqual({
      activeFloor: 1,
      visitedCells: ["4,2"],
      visitedFloors: { "0": ["1,2"], "1": ["4,2"] },
      mapRevealed: false,
    });
    expect("add" in (exploration.activeView().explored as object)).toBe(false);
  });

  test("prefers an explicit empty active floor and reveals its entry", () => {
    const exploration = new FloorExploration({ revealRadius: 0 });

    expect(
      exploration.restore(
        makeFloor(1),
        {
          activeFloor: 1,
          visitedCells: ["4,2"],
          visitedFloors: { "1": [] },
        },
        { x: 5, y: 2 },
      ),
    ).toEqual({ ok: true });
    expect(exploration.snapshot().visitedCells).toEqual(["5,2"]);
  });

  test("drops invalid saved cells when their floor becomes active", () => {
    const exploration = new FloorExploration({ revealRadius: 0 });
    expect(
      exploration.restore(
        makeFloor(0),
        {
          activeFloor: 0,
          visitedCells: ["1,2"],
          visitedFloors: { "0": ["1,2"], "1": ["0,0", "4,2"] },
        },
        { x: 1, y: 2 },
      ),
    ).toEqual({ ok: true });

    exploration.switchFloor(makeFloor(1), { x: 5, y: 2 });
    expect(exploration.snapshot().visitedCells).toEqual(["4,2"]);

    exploration.restore(
      makeFloor(0),
      {
        activeFloor: 0,
        visitedCells: ["1,2"],
        visitedFloors: { "0": ["1,2"], "1": ["0,0"] },
      },
      { x: 1, y: 2 },
    );
    exploration.switchFloor(makeFloor(1), { x: 5, y: 2 });
    expect(exploration.snapshot().visitedCells).toEqual(["5,2"]);
  });

  test("rejects malformed restores atomically", () => {
    const exploration = new FloorExploration({ revealRadius: 0 });
    const floor = makeFloor(0);
    exploration.start(floor, { x: 1, y: 2 });
    const before = exploration.snapshot();

    expect(
      exploration.restore(floor, {
        activeFloor: 0,
        visitedCells: [],
        visitedFloors: { "01": ["2,2"] },
      }),
    ).toEqual({ ok: false, reason: "invalid-floor" });
    expect(exploration.snapshot()).toEqual(before);

    expect(
      exploration.restore(floor, {
        activeFloor: 0,
        visitedCells: [],
        visitedFloors: { "0": ["not-a-cell"] },
      }),
    ).toEqual({ ok: false, reason: "invalid-cell" });
    expect(exploration.snapshot()).toEqual(before);

    expect(
      exploration.restore(floor, {
        activeFloor: 0,
        visitedCells: ["999999,999999"],
        visitedFloors: {},
      }),
    ).toEqual({ ok: false, reason: "invalid-cell" });
    expect(exploration.snapshot()).toEqual(before);

    expect(
      exploration.restore(floor, {
        activeFloor: 0,
        visitedCells: ["0,0"],
        visitedFloors: {},
      }),
    ).toEqual({ ok: false, reason: "invalid-cell" });
    expect(exploration.snapshot()).toEqual(before);
  });

  test("full-map view is monotonic within a run and does not discard fog", () => {
    const exploration = new FloorExploration({ revealRadius: 0 });
    exploration.start(makeFloor(0), { x: 1, y: 2 });
    expect(exploration.setMapRevealed(true)).toBe(true);
    expect(exploration.activeView().explored).toBeUndefined();
    expect(exploration.setMapRevealed(false)).toBe(false);

    exploration.reveal({ x: 2, y: 2 });
    expect(exploration.snapshot().visitedCells).toEqual(["1,2", "2,2"]);
    exploration.start(makeFloor(0), { x: 3, y: 2 });
    expect(exploration.activeView().mapRevealed).toBe(false);
    expect(exploration.snapshot().visitedFloors).toEqual({ "0": ["3,2"] });
  });

  test("browser host consumes snapshots and views instead of editing floor maps", () => {
    const main = readFileSync("src/main.ts", "utf8");

    expect(main).not.toContain("visitedCellsByFloor");
    expect(main).not.toContain("lastExploreCellKey");
    expect(main).not.toContain("targetVisited");
    expect(main).not.toContain("revealMinimapCell");
    expect(main).toContain("floorExploration.snapshot()");
    expect(main).toContain("floorExploration.switchFloor");
  });
});
