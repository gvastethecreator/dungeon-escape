import { describe, expect, test } from "bun:test";
import {
  PlayRuntime,
  type PlayRuntimeProgress,
  type PlayWorldPort,
  type PlayWorldUpdate,
} from "../src/game/PlayRuntime";
import type { PersistedRunSession } from "../src/game/RunSession";
import { STONE_ORDER, type StoneId } from "../src/ui/copy";

type TestDungeon = { id: string };
type TestMood = { id: string };
type TestPlayer = { x: number; z: number };
type TestWorldUpdate = PlayWorldUpdate & { frame: number };

class FakeWorld implements PlayWorldPort<TestDungeon, TestMood, TestPlayer, TestWorldUpdate> {
  readonly calls: string[] = [];
  readonly updates: TestWorldUpdate[] = [];
  setDungeonWithYield?: (
    dungeon: TestDungeon,
    mood: TestMood,
    yieldToMain: () => Promise<void>,
  ) => Promise<void>;

  setDungeon(dungeon: TestDungeon, mood: TestMood): void {
    this.calls.push(`setDungeon:${dungeon.id}:${mood.id}`);
  }

  update(
    _delta: number,
    _player: TestPlayer,
    _atExit: boolean,
    _interactPressed?: boolean,
  ): TestWorldUpdate {
    this.calls.push("update");
    const next = this.updates.shift();
    if (!next) throw new Error("Fake world update was not queued.");
    return next;
  }

  restoreSession(foundStoneIds: readonly StoneId[]): void {
    this.calls.push(`restoreSession:${foundStoneIds.join(",")}`);
  }

  restoreRuntimeProgress(
    progress: PlayRuntimeProgress["progress"],
    player: { x: number; z: number },
  ): void {
    this.calls.push(
      `restoreRuntimeProgress:${progress.difficultyElapsed}:${progress.timeFreezeRemaining ?? 0}:${progress.luminousWardRemaining ?? 0}:${player.x}:${player.z}`,
    );
  }

  dispose(): void {
    this.calls.push("dispose");
  }
}

function worldUpdate(over: Partial<TestWorldUpdate> = {}): TestWorldUpdate {
  return {
    collectedStoneId: null,
    collectedPickup: null,
    stonesFound: 0,
    stonesTotal: STONE_ORDER.length,
    portalOpen: false,
    resolveGain: 0,
    damage: 0,
    reachedLockedExit: false,
    reachedOpenExit: false,
    frame: 1,
    ...over,
  };
}

function createRuntime(): {
  runtime: PlayRuntime<TestDungeon, TestMood, TestPlayer, TestWorldUpdate>;
  world: FakeWorld;
} {
  const world = new FakeWorld();
  return { runtime: new PlayRuntime(world), world };
}

const dungeon = { id: "test-dungeon" };
const mood = { id: "test-mood" };
const player = { x: 4, z: 7 };

