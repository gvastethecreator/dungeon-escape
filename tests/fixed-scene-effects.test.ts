import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { FixedSceneEffects } from "../src/world/FixedSceneEffects";
import { createLiquidMaterial } from "../src/world/LiquidSectionKit";
import { createNoiseFlame } from "../src/world/ProceduralFlameVfx";
import type { StaticFireEffect, StaticFloorBiomeSprite } from "../src/world/StaticDungeonScene";
import { createVolumetricBeam } from "../src/world/VolumetricBeam";

describe("FixedSceneEffects", () => {
  test("updates procedural flame, light, beams, liquid, and fixed sprite projection", () => {
    const flameAssembly = createNoiseFlame({
      name: "Test flame",
      width: 0.5,
      height: 1,
      phase: 0.4,
    });
    const root = new THREE.Group();
    root.add(flameAssembly.flame);
    const halo = createVolumetricBeam(0xffa040, 1.2, 0.4, 0.3);
    const light = new THREE.PointLight(0xffa040, 0, 10);
    const fire: StaticFireEffect = {
      root,
      flame: flameAssembly.flame,
      flameDetails: flameAssembly.details,
      halos: [halo],
      light,
      baseIntensity: 5,
      baseY: 0.7,
      baseFlameScaleY: 0.9,
      currentLightFactor: 0.4,
      cutoffDistance: 12,
      phase: 0.4,
      losOpen: true,
      losAge: 0,
    };
    const spriteMaterial = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.8 });
    const spriteMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), spriteMaterial);
    const sprite: StaticFloorBiomeSprite = {
      mesh: spriteMesh,
      material: spriteMaterial,
      baseOpacity: 0.8,
      x: 0,
      z: 0,
      baseYaw: 0,
      placement: "floor-standing",
    };
    const portalBeam = createVolumetricBeam();
    const stoneBeam = createVolumetricBeam();
    const ambientBeam = createVolumetricBeam();
    const liquidMaterial = createLiquidMaterial("pool");
    const effects = new FixedSceneEffects();

    effects.update({
      delta: 0.25,
      elapsed: 2.5,
      viewerPosition: new THREE.Vector3(3, 1.62, 4),
      dungeon: null,
      tileSize: 2.4,
      floorSprites: [sprite],
      fires: [fire],
      portalBeam,
      stoneBeams: [stoneBeam],
      ambientBeams: [ambientBeam],
      liquidSurfaces: [
        {
          kind: "pool",
          mesh: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), liquidMaterial),
          material: liquidMaterial,
        },
      ],
    });

    expect(root.visible).toBe(true);
    expect(flameAssembly.flame.visible).toBe(true);
    expect(flameAssembly.material.uniforms.uTime.value).toBe(2.5);
    expect(flameAssembly.flame.position.y).toBe(0.7);
    expect(flameAssembly.flame.scale.y).toBe(0.9);
    expect(flameAssembly.flame.rotation.y).not.toBe(0);
    expect(light.intensity).toBeGreaterThan(0);
    expect(fire.currentLightFactor).toBeGreaterThan(0.4);
    expect((halo.material as THREE.ShaderMaterial).uniforms.uTime.value).toBe(2.9);

    for (const beam of [portalBeam, stoneBeam, ambientBeam]) {
      expect((beam.material as THREE.ShaderMaterial).uniforms.uTime.value).toBe(2.5);
    }
    expect((liquidMaterial.userData.liquidTime as { value: number }).value).toBe(2.5);
    expect(liquidMaterial.map?.offset.x).toBeCloseTo(0.03, 5);
    expect(spriteMesh.visible).toBe(true);
    expect(spriteMesh.userData.distanceFade).toBeGreaterThan(0);
    expect(spriteMaterial.opacity).toBeLessThanOrEqual(sprite.baseOpacity);
    expect(spriteMesh.rotation.y).toBeCloseTo(Math.atan2(3, 4), 5);
  });
});
