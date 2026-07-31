import { describe, expect, test } from "bun:test";
import {
  createEmptyDungeonAudioFrame,
  creatureVoiceForEnemy,
  projectDungeonAudioFrame,
} from "../src/world/DungeonAudioFrame";

describe("DungeonAudioFrame", () => {
  test("maps creature voice 1:1 with kind", () => {
    expect(creatureVoiceForEnemy("spider")).toBe("spider");
  });

  test("projects fires, stones, enemies, and portal into a pooled frame", () => {
    const frame = createEmptyDungeonAudioFrame();
    projectDungeonAudioFrame(frame, {
      fires: [
        {
          root: { position: { x: 1, y: 0, z: 2 } },
          baseY: 0.4,
        },
      ],
      stones: [
        {
          kind: "stone",
          collected: false,
          stoneId: "ember",
          object: { position: { x: 3, y: 1, z: 4 } },
        },
        {
          kind: "resolve",
          collected: false,
          object: { position: { x: 9, y: 1, z: 9 } },
        },
      ],
      enemies: [
        {
          kind: "spider",
          instanceIndex: 2,
          scaleX: 1,
          scaleY: 1,
          position: { x: 5, y: 0.3, z: 6 },
        },
        {
          kind: "goblin",
          instanceIndex: 0,
          scaleX: 0,
          scaleY: 0,
          position: { x: 0, y: 0, z: 0 },
        },
      ],
      portal: { position: { x: 7, y: 0, z: 8 } },
      moodId: "ash",
    });
    expect(frame.fires).toHaveLength(1);
    expect(frame.fires[0]!.y).toBeCloseTo(0.4, 5);
    expect(frame.magicStones).toHaveLength(1);
    expect(frame.magicStones[0]!.id).toBe("stone-ember");
    expect(frame.enemies).toHaveLength(1);
    expect(frame.enemies[0]!.voice).toBe("spider");
    expect(frame.portal?.id).toBe("exit-portal");
    expect(frame.moodId).toBe("ash");
  });
});
