import { describe, expect, test } from "bun:test";
import {
  inInteractionRange,
  nearestInRangeIndex,
} from "../src/world/InteractionReach";
import {
  canCollectPickupAt,
  canInteractWithChestAt,
  CHEST_INTERACTION_DISTANCE,
  PICKUP_COLLECTION_DISTANCE,
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
  });

  test("picks the nearest in-range target", () => {
    expect(
      nearestInRangeIndex({ x: 0, z: 0 }, [{ x: 2, z: 0 }, { x: 1, z: 0 }, { x: 3, z: 0 }], 1.5),
    ).toBe(1);
    expect(nearestInRangeIndex({ x: 0, z: 0 }, [{ x: 3, z: 0 }], 1)).toBeNull();
  });
});
