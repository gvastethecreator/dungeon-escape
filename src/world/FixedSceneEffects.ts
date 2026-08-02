import * as THREE from "three";

import type { DungeonData } from "../dungeon/types";
import {
  BIOME_FLOOR_PROP_FADE_FAR,
  biomeSpriteFloorDistanceFade,
  clampBiomeSpriteYaw,
} from "./BiomeSpriteDecorKit";
import { FireLosScheduler } from "./FireLosScheduler";
import { hasGridLineOfSight } from "./LightOcclusion";
import { tickLiquidSections, type LiquidSurface } from "./LiquidSectionKit";
import { tickNoiseFlame } from "./ProceduralFlameVfx";
import type { StaticFireEffect, StaticFloorBiomeSprite } from "./StaticDungeonScene";
import { computeTorchLod } from "./TorchLod";
import { tickVolumetricBeamTime } from "./VolumetricBeam";

export interface FixedSceneEffectsFrame {
  delta: number;
  elapsed: number;
  viewerPosition?: THREE.Vector3Like;
  dungeon: DungeonData | null;
  tileSize: number;
  floorSprites: readonly StaticFloorBiomeSprite[];
  fires: readonly StaticFireEffect[];
  portalBeam: THREE.Mesh | null;
  stoneBeams: readonly THREE.Mesh[];
  ambientBeams: readonly THREE.Mesh[];
  liquidSurfaces: readonly LiquidSurface[] | null;
}

/** Advances decorative world actors that do not own gameplay state. */
/** Beyond this range, billboard yaw updates run on a staggered cadence. */
const BIOME_SPRITE_FULL_UPDATE_DISTANCE = 14;
const BIOME_SPRITE_STAGGER = 3;

export class FixedSceneEffects {
  private readonly flamePosition = new THREE.Vector3();
  private readonly flameTarget = new THREE.Vector3();
  private readonly fireLosScheduler = new FireLosScheduler();
  private fireDistances = new Float32Array(0);
  private floorSpritePhase = 0;

  update(frame: FixedSceneEffectsFrame): void {
    if (frame.viewerPosition) this.updateFloorSprites(frame.floorSprites, frame.viewerPosition);
    this.updateFireLineOfSight(frame);
    for (let index = 0; index < frame.fires.length; index += 1) {
      const effect = frame.fires[index];
      if (effect) this.updateFire(effect, frame, this.fireDistances[index] ?? 0);
    }

    if (frame.portalBeam) tickVolumetricBeamTime(frame.portalBeam, frame.elapsed);
    for (const beam of frame.stoneBeams) tickVolumetricBeamTime(beam, frame.elapsed);
    for (const beam of frame.ambientBeams) tickVolumetricBeamTime(beam, frame.elapsed);
    if (frame.liquidSurfaces) tickLiquidSections(frame.liquidSurfaces, frame.elapsed);
  }

  private updateFireLineOfSight(frame: FixedSceneEffectsFrame): void {
    const viewer = frame.viewerPosition;
    if (this.fireDistances.length < frame.fires.length) {
      this.fireDistances = new Float32Array(frame.fires.length);
    }
    for (let index = 0; index < frame.fires.length; index += 1) {
      const effect = frame.fires[index];
      if (!effect) continue;
      const distance = viewer
        ? Math.hypot(effect.root.position.x - viewer.x, effect.root.position.z - viewer.z)
        : 0;
      this.fireDistances[index] = distance;
      if (!viewer || !frame.dungeon) effect.losOpen = true;
      else if (distance > effect.cutoffDistance + 7) effect.losOpen = false;
    }
    if (!viewer || !frame.dungeon) return;
    const selected = this.fireLosScheduler.select(frame.fires, this.fireDistances, frame.delta);
    for (const index of selected) {
      const effect = frame.fires[index];
      if (!effect) continue;
      effect.losOpen = hasGridLineOfSight(
        frame.dungeon,
        viewer,
        effect.root.position,
        frame.tileSize,
      );
    }
  }

