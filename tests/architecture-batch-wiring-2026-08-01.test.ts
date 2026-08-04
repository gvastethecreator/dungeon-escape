import { describe, expect, test } from "bun:test";

/**
 * Structural wiring contracts for the 2026-08-01 architecture batch.
 * Pure modules must stay on the real host/world/audio call paths.
 */
describe("architecture batch wiring 2026-08-01", () => {
  test("GameAudio owns threat policy through AudioThreatPolicy", async () => {
    const source = await Bun.file(new URL("../src/audio/GameAudio.ts", import.meta.url)).text();
    expect(source).toContain('from "./AudioThreatPolicy"');
    expect(source).toContain("threatIntensityFromDistance");
    expect(source).toContain("resolveThreatBandBark");
    expect(source).toContain("resolveThreatAmbientBark");
    expect(source).not.toContain("(distance - 2.2) / 12.8");
  });

  test("DungeonWorld wires door, surface, spawn, pulse, minimap, and reach policies", async () => {
    const source = await Bun.file(new URL("../src/world/DungeonWorld.ts", import.meta.url)).text();
    expect(source).toContain("resolveDoorTargetOpen");
    expect(source).toContain("updateDoorLeafPresentation");
    expect(source).toContain("updateChestPresentation");
    expect(source).toContain("updateCollectedPickupMotion");
    expect(source).toContain("composeHazardWithBiomeEvent");
    expect(source).toContain("composeDifficultyWithBiomeEvent");
    // Spawn safety is owned by the resident enemy runtime; DungeonWorld only
    // wires that owner into the active-floor facade.
    expect(source).toContain("ResidentEnemyRuntime");
    const residentEnemySource = await Bun.file(
      new URL("../src/world/ResidentEnemyRuntime.ts", import.meta.url),
    ).text();
    expect(residentEnemySource).toContain("resolveSafeSpawnDistance");
    expect(source).toContain("annihilationPulseHitsEnemy");
    expect(source).toContain("projectMinimapFeatures");
    expect(source).toContain('from "./InteractionReach"');
    expect(source).toContain("canInteractWithChest");
    expect(source).toContain("canCollectPickup");
    expect(source).toContain("tickRunPowerRuntime");
    expect(source).toContain("applyPickupToRunPowers");
  });

  test("HazardTileSystem samples the shared spikeExposure curve", async () => {
    const source = await Bun.file(
      new URL("../src/world/HazardTileSystem.ts", import.meta.url),
    ).text();
    expect(source).toContain("computeSpikeExposure");
    expect(source).toContain("spikeExposure as computeSpikeExposure");
    expect(source).not.toContain("private spikeExposure");
    expect(source).toContain("spikeExposure,");
  });

  test("main wires pickup feedback and adaptive CRT pure owners", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("projectPickupFeedback");
    expect(main).toContain("showPickupFeedback(effects.pickup.label, effects.pickup)");
    expect(main).toContain("stepAdaptiveCrt");
    expect(main).toContain("renderCaps.adaptiveCrtDisableMs");
    expect(main).not.toContain("adaptiveCrtDisableMs - 8");
  });

  test("StaticDungeonScene re-exports reach without local predicates", async () => {
    const source = await Bun.file(
      new URL("../src/world/StaticDungeonScene.ts", import.meta.url),
    ).text();
    expect(source).toContain('} from "./InteractionReach"');
    expect(source).toContain("canInteractWithChest");
    expect(source).toContain("CHEST_INTERACTION_DISTANCE");
    expect(source).not.toContain("canInteractWithChestReach");
  });
});
