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

export interface EnemyAnimationSet {
  movement: EnemyAnimationDefinition;
  attack?: EnemyAnimationDefinition;
}

/**
 * Runtime roster for the Dungeon. The row order matches the production atlas
 * manifest under public/assets/sprites/enemies-v8/ (same layout as v5).
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

/**
 * Canonical HQ base sheet from blackflag original roster (same art as v5).
 * Biome subspecies variants live under enemies-v8/biomes/.
 */
export const ENEMY_ATLAS_SRC = "/assets/sprites/enemies-v8/iron-ash-enemies-v8.webp";
export const ENEMY_ATLAS_SIZE = [640, 1760] as const;
export const ENEMY_CELL_SIZE = 160;
const ENEMY_ANIMATION_FPS = 8;
/** Biomes with interleaved movement+attack rows (11 enemies × 2 rows × 160). */
const ANIMATED_ATLAS_SIZE = [640, 3520] as const;
const ANIMATED_BIOMES = new Set<DungeonMoodId>(listDungeonMoodIds());
const ANIMATED_MOVEMENT_FPS: Record<EnemyRosterKind, number> = {
  carrion: 8,
  goblin: 8,
  ghost: 8,
  ratling: 8,
  husk: 8,
  imp: 8,
  "zombie-orc": 7,
  spider: 8,
  "bone-slime": 8,
  "white-eyed-shadow": 8,
  "carrion-stalker": 8,
};
const ANIMATED_ATTACK_FPS: Record<EnemyRosterKind, number> = {
  carrion: 10,
  goblin: 10,
  ghost: 10,
  ratling: 10,
  husk: 10,
  imp: 10,
  "zombie-orc": 9,
  spider: 10,
  "bone-slime": 10,
  "white-eyed-shadow": 10,
  "carrion-stalker": 10,
};

export function enemyAtlasUsesAttackRows(moodId: DungeonMoodId | string): boolean {
  const id = parseDungeonMoodId(moodId);
  return id !== null && ANIMATED_BIOMES.has(id);
}

export function enemyAtlasSrcForMood(moodId: DungeonMoodId | string): string {
  const id = parseDungeonMoodId(moodId) ?? "ash";
  return `/assets/sprites/enemies-v8/biomes/${id}-enemies.webp`;
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

function atlasRowAnimation(
  row: number,
  src: string,
  size: readonly [number, number],
  fps: number,
  loop: boolean,
): EnemyAnimationDefinition {
  return {
    src,
    size,
    frames: [0, 1, 2, 3].map((column) => ({
      x: column * ENEMY_CELL_SIZE,
      y: row * ENEMY_CELL_SIZE,
      w: ENEMY_CELL_SIZE,
      h: ENEMY_CELL_SIZE,
    })),
    fps,
    loop,
  };
}

function buildEnemyAnimationSets(
  moodId: DungeonMoodId | string,
): Record<EnemyRosterKind, EnemyAnimationSet> {
  const id = parseDungeonMoodId(moodId) ?? "ash";
  const src = enemyAtlasSrcForMood(id);
  if (!enemyAtlasUsesAttackRows(id)) {
    const movement = buildEnemyAnimations(src);
    return Object.fromEntries(
      ENEMY_ROSTER.map((kind) => [kind, { movement: movement[kind] }]),
    ) as Record<EnemyRosterKind, EnemyAnimationSet>;
  }
  return Object.fromEntries(
    ENEMY_ROSTER.map((kind, index) => [
      kind,
      {
        movement: atlasRowAnimation(
          index * 2,
          src,
          ANIMATED_ATLAS_SIZE,
          ANIMATED_MOVEMENT_FPS[kind],
          true,
        ),
        attack: atlasRowAnimation(
          index * 2 + 1,
          src,
          ANIMATED_ATLAS_SIZE,
          ANIMATED_ATTACK_FPS[kind],
          false,
        ),
      },
    ]),
  ) as Record<EnemyRosterKind, EnemyAnimationSet>;
}

/**
 * Layout + fallback animations (canonical base sheet).
 * Play / Forge / editor should call `enemyAnimationsForMood` so each biome
 * loads its dedicated atlas under `enemies-v8/biomes/`.
 */
export const ENEMY_ANIMATIONS = buildEnemyAnimations(ENEMY_ATLAS_SRC);

const moodAnimationCache = new Map<string, Record<EnemyRosterKind, EnemyAnimationDefinition>>();
const moodAnimationSetCache = new Map<string, Record<EnemyRosterKind, EnemyAnimationSet>>();

export function enemyAnimationSetsForMood(
  moodId: DungeonMoodId | string,
): Record<EnemyRosterKind, EnemyAnimationSet> {
  const id = parseDungeonMoodId(moodId) ?? "ash";
  const cached = moodAnimationSetCache.get(id);
  if (cached) return cached;
  const built = buildEnemyAnimationSets(id);
  moodAnimationSetCache.set(id, built);
  return built;
}

export function enemyAnimationsForMood(
  moodId: DungeonMoodId | string,
): Record<EnemyRosterKind, EnemyAnimationDefinition> {
  const src = enemyAtlasSrcForMood(moodId);
  const cached = moodAnimationCache.get(src);
  if (cached) return cached;
  const sets = enemyAnimationSetsForMood(moodId);
  const built = Object.fromEntries(
    ENEMY_ROSTER.map((kind) => [kind, sets[kind].movement]),
  ) as Record<EnemyRosterKind, EnemyAnimationDefinition>;
  moodAnimationCache.set(src, built);
  return built;
}

/** Attack pulse runs from 1 to 0; map it once through the authored four-frame strike. */
export function enemyAttackFrameIndex(attackPulse: number, frameCount: number): number {
  if (frameCount <= 1) return 0;
  const progress = 1 - Math.min(1, Math.max(0, attackPulse));
  return Math.min(frameCount - 1, Math.floor(progress * frameCount));
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
  return animationFrameIndex(animation, elapsed, phaseOffset);
}

export function animationFrameIndex(
  animation: EnemyAnimationDefinition,
  elapsed: number,
  phaseOffset = 0,
): number {
  const tick = Math.floor(Math.max(0, elapsed + phaseOffset) * animation.fps);
  return tick % animation.frames.length;
}
