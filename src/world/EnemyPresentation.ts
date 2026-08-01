import * as THREE from "three";

import {
  ENEMY_ARCHETYPES,
  getEnemySpriteRenderMetrics,
  isLowProfileEnemy,
  type EnemyKind,
} from "./EnemyArchetypes";
import {
  enemyOpaqueFeetY,
  resolveEnemyContactShadowLayout,
  setEnemyBillboardFrame,
  setEnemyFreezeAmount,
} from "./EnemyBillboardMaterial";
import type { EnemyMotionTrailTarget } from "./EnemyMotionTrailVfx";
import { enemyAnimationFrameIndex, type EnemyAnimationDefinition } from "./EnemySpriteAtlas";
import type { EnemySimBody } from "./EnemySim";

export interface EnemyPresentationActor extends EnemySimBody {
  position: THREE.Vector3;
  baseScale: THREE.Vector2;
  batch: THREE.InstancedMesh;
  shadowBatch: THREE.InstancedMesh;
  instanceIndex: number;
  shadowInstanceIndex: number;
  yaw: number;
  spawnReveal: number;
  startsActive: boolean;
  visibilityAttribute: THREE.InstancedBufferAttribute;
  tier: number;
  defeated: boolean;
}

export interface EnemyAnimationBatch {
  kind: EnemyKind;
  material: THREE.MeshStandardMaterial;
  animation: EnemyAnimationDefinition;
  frame: number;
  phaseOffset: number;
}

export interface EnemyPresentationTrail {
  syncAnimationFrame(kind: EnemyKind, frame: number): void;
  update(
    targets: readonly EnemyMotionTrailTarget[],
    delta: number,
    frozen: boolean,
    viewerPosition: THREE.Vector3Like,
  ): void;
}

export interface EnemyPresentationFrame {
  actors: readonly EnemyPresentationActor[];
  billboardBatches: ReadonlySet<THREE.InstancedMesh>;
  shadowBatches: ReadonlySet<THREE.InstancedMesh>;
  visibilityAttributes: ReadonlySet<THREE.InstancedBufferAttribute>;
  animationBatches: ReadonlyMap<EnemyKind, EnemyAnimationBatch>;
  animationElapsed: number;
  revealSeconds: number;
  frozen: boolean;
  player: THREE.Vector3Like;
  delta: number;
  moodId: string;
  trail: EnemyPresentationTrail | null;
}

/** Applies the complete render projection for enemy actors after simulation. */
export class EnemyPresentation {
  private readonly movingKinds = new Set<EnemyKind>();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly matrix = new THREE.Matrix4();
  private readonly axisX = new THREE.Vector3(1, 0, 0);

  update(frame: EnemyPresentationFrame): void {
    this.updateAnimationFrames(frame);

    for (const actor of frame.actors) {
      if (!frame.frozen) {
        actor.spawnReveal = Math.min(
          1,
          actor.spawnReveal + frame.delta / Math.max(0.1, frame.revealSeconds),
        );
      }

      actor.yaw = Math.atan2(frame.player.x - actor.position.x, frame.player.z - actor.position.z);
      this.euler.set(0, actor.yaw, actor.roll);
      this.quaternion.setFromEuler(this.euler);
      this.scale.set(actor.scaleX, actor.scaleY, 1);
      const visibility = actor.phaseVisibility * actor.spawnReveal;
      actor.visibilityAttribute.setX(actor.instanceIndex, visibility);
      actor.batch.setMatrixAt(
        actor.instanceIndex,
        this.matrix.compose(actor.position, this.quaternion, this.scale),
      );
      this.writeContactShadow(actor, visibility, frame.moodId);
    }

    for (const batch of frame.billboardBatches) batch.instanceMatrix.needsUpdate = true;
    for (const batch of frame.shadowBatches) batch.instanceMatrix.needsUpdate = true;
    for (const attribute of frame.visibilityAttributes) attribute.needsUpdate = true;
    for (const batch of frame.animationBatches.values()) {
      setEnemyFreezeAmount(batch.material, frame.frozen ? 1 : 0);
    }
    frame.trail?.update(frame.actors, frame.delta, frame.frozen, frame.player);
  }

  writeContactShadow(actor: EnemyPresentationActor, visibility: number, moodId: string): void {
    const archetype = ENEMY_ARCHETYPES[actor.kind];
    const sprite = getEnemySpriteRenderMetrics(actor.kind, moodId);
    const feetY = enemyOpaqueFeetY(actor.position.y, sprite.planeHeight, sprite.bottomPaddingRatio);
    const layout = resolveEnemyContactShadowLayout({
      bodyWidth: archetype.width,
      lowProfile: isLowProfileEnemy(actor.kind),
      feetY,
      visibility,
      spectral: archetype.silhouette === "spectral",
    });
    this.position.set(actor.position.x, layout.y, actor.position.z);
    this.quaternion.setFromAxisAngle(this.axisX, -Math.PI / 2);
    this.scale.set(layout.width, layout.depth, 1);
    actor.shadowBatch.setMatrixAt(
      actor.shadowInstanceIndex,
      this.matrix.compose(this.position, this.quaternion, this.scale),
    );
  }

  private updateAnimationFrames(frame: EnemyPresentationFrame): void {
    this.movingKinds.clear();
    for (const actor of frame.actors) if (actor.moving) this.movingKinds.add(actor.kind);
    for (const batch of frame.animationBatches.values()) {
      const nextFrame = enemyAnimationFrameIndex(
        batch.kind,
        frame.animationElapsed,
        batch.phaseOffset,
        this.movingKinds.has(batch.kind),
      );
      if (nextFrame !== batch.frame) {
        setEnemyBillboardFrame(batch.material, batch.animation, nextFrame);
        batch.frame = nextFrame;
      }
      frame.trail?.syncAnimationFrame(batch.kind, batch.frame);
    }
  }
}