  private updateFloorSprites(
    floorSprites: readonly StaticFloorBiomeSprite[],
    player: THREE.Vector3Like,
  ): void {
    this.floorSpritePhase = (this.floorSpritePhase + 1) % BIOME_SPRITE_STAGGER;
    for (let index = 0; index < floorSprites.length; index += 1) {
      const prop = floorSprites[index];
      if (!prop) continue;
      const deltaX = player.x - prop.x;
      const deltaZ = player.z - prop.z;
      const distance = Math.hypot(deltaX, deltaZ);
      // Floor cards finish their fade by FADE_FAR. Past that band opacity is stable.
      const fadeStable = distance >= BIOME_FLOOR_PROP_FADE_FAR;
      const needsFullUpdate =
        distance <= BIOME_SPRITE_FULL_UPDATE_DISTANCE ||
        index % BIOME_SPRITE_STAGGER === this.floorSpritePhase;
      // Far, fully faded sprites only refresh on the staggered phase.
      if (!needsFullUpdate && fadeStable && prop.mesh.userData.distanceFade === 1) {
        continue;
      }

      const fade = biomeSpriteFloorDistanceFade(distance);
      prop.material.opacity = prop.baseOpacity * fade;
      prop.mesh.visible = fade > 0.001;
      prop.mesh.userData.distanceFade = fade;
      if (prop.placement === "floor-decal" || Math.abs(deltaX) + Math.abs(deltaZ) < 0.0001) {
        continue;
      }
      const targetYaw = Math.atan2(deltaX, deltaZ);
      prop.mesh.rotation.y =
        prop.placement === "corner-standing"
          ? clampBiomeSpriteYaw(prop.baseYaw, targetYaw)
          : targetYaw;
    }
  }

  private updateFire(
    effect: StaticFireEffect,
    frame: FixedSceneEffectsFrame,
    distance: number,
  ): void {
    const viewer = frame.viewerPosition;
    const lod = computeTorchLod(distance, effect.cutoffDistance);
    effect.root.visible = lod.rootVisible;
    effect.runtimeFixture?.setVisible(lod.rootVisible);
    const fxFactor = effect.losOpen ? Math.max(lod.lightFactor, effect.currentLightFactor) : 0;
    const showFlame = fxFactor > 0.02;
    const showHalo = fxFactor > 0.08 && distance < Math.min(15, effect.cutoffDistance);
    effect.flame.visible = showFlame;
    for (const detail of effect.flameDetails) detail.visible = showFlame;
    const fade = THREE.MathUtils.clamp(fxFactor, 0, 1);

    for (const halo of effect.halos) {
      halo.visible = showHalo;
      if (!(halo instanceof THREE.Mesh)) continue;
      const material = halo.material;
      if (material instanceof THREE.ShaderMaterial && material.uniforms.uStrength) {
        const baseStrength =
          (halo.userData.baseStrength as number | undefined) ??
          (material.uniforms.uStrength.value as number);
        if (halo.userData.baseStrength === undefined) halo.userData.baseStrength = baseStrength;
        material.uniforms.uStrength.value = baseStrength * fade;
        tickVolumetricBeamTime(halo, frame.elapsed + effect.phase);
        continue;
      }
      if (material && !Array.isArray(material) && "opacity" in material) {
        const baseOpacity =
          (halo.userData.baseOpacity as number | undefined) ??
          (material as THREE.MeshBasicMaterial).opacity;
        if (halo.userData.baseOpacity === undefined) halo.userData.baseOpacity = baseOpacity;
        (material as THREE.MeshBasicMaterial).opacity = baseOpacity * fade;
      }
    }

    const pulse =
      0.86 +
      Math.sin(frame.elapsed * 9 + effect.phase) *
        Math.sin(frame.elapsed * 4.7 + effect.phase * 1.7) *
        0.14;
    const flameMaterials = Array.isArray(effect.flame.material)
      ? effect.flame.material
      : [effect.flame.material];
    const procedural = flameMaterials.some((material) =>
      tickNoiseFlame(material, frame.elapsed, fade),
    );
    if (procedural) {
      if (viewer) {
        effect.flame.getWorldPosition(this.flamePosition);
        this.flameTarget.set(viewer.x, this.flamePosition.y, viewer.z);
        effect.flame.lookAt(this.flameTarget);
      }
      effect.flame.scale.y = effect.baseFlameScaleY;
      effect.flame.position.y = effect.baseY;
    } else {
      effect.flame.scale.y = effect.baseFlameScaleY * (0.92 + pulse * 0.08);
      effect.flame.position.y = effect.baseY + Math.sin(frame.elapsed * 7 + effect.phase) * 0.018;
    }

    if (!effect.light) return;
    const targetFactor = effect.losOpen ? lod.lightFactor : 0;
    const lambda = targetFactor > effect.currentLightFactor ? 3.6 : 10;
    effect.currentLightFactor = THREE.MathUtils.damp(
      effect.currentLightFactor,
      targetFactor,
      lambda,
      frame.delta,
    );
    effect.light.intensity = effect.baseIntensity * pulse * effect.currentLightFactor;
  }
}
