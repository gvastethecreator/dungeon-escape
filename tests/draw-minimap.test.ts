import { describe, expect, test } from "bun:test";

import { FLOOR, WALL } from "../src/dungeon/generateDungeon";
import type { DungeonData } from "../src/dungeon/types";
import {
  cellKey,
  collectExploredAround,
  drawMinimap,
  MINIMAP_COLORS,
  MINIMAP_REVEAL_RADIUS,
} from "../src/ui/drawMinimap";
import type { MinimapFeatures } from "../src/ui/minimapFeatures";

/** Minimal canvas stub: records fillStyle transitions and primitive counts. */
function makeCanvasStub(width = 200, height = 120) {
  const calls: { op: string; fill?: string; stroke?: string }[] = [];
  const ctx = {
    setTransform: () => {},
    clearRect: () => {},
    fillRect: () => calls.push({ op: "fillRect" }),
    beginPath: () => calls.push({ op: "beginPath" }),
    arc: () => calls.push({ op: "arc" }),
    moveTo: () => calls.push({ op: "moveTo" }),
    lineTo: () => calls.push({ op: "lineTo" }),
    closePath: () => calls.push({ op: "closePath" }),
    fill: () => calls.push({ op: "fill", fill: String((ctx as { fillStyle: unknown }).fillStyle) }),
    stroke: () =>
      calls.push({ op: "stroke", stroke: String((ctx as { strokeStyle: unknown }).strokeStyle) }),
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    lineCap: "butt",
  };
  const canvas = {
    width: 0,
    height: 0,
    getBoundingClientRect: () => ({
      width,
      height,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
    }),
    getContext: () => ctx,
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, calls, ctx };
}

function makeDungeon(): DungeonData {
  const grid = [
    Uint8Array.from([WALL, WALL, WALL, WALL, WALL, WALL, WALL]),
    Uint8Array.from([WALL, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, WALL]),
    Uint8Array.from([WALL, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, WALL]),
    Uint8Array.from([WALL, FLOOR, FLOOR, FLOOR, FLOOR, FLOOR, WALL]),
    Uint8Array.from([WALL, WALL, WALL, WALL, WALL, WALL, WALL]),
  ];
  return {
    seed: "test",
    seedHash: 1,
    options: { presetId: "ash" } as unknown as DungeonData["options"],
    grid,
    width: 7,
    height: 5,
    rooms: [{ id: 0, x: 1, y: 1, width: 5, height: 3, center: { x: 3, y: 2 }, role: "room" }],
    edges: [],
    spawn: { x: 1, y: 2 },
    exit: { x: 5, y: 2 },
    entranceRoomId: 0,
    exitRoomId: 0,
    distances: new Int32Array(),
    topologySignature: "",
    stats: { roomCount: 1, loopCount: 0, deadEnds: 0, corridorRatio: 0, floorCount: 15 },
  } as unknown as DungeonData;
}

