import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import type { DungeonRenderer } from "./DungeonRenderer";
import { createPmremAdapter } from "./EnvironmentBind";

import {
  INTERIOR_LIGHT_TUNING,
  MATERIAL_FILL_TUNING,
  PLAYER_LANTERN_TUNING,
  resolveInteriorRimColor,
  resolvePlayerLanternColor,
} from "./LightTuning";
import type { DungeonMood } from "./DungeonMood";
import { getDungeonMood, moodColorLuminance } from "./DungeonMood";

const DEFAULT_MOOD = getDungeonMood("ash");

/**
 * Interior light stack: cool bounce (hemi + soft key/rim), warm player
 * lantern as exploration key, FogExp2 for depth. No dynamic shadows —
 * mid-GPU stutter with many torch PointLights.
 *
 * Mood response scales (bounce/key/rim/fog/ibl) come from DungeonMood so
 * bright-albedo biomes (frost) can stay cold without studio wash.
 */
export class LightingRig {
  readonly fog = new THREE.FogExp2(
    DEFAULT_MOOD.fog,
    DEFAULT_MOOD.fogDensity * DEFAULT_MOOD.fogMul * INTERIOR_LIGHT_TUNING.fogScale,
  );
  private readonly hemisphere = new THREE.HemisphereLight(
    DEFAULT_MOOD.hemiSky,
    DEFAULT_MOOD.hemiGround,
    DEFAULT_MOOD.hemiIntensity * DEFAULT_MOOD.bounceScale * INTERIOR_LIGHT_TUNING.bounceScale,
  );
  private readonly key = new THREE.DirectionalLight(
    DEFAULT_MOOD.keyColor,
    DEFAULT_MOOD.keyIntensity * DEFAULT_MOOD.keyScale * INTERIOR_LIGHT_TUNING.keyScale,
  );
  private readonly rim = new THREE.DirectionalLight(
    resolveInteriorRimColor(DEFAULT_MOOD.rimColor),
    DEFAULT_MOOD.rimIntensity * DEFAULT_MOOD.rimScale * INTERIOR_LIGHT_TUNING.rimScale,
  );
  private readonly materialFill = new THREE.AmbientLight(
    MATERIAL_FILL_TUNING.color,
    MATERIAL_FILL_TUNING.intensity * DEFAULT_MOOD.bounceScale * INTERIOR_LIGHT_TUNING.bounceScale,
  );
  private readonly playerFill = new THREE.PointLight(
    PLAYER_LANTERN_TUNING.color,
    PLAYER_LANTERN_TUNING.intensity,
    PLAYER_LANTERN_TUNING.range,
    PLAYER_LANTERN_TUNING.decay,
  );
  private readonly playerBeam = new THREE.SpotLight(
    PLAYER_LANTERN_TUNING.color,
    PLAYER_LANTERN_TUNING.forwardIntensity,
    PLAYER_LANTERN_TUNING.forwardRange,
    PLAYER_LANTERN_TUNING.forwardAngle,
    PLAYER_LANTERN_TUNING.forwardPenumbra,
    PLAYER_LANTERN_TUNING.decay,
  );
  private readonly playerBeamTarget = new THREE.Object3D();
  private readonly target = new THREE.Vector3();
  private readonly beamOrigin = new THREE.Vector3();
  private readonly beamAim = new THREE.Vector3();
  private readonly forwardScratch = new THREE.Vector3(0, 0, -1);
  private mood = DEFAULT_MOOD;
  private baseFogDensity =
    DEFAULT_MOOD.fogDensity * DEFAULT_MOOD.fogMul * INTERIOR_LIGHT_TUNING.fogScale;
  private basePlayerLightIntensity =
    PLAYER_LANTERN_TUNING.intensity * DEFAULT_MOOD.playerLightScale;
  private basePlayerBeamIntensity =
    PLAYER_LANTERN_TUNING.forwardIntensity * DEFAULT_MOOD.playerLightScale;
  private envBound = false;
  private readonly fogScratch = new THREE.Color();
  private readonly mistScratch = new THREE.Color();

