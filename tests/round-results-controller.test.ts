import { describe, expect, test } from "bun:test";

import type { LeaderboardEntry } from "../src/leaderboard/contract";
import { RoundResultsController, type RoundResultsState } from "../src/ui/RoundResultsController";

function response(...scores: number[]): { entries: LeaderboardEntry[] } {
  return { entries: scores.map((score) => ({ score }) as LeaderboardEntry) };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("RoundResultsController", () => {
  test("publishes ranked, empty, and outside Hall states", async () => {
    const states: RoundResultsState[] = [];
    const ranked = new RoundResultsController(async () => response(120, 90), 2);
    await ranked.begin(100, (state) => states.push(state));
    expect(states.at(-1)).toMatchObject({ kind: "ranked", rank: "#2 PROJECTED" });

    const empty = new RoundResultsController(async () => response(), 2);
    await empty.begin(100, (state) => states.push(state));
    expect(states.at(-1)?.kind).toBe("empty");

    const outside = new RoundResultsController(async () => response(120, 90), 2);
    await outside.begin(10, (state) => states.push(state));
    expect(states.at(-1)).toMatchObject({ kind: "outside", rank: "OUTSIDE TOP 2" });
  });

  test("retries one timeout and reports other loader failures as unavailable", async () => {
    let calls = 0;
    const states: RoundResultsState[] = [];
    const retrying = new RoundResultsController(async () => {
      calls += 1;
      if (calls === 1) throw new Error("Leaderboard request timed out.");
      return response(80);
    });

    await retrying.begin(100, (state) => states.push(state));
    expect(calls).toBe(2);
    expect(states.at(-1)?.kind).toBe("ranked");

    const unavailable = new RoundResultsController(async () => {
      throw new Error("offline");
    });
    await unavailable.begin(100, (state) => states.push(state));
    expect(states.at(-1)?.kind).toBe("unavailable");
  });

  test("ignores stale responses after a newer comparison", async () => {
    const first = deferred<{ entries: LeaderboardEntry[] }>();
    const second = deferred<{ entries: LeaderboardEntry[] }>();
    const requests = [first, second];
    const states: RoundResultsState[] = [];
    const controller = new RoundResultsController(() => requests.shift()!.promise);

    const oldRun = controller.begin(50, (state) => states.push(state));
    const newRun = controller.begin(200, (state) => states.push(state));
    first.resolve(response(100));
    await oldRun;
    second.resolve(response(100));
    await newRun;

    expect(states.filter((state) => state.kind === "ranked")).toHaveLength(1);
    expect(states.at(-1)).toMatchObject({ kind: "ranked", rank: "#1 PROJECTED" });
  });

  test("saved rank wins over an in-flight projection and custom cancels pending work", async () => {
    const pending = deferred<{ entries: LeaderboardEntry[] }>();
    const states: RoundResultsState[] = [];
    const controller = new RoundResultsController(() => pending.promise);
    const comparison = controller.begin(100, (state) => states.push(state));

    controller.save(3, 100, (state) => states.push(state));
    pending.resolve(response(150));
    await comparison;
    expect(states.at(-1)).toMatchObject({ kind: "ranked", rank: "#3 IN THE HALL" });

    const stale = deferred<{ entries: LeaderboardEntry[] }>();
    const custom = new RoundResultsController(() => stale.promise);
    const staleComparison = custom.begin(100, (state) => states.push(state));
    custom.showCustom((state) => states.push(state));
    stale.resolve(response(50));
    await staleComparison;
    expect(states.at(-1)?.kind).toBe("custom");
  });
});
