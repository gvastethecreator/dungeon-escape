import { describe, expect, test } from "bun:test";
import {
  canCollectPickup,
  canCollectPickupAt,
  canInteractWithChest,
  canInteractWithChestAt,
  CHEST_INTERACTION_DISTANCE,
  inInteractionRange,
  nearestInRangeIndex,
  PICKUP_COLLECTION_DISTANCE,
  STONE_COLLECTION_DISTANCE,
} from "../src/world/InteractionReach";
import {
  canCollectPickupAt as canCollectPickupAtScene,
  CHEST_INTERACTION_DISTANCE as SCENE_CHEST_DISTANCE,
} from "../src/world/StaticDungeonScene";

describe("InteractionReach", () => {
  test("range helpers match chest and pickup limits", () => {
    const player = { x: 0, z: 0 };
    expect(inInteractionRange(player, { x: CHEST_INTERACTION_DISTANCE, z: 0 }, CHEST_INTERACTION_DISTANCE)).toBe(
      true,
    );
    expect(
      canInteractWithChestAt(player, { x: CHEST_INTERACTION_DISTANCE + 0.05, z: 0 }, false),
    ).toBe(false);
    expect(canCollectPickupAt(player, { x: PICKUP_COLLECTION_DISTANCE, z: 0 })).toBe(true);
    expect(canCollectPickupAt(player, { x: 2, z: 0 })).toBe(false);
    expect(canCollectPickup(STONE_COLLECTION_DISTANCE, false, "stone")).toBe(true);
    expect(canCollectPickup(STONE_COLLECTION_DISTANCE + 0.01, false, "stone")).toBe(false);
    expect(canInteractWithChest(CHEST_INTERACTION_DISTANCE, true)).toBe(false);
  });

  test("StaticDungeonScene re-exports stay aligned", () => {
    expect(SCENE_CHEST_DISTANCE).toBe(CHEST_INTERACTION_DISTANCE);
    expect(canCollectPickupAtScene({ x: 0, z: 0 }, { x: PICKUP_COLLECTION_DISTANCE, z: 0 })).toBe(
      true,
    );
  });

  test("picks the nearest in-range target", () => {
    expect(
      nearestInRangeIndex({ x: 0, z: 0 }, [{ x: 2, z: 0 }, { x: 1, z: 0 }, { x: 3, z: 0 }], 1.5),
    ).toBe(1);
    expect(nearestInRangeIndex({ x: 0, z: 0 }, [{ x: 3, z: 0 }], 1)).toBeNull();
  });
});

