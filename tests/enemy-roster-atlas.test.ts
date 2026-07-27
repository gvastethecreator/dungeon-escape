import { describe, expect, test } from "bun:test";

import { listDungeonMoodIds } from "../src/systems/DungeonMood";
import {
  ENEMY_ANIMATIONS,
  ENEMY_ATLAS_SRC,
  ENEMY_ROSTER,
  enemyAnimationFrameIndex,
  enemyAnimationsForMood,
  enemyAtlasSrcForMood,
  listEnemyAtlasSources,
  type EnemyAtlasFrame,
} from "../src/world/EnemySpriteAtlas";

interface AtlasManifest {
  animation: {
    rows: Record<string, { fps: number; frames: number; loop: boolean }>;
  };
  frame_layout: {
    sheetWidth: number;
    sheetHeight: number;
    cellWidth: number;
    cellHeight: number;
    rows: Record<string, EnemyAtlasFrame[]>;
  };
}

describe("enemy atlas runtime contract", () => {
  test("runtime frame data matches the shipped manifest", async () => {
    const manifestFile = Bun.file(
      new URL("../public/assets/sprites/enemies-v6/manifest.json", import.meta.url),
    );
    const manifest = JSON.parse(await manifestFile.text()) as AtlasManifest;

    expect(manifest.frame_layout).toMatchObject({
      sheetWidth: 1280,
      sheetHeight: 3520,
      cellWidth: 320,
      cellHeight: 320,
    });
    expect(Object.keys(manifest.frame_layout.rows)).toEqual([...ENEMY_ROSTER]);

    for (const kind of ENEMY_ROSTER) {
      const animation = ENEMY_ANIMATIONS[kind];
      const manifestAnimation = manifest.animation.rows[kind];
      expect(animation.src).toBe(ENEMY_ATLAS_SRC);
      expect(animation.frames).toEqual(manifest.frame_layout.rows[kind]);
      expect(manifestAnimation).toMatchObject({ fps: 8, frames: 4, loop: true });
    }
  });

  test("four-frame walk loop advances at eight frames per second", () => {
    expect(enemyAnimationFrameIndex("goblin", 0)).toBe(0);
    expect(enemyAnimationFrameIndex("goblin", 0.124)).toBe(0);
    expect(enemyAnimationFrameIndex("goblin", 0.125)).toBe(1);
    expect(enemyAnimationFrameIndex("goblin", 0.25)).toBe(2);
    expect(enemyAnimationFrameIndex("goblin", 0.375)).toBe(3);
    expect(enemyAnimationFrameIndex("goblin", 0.5)).toBe(0);
  });

  test("each biome ships a dedicated enemy atlas plus the base sheet", async () => {
    const sources = listEnemyAtlasSources();
    expect(sources).toHaveLength(1 + listDungeonMoodIds().length);
    expect(sources[0]).toBe(ENEMY_ATLAS_SRC);

    for (const moodId of listDungeonMoodIds()) {
      const src = enemyAtlasSrcForMood(moodId);
      expect(src).toBe(`/assets/sprites/enemies-v6/biomes/${moodId}-enemies.png`);
      const animations = enemyAnimationsForMood(moodId);
      for (const kind of ENEMY_ROSTER) {
        expect(animations[kind].src).toBe(src);
        expect(animations[kind].frames).toHaveLength(4);
        expect(animations[kind].size).toEqual([1280, 3520]);
      }
      const file = Bun.file(new URL(`../public${src}`, import.meta.url));
      expect(await file.exists()).toBe(true);
      expect(file.size).toBeGreaterThan(500_000);
    }
  });
});
