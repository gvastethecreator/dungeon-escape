import { describe, expect, test } from "bun:test";
import {
  CREATURE_TONES,
  CREATURE_VOICES,
  GameAudio,
  applyAudioListenerPose,
  applyPannerPosition,
  creatureToneForMood,
  musicTrackForBiome,
  type AudioCue,
} from "../src/audio/GameAudio";
import { listBiomeIds } from "../src/systems/BiomeIdentity";
import { ENEMY_ROSTER } from "../src/world/EnemySpriteAtlas";
import { creatureVoiceForEnemy } from "../src/world/DungeonWorld";

const CUES: AudioCue[] = [
  "ui",
  "uiClick",
  "uiTick",
  "uiHover",
  "uiSelect",
  "uiBack",
  "uiToggle",
  "uiDeny",
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
    audio.playChest({ x: 0.5, y: 1, z: -0.5 });
    audio.playPickup({ kind: "time-freeze", position: { x: 1, y: 1, z: 0 } });
    audio.playPickup({ kind: "luminous-ward", position: { x: 1, y: 1, z: 0 } });
    audio.playPickup({ kind: "annihilation-pulse", position: { x: 1, y: 1, z: 0 } });
    audio.playAnnihilationPulse({ x: 1, y: 1, z: 0 });
    audio.playEnemyHit({ x: 1.2, y: 1, z: -2 });
    audio.setMusicTrack("menu");
    expect(audio.currentMusic).toBe("menu");
    audio.setMusicTrack("win");
    audio.setMusicTrack("lose");
    audio.setMusicTrack("biome-fungal");
    expect(audio.currentMusic).toBe("biome-fungal");
    audio.setMusicTrack(null);
    expect(audio.currentMusic).toBe(null);
    expect(audio.isMusicMuted).toBe(false);
    audio.setMusicVolume(0.35);
    audio.setEffectsVolume(0.8);
    expect(audio.currentMusicVolume).toBe(0.35);
    expect(audio.currentEffectsVolume).toBe(0.8);
    audio.setGroupVolume("sfx", 0.5);
    expect(audio.toggleMusicMuted()).toBe(true);
    expect(audio.isMusicMuted).toBe(true);
    audio.setMusicMuted(false);
    expect(audio.isMusicMuted).toBe(false);
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
    expect(source).toContain("pickup-time-freeze.opus");
    expect(source).toContain("pickup-ward.opus");
    expect(source).toContain("chest-open.opus");
    expect(source).toContain("win.opus");
    expect(source).toContain("lose.opus");
    expect(source).toContain("music-menu.opus");
    expect(source).toContain("music-win.opus");
    expect(source).toContain("music-lose.ogg");
    expect(source).toContain("music-biome-backrooms.ogg");
    expect(source).toContain("music-biome-backrooms-portal.ogg");
    expect(source).toContain("ui-click.opus");
    expect(source).toContain("ui-tick.opus");
    expect(source).toContain("ui-hover.opus");
    expect(source).toContain("ui-select.opus");
    expect(source).toContain("setMusicTrack");
    expect(source).toContain('group === "music"');
    expect(source).toContain("PICKUP_ASSETS");
    expect(source).toContain("CREATURE_VOICE_TAKES");
    expect(source).toContain("CREATURE_ATTACK_TAKES");
    expect(source).toContain("CREATURE_VOICE_TONES");
    expect(source).toContain("pickCreatureAsset");
    expect(source).toContain("creatureToneForMood");
    expect(source).toContain("buildEnemyThreatAssets");
    expect(source).toContain("enemy-${kind}-v${take}.opus");
    expect(source).toContain("enemy-${kind}-attack-${tone}.opus");
    // Firefox AudioListener lacks positionX; pose must fall back to setPosition.
    expect(source).toContain("applyAudioListenerPose");
    expect(source).toContain("applyPannerPosition");
    expect(source).toContain("setPosition");
    expect(source).toContain("setOrientation");
  });

  test("listener pose uses AudioParam axes when present", () => {
    const calls: string[] = [];
    const param = (name: string) => ({
      setValueAtTime(value: number, startTime: number) {
        calls.push(`${name}:${value}@${startTime}`);
      },
    });
    const path = applyAudioListenerPose(
      {
        positionX: param("px"),
        positionY: param("py"),
        positionZ: param("pz"),
        forwardX: param("fx"),
        forwardY: param("fy"),
        forwardZ: param("fz"),
        setPosition() {
          calls.push("legacy-position");
        },
      },
      { x: 1, y: 2, z: 3 },
      { x: 0, y: 0, z: -1 },
      0.5,
    );
    expect(path).toBe("modern");
    expect(calls).toEqual(["px:1@0.5", "py:2@0.5", "pz:3@0.5", "fx:0@0.5", "fy:0@0.5", "fz:-1@0.5"]);
  });

  test("listener pose falls back to legacy Cartesian helpers for Firefox", () => {
    const calls: string[] = [];
    const path = applyAudioListenerPose(
      {
        setPosition(x, y, z) {
          calls.push(`pos:${x},${y},${z}`);
        },
        setOrientation(fx, fy, fz, ux, uy, uz) {
          calls.push(`ori:${fx},${fy},${fz},${ux},${uy},${uz}`);
        },
      },
      { x: 4, y: 5, z: 6 },
      { x: 0, y: 0, z: -1 },
      1,
    );
    expect(path).toBe("legacy");
    expect(calls).toEqual(["pos:4,5,6", "ori:0,0,-1,0,1,0"]);
  });

  test("panner pose prefers AudioParam axes and falls back to setPosition", () => {
    const modernCalls: string[] = [];
    expect(
      applyPannerPosition(
        {
          positionX: {
            setValueAtTime(value, startTime) {
              modernCalls.push(`x:${value}@${startTime}`);
            },
          },
          positionY: {
            setValueAtTime(value, startTime) {
              modernCalls.push(`y:${value}@${startTime}`);
            },
          },
          positionZ: {
            setValueAtTime(value, startTime) {
              modernCalls.push(`z:${value}@${startTime}`);
            },
          },
        },
        { x: 1, y: 2, z: 3 },
        0.25,
      ),
    ).toBe("modern");
    expect(modernCalls).toEqual(["x:1@0.25", "y:2@0.25", "z:3@0.25"]);

    const legacyCalls: string[] = [];
    expect(
      applyPannerPosition(
        {
          setPosition(x, y, z) {
            legacyCalls.push(`${x},${y},${z}`);
          },
        },
        { x: 7, y: 8, z: 9 },
        0,
      ),
    ).toBe("legacy");
    expect(legacyCalls).toEqual(["7,8,9"]);
  });

  test("every biome owns valid exploration and portal tracks", async () => {
    for (const biome of listBiomeIds()) {
      expect(musicTrackForBiome(biome)).toBe(`biome-${biome}`);
      expect(musicTrackForBiome(biome, { portalOpen: true })).toBe(`biome-${biome}-portal`);
      for (const suffix of ["", "-portal"] as const) {
        const asset = Bun.file(
          new URL(
            `../public/assets/audio/dungeon/music-biome-${biome}${suffix}.ogg`,
            import.meta.url,
          ),
        );
        expect(await asset.exists()).toBe(true);
        expect(asset.size).toBeGreaterThan(150_000);
      }
    }
    expect(musicTrackForBiome("unknown")).toBe("biome-ancient");
    expect(musicTrackForBiome("unknown", { portalOpen: true })).toBe("biome-ancient-portal");
  });

  test("lose bed is a melancholic Neo-SPC ogg asset", async () => {
    const asset = Bun.file(new URL("../public/assets/audio/dungeon/music-lose.ogg", import.meta.url));
    expect(await asset.exists()).toBe(true);
    expect(asset.size).toBeGreaterThan(150_000);
  });

  test("mood maps to creature tone families", () => {
    expect(creatureToneForMood("frost")).toBe("cold");
    expect(creatureToneForMood("sunken")).toBe("wet");
    expect(creatureToneForMood("fungal")).toBe("wet");
    expect(creatureToneForMood("molten")).toBe("fire");
    expect(creatureToneForMood("obsidian")).toBe("fire");
    expect(creatureToneForMood("backrooms")).toBe("weird");
    expect(creatureToneForMood("ancient")).toBe("base");
    expect(creatureToneForMood(null)).toBe("base");
  });

  test("every enemy take and biome skin asset exists on disk", async () => {
    expect([...ENEMY_ROSTER]).toEqual([...CREATURE_VOICES]);
    const seen = new Set<string>();
    for (const kind of ENEMY_ROSTER) {
      expect(creatureVoiceForEnemy(kind)).toBe(kind);
      const names: string[] = [];
      for (let take = 0; take < 3; take++) {
        names.push(`enemy-${kind}-v${take}.opus`);
        names.push(`enemy-${kind}-attack-v${take}.opus`);
      }
      for (const tone of CREATURE_TONES) {
        names.push(`enemy-${kind}-${tone}.opus`);
        names.push(`enemy-${kind}-attack-${tone}.opus`);
      }
      for (const file of names) {
        const path = new URL(`../public/assets/audio/dungeon/${file}`, import.meta.url);
        const blob = Bun.file(path);
        expect(await blob.exists()).toBe(true);
        expect(blob.size).toBeGreaterThan(800);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const fingerprint = `${file}:${bytes.length}:${bytes[0]}:${bytes[Math.floor(bytes.length / 2)]}`;
        expect(seen.has(fingerprint)).toBe(false);
        seen.add(fingerprint);
      }
    }
  });

  test("main wires global interface click and hover sounds", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("wireInterfaceSounds()");
    expect(main).toContain('playCue("uiHover")');
    expect(main).toContain("resolveUiClickCue");
    expect(main).toContain("uiSelect");
  });

  test("main wires menu and end-screen music beds", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain('setMusicBed("menu")');
    expect(main).toContain('setMusicBed("win")');
    expect(main).toContain('setMusicBed("lose")');
    expect(main).toContain("musicTrackForBiome");
    expect(main).toContain("portalOpen");
    expect(main).toContain("setActiveBiomeMusic");
    expect(main).toContain("audio.setMusicTrack");
    expect(main).toContain("setMusicMutedPreference");
    expect(main).toContain("welcomeMusicToggle");
    expect(main).toContain("MUSIC_MUTED_KEY");
  });

  test("html exposes music mute controls on welcome and options", async () => {
    const host = await Bun.file(new URL("../index.html", import.meta.url)).text();
    expect(host).toContain('id="music-toggle"');
    expect(host).toContain('id="welcome-music-toggle"');
    expect(host).toContain("data-toggle-value>ON");
  });

  test("play loop wires threat and tick into the frame", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("audio.setThreatDistance");
    expect(main).toContain("audio.tick(delta)");
    expect(main).toContain("audio.playEnemyHit");
    expect(main).toContain("audio.playDoor");
    expect(main).toContain("audio.playChest");
    expect(main).toContain("audio.playFootstep");
    expect(main).toContain("audio.syncWorld(world.getAudioFrame())");
    expect(main).toContain("now - lastAudioFrameSync >= 125");
    expect(main).toContain("renderer.info.autoReset = false");
    expect(main).not.toContain("renderer.compile(");
    expect(main).not.toContain("compileAsync(");
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
    expect(main).toContain('playRuntime.state().runMode === "playing"');
  });

  test("main uses PlayRuntime and safe hydrate policy", async () => {
    const main = await Bun.file(new URL("../src/main.ts", import.meta.url)).text();
    expect(main).toContain("const playRuntime = new PlayRuntime(world);");
    expect(main).toContain("playRuntime.step({");
    expect(main).toContain("shouldAdoptHydratedSeed");
    expect(main).not.toContain("resetRunSession");
  });
});
