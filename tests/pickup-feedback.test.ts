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
    expect(projectPickupFeedback({ swarmCurse: true })).toEqual({
      kind: "swarm-curse",
      kickerKey: "swarmCurse",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ slowCurse: true })).toEqual({
      kind: "slow-curse",
      kickerKey: "slowCurse",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ frenzyCurse: true })).toEqual({
      kind: "frenzy-curse",
      kickerKey: "frenzyCurse",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ gloomCurse: true })).toEqual({
      kind: "gloom-curse",
      kickerKey: "gloomCurse",
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

  test("styles utilities and each curse with a distinct marker silhouette", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    expect(css).toContain('.pickup-feedback[data-kind="map"] .pickup-mark::before');
    expect(css).toContain('.pickup-feedback[data-kind="mobility"] .pickup-mark');
    expect(css).toContain('.pickup-feedback[data-kind="swarm-curse"] .pickup-mark');
    expect(css).toContain('.pickup-feedback[data-kind="slow-curse"] .pickup-mark');
    expect(css).toContain('.pickup-feedback[data-kind="frenzy-curse"] .pickup-mark');
    expect(css).toContain('.pickup-feedback[data-kind="gloom-curse"] .pickup-mark');
  });
});
