import { describe, expect, test } from "bun:test";

import { FLOOR, WALL } from "../src/dungeon/generateDungeon";
import {
  canOccupy,
  feetClearColliderTop,
  gridToWorld,
  groupBySpatialChunk,
  moveWithCollision,
  overlapsColliderHeight,
  overlapsWorldCollider,
  spatialChunkKey,
  spatialChunkKeysNearCells,
  WorldColliderSpatialIndex,
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
  test("spatial buckets preserve full-list occupancy and swept movement", () => {
    const dungeon = makeDungeon(
      Array.from({ length: 31 }, () => Array.from({ length: 31 }, () => FLOOR)),
    );
    const colliders = Array.from({ length: 225 }, (_, index) => {
      const x = (index % 15) * 2 - 14;
      const z = Math.floor(index / 15) * 2 - 14;
      return {
        minX: x - 0.32,
        maxX: x + 0.32,
        minY: 0,
        maxY: index % 3 === 0 ? 0.7 : 1.5,
        minZ: z - 0.32,
        maxZ: z + 0.32,
      };
    });
    const index = new WorldColliderSpatialIndex(colliders, 4);
    const nearby: typeof colliders = [];
    let largestQuery = 0;

    for (let z = -13; z <= 13; z += 1.3) {
      for (let x = -13; x <= 13; x += 1.3) {
        const position = { x, z };
        index.queryAroundInto(position, 0.28, nearby);
        largestQuery = Math.max(largestQuery, nearby.length);
        for (const verticalRange of [
          { minY: 0.08, maxY: 1.86 },
          { minY: 0.8, maxY: 2.6 },
        ]) {
          expect(
            canOccupy(dungeon, position, TILE_SIZE, 0.28, undefined, nearby, verticalRange),
          ).toBe(
            canOccupy(dungeon, position, TILE_SIZE, 0.28, undefined, colliders, verticalRange),
          );
        }
      }
    }
    expect(largestQuery).toBeLessThan(8);

    const start = { x: -3, z: -3 };
    const delta = { x: 6.4, z: 5.7 };
    index.querySweepInto(start, delta, 0.28, nearby);
    expect(moveWithCollision(dungeon, start, delta, TILE_SIZE, 0.28, undefined, nearby)).toEqual(
      moveWithCollision(dungeon, start, delta, TILE_SIZE, 0.28, undefined, colliders),
    );
  });

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
      { minY: 0.08, maxY: 1.86 },
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
    expect(feetClearColliderTop(lowProp, 0.72)).toBe(true);
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

  test("feetClearColliderTop only vaults finite-height props once soles pass the top", () => {
    const crate = { minX: -0.4, maxX: 0.4, minY: 0, maxY: 0.78, minZ: -0.4, maxZ: 0.4 };
    const wall = { minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4 };
    expect(feetClearColliderTop(crate, 0.7)).toBe(false);
    expect(feetClearColliderTop(crate, 0.74)).toBe(true);
    expect(feetClearColliderTop(crate, 1.1)).toBe(true);
    // Full-height blockers never become vaultable mid-jump.
    expect(feetClearColliderTop(wall, 10)).toBe(false);
  });

  test("a vaulted low prop no longer blocks after feet cleared its top", () => {
    const dungeon = makeDungeon([[FLOOR, FLOOR, FLOOR]]);
    const start = gridToWorld(dungeon, { x: 0, y: 0 }, TILE_SIZE);
    const crate = {
      minX: -0.4,
      maxX: 0.4,
      minY: 0,
      maxY: 0.78,
      minZ: -0.5,
      maxZ: 0.5,
    };
    // Landing height (feet back near floor) would re-block without vault ignore.
    const stuckIfSolid = moveWithCollision(
      dungeon,
      start,
      { x: 4, z: 0 },
      TILE_SIZE,
      0.28,
      undefined,
      [crate],
      { minY: 0.08, maxY: 1.8 },
    );
    expect(stuckIfSolid.blockedX).toBe(true);
    // After vault, the prop is filtered out (empty collider list).
    const afterVault = moveWithCollision(
      dungeon,
      start,
      { x: 4, z: 0 },
      TILE_SIZE,
      0.28,
      undefined,
      [],
      { minY: 0.08, maxY: 1.8 },
    );
    expect(afterVault.blockedX).toBe(false);
    expect(worldToGrid(dungeon, afterVault.position, TILE_SIZE).x).toBeGreaterThan(0);
  });

  test("controller keeps vaulted props ignored until free of their footprint", async () => {
    const source = await Bun.file(
      new URL("../src/player/FirstPersonController.ts", import.meta.url),
    ).text();
    expect(source).toContain("vaultedColliderIds");
    expect(source).toContain("updateVaultedColliders");
    expect(source).toContain("feetClearColliderTop");
    expect(source).toContain("rebuildActiveColliders");
  });

  test("spatial chunk keys group cells on a fixed tile grid", () => {
    expect(spatialChunkKey({ x: 0, y: 0 }, 16)).toBe("0,0");
    expect(spatialChunkKey({ x: 15, y: 15 }, 16)).toBe("0,0");
    expect(spatialChunkKey({ x: 16, y: 0 }, 16)).toBe("1,0");
    expect(spatialChunkKey({ x: 31, y: 32 }, 16)).toBe("1,2");
    const grouped = groupBySpatialChunk(
      [
        { cell: { x: 1, y: 1 }, id: "a" },
        { cell: { x: 17, y: 1 }, id: "b" },
        { cell: { x: 18, y: 2 }, id: "c" },
      ],
      (entry) => entry.cell,
      16,
    );
    expect([...grouped.keys()].sort()).toEqual(["0,0", "1,0"]);
    expect(
      grouped
        .get("1,0")
        ?.map((entry) => entry.id)
        .sort(),
    ).toEqual(["b", "c"]);
    const near = spatialChunkKeysNearCells([{ x: 16, y: 16 }], 16, 1);
    expect(near.has("1,1")).toBe(true);
    expect(near.has("0,0")).toBe(true);
    expect(near.has("2,2")).toBe(true);
    expect(near.has("3,1")).toBe(false);
  });
});
