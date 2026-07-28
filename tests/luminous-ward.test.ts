import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  activateLuminousWard,
  isLuminousWardActive,
  LUMINOUS_WARD_DURATION_SECONDS,
  LUMINOUS_WARD_REPEL_RADIUS,
  tickLuminousWard,
} from "../src/game/LuminousWard";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createLuminousWardStone } from "../src/world/ItemFactory";
import { LuminousWardVfx } from "../src/world/LuminousWardVfx";

describe("luminous ward power", () => {
  test("holds the safety field for thirty gameplay seconds", () => {
    expect(LUMINOUS_WARD_DURATION_SECONDS).toBe(30);
    expect(LUMINOUS_WARD_REPEL_RADIUS).toBeGreaterThan(7);
    expect(activateLuminousWard()).toBe(30);
    expect(tickLuminousWard(activateLuminousWard(), 4.5)).toBeCloseTo(25.5, 6);
    expect(tickLuminousWard(0.2, 1)).toBe(0);
    expect(isLuminousWardActive(0)).toBe(false);
    expect(isLuminousWardActive(0.001)).toBe(true);
  });

  test("builds a faceted 3D stone with a trigger and broad pickup light", () => {
    const stone = createLuminousWardStone(createDungeonMaterials());
    const bounds = new THREE.Box3().setFromObject(stone).getSize(new THREE.Vector3());
    const runtime = stone.userData.sculptRuntime as {
      sockets: { pickup: THREE.Object3D; glow: THREE.Object3D };
      colliders: Array<{ type: string; isTrigger: boolean }>;
    };

    expect(bounds.x).toBeGreaterThan(0.8);
    expect(bounds.y).toBeGreaterThan(0.7);
    expect(stone.getObjectByName("Luminous ward faceted crystal")).toBeDefined();
    expect(stone.getObjectByName("Luminous ward iron foot ring")).toBeDefined();
    expect(stone.getObjectByName("Luminous ward pickup light")).toBeInstanceOf(THREE.PointLight);
    expect(runtime.sockets.pickup.name).toBe("Luminous ward pickup anchor");
    expect(runtime.colliders[0]).toMatchObject({ type: "sphere", isTrigger: true });
  });

  test("keeps the player field visible while active and dark after expiry", () => {
    const vfx = new LuminousWardVfx();
    vfx.update(30, 1.2, { x: 2, y: 1.6, z: -1 }, 1 / 60);
    expect(vfx.light.intensity).toBeGreaterThan(0);
    expect(vfx.root.position.x).toBe(2);
    const ring = vfx.root.getObjectByName("Luminous ward ground radius") as THREE.Mesh;
    expect((ring.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0);

    vfx.update(0, 2, { x: 2, y: 1.6, z: -1 }, 1 / 60);
    expect(vfx.light.intensity).toBe(0);
    expect((ring.material as THREE.MeshBasicMaterial).opacity).toBe(0);
    vfx.dispose();
  });

  test("uses circular particles with motion trails and a protective shell", () => {
    const vfx = new LuminousWardVfx();
    const motes = vfx.root.getObjectByName("Luminous ward floating motes") as THREE.Points;
    const trails = vfx.root.getObjectByName("Luminous ward motion trails") as THREE.Points;
    const shell = vfx.root.getObjectByName("Luminous ward protective shell") as THREE.Mesh;
    const ground = vfx.root.getObjectByName("Luminous ward ground aura") as THREE.Mesh;

    expect(motes).toBeInstanceOf(THREE.Points);
    expect(trails).toBeInstanceOf(THREE.Points);
    expect(shell).toBeInstanceOf(THREE.Mesh);
    expect(ground).toBeInstanceOf(THREE.Mesh);

    const moteMaterial = motes.material as THREE.PointsMaterial;
    expect(moteMaterial.map).toBeTruthy();
    // Soft circle map is square so Points read as discs, not default squares.
    expect(moteMaterial.map!.image.width).toBe(moteMaterial.map!.image.height);

    // Orbit a few frames so trail samples accumulate while the ward is live.
    for (let frame = 0; frame < 24; frame += 1) {
      vfx.update(30, frame / 60, { x: 0, y: 1.5, z: 0 }, 1 / 60);
    }
    expect(moteMaterial.opacity).toBeGreaterThan(0);
    expect((trails.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBeGreaterThan(0);
    const trailAlpha = trails.geometry.getAttribute("aTrailAlpha") as THREE.BufferAttribute;
    let maxTrail = 0;
    for (let i = 0; i < trailAlpha.count; i += 1) {
      maxTrail = Math.max(maxTrail, trailAlpha.getX(i));
    }
    expect(maxTrail).toBeGreaterThan(0);

    const shellMat = shell.material as THREE.ShaderMaterial;
    expect(shellMat.uniforms.uOpacity.value).toBeGreaterThan(0);
    expect((ground.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0);

    vfx.update(0, 1, { x: 0, y: 1.5, z: 0 }, 1 / 60);
    expect(moteMaterial.opacity).toBe(0);
    expect(shellMat.uniforms.uOpacity.value).toBe(0);
    expect((trails.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);
    const motePositions = motes.geometry.getAttribute("position") as THREE.BufferAttribute;
    const clearedVersion = motePositions.version;
    vfx.update(0, 2, { x: 0, y: 1.5, z: 0 }, 1 / 60);
    expect(motePositions.version).toBe(clearedVersion);
    vfx.dispose();
  });
});
