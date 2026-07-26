import { describe, expect, test } from "bun:test";

import { QuestState } from "../src/game/QuestState";
import { STONE_ORDER } from "../src/ui/copy";
import { createMagicStone } from "../src/world/MagicStoneKit";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import * as THREE from "three";

describe("four-stone quest", () => {
  test("tracks per-stone find times and opens portal only at four", () => {
    const quest = new QuestState();
    quest.start(1_000);
    expect(quest.portalOpen).toBe(false);
    expect(quest.collectStone("ember", 4_000)).toBe(true);
    expect(quest.stonesFound).toBe(1);
    expect(quest.perStoneSeconds().ember).toBeCloseTo(3, 5);
    expect(quest.collectStone("ember", 5_000)).toBe(false);
    quest.collectStone("ash", 7_000);
    quest.collectStone("crypt", 10_000);
    expect(quest.portalOpen).toBe(false);
    quest.collectStone("verdant", 13_500);
    expect(quest.portalOpen).toBe(true);
    expect(quest.snapshot(13_500).foundIds).toEqual([...STONE_ORDER]);
    quest.markEscaped(15_000);
    expect(quest.runSeconds(15_000)).toBeCloseTo(14, 5);
    expect(quest.snapshot(15_000).escaped).toBe(true);
  });

  test("magic stone kit builds four distinct action-ready pickups", () => {
    const materials = createDungeonMaterials();
    for (const id of STONE_ORDER) {
      const stone = createMagicStone(id, materials);
      const size = new THREE.Box3().setFromObject(stone.root).getSize(new THREE.Vector3());
      expect(stone.root.userData.pickupKind).toBe("stone");
      expect(stone.root.userData.stoneId).toBe(id);
      expect(size.y).toBeGreaterThan(0.5);
      expect(size.y).toBeLessThan(1.2);
      expect(stone.light.isPointLight).toBe(true);
    }
  });

  test("restores collected stone identity without replaying pickup events", () => {
    const quest = new QuestState();
    quest.restore({ foundIds: ["ember", "crypt"], escaped: false, running: true }, 8_000);

    expect(quest.snapshot(8_000)).toMatchObject({
      foundIds: ["ember", "crypt"],
      stonesFound: 2,
      portalOpen: false,
      escaped: false,
    });
    expect(quest.collectStone("ember", 9_000)).toBe(false);
    expect(quest.collectStone("ash", 9_000)).toBe(true);
  });
});
