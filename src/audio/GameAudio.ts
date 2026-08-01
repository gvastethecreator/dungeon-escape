/** Asset-backed dungeon mix. Sources live in public/assets/audio/dungeon. */

import type { FootstepSurface } from "./FootstepSurface";
import type { MusicTrack } from "./AudioMusicPolicy";
import {
  audioAssetCount,
  audioAssetForCue,
  audioAssetForMusic,
  audioAssetForPickup,
  createAudioGroupLevels,
  getAudioAsset,
  listAudioAssets,
  type AudioAssetId,
  type AudioCue,
  type AudioGroup,
  type CollectedPickupKind,
  type CreatureVoice,
} from "./AudioAssetCatalog";
import { CreatureTakeSelector, creatureToneForMood } from "./CreatureTakeSelector";
import {
  resolveThreatAmbientBark,
  resolveThreatBandBark,
  threatIntensityFromDistance,
  type ThreatBand,
} from "./AudioThreatPolicy";

export type { BiomeMusicTrack, BiomePortalMusicTrack, MusicTrack } from "./AudioMusicPolicy";
export { musicTrackForBiome, MUSIC_ASSET_IDS } from "./AudioMusicPolicy";
export { CREATURE_TONES, CREATURE_VOICES } from "./AudioAssetCatalog";
export type { AudioCue, AudioGroup, CreatureTone, CreatureVoice } from "./AudioAssetCatalog";
export { creatureToneForMood } from "./CreatureTakeSelector";
export {
  threatIntensityFromDistance,
  threatBandFromIntensity,
  resolveThreatBandBark,
  resolveThreatAmbientBark,
} from "./AudioThreatPolicy";

export interface AudioPosition {
  x: number;
  y: number;
  z: number;
}

export interface AudioAnchor extends AudioPosition {
  id: string;
}

export interface EnemyAudioAnchor extends AudioAnchor {
  voice: CreatureVoice;
}

export interface DungeonAudioFrame {
  fires: AudioAnchor[];
  magicStones: AudioAnchor[];
  enemies: EnemyAudioAnchor[];
  portal: AudioAnchor | null;
  /** Active dungeon biome; drives creature tone skins. */
  moodId: string | null;
}

export interface CollectedPickupAudio {
  kind: CollectedPickupKind;
  position: AudioPosition;
}

const MUSIC_FADE_SEC = 0.55;

const SILENT_GAIN = 0.0001;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Minimal AudioParam surface used by the modern listener/panner pose path. */
interface AudioParamLike {
  setValueAtTime(value: number, startTime: number): unknown;
}

/**
 * Listener pose API. Chrome/Edge/Safari expose AudioParam axes; Firefox still
 * only implements the legacy Cartesian helpers on AudioListener.
 */
export interface AudioListenerPoseTarget {
  positionX?: AudioParamLike;
  positionY?: AudioParamLike;
  positionZ?: AudioParamLike;
  forwardX?: AudioParamLike;
  forwardY?: AudioParamLike;
  forwardZ?: AudioParamLike;
  setPosition?(x: number, y: number, z: number): void;
  setOrientation?(
    forwardX: number,
    forwardY: number,
    forwardZ: number,
    upX: number,
    upY: number,
    upZ: number,
  ): void;
}

/** Panner pose API with the same modern/legacy split as AudioListener. */
export interface AudioPannerPoseTarget {
  positionX?: AudioParamLike;
  positionY?: AudioParamLike;
  positionZ?: AudioParamLike;
  setPosition?(x: number, y: number, z: number): void;
}

/**
 * Apply listener position + look direction without throwing on engines that
 * lack AudioParam axes (observed: Firefox 153 AudioListener has only
 * setPosition/setOrientation).
 */
