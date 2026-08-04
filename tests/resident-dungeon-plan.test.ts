import { describe, expect, test } from "bun:test";

import { FLOOR } from "../src/dungeon/generateDungeon";
import { generateDungeonFloorSet } from "../src/dungeon/generateDungeonFloors";
import {
  createResidentDungeonPlan,
  deserializeResidentDungeonPlan,
  serializeResidentDungeonPlan,
} from "../src/world/ResidentDungeonPlan";
import { ResidentDungeonRenderer } from "../src/world/ResidentDungeonRenderer";

describe("resident dungeon plan", () => {
  test("is deterministic, typed, and JSON-safe for the complete four-floor stack", () => {
    const first = generateDungeonFloorSet("RDL16-plan-determinism", { roomTarget: 8 }, 4);
    const second = generateDungeonFloorSet("RDL16-plan-determinism", { roomTarget: 8 }, 4);
    const firstPlan = createResidentDungeonPlan(first.floors, undefined, {
      moodId: "ash",
      decorDensity: 0.6,
    });
    const secondPlan = createResidentDungeonPlan(second.floors, undefined, {
      moodId: "ash",
      decorDensity: 0.6,
    });

    expect(firstPlan.hash).toBe(secondPlan.hash);
    expect(firstPlan.floorCount).toBe(4);
    expect(firstPlan.shafts).toHaveLength(3);
    expect(firstPlan.floors.every((floor) => floor.rooms.length > 0)).toBe(true);
    expect(firstPlan.floors.every((floor) => floor.light.seed.endsWith(":fire-props"))).toBe(true);
    expect(firstPlan.floors.every((floor) => floor.light.fixtures.length > 0)).toBe(true);
    expect(
      firstPlan.floors.every((floor) => floor.roomWallArt.every((art) => art.catalogKey)),
    ).toBe(true);
    const rewardIds = firstPlan.floors.flatMap((floor) => [
      ...floor.rewards.slots.map((slot) => slot.id),
      ...floor.rewards.healthChestIds,
      ...floor.rewards.freePickups.map((pickup) => pickup.id),
    ]);
    expect(new Set(rewardIds).size).toBe(rewardIds.length);
    expect(
      firstPlan.floors.every((floor) =>
        floor.rewards.slots.every((slot) => slot.floorIndex === floor.floorIndex),
      ),
    ).toBe(true);
    expect(
      firstPlan.floors.every((floor) =>
        floor.light.fixtures.every((fixture) => fixture.catalogKey),
      ),
    ).toBe(true);
    expect(firstPlan.floors.every((floor) => floor.atmosphere.seed.endsWith(":atmosphere"))).toBe(
      true,
    );
    expect(firstPlan.floors.every((floor) => floor.floorCells instanceof Uint32Array)).toBe(true);
    expect(firstPlan.floors.every((floor) => floor.openVerticalCells instanceof Uint32Array)).toBe(
      true,
    );
    const decoded = JSON.parse(serializeResidentDungeonPlan(firstPlan)) as {
      floors: Array<{ floorCells: number[]; stairs: Array<{ footprint: number[] }> }>;
      shafts: Array<{ footprint: number[] }>;
    };
    expect(decoded.floors).toHaveLength(4);
    expect(decoded.floors[0]!.floorCells.length).toBeGreaterThan(0);
    expect(decoded.floors.flatMap((floor) => floor.stairs)).toHaveLength(6);
    expect(decoded.shafts).toHaveLength(3);
    expect(decoded.floors[0]).not.toHaveProperty("geometry");
    expect(decoded.floors[0]).not.toHaveProperty("material");
    expect(decoded.shafts[0]).not.toHaveProperty("matrix");
    const roundTrip = deserializeResidentDungeonPlan(serializeResidentDungeonPlan(firstPlan));
    expect(roundTrip.hash).toBe(firstPlan.hash);
    expect(roundTrip.floors[0]!.floorCells).toBeInstanceOf(Uint32Array);
    expect(roundTrip.floors[0]!.rewards.slots.length).toBe(
      firstPlan.floors[0]!.rewards.slots.length,
    );
    expect(roundTrip.floors[0]!.rewards.freePickups).toEqual(
      firstPlan.floors[0]!.rewards.freePickups,
    );
    expect(() =>
      deserializeResidentDungeonPlan(
        serializeResidentDungeonPlan(firstPlan).replace(firstPlan.hash, "fnv1a-tampered"),
      ),
    ).toThrow("hash mismatch");
  });

  test("renderer confirms topology and rejects a mutated floor before commit", () => {
    const stack = generateDungeonFloorSet("RDL16-renderer-contract", { roomTarget: 8 }, 4);
    const plan = createResidentDungeonPlan(stack.floors, undefined, {
      moodId: "ash",
      decorDensity: 0.6,
    });
    const renderer = new ResidentDungeonRenderer(plan);
    const receipt = renderer.confirm(stack.floors);

    expect(receipt.planHash).toBe(plan.hash);
    expect(receipt.floors.map((floor) => floor.floorIndex)).toEqual([0, 1, 2, 3]);
    expect(receipt.shaftCount).toBe(3);
    expect(receipt.stairIds).toHaveLength(6);
    expect(receipt.floors.every((floor) => floor.lightFixtures > 0)).toBe(true);
    expect(receipt.floors.every((floor) => floor.rewardSlots >= 8)).toBe(true);

    const mutated = stack.floors.map((floor) => ({
      ...floor,
      grid: floor.grid.map((row) => new Uint8Array(row)),
    }));
    const target = mutated[0]!;
    const wallRow = target.grid.find((row) => row.some((cell) => cell !== FLOOR));
    const wallX = wallRow ? wallRow.findIndex((cell) => cell !== FLOOR) : -1;
    const wallY = wallRow ? target.grid.indexOf(wallRow) : -1;
    expect(wallX).toBeGreaterThanOrEqual(0);
    expect(wallY).toBeGreaterThanOrEqual(0);
    target.grid[wallY]![wallX] = FLOOR;
    expect(() => renderer.confirm(mutated)).toThrow("floor cells cardinality changed");

    const roomMutated = stack.floors.map((floor) => ({
      ...floor,
      rooms: floor.rooms.map((room) => ({ ...room })),
    }));
    roomMutated[0]!.rooms[0]!.center.x += 1;
    expect(() => renderer.confirm(roomMutated)).toThrow("room 0 changed");
  });
});
