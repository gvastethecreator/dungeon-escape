/**
 * Pure projection of world anchors into a reusable DungeonAudioFrame.
 * DungeonWorld supplies iterators; this module fills the pooled frame.
 */

import type {
  AudioAnchor,
  CreatureVoice,
  DungeonAudioFrame,
  EnemyAudioAnchor,
} from "../audio/GameAudio";
import type { EnemyKind } from "./EnemyArchetypes";
import { ENEMY_ARCHETYPES } from "./EnemyArchetypes";

/** Presence and attack SFX are keyed 1:1 with enemy kind. */
export function creatureVoiceForEnemy(kind: EnemyKind): CreatureVoice {
  return kind;
}

export interface AudioFireSource {
  audio?: boolean;
  root: { position: { x: number; y: number; z: number } };
  baseY: number;
}

export interface AudioStoneSource {
  kind: string;
  collected: boolean;
  stoneId?: string | null;
  object: { position: { x: number; y: number; z: number } };
}

export interface AudioEnemySource {
  kind: EnemyKind;
  instanceIndex: number;
  scaleX: number;
  scaleY: number;
  position: { x: number; y: number; z: number };
}

export interface AudioPortalSource {
  position: { x: number; y: number; z: number };
}

export function createEmptyDungeonAudioFrame(): DungeonAudioFrame {
  return {
    fires: [],
    magicStones: [],
    enemies: [],
    portal: null,
    moodId: null,
  };
}

export function projectDungeonAudioFrame(
  frame: DungeonAudioFrame,
  sources: {
    fires: readonly AudioFireSource[];
    stones: readonly AudioStoneSource[];
    enemies: readonly AudioEnemySource[];
    portal: AudioPortalSource | null;
    moodId: string | null;
  },
): DungeonAudioFrame {
  let fireCount = 0;
  for (const fire of sources.fires) {
    if (fire.audio === false) continue;
    const anchor = frame.fires[fireCount] ?? ({
      id: `fire-${fireCount}`,
      x: 0,
      y: 0,
      z: 0,
    } satisfies AudioAnchor);
    anchor.x = fire.root.position.x;
    anchor.y = fire.root.position.y + fire.baseY;
    anchor.z = fire.root.position.z;
    frame.fires[fireCount++] = anchor;
  }
  frame.fires.length = fireCount;

  let stoneCount = 0;
  for (const pickup of sources.stones) {
    if (pickup.kind !== "stone" || pickup.collected || !pickup.stoneId) continue;
    const anchor = frame.magicStones[stoneCount] ?? ({
      id: `stone-${pickup.stoneId}`,
      x: 0,
      y: 0,
      z: 0,
    } satisfies AudioAnchor);
    anchor.id = `stone-${pickup.stoneId}`;
    anchor.x = pickup.object.position.x;
    anchor.y = pickup.object.position.y;
    anchor.z = pickup.object.position.z;
    frame.magicStones[stoneCount++] = anchor;
  }
  frame.magicStones.length = stoneCount;

  let enemyCount = 0;
  for (const enemy of sources.enemies) {
    if (enemy.scaleX <= 0.001 || enemy.scaleY <= 0.001) continue;
    const voice = creatureVoiceForEnemy(enemy.kind);
    const anchor = frame.enemies[enemyCount] ?? ({
      id: `enemy-${enemy.kind}-${enemy.instanceIndex}`,
      x: 0,
      y: 0,
      z: 0,
      voice,
    } satisfies EnemyAudioAnchor);
    anchor.id = `enemy-${enemy.kind}-${enemy.instanceIndex}`;
    anchor.voice = voice;
    anchor.x = enemy.position.x;
    anchor.y = enemy.position.y + ENEMY_ARCHETYPES[enemy.kind].height * 0.5;
    anchor.z = enemy.position.z;
    frame.enemies[enemyCount++] = anchor;
  }
  frame.enemies.length = enemyCount;

  if (sources.portal) {
    const portal = frame.portal ?? { id: "exit-portal", x: 0, y: 0, z: 0 };
    portal.x = sources.portal.position.x;
    portal.y = sources.portal.position.y + 1.7;
    portal.z = sources.portal.position.z;
    frame.portal = portal;
  } else {
    frame.portal = null;
  }
  frame.moodId = sources.moodId;
  return frame;
}
