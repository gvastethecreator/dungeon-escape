/**
 * Animated enemy teaser above the "Please wait" progress bar.
 * Picks a random roster kind and plays its biome atlas walk loop.
 *
 * Frames advance with compositor-friendly `transform` + `steps(4)` on a
 * clipped strip (not background-position). That keeps the walk cycle running
 * while map generation blocks the main thread.
 */

import {
  ENEMY_CELL_SIZE,
  ENEMY_ROSTER,
  enemyAnimationsForMood,
  type EnemyAnimationDefinition,
  type EnemyRosterKind,
} from "../world/EnemySpriteAtlas";

export const SCENE_LOADER_ENEMY_DISPLAY_SIZE = 148;
/** Loader teaser playback rate (atlas is authored at 8 fps in play). */
export const SCENE_LOADER_ENEMY_FPS = 12;

export interface SceneLoaderEnemyStyle {
  backgroundImage: string;
  backgroundSize: string;
  /** Locks the roster row inside the strip. */
  backgroundPosition: string;
  /** One cell (viewport) size. */
  cellSizePx: number;
  /** Full walk strip width (= cell × frameCount). */
  stripWidthPx: number;
  stripHeightPx: number;
  /** Walk-loop duration in seconds (frames / loader fps). */
  frameDurationSec: number;
  frameCount: number;
}

/** Layout metrics for one atlas row as a horizontal walk strip. */
export function sceneLoaderEnemyStyle(
  animation: EnemyAnimationDefinition,
  displaySize: number = SCENE_LOADER_ENEMY_DISPLAY_SIZE,
  fps: number = SCENE_LOADER_ENEMY_FPS,
): SceneLoaderEnemyStyle {
  const scale = displaySize / ENEMY_CELL_SIZE;
  const row = animation.frames[0]!;
  const frameCount = Math.max(1, animation.frames.length);
  const playbackFps = Math.max(1, fps);
  const cellSizePx = displaySize;
  const stripWidthPx = cellSizePx * frameCount;
  return {
    backgroundImage: `url("${animation.src}")`,
    // Scale the full multi-row atlas so one cell maps 1:1 to displaySize.
    backgroundSize: `${animation.size[0] * scale}px ${animation.size[1] * scale}px`,
    backgroundPosition: `0px -${row.y * scale}px`,
    cellSizePx,
    stripWidthPx,
    stripHeightPx: cellSizePx,
    frameDurationSec: frameCount / playbackFps,
    frameCount,
  };
}

export function pickSceneLoaderEnemyKind(random: () => number = Math.random): EnemyRosterKind {
  const index = Math.min(
    ENEMY_ROSTER.length - 1,
    Math.max(0, Math.floor(random() * ENEMY_ROSTER.length)),
  );
  return ENEMY_ROSTER[index]!;
}

export interface SceneLoaderEnemyPorts {
  /** Clipped viewport (one cell). */
  stage: HTMLElement;
  /** Horizontal walk strip animated with translateX steps. */
  sprite: HTMLElement;
  reducedMotion?: boolean;
}

/**
 * Owns show/hide for the scene-loader enemy teaser.
 * Walk frames run as CSS transform so they survive main-thread map builds.
 */
export class SceneLoaderEnemy {
  private kind: EnemyRosterKind | null = null;
  private visible = false;

  constructor(private readonly ports: SceneLoaderEnemyPorts) {
    this.ports.stage.hidden = true;
    this.ports.stage.setAttribute("aria-hidden", "true");
  }

  get isVisible(): boolean {
    return this.visible;
  }

  get activeKind(): EnemyRosterKind | null {
    return this.kind;
  }

  show(moodId: string, options: { kind?: EnemyRosterKind; random?: () => number } = {}): void {
    const kind = options.kind ?? pickSceneLoaderEnemyKind(options.random);
    this.kind = kind;
    this.visible = true;

    this.ports.stage.hidden = false;
    this.ports.stage.setAttribute("aria-hidden", "true");
    this.ports.stage.classList.add("is-active");
    this.ports.stage.dataset.enemyKind = kind;
    this.ports.stage.dataset.biomeId = moodId;

    const animation = enemyAnimationsForMood(moodId)[kind];
    this.applyStyle(animation);

    if (this.ports.reducedMotion) {
      this.ports.stage.classList.add("is-static");
    } else {
      this.ports.stage.classList.remove("is-static");
    }
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.kind = null;
    this.ports.stage.hidden = true;
    this.ports.stage.classList.remove("is-active", "is-static");
    delete this.ports.stage.dataset.enemyKind;
    delete this.ports.stage.dataset.biomeId;
    this.clearStyle();
  }

  private applyStyle(animation: EnemyAnimationDefinition): void {
    const style = sceneLoaderEnemyStyle(animation);
    const { stage, sprite } = this.ports;

    stage.style.width = `${style.cellSizePx}px`;
    stage.style.height = `${style.cellSizePx}px`;
    stage.style.setProperty("--scene-loader-enemy-strip-width", `${style.stripWidthPx}px`);
    stage.style.setProperty("--scene-loader-enemy-frame-duration", `${style.frameDurationSec}s`);

    sprite.style.backgroundImage = style.backgroundImage;
    sprite.style.backgroundSize = style.backgroundSize;
    sprite.style.backgroundPosition = style.backgroundPosition;
    sprite.style.width = `${style.stripWidthPx}px`;
    sprite.style.height = `${style.stripHeightPx}px`;
  }

  private clearStyle(): void {
    const { stage, sprite } = this.ports;
    stage.style.width = "";
    stage.style.height = "";
    stage.style.removeProperty("--scene-loader-enemy-strip-width");
    stage.style.removeProperty("--scene-loader-enemy-frame-duration");
    sprite.style.backgroundImage = "";
    sprite.style.backgroundSize = "";
    sprite.style.backgroundPosition = "";
    sprite.style.width = "";
    sprite.style.height = "";
  }
}