export function applyAudioListenerPose(
  listener: AudioListenerPoseTarget,
  position: AudioPosition,
  forward: AudioPosition,
  now: number,
  up: AudioPosition = { x: 0, y: 1, z: 0 },
): "modern" | "legacy" | "none" {
  if (
    listener.positionX &&
    listener.positionY &&
    listener.positionZ &&
    listener.forwardX &&
    listener.forwardY &&
    listener.forwardZ
  ) {
    listener.positionX.setValueAtTime(position.x, now);
    listener.positionY.setValueAtTime(position.y, now);
    listener.positionZ.setValueAtTime(position.z, now);
    listener.forwardX.setValueAtTime(forward.x, now);
    listener.forwardY.setValueAtTime(forward.y, now);
    listener.forwardZ.setValueAtTime(forward.z, now);
    return "modern";
  }
  if (typeof listener.setPosition === "function") {
    listener.setPosition(position.x, position.y, position.z);
    if (typeof listener.setOrientation === "function") {
      listener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
    return "legacy";
  }
  return "none";
}

/** Place a one-shot panner; prefer AudioParam axes, fall back to setPosition. */
export function applyPannerPosition(
  panner: AudioPannerPoseTarget,
  position: AudioPosition,
  now: number,
): "modern" | "legacy" | "none" {
  if (panner.positionX && panner.positionY && panner.positionZ) {
    panner.positionX.setValueAtTime(position.x, now);
    panner.positionY.setValueAtTime(position.y, now);
    panner.positionZ.setValueAtTime(position.z, now);
    return "modern";
  }
  if (typeof panner.setPosition === "function") {
    panner.setPosition(position.x, position.y, position.z);
    return "legacy";
  }
  return "none";
}

/**
 * Small mixer with asset loading, group gain, a limiter, and one-shot HRTF sources.
 * It owns sound presentation only; DungeonWorld remains the source of game state.
 */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly groups = new Map<AudioGroup, GainNode>();
  private readonly groupLevels = createAudioGroupLevels();
  private readonly buffers = new Map<AudioAssetId, AudioBuffer>();
  private loadPromise: Promise<void> | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTrack: MusicTrack | null = null;
  private muted = false;
  private musicMuted = false;
  private musicVolume = 1;
  private effectsVolume = 1;
  private paused = true;
  private disposed = false;
  private threatIntensity = 0;
  private threatCooldown = 0;
  private torchTimer = 1.4;
  private stepVariant = 0;
  private lastThreatBand: ThreatBand = 0;
  private frame: DungeonAudioFrame = {
    fires: [],
    magicStones: [],
    enemies: [],
    portal: null,
    moodId: null,
  };
  private listener: AudioPosition = { x: 0, y: 0, z: 0 };
  private readonly creatureTakes = new CreatureTakeSelector();

  get isUnlocked(): boolean {
    return this.context?.state === "running";
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isMusicMuted(): boolean {
    return this.musicMuted;
  }

  get currentMusicVolume(): number {
    return this.musicVolume;
  }

  get currentEffectsVolume(): number {
    return this.effectsVolume;
  }

  get isReady(): boolean {
    return this.buffers.size === audioAssetCount();
  }

  async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    if (!this.context) this.createGraph();
    const context = this.context;
    if (!context) return false;
    try {
      if (context.state !== "running") await context.resume();
    } catch (error) {
      console.warn(
        "[dungeon-audio] Audio unlock was rejected; it will retry on the next gesture.",
        error,
      );
      return false;
    }
    if (context.state !== "running") return false;
    await this.ensureAssets();
    if (context.state !== "running") return false;
    this.applyMix();
    this.startAmbience();
    // Welcome/end may request a bed before the first unlock gesture resolves.
    if (this.musicTrack && !this.musicSource && !this.musicMuted) {
      this.startMusic(this.musicTrack);
    }
    return true;
  }

  play(cue: AudioCue): void {
    if (cue === "step") {
      this.playFootstep("stone");
      return;
    }
    if (cue === "pickup") {
      this.playAsset("pickup-stone");
      return;
    }
    this.playAsset(audioAssetForCue(cue));
  }

  playFootstep(surface: FootstepSurface, gainScale = 1): void {
    const alternate = this.stepVariant++ % 2 === 1;
    const asset: AudioAssetId =
      surface === "water"
        ? alternate
          ? "step-water-b"
          : "step-water-a"
        : alternate
          ? "step-stone-b"
          : "step-stone-a";
    this.playAsset(asset, undefined, gainScale);
  }

  playDoor(kind: "open" | "close", position: AudioPosition): void {
    this.playAsset(kind === "open" ? "door-open" : "door-close", position);
  }

  playChest(position: AudioPosition): void {
    this.playAsset("chest-open", position);
    this.playAsset("chest-reward", position);
  }

  playPickup(pickup: CollectedPickupAudio | null): void {
    if (!pickup) {
      this.play("pickup");
      return;
    }
    this.playAsset(audioAssetForPickup(pickup.kind), pickup.position);
  }

  playPortal(position: AudioPosition | null): void {
    this.playAsset("portal-open", position ?? undefined);
  }

  playAnnihilationPulse(position: AudioPosition): void {
    // The existing portal swell is the closest local library take for a wide
    // spatial pulse, and keeps the new item free of an unreviewed audio asset.
    this.playAsset("portal-open", position);
  }

  get currentMusic(): MusicTrack | null {
    return this.musicTrack;
  }

  /**
   * Loop a soft scene bed. Safe before unlock (queues after assets load).
   * Music stays audible while the play mix is paused (welcome / end screens).
   * Track choice is kept while music is muted so unmute can resume the bed.
   */
  setMusicTrack(track: MusicTrack | null): void {
    if (this.disposed) return;
    if (this.musicTrack === track) return;
    this.musicTrack = track;
    if (!this.context || this.context.state !== "running") return;
    void this.ensureAssets().then(() => {
      if (this.disposed || this.musicTrack !== track) return;
      if (this.musicMuted && track) {
        // Keep selection only; unmute restarts the bed.
        this.startMusic(null);
        return;
      }
      this.startMusic(track);
    });
  }

  setMusicMuted(muted: boolean): void {
    if (this.musicMuted === muted) return;
    this.musicMuted = muted;
    this.applyMix();
    if (!this.context || this.context.state !== "running") return;
    if (muted) {
      this.startMusic(null);
      return;
    }
    if (this.musicTrack && !this.musicSource) {
      void this.ensureAssets().then(() => {
        if (this.disposed || this.musicMuted || !this.musicTrack || this.musicSource) return;
        this.startMusic(this.musicTrack);
      });
    }
  }

  toggleMusicMuted(): boolean {
    this.setMusicMuted(!this.musicMuted);
    return this.musicMuted;
  }

  /** Enemy attack stays at the attacker; damage feedback stays on the player. */
  playEnemyHit(position: AudioPosition | null = null, voice: CreatureVoice | null = null): void {
    const nearest = this.nearestEnemy();
    const resolved = voice ?? nearest?.voice ?? null;
    this.playAsset(
      resolved
        ? this.creatureTakes.select(
            resolved,
            "attack",
            creatureToneForMood(this.frame.moodId),
            Math.random(),
          )
        : "enemy-attack",
      position ?? nearest ?? undefined,
    );
    this.playAsset("damage");
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMix();
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setGroupVolume(group: AudioGroup, value: number): void {
    this.groupLevels[group] = clamp(value, 0, 1);
    this.applyMix();
  }

  setMusicVolume(value: number): void {
    this.musicVolume = clamp(value, 0, 1);
    this.applyMix();
  }

  setEffectsVolume(value: number): void {
    this.effectsVolume = clamp(value, 0, 1);
    this.applyMix();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.applyMix();
  }

  setListener(position: AudioPosition, forward: AudioPosition): void {
    this.listener.x = position.x;
    this.listener.y = position.y;
    this.listener.z = position.z;
    const context = this.context;
    if (!context) return;
    // Chrome/Edge/Safari expose AudioParam axes; Firefox only has the legacy
    // Cartesian helpers on AudioListener. Using the modern path there throws
    // every frame after unlock and aborts the rest of the render loop.
    applyAudioListenerPose(context.listener, position, forward, context.currentTime);
  }

  syncWorld(frame: DungeonAudioFrame): void {
    this.frame = frame;
  }

  /** Continuous enemy proximity. Calls remain safe before unlock. */
  setThreatDistance(distance: number | null): void {
    const intensity = threatIntensityFromDistance(distance);
    this.threatIntensity = intensity;
    const decision = resolveThreatBandBark({
      intensity,
      previousBand: this.lastThreatBand,
      cooldownRemaining: this.threatCooldown,
    });
    if (decision.playBark) {
      const threat = this.nearestEnemy();
      this.playAsset(
        threat
          ? this.creatureTakes.select(
              threat.voice,
              "voice",
              creatureToneForMood(this.frame.moodId),
              Math.random(),
            )
          : decision.band === 3
            ? "enemy-attack"
            : "enemy-growl",
        threat ?? undefined,
      );
      this.threatCooldown = decision.nextCooldown;
    }
    this.lastThreatBand = decision.band;
  }

  /** Call once per frame in the active play loop. */
  tick(delta: number): void {
    if (!this.context || this.context.state !== "running" || this.muted || this.paused) return;
    this.threatCooldown = Math.max(0, this.threatCooldown - delta);
    this.torchTimer -= delta;
    if (this.torchTimer <= 0) {
      const fire = this.nearestAnchor(this.frame.fires, 18);
      if (fire) this.playAsset("torch-crackle", fire);
      this.torchTimer = 3.8 + Math.random() * 4.2;
    }
    const ambient = resolveThreatAmbientBark({
      intensity: this.threatIntensity,
      cooldownRemaining: this.threatCooldown,
      delta,
      randomUnit: Math.random(),
      randomCooldownUnit: Math.random(),
    });
    if (ambient.playBark) {
      const threat = this.nearestEnemy(22);
      if (threat) {
        this.playAsset(
          this.creatureTakes.select(
            threat.voice,
            "voice",
            creatureToneForMood(this.frame.moodId),
            Math.random(),
          ),
          threat,
        );
      }
      this.threatCooldown = ambient.nextCooldown;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stopMusicImmediate();
    if (this.ambienceSource) {
      try {
        this.ambienceSource.stop();
      } catch {
        // Source already stopped.
      }
    }
    this.ambienceSource = null;
    this.groups.clear();
    this.buffers.clear();
    void this.context?.close();
    this.context = null;
    this.master = null;
  }

  private createGraph(): void {
    const context = new AudioContext();
    const master = context.createGain();
    const limiter = context.createDynamicsCompressor();
    master.gain.value = SILENT_GAIN;
    limiter.threshold.value = -12;
    limiter.knee.value = 16;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;
    for (const group of Object.keys(this.groupLevels) as AudioGroup[]) {
      const gain = context.createGain();
      // UI and music remain live on paused screens (welcome / end).
      gain.gain.value = group === "ui" || group === "music" ? this.outputLevel(group) : SILENT_GAIN;
      gain.connect(master);
      this.groups.set(group, gain);
    }
    master.connect(limiter).connect(context.destination);
    this.context = context;
    this.master = master;
  }

  private async loadAssets(): Promise<void> {
    const context = this.context;
    if (!context) return;
    const entries = listAudioAssets();
    await Promise.all(
      entries
        .filter(([id]) => !this.buffers.has(id))
        .map(async ([id, asset]) => {
          try {
            const response = await fetch(`/assets/audio/dungeon/${asset.file}`);
            if (!response.ok) throw new Error(`${asset.file}: HTTP ${response.status}`);
            const encoded = await response.arrayBuffer();
            const decoded = await context.decodeAudioData(encoded);
            if (!this.disposed) this.buffers.set(id, decoded);
          } catch (error) {
            console.warn(`[dungeon-audio] Failed to load ${asset.file}`, error);
          }
        }),
    );
  }

  /** Failed or interrupted asset fetches remain eligible for the next user gesture. */
  private async ensureAssets(): Promise<void> {
    if (this.isReady) return;
    if (!this.loadPromise) {
      this.loadPromise = this.loadAssets().finally(() => {
        this.loadPromise = null;
      });
    }
    await this.loadPromise;
  }

  private startAmbience(): void {
    const context = this.context;
    const destination = this.groups.get("ambience");
    const buffer = this.buffers.get("ambience-cave");
    if (!context || !destination || !buffer || this.ambienceSource || this.disposed) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = getAudioAsset("ambience-cave").gain;
    source.connect(gain).connect(destination);
    source.start();
    source.onended = () => {
      if (this.ambienceSource === source) this.ambienceSource = null;
    };
    this.ambienceSource = source;
  }

  private startMusic(track: MusicTrack | null): void {
    const context = this.context;
    const destination = this.groups.get("music");
    if (!context || !destination || this.disposed) return;
    const now = context.currentTime;

    if (this.musicSource && this.musicGain) {
      const fading = this.musicSource;
      const fadingGain = this.musicGain;
      fadingGain.gain.cancelScheduledValues(now);
      fadingGain.gain.setValueAtTime(Math.max(SILENT_GAIN, fadingGain.gain.value), now);
      fadingGain.gain.linearRampToValueAtTime(SILENT_GAIN, now + MUSIC_FADE_SEC);
      globalThis.setTimeout(
        () => {
          try {
            fading.stop();
          } catch {
            // already stopped
          }
          fading.disconnect();
          fadingGain.disconnect();
        },
        MUSIC_FADE_SEC * 1000 + 40,
      );
      this.musicSource = null;
      this.musicGain = null;
    }

    if (!track) return;
    const assetId = audioAssetForMusic(track);
    const buffer = this.buffers.get(assetId);
    if (!buffer) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    const target = getAudioAsset(assetId).gain;
    gain.gain.value = SILENT_GAIN;
    gain.gain.setValueAtTime(SILENT_GAIN, now);
    gain.gain.linearRampToValueAtTime(target, now + MUSIC_FADE_SEC);
    source.connect(gain).connect(destination);
    source.start();
    source.onended = () => {
      if (this.musicSource === source) {
        this.musicSource = null;
        this.musicGain = null;
      }
    };
    this.musicSource = source;
    this.musicGain = gain;
  }

  private stopMusicImmediate(): void {
    if (this.musicSource) {
      try {
        this.musicSource.stop();
      } catch {
        // already stopped
      }
      this.musicSource.disconnect();
    }
    this.musicGain?.disconnect();
    this.musicSource = null;
    this.musicGain = null;
    this.musicTrack = null;
  }

  private playAsset(id: AudioAssetId, position?: AudioPosition, gainScale = 1): void {
    const context = this.context;
    const asset = getAudioAsset(id);
    const buffer = this.buffers.get(id);
    const destination = this.groups.get(asset.group);
    if (
      !context ||
      !buffer ||
      !destination ||
      this.muted ||
      (this.paused && asset.group !== "ui")
    ) {
      return;
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = asset.gain * gainScale;
    source.connect(gain);
    if (position && asset.spatial) {
      const panner = context.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = asset.spatial.refDistance;
      panner.maxDistance = asset.spatial.maxDistance;
      panner.rolloffFactor = asset.spatial.rolloff;
      panner.coneInnerAngle = 360;
      panner.coneOuterAngle = 360;
      applyPannerPosition(panner, position, context.currentTime);
      gain.connect(panner).connect(destination);
    } else {
      gain.connect(destination);
    }
    source.start();
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
  }

  private nearestAnchor(
    anchors: readonly AudioAnchor[],
    maxDistance = Number.POSITIVE_INFINITY,
  ): AudioAnchor | null {
    let nearest: AudioAnchor | null = null;
    let bestDistanceSq = maxDistance * maxDistance;
    for (const anchor of anchors) {
      const dx = anchor.x - this.listener.x;
      const dy = anchor.y - this.listener.y;
      const dz = anchor.z - this.listener.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      if (distanceSq > bestDistanceSq) continue;
      nearest = anchor;
      bestDistanceSq = distanceSq;
    }
    return nearest;
  }

  private nearestEnemy(maxDistance = Number.POSITIVE_INFINITY): EnemyAudioAnchor | null {
    return this.nearestAnchor(this.frame.enemies, maxDistance) as EnemyAudioAnchor | null;
  }

  private applyMix(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const now = context.currentTime;
    master.gain.setTargetAtTime(this.muted ? SILENT_GAIN : 0.76, now, 0.03);
    for (const [group, gain] of this.groups) {
      let active = group === "ui" || group === "music" || !this.paused;
      if (group === "music" && this.musicMuted) active = false;
      gain.gain.setTargetAtTime(active ? this.outputLevel(group) : SILENT_GAIN, now, 0.12);
    }
  }

  private outputLevel(group: AudioGroup): number {
    const preference = group === "music" ? this.musicVolume : this.effectsVolume;
    return this.groupLevels[group] * preference;
  }
}
