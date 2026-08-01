import { describe, expect, test } from "bun:test";

import {
  createMinimapDrawInvalidator,
  createMinimapLayoutScheduler,
} from "../src/ui/minimapLayout";

describe("minimap layout scheduling", () => {
  test("redraws only when a visible input changes", () => {
    const invalidator = createMinimapDrawInvalidator();
    const cell = { x: 2, y: 3 };

    expect(invalidator.shouldDraw(cell, 0, 12, 4)).toBe(true);
    expect(invalidator.shouldDraw(cell, 0, 12, 4)).toBe(false);
    expect(invalidator.shouldDraw({ x: 3, y: 3 }, 0, 12, 4)).toBe(true);
    expect(invalidator.shouldDraw(cell, 0.1, 12, 4)).toBe(true);
    expect(invalidator.shouldDraw(cell, 0.1, 13, 4)).toBe(true);
    expect(invalidator.shouldDraw(cell, 0.1, 13, 5)).toBe(true);
    expect(invalidator.shouldDraw(cell, 0.1, 13, 5, true)).toBe(true);
  });

  test("coalesces mode and size changes into one next-frame measure and draw", () => {
    const frames: FrameRequestCallback[] = [];
    const calls: string[] = [];
    let liveWidth = 1;
    let cachedWidth = 0;
    const scheduler = createMinimapLayoutScheduler({
      measure: () => {
        cachedWidth = liveWidth;
        calls.push(`measure:${cachedWidth}`);
      },
      draw: () => calls.push(`draw:${cachedWidth}`),
      requestFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelFrame: () => {},
    });

    scheduler.schedule(); // Creation → Play
    scheduler.schedule(); // ResizeObserver sees the newly visible canvas
    scheduler.schedule(); // A second layout notification in the same turn

    expect(calls).toEqual([]);
    expect(frames).toHaveLength(1);

    // The CSS mode change has settled by the time the queued frame runs.
    liveWidth = 168;
    const frame = frames.shift();
    if (!frame) throw new Error("Expected a scheduled minimap frame.");
    frame(16);

    expect(calls).toEqual(["measure:168", "draw:168"]);

    liveWidth = 128;
    scheduler.schedule();
    expect(frames).toHaveLength(1);
    const resizeFrame = frames.shift();
    if (!resizeFrame) throw new Error("Expected a scheduled resize frame.");
    resizeFrame(32);

    expect(calls).toEqual(["measure:168", "draw:168", "measure:128", "draw:128"]);
  });

  test("cancels pending work when the HUD disposes", () => {
    const frames: FrameRequestCallback[] = [];
    const cancelled: number[] = [];
    const calls: string[] = [];
    const scheduler = createMinimapLayoutScheduler({
      measure: () => calls.push("measure"),
      draw: () => calls.push("draw"),
      requestFrame: (callback) => {
        frames.push(callback);
        return 41;
      },
      cancelFrame: (handle) => cancelled.push(handle),
    });

    scheduler.schedule();
    scheduler.dispose();

    expect(cancelled).toEqual([41]);
    const frame = frames.shift();
    if (!frame) throw new Error("Expected a scheduled minimap frame.");
    frame(16);
    expect(calls).toEqual([]);
  });
});
