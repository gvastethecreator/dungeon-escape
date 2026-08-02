import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { isExitReachable, isFloorCell } from "../src/dungeon/generateDungeon";
import { gridToWorld } from "../src/dungeon/gridCollision";
import {
  generateDungeonFloorSet,
  MAX_DUNGEON_FLOORS,
} from "../src/dungeon/generateDungeonFloors";
import {
  canCollectPickup,
  canInteractWithChest,
  INTERACTION_VERTICAL_BAND,
} from "../src/world/InteractionReach";
import {
  activeFloorFromSupportY,
  STORY_HEIGHT,
  STORY_STEP_COUNT,
  STORY_STEP_RISE,
} from "../src/world/StoryMetrics";
import {
  buildStairFlight,
  worldTreadColliders,
} from "../src/world/StaircaseKit";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { pickSupportTop, stepVerticalMotion, VERTICAL_EVENT } from "../src/player/VerticalMotion";
import { biomeCampaignFloorCount } from "../src/systems/BiomeCampaign";
import { listBiomeIds } from "../src/systems/BiomeIdentity";
import { WORLD_TILE_SIZE } from "../src/world/WorldMetrics";

describe("multi-floor smoke", () => {
  test("campaign never exceeds three resident floors", () => {
    expect(MAX_DUNGEON_FLOORS).toBe(3);
    for (const id of listBiomeIds()) {
      expect(biomeCampaignFloorCount(id)).toBeLessThanOrEqual(3);
    }
  });

  test("stack shafts align in world XZ and stay walkable", () => {
    const stack = generateDungeonFloorSet("SMOKE-MULTI-FLOOR", { roomTarget: 12 }, 3);
    expect(stack.floors).toHaveLength(3);
    expect(stack.shaftPlan.links).toHaveLength(2);

    for (const link of stack.shaftPlan.links) {
      const lower = stack.floors[link.lowerFloor]!;
      const upper = stack.floors[link.upperFloor]!;
      const a = gridToWorld(lower, link.anchor, WORLD_TILE_SIZE);
      const b = gridToWorld(upper, link.anchor, WORLD_TILE_SIZE);
      expect(a.x).toBeCloseTo(b.x, 5);
      expect(a.z).toBeCloseTo(b.z, 5);
      expect(link.footprint.length).toBeGreaterThanOrEqual(3);
      for (const cell of link.footprint) {
        expect(isFloorCell(lower, cell.x, cell.y)).toBe(true);
        expect(isFloorCell(upper, cell.x, cell.y)).toBe(true);
      }
      expect(isExitReachable(lower)).toBe(true);
      expect(isExitReachable(upper)).toBe(true);
    }

    // Reciprocal stairs share shaft ids.
    const down = stack.floors[0]!.floor!.stairs.find((s) => s.direction === "down")!;
    const up = stack.floors[1]!.floor!.stairs.find((s) => s.direction === "up")!;
    expect(down.shaftId).toBe(up.shaftId);
    expect(down.cell).toEqual(up.cell);
  });

  test("stair flight tops reach a full story and support step-up climb", () => {
    const materials = createDungeonMaterials();
    const flight = buildStairFlight("up", materials, WORLD_TILE_SIZE);
    expect(flight.stepCount).toBe(STORY_STEP_COUNT);
    expect(flight.treadColliders.at(-1)!.maxY).toBeGreaterThanOrEqual(STORY_HEIGHT - 1e-6);

    const tops = flight.treadColliders.map((c) => c.maxY!);
    let feetY = 0.08;
    let eyeY = 1.62;
    for (let i = 0; i < tops.length; i += 1) {
      const support = pickSupportTop(tops, feetY, STORY_STEP_RISE + 0.05, 0.12);
      expect(support).not.toBeNull();
      const floorEyeY = support! + 1.62 - 0.08;
      const state = {
        y: eyeY,
        velocity: 0,
        grounded: true,
        landingSpeed: 0,
        airJumpsRemaining: 1,
      };
      const events = stepVerticalMotion(state, 1 / 60, false, {
        eyeHeight: 1.62,
        floorEyeY,
        ceilingHeight: STORY_HEIGHT * 2,
        headClearance: 0.18,
        gravity: 17,
        jumpSpeed: 5.8,
        maxAirJumps: 1,
        maxStepUp: STORY_STEP_RISE + 0.05,
      });
      expect(events & VERTICAL_EVENT.steppedUp).not.toBe(0);
      eyeY = state.y;
      feetY = eyeY - 1.62 + 0.08;
    }
    expect(eyeY).toBeGreaterThan(STORY_HEIGHT);
  });

  test("vertical interact band blocks same-XZ other-slab grabs", () => {
    expect(canCollectPickup(0.5, false, "stone", 0)).toBe(true);
    expect(canCollectPickup(0.5, false, "stone", INTERACTION_VERTICAL_BAND + 0.1)).toBe(false);
    expect(canInteractWithChest(0.5, false, 0)).toBe(true);
    expect(canInteractWithChest(0.5, false, STORY_HEIGHT)).toBe(false);
  });

  test("active floor index does not flip mid-flight", () => {
    expect(activeFloorFromSupportY(STORY_HEIGHT * 0.4, 3)).toBe(0);
    expect(activeFloorFromSupportY(STORY_HEIGHT * 0.9, 3)).toBe(1);
    expect(activeFloorFromSupportY(STORY_HEIGHT + 0.05, 3)).toBe(1);
  });

  test("host rebinds floor without setDungeon teleport", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const controller = readFileSync("src/player/FirstPersonController.ts", "utf8");
    const world = readFileSync("src/world/DungeonWorld.ts", "utf8");

    expect(controller).toContain("bindDungeon(dungeon: DungeonData)");
    expect(world).toContain("rebindActiveDungeon(dungeon: DungeonData)");
    expect(main).toContain("controller.bindDungeon(nextDungeon)");
    expect(main).toContain("world.rebindActiveDungeon(nextDungeon)");
    // Height rebind path must not call setDungeon (teleport to spawn).
    const rebindStart = main.indexOf("Multi-slab: rebind the logical floor");
    const rebindEnd = main.indexOf("if (dungeon && player.cell)", rebindStart + 10);
    const rebindBlock = main.slice(rebindStart, rebindEnd);
    expect(rebindBlock).not.toContain("controller.setDungeon(");
    expect(rebindBlock).toContain("Never call controller.setDungeon");
  });

  test("world tread colliders preserve absolute tops under yaw", () => {
    const materials = createDungeonMaterials();
    const flight = buildStairFlight("up", materials, WORLD_TILE_SIZE);
    const world = worldTreadColliders(flight.treadColliders, 12, STORY_HEIGHT, -8, Math.PI / 2);
    expect(world.at(-1)!.maxY).toBeCloseTo(STORY_HEIGHT + flight.treadColliders.at(-1)!.maxY!, 5);
  });
});
