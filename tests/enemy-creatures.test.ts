import { describe, expect, test } from "bun:test";

import {
  ENEMY_ARCHETYPES,
  ENEMY_SPRITE_METRICS,
  enemyGroundY,
  getEnemyMotion,
  getEnemySpriteRenderMetrics,
  getEnemyVisualBodySize,
  isHumanoidEnemy,
  isLowProfileEnemy,
} from "../src/world/EnemyArchetypes";
import {
  ENEMY_ANIMATIONS,
  ENEMY_ROSTER,
  enemyAnimationFrameIndex,
} from "../src/world/EnemySpriteAtlas";
import { hasLocalSourceAssets } from "./local-source-assets";

describe("enemy roster v8", () => {
  test("ships the complete front-facing roster with four-frame animation rows", () => {
    expect(Object.keys(ENEMY_ARCHETYPES)).toEqual([...ENEMY_ROSTER]);
    for (const kind of ENEMY_ROSTER) {
      const animation = ENEMY_ANIMATIONS[kind];
      expect(animation.src).toMatch(/enemies-v8\/(iron-ash-enemies-v8|biomes\/.+-enemies)\.webp$/);
      expect(animation.frames).toHaveLength(4);
      expect(animation.fps).toBe(8);
      expect(animation.loop).toBe(true);
      expect(ENEMY_ARCHETYPES[kind]).toBeDefined();
    }
  });

  test("optimized atlas WebP ships with the app", async () => {
    const file = Bun.file(
      new URL("../public/assets/sprites/enemies-v8/iron-ash-enemies-v8.webp", import.meta.url),
    );
    expect(await file.exists()).toBe(true);
    expect(file.size).toBeGreaterThan(500_000);
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
      const sprite = getEnemySpriteRenderMetrics(kind);
      const base = sprite.planeHeight / 2 - sprite.bottomPaddingRatio * sprite.planeHeight + 0.02;
      expect(enemyGroundY(kind)).toBeCloseTo(base + archetype.hoverOffset, 5);
    }
  });

  test("legacy alpha bounds remain the fallback for an unknown biome", () => {
    for (const kind of ENEMY_ROSTER) {
      const body = ENEMY_ARCHETYPES[kind];
      const alpha = ENEMY_SPRITE_METRICS[kind];
      const render = getEnemySpriteRenderMetrics(kind, "unknown-biome");
      expect(render.planeWidth).toBeCloseTo(render.planeHeight, 5);
      expect(render.planeHeight * (alpha.opaqueHeight / alpha.frameSize)).toBeCloseTo(
        body.height,
        5,
      );
    }
  });

  test.skipIf(!hasLocalSourceAssets("enemies", "biomes-v2", "runtime-size-catalog.json"))(
    "locks all 121 biome bodies to their approved base sprites and idle frames",
    async () => {
      const catalog = (await Bun.file(
        new URL("../assets-source/enemies/biomes-v2/runtime-size-catalog.json", import.meta.url),
      ).json()) as {
        counts: { entries: number };
        entries: Array<{
          biome: string;
          enemy: (typeof ENEMY_ROSTER)[number];
          body_size_meters: { width: number; height: number };
          base_source: { foreground_bounds: [number, number, number, number] };
          runtime_idle: { cell: number; opaque_width: number; opaque_height: number };
        }>;
      };

      expect(catalog.counts.entries).toBe(121);
      expect(new Set(catalog.entries.map((entry) => `${entry.biome}/${entry.enemy}`)).size).toBe(
        121,
      );
      for (const entry of catalog.entries) {
        const body = getEnemyVisualBodySize(entry.enemy, entry.biome);
        const render = getEnemySpriteRenderMetrics(entry.enemy, entry.biome);
        const [left, top, right, bottom] = entry.base_source.foreground_bounds;
        const sourceAspect = (right - left) / (bottom - top);
        expect(body).toEqual(entry.body_size_meters);
        expect(body.width).toBeCloseTo(body.height * sourceAspect, 3);
        expect(render.planeWidth).toBeCloseTo(render.planeHeight, 5);
        expect(
          render.planeHeight * (entry.runtime_idle.opaque_height / entry.runtime_idle.cell),
        ).toBeCloseTo(body.height, 5);
      }
    },
  );

  test("corrects the reported goblin, ghost, shadow, and carrion proportions", () => {
    expect(ENEMY_ARCHETYPES.goblin.height).toBeLessThanOrEqual(1.55);
    expect(ENEMY_ARCHETYPES.goblin.width).toBeLessThan(1);
    expect(getEnemySpriteRenderMetrics("ghost").planeWidth).toBeGreaterThan(1.8);
    expect(getEnemySpriteRenderMetrics("white-eyed-shadow").planeWidth).toBeGreaterThan(2);
    expect(ENEMY_ARCHETYPES.carrion.width / ENEMY_ARCHETYPES.carrion.height).toBeGreaterThan(1.4);
  });
});
