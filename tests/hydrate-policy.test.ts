import { describe, expect, test } from "bun:test";
import { shouldAdoptHydratedSeed } from "../src/game/hydratePolicy";

describe("hydrate policy on enter PLAY", () => {
  test("adopts remote seed only when no local dungeon exists", () => {
    expect(shouldAdoptHydratedSeed(false, "REMOTE-1", "LOCAL-1")).toBe(true);
    expect(shouldAdoptHydratedSeed(false, "REMOTE-1", "REMOTE-1")).toBe(true);
  });

  test("never adopts when a local dungeon is already loaded", () => {
    expect(shouldAdoptHydratedSeed(true, "REMOTE-1", "LOCAL-1")).toBe(false);
    expect(shouldAdoptHydratedSeed(true, "REMOTE-1", "REMOTE-1")).toBe(false);
  });

  test("rejects empty remote seed", () => {
    expect(shouldAdoptHydratedSeed(false, "", "LOCAL")).toBe(false);
    expect(shouldAdoptHydratedSeed(false, null, "LOCAL")).toBe(false);
    expect(shouldAdoptHydratedSeed(false, undefined, "LOCAL")).toBe(false);
  });
});
