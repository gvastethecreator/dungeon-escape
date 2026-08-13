import { describe, expect, test } from "bun:test";

import {
  pickSceneLoaderEnemyKind,
  sceneLoaderEnemyStyle,
  SCENE_LOADER_ENEMY_DISPLAY_SIZE,
  SCENE_LOADER_ENEMY_FPS,
} from "../src/ui/SceneLoaderEnemy";
import {
  ENEMY_CELL_SIZE,
  ENEMY_ROSTER,
  enemyAnimationsForMood,
} from "../src/world/EnemySpriteAtlas";

describe("scene loader enemy teaser", () => {
  test("picks only roster kinds", () => {
    const sequence = [0, 0.49, 0.99, 1.5, -1];
    for (const sample of sequence) {
      expect(ENEMY_ROSTER).toContain(pickSceneLoaderEnemyKind(() => sample));
    }
  });

  test("lays out a biome atlas row as a horizontal walk strip", () => {
    const animations = enemyAnimationsForMood("molten");
    const goblin = animations.goblin;
    const style = sceneLoaderEnemyStyle(goblin, SCENE_LOADER_ENEMY_DISPLAY_SIZE);
    const scale = SCENE_LOADER_ENEMY_DISPLAY_SIZE / ENEMY_CELL_SIZE;
    const row = goblin.frames[0]!;

    expect(style.backgroundImage).toBe(`url("${goblin.src}")`);
    expect(style.backgroundImage).toContain("/biomes/molten-enemies.webp");
    expect(style.backgroundSize).toBe(`${goblin.size[0] * scale}px ${goblin.size[1] * scale}px`);
    expect(style.backgroundPosition).toBe(`0px -${row.y * scale}px`);
    expect(style.cellSizePx).toBe(SCENE_LOADER_ENEMY_DISPLAY_SIZE);
    expect(style.stripWidthPx).toBe(SCENE_LOADER_ENEMY_DISPLAY_SIZE * 4);
    expect(style.stripHeightPx).toBe(SCENE_LOADER_ENEMY_DISPLAY_SIZE);
    expect(style.frameCount).toBe(4);
    expect(style.frameDurationSec).toBeCloseTo(4 / SCENE_LOADER_ENEMY_FPS, 5);
  });

  test("host CSS slides the strip with transform steps, not background-position", async () => {
    const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
    const loaderStart = css.indexOf(".scene-loader {");
    const loaderEnd = css.indexOf(".run-intro-status");
    const loaderCss = css.slice(loaderStart, loaderEnd > loaderStart ? loaderEnd : undefined);
    expect(loaderCss).toContain("scene-loader-enemy-frames");
    expect(loaderCss).toContain("steps(4)");
    expect(loaderCss).toContain("translate3d");
    expect(loaderCss).toContain("overflow: hidden");
    expect(loaderCss).toContain("--scene-loader-enemy-strip-width");
    expect(loaderCss).not.toContain("background-position-x");
    expect(loaderCss).not.toContain("scene-loader-enemy-bob");
    expect(loaderCss).not.toContain("scene-loader-enemy-pace");
    expect(loaderCss).toMatch(/\.scene-loader__bar\s*\{[^}]*background:\s*#fff/s);
  });

  test("host loader markup keeps the enemy stage above the progress track", async () => {
    const html = await Bun.file(new URL("../index.html", import.meta.url)).text();
    const enemyAt = html.indexOf('id="scene-loader-enemy"');
    const trackAt = html.indexOf('class="scene-loader__track"');
    const spriteAt = html.indexOf('id="scene-loader-enemy-sprite"');
    expect(enemyAt).toBeGreaterThan(-1);
    expect(spriteAt).toBeGreaterThan(enemyAt);
    expect(trackAt).toBeGreaterThan(spriteAt);
    expect(html).toContain('class="scene-loader__kicker">Please wait');
    expect(html).toContain("Preparing the dungeon");
  });

  test("main wires the teaser through setSceneLoaderVisible", async () => {
    const source = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(source).toContain('from "./ui/SceneLoaderEnemy"');
    expect(source).toContain("sceneLoaderEnemy.show(resolveSceneLoaderMoodId())");
    expect(source).toContain("sceneLoaderEnemy.hide()");
  });
});
