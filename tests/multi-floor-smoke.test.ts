import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { isExitReachable, isFloorCell } from "../src/dungeon/generateDungeon";
import { stairFlightFootprintCells } from "../src/dungeon/StairShaftPlan";
import {
  createFloorDeckColliders,
  createFloorSupportHeightfield,
  gridToWorld,
  overlapsWorldCollider,
  sampleFloorSupportHeightfield,
} from "../src/dungeon/gridCollision";
import { generateDungeonFloorSet, MAX_DUNGEON_FLOORS } from "../src/dungeon/generateDungeonFloors";
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
  stairFlightRootPosition,
  worldTreadColliders,
} from "../src/world/StaircaseKit";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { pickSupportTop, stepVerticalMotion, VERTICAL_EVENT } from "../src/player/VerticalMotion";
import { biomeCampaignFloorCount } from "../src/systems/BiomeCampaign";
import { listBiomeIds } from "../src/systems/BiomeIdentity";
import { WORLD_TILE_SIZE } from "../src/world/WorldMetrics";

describe("multi-floor smoke", () => {
  test("campaign keeps a bounded four-floor resident stack", () => {
    expect(MAX_DUNGEON_FLOORS).toBe(4);
    for (const id of listBiomeIds()) {
      expect(biomeCampaignFloorCount(id)).toBeLessThanOrEqual(4);
    }
    expect(biomeCampaignFloorCount("backrooms")).toBe(4);
  });

  test("stack shafts align in world XZ and stay walkable", () => {
    const stack = generateDungeonFloorSet("SMOKE-MULTI-FLOOR", { roomTarget: 12 }, 4);
    expect(stack.floors).toHaveLength(4);
    expect(stack.shaftPlan.links).toHaveLength(3);

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
    const up = stack.floors[0]!.floor!.stairs.find((s) => s.direction === "up")!;
    const down = stack.floors[1]!.floor!.stairs.find((s) => s.direction === "down")!;
    expect(up.shaftId).toBe(down.shaftId);
    expect(up.cell).toEqual(down.cell);
  });

  test("raised floor support uses compact row spans and leaves shaft mouths open", () => {
    const stack = generateDungeonFloorSet("SMOKE-DECK-COLLIDERS", { roomTarget: 20 }, 4);
    for (const floor of stack.floors.slice(1)) {
      const slabY = (floor.floor?.index ?? 0) * STORY_HEIGHT;
      const colliders = createFloorDeckColliders(
        floor,
        WORLD_TILE_SIZE,
        slabY - 0.06,
        slabY + 0.02,
      );
      expect(colliders.length).toBeLessThan(floor.stats.floorCount * 0.35);
      const floorIndex = floor.floor?.index ?? 0;
      const incoming = floor.floor?.stairs.find((stair) => stair.targetFloor < floorIndex);
      if (!incoming) continue;
      const flightCells = stairFlightFootprintCells(incoming.footprint);
      const incomingCells = new Set(flightCells.map((cell) => `${cell.x},${cell.y}`));
      for (let y = 0; y < floor.height; y += 1) {
        for (let x = 0; x < floor.width; x += 1) {
          if (!isFloorCell(floor, x, y) || incomingCells.has(`${x},${y}`)) continue;
          const point = gridToWorld(floor, { x, y }, WORLD_TILE_SIZE);
          expect(colliders.some((collider) => overlapsWorldCollider(point, 0.01, collider))).toBe(
            true,
          );
        }
      }
      for (const cell of flightCells) {
        const point = gridToWorld(floor, cell, WORLD_TILE_SIZE);
        expect(colliders.some((collider) => overlapsWorldCollider(point, 0.01, collider))).toBe(
          false,
        );
      }
      const landingCells = incoming.footprint.filter(
        (cell) => !incomingCells.has(`${cell.x},${cell.y}`),
      );
      expect(landingCells).toHaveLength(2);
      for (const cell of landingCells) {
        const point = gridToWorld(floor, cell, WORLD_TILE_SIZE);
        expect(colliders.some((collider) => overlapsWorldCollider(point, 0.01, collider))).toBe(
          true,
        );
      }
    }
  });

  test("heightfield stores each slab height but leaves incoming shaft mouths unsupported", () => {
    const stack = generateDungeonFloorSet("SMOKE-SUPPORT-HEIGHTFIELD", { roomTarget: 20 }, 4);
    for (const floor of stack.floors) {
      const support = createFloorSupportHeightfield(floor);
      const floorIndex = floor.floor?.index ?? 0;
      const incoming = floor.floor?.stairs.find((stair) => stair.targetFloor < floorIndex);
      const openCells = new Set(
        incoming
          ? stairFlightFootprintCells(incoming.footprint).map((cell) => `${cell.x},${cell.y}`)
          : [],
      );
      for (let y = 0; y < floor.height; y += 1) {
        for (let x = 0; x < floor.width; x += 1) {
          const expected =
            isFloorCell(floor, x, y) && !openCells.has(`${x},${y}`) ? floorIndex : null;
          expect(sampleFloorSupportHeightfield(support, { x, y })).toBe(expected);
        }
      }
    }
  });

  test("stair flight spans exactly between supported landing cells", () => {
    const stack = generateDungeonFloorSet("SMOKE-STAIR-LANDINGS", { roomTarget: 16 }, 2);
    const link = stack.shaftPlan.links[0]!;
    const upper = stack.floors[1]!;
    const anchor = gridToWorld(upper, link.anchor, WORLD_TILE_SIZE);
    const root = stairFlightRootPosition(anchor, link.yaw, WORLD_TILE_SIZE);
    const flight = buildStairFlight("up", createDungeonMaterials(), WORLD_TILE_SIZE);
    const treads = worldTreadColliders(flight.treadColliders, root.x, 0, root.z, link.yaw);
    const deck = createFloorDeckColliders(
      upper,
      WORLD_TILE_SIZE,
      STORY_HEIGHT - 0.06,
      STORY_HEIGHT + 0.02,
    );
    const upperLanding = link.footprint.at(-1)!;
    const upperLandingWorld = gridToWorld(upper, upperLanding, WORLD_TILE_SIZE);

    expect(deck.some((collider) => overlapsWorldCollider(upperLandingWorld, 0.01, collider))).toBe(
      true,
    );
    const top = treads.at(-1)!;
    const distanceToLanding = Math.hypot(
      upperLandingWorld.x - (top.minX + top.maxX) * 0.5,
      upperLandingWorld.z - (top.minZ + top.maxZ) * 0.5,
    );
    expect(distanceToLanding).toBeLessThan(WORLD_TILE_SIZE * 0.65);
    expect(top.maxY).toBeCloseTo(STORY_HEIGHT, 5);
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
    expect(activeFloorFromSupportY(STORY_HEIGHT * 0.4, 4)).toBe(0);
    expect(activeFloorFromSupportY(STORY_HEIGHT * 0.9, 4)).toBe(1);
    expect(activeFloorFromSupportY(STORY_HEIGHT + 0.05, 4)).toBe(1);
    expect(activeFloorFromSupportY(STORY_HEIGHT * 2.9, 4)).toBe(3);
    expect(activeFloorFromSupportY(STORY_HEIGHT * 3.05, 4)).toBe(3);
  });

  test("host rebinds floor without setDungeon teleport", () => {
    const main = readFileSync("src/main.ts", "utf8");
    const controller = readFileSync("src/player/FirstPersonController.ts", "utf8");
    const world = readFileSync("src/world/DungeonWorld.ts", "utf8");

    expect(controller).toContain("bindDungeon(dungeon: DungeonData)");
    expect(world).toContain("rebindActiveDungeon(dungeon: DungeonData)");
    expect(main).toContain("controller.bindDungeon(nextDungeon)");
    expect(main).toContain("world.rebindActiveDungeon(nextDungeon)");
    expect(main).not.toContain("FloorTransitionDirector");
    expect(main).not.toContain("planFloorTransition");
    // Height rebind path must not call setDungeon (teleport to spawn).
    const rebindStart = main.indexOf("Multi-slab: rebind the logical floor");
    const rebindEnd = main.indexOf("if (dungeon && player.cell)", rebindStart + 10);
    const rebindBlock = main.slice(rebindStart, rebindEnd);
    expect(rebindBlock).not.toContain("controller.setDungeon(");
    expect(rebindBlock).not.toContain("activateDungeon(");
    expect(rebindBlock).not.toContain("buildDungeon(");
    expect(rebindBlock).not.toContain("setSceneFadeOpaque(");
    expect(rebindBlock).toContain("Never call controller.setDungeon");
  });

  test("world tread colliders preserve absolute tops under yaw", () => {
    const materials = createDungeonMaterials();
    const flight = buildStairFlight("up", materials, WORLD_TILE_SIZE);
    const world = worldTreadColliders(flight.treadColliders, 12, STORY_HEIGHT, -8, Math.PI / 2);
    expect(world.at(-1)!.maxY).toBeCloseTo(STORY_HEIGHT + flight.treadColliders.at(-1)!.maxY!, 5);
  });
});
