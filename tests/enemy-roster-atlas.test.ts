import { describe, expect, test } from "bun:test";

import {
  ENEMY_ANIMATIONS,
  ENEMY_ATLAS_SRC,
  ENEMY_ROSTER,
  enemyAnimationFrameIndex,
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
      new URL("../public/assets/sprites/enemies-v5/manifest.json", import.meta.url),
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
});
