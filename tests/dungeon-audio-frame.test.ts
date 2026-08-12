import { describe, expect, test } from "bun:test";
import * as THREE from "three";
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
      pickups: [
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
    expect(frame.pickupKinds).toEqual(["stone", "resolve"]);
    expect(frame.enemies).toHaveLength(1);
    expect(frame.enemies[0]!.voice).toBe("spider");
    expect(frame.portal?.id).toBe("exit-portal");
    expect(frame.moodId).toBe("ash");
  });

  test("uses resident-root world coordinates for upper-slab fires and stones", () => {
    const residentRoot = new THREE.Group();
    residentRoot.position.y = 8.8;
    const fireRoot = new THREE.Group();
    fireRoot.position.set(1, 1.42, 2);
    const stone = new THREE.Group();
    stone.position.set(3, 0, 4);
    residentRoot.add(fireRoot, stone);
    residentRoot.updateMatrixWorld(true);

    const frame = createEmptyDungeonAudioFrame();
    projectDungeonAudioFrame(frame, {
      fires: [{ root: fireRoot, baseY: 0.4 }],
      pickups: [{ kind: "stone", collected: false, stoneId: "ember", object: stone }],
      enemies: [],
      portal: null,
      moodId: "ash",
    });

    expect(frame.fires[0]!.x).toBeCloseTo(1, 5);
    expect(frame.fires[0]!.y).toBeCloseTo(10.62, 5);
    expect(frame.fires[0]!.z).toBeCloseTo(2, 5);
    expect(frame.magicStones[0]!.x).toBeCloseTo(3, 5);
    expect(frame.magicStones[0]!.y).toBeCloseTo(8.8, 5);
    expect(frame.magicStones[0]!.z).toBeCloseTo(4, 5);
  });
});
