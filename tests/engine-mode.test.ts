import { describe, expect, test } from "bun:test";
import { shouldMountForge } from "../src/game/EngineMode";

describe("engine mode resource routing", () => {
  test("mounts Forge only when its editor surface is requested", () => {
    expect(shouldMountForge("forge", "editor", false)).toBe(true);
    expect(shouldMountForge("forge", "debug", false)).toBe(true);
    expect(shouldMountForge("runtime", "editor", false)).toBe(false);
  });

  test("keeps direct Play free of the hidden Forge iframe", () => {
    expect(shouldMountForge("forge", "play", false)).toBe(false);
    expect(shouldMountForge("forge", "editor", true)).toBe(false);
  });
});
