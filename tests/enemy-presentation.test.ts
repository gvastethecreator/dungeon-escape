import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  EnemyPresentation,
  type EnemyAnimationBatch,
  type EnemyPresentationActor,
  type EnemyPresentationTrail,
} from "../src/world/EnemyPresentation";
import { animationFrameIndex, enemyAnimationSetsForMood } from "../src/world/EnemySpriteAtlas";

class TrailProbe implements EnemyPresentationTrail {
  synced: Array<{ kind: string; frame: number }> = [];
  updateCount = 0;
  frozen = false;

  syncAnimationFrame(kind: EnemyPresentationActor["kind"], frame: number): void {
    this.synced.push({ kind, frame });
  }

  update(targets: readonly EnemyPresentationActor[], _delta: number, frozen: boolean): void {
    this.updateCount = targets.length;
    this.frozen = frozen;
  }
}

describe("EnemyPresentation", () => {
  test("projects actor pose, visibility, shadow, animation, freeze, and trail state", () => {
    const billboard = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial(),
      1,
    );
    const shadow = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial(),
      1,
    );
    const visibility = new THREE.InstancedBufferAttribute(new Float32Array(1), 1);
    const material = billboard.material as THREE.MeshStandardMaterial;
    material.userData.enemyAtlasFrame = new THREE.Vector4(0, 0, 1, 1);
    material.userData.enemyFreezeAmount = { value: 0 };
    const animations = enemyAnimationSetsForMood("ancient").goblin;
    const animation = animations.movement;
    const atlasFrames = new THREE.InstancedBufferAttribute(new Float32Array(4), 4);
    billboard.geometry.setAttribute("aEnemyAtlasFrame", atlasFrames);
    const animationBatch: EnemyAnimationBatch = {
      kind: "goblin",
      material,
      animation,
      attackAnimation: animations.attack,
      atlasFrameAttribute: atlasFrames,
      frame: -1,
      phaseOffset: 0,
    };
    const actor: EnemyPresentationActor = {
      kind: "goblin",
      position: new THREE.Vector3(2, 0.9, 3),
      batch: billboard,
      shadowBatch: shadow,
      instanceIndex: 0,
      shadowInstanceIndex: 0,
      hitCooldown: 0,
      baseY: 0.9,
      baseScale: new THREE.Vector2(1.2, 1.4),
      phase: 0,
      attackPulse: 0,
      scaleX: 1.2,
      scaleY: 1.4,
      roll: 0.1,
      yaw: 0,
      phaseEpoch: -1,
      phaseVisibility: 0.8,
      spawnReveal: 0.25,
      startsActive: true,
      moving: true,
      visibilityAttribute: visibility,
      tier: 1,
      defeated: false,
    };
    const trail = new TrailProbe();
    const presentation = new EnemyPresentation();

    presentation.update({
      actors: [actor],
      billboardBatches: new Set([billboard]),
      shadowBatches: new Set([shadow]),
      visibilityAttributes: new Set([visibility]),
      animationBatches: new Map([["goblin", animationBatch]]),
      animationElapsed: 0.2,
      revealSeconds: 1,
      frozen: true,
      player: new THREE.Vector3(5, 1.62, 6),
      delta: 0.25,
      moodId: "ancient",
      trail,
    });

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    billboard.getMatrixAt(0, matrix);
    matrix.decompose(position, rotation, scale);

    expect(actor.spawnReveal).toBe(0.25);
    expect(actor.yaw).toBeCloseTo(Math.PI / 4, 5);
    expect(visibility.getX(0)).toBeCloseTo(0.2, 5);
    expect(position.x).toBeCloseTo(2, 5);
    expect(position.y).toBeCloseTo(0.9, 5);
    expect(position.z).toBeCloseTo(3, 5);
    expect(scale.x).toBeCloseTo(1.2, 5);
    expect(scale.y).toBeCloseTo(1.4, 5);
    expect(scale.z).toBeCloseTo(1, 5);
    expect(billboard.instanceMatrix.version).toBeGreaterThan(0);
    expect(shadow.instanceMatrix.version).toBeGreaterThan(0);
    expect(visibility.version).toBeGreaterThan(0);
    expect((material.userData.enemyFreezeAmount as { value: number }).value).toBe(1);
    expect(animationBatch.frame).toBe(animationFrameIndex(animation, 0.2));
    expect(trail.synced).toEqual([{ kind: "goblin", frame: animationBatch.frame }]);
    expect(trail.updateCount).toBe(1);
    expect(trail.frozen).toBe(true);
    expect(atlasFrames.version).toBeGreaterThan(0);
    expect(atlasFrames.getY(0)).toBeCloseTo(1 - (320 + 160) / 3520, 6);

    actor.attackPulse = 0.5;
    actor.moving = false;
    presentation.update({
      actors: [actor],
      billboardBatches: new Set([billboard]),
      shadowBatches: new Set([shadow]),
      visibilityAttributes: new Set([visibility]),
      animationBatches: new Map([["goblin", animationBatch]]),
      animationElapsed: 0.2,
      revealSeconds: 1,
      frozen: false,
      player: new THREE.Vector3(5, 1.62, 6),
      delta: 0,
      moodId: "ancient",
      trail: null,
    });
    expect(atlasFrames.getY(0)).toBeCloseTo(1 - (480 + 160) / 3520, 6);

    shadow.getMatrixAt(0, matrix);
    matrix.decompose(position, rotation, scale);
    expect(position.x).toBeCloseTo(actor.position.x, 5);
    expect(position.z).toBeCloseTo(actor.position.z, 5);
    expect(scale.x).toBeGreaterThan(0);
    expect(scale.y).toBeGreaterThan(0);
  });
});
