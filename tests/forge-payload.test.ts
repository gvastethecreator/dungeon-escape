import { describe, expect, test } from "bun:test";
import { normalizeForgePayload } from "../src/dungeon/forgePayload";

describe("forge payload normalize", () => {
  test("accepts a minimal valid forge graph", () => {
    const ok = normalizeForgePayload({
      valid: true,
      seed: 42,
      name: "Test",
      W: 21,
      H: 21,
      entrance: 0,
      boss: 1,
      rooms: [{ id: 0 }, { id: 1 }],
      edges: [{ a: 0, b: 1, isLoop: false }],
      params: { roomCount: 8, loopChance: 0.1, decorDensity: 0.6, themeKey: "grim" },
      grid: new Uint8Array(21 * 21),
    });
    expect(ok).not.toBeNull();
    expect(ok?.seed).toBe(42);
  });

  test("rejects invalid or incomplete payloads", () => {
    expect(normalizeForgePayload(null)).toBeNull();
    expect(normalizeForgePayload({ valid: false, W: 21, H: 21 })).toBeNull();
    expect(
      normalizeForgePayload({ valid: true, W: 2, H: 2, rooms: [], edges: [], params: {} }),
    ).toBeNull();
  });

  test("requires a bounded loop chance and a theme key", () => {
    const payload = {
      valid: true,
      seed: 42,
      W: 21,
      H: 21,
      entrance: 0,
      boss: 1,
      rooms: [{ id: 0 }, { id: 1 }],
      edges: [],
      params: { roomCount: 8, loopChance: 0.1, decorDensity: 0.6, themeKey: "grim" },
      grid: new Uint8Array(21 * 21),
    };

    expect(
      normalizeForgePayload({
        ...payload,
        params: { roomCount: 8, decorDensity: 0.6, themeKey: "grim" },
      }),
    ).toBeNull();
    expect(
      normalizeForgePayload({
        ...payload,
        params: { ...payload.params, loopChance: 1.1 },
      }),
    ).toBeNull();
    expect(
      normalizeForgePayload({
        ...payload,
        params: { ...payload.params, themeKey: "  " },
      }),
    ).toBeNull();
  });
});
