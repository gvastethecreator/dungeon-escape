import { describe, expect, test } from "bun:test";
import { listBiomeIds } from "../src/systems/BiomeIdentity";
import { ENEMY_ARCHETYPES, getEnemyMotion } from "../src/world/EnemyArchetypes";
import {
  applyBiomeEnemyMods,
  BIOME_ENEMY_PROFILES,
  ENEMY_SPEED_SCALE,
  getEnemyBiomeProfile,
  listEnemyBiomeProfiles,
  resolveEnemyBehavior,
  resolveEnemyBiomeId,
} from "../src/world/EnemyBiomeMods";
import { ENEMY_ROSTER } from "../src/world/EnemySpriteAtlas";
import { generateDungeon } from "../src/dungeon/generateDungeon";
import { tickEnemySim, type EnemySimBody } from "../src/world/EnemySim";

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

describe("EnemyBiomeMods", () => {
  test("every biome has a full combat profile", () => {
    const profiles = listEnemyBiomeProfiles();
    expect(profiles.map((row) => row.id).sort()).toEqual([...listBiomeIds()].sort());
    for (const { id, profile } of profiles) {
      expect(profile.label.length).toBeGreaterThan(3);
      expect(BIOME_ENEMY_PROFILES[id]).toBe(profile);
      for (const key of [
        "speed",
        "detectionRange",
        "attackRange",
        "preferredRange",
        "damage",
        "attackCooldown",
      ] as const) {
        expect(profile[key]).toBeGreaterThan(0.5);
        expect(profile[key]).toBeLessThan(1.6);
      }
    }
  });

  test("resolves every kind under every biome without throwing", () => {
    for (const biome of listBiomeIds()) {
      for (const kind of ENEMY_ROSTER) {
        const resolved = applyBiomeEnemyMods(kind, biome, 0.5);
        expect(resolved.width).toBe(ENEMY_ARCHETYPES[kind].width);
        expect(resolved.height).toBe(ENEMY_ARCHETYPES[kind].height);
        expect(resolved.speed).toBeGreaterThan(0);
        expect(resolved.damage).toBeGreaterThan(0);
        expect(resolved.attackCooldown).toBeGreaterThan(0.2);
        expect(resolved.detectionRange).toBeGreaterThan(5);
      }
    }
  });

  test("frost is slower and more aware than molten", () => {
    const kind = "carrion" as const;
    const frost = applyBiomeEnemyMods(kind, "frost", 0.5);
    const molten = applyBiomeEnemyMods(kind, "molten", 0.5);
    expect(frost.speed).toBeLessThan(molten.speed);
    expect(frost.detectionRange).toBeGreaterThan(molten.detectionRange);
    expect(frost.attackCooldown).toBeGreaterThan(molten.attackCooldown);
    expect(molten.damage).toBeGreaterThan(frost.damage);
  });

  test("iron favors guard on heavy undead; backrooms makes goblins erratic", () => {
    expect(applyBiomeEnemyMods("husk", "iron", 0.5).behavior).toBe("guard");
    expect(applyBiomeEnemyMods("zombie-orc", "iron", 0.5).behavior).toBe("guard");
    expect(applyBiomeEnemyMods("goblin", "backrooms", 0.5).behavior).toBe("erratic");
    expect(applyBiomeEnemyMods("carrion", "backrooms", 0.5).behavior).toBe("erratic");
  });

  test("spectral kinds keep phase unless the profile names them", () => {
    const ghostBase = ENEMY_ARCHETYPES.ghost.behavior;
    expect(ghostBase).toBe("phase");
    expect(applyBiomeEnemyMods("ghost", "molten", 0.5).behavior).toBe("phase");
    expect(applyBiomeEnemyMods("ghost", "verdant", 0.5).behavior).toBe("phase");
    // Frost explicitly keeps shadow on phase for a cold stalker read.
    expect(applyBiomeEnemyMods("white-eyed-shadow", "frost", 0.5).behavior).toBe("phase");
    expect(applyBiomeEnemyMods("white-eyed-shadow", "backrooms", 0.5).behavior).toBe("erratic");
  });

  test("higher difficulty shortens cooldowns and raises damage and speed", () => {
    const easy = applyBiomeEnemyMods("goblin", "ash", 0.1);
    const hard = applyBiomeEnemyMods("goblin", "ash", 0.9);
    expect(hard.damage).toBeGreaterThan(easy.damage);
    expect(hard.speed).toBeGreaterThan(easy.speed);
    expect(hard.detectionRange).toBeGreaterThan(easy.detectionRange);
    expect(hard.attackCooldown).toBeLessThan(easy.attackCooldown);
  });

  test("ash at zero difficulty keeps catalog stats except the global speed scale", () => {
    for (const kind of ENEMY_ROSTER) {
      const resolved = applyBiomeEnemyMods(kind, "ash", 0);
      const base = ENEMY_ARCHETYPES[kind];
      expect(resolved.speed).toBeCloseTo(base.speed * ENEMY_SPEED_SCALE, 5);
      expect(resolved.damage).toBeCloseTo(base.damage, 5);
      expect(resolved.attackCooldown).toBeCloseTo(base.attackCooldown, 5);
      expect(resolved.detectionRange).toBeCloseTo(base.detectionRange, 5);
      expect(resolved.behavior).toBe(base.behavior);
    }
  });

  test("getEnemyMotion respects resolved behavior and detection", () => {
    const backroomsGoblin = applyBiomeEnemyMods("goblin", "backrooms", 0.5);
    expect(backroomsGoblin.behavior).toBe("erratic");
    // Far outside base detection but inside expanded backrooms awareness should still move.
    const ironHusk = applyBiomeEnemyMods("husk", "iron", 0.5);
    expect(ironHusk.behavior).toBe("guard");
    const guardMotion = getEnemyMotion("husk", ironHusk.preferredRange + 1.5, 1, 0, ironHusk);
    expect(guardMotion.forward).toBeGreaterThan(0);
    expect(guardMotion.strafe).toBe(0);

    const idleFar = getEnemyMotion(
      "goblin",
      backroomsGoblin.detectionRange + 2,
      1,
      0,
      backroomsGoblin,
    );
    expect(idleFar.speedMultiplier).toBe(0);
  });

  test("sim hits harder in molten than frost at the same difficulty", () => {
    const dungeon = generateDungeon("BIOME-HIT", { roomTarget: 10 });
    const player = { x: 0.35, y: 1.6, z: 0.15 };
    const frostEnemy = body("zombie-orc", 0, 0);
    const moltenEnemy = body("zombie-orc", 0, 0);
    const frost = tickEnemySim([frostEnemy], {
      delta: 0.016,
      elapsed: 1,
      player,
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
      moodId: "frost",
      difficulty: 0.5,
    });
    const molten = tickEnemySim([moltenEnemy], {
      delta: 0.016,
      elapsed: 1,
      player,
      dungeon,
      solidColliders: [],
      tileSize: 2.4,
      moodId: "molten",
      difficulty: 0.5,
    });
    expect(frost.damage).toBeGreaterThan(0);
    expect(molten.damage).toBeGreaterThan(frost.damage);
    expect(moltenEnemy.hitCooldown).toBeLessThan(frostEnemy.hitCooldown);
  });

  test("resolve helpers map unknown moods to ash", () => {
    expect(resolveEnemyBiomeId("not-a-biome")).toBe("ash");
    expect(getEnemyBiomeProfile(undefined).label).toBe(BIOME_ENEMY_PROFILES.ash.label);
    const base = ENEMY_ARCHETYPES.goblin.behavior;
    expect(resolveEnemyBehavior("goblin", BIOME_ENEMY_PROFILES.ash, base)).toBe(base);
  });
});
