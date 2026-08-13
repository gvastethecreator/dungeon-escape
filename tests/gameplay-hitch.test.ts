import { describe, expect, test } from "bun:test";

describe("gameplay hitch recovery", () => {
  test("play defers neighbor dressing across budgeted steps and skips hitch catch-up", async () => {
    const world = await Bun.file(new URL("../src/world/DungeonWorld.ts", import.meta.url)).text();
    const scene = await Bun.file(
      new URL("../src/world/StaticDungeonScene.ts", import.meta.url),
    ).text();

    expect(scene).toContain("export const PLAY_DRESSING_PUMP_STEPS");
    expect(scene).toContain("export const PLAY_DRESSING_PUMP_BUDGET_MS");
    expect(scene).toContain("export const PLAY_DRESSING_PUMP_SKIP_DELTA");
    expect(scene).toContain("playDressingDeadline");
    expect(scene).toContain("deferredStepIncomplete");
    expect(scene).toContain("classicRoomDressingByRuntime");
    expect(scene).toContain("this.scatterCobwebs(dungeon, atmosphereRandom)");
    expect(scene).toContain("this.scatterRoomAtmosphereProps(dungeon, atmosphereRandom)");
    expect(scene).toContain("this.scatterBiomeSpriteProps(dungeon)");
    expect(scene).not.toMatch(
      /this\.addAtmosphereProps\([^)]+\);\s*this\.scatterBiomeSpriteProps/,
    );
    expect(world).toContain("PLAY_DRESSING_PUMP_SKIP_DELTA");
    expect(world).toContain("if (delta < PLAY_DRESSING_PUMP_SKIP_DELTA)");
  });
});
