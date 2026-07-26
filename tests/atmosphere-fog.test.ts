import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import {
  AtmosphereSystem,
  DUST_COARSE_MIN,
  DUST_COARSE_OPACITY,
  DUST_COARSE_SIZE_MAX,
  DUST_COARSE_SIZE_MIN,
  DUST_FINE_MIN,
  DUST_FINE_OPACITY,
  DUST_FINE_SIZE_MAX,
  DUST_FINE_SIZE_MIN,
  fogVolumeColor,
  SOFT_FOG_DEFAULT_WALL_HEIGHT,
  SOFT_FOG_DENSITY,
  SOFT_FOG_HEIGHT_FALLOFF_AIR,
  SOFT_FOG_HEIGHT_FALLOFF_GROUND,
  SOFT_FOG_LOCAL_HALF,
  SOFT_FOG_MAX_ALPHA,
  SOFT_FOG_MAX_DIST,
} from "../src/systems/AtmosphereSystem";
import { getDungeonMood } from "../src/systems/DungeonMood";

function dualHeightDensity(y: number): number {
  return (
    0.52 * Math.exp(-SOFT_FOG_HEIGHT_FALLOFF_GROUND * y) +
    0.48 * Math.exp(-SOFT_FOG_HEIGHT_FALLOFF_AIR * y)
  );
}