describe("minimap marker layer", () => {
  test("palette keeps grimdark soot/bone base and adds distinct marker hues", () => {
    expect(MINIMAP_COLORS.field).toBe("#07090b");
    expect(MINIMAP_COLORS.floor).toBe("#6e7168");
    expect(MINIMAP_COLORS.enemy).not.toBe(MINIMAP_COLORS.fire);
    expect(MINIMAP_COLORS.stone).not.toBe(MINIMAP_COLORS.pickup);
    expect(MINIMAP_COLORS.relic).not.toBe(MINIMAP_COLORS.enemy);
    expect(MINIMAP_COLORS.stoneCollected).not.toBe(MINIMAP_COLORS.stone);
    expect(MINIMAP_COLORS.wall).toBe("#1c1f1c");
  });

  test("without features it only draws floor + exit (legacy behaviour)", () => {
    const { canvas, calls } = makeCanvasStub();
    drawMinimap(canvas, makeDungeon(), { x: 2, y: 2 });
    // Floor cells (5*3=15) + exit (1 fillRect) + field fill = 17 fillRects; player is triangle fills.
    const fillRects = calls.filter((c) => c.op === "fillRect").length;
    expect(fillRects).toBeGreaterThanOrEqual(15);
  });

  test("enemy marker paints with the enemy hue", () => {
    const { canvas, ctx, calls } = makeCanvasStub();
    const features: MinimapFeatures = {
      doors: [],
      fires: [],
      enemies: [{ cell: { x: 3, y: 2 }, tier: 2 }],
      stones: [],
      pickups: [],
      spawn: { x: 1, y: 2 },
    };
    drawMinimap(canvas, makeDungeon(), { x: 2, y: 2 }, features);
    const fills = calls.filter((c) => c.op === "fill" && c.fill === MINIMAP_COLORS.enemy);
    expect(fills.length).toBeGreaterThanOrEqual(1);
    expect(ctx).toBeDefined();
  });

  test("collected stone uses the faded hue, uncollected uses the live hue", () => {
    const { canvas, calls } = makeCanvasStub();
    const features: MinimapFeatures = {
      doors: [],
      fires: [],
      enemies: [],
      stones: [
        { cell: { x: 2, y: 2 }, collected: false, id: "ember" },
        { cell: { x: 4, y: 2 }, collected: true, id: "ash" },
      ],
      pickups: [],
      spawn: { x: 1, y: 2 },
    };
    drawMinimap(canvas, makeDungeon(), { x: 3, y: 2 }, features);
    const live = calls.filter((c) => c.op === "fill" && c.fill === MINIMAP_COLORS.stone);
    const faded = calls.filter((c) => c.op === "fill" && c.fill === MINIMAP_COLORS.stoneCollected);
    expect(live.length).toBe(1);
    expect(faded.length).toBe(1);
  });

  test("fires, pickups, doors and relic all render without raising", () => {
    const { canvas, calls } = makeCanvasStub();
    const features: MinimapFeatures = {
      doors: [{ x: 3, y: 2 }],
      fires: [{ x: 2, y: 2 }],
      enemies: [],
      stones: [],
      pickups: [{ x: 4, y: 2 }],
      luminousWard: { x: 3, y: 1 },
      relic: { x: 5, y: 2 },
      spawn: { x: 1, y: 2 },
    };
    expect(() => drawMinimap(canvas, makeDungeon(), { x: 2, y: 2 }, features)).not.toThrow();
    const strokes = calls.filter((c) => c.op === "stroke");
    // Doors (cross bars) + spawn ring = at least 2 stroke groups.
    expect(strokes.length).toBeGreaterThanOrEqual(2);
    const relicFills = calls.filter((c) => c.op === "fill" && c.fill === MINIMAP_COLORS.relic);
    expect(relicFills.length).toBe(1);
    const wardSignals = calls.filter(
      (c) => c.op === "stroke" && c.stroke === MINIMAP_COLORS.luminousWard,
    );
    expect(wardSignals.length).toBe(1);
  });

  test("fog of war hides unexplored floors and distant markers", () => {
    const { canvas, calls } = makeCanvasStub();
    const dungeon = makeDungeon();
    const explored = new Set([cellKey(2, 2)]);
    const features: MinimapFeatures = {
      doors: [],
      fires: [{ x: 2, y: 2 }],
      enemies: [{ cell: { x: 5, y: 2 }, tier: 1 }],
      stones: [{ cell: { x: 4, y: 2 }, collected: false, id: "ember" }],
      pickups: [],
      spawn: { x: 1, y: 2 },
    };
    drawMinimap(
      canvas,
      dungeon,
      { x: 2, y: 2 },
      {
        features,
        explored,
        playerYaw: 0,
      },
    );

    // One explored floor + field + wall silhouettes + player underlay/tip.
    // Distant enemy/stone/exit/spawn must not paint their hues.
    const enemyFills = calls.filter((c) => c.op === "fill" && c.fill === MINIMAP_COLORS.enemy);
    const stoneFills = calls.filter((c) => c.op === "fill" && c.fill === MINIMAP_COLORS.stone);
    const exitRects = calls.filter((c) => c.op === "fillRect").length;
    expect(enemyFills.length).toBe(0);
    expect(stoneFills.length).toBe(0);
    // Local fire on the explored cell still shows.
    const fireFills = calls.filter((c) => c.op === "fill" && c.fill === MINIMAP_COLORS.fire);
    expect(fireFills.length).toBe(1);
    // Far fewer floor tiles than the full 15-cell room.
    expect(exitRects).toBeLessThan(10);
  });

  test("player marker is a heading triangle, not a circle", () => {
    const { canvas, calls } = makeCanvasStub();
    drawMinimap(
      canvas,
      makeDungeon(),
      { x: 2, y: 2 },
      {
        playerYaw: Math.PI / 2,
      },
    );
    const arcs = calls.filter((c) => c.op === "arc");
    const playerFills = calls.filter(
      (c) =>
        c.op === "fill" &&
        (c.fill === MINIMAP_COLORS.player || c.fill === MINIMAP_COLORS.playerCore),
    );
    // Arrow uses path fills, not arcs.
    expect(playerFills.length).toBeGreaterThanOrEqual(2);
    expect(calls.some((c) => c.op === "moveTo")).toBe(true);
    expect(calls.some((c) => c.op === "lineTo")).toBe(true);
    // No player-dot arcs when only the player is drawn (no features).
    expect(arcs.length).toBe(0);
  });

  test("collectExploredAround reveals floor in Chebyshev radius", () => {
    const dungeon = makeDungeon();
    const explored = collectExploredAround(dungeon, { x: 3, y: 2 }, MINIMAP_REVEAL_RADIUS);
    expect(explored.has(cellKey(3, 2))).toBe(true);
    expect(explored.has(cellKey(1, 2))).toBe(true);
    expect(explored.has(cellKey(5, 2))).toBe(true);
    // Walls are never marked as explored floors.
    expect(explored.has(cellKey(0, 2))).toBe(false);
    expect(explored.size).toBe(15);
  });
});
