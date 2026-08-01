import { describe, expect, test } from "bun:test";
import { projectPickupFeedback } from "../src/ui/PickupFeedback";

describe("PickupFeedback", () => {
  test("priority order matches former host ternaries", () => {
    expect(
      projectPickupFeedback({
        mapReveal: true,
        stoneId: "ember",
        restoreResolve: true,
      }),
    ).toEqual({ kind: "map", kickerKey: "map", restoreResolve: true });

    expect(projectPickupFeedback({ fogClear: true, mobilityBoost: true })).toEqual({
      kind: "clarity",
      kickerKey: "clarity",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ mobilityBoost: true })).toEqual({
      kind: "mobility",
      kickerKey: "mobility",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ annihilationPulse: true })).toEqual({
      kind: "annihilation-pulse",
      kickerKey: "annihilationPulse",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ luminousWard: true })).toEqual({
      kind: "luminous-ward",
      kickerKey: "luminousWard",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ timeFreeze: true })).toEqual({
      kind: "time-freeze",
      kickerKey: "timeFreeze",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ restoreResolve: true })).toEqual({
      kind: "flask",
      kickerKey: "flask",
      restoreResolve: true,
    });
    expect(projectPickupFeedback({ stoneId: "ash" })).toEqual({
      kind: "stone",
      kickerKey: "small",
      stoneId: "ash",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({})).toEqual({
      kind: "notice",
      kickerKey: "notice",
      restoreResolve: false,
    });
  });

  test("accepts the RunSession effects.pickup flag bag", () => {
    expect(
      projectPickupFeedback({
        label: "DUNGEON MAPPED",
        mapReveal: true,
      }),
    ).toMatchObject({ kind: "map", kickerKey: "map" });
  });
});

