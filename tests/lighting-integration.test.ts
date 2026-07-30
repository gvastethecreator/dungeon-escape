import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  FIRE_LIGHT_TUNING,
  INTERIOR_LIGHT_TUNING,
  MATERIAL_FILL_TUNING,
  MAX_DYNAMIC_FIRE_LIGHTS,
  PLAYER_LANTERN_TUNING,
  resolveDungeonExposure,
  resolveInteriorRimColor,
  resolvePlayerLanternColor,
} from "../src/systems/LightTuning";
import { getDungeonMood, listDungeonMoodIds } from "../src/systems/DungeonMood";
import { LightingRig } from "../src/systems/LightingRig";
import { FLOOR, WALL } from "../src/dungeon/generateDungeon";
import { gridToWorld } from "../src/dungeon/gridCollision";
import type { DungeonData } from "../src/dungeon/types";
import {
  createEnemyBillboardMaterial,
  createEnemyContactShadowMaterial,
  enemyOpaqueFeetY,
  resolveEnemyBiomeMaterialPalette,
  resolveEnemyContactShadowLayout,
  setEnemyBillboardFrame,
} from "../src/world/EnemyBillboardMaterial";
import {
  ENEMY_ARCHETYPES,
  enemyCeilingY,
  enemyGroundY,
  getEnemySpriteRenderMetrics,
  isLowProfileEnemy,
} from "../src/world/EnemyArchetypes";
import { ENEMY_ANIMATIONS } from "../src/world/EnemySpriteAtlas";
import { hasGridLineOfSight } from "../src/world/LightOcclusion";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { computeTorchLod } from "../src/world/TorchLod";
import { createWallTorch } from "../src/world/WallTorchFactory";
import { createVolumetricBeam } from "../src/world/VolumetricBeam";
import { biomeTintedLightColor } from "../src/world/StaticDungeonScene";

function colorDistance(first: THREE.Color, second: THREE.Color): number {
  return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);
}

