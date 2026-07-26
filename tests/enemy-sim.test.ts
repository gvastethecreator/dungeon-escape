import { describe, expect, test } from "bun:test";
import { generateDungeon } from "../src/dungeon/generateDungeon";
import { gridToWorld } from "../src/dungeon/gridCollision";
import {
  enemyPhaseVisibility,
  impFlightOffset,
  spiderPounceHeight,
  tickEnemySim,
  type EnemySimBody,
} from "../src/world/EnemySim";
import { ENEMY_ARCHETYPES } from "../src/world/EnemyArchetypes";

function body(kind: EnemySimBody["kind"], x: number, z: number): EnemySimBody {
  const arch = ENEMY_ARCHETYPES[kind];
  return {
    kind,
    position: { x, y: arch.height / 2, z },
    hitCooldown: 0,
    attackPulse: 0,
    baseY: arch.height / 2,
    baseScale: { x: arch.width, y: arch.height },
    phase: 0,
    scaleX: arch.width,
    scaleY: arch.height,
    roll: 0,
    phaseEpoch: -1,
    phaseVisibility: 1,
    moving: false,
  };
}

describe("EnemySim", () => {
  test("deals damage and sets cooldown when player is in attack range", () => {
    const dungeon = generateDungeon("SIM-HIT", { roomTarget: 10 });
    const enemy = body("zombie-orc", 0, 0);
    const player = { x: 0.4, y: 1.6, z: 0.2 };
    const first = tickEnemySim([enemy], {
      delta: 0.016,
      elapsed: 1,
      player,
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
    });
    expect(first.damage).toBeGreaterThan(0);
    expect(enemy.hitCooldown).toBeGreaterThan(0);
    expect(first.knockHits).toBe(1);
    expect(first.attacker).toBe(enemy);

    const second = tickEnemySim([enemy], {
      delta: 0.016,
      elapsed: 1.1,
      player,
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
    });
    expect(second.damage).toBe(0);
  });

  test("reports nearest threat distance", () => {
    const dungeon = generateDungeon("SIM-DIST", { roomTarget: 10 });
    const far = body("bone-slime", 10, 0);
    const near = body("ratling", 2, 0);
    const result = tickEnemySim([far, near], {
      delta: 0.016,
      elapsed: 0,
      player: { x: 0, y: 1.6, z: 0 },
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
    });
    expect(result.nearestThreat).toBeCloseTo(2, 5);
  });

  test("spectral enemies fade out, relocate sideways and return closer", () => {
    const dungeon = generateDungeon("SIM-PHASE", { roomTarget: 10 });
    const start = gridToWorld(dungeon, dungeon.spawn, 2.4);
    const enemy = body("ghost", start.x, start.z);
    const targetCell = dungeon.rooms.find((room) => room.role === "room")?.center ?? dungeon.exit;
    const playerPoint = gridToWorld(dungeon, targetCell, 2.4);
    const player = { x: playerPoint.x, y: 1.6, z: playerPoint.z };
    const startDistance = Math.hypot(enemy.position.x - player.x, enemy.position.z - player.z);
    const startX = enemy.position.x;
    const startZ = enemy.position.z;

    tickEnemySim([enemy], {
      delta: 0,
      elapsed: 2.9,
      player,
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
    });

    const endDistance = Math.hypot(enemy.position.x - player.x, enemy.position.z - player.z);
    expect(enemy.phaseVisibility).toBe(0);
    expect(enemy.scaleX).toBeGreaterThan(enemy.baseScale.x * 0.9);
    expect(enemy.scaleY).toBeGreaterThan(enemy.baseScale.y * 0.9);
    expect(enemy.phaseEpoch).toBeGreaterThanOrEqual(0);
    expect(Math.hypot(enemy.position.x - startX, enemy.position.z - startZ)).toBeGreaterThan(0.2);
    expect(endDistance).toBeLessThan(startDistance);
    expect(enemyPhaseVisibility("ghost", 4.5, 0)).toBeGreaterThan(0.75);
  });

  test("phased-out enemies cannot damage the player", () => {
    const dungeon = generateDungeon("SIM-PHASE-HIT", { roomTarget: 10 });
    const point = gridToWorld(dungeon, dungeon.spawn, 2.4);
    const enemy = body("white-eyed-shadow", point.x, point.z);
    const result = tickEnemySim([enemy], {
      delta: 0.016,
      elapsed: 2.35,
      player: { x: point.x + 0.3, y: 1.6, z: point.z },
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
    });
    expect(enemy.phaseVisibility).toBe(0);
    expect(result.damage).toBe(0);
  });

  test("spider pounce is brief, small and aimed during pursuit", () => {
    const samples = Array.from({ length: 120 }, (_, index) =>
      spiderPounceHeight(3.2, index * 0.025, 0.7),
    );
    expect(Math.max(...samples)).toBeGreaterThan(0.24);
    expect(Math.max(...samples)).toBeLessThanOrEqual(0.3);
    expect(samples.filter((value) => value > 0.08).length).toBeLessThan(samples.length * 0.35);
    expect(spiderPounceHeight(0.2, 1, 0)).toBe(0);
  });

  test("imp flight stays below its ceiling base and cycles through a descent", () => {
    const samples = Array.from({ length: 160 }, (_, index) =>
      impFlightOffset(4, index * 0.04, 0.3),
    );
    expect(Math.max(...samples)).toBeLessThan(0);
    expect(Math.min(...samples)).toBeLessThan(-0.8);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.65);
  });
});
