import { describe, expect, test } from "bun:test";
import { generateDungeon } from "../src/dungeon/generateDungeon";
import { gridToWorld } from "../src/dungeon/gridCollision";
import {
  enemyContactVerticalRange,
  enemyPhaseVisibility,
  enemyStrikesPlayerVertically,
  impFlightOffset,
  PLAYER_COMBAT_EYE_HEIGHT,
  playerHurtVerticalRange,
  spiderPounceHeight,
  tickEnemySim,
  type EnemySimBody,
} from "../src/world/EnemySim";
import { ENEMY_ARCHETYPES, getEnemySpriteRenderMetrics } from "../src/world/EnemyArchetypes";
import { LUMINOUS_WARD_REPEL_RADIUS } from "../src/game/LuminousWard";

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
    const player = { x: 0.4, y: PLAYER_COMBAT_EYE_HEIGHT, z: 0.2 };
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

  test("standing player still takes contact damage from low-profile enemies", () => {
    const dungeon = generateDungeon("SIM-HIT-GROUND", { roomTarget: 10 });
    const spider = body("spider", 0.2, 0);
    const result = tickEnemySim([spider], {
      delta: 0.016,
      elapsed: 1,
      player: { x: 0, y: PLAYER_COMBAT_EYE_HEIGHT, z: 0 },
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
    });
    expect(result.damage).toBeGreaterThan(0);
    expect(result.attacker).toBe(spider);
  });

  test("jumping clears low-profile contact while tall enemies still hit", () => {
    const dungeon = generateDungeon("SIM-HIT-VAULT", { roomTarget: 10 });
    // Mid single-jump height (apex ~0.99 m with play jump stats).
    const jumpHeight = 0.72;
    const playerY = PLAYER_COMBAT_EYE_HEIGHT + jumpHeight;
    const spider = body("spider", 0.15, 0);
    const carrion = body("carrion", 0.15, 0);
    const ratling = body("ratling", 0.15, 0);
    const orc = body("zombie-orc", 0.15, 0);

    const vaulted = tickEnemySim([spider, carrion, ratling], {
      delta: 0.016,
      elapsed: 1,
      player: { x: 0, y: playerY, z: 0 },
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
    });
    expect(vaulted.damage).toBe(0);
    expect(vaulted.knockHits).toBe(0);
    expect(spider.hitCooldown).toBe(0);
    expect(carrion.hitCooldown).toBe(0);
    expect(ratling.hitCooldown).toBe(0);

    const tallHit = tickEnemySim([orc], {
      delta: 0.016,
      elapsed: 1,
      player: { x: 0, y: playerY, z: 0 },
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
    });
    expect(tallHit.damage).toBeGreaterThan(0);
    expect(tallHit.attacker).toBe(orc);
  });

  test("enemy contact height tracks low-profile bodies below a mid jump", () => {
    const spider = body("spider", 0, 0);
    const ratling = body("ratling", 0, 0);
    const orc = body("zombie-orc", 0, 0);
    const spiderBand = enemyContactVerticalRange(spider, ENEMY_ARCHETYPES.spider);
    const ratlingBand = enemyContactVerticalRange(ratling, ENEMY_ARCHETYPES.ratling);
    const orcBand = enemyContactVerticalRange(orc, ENEMY_ARCHETYPES["zombie-orc"]);
    const midJumpFeet = 0.7;
    const playerY = PLAYER_COMBAT_EYE_HEIGHT + midJumpFeet;
    const playerBand = playerHurtVerticalRange(playerY);

    expect(spiderBand.maxY).toBeLessThanOrEqual(0.7);
    expect(ratlingBand.maxY).toBeLessThanOrEqual(0.7);
    expect(playerBand.minY).toBeCloseTo(midJumpFeet, 5);
    expect(enemyStrikesPlayerVertically(playerY, spider, ENEMY_ARCHETYPES.spider)).toBe(false);
    expect(enemyStrikesPlayerVertically(playerY, ratling, ENEMY_ARCHETYPES.ratling)).toBe(false);
    expect(enemyStrikesPlayerVertically(playerY, orc, ENEMY_ARCHETYPES["zombie-orc"])).toBe(true);
    expect(orcBand.maxY).toBeGreaterThan(1.8);
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

  test("luminous ward makes enemies retreat and blocks contact damage", () => {
    const dungeon = generateDungeon("SIM-WARD", { roomTarget: 10 });
    const enemy = body("zombie-orc", 0.7, 0);
    const result = tickEnemySim([enemy], {
      delta: 0.016,
      elapsed: 1,
      player: { x: 0, y: 1.6, z: 0 },
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
      repelRadius: 8.25,
    });
    expect(result.damage).toBe(0);
    expect(enemy.position.x).toBeGreaterThan(0.7);
    expect(enemy.hitCooldown).toBe(0);

    const overlapping = body("ratling", 0, 0);
    tickEnemySim([overlapping], {
      delta: 0.016,
      elapsed: 1,
      player: { x: 0, y: 1.6, z: 0 },
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
      repelRadius: LUMINOUS_WARD_REPEL_RADIUS,
    });
    expect(Math.hypot(overlapping.position.x, overlapping.position.z)).toBeGreaterThan(0);
  });

  test("annihilation pulse flee speed exceeds the ward response", () => {
    const dungeon = generateDungeon("SIM-WARD", { roomTarget: 10 });
    const wardEnemy = body("zombie-orc", 0.7, 0);
    const pulseEnemy = body("zombie-orc", 0.7, 0);
    const player = { x: 0, y: 1.6, z: 0 };

    tickEnemySim([wardEnemy], {
      delta: 0.016,
      elapsed: 1,
      player,
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
      repelRadius: 8.25,
    });
    tickEnemySim([pulseEnemy], {
      delta: 0.016,
      elapsed: 1,
      player,
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
      repelRadius: 11.5,
      repelSpeedMultiplier: 1.85,
    });

    expect(pulseEnemy.position.x - 0.7).toBeGreaterThan(wardEnemy.position.x - 0.7);
  });

  test("skips defeated instanced seats in later simulation ticks", () => {
    const dungeon = generateDungeon("SIM-PULSE-DEFEATED", { roomTarget: 10 });
    const enemy = body("goblin", 0, 0);
    enemy.defeated = true;
    enemy.scaleX = 0;
    enemy.scaleY = 0;
    const result = tickEnemySim([enemy], {
      delta: 0.016,
      elapsed: 1,
      player: { x: 0, y: 1.6, z: 0 },
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
      repelRadius: 11.5,
      repelSpeedMultiplier: 1.85,
    });

    expect(result.damage).toBe(0);
    expect(enemy.moving).toBe(false);
  });

  test("uses the selected biome alpha bounds for billboard scale", () => {
    const ashGhost = getEnemySpriteRenderMetrics("ghost", "ash");
    const frostGhost = getEnemySpriteRenderMetrics("ghost", "frost");
    const ashGoblin = getEnemySpriteRenderMetrics("goblin", "ash");
    const verdantGoblin = getEnemySpriteRenderMetrics("goblin", "verdant");
    expect(frostGhost.planeHeight).toBeLessThan(ashGhost.planeHeight);
    // Verdant's goblin crop is narrower. The billboard grows to keep the
    // visible body width stable instead of making that biome look undersized.
    expect(verdantGoblin.planeWidth).toBeGreaterThan(ashGoblin.planeWidth);
    expect(getEnemySpriteRenderMetrics("ghost", "unknown-biome")).toEqual(ashGhost);
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
