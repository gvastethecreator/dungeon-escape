import { describe, expect, test } from "bun:test";

import {
  LocalRunSaveCoordinator,
  type LocalRunSaveClock,
} from "../src/game/LocalRunSaveCoordinator";

class FakeClock implements LocalRunSaveClock {
  readonly pending = new Map<number, { callback: () => void; delayMs: number }>();
  #nextId = 1;

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.#nextId;
    this.#nextId += 1;
    this.pending.set(id, { callback, delayMs });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number);
  }

  runNext(): void {
    const next = this.pending.entries().next().value as
      | [number, { callback: () => void; delayMs: number }]
      | undefined;
    if (!next) return;
    this.pending.delete(next[0]);
    next[1].callback();
  }
}

describe("local run save coordinator", () => {
  test("keeps the first scheduled deadline until it fires", () => {
    const clock = new FakeClock();
    let writes = 0;
    const saves = new LocalRunSaveCoordinator({
      isActive: () => true,
      persist: () => {
        writes += 1;
        return true;
      },
      onFailure: () => undefined,
      clock,
    });

    expect(saves.schedule()).toBe(true);
    expect(saves.schedule(0)).toBe(false);
    expect([...clock.pending.values()].map((task) => task.delayMs)).toEqual([1_000]);
    clock.runNext();
    expect(writes).toBe(1);
    expect(saves.schedule(25)).toBe(true);
    expect([...clock.pending.values()].map((task) => task.delayMs)).toEqual([25]);
  });

  test("flush cancels pending work and persists exactly once when active", () => {
    const clock = new FakeClock();
    let active = true;
    let writes = 0;
    const saves = new LocalRunSaveCoordinator({
      isActive: () => active,
      persist: () => {
        writes += 1;
        return true;
      },
      onFailure: () => undefined,
      clock,
    });

    saves.schedule();
    expect(saves.flush()).toBe(true);
    expect(clock.pending.size).toBe(0);
    clock.runNext();
    expect(writes).toBe(1);

    active = false;
    expect(saves.schedule()).toBe(false);
    expect(saves.flush()).toBe(false);
    expect(writes).toBe(1);
  });

  test("latches failure feedback until a successful write rearms it", () => {
    const outcomes = [false, false, true, false];
    let failures = 0;
    const saves = new LocalRunSaveCoordinator({
      isActive: () => true,
      persist: () => outcomes.shift() ?? true,
      onFailure: () => {
        failures += 1;
      },
    });

    expect(saves.flush()).toBe(false);
    expect(saves.flush()).toBe(false);
    expect(failures).toBe(1);
    expect(saves.flush()).toBe(true);
    expect(saves.flush()).toBe(false);
    expect(failures).toBe(2);
  });

  test("treats thrown writes as failures and disposal cancels without persisting", () => {
    const clock = new FakeClock();
    let failures = 0;
    let writes = 0;
    const saves = new LocalRunSaveCoordinator({
      isActive: () => true,
      persist: () => {
        writes += 1;
        throw new Error("storage blocked");
      },
      onFailure: () => {
        failures += 1;
      },
      clock,
    });

    expect(saves.flush()).toBe(false);
    expect(failures).toBe(1);
    saves.schedule();
    saves.dispose();
    saves.dispose();
    expect(clock.pending.size).toBe(0);
    expect(saves.schedule()).toBe(false);
    expect(saves.flush()).toBe(false);
    expect(writes).toBe(1);
  });
});