  constructor(private readonly scene: THREE.Scene) {
    scene.background = new THREE.Color(DEFAULT_MOOD.background);
    scene.fog = this.fog;
    // Cool high bounce + warm-ish ground so stone reads without a sun disk.
    this.key.position.set(-6, 10, 4);
    this.rim.position.set(8, 5, -9);
    this.playerFill.name = "Player radial exploration lantern";
    this.playerBeam.name = "Player forward exploration beam";
    this.playerBeamTarget.name = "Player forward exploration beam target";
    // Dynamic shadow maps on the player light cause interaction stutter.
    this.playerFill.castShadow = false;
    this.playerBeam.castShadow = false;
    this.playerBeam.target = this.playerBeamTarget;
    scene.add(
      this.hemisphere,
      this.key,
      this.rim,
      this.materialFill,
      this.playerFill,
      this.playerBeam,
      this.playerBeamTarget,
    );
  }

  /**
   * One-shot PMREM from a neutral RoomEnvironment so MeshStandard metals
   * leave flat gray. Safe to call once after the play renderer exists.
   * WebGPU uses the node PMREM adapter; WebGL uses THREE.PMREMGenerator.
   * Failures are reported and ignored so boot can continue without IBL.
   */
  async bindEnvironment(renderer: DungeonRenderer): Promise<void> {
    if (this.envBound) return;
    try {
      const pmrem = await createPmremAdapter(renderer);
      if (!pmrem) return;
      await Promise.resolve(pmrem.compileEquirectangularShader());
      const envScene = new RoomEnvironment();
      // Blur keeps reflections soft (interior grit, not chrome studio).
      // Keep sigma below the PMREM 20-sample ceiling; larger blur logs on every reload.
      const envMap = pmrem.fromScene(envScene, 0.035).texture;
      this.scene.environment = envMap;
      this.scene.environmentIntensity =
        this.mood.environmentIntensity * this.mood.iblScale * INTERIOR_LIGHT_TUNING.iblScale;
      pmrem.dispose();
      this.envBound = true;
    } catch (error) {
      console.warn("Environment bind failed; continuing without IBL", error);
    }
  }

  /**
   * Apply dungeon-wide palette + response scales when a layout is activated.
   * Fog air tint is luminance-capped so bright mist hexes never bleach FogExp2.
   */
  applyMood(mood: DungeonMood): void {
    this.mood = mood;
    this.baseFogDensity = mood.fogDensity * mood.fogMul * INTERIOR_LIGHT_TUNING.fogScale;

    this.fogScratch.setHex(mood.fog);
    this.mistScratch.setHex(mood.mistColor);
    // Bright mist → pull fog color less; dark mist → allow a little air color.
    const mistLum = moodColorLuminance(mood.mistColor);
    const airBlend = THREE.MathUtils.clamp(0.1 - mistLum * 0.07, 0.02, 0.09);
    this.fog.color.copy(this.fogScratch).lerp(this.mistScratch, airBlend);
    this.fog.density = this.baseFogDensity;

    this.scene.background = new THREE.Color(mood.background);
    this.hemisphere.color.setHex(mood.hemiSky);
    this.hemisphere.groundColor.setHex(mood.hemiGround);
    this.hemisphere.intensity =
      mood.hemiIntensity * mood.bounceScale * INTERIOR_LIGHT_TUNING.bounceScale;
    this.key.color.setHex(mood.keyColor);
    this.key.intensity = mood.keyIntensity * mood.keyScale * INTERIOR_LIGHT_TUNING.keyScale;
    this.rim.color.setHex(resolveInteriorRimColor(mood.rimColor));
    this.rim.intensity = mood.rimIntensity * mood.rimScale * INTERIOR_LIGHT_TUNING.rimScale;
    this.materialFill.intensity =
      MATERIAL_FILL_TUNING.intensity * mood.bounceScale * INTERIOR_LIGHT_TUNING.bounceScale;
    const lanternColor = resolvePlayerLanternColor(mood.lanternColor);
    this.playerFill.color.setHex(lanternColor);
    this.playerBeam.color.setHex(lanternColor);
    this.basePlayerLightIntensity = PLAYER_LANTERN_TUNING.intensity * mood.playerLightScale;
    this.basePlayerBeamIntensity = PLAYER_LANTERN_TUNING.forwardIntensity * mood.playerLightScale;
    this.playerFill.intensity = this.basePlayerLightIntensity;
    this.playerBeam.intensity = this.basePlayerBeamIntensity;
    if (this.scene.environment) {
      this.scene.environmentIntensity =
        mood.environmentIntensity * mood.iblScale * INTERIOR_LIGHT_TUNING.iblScale;
    }
  }

