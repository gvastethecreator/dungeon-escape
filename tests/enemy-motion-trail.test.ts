import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  ENEMY_TRAIL_OPACITY,
  EnemyMotionTrailVfx,
  previousEnemyAnimationFrame,
} from "../src/world/EnemyMotionTrailVfx";
import { ENEMY_ANIMATIONS } from "../src/world/EnemySpriteAtlas";

function target(
  overrides: Partial<{
    kind: "goblin" | "ghost" | "husk";
    instanceIndex: number;
    x: number;
    y: number;
    z: number;
    yaw: number;
    scaleX: number;
    scaleY: number;
    phaseVisibility: number;
    spawnReveal: number;
    moving: boolean;
  }> = {},
) {
  return {
    kind: overrides.kind ?? "goblin",
    instanceIndex: overrides.instanceIndex ?? 0,
    position: {
      x: overrides.x ?? 0,
      y: overrides.y ?? 0.9,
      z: overrides.z ?? 0,
    },
    yaw: overrides.yaw ?? 0,
    scaleX: overrides.scaleX ?? 1,
    scaleY: overrides.scaleY ?? 1.5,
    phaseVisibility: overrides.phaseVisibility ?? 1,
    spawnReveal: overrides.spawnReveal ?? 1,
    moving: overrides.moving ?? true,
  };
}

function instanceScale(mesh: THREE.InstancedMesh, index: number): number {
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  mesh.getMatrixAt(index, matrix);
  matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
  return scale.length();
}

function makeVfx(kinds: Array<"goblin" | "ghost" | "husk"> = ["goblin"]): EnemyMotionTrailVfx {
  const vfx = new EnemyMotionTrailVfx();
  const map = new THREE.Texture();
  for (const kind of kinds) {
    vfx.registerKind(kind, map, ENEMY_ANIMATIONS[kind], 1);
  }
  return vfx;
}

