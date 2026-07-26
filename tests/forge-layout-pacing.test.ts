import { describe, expect, test } from "bun:test";

import { selectDepthSpreadRoomIds } from "../src/forge/layoutTuning";

describe("Dungeon Creation pacing", () => {
  const candidates = [1, 3, 5, 7, 9].map((depth, index) => ({ id: index, depth }));

  test("spreads special rooms across target route bands", () => {
    expect(selectDepthSpreadRoomIds(candidates, 10, [0.25, 0.75])).toEqual([1, 3]);
  });

  test("does not select the same room twice", () => {
    const selected = selectDepthSpreadRoomIds(candidates, 10, [0.2, 0.3, 0.4, 0.5]);
    expect(new Set(selected).size).toBe(selected.length);
  });

  test("prefers a recovery branch near the critical path when depth is comparable", () => {
    const selected = selectDepthSpreadRoomIds(
      [
        { id: 4, depth: 5 },
        { id: 8, depth: 6 },
      ],
      10,
      [0.5],
      new Set([8]),
    );
    expect(selected).toEqual([8]);
  });
});
