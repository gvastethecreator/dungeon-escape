import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import type { DungeonData, DungeonForgeMetadata } from "../src/dungeon/types";
import { SceneTextureRegistry } from "../src/systems/SceneTextureRegistry";
import {
  collectLiquidSections,
  countLiquidBoundaryEdges,
  createLiquidSectionKit,
  disposeLiquidSectionKit,
  LIQUID_SURFACE_Y,
} from "../src/world/LiquidSectionKit";
import { createDungeonMaterials, disposeDungeonMaterials } from "../src/world/MaterialLibrary";

function dungeonWithLiquids(): DungeonData {
  const dungeon = generateDungeon("WATER-LEVEL", { roomTarget: 10 });
  const length = dungeon.width * dungeon.height;
  const forge: DungeonForgeMetadata = {
    name: "Water level test",
    themeKey: "sunken",
    roomTypes: {},
    source: "dungeon-forge",
    seed: 1,
    decorDensity: 0.5,
    maxBfs: 1,
    maxDepth: 1,
    roomIds: new Int16Array(length),
    corridors: new Uint8Array(length),
    doorways: new Uint8Array(length),
    bfs: new Int32Array(length),
    pools: new Uint8Array(length),
    lakeMask: new Uint8Array(length),
    rooms: [],
    props: [],
    spawns: [],
    torches: [],
    arches: [],
  };
  const pool = dungeon.spawn;
  forge.pools[pool.y * dungeon.width + pool.x] = 1;
  const lake = { x: pool.x + 1, y: pool.y };
  if (lake.x < dungeon.width) forge.lakeMask[lake.y * dungeon.width + lake.x] = 1;
  return { ...dungeon, forge };
}

describe("connected liquid sections", () => {
  test("keeps adjacent water cells in one authored surface", () => {
    const width = 6;
    const height = 4;
    const mask = new Uint8Array(width * height);
    const at = (x: number, y: number) => y * width + x;
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [4, 2],
    ] as const)
      mask[at(x, y)] = 1;

    const sections = collectLiquidSections(mask, width, height);
    expect(sections.map((section) => section.cells.length)).toEqual([3, 1]);
    expect(countLiquidBoundaryEdges(sections[0]!, mask, width, height)).toBe(8);
    expect(countLiquidBoundaryEdges(sections[1]!, mask, width, height)).toBe(4);
  });

  test("pool and lake surfaces sit at floor height, not raised platforms", () => {
    // Floor top is y=0 (box height 0.1 centered at -0.05). Liquid must match.
    expect(LIQUID_SURFACE_Y).toBeGreaterThanOrEqual(0);
    expect(LIQUID_SURFACE_Y).toBeLessThan(0.02);

    const dungeon = dungeonWithLiquids();
    const materials = createDungeonMaterials({ compact: true });
    const registry = new SceneTextureRegistry(true);
    const kit = createLiquidSectionKit(dungeon, materials, 2.4, registry);
    expect(kit).not.toBeNull();
    expect(kit!.surfaces.length).toBeGreaterThanOrEqual(1);
    for (const surface of kit!.surfaces) {
      expect(surface.mesh.position.y).toBe(LIQUID_SURFACE_Y);
      const positions = surface.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i += 1) {
        expect(positions.getY(i)).toBe(0);
      }
    }
    expect(registry.diagnostics().registered).toBe(
      new Set(kit!.surfaces.map((surface) => surface.material.map)).size,
    );
    if (kit) disposeLiquidSectionKit(kit);
    expect(registry.diagnostics().registered).toBe(0);
    disposeDungeonMaterials(materials);
  });
});