describe("PlayRuntime", () => {
  test("loads a fresh dungeon and starts one run state", () => {
    const { runtime, world } = createRuntime();

    const state = runtime.load({ dungeon, mood });

    expect(world.calls).toEqual(["setDungeon:test-dungeon:test-mood"]);
    expect(state).toMatchObject({
      resolve: 100,
      runMode: "playing",
      exitReached: false,
      quest: { stonesFound: 0, portalOpen: false, isRunning: true },
    });
  });

  test("loadWithYield falls back to setDungeon when the world has no async path", async () => {
    const { runtime, world } = createRuntime();
    let yielded = 0;

    const state = await runtime.loadWithYield({ dungeon, mood }, async () => {
      yielded += 1;
    });

    expect(yielded).toBe(0);
    expect(world.calls).toEqual(["setDungeon:test-dungeon:test-mood"]);
    expect(state.runMode).toBe("playing");
  });

  test("loadWithYield uses setDungeonWithYield when the world provides it", async () => {
    const { runtime, world } = createRuntime();
    let yielded = 0;
    world.setDungeonWithYield = async (nextDungeon, nextMood, yieldToMain) => {
      world.calls.push(`setDungeonWithYield:${nextDungeon.id}:${nextMood.id}:before`);
      await yieldToMain();
      world.calls.push(`setDungeonWithYield:${nextDungeon.id}:${nextMood.id}:after`);
    };

    const state = await runtime.loadWithYield({ dungeon, mood }, async () => {
      yielded += 1;
    });

    expect(yielded).toBe(1);
    expect(world.calls).toEqual([
      "setDungeonWithYield:test-dungeon:test-mood:before",
      "setDungeonWithYield:test-dungeon:test-mood:after",
    ]);
    expect(state.runMode).toBe("playing");
  });

  test("steps the world once and returns the raw update, reducer effects, and frozen state", () => {
    const { runtime, world } = createRuntime();
    runtime.load({ dungeon, mood });
    const update = worldUpdate({
      collectedStoneId: "ember",
      collectedPickup: { kind: "stone", position: { x: 1, y: 2, z: 3 } },
      frame: 7,
    });
    world.updates.push(update);

    const result = runtime.step({ delta: 0.016, player, atExit: false });

    expect(result.worldUpdate).toBe(update);
    expect(result.effects).toMatchObject({
      playPickup: true,
      sessionChanged: true,
      pickup: { stoneId: "ember" },
    });
    expect(result.state.quest.foundStoneIds).toEqual(["ember"]);
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.state.quest.foundStoneIds)).toBe(true);
  });

  test("reuses immutable state between transitions", () => {
    const { runtime, world } = createRuntime();
    const loaded = runtime.load({ dungeon, mood });

    expect(runtime.state()).toBe(loaded);
    expect(runtime.state()).toBe(loaded);

    world.updates.push(worldUpdate({ damage: 1 }));
    const stepped = runtime.step({ delta: 0.016, player, atExit: false });
    expect(stepped.state).not.toBe(loaded);
    expect(runtime.state()).toBe(stepped.state);
  });

  test("snapshots the active gameplay clock without leaking mutable arrays", () => {
    const { runtime, world } = createRuntime();
    runtime.load({ dungeon, mood });
    world.updates.push(
      worldUpdate({
        collectedStoneId: "ember",
        collectedPickup: { kind: "stone", position: { x: 1, y: 2, z: 3 } },
      }),
    );
    runtime.step({ delta: 0.016, player, atExit: false });

    const snapshot = runtime.snapshot();

    expect(snapshot).toMatchObject({
      resolve: 100,
      foundStoneIds: ["ember"],
      runMode: "playing",
      runSeconds: 0.016,
      perStoneSeconds: { ember: 0.016 },
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.foundStoneIds)).toBe(true);
  });

  test("keeps the run clock frozen while the host does not step play", () => {
    const { runtime, world } = createRuntime();
    runtime.load({ dungeon, mood });
    world.updates.push(worldUpdate(), worldUpdate());

    runtime.step({ delta: 1.25, player, atExit: false });
    expect(runtime.runSeconds()).toBeCloseTo(1.25, 5);
    expect(runtime.snapshot().runSeconds).toBeCloseTo(1.25, 5);
    expect(runtime.snapshot().runSeconds).toBeCloseTo(1.25, 5);

    runtime.step({ delta: 0.75, player, atExit: false });
    expect(runtime.runSeconds()).toBeCloseTo(2, 5);
  });

  test("loads a persisted run in world restore order", () => {
    const { runtime, world } = createRuntime();
    const persisted: PersistedRunSession = {
      resolve: 62,
      foundStoneIds: ["ember", "crypt"],
      portalOpen: false,
      runMode: "playing",
      exitReached: false,
      runSeconds: 44,
      perStoneSeconds: { ember: 12, crypt: 31 },
    };

    const state = runtime.load({
      dungeon,
      mood,
      persisted,
      runtimeProgress: {
        progress: {
          difficultyElapsed: 38,
          timeFreezeRemaining: 8,
          luminousWardRemaining: 4,
        },
        player,
      },
    });

    expect(world.calls).toEqual([
      "setDungeon:test-dungeon:test-mood",
      "restoreSession:ember,crypt",
      "restoreRuntimeProgress:38:8:4:4:7",
    ]);
    expect(state).toMatchObject({
      resolve: 62,
      runMode: "playing",
      quest: { foundStoneIds: ["ember", "crypt"], isRunning: true },
    });
    expect(runtime.snapshot().runSeconds).toBe(44);
  });

  test("restores an already loaded world through the same session order", () => {
    const { runtime, world } = createRuntime();
    runtime.load({ dungeon, mood });
    world.calls.length = 0;
    const persisted: PersistedRunSession = {
      resolve: 38,
      foundStoneIds: ["verdant"],
      portalOpen: false,
      runMode: "playing",
      exitReached: false,
      runSeconds: 27,
    };

    const state = runtime.restore(persisted, { progress: { difficultyElapsed: 27 }, player });

    expect(world.calls).toEqual(["restoreSession:verdant", "restoreRuntimeProgress:27:0:0:4:7"]);
    expect(state).toMatchObject({
      resolve: 38,
      quest: { foundStoneIds: ["verdant"], isRunning: true },
    });
  });

  test("keeps fatal damage ahead of an open exit in the same frame", () => {
    const { runtime, world } = createRuntime();
    runtime.load({ dungeon, mood });
    for (const [index, id] of STONE_ORDER.entries()) {
      world.updates.push(
        worldUpdate({
          collectedStoneId: id,
          collectedPickup: { kind: "stone", position: { x: index, y: 0, z: 0 } },
        }),
      );
      runtime.step({ delta: 0.016, player, atExit: false });
    }
    world.updates.push(worldUpdate({ damage: 100, reachedOpenExit: true }));

    const result = runtime.step({ delta: 0.016, player, atExit: true });

    expect(result.effects.endOverlay).toBe("dead");
    expect(result.state).toMatchObject({
      resolve: 0,
      runMode: "dead",
      exitReached: false,
      quest: { escaped: false, isRunning: false },
    });
  });

  test("provides critical, dead, portal, and won QA fixtures through the runtime", () => {
    const { runtime, world } = createRuntime();
    runtime.load({ dungeon, mood });

    expect(runtime.loadFixture("critical")).toMatchObject({
      resolve: 10,
      runMode: "playing",
      quest: { isRunning: true },
    });
    expect(runtime.loadFixture("dead")).toMatchObject({
      resolve: 0,
      runMode: "dead",
      exitReached: false,
      quest: { isRunning: false, escaped: false },
    });
    expect(runtime.loadFixture("portal")).toMatchObject({
      resolve: 100,
      runMode: "playing",
      exitReached: false,
      quest: { foundStoneIds: [...STONE_ORDER], portalOpen: true, escaped: false, isRunning: true },
    });
    expect(runtime.loadFixture("won")).toMatchObject({
      resolve: 100,
      runMode: "won",
      exitReached: true,
      quest: { foundStoneIds: [...STONE_ORDER], portalOpen: true, escaped: true },
    });
    expect(world.calls).toContain(`restoreSession:${STONE_ORDER.join(",")}`);
  });

  test("disposes the world once when called repeatedly", () => {
    const { runtime, world } = createRuntime();

    runtime.dispose();
    runtime.dispose();

    expect(world.calls).toEqual(["dispose"]);
    expect(() => runtime.snapshot()).toThrow("PlayRuntime is disposed.");
  });
});