  getMood(): DungeonMood {
    return this.mood;
  }

  getLanternColorHex(): number {
    return this.playerFill.color.getHex();
  }

  getLanternIntensity(): number {
    return this.playerFill.intensity;
  }

  getLanternBaseIntensity(): number {
    return this.basePlayerLightIntensity;
  }

  getLanternBeamIntensity(): number {
    return this.playerBeam.intensity;
  }

  getLanternBeamBaseIntensity(): number {
    return this.basePlayerBeamIntensity;
  }

  /** Effective hemisphere intensity after mood bounce scale (tests / diagnostics). */
  getBounceIntensity(): number {
    return this.hemisphere.intensity;
  }

  /** Effective directional key intensity after mood key scale. */
  getKeyIntensity(): number {
    return this.key.intensity;
  }

  /** Effective biome-colored side light used to keep profile silhouettes legible. */
  getRimIntensity(): number {
    return this.rim.intensity;
  }

  getRimColorHex(): number {
    return this.rim.color.getHex();
  }

  getMaterialFillIntensity(): number {
    return this.materialFill.intensity;
  }

  getLanternPosition(target = new THREE.Vector3()): THREE.Vector3 {
    return target.copy(this.playerFill.position);
  }

  update(
    delta: number,
    player: THREE.Vector3,
    nearestThreat: number | null,
    viewForward?: THREE.Vector3,
    explorationFogMultiplier = 1,
    lanternIntensityMultiplier = 1,
  ): void {
    this.target.copy(player);
    this.forwardScratch.set(0, 0, -1);
    if (viewForward) {
      this.forwardScratch.copy(viewForward);
      this.forwardScratch.y = 0;
      if (this.forwardScratch.lengthSq() > 1e-6) this.forwardScratch.normalize();
      else this.forwardScratch.set(0, 0, -1);
      this.target.addScaledVector(this.forwardScratch, -PLAYER_LANTERN_TUNING.backwardOffset);
    }
    this.target.y += 0.82;
    this.playerFill.position.lerp(this.target, 1 - Math.exp(-10 * delta));

    this.beamOrigin.copy(player);
    this.beamOrigin.y += 0.72;
    if (viewForward) {
      this.beamOrigin.addScaledVector(this.forwardScratch, PLAYER_LANTERN_TUNING.forwardOffset);
    }
    this.beamAim.copy(this.beamOrigin).addScaledVector(this.forwardScratch, 8);
    this.beamAim.y -= 0.35;
    this.playerBeam.position.lerp(this.beamOrigin, 1 - Math.exp(-12 * delta));
    this.playerBeamTarget.position.lerp(this.beamAim, 1 - Math.exp(-12 * delta));
    this.playerBeamTarget.updateMatrixWorld();

    const threat = nearestThreat !== null && nearestThreat < 6 ? 1 - nearestThreat / 6 : 0;
    // Threat closes the fog slightly and boosts the lantern — readable panic, not a full blackout.
    // Multipliers below 1 come from the temporary clarity pickup (fog clear).
    // Multipliers above 1 come from gloom curse denser air.
    this.fog.density = THREE.MathUtils.damp(
      this.fog.density,
      this.baseFogDensity * THREE.MathUtils.clamp(explorationFogMultiplier, 0.08, 9.5) +
        threat * 0.0035,
      1.7,
      delta,
    );
    const lanternMul = THREE.MathUtils.clamp(lanternIntensityMultiplier, 0.05, 1.75);
    const threatBoost = threat * PLAYER_LANTERN_TUNING.threatBoost;
    this.playerFill.intensity = THREE.MathUtils.damp(
      this.playerFill.intensity,
      (this.basePlayerLightIntensity + threatBoost * 0.45) * lanternMul,
      3.2,
      delta,
    );
    this.playerBeam.intensity = THREE.MathUtils.damp(
      this.playerBeam.intensity,
      (this.basePlayerBeamIntensity + threatBoost) * lanternMul,
      3.2,
      delta,
    );
  }

  dispose(): void {
    this.scene.remove(
      this.hemisphere,
      this.key,
      this.rim,
      this.materialFill,
      this.playerFill,
      this.playerBeam,
      this.playerBeamTarget,
    );
    if (this.scene.environment) {
      this.scene.environment.dispose();
      this.scene.environment = null;
    }
  }
}
