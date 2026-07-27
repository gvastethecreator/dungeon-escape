import type { DungeonMoodId } from "../systems/DungeonMood";
import { listDungeonMoodIds, parseDungeonMoodId } from "../systems/DungeonMood";

export interface EnemyAtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EnemyAnimationDefinition {
  src: string;
  size: readonly [number, number];
  frames: readonly EnemyAtlasFrame[];
  fps: number;
  loop: boolean;
}

/**
 * Runtime roster for the Dungeon. The row order matches the production atlas
 * manifest under public/assets/sprites/enemies-v5/.
 */
export const ENEMY_ROSTER = [
  "carrion",
  "goblin",
  "ghost",
  "ratling",
  "husk",
  "imp",
  "zombie-orc",
  "spider",
  "bone-slime",
  "white-eyed-shadow",
  "carrion-stalker",
] as const;

export type EnemyRosterKind = (typeof ENEMY_ROSTER)[number];

/** Canonical base sheet (12th atlas). Biome variants live under biomes/. */
export const ENEMY_ATLAS_SRC = "/assets/sprites/enemies-v5/iron-ash-enemies-v5.png";
export const ENEMY_ATLAS_SIZE = [1280, 3520] as const;
export const ENEMY_CELL_SIZE = 320;
const ENEMY_ANIMATION_FPS = 8;

export function enemyAtlasSrcForMood(moodId: DungeonMoodId | string): string {
  const id = parseDungeonMoodId(moodId) ?? "ash";
  return `/assets/sprites/enemies-v5/biomes/${id}-enemies.png`;
}

export function listEnemyAtlasSources(): readonly string[] {
  return [ENEMY_ATLAS_SRC, ...listDungeonMoodIds().map(enemyAtlasSrcForMood)];
}

function rowAnimation(row: number, src: string = ENEMY_ATLAS_SRC): EnemyAnimationDefinition {
  return {
    src,
    size: ENEMY_ATLAS_SIZE,
    frames: [0, 1, 2, 3].map((column) => ({
      x: column * ENEMY_CELL_SIZE,
      y: row * ENEMY_CELL_SIZE,
      w: ENEMY_CELL_SIZE,
      h: ENEMY_CELL_SIZE,
    })),
    fps: ENEMY_ANIMATION_FPS,
    loop: true,
  };
}

function buildEnemyAnimations(src: string): Record<EnemyRosterKind, EnemyAnimationDefinition> {
  return {
    carrion: rowAnimation(0, src),
    goblin: rowAnimation(1, src),
    ghost: rowAnimation(2, src),
    ratling: rowAnimation(3, src),
    husk: rowAnimation(4, src),
    imp: rowAnimation(5, src),
    "zombie-orc": rowAnimation(6, src),
    spider: rowAnimation(7, src),
    "bone-slime": rowAnimation(8, src),
    "white-eyed-shadow": rowAnimation(9, src),
    "carrion-stalker": rowAnimation(10, src),
  };
}

/** Default animations (base iron-ash sheet). Prefer enemyAnimationsForMood at runtime. */
export const ENEMY_ANIMATIONS = buildEnemyAnimations(ENEMY_ATLAS_SRC);

export function enemyAnimationsForMood(
  moodId: DungeonMoodId | string,
): Record<EnemyRosterKind, EnemyAnimationDefinition> {
  return buildEnemyAnimations(enemyAtlasSrcForMood(moodId));
}

export function enemyAnimationFrameIndex(
  kind: EnemyRosterKind,
  elapsed: number,
  phaseOffset = 0,
  moving = true,
  animations: Record<EnemyRosterKind, EnemyAnimationDefinition> = ENEMY_ANIMATIONS,
): number {
  if (!moving) return 0;
  const animation = animations[kind];
  const tick = Math.floor(Math.max(0, elapsed + phaseOffset) * animation.fps);
  return tick % animation.frames.length;
}
