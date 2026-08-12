/**
 * Pure projection of world anchors into a reusable DungeonAudioFrame.
 * DungeonWorld supplies iterators; this module fills the pooled frame.
 */

import * as THREE from "three";

import type {
  AudioAnchor,
  CreatureVoice,
  DungeonAudioFrame,
  EnemyAudioAnchor,
} from "../audio/GameAudio";
import type { CollectedPickupKind } from "../audio/AudioAssetCatalog";
import type { EnemyKind } from "./EnemyArchetypes";
import { ENEMY_ARCHETYPES } from "./EnemyArchetypes";

/** Presence and attack SFX are keyed 1:1 with enemy kind. */
export function creatureVoiceForEnemy(kind: EnemyKind): CreatureVoice {
  return kind;
}

interface AudioPositionSource {
  position: THREE.Vector3Like;
  getWorldPosition?: (target: THREE.Vector3) => THREE.Vector3;
}

const sourcePosition = new THREE.Vector3();

function readWorldPosition(source: AudioPositionSource, target: THREE.Vector3): THREE.Vector3 {
  return source.getWorldPosition?.(target) ?? target.copy(source.position);
}

export interface AudioFireSource {
  audio?: boolean;
  root: AudioPositionSource;
  baseY: number;
}

export interface AudioStoneSource {
  kind: CollectedPickupKind;
  collected: boolean;
  available?: boolean;
  stoneId?: string | null;
  object: AudioPositionSource;
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
    pickupKinds: [],
  };
}

export function projectDungeonAudioFrame(
  frame: DungeonAudioFrame,
  sources: {
    fires: readonly AudioFireSource[];
    pickups: readonly AudioStoneSource[];
    enemies: readonly AudioEnemySource[];
    /** Enemy roots are floor-local. The world supplies the active slab offset. */
    enemyWorldYOffset?: number;
    portal: AudioPortalSource | null;
    moodId: string | null;
  },
): DungeonAudioFrame {
  let fireCount = 0;
  for (const fire of sources.fires) {
    if (fire.audio === false) continue;
    const anchor =
      frame.fires[fireCount] ??
      ({
        id: `fire-${fireCount}`,
        x: 0,
        y: 0,
        z: 0,
      } satisfies AudioAnchor);
    const position = readWorldPosition(fire.root, sourcePosition);
    anchor.x = position.x;
    anchor.y = position.y + fire.baseY;
    anchor.z = position.z;
    frame.fires[fireCount++] = anchor;
  }
  frame.fires.length = fireCount;

  let stoneCount = 0;
  let pickupKindCount = 0;
  for (const pickup of sources.pickups) {
    if (!pickup.collected && pickup.available !== false) {
      let duplicate = false;
      for (let index = 0; index < pickupKindCount; index += 1) {
        if (frame.pickupKinds[index] !== pickup.kind) continue;
        duplicate = true;
        break;
      }
      if (!duplicate) frame.pickupKinds[pickupKindCount++] = pickup.kind;
    }
    if (pickup.kind !== "stone" || pickup.collected || !pickup.stoneId) continue;
    const anchor =
      frame.magicStones[stoneCount] ??
      ({
        id: `stone-${pickup.stoneId}`,
        x: 0,
        y: 0,
        z: 0,
      } satisfies AudioAnchor);
    anchor.id = `stone-${pickup.stoneId}`;
    const position = readWorldPosition(pickup.object, sourcePosition);
    anchor.x = position.x;
    anchor.y = position.y;
    anchor.z = position.z;
    frame.magicStones[stoneCount++] = anchor;
  }
  frame.magicStones.length = stoneCount;
  frame.pickupKinds.length = pickupKindCount;

  let enemyCount = 0;
  for (const enemy of sources.enemies) {
    if (enemy.scaleX <= 0.001 || enemy.scaleY <= 0.001) continue;
    const voice = creatureVoiceForEnemy(enemy.kind);
    const anchor =
      frame.enemies[enemyCount] ??
      ({
        id: `enemy-${enemy.kind}-${enemy.instanceIndex}`,
        x: 0,
        y: 0,
        z: 0,
        voice,
      } satisfies EnemyAudioAnchor);
    anchor.id = `enemy-${enemy.kind}-${enemy.instanceIndex}`;
    anchor.voice = voice;
    anchor.x = enemy.position.x;
    anchor.y =
      enemy.position.y +
      (sources.enemyWorldYOffset ?? 0) +
      ENEMY_ARCHETYPES[enemy.kind].height * 0.5;
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
