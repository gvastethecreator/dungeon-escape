import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import {
  AtmosphereSystem,
  fogVolumeColor,
  SOFT_FOG_DEFAULT_WALL_HEIGHT,
  SOFT_FOG_DENSITY,
  SOFT_FOG_HEIGHT_FALLOFF_AIR,
  SOFT_FOG_HEIGHT_FALLOFF_GROUND,
  SOFT_FOG_LOCAL_HALF,
  SOFT_FOG_MAX_ALPHA,
  SOFT_FOG_MAX_DIST,
} from "../src/systems/AtmosphereSystem";
import { getBiomeParticleProfile } from "../src/systems/BiomeParticleProfile";
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

  test("each dungeon binds the named particle signature for its biome", () => {
    const scene = new THREE.Scene();
    const atmosphere = new AtmosphereSystem(scene, 2.4);
    const dungeon = generateDungeon("DUST-MOOD", { roomTarget: 10 });
    atmosphere.setDungeon(dungeon, getDungeonMood("frost"));
    const frostProfile = getBiomeParticleProfile("frost");
    const frost = scene.getObjectByName(
      `Biome particles: ${frostProfile.signature.name}`,
    ) as THREE.Points;
    expect(frost).toBeDefined();
    const frostMaterial = frost.material as THREE.ShaderMaterial;
    expect(frostMaterial.uniforms.uShape.value).toBeGreaterThanOrEqual(0);
    expect(frostMaterial.uniforms.uOpacity.value).toBe(frostProfile.signature.opacity);

    atmosphere.setDungeon(dungeon, getDungeonMood("ash"));
    const ashProfile = getBiomeParticleProfile("ash");
    const ash = scene.getObjectByName(
      `Biome particles: ${ashProfile.signature.name}`,
    ) as THREE.Points;
    expect(ash).toBeDefined();
    expect(ash.name).not.toBe(frost.name);
    atmosphere.dispose();
  });

  test("ceiling precipitation spawns near the slab and uses drip motion", () => {
    const scene = new THREE.Scene();
    const atmosphere = new AtmosphereSystem(scene, 2.4, SOFT_FOG_DEFAULT_WALL_HEIGHT);
    atmosphere.setDungeon(generateDungeon("CEIL-DRIP", { roomTarget: 10 }), getDungeonMood("grim"));
    const profile = getBiomeParticleProfile("grim");
    const ceiling = scene.getObjectByName(
      `Biome particles: ${profile.ceiling.name}`,
    ) as THREE.Points;
    expect(ceiling).toBeDefined();
    const material = ceiling.material as THREE.ShaderMaterial;
    expect(material.uniforms.uMotion.value).toBe(8);
    expect(material.uniforms.uOpacity.value).toBe(profile.ceiling.opacity);
    const positions = ceiling.geometry.getAttribute("position") as THREE.BufferAttribute;
    expect(positions.count).toBeGreaterThanOrEqual(profile.ceiling.minCount);
    let minY = Number.POSITIVE_INFINITY;
    for (let i = 0; i < positions.count; i += 1) minY = Math.min(minY, positions.getY(i));
    // Seed near the ceiling so fallers read as slab debris, not floor dust.
    expect(minY).toBeGreaterThan(SOFT_FOG_DEFAULT_WALL_HEIGHT * 0.85);
    atmosphere.dispose();
  });

  test("biome event pulse intensifies ceiling fallers without screen overlays", () => {
    const scene = new THREE.Scene();
    const atmosphere = new AtmosphereSystem(scene, 2.4, SOFT_FOG_DEFAULT_WALL_HEIGHT);
    atmosphere.setDungeon(
      generateDungeon("CEIL-PULSE", { roomTarget: 10 }),
      getDungeonMood("ancient"),
    );
    const profile = getBiomeParticleProfile("ancient");
    const ceiling = scene.getObjectByName(
      `Biome particles: ${profile.ceiling.name}`,
    ) as THREE.Points;
    const material = ceiling.material as THREE.ShaderMaterial;
    const baseOpacity = material.uniforms.uOpacity.value as number;
    const baseSpeed = material.uniforms.uSpeed.value as number;

    atmosphere.setEventPulse(1);
    expect(material.uniforms.uOpacity.value).toBeGreaterThan(baseOpacity);
    expect(material.uniforms.uSpeed.value).toBeGreaterThan(baseSpeed);
    expect(material.uniforms.uOpacity.value).toBeLessThanOrEqual(1);

    atmosphere.setEventPulse(0);
    expect(material.uniforms.uOpacity.value).toBeCloseTo(baseOpacity, 5);
    expect(material.uniforms.uSpeed.value).toBeCloseTo(baseSpeed, 5);
    atmosphere.dispose();
  });

  test("particle layers vary size and carry phase, tint, time, and viewer wake", () => {
    const scene = new THREE.Scene();
    const atmosphere = new AtmosphereSystem(scene, 2.4);
    atmosphere.setDungeon(generateDungeon("DUST-VIS", { roomTarget: 12 }), getDungeonMood("ash"));
    const profile = getBiomeParticleProfile("ash");

    const support = scene.getObjectByName(
      `Biome particles: ${profile.support.name}`,
    ) as THREE.Points;
    const signature = scene.getObjectByName(
      `Biome particles: ${profile.signature.name}`,
    ) as THREE.Points;
    expect(support).toBeDefined();
    expect(signature).toBeDefined();

    const supportMat = support.material as THREE.ShaderMaterial;
    const signatureMat = signature.material as THREE.ShaderMaterial;
    expect(support.geometry.getAttribute("position").count).toBeGreaterThanOrEqual(
      profile.support.minCount,
    );
    expect(signature.geometry.getAttribute("position").count).toBeGreaterThanOrEqual(
      profile.signature.minCount,
    );
    expect(supportMat.uniforms.uOpacity.value).toBe(profile.support.opacity);
    expect(signatureMat.uniforms.uOpacity.value).toBe(profile.signature.opacity);

    const sizes = support.geometry.getAttribute("aSize") as THREE.BufferAttribute;
    const phases = support.geometry.getAttribute("aPhase") as THREE.BufferAttribute;
    const tints = support.geometry.getAttribute("aTint") as THREE.BufferAttribute;
    expect(sizes).toBeDefined();
    expect(phases).toBeDefined();
    expect(tints).toBeDefined();
    let minSize = Number.POSITIVE_INFINITY;
    let maxSize = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < sizes.count; i += 1) {
      const s = sizes.getX(i);
      minSize = Math.min(minSize, s);
      maxSize = Math.max(maxSize, s);
      expect(s).toBeGreaterThanOrEqual(profile.support.sizeMin - 1e-6);
      expect(s).toBeLessThanOrEqual(profile.support.sizeMax + 1e-6);
    }
    expect(maxSize).toBeGreaterThan(minSize);
    expect(maxSize - minSize).toBeGreaterThan(
      (profile.support.sizeMax - profile.support.sizeMin) * 0.25,
    );

    const fineSizes = signature.geometry.getAttribute("aSize") as THREE.BufferAttribute;
    let fineMin = Number.POSITIVE_INFINITY;
    let fineMax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < fineSizes.count; i += 1) {
      const s = fineSizes.getX(i);
      fineMin = Math.min(fineMin, s);
      fineMax = Math.max(fineMax, s);
      expect(s).toBeGreaterThanOrEqual(profile.signature.sizeMin - 1e-6);
      expect(s).toBeLessThanOrEqual(profile.signature.sizeMax + 1e-6);
    }
    expect(fineMax).toBeGreaterThan(fineMin);

    const ceiling = scene.getObjectByName(
      `Biome particles: ${profile.ceiling.name}`,
    ) as THREE.Points;
    expect(ceiling).toBeDefined();

    atmosphere.update(1.25, { x: 3, y: 1.6, z: -2 });
    expect(supportMat.uniforms.uTime.value).toBeGreaterThan(0);
    expect(supportMat.uniforms.uViewer.value.x).toBe(3);
    expect(supportMat.uniforms.uViewer.value.z).toBe(-2);
    expect(atmosphere.stats.motes).toBe(
      support.geometry.getAttribute("position").count +
        signature.geometry.getAttribute("position").count +
        ceiling.geometry.getAttribute("position").count,
    );

    atmosphere.dispose();
  });

  test("short player movement never reseeds or teleports the world particle field", () => {
    const scene = new THREE.Scene();
    const atmosphere = new AtmosphereSystem(scene, 2.4);
    atmosphere.setDungeon(
      generateDungeon("DUST-STABLE", { roomTarget: 14 }),
      getDungeonMood("sunken"),
    );
    const profile = getBiomeParticleProfile("sunken");
    const support = scene.getObjectByName(
      `Biome particles: ${profile.support.name}`,
    ) as THREE.Points;
    const signature = scene.getObjectByName(
      `Biome particles: ${profile.signature.name}`,
    ) as THREE.Points;
    const supportBefore = Array.from(
      (support.geometry.getAttribute("position") as THREE.BufferAttribute).array,
    );
    const signatureBefore = Array.from(
      (signature.geometry.getAttribute("position") as THREE.BufferAttribute).array,
    );

    atmosphere.update(0.4, { x: 0, y: 1.6, z: 0 });
    atmosphere.update(0.4, { x: 3.4, y: 1.6, z: -1.8 });
    atmosphere.update(0.4, { x: 6.8, y: 1.6, z: -3.6 });

    expect(support.position.toArray()).toEqual([0, 0, 0]);
    expect(signature.position.toArray()).toEqual([0, 0, 0]);
    expect(
      Array.from((support.geometry.getAttribute("position") as THREE.BufferAttribute).array),
    ).toEqual(supportBefore);
    expect(
      Array.from((signature.geometry.getAttribute("position") as THREE.BufferAttribute).array),
    ).toEqual(signatureBefore);
    expect((support.material as THREE.ShaderMaterial).uniforms.uViewer.value.x).toBeCloseTo(6.8);
    expect((signature.material as THREE.ShaderMaterial).uniforms.uViewer.value.z).toBeCloseTo(-3.6);

    atmosphere.dispose();
  });
});
