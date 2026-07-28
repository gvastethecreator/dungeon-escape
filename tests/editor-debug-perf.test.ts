import { describe, expect, test } from "bun:test";

import { FLOOR, WALL } from "../src/dungeon/generateDungeon";
import type { DungeonData } from "../src/dungeon/types";
import { DungeonEditorView } from "../src/editor/DungeonEditorView";
import { getDungeonMood } from "../src/systems/DungeonMood";

function installWindow(devicePixelRatio = 1): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { devicePixelRatio },
    writable: true,
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete (globalThis as { window?: unknown }).window;
  };
}

function makeTrackedCanvas(width = 200, height = 120): {
  canvas: HTMLCanvasElement;
  paintOps: () => number;
  filterSets: () => number;
  frames: number[];
  restoreRaf: () => void;
} {
  let paintOps = 0;
  let filterSets = 0;
  const frames: number[] = [];
  let frameId = 0;
  const gradient = { addColorStop: () => {} };
  const context: Record<string, unknown> = {
    arc: () => {},
    beginPath: () => {},
    clip: () => {},
    createRadialGradient: () => gradient,
    drawImage: () => {
      paintOps += 1;
    },
    fillRect: () => {
      paintOps += 1;
    },
    fillText: () => {},
    lineTo: () => {},
    moveTo: () => {},
    rect: () => {},
    restore: () => {},
    save: () => {},
    setTransform: () => {},
    stroke: () => {},
    strokeRect: () => {},
    get filter() {
      return "none";
    },
    set filter(_value: string) {
      filterSets += 1;
    },
  };
  const canvas = {
    addEventListener: () => {},
    getBoundingClientRect: () => ({ height, left: 0, top: 0, width }),
    getContext: () => context,
    removeEventListener: () => {},
    height: 0,
    width: 0,
  } as unknown as HTMLCanvasElement;

  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    frameId += 1;
    frames.push(frameId);
    queueMicrotask(() => cb(frameId));
    return frameId;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((id: number) => {
    void id;
  }) as typeof cancelAnimationFrame;

  return {
    canvas,
    paintOps: () => paintOps,
    filterSets: () => filterSets,
    frames,
    restoreRaf() {
      if (previousRaf) globalThis.requestAnimationFrame = previousRaf;
      else delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
      if (previousCancel) globalThis.cancelAnimationFrame = previousCancel;
      else delete (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame;
    },
  };
}

function makeDungeon(width: number, height: number): DungeonData {
  const grid = Array.from({ length: height }, (_, y) =>
    Uint8Array.from({ length: width }, (__, x) => {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return WALL;
      return FLOOR;
    }),
  );
  return {
    distances: new Int32Array(),
    edges: [{ kind: "tree", left: 0, right: 0 }],
    entranceRoomId: 0,
    exit: { x: width - 2, y: height - 2 },
    exitRoomId: 0,
    grid,
    height,
    options: { presetId: "ash" } as unknown as DungeonData["options"],
    rooms: [
      {
        center: { x: Math.floor(width / 2), y: Math.floor(height / 2) },
        height: Math.max(2, height - 2),
        id: 0,
        role: "room",
        width: Math.max(2, width - 2),
        x: 1,
        y: 1,
      },
    ],
    seed: `perf-${width}x${height}`,
    seedHash: 1,
    spawn: { x: 1, y: 1 },
    stats: { corridorRatio: 0, deadEnds: 0, loopCount: 0, roomCount: 1 },
    topologySignature: "",
    width,
  } as unknown as DungeonData;
}

async function flushFrames(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("DungeonEditorView debug performance", () => {
  test("coalesces debug mode thrash into a single paint frame", async () => {
    const restoreWindow = installWindow();
    const tracked = makeTrackedCanvas();
    try {
      const view = new DungeonEditorView(tracked.canvas, { onSelectSpawn: () => {} });
      const dungeon = makeDungeon(48, 48);
      const mood = getDungeonMood("ash");

      view.setDungeon(dungeon, mood);
      view.setDebug(true);
      view.setDungeon(dungeon, mood);
      view.setDebug(true);
      view.redraw();
      view.redraw();

      // All of the above schedule at most one outstanding rAF.
      expect(tracked.frames.length).toBeLessThanOrEqual(2);
      await flushFrames();
      const paintsAfterOpen = tracked.paintOps();
      expect(paintsAfterOpen).toBeGreaterThan(0);

      const framesBefore = tracked.frames.length;
      view.setDebug(false);
      view.setDebug(true);
      view.redraw();
      expect(tracked.frames.length - framesBefore).toBe(1);
      await flushFrames();
    } finally {
      tracked.restoreRaf();
      restoreWindow();
    }
  });

  test("viewport culling paints far fewer cells than the full dungeon grid", async () => {
    const restoreWindow = installWindow();
    const small = makeTrackedCanvas(160, 100);
    const largeViewPort = makeTrackedCanvas(4000, 4000);
    try {
      const dungeon = makeDungeon(220, 220);
      const mood = getDungeonMood("ash");

      const culled = new DungeonEditorView(small.canvas, { onSelectSpawn: () => {} });
      culled.setDungeon(dungeon, mood);
      culled.setDebug(true);
      await flushFrames();
      const culledPaints = small.paintOps();

      const full = new DungeonEditorView(largeViewPort.canvas, { onSelectSpawn: () => {} });
      full.setDungeon(dungeon, mood);
      full.setDebug(true);
      await flushFrames();
      const fullPaints = largeViewPort.paintOps();

      // Visible window is much smaller than the 220² grid, so paints should drop hard.
      expect(culledPaints).toBeGreaterThan(20);
      expect(fullPaints).toBeGreaterThan(culledPaints * 2);
      expect(culledPaints / fullPaints).toBeLessThan(0.35);
    } finally {
      small.restoreRaf();
      largeViewPort.restoreRaf();
      restoreWindow();
    }
  });

  test("reusing the same dungeon reference does not thrash projection rebuild paints", async () => {
    const restoreWindow = installWindow();
    const tracked = makeTrackedCanvas();
    try {
      const view = new DungeonEditorView(tracked.canvas, { onSelectSpawn: () => {} });
      const dungeon = makeDungeon(64, 64);
      view.setDungeon(dungeon, getDungeonMood("ash"));
      await flushFrames();
      const afterFirst = tracked.paintOps();

      const framesBefore = tracked.frames.length;
      view.setDungeon(dungeon, getDungeonMood("ash"));
      view.setDungeon(dungeon, getDungeonMood("ash"));
      // Same map + same mood still schedules a mood redraw path once (applyMood).
      expect(tracked.frames.length - framesBefore).toBeLessThanOrEqual(1);
      await flushFrames();
      // Second/third setDungeon with same ref must not multiply paints unboundedly.
      expect(tracked.paintOps()).toBeLessThan(afterFirst * 3);
    } finally {
      tracked.restoreRaf();
      restoreWindow();
    }
  });
});
