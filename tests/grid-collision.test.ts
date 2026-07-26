import { describe, expect, test } from "bun:test";

import { FLOOR, WALL } from "../src/dungeon/generateDungeon";
import {
  gridToWorld,
  moveWithCollision,
  overlapsColliderHeight,
  overlapsWorldCollider,
  worldToGrid,
} from "../src/dungeon/gridCollision";

const TILE_SIZE = 2;

function makeDungeon(rows: number[][]) {
  return {
    width: rows[0]?.length ?? 0,
    height: rows.length,
    grid: rows.map((row) => Uint8Array.from(row)),
  };
}

describe("grid collision", () => {
  test("stops a large move at a generated wall", () => {
    const dungeon = makeDungeon([
      [WALL, WALL, WALL, WALL, WALL],
      [WALL, FLOOR, FLOOR, WALL, WALL],
      [WALL, WALL, WALL, WALL, WALL],
    ]);
    const start = gridToWorld(dungeon, { x: 1, y: 1 }, TILE_SIZE);
    const result = moveWithCollision(dungeon, start, { x: 8, z: 0 }, TILE_SIZE, 0.3);
    expect(result.blockedX).toBe(true);
    expect(worldToGrid(dungeon, result.position, TILE_SIZE)).toEqual({ x: 2, y: 1 });
  });

  test("settles against a visible wall instead of leaving a long-frame dead zone", () => {
    const dungeon = makeDungeon([[FLOOR, FLOOR, WALL]]);
    const start = gridToWorld(dungeon, { x: 1, y: 0 }, TILE_SIZE);
    const result = moveWithCollision(dungeon, start, { x: 2, z: 0 }, TILE_SIZE, 0.3);
    expect(result.blockedX).toBe(true);
    // Tile boundary is x=1.0; player radius is 0.3. A bisection settle stays
    // within a few millimetres of the expected x=0.7 contact instead of the
    // old 0.5m step-back gap after a slow frame.
    expect(result.position.x).toBeGreaterThan(0.68);
    expect(result.position.x).toBeLessThanOrEqual(0.7);
  });

  test("slides along an open side after a blocked axis", () => {
    const dungeon = makeDungeon([
      [WALL, WALL, WALL, WALL, WALL],
      [WALL, FLOOR, WALL, WALL, WALL],
      [WALL, FLOOR, FLOOR, FLOOR, WALL],
      [WALL, WALL, WALL, WALL, WALL],
    ]);
    const start = gridToWorld(dungeon, { x: 1, y: 1 }, TILE_SIZE);
    const result = moveWithCollision(dungeon, start, { x: 2, z: 2 }, TILE_SIZE, 0.3);
    expect(result.blockedX).toBe(true);
    expect(result.blockedZ).toBe(false);
    expect(worldToGrid(dungeon, result.position, TILE_SIZE)).toEqual({ x: 1, y: 2 });
  });

  test("blocks a floor cell occupied by a solid dungeon prop", () => {
    const dungeon = makeDungeon([[FLOOR, FLOOR, FLOOR]]);
    const start = gridToWorld(dungeon, { x: 0, y: 0 }, TILE_SIZE);
    const result = moveWithCollision(
      dungeon,
      start,
      { x: 4, z: 0 },
      TILE_SIZE,
      0.3,
      (cell) => cell.x === 1,
    );
    expect(result.blockedX).toBe(true);
    expect(worldToGrid(dungeon, result.position, TILE_SIZE)).toEqual({ x: 0, y: 0 });
  });

  test("uses the prop bounds so free space in the same cell stays walkable", () => {
    const collider = { minX: -0.25, maxX: 0.25, minZ: -0.25, maxZ: 0.25 };
    expect(overlapsWorldCollider({ x: 0.5, z: 0.5 }, 0.2, collider)).toBe(false);
    expect(overlapsWorldCollider({ x: 0.35, z: 0.1 }, 0.2, collider)).toBe(true);
    const dungeon = makeDungeon([[FLOOR, FLOOR, FLOOR]]);
    const start = gridToWorld(dungeon, { x: 0, y: 0 }, TILE_SIZE);
    const pass = moveWithCollision(
      dungeon,
      { x: start.x, z: 0.7 },
      { x: 4, z: 0 },
      TILE_SIZE,
      0.2,
      undefined,
      [collider],
    );
    expect(pass.blockedX).toBe(false);
  });

  test("lets a jumping capsule cross a low prop only after its feet clear the top", () => {
    const dungeon = makeDungeon([[FLOOR, FLOOR, FLOOR]]);
    const start = gridToWorld(dungeon, { x: 0, y: 0 }, TILE_SIZE);
    const lowProp = {
      minX: -0.25,
      maxX: 0.25,
      minY: 0,
      maxY: 0.62,
      minZ: -0.4,
      maxZ: 0.4,
    };
    const grounded = moveWithCollision(
      dungeon,
      start,
      { x: 4, z: 0 },
      TILE_SIZE,
      0.25,
      undefined,
      [lowProp],
      { minY: 0.055, maxY: 1.86 },
    );
    const airborne = moveWithCollision(
      dungeon,
      start,
      { x: 4, z: 0 },
      TILE_SIZE,
      0.25,
      undefined,
      [lowProp],
      { minY: 0.72, maxY: 2.53 },
    );
    expect(grounded.blockedX).toBe(true);
    expect(airborne.blockedX).toBe(false);
    expect(overlapsColliderHeight(lowProp, { minY: 0.72, maxY: 2.53 })).toBe(false);
  });

  test("keeps tall props solid throughout the normal jump arc", () => {
    const dungeon = makeDungeon([[FLOOR, FLOOR, FLOOR]]);
    const start = gridToWorld(dungeon, { x: 0, y: 0 }, TILE_SIZE);
    const tallProp = {
      minX: -0.25,
      maxX: 0.25,
      minY: 0,
      maxY: 1.45,
      minZ: -0.4,
      maxZ: 0.4,
    };
    const result = moveWithCollision(
      dungeon,
      start,
      { x: 4, z: 0 },
      TILE_SIZE,
      0.25,
      undefined,
      [tallProp],
      { minY: 0.96, maxY: 2.77 },
    );
    expect(result.blockedX).toBe(true);
  });
});
