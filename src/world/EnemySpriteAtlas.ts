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

export const ENEMY_ATLAS_SRC = "/assets/sprites/enemies-v5/iron-ash-enemies-v5.png";
export const ENEMY_ATLAS_SIZE = [1280, 3520] as const;
export const ENEMY_CELL_SIZE = 320;
const ENEMY_ANIMATION_FPS = 8;

function rowAnimation(row: number): EnemyAnimationDefinition {
  return {
    src: ENEMY_ATLAS_SRC,
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

export const ENEMY_ANIMATIONS = {
  carrion: rowAnimation(0),
  goblin: rowAnimation(1),
  ghost: rowAnimation(2),
  ratling: rowAnimation(3),
  husk: rowAnimation(4),
  imp: rowAnimation(5),
  "zombie-orc": rowAnimation(6),
  spider: rowAnimation(7),
  "bone-slime": rowAnimation(8),
  "white-eyed-shadow": rowAnimation(9),
  "carrion-stalker": rowAnimation(10),
} as const satisfies Record<EnemyRosterKind, EnemyAnimationDefinition>;

export function enemyAnimationFrameIndex(
  kind: EnemyRosterKind,
  elapsed: number,
  phaseOffset = 0,
  moving = true,
): number {
  if (!moving) return 0;
  const animation = ENEMY_ANIMATIONS[kind];
  const tick = Math.floor(Math.max(0, elapsed + phaseOffset) * animation.fps);
  return tick % animation.frames.length;
}
