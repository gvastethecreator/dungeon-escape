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
    ).toEqual({ kind: "map", kickerKey: "itemFound", restoreResolve: true });

    expect(projectPickupFeedback({ fogClear: true, mobilityBoost: true })).toEqual({
      kind: "clarity",
      kickerKey: "itemFound",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ mobilityBoost: true })).toEqual({
      kind: "mobility",
      kickerKey: "itemFound",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ handTorch: true })).toEqual({
      kind: "hand-torch",
      kickerKey: "itemFound",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ annihilationPulse: true })).toEqual({
      kind: "annihilation-pulse",
      kickerKey: "itemFound",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ shotgun: true })).toEqual({
      kind: "shotgun",
      kickerKey: "itemFound",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ luminousWard: true })).toEqual({
      kind: "luminous-ward",
      kickerKey: "itemFound",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ timeFreeze: true })).toEqual({
      kind: "time-freeze",
      kickerKey: "itemFound",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ swarmCurse: true })).toEqual({
      kind: "swarm-curse",
      kickerKey: "curseFound",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ slowCurse: true })).toEqual({
      kind: "slow-curse",
      kickerKey: "curseFound",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ frenzyCurse: true })).toEqual({
      kind: "frenzy-curse",
      kickerKey: "curseFound",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ gloomCurse: true })).toEqual({
      kind: "gloom-curse",
      kickerKey: "curseFound",
      restoreResolve: false,
    });
    expect(projectPickupFeedback({ restoreResolve: true })).toEqual({
      kind: "flask",
      kickerKey: "itemFound",
      restoreResolve: true,
    });
    expect(projectPickupFeedback({ stoneId: "ash" })).toEqual({
      kind: "stone",
      kickerKey: "itemFound",
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
        label: "DUNGEON MAP",
        mapReveal: true,
      }),
    ).toMatchObject({ kind: "map", kickerKey: "itemFound" });
  });

  test("pickup HUD is free text with pixel type and kind colors", async () => {
    const [css, host] = await Promise.all([
      Bun.file(new URL("../src/styles.css", import.meta.url)).text(),
      Bun.file(new URL("../index.html", import.meta.url)).text(),
    ]);
    expect(host).toContain('id="pickup-feedback-kicker"');
    expect(host).toContain('id="pickup-feedback-text"');
    expect(host).not.toContain("pickup-mark");
    expect(host).not.toContain("pickup-copy");
    expect(css).toContain(".pickup-feedback strong");
    expect(css).toMatch(/\.pickup-feedback strong\s*\{[\s\S]*font-family:\s*var\(--font-gothic\)/);
    expect(css).toMatch(/\.pickup-feedback strong\s*\{[\s\S]*text-transform:\s*capitalize/);
    expect(css).toContain('.pickup-feedback[data-kind="map"] strong');
    expect(css).toContain('.pickup-feedback[data-kind="mobility"] strong');
    expect(css).toContain('.pickup-feedback[data-kind="swarm-curse"] strong');
    expect(css).toContain('.pickup-feedback[data-kind="slow-curse"] strong');
    expect(css).toContain('.pickup-feedback[data-kind="frenzy-curse"] strong');
    expect(css).toContain('.pickup-feedback[data-kind="gloom-curse"] strong');
    expect(css).not.toContain(".pickup-mark");
  });
});
