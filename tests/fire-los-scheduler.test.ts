import { describe, expect, test } from "bun:test";

import {
  FIRE_LOS_CHECK_BUDGET,
  FIRE_LOS_MAX_STALE_SECONDS,
  FireLosScheduler,
  type FireLosCandidate,
} from "../src/world/FireLosScheduler";

function candidates(count: number, age = 0.13): FireLosCandidate[] {
  return Array.from({ length: count }, () => ({ cutoffDistance: 16, losAge: age }));
}

describe("FireLosScheduler", () => {
  test("caps a synchronized spike and checks nearest due fires first", () => {
    const scheduler = new FireLosScheduler();
    const fires = candidates(12);
    const distances = Float32Array.from([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);

    const selected = [...scheduler.select(fires, distances, 0)];

    expect(selected).toHaveLength(FIRE_LOS_CHECK_BUDGET);
    expect(selected).toEqual([11, 10, 9, 8, 7, 6]);
  });

  test("promotes stale fires before newer nearby candidates", () => {
    const scheduler = new FireLosScheduler();
    const fires = candidates(8);
    fires[0]!.losAge = FIRE_LOS_MAX_STALE_SECONDS;
    const distances = Float32Array.from([15, 1, 2, 3, 4, 5, 6, 7]);

    const selected = [...scheduler.select(fires, distances, 0)];

    expect(selected[0]).toBe(0);
    expect(selected).toHaveLength(FIRE_LOS_CHECK_BUDGET);
  });

  test("keeps 24 active fires within the stale bound through a 160 ms frame gap", () => {
    const scheduler = new FireLosScheduler();
    const fires = candidates(24, 0);
    const distances = Float32Array.from({ length: 24 }, (_, index) => index * 0.5 + 1);
    let oldest = 0;

    for (let frame = 0; frame < 120; frame += 1) {
      scheduler.select(fires, distances, frame === 60 ? 0.16 : 1 / 60);
      for (const fire of fires) oldest = Math.max(oldest, fire.losAge);
    }

    expect(oldest).toBeLessThanOrEqual(FIRE_LOS_MAX_STALE_SECONDS);
  });
});