describe("integrated dungeon lighting", () => {
  test("player lantern is bright nearby and falls off before the next room", () => {
    expect(PLAYER_LANTERN_TUNING.intensity).toBeGreaterThanOrEqual(112);
    expect(PLAYER_LANTERN_TUNING.intensity).toBeLessThanOrEqual(124);
    expect(PLAYER_LANTERN_TUNING.range).toBeGreaterThanOrEqual(15);
    expect(PLAYER_LANTERN_TUNING.range).toBeLessThanOrEqual(17);
    expect(PLAYER_LANTERN_TUNING.decay).toBeGreaterThanOrEqual(1.95);
    expect(PLAYER_LANTERN_TUNING.decay).toBeLessThanOrEqual(2.05);
    expect(PLAYER_LANTERN_TUNING.backwardOffset).toBeGreaterThanOrEqual(0.75);
    expect(PLAYER_LANTERN_TUNING.backwardOffset).toBeLessThanOrEqual(1);
    const nearResponse = PLAYER_LANTERN_TUNING.intensity / Math.pow(2, PLAYER_LANTERN_TUNING.decay);
    const farResponse = PLAYER_LANTERN_TUNING.intensity / Math.pow(12, PLAYER_LANTERN_TUNING.decay);
    expect(nearResponse).toBeGreaterThanOrEqual(28);
    expect(farResponse).toBeLessThanOrEqual(0.85);
    expect(nearResponse / farResponse).toBeGreaterThan(32);
  });

  test("player lantern stays behind the view to cap close-wall highlights", () => {
    const scene = new THREE.Scene();
    const rig = new LightingRig(scene);
    const player = new THREE.Vector3(2, 1.62, 4);
    const forward = new THREE.Vector3(0, 0, -1);
    rig.update(1, player, null, forward);
    const light = rig.getLanternPosition();
    expect(light.z).toBeGreaterThan(player.z);
    expect(light.z - player.z).toBeCloseTo(PLAYER_LANTERN_TUNING.backwardOffset, 2);
    expect(light.y).toBeGreaterThan(player.y);
    rig.dispose();
  });

  test("default exposure keeps floor edges readable in the darkest authored mood", () => {
    const frost = resolveDungeonExposure(0.7, getDungeonMood("frost").exposureBias);
    const ash = resolveDungeonExposure(0.7, getDungeonMood("ash").exposureBias);
    expect(frost).toBeGreaterThanOrEqual(0.88);
    expect(ash).toBeGreaterThan(frost);
    expect(ash).toBeLessThan(1.15);
  });

  test("torch physical range and LOD cutoff share one boundary", () => {
    const torch = createWallTorch(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), true);
    expect(torch.light?.distance).toBe(FIRE_LIGHT_TUNING.wallRange);
    expect(FIRE_LIGHT_TUNING.wallRange).toBe(FIRE_LIGHT_TUNING.cutoffLodDistance);
    expect(computeTorchLod(FIRE_LIGHT_TUNING.fullLodDistance).lightFactor).toBe(1);
    expect(computeTorchLod(FIRE_LIGHT_TUNING.cutoffLodDistance).lightFactor).toBe(0);
    expect(
      computeTorchLod(FIRE_LIGHT_TUNING.candleRange, FIRE_LIGHT_TUNING.candleRange).flameVisible,
    ).toBe(false);
    expect(
      computeTorchLod(FIRE_LIGHT_TUNING.brazierRange, FIRE_LIGHT_TUNING.brazierRange).lightFactor,
    ).toBe(0);
  });

  test("fire lighting keeps a small stable point-light shader budget", async () => {
    expect(MAX_DYNAMIC_FIRE_LIGHTS).toBeGreaterThanOrEqual(6);
    expect(MAX_DYNAMIC_FIRE_LIGHTS).toBeLessThanOrEqual(12);
    const source = await Bun.file(
      new URL("../src/world/StaticDungeonScene.ts", import.meta.url),
    ).text();
    expect(source).toContain("detachFireLight");
    expect(source).not.toContain("effect.light.visible");
  });

  test("backrooms replaces fire with silent fluorescent fixtures on the same light budget", async () => {
    const source = await Bun.file(
      new URL("../src/world/StaticDungeonScene.ts", import.meta.url),
    ).text();
    expect(source).toContain('this.activeMood.id === "backrooms"');
    expect(source).toContain("private addBackroomsLightProps");
    expect(source).toContain("audio: false");
    expect(source).toContain("Math.min(MAX_DYNAMIC_FIRE_LIGHTS, anchors.length)");
  });

  test("every mood keeps interior IBL intensity low and fog usable", () => {
    for (const id of listDungeonMoodIds()) {
      const mood = getDungeonMood(id);
      expect(mood.environmentIntensity).toBeGreaterThan(0.08);
      expect(mood.environmentIntensity).toBeLessThanOrEqual(0.3);
      expect(mood.fogDensity).toBeGreaterThanOrEqual(0.015);
      expect(mood.fogDensity).toBeLessThan(0.06);
      expect(mood.albedoGain).toBeGreaterThan(0.3);
      expect(mood.albedoGain).toBeLessThanOrEqual(1.2);
      expect(mood.bounceScale).toBeGreaterThanOrEqual(0.6);
      expect(mood.bounceScale).toBeLessThanOrEqual(0.75);
      expect(mood.fogMul).toBeGreaterThanOrEqual(0.85);
      expect(mood.fogMul).toBeLessThanOrEqual(1.1);
      expect(mood.volumeFogMul).toBeGreaterThan(0.5);
      expect(mood.playerLightScale).toBeGreaterThanOrEqual(0.8);
      expect(mood.playerLightScale).toBeLessThanOrEqual(1.2);
      expect(mood.dustOpacityScale).toBeGreaterThan(0.3);
      expect(mood.dustOpacityScale).toBeLessThanOrEqual(1.1);
    }
  });

  test("all biome light signatures stay distinct", () => {
    const signatures = listDungeonMoodIds().map((id) => {
      const mood = getDungeonMood(id);
      return [
        mood.hemiSky,
        mood.keyColor,
        mood.lanternColor,
        mood.fogDensity * mood.fogMul,
        mood.hemiIntensity * mood.bounceScale,
        mood.keyIntensity * mood.keyScale,
        mood.playerLightScale,
      ].join(":");
    });
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  test("practical emitters resolve a distinct tint per biome", () => {
    const base = 0xd18b4c;
    const frost = biomeTintedLightColor(base, getDungeonMood("frost"));
    const molten = biomeTintedLightColor(base, getDungeonMood("molten"));
    const verdant = biomeTintedLightColor(base, getDungeonMood("verdant"));
    expect(new Set([frost, molten, verdant]).size).toBe(3);
    expect(frost).not.toBe(base);
  });

  test("player fill keeps each biome hue while revealing material color", () => {
    const ids = listDungeonMoodIds();
    const resolved = ids.map((id) => resolvePlayerLanternColor(getDungeonMood(id).lanternColor));
    expect(new Set(resolved).size).toBe(ids.length);

    const sunken = new THREE.Color(
      resolvePlayerLanternColor(getDungeonMood("sunken").lanternColor),
    );
    const authored = new THREE.Color(getDungeonMood("sunken").lanternColor);
    const resolvedHsl = { h: 0, s: 0, l: 0 };
    const authoredHsl = { h: 0, s: 0, l: 0 };
    sunken.getHSL(resolvedHsl);
    authored.getHSL(authoredHsl);
    expect(sunken.r).toBeGreaterThan(authored.r);
    expect(resolvedHsl.s).toBeLessThan(authoredHsl.s);
    expect(resolvedHsl.l).toBeGreaterThan(authoredHsl.l);
  });

  test("side fill keeps biome identity while lifting dark palette swatches", () => {
    expect(INTERIOR_LIGHT_TUNING.rimScale).toBeGreaterThanOrEqual(50);
    expect(INTERIOR_LIGHT_TUNING.rimScale).toBeLessThanOrEqual(70);
    const ids = listDungeonMoodIds();
    const resolved = ids.map((id) => resolveInteriorRimColor(getDungeonMood(id).rimColor));
    expect(new Set(resolved).size).toBe(ids.length);

    const authored = new THREE.Color(getDungeonMood("frost").rimColor);
    const fill = new THREE.Color(resolveInteriorRimColor(getDungeonMood("frost").rimColor));
    expect(fill.r + fill.g + fill.b).toBeGreaterThan(authored.r + authored.g + authored.b);
  });

  test("neutral room bounce stays low while keeping albedo maps visible", () => {
    expect(MATERIAL_FILL_TUNING.intensity).toBeGreaterThanOrEqual(1);
    expect(MATERIAL_FILL_TUNING.intensity).toBeLessThanOrEqual(1.1);

    for (const id of listDungeonMoodIds()) {
      const fill =
        MATERIAL_FILL_TUNING.intensity *
        getDungeonMood(id).bounceScale *
        INTERIOR_LIGHT_TUNING.bounceScale;
      expect(fill).toBeGreaterThanOrEqual(0.62);
      expect(fill).toBeLessThanOrEqual(0.82);
    }
  });

  test("frost is darker than ash: lower bounce, key, IBL, exposure and albedo", () => {
    const frost = getDungeonMood("frost");
    const ash = getDungeonMood("ash");
    expect(frost.albedoGain).toBeLessThan(ash.albedoGain);
    expect(frost.exposureBias).toBeLessThan(ash.exposureBias);
    expect(frost.environmentIntensity * frost.iblScale).toBeLessThan(
      ash.environmentIntensity * ash.iblScale,
    );
    expect(frost.hemiIntensity * frost.bounceScale).toBeLessThan(
      ash.hemiIntensity * ash.bounceScale,
    );
    expect(frost.keyIntensity * frost.keyScale).toBeLessThan(ash.keyIntensity * ash.keyScale);
    expect(frost.fogDensity * frost.fogMul).toBeGreaterThan(ash.fogDensity * ash.fogMul);
    expect(frost.volumeFogMul).toBeGreaterThan(ash.volumeFogMul);
  });

  test("LightingRig applyMood uses mood response scales for bounce and fog", () => {
    const scene = new THREE.Scene();
    const rig = new LightingRig(scene);
    const mood = getDungeonMood("ash");
    rig.applyMood(mood);
    expect(scene.fog).toBe(rig.fog);
    expect(rig.fog.density).toBeCloseTo(
      mood.fogDensity * mood.fogMul * INTERIOR_LIGHT_TUNING.fogScale,
      5,
    );
    expect(rig.getBounceIntensity()).toBeCloseTo(
      mood.hemiIntensity * mood.bounceScale * INTERIOR_LIGHT_TUNING.bounceScale,
      5,
    );
    expect(rig.getKeyIntensity()).toBeCloseTo(
      mood.keyIntensity * mood.keyScale * INTERIOR_LIGHT_TUNING.keyScale,
      5,
    );
    expect(rig.getRimIntensity()).toBeCloseTo(
      mood.rimIntensity * mood.rimScale * INTERIOR_LIGHT_TUNING.rimScale,
      5,
    );
    expect(rig.getRimColorHex()).toBe(resolveInteriorRimColor(mood.rimColor));
    expect(rig.getMaterialFillIntensity()).toBeCloseTo(
      MATERIAL_FILL_TUNING.intensity * mood.bounceScale * INTERIOR_LIGHT_TUNING.bounceScale,
      5,
    );
    expect(rig.getLanternBaseIntensity()).toBeCloseTo(
      PLAYER_LANTERN_TUNING.intensity * mood.playerLightScale,
      5,
    );
    expect(rig.getMood().id).toBe("ash");

    const frost = getDungeonMood("frost");
    rig.applyMood(frost);
    expect(rig.fog.density).toBeCloseTo(
      frost.fogDensity * frost.fogMul * INTERIOR_LIGHT_TUNING.fogScale,
      5,
    );
    expect(rig.getBounceIntensity()).toBeLessThan(mood.hemiIntensity * mood.bounceScale);
    rig.dispose();
  });

  test("prop materials weight metal IBL higher than stone", () => {
    const materials = createDungeonMaterials();
    expect(materials.iron.envMapIntensity).toBeGreaterThan(materials.stone.envMapIntensity);
    expect(materials.brass.envMapIntensity).toBeGreaterThan(materials.wood.envMapIntensity);
    expect(materials.iron.metalness).toBeGreaterThan(0.35);
  });

  test("world-space volumetric beam keeps the authored signal contract", () => {
    const beam = createVolumetricBeam(0xc88a51, 3, 0.7, 0.1);
    expect(beam.name).toBe("World-space volumetric light shaft");
    expect(beam.material).toBeInstanceOf(THREE.ShaderMaterial);
    const mat = beam.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uStrength.value).toBeCloseTo(0.1);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.toneMapped).toBe(false);
    expect(mat.depthTest).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.fragmentShader).toContain("valueNoise3");
    expect(mat.fragmentShader).not.toContain("gl_FragCoord");
    expect(mat.vertexShader).toContain("vWorldPos");
    expect(beam.userData.volumetricSpace).toBe("world");
    expect(beam.userData.screenSpace).toBe(false);
  });

  test("ambient shafts opt into scene fog, tone mapping, and normal blending", () => {
    const beam = createVolumetricBeam(0xc8c0b0, 4.2, 0.8, 0.1, {
      role: "ambient",
      blending: THREE.NormalBlending,
      fog: true,
      toneMapped: true,
    });
    const mat = beam.material as THREE.ShaderMaterial;
    expect(mat.blending).toBe(THREE.NormalBlending);
    expect(mat.fog).toBe(true);
    expect(mat.toneMapped).toBe(true);
    expect(beam.userData.beamRole).toBe("ambient");
    expect(beam.userData.sourceRadius).toBeGreaterThan(0.04);
    expect(beam.geometry.getAttribute("position").count).toBe(189);
  });

  test("wall torch keeps spherical halos and no forward light cone", () => {
    const torch = createWallTorch(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), true);
    expect(torch.root.getObjectsByProperty("name", "Wall torch spherical light halo")).toHaveLength(
      2,
    );
    expect(torch.root.getObjectByName("Wall torch light volume")).toBeUndefined();
  });

  test("enemy contact shadows shrink with elevation and stay firm on the floor", () => {
    const grounded = resolveEnemyContactShadowLayout({
      bodyWidth: 1.2,
      lowProfile: true,
      feetY: 0.02,
      visibility: 1,
    });
    const hovering = resolveEnemyContactShadowLayout({
      bodyWidth: 1.2,
      lowProfile: true,
      feetY: 0.9,
      visibility: 1,
    });
    const ceiling = resolveEnemyContactShadowLayout({
      bodyWidth: 0.9,
      lowProfile: false,
      feetY: 3.6,
      visibility: 1,
    });
    const phased = resolveEnemyContactShadowLayout({
      bodyWidth: 1.2,
      lowProfile: true,
      feetY: 0.02,
      visibility: 0,
    });
    expect(grounded.width).toBeGreaterThan(hovering.width);
    expect(hovering.width).toBeGreaterThan(ceiling.width);
    expect(grounded.depth).toBeLessThan(grounded.width);
    expect(grounded.y).toBeGreaterThan(0.02);
    expect(phased.width).toBe(0);
    expect(phased.depth).toBe(0);

    for (const kind of Object.keys(ENEMY_ARCHETYPES) as (keyof typeof ENEMY_ARCHETYPES)[]) {
      const sprite = getEnemySpriteRenderMetrics(kind);
      const y = kind === "imp" ? enemyCeilingY(kind, 4.4) : enemyGroundY(kind);
      const feetY = enemyOpaqueFeetY(y, sprite.planeHeight, sprite.bottomPaddingRatio);
      if (kind === "imp") {
        expect(feetY).toBeGreaterThan(2.5);
      } else if (ENEMY_ARCHETYPES[kind].hoverOffset > 0) {
        expect(feetY).toBeGreaterThan(0.15);
      } else {
        expect(feetY).toBeCloseTo(0.02, 5);
      }
      const layout = resolveEnemyContactShadowLayout({
        bodyWidth: ENEMY_ARCHETYPES[kind].width,
        lowProfile: isLowProfileEnemy(kind),
        feetY,
        visibility: 1,
        spectral: ENEMY_ARCHETYPES[kind].silhouette === "spectral",
      });
      expect(layout.width).toBeGreaterThan(0.05);
    }
  });

  test("enemy sprites use scene lights, tone mapping, depth and a soft contact mask", () => {
    const mood = getDungeonMood("frost");
    const sprite = createEnemyBillboardMaterial(new THREE.Texture(), mood);
    expect(sprite.isMeshStandardMaterial).toBe(true);
    expect(sprite.toneMapped).toBe(true);
    expect(sprite.depthWrite).toBe(true);
    expect(sprite.emissiveIntensity).toBeLessThan(0.2);
    expect(sprite.roughness).toBeGreaterThan(0.9);
    expect(sprite.metalness).toBe(0);
    expect(sprite.userData.enemyBiomeMood).toBe("frost");
    const shader = {
      vertexShader: "#include <common>\n#include <uv_vertex>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <alphatest_fragment>",
      uniforms: {},
    };
    (
      sprite.onBeforeCompile as unknown as (shader: {
        vertexShader: string;
        fragmentShader: string;
      }) => void
    )(shader);
    expect(shader.vertexShader).toContain("attribute float aEnemyVisibility");
    expect(shader.vertexShader).toContain(
      "#include <uv_vertex>\nvMapUv = uEnemyAtlasFrame.xy + vMapUv * uEnemyAtlasFrame.zw;",
    );
    expect(shader.fragmentShader).toContain("diffuseColor.a *= clamp(vEnemyVisibility");
    expect(shader.fragmentShader).toContain("uEnemyFreeze");
    expect(shader.fragmentShader).toContain("enemyCold");
    expect(sprite.userData.enemyFreezeAmount).toEqual({ value: 0 });
    const contact = createEnemyContactShadowMaterial();
    expect((contact.map as THREE.DataTexture).isDataTexture).toBe(true);
    expect(contact.map?.minFilter).toBe(THREE.LinearFilter);
    expect(contact.map?.generateMipmaps).toBe(false);
    expect(contact.depthWrite).toBe(false);
    expect(contact.toneMapped).toBe(false);
    expect(contact.polygonOffset).toBe(true);
    const data = (contact.map as THREE.DataTexture).image.data as Uint8Array;
    expect(data[3]).toBeLessThan(data[(32 * 64 + 32) * 4 + 3]!);
  });

  test("enemy tint follows both biome surfaces and authored lights without crushing albedo", () => {
    for (const id of listDungeonMoodIds()) {
      const palette = resolveEnemyBiomeMaterialPalette(getDungeonMood(id));
      expect(
        Math.min(palette.diffuse.r, palette.diffuse.g, palette.diffuse.b),
      ).toBeGreaterThanOrEqual(0.68);
      expect(Math.max(palette.diffuse.r, palette.diffuse.g, palette.diffuse.b)).toBeLessThanOrEqual(
        1,
      );
      expect(
        Math.max(palette.lowLightFill.r, palette.lowLightFill.g, palette.lowLightFill.b),
      ).toBeCloseTo(0.026, 5);
      expect(palette.tintStrength).toBeGreaterThanOrEqual(0.2);
      expect(palette.tintStrength).toBeLessThanOrEqual(0.3);
    }

    const frost = resolveEnemyBiomeMaterialPalette(getDungeonMood("frost"));
    const molten = resolveEnemyBiomeMaterialPalette(getDungeonMood("molten"));
    expect(frost.diffuse.b).toBeGreaterThan(frost.diffuse.r);
    expect(molten.diffuse.r).toBeGreaterThan(molten.diffuse.b);
    expect(colorDistance(frost.diffuse, molten.diffuse)).toBeGreaterThan(0.08);

    const sharedSurface = {
      id: "ancient" as const,
      surfaceTint: 0xa0a0a0,
      surfaceStrength: 0.5,
    };
    const coldLight = resolveEnemyBiomeMaterialPalette({
      ...sharedSurface,
      keyColor: 0x70a0ff,
      lanternColor: 0x60d8ff,
    });
    const warmLight = resolveEnemyBiomeMaterialPalette({
      ...sharedSurface,
      keyColor: 0xff9a60,
      lanternColor: 0xff6030,
    });
    expect(colorDistance(coldLight.diffuse, warmLight.diffuse)).toBeGreaterThan(0.08);
  });

  test("enemy kinds share one atlas while keeping independent frame uniforms", () => {
    const atlas = new THREE.Texture();
    const mood = getDungeonMood("fungal");
    const first = createEnemyBillboardMaterial(atlas, mood);
    const second = createEnemyBillboardMaterial(atlas, mood);
    const animation = ENEMY_ANIMATIONS.spider;

    setEnemyBillboardFrame(first, animation, 1);
    setEnemyBillboardFrame(second, animation, 3);

    expect(first.map).toBe(atlas);
    expect(second.map).toBe(atlas);
    expect(first.userData.enemyAtlasFrame).not.toEqual(second.userData.enemyAtlasFrame);
  });

  test("grid light occlusion blocks diagonal leaks through touching wall corners", () => {
    const grid = [
      Uint8Array.from([FLOOR, WALL, WALL]),
      Uint8Array.from([WALL, FLOOR, WALL]),
      Uint8Array.from([WALL, WALL, FLOOR]),
    ];
    const dungeon = { width: 3, height: 3, grid } as DungeonData;
    const from = gridToWorld(dungeon, { x: 0, y: 0 }, 2);
    const to = gridToWorld(dungeon, { x: 2, y: 2 }, 2);
    expect(hasGridLineOfSight(dungeon, from, to, 2)).toBe(false);
  });
});
