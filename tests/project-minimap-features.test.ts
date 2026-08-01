import { describe, expect, test } from "bun:test";
import { projectMinimapFeatures } from "../src/ui/projectMinimapFeatures";

describe("projectMinimapFeatures", () => {
  test("filters defeated enemies and collected pickups", () => {
    const features = projectMinimapFeatures({
      doors: [{ x: 1, y: 1 }],
      fires: [{ x: 2, y: 2 }],
      enemies: [
        { cell: { x: 3, y: 3 }, tier: 1, scaleX: 1, scaleY: 1 },
        { cell: { x: 4, y: 4 }, tier: 2, scaleX: 0, scaleY: 0 },
      ],
      pickups: [
        {
          kind: "stone",
          available: true,
          collected: true,
          stoneId: "ember",
          cell: { x: 5, y: 5 },
        },
        {
          kind: "resolve",
          available: true,
          collected: false,
          cell: { x: 6, y: 6 },
        },
        {
          kind: "resolve",
          available: false,
          collected: false,
          cell: { x: 7, y: 7 },
        },
        {
          kind: "map",
          available: true,
          collected: false,
          cell: { x: 8, y: 8 },
        },
        {
          kind: "map",
          available: true,
          collected: true,
          cell: { x: 9, y: 9 },
        },
      ],
      stairs: [{ cell: { x: 10, y: 10 }, direction: "up" }],
      spawn: { x: 0, y: 0 },
    });

    expect(features.enemies).toEqual([{ cell: { x: 3, y: 3 }, tier: 1 }]);
    expect(features.stones).toEqual([
      { cell: { x: 5, y: 5 }, collected: true, id: "ember" },
    ]);
    expect(features.pickups).toEqual([{ x: 6, y: 6 }]);
    expect(features.map).toEqual({ x: 8, y: 8 });
    expect(features.stairs).toEqual([{ cell: { x: 10, y: 10 }, direction: "up" }]);
    expect(features.spawn).toEqual({ x: 0, y: 0 });
  });
});
