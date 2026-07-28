import { describe, expect, test } from "bun:test";

import { FrameGapProfiler } from "../src/systems/FrameGapProfiler";

describe("frame gap profiler", () => {
  test("reports distribution tails and threshold counts", () => {
    const profiler = new FrameGapProfiler(120);
    for (let index = 0; index < 96; index += 1) profiler.record(16.5);
    profiler.record(26);
    profiler.record(40);
    profiler.record(72);
    profiler.recordLongTask(68);
    const snapshot = profiler.snapshot();

    expect(snapshot.samples).toBe(99);
    expect(snapshot.p95).toBe(16.5);
    expect(snapshot.p99).toBe(40);
    expect(snapshot.max).toBe(72);
    expect(snapshot.over25).toBe(3);
    expect(snapshot.over33).toBe(2);
    expect(snapshot.over50).toBe(1);
    expect(snapshot.longTasks).toBe(1);
    expect(snapshot.longestTask).toBe(68);
  });

  test("keeps only the latest bounded window and resets cleanly", () => {
    const profiler = new FrameGapProfiler(60);
    for (let index = 0; index < 70; index += 1) profiler.record(index + 1);
    expect(profiler.snapshot().samples).toBe(60);
    expect(profiler.snapshot().max).toBe(70);
    profiler.reset();
    expect(profiler.snapshot()).toMatchObject({ samples: 0, max: 0, longTasks: 0 });
  });

  test("records uncapped rAF gaps while keeping the simulation delta capped", async () => {
    const rawFrameGapMs = 125;
    const simulationDelta = Math.min(Math.max(0, rawFrameGapMs / 1000), 0.05);
    const profiler = new FrameGapProfiler();
    profiler.record(rawFrameGapMs);

    expect(simulationDelta).toBe(0.05);
    expect(profiler.snapshot().max).toBe(rawFrameGapMs);

    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const frameStart = source.indexOf("function frame(now: number): void {");
    const frameEnd = source.indexOf("\n}\n\nwindow.addEventListener", frameStart);
    expect(frameStart).toBeGreaterThanOrEqual(0);
    expect(frameEnd).toBeGreaterThan(frameStart);

    const frameSource = source.slice(frameStart, frameEnd);
    expect(frameSource).toContain("const rawFrameGapMs = now - lastFrameMs;");
    expect(frameSource).toContain(
      "const delta = Math.min(Math.max(0, rawFrameGapMs / 1000), 0.05);",
    );
    expect(frameSource).toContain("frameGapProfiler.record(rawFrameGapMs);");
  });
});
