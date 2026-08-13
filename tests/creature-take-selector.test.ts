import { describe, expect, test } from "bun:test";
import { creatureToneAsset } from "../src/audio/AudioAssetCatalog";
import { CreatureTakeSelector, creatureToneForMood } from "../src/audio/CreatureTakeSelector";

describe("CreatureTakeSelector", () => {
  test("maps dungeon moods to creature tone families", () => {
    expect(creatureToneForMood("frost")).toBe("frost");
    expect(creatureToneForMood("sunken")).toBe("sunken");
    expect(creatureToneForMood("fungal")).toBe("fungal");
    expect(creatureToneForMood("molten")).toBe("molten");
    expect(creatureToneForMood("obsidian")).toBe("obsidian");
    expect(creatureToneForMood("backrooms")).toBe("backrooms");
    expect(creatureToneForMood("ancient")).toBe("base");
    expect(creatureToneForMood(null)).toBe("base");
  });

  test("uses the supplied random unit for deterministic base takes", () => {
    const selector = new CreatureTakeSelector();

    expect(selector.select("goblin", "voice", "base", 0)).toBe("enemy-goblin-v0");
    expect(selector.select("ratling", "attack", "base", 0.99)).toBe("enemy-ratling-attack-v2");
  });

  test("weights biome takes and avoids an immediate repeat", () => {
    const selector = new CreatureTakeSelector();
    const themed = creatureToneAsset("carrion", "voice", "frost");

    expect(selector.select("carrion", "voice", "frost", 0.99)).toBe(themed);
    expect(selector.select("carrion", "voice", "frost", 0.99)).toBe("enemy-carrion-v2");
    expect(selector.select("carrion", "voice", "frost", 0.99)).toBe(themed);
  });

  test("tracks voice and attack pools independently", () => {
    const selector = new CreatureTakeSelector();

    expect(selector.select("imp", "voice", "base", 0)).toBe("enemy-imp-v0");
    expect(selector.select("imp", "attack", "base", 0)).toBe("enemy-imp-attack-v0");
    expect(selector.select("imp", "voice", "base", 0)).toBe("enemy-imp-v1");
  });
});