describe("soft ground fog", () => {
  test("local dual-layer volume follows the viewer with continuous height fade", () => {
    const scene = new THREE.Scene();
    const atmosphere = new AtmosphereSystem(scene, 2.4, SOFT_FOG_DEFAULT_WALL_HEIGHT);
    const dungeon = generateDungeon("FOG-SOFT", { roomTarget: 10 });
    atmosphere.setDungeon(dungeon, getDungeonMood("ash"));

    const mesh = scene.getObjectByName("Soft volumetric ground fog") as THREE.Mesh;
    expect(mesh).toBeDefined();
    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
    const mat = mesh.material as THREE.ShaderMaterial;
    expect(mat.side).toBe(THREE.BackSide);
    expect(mat.depthTest).toBe(false);
    expect(mat.uniforms.uHeight.value).toBe(SOFT_FOG_DEFAULT_WALL_HEIGHT);
    expect(mat.uniforms.uBetaGround.value).toBe(SOFT_FOG_HEIGHT_FALLOFF_GROUND);
    expect(mat.uniforms.uBetaAir.value).toBe(SOFT_FOG_HEIGHT_FALLOFF_AIR);
    expect(mat.uniforms.uMaxDist.value).toBe(SOFT_FOG_MAX_DIST);
    expect(mat.uniforms.uHalfExtent.value).toBe(SOFT_FOG_LOCAL_HALF);
    expect(mat.uniforms.uDensity.value).toBeCloseTo(SOFT_FOG_DENSITY, 5);
    expect(mat.uniforms.uMaxAlpha.value).toBe(SOFT_FOG_MAX_ALPHA);

    const atFloor = dualHeightDensity(0);
    const atEye = dualHeightDensity(1.62);
    const atMid = dualHeightDensity(SOFT_FOG_DEFAULT_WALL_HEIGHT * 0.55);
    const atCeil = dualHeightDensity(SOFT_FOG_DEFAULT_WALL_HEIGHT);
    // Continuous soft ladder: floor > eye > mid > ceiling, never a mid-air cliff.
    expect(atFloor).toBeGreaterThan(atEye);
    expect(atEye).toBeGreaterThan(atMid);
    expect(atMid).toBeGreaterThan(atCeil);
    expect(atEye / atFloor).toBeGreaterThan(0.28);
    expect(atCeil / atFloor).toBeLessThan(0.25);
    expect(atCeil).toBeGreaterThan(0.03);

    atmosphere.update(0.16, { x: 3.5, y: 1.6, z: -2.25 });
    expect(mesh.position.x).toBeCloseTo(3.5, 5);
    expect(mesh.position.z).toBeCloseTo(-2.25, 5);
    expect(mat.uniforms.uBoxCenter.value.x).toBeCloseTo(3.5, 5);
    expect(mat.uniforms.uBoxCenter.value.y).toBeCloseTo(-2.25, 5);
    expect(mat.uniforms.uTime.value).toBeGreaterThan(0);

    atmosphere.dispose();
  });

  test("volume tint is mid haze from mood, not pure bright mist", () => {
    const frost = getDungeonMood("frost");
    const color = fogVolumeColor(frost);
    expect(color.getHex()).not.toBe(frost.mistColor);
    const lum = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
    // Frost mist is authored dark; volume must stay mid-dark, never white.
    expect(lum).toBeGreaterThan(0.04);
    expect(lum).toBeLessThan(0.35);

    const scene = new THREE.Scene();
    const atmosphere = new AtmosphereSystem(scene, 2.4);
    atmosphere.setDungeon(generateDungeon("FOG-TINT", { roomTarget: 8 }), frost);
    const mesh = scene.getObjectByName("Soft volumetric ground fog") as THREE.Mesh;
    const mat = mesh.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uColor.value.getHex()).toBe(color.getHex());
    // Frost volume fog is denser than base SOFT_FOG_DENSITY.
    expect(mat.uniforms.uDensity.value).toBeCloseTo(SOFT_FOG_DENSITY * frost.volumeFogMul, 5);
    atmosphere.dispose();
  });

  test("frost dust opacity is scaled down vs ash", () => {
    const scene = new THREE.Scene();
    const atmosphere = new AtmosphereSystem(scene, 2.4);
    const dungeon = generateDungeon("DUST-MOOD", { roomTarget: 10 });
    atmosphere.setDungeon(dungeon, getDungeonMood("frost"));
    const coarseFrost = scene.getObjectByName("Lit dungeon dust motes") as THREE.Points;
    const frostOpacity = (coarseFrost.material as THREE.ShaderMaterial).uniforms.uOpacity.value;
    atmosphere.setDungeon(dungeon, getDungeonMood("ash"));
    const coarseAsh = scene.getObjectByName("Lit dungeon dust motes") as THREE.Points;
    const ashOpacity = (coarseAsh.material as THREE.ShaderMaterial).uniforms.uOpacity.value;
    expect(frostOpacity).toBeLessThan(ashOpacity);
    atmosphere.dispose();
  });

  test("dust motes vary in size, peak softer, and carry fade phases", () => {
    const scene = new THREE.Scene();
    const atmosphere = new AtmosphereSystem(scene, 2.4);
    atmosphere.setDungeon(generateDungeon("DUST-VIS", { roomTarget: 12 }), getDungeonMood("ash"));

    const coarse = scene.getObjectByName("Lit dungeon dust motes") as THREE.Points;
    const fine = scene.getObjectByName("Fine floating dust") as THREE.Points;
    expect(coarse).toBeDefined();
    expect(fine).toBeDefined();

    const coarseMat = coarse.material as THREE.ShaderMaterial;
    const fineMat = fine.material as THREE.ShaderMaterial;
    expect(coarse.geometry.getAttribute("position").count).toBeGreaterThanOrEqual(DUST_COARSE_MIN);
    expect(fine.geometry.getAttribute("position").count).toBeGreaterThanOrEqual(DUST_FINE_MIN);
    expect(coarseMat.uniforms.uOpacity.value).toBe(DUST_COARSE_OPACITY);
    expect(fineMat.uniforms.uOpacity.value).toBe(DUST_FINE_OPACITY);
    expect(DUST_COARSE_OPACITY).toBeGreaterThanOrEqual(0.44);
    expect(DUST_COARSE_OPACITY).toBeLessThan(0.55);
    expect(DUST_FINE_OPACITY).toBeGreaterThanOrEqual(0.3);
    expect(DUST_FINE_OPACITY).toBeLessThan(0.45);

    const sizes = coarse.geometry.getAttribute("aSize") as THREE.BufferAttribute;
    const phases = coarse.geometry.getAttribute("aPhase") as THREE.BufferAttribute;
    expect(sizes).toBeDefined();
    expect(phases).toBeDefined();
    let minSize = Number.POSITIVE_INFINITY;
    let maxSize = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < sizes.count; i += 1) {
      const s = sizes.getX(i);
      minSize = Math.min(minSize, s);
      maxSize = Math.max(maxSize, s);
      expect(s).toBeGreaterThanOrEqual(DUST_COARSE_SIZE_MIN - 1e-6);
      expect(s).toBeLessThanOrEqual(DUST_COARSE_SIZE_MAX + 1e-6);
    }
    expect(maxSize).toBeGreaterThan(minSize);
    expect(maxSize - minSize).toBeGreaterThan((DUST_COARSE_SIZE_MAX - DUST_COARSE_SIZE_MIN) * 0.25);

    const fineSizes = fine.geometry.getAttribute("aSize") as THREE.BufferAttribute;
    let fineMin = Number.POSITIVE_INFINITY;
    let fineMax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < fineSizes.count; i += 1) {
      const s = fineSizes.getX(i);
      fineMin = Math.min(fineMin, s);
      fineMax = Math.max(fineMax, s);
      expect(s).toBeGreaterThanOrEqual(DUST_FINE_SIZE_MIN - 1e-6);
      expect(s).toBeLessThanOrEqual(DUST_FINE_SIZE_MAX + 1e-6);
    }
    expect(fineMax).toBeGreaterThan(fineMin);

    atmosphere.update(1.25, { x: 0, y: 1.6, z: 0 });
    expect(coarseMat.uniforms.uTime.value).toBeGreaterThan(0);
    expect(atmosphere.stats.motes).toBe(
      coarse.geometry.getAttribute("position").count + fine.geometry.getAttribute("position").count,
    );

    atmosphere.dispose();
  });
});
