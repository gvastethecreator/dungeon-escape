import { describe, expect, test } from "bun:test";
import { GameAudio, type AudioCue } from "../src/audio/GameAudio";

const CUES: AudioCue[] = [
  "ui",
  "mode",
  "forge",
  "spawn",
  "step",
  "pickup",
  "damage",
  "win",
  "lose",
  "enemyGrowl",
  "enemyAttack",
  "torch",
  "portal",
];

describe("GameAudio dungeon soundscape", () => {
  test("exposes music, ambience, and enemy cue API without requiring unlock", () => {
    const audio = new GameAudio();
    expect(audio.isMuted).toBe(false);
    expect(audio.isUnlocked).toBe(false);

    // Safe no-ops before AudioContext exists.
    for (const cue of CUES) audio.play(cue);
    audio.setThreatDistance(4);
    audio.setThreatDistance(null);
    audio.tick(0.016);
    audio.playFootstep("water");
    audio.playDoor("open", { x: 0, y: 1, z: 0 });
    audio.playEnemyHit({ x: 1.2, y: 1, z: -2 });
    audio.setPaused(true);
    audio.setPaused(false);

    expect(audio.toggleMuted()).toBe(true);
    expect(audio.isMuted).toBe(true);
    audio.setMuted(false);
    audio.dispose();
  });

  test("source includes asset groups, limiting, and spatial source configuration", async () => {
    const source = await Bun.file(new URL("../src/audio/GameAudio.ts", import.meta.url)).text();
    expect(source).toContain("ambience-cave.opus");
    expect(source).toContain("DynamicsCompressor");
    expect(source).toContain('panningModel = "HRTF"');
    expect(source).toContain("setGroupVolume");
    expect(source).toContain("syncWorld");
    expect(source).toContain("enemyGrowl");
    expect(source).toContain("enemyAttack");
    expect(source).toContain("setThreatDistance");
    expect(source).toContain("step-water-a.opus");
    expect(source).toContain("door-open.opus");
    expect(source).toContain("CREATURE_VOICE_ASSETS");
  });

  test("play loop wires threat and tick into the frame", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("audio.setThreatDistance");
    expect(main).toContain("audio.tick(delta)");
    expect(main).toContain("audio.playEnemyHit");
    expect(main).toContain("audio.playDoor");
    expect(main).toContain("audio.playFootstep");
    expect(main).toContain("audio.syncWorld(world.getAudioFrame())");
    expect(main).toContain("now - lastAudioFrameSync >= 125");
    expect(main).toContain("renderer.info.autoReset = false");
    expect(main).toContain("renderer.compileAsync(scene, camera)");
    expect(main).toContain("povPost.compileAsync(renderer)");
    expect(main).toContain("renderWarmupReady");
  });

  test("any player gesture arms audio before the scene can capture pointer lock", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    const audio = await Bun.file(new URL("../src/audio/GameAudio.ts", import.meta.url)).text();
    expect(main).toContain(
      'document.addEventListener("pointerdown", unlockAudioFromGesture, { capture: true })',
    );
    expect(main).toContain(
      'document.addEventListener("keydown", unlockAudioFromGesture, { capture: true })',
    );
    expect(audio).toContain(
      "Failed or interrupted asset fetches remain eligible for the next user gesture.",
    );
    expect(audio).toContain("this.loadPromise = null;");
  });

  test("touch play stays active when the browser rejects pointer lock", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("const hasActivePlayInput = locked || touchSessionActive;");
    expect(main).toContain('!hasActivePlayInput && engineMode === "play" && runMode === "playing"');
  });

  test("main uses RunSession and safe hydrate policy", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("applyWorldUpdate");
    expect(main).toContain("shouldAdoptHydratedSeed");
    expect(main).toContain("resetRunSession");
  });
});
