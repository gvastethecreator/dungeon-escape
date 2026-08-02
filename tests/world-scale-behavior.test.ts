import { describe, expect, test } from "bun:test";

import {
  ENEMY_ARCHETYPES,
  enemyGroundY,
  getEnemyMotion,
  getEnemySpriteRenderMetrics,
} from "../src/world/EnemyArchetypes";
import { selectDistributedTorchIndices } from "../src/world/TorchDistribution";
import { computeTorchLod } from "../src/world/TorchLod";
import { FORGE_CORRIDOR_WIDTHS, roomBandMeters } from "../src/forge/layoutTuning";

describe("world scale and behavior contracts", () => {
  test("enemy silhouettes stay grounded and within the room scale", () => {
    const hoverKinds = new Set(["ghost", "imp"]);
    for (const [kind, archetype] of Object.entries(ENEMY_ARCHETYPES)) {
      expect(archetype.height).toBeGreaterThanOrEqual(0.7);
      expect(archetype.height).toBeLessThan(2.8);
      expect(archetype.width).toBeLessThan(1.9);
      const enemyKind = kind as keyof typeof ENEMY_ARCHETYPES;
      const sprite = getEnemySpriteRenderMetrics(enemyKind);
      const groundBias =
        enemyGroundY(enemyKind) -
        (sprite.planeHeight / 2 - sprite.bottomPaddingRatio * sprite.planeHeight);
      if (hoverKinds.has(kind)) {
        expect(groundBias).toBeGreaterThan(0.02);
      } else {
        expect(groundBias).toBeCloseTo(0.02);
      }
    }
  });

  test("humanoids read at adult scale while carrion stays low and broad", () => {
    expect(ENEMY_ARCHETYPES.husk.height).toBeGreaterThanOrEqual(1.9);
    expect(ENEMY_ARCHETYPES["zombie-orc"].height).toBeGreaterThan(ENEMY_ARCHETYPES.husk.height);
    expect(ENEMY_ARCHETYPES.carrion.height).toBeLessThan(1.1);
    expect(ENEMY_ARCHETYPES.carrion.width).toBeGreaterThan(ENEMY_ARCHETYPES.carrion.height);
    expect(ENEMY_ARCHETYPES["carrion-stalker"].height).toBeLessThan(1.4);
    expect(ENEMY_ARCHETYPES["carrion-stalker"].width).toBeGreaterThan(
      ENEMY_ARCHETYPES["carrion-stalker"].height,
    );
  });

  test("torch LOD fades light before hiding distant geometry", () => {
    expect(computeTorchLod(6)).toEqual({
      rootVisible: true,
      flameVisible: true,
      haloVisible: true,
      lightFactor: 1,
    });
    expect(computeTorchLod(14).lightFactor).toBe(1);
    expect(computeTorchLod(18).lightFactor).toBeGreaterThan(0);
    expect(computeTorchLod(18).lightFactor).toBeLessThan(1);
    expect(computeTorchLod(20).lightFactor).toBe(0);
    expect(computeTorchLod(18).haloVisible).toBe(false);
    expect(computeTorchLod(30)).toEqual({
      rootVisible: true,
      flameVisible: false,
      haloVisible: false,
      lightFactor: 0,
    });
    // Geometry stays longer than the light, but ends inside fog range so an
    // unseen sconce cannot consume the render budget.
    expect(computeTorchLod(35).rootVisible).toBe(true);
    expect(computeTorchLod(36).rootVisible).toBe(false);
  });

  test("enemy families produce distinct movement decisions", () => {
    const motions = Object.keys(ENEMY_ARCHETYPES).map((kind) =>
      getEnemyMotion(kind as keyof typeof ENEMY_ARCHETYPES, 4, 1.7, 0.6),
    );
    expect(
      new Set(
        motions.map(
          (motion) =>
            `${motion.forward.toFixed(2)}:${motion.strafe.toFixed(2)}:${motion.speedMultiplier.toFixed(2)}`,
        ),
      ).size,
    ).toBeGreaterThanOrEqual(5);
  });

  test("lit torches cover entrance, exit and distant zones", () => {
    const torches = [0, 2, 4, 8, 12, 16].map((x) => ({ x, y: x % 4, dx: 1, dy: 0 }));
    const chosen = selectDistributedTorchIndices(torches, 4, { x: 0, y: 0 }, { x: 16, y: 0 });
    expect(chosen.has(0)).toBe(true);
    expect(chosen.has(5)).toBe(true);
    expect(chosen.size).toBe(4);
    expect([...chosen].some((index) => torches[index]!.x >= 8 && torches[index]!.x <= 12)).toBe(
      true,
    );
  });

  test("lit torch budget spreads across the map instead of clustering at spawn", () => {
    const torches = [0, 1, 2, 3, 10, 20, 30].map((x) => ({ x, y: 0, dx: 1, dy: 0 }));
    const chosen = selectDistributedTorchIndices(torches, 4, { x: 0, y: 0 }, { x: 30, y: 0 });
    const nearSpawn = [...chosen].filter((index) => torches[index]!.x <= 3);
    // One entrance anchor only; remaining budget goes farthest-point.
    expect(nearSpawn.length).toBe(1);
    expect(chosen.has(6)).toBe(true); // exit at x=30
    expect([...chosen].some((index) => torches[index]!.x >= 10 && torches[index]!.x < 30)).toBe(
      true,
    );
  });

  test("room-center anchors pull lit coverage toward mid-map zones without breaking anchors", () => {
    // 9 torches in a 3x3 spread; a big budget lets us see the room-center seed
    // land one torch near the map center (cell ~8,8).
    const torches: { x: number; y: number; dx: number; dy: number }[] = [];
    for (let y = 0; y < 3; y += 1)
      for (let x = 0; x < 3; x += 1) torches.push({ x: x * 8, y: y * 8, dx: 1, dy: 0 });
    const chosen = selectDistributedTorchIndices(torches, 6, { x: 0, y: 0 }, { x: 16, y: 16 }, [
      { x: 8, y: 8 },
    ]);
    // Entrance + exit anchors still present (they are the corner torches).
    expect(chosen.has(0)).toBe(true);
    expect(chosen.size).toBe(6);
    // At least one chosen torch sits near the center cell (8,8) — proves the
    // room-center seed improved mid-map coverage beyond the old anchor-only fill.
    const nearCenter = [...chosen].some((index) => {
      const t = torches[index]!;
      return Math.abs(t.x - 8) <= 0.01 && Math.abs(t.y - 8) <= 0.01;
    });
    expect(nearCenter).toBe(true);
  });

  test("Forge room and corridor bands fit the first-person meter scale", () => {
    expect(roomBandMeters("small", 2.4)).toEqual({ min: 12, max: 16.8 });
    expect(roomBandMeters("medium", 2.4)).toEqual({ min: 16.8, max: 24 });
    expect(roomBandMeters("large", 2.4)).toEqual({ min: 24, max: 31.2 });
    expect(FORGE_CORRIDOR_WIDTHS).toEqual({ branch: 1, standard: 1, critical: 2 });
  });
});