describe("enemy motion trail", () => {
  test("builds per-kind black atlas afterimage layers", () => {
    const vfx = makeVfx(["goblin", "ghost"]);
    expect(vfx.root.name).toBe("Enemy motion trail field");
    const goblin = vfx.getDebugMesh("goblin");
    expect(goblin).toBeInstanceOf(THREE.InstancedMesh);
    const material = goblin!.material as THREE.MeshBasicMaterial;
    expect(material.color.getHex()).toBe(0x000000);
    expect(material.opacity).toBe(ENEMY_TRAIL_OPACITY);
    expect(ENEMY_TRAIL_OPACITY).toBe(0.4);
    expect(material.map).toBeTruthy();
    vfx.dispose();
  });

  test("lags one animation frame behind the live billboard", () => {
    expect(previousEnemyAnimationFrame(0, 4)).toBe(3);
    expect(previousEnemyAnimationFrame(1, 4)).toBe(0);
    expect(previousEnemyAnimationFrame(3, 4)).toBe(2);

    const vfx = makeVfx(["goblin"]);
    const mesh = vfx.getDebugMesh("goblin")!;
    const material = mesh.material as THREE.MeshBasicMaterial & {
      userData: { enemyAtlasFrame: THREE.Vector4 };
    };
    const animation = ENEMY_ANIMATIONS.goblin;
    vfx.syncAnimationFrame("goblin", 2);
    const frame = material.userData.enemyAtlasFrame;
    // Frame 1 (previous of 2) is the second column of the strip.
    expect(frame.x).toBeCloseTo(animation.frames[1]!.x / animation.size[0], 5);
    expect(frame.z).toBeCloseTo(animation.frames[1]!.w / animation.size[0], 5);
    vfx.dispose();
  });

  test("writes visible samples after horizontal travel and clears them when idle", () => {
    const vfx = makeVfx();
    const mesh = vfx.getDebugMesh("goblin")!;
    const viewer = new THREE.Vector3(0, 1.5, 0);

    let x = 0;
    for (let step = 0; step < 12; step += 1) {
      x += 0.12;
      vfx.update([target({ x, z: 0, moving: true })], 1 / 30, false, viewer);
    }

    expect(instanceScale(mesh, 0)).toBeGreaterThan(0);

    for (let step = 0; step < 40; step += 1) {
      vfx.update([target({ x, z: 0, moving: false })], 1 / 30, false, viewer);
    }
    expect(instanceScale(mesh, 0)).toBe(0);
    vfx.dispose();
  });

  test("skips fresh far trails without touching GPU buffers", () => {
    const vfx = makeVfx();
    const mesh = vfx.getDebugMesh("goblin")!;
    const alpha = mesh.geometry.getAttribute("aTrailAlpha") as THREE.InstancedBufferAttribute;
    const matrixVersion = mesh.instanceMatrix.version;
    const alphaVersion = alpha.version;
    const viewer = new THREE.Vector3(0, 1.5, 0);

    vfx.update([target({ x: 40, moving: false })], 1 / 30, false, viewer);
    expect(instanceScale(mesh, 0)).toBe(0);
    expect(mesh.instanceMatrix.version).toBe(matrixVersion);
    expect(alpha.version).toBe(alphaVersion);

    vfx.update([target({ x: 40, moving: false })], 1 / 30, false, viewer);
    expect(mesh.instanceMatrix.version).toBe(matrixVersion);
    expect(alpha.version).toBe(alphaVersion);
    vfx.dispose();
  });

  test("keeps empty nearby idle trail buffers clean", () => {
    const vfx = makeVfx();
    const mesh = vfx.getDebugMesh("goblin")!;
    const alpha = mesh.geometry.getAttribute("aTrailAlpha") as THREE.InstancedBufferAttribute;
    const matrixVersion = mesh.instanceMatrix.version;
    const alphaVersion = alpha.version;
    const viewer = new THREE.Vector3(0, 1.5, 0);

    vfx.update([target({ x: 2, moving: false })], 1 / 30, false, viewer);
    vfx.update([target({ x: 2, moving: false })], 1 / 30, false, viewer);
    expect(mesh.instanceMatrix.version).toBe(matrixVersion);
    expect(alpha.version).toBe(alphaVersion);
    vfx.dispose();
  });

  test("clears a nearby trail once after it leaves range", () => {
    const vfx = makeVfx();
    const mesh = vfx.getDebugMesh("goblin")!;
    const alpha = mesh.geometry.getAttribute("aTrailAlpha") as THREE.InstancedBufferAttribute;
    const viewer = new THREE.Vector3(0, 1.5, 0);

    let x = 0;
    for (let step = 0; step < 10; step += 1) {
      x += 0.12;
      vfx.update([target({ x, moving: true })], 1 / 30, false, viewer);
    }
    expect(instanceScale(mesh, 0)).toBeGreaterThan(0);

    vfx.update([target({ x: 40, moving: true })], 1 / 30, false, viewer);
    expect(instanceScale(mesh, 0)).toBe(0);
    const matrixVersion = mesh.instanceMatrix.version;
    const alphaVersion = alpha.version;

    vfx.update([target({ x: 40, moving: true })], 1 / 30, false, viewer);
    expect(mesh.instanceMatrix.version).toBe(matrixVersion);
    expect(alpha.version).toBe(alphaVersion);
    vfx.dispose();
  });

  test("does not keep writing while time freeze is active", () => {
    const vfx = makeVfx();
    const mesh = vfx.getDebugMesh("goblin")!;

    let x = 0;
    for (let step = 0; step < 10; step += 1) {
      x += 0.14;
      vfx.update([target({ x, moving: true })], 1 / 30, false);
    }
    const activeScale = instanceScale(mesh, 0);
    expect(activeScale).toBeGreaterThan(0);

    const frozenX = x;
    for (let step = 0; step < 8; step += 1) {
      x += 0.14;
      vfx.update([target({ x, moving: true })], 1 / 30, true);
    }
    expect(instanceScale(mesh, 0)).toBeLessThanOrEqual(activeScale);

    for (let step = 0; step < 50; step += 1) {
      vfx.update([target({ x: frozenX, moving: false })], 1 / 30, true);
    }
    expect(instanceScale(mesh, 0)).toBe(0);
    vfx.dispose();
  });

  test("hides trail samples for phased-out enemies", () => {
    const vfx = makeVfx(["ghost"]);
    const mesh = vfx.getDebugMesh("ghost")!;

    let x = 0;
    for (let step = 0; step < 10; step += 1) {
      x += 0.12;
      vfx.update([target({ kind: "ghost", x, moving: true })], 1 / 30, false);
    }
    expect(instanceScale(mesh, 0)).toBeGreaterThan(0);

    for (let step = 0; step < 20; step += 1) {
      vfx.update(
        [target({ kind: "ghost", x, moving: false, phaseVisibility: 0, spawnReveal: 1 })],
        1 / 30,
        false,
      );
    }
    expect(instanceScale(mesh, 0)).toBe(0);
    vfx.dispose();
  });
});
