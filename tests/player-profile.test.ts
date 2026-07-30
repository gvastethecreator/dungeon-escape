import { describe, expect, test } from "bun:test";

import {
  PLAYER_PROFILE_KEY,
  completeCampaignBiome,
  createPlayerProfile,
  isBiomeUnlocked,
  readPlayerProfile,
  updatePlayerIdentity,
  writePlayerProfile,
} from "../src/game/PlayerProfile";

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("persistent player profile and ordered campaign", () => {
  test("starts at Ancient and unlocks exactly one next biome per clear", () => {
    const profile = createPlayerProfile("Cristian", 4, 100);
    expect(profile).not.toBeNull();
    expect(isBiomeUnlocked(profile!, "ancient")).toBe(true);
    expect(isBiomeUnlocked(profile!, "molten")).toBe(false);

    const afterAncient = completeCampaignBiome(profile!, "ancient", 200);
    expect(afterAncient.highestUnlockedRank).toBe(1);
    expect(afterAncient.clears.ancient).toBe(1);
    expect(isBiomeUnlocked(afterAncient, "molten")).toBe(true);
    expect(isBiomeUnlocked(afterAncient, "frost")).toBe(false);

    // A locked biome cannot skip campaign order.
    expect(completeCampaignBiome(afterAncient, "frost", 300)).toEqual(afterAncient);
    const afterMolten = completeCampaignBiome(afterAncient, "molten", 400);
    expect(afterMolten.highestUnlockedRank).toBe(2);
    expect(isBiomeUnlocked(afterMolten, "frost")).toBe(true);
  });

  test("round-trips profile, avatar, and campaign clears through browser storage", () => {
    const storage = memoryStorage();
    const initial = createPlayerProfile("Ada", 7, 100)!;
    const progressed = completeCampaignBiome(initial, "ancient", 200);
    expect(writePlayerProfile(progressed, storage)).toBe(true);
    expect(readPlayerProfile(storage)).toEqual(progressed);

    const renamed = updatePlayerIdentity(progressed, "Ada Prime", 9, 300);
    expect(renamed?.clears).toEqual({ ancient: 1 });
    expect(renamed?.highestUnlockedRank).toBe(1);
    expect(renamed?.avatarIndex).toBe(9);
  });

  test("rejects invalid names, avatars, and corrupt progress without throwing", () => {
    const storage = memoryStorage();
    expect(createPlayerProfile("", 0)).toBeNull();
    expect(createPlayerProfile("Valid", 999)).toBeNull();
    storage.setItem(
      PLAYER_PROFILE_KEY,
      JSON.stringify({
        version: 1,
        name: "Valid",
        avatarIndex: 0,
        highestUnlockedRank: 99,
        clears: {},
        updatedAt: 1,
      }),
    );
    expect(readPlayerProfile(storage)).toBeNull();
  });
});
