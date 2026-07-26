import { describe, expect, test } from "bun:test";

import {
  ENEMY_ARCHETYPES,
  enemyGroundY,
  getEnemyMotion,
  isHumanoidEnemy,
  isLowProfileEnemy,
} from "../src/world/EnemyArchetypes";
import {
  ENEMY_ANIMATIONS,
  ENEMY_ROSTER,
  enemyAnimationFrameIndex,
} from "../src/world/EnemySpriteAtlas";

describe("enemy roster v5", () => {
  test("ships the complete front-facing roster with four-frame animation rows", () => {
    expect(Object.keys(ENEMY_ARCHETYPES)).toEqual([...ENEMY_ROSTER]);
    for (const kind of ENEMY_ROSTER) {
      const animation = ENEMY_ANIMATIONS[kind];
      expect(animation.src).toContain("iron-ash-enemies-v5.png");
      expect(animation.frames).toHaveLength(4);
      expect(animation.fps).toBe(8);
      expect(animation.loop).toBe(true);
      expect(ENEMY_ARCHETYPES[kind]).toBeDefined();
    }
  });

  test("atlas png ships with the app", async () => {
    const file = Bun.file(
      new URL("../public/assets/sprites/enemies-v5/iron-ash-enemies-v5.png", import.meta.url),
    );
    expect(await file.exists()).toBe(true);
    expect(file.size).toBeGreaterThan(1_000_000);
  });

  test("goblin dash_halt sprints then fully stops", () => {
    let sawHalt = false;
    let sawDash = false;
    for (let t = 0; t < 8; t += 0.05) {
      const motion = getEnemyMotion("goblin", 4, t, 0);
      if (motion.speedMultiplier === 0 && motion.forward === 0) sawHalt = true;
      if (motion.speedMultiplier > 1.4 && motion.forward > 0) sawDash = true;
    }
    expect(sawHalt).toBe(true);
    expect(sawDash).toBe(true);
  });

  test("spider skitter produces varied, restrained lateral motion", () => {
    const samples = Array.from({ length: 24 }, (_, index) =>
      getEnemyMotion("spider", 3.5, index * 0.15, 1.1),
    );
    const strafes = samples.map((sample) => sample.strafe);
    expect(new Set(strafes.map((value) => Math.round(value * 100))).size).toBeGreaterThan(4);
    expect(Math.max(...strafes.map(Math.abs))).toBeLessThanOrEqual(0.22);
  });

  test("stationary enemies hold the first idle frame", () => {
    expect(enemyAnimationFrameIndex("goblin", 9.9, 0.2, false)).toBe(0);
    expect(enemyAnimationFrameIndex("goblin", 0.2, 0, true)).toBeGreaterThan(0);
  });

  test("ghost phase still pauses but mostly closes distance", () => {
    let sawSlow = false;
    let sawApproach = false;
    for (let t = 0; t < 20; t += 0.1) {
      const motion = getEnemyMotion("ghost", 5, t, 0);
      if (motion.speedMultiplier < 0.4) sawSlow = true;
      if (motion.forward > 0.5) sawApproach = true;
    }
    expect(sawSlow).toBe(true);
    expect(sawApproach).toBe(true);
  });

  test("white-eyed shadow changes direction in an irregular humanoid stalk", () => {
    const samples = Array.from({ length: 32 }, (_, index) =>
      getEnemyMotion("white-eyed-shadow", 4, index * 0.12, 0.6),
    );
    const strafes = samples.map((sample) => sample.strafe);
    const speeds = samples.map((sample) => sample.speedMultiplier);
    expect(new Set(strafes.map((value) => Math.round(value * 100))).size).toBeGreaterThan(10);
    expect(Math.max(...speeds)).toBeGreaterThan(1);
    expect(Math.min(...speeds)).toBeLessThan(0.6);
  });

  test("humanoids, creatures, and spectral enemies retain separate body profiles", () => {
    expect(ENEMY_ROSTER.filter(isHumanoidEnemy)).toEqual([
      "goblin",
      "husk",
      "imp",
      "zombie-orc",
      "white-eyed-shadow",
    ]);
    expect(ENEMY_ROSTER.filter(isLowProfileEnemy)).toEqual([
      "carrion",
      "ratling",
      "spider",
      "bone-slime",
      "carrion-stalker",
    ]);
    expect(ENEMY_ARCHETYPES.ghost.silhouette).toBe("spectral");
    expect(ENEMY_ARCHETYPES["white-eyed-shadow"].silhouette).toBe("humanoid");
    expect(ENEMY_ARCHETYPES.imp.hoverOffset).toBeGreaterThan(0.2);
    expect(ENEMY_ARCHETYPES["white-eyed-shadow"].hoverOffset).toBe(0);
  });

  test("silhouettes fit the room scale and hover only when intended", () => {
    for (const kind of ENEMY_ROSTER) {
      const archetype = ENEMY_ARCHETYPES[kind];
      expect(archetype.detectionRange).toBeGreaterThanOrEqual(14);
      expect(archetype.speed).toBeGreaterThanOrEqual(0.7);
      expect(archetype.width / archetype.height).toBeGreaterThan(0.55);
      const base = archetype.height / 2 + 0.02;
      expect(enemyGroundY(kind)).toBeCloseTo(base + archetype.hoverOffset, 5);
    }
  });
});
