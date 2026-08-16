/** Asset-backed dungeon mix. Sources live in public/assets/audio/dungeon. */

import type { FootstepSurface } from "./FootstepSurface";
import type { MusicTrack } from "./AudioMusicPolicy";
import { SHOTGUN_PUMP_SOUND_DELAY } from "../game/Shotgun";
import {
  audioAssetCount,
  audioAssetForBiomeAccent,
  audioAssetForBiomeAmbience,
  audioAssetForCue,
  audioAssetForMusic,
  audioAssetForPickup,
  createAudioGroupLevels,
  creatureBaseTakes,
  creatureToneAsset,
  CREATURE_VOICES,
  getAudioAsset,
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
  /** Distinct uncollected cues on the active floor, in stable world order. */
  pickupKinds: CollectedPickupKind[];
}

export interface CollectedPickupAudio {
  kind: CollectedPickupKind;
  position: AudioPosition;
}

export interface AudioLoadDiagnostics {
  contextState: AudioContextState | "uninitialized";
  ready: boolean;
  currentAmbienceAsset: AudioAssetId | null;
  catalogAssets: number;
  requestedAssets: number;
  decodedAssets: number;
  decodedMilliseconds: number;
  downloadedBytes: number;
  residentBuffers: number;
  inflightAssets: number;
  queuedAssets: number;
  backgroundPrefetchActive: boolean;
}

const MUSIC_FADE_SEC = 0.55;

const SILENT_GAIN = 0.0001;

const STARTUP_AUDIO_ASSETS: readonly AudioAssetId[] = [
  "ui-click",
  "ui-tick",
  "ui-hover",
  "ui-select",
  "ui-back",
  "ui-toggle",
  "ui-deny",
  "ui-metal",
];

/**
 * Play-path sounds that must be resident before the first likely interaction.
 * They stay out of the blocking unlock set and enter the throttled route queue.
 */
const PLAY_AUDIO_PREFETCH_ASSETS: readonly AudioAssetId[] = [
  "step-stone-a",
  "step-stone-b",
  "chest-open",
  "chest-reward",
  "door-open",
  "door-close",
  "damage",
  "enemy-growl",
  "enemy-attack",
  "torch-crackle",
];

const BACKGROUND_PREFETCH_YIELD_MS = 16;

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
  private readonly assetLoads = new Map<AudioAssetId, Promise<boolean>>();
  private readonly pendingPlayback = new Map<
    AudioAssetId,
    { position?: AudioPosition; gainScale: number; delaySeconds: number }
  >();
  private readonly pendingPlaybackWaiters = new Set<AudioAssetId>();
  private readonly backgroundPrefetchQueue: AudioAssetId[] = [];
  private readonly queuedPrefetchAssets = new Set<AudioAssetId>();
  private backgroundPrefetchTimer: ReturnType<typeof setTimeout> | null = null;
  private backgroundPrefetchRunning = false;
  private activePrefetchAsset: AudioAssetId | null = null;
  private prefetchedRouteKey = "";
  private requestedAssets = 0;
  private decodedAssets = 0;
  private decodedMilliseconds = 0;
  private downloadedBytes = 0;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceAssetId: AudioAssetId | null = null;
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
  private biomeAccentTimer = 8;
  private stepVariant = 0;
  private lastThreatBand: ThreatBand = 0;
  private frame: DungeonAudioFrame = {
    fires: [],
    magicStones: [],
    enemies: [],
    portal: null,
    moodId: null,
    pickupKinds: [],
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
    return this.startupAssetIds().every((id) => this.buffers.has(id));
  }

  getLoadDiagnostics(): AudioLoadDiagnostics {
    return {
      contextState: this.context?.state ?? "uninitialized",
      ready: this.isReady,
      currentAmbienceAsset: this.ambienceAssetId,
      catalogAssets: audioAssetCount(),
      requestedAssets: this.requestedAssets,
      decodedAssets: this.decodedAssets,
      decodedMilliseconds: Number(this.decodedMilliseconds.toFixed(2)),
      downloadedBytes: this.downloadedBytes,
      residentBuffers: this.buffers.size,
      inflightAssets: this.assetLoads.size,
      queuedAssets: this.backgroundPrefetchQueue.length,
      backgroundPrefetchActive:
        this.backgroundPrefetchRunning || this.backgroundPrefetchTimer !== null,
    };
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
    await this.ensureAssets(this.startupAssetIds());
    if (context.state !== "running") return false;
    this.applyMix();
    this.startAmbience(audioAssetForBiomeAmbience(this.frame.moodId));
    // Welcome/end may request a bed before the first unlock gesture resolves.
    if (this.musicTrack && !this.musicSource && !this.musicMuted) {
      this.startMusic(this.musicTrack);
    }
    this.syncBiomeSoundscape();
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
    if (pickup.kind === "shotgun") {
      void this.ensureAssets(["shotgun-fire", "shotgun-pump", "shotgun-dry"]);
    }
  }

  playPortal(position: AudioPosition | null): void {
    this.playAsset("portal-open", position ?? undefined);
  }

  playAnnihilationPulse(position: AudioPosition): void {
    this.playAsset("power-annihilation-pulse", position);
  }

  playCullBrandKill(position: AudioPosition): void {
    this.playAsset("power-cull-brand-kill", position);
  }

  playShotgunFire(position: AudioPosition, options: { pump?: boolean } = {}): void {
    this.playAsset("shotgun-fire", position);
    if (options.pump) this.playAsset("shotgun-pump", position, 0.92, SHOTGUN_PUMP_SOUND_DELAY);
  }

  playShotgunDry(position: AudioPosition): void {
    this.playAsset("shotgun-dry", position);
  }

  playPhoenixRevive(position: AudioPosition): void {
    this.playAsset("power-phoenix-revive", position);
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
    if (!track) {
      this.startMusic(null);
      return;
    }
    void this.ensureAsset(audioAssetForMusic(track)).then(() => {
      if (this.disposed || this.musicTrack !== track) return;
      if (this.musicMuted) {
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
      const requestedTrack = this.musicTrack;
      void this.ensureAsset(audioAssetForMusic(requestedTrack)).then(() => {
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
    this.prefetchActiveRoute();
    this.syncBiomeSoundscape();
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
    this.biomeAccentTimer -= delta;
    if (this.biomeAccentTimer <= 0) {
      this.playAsset(audioAssetForBiomeAccent(this.frame.moodId));
      this.biomeAccentTimer = 12 + Math.random() * 18;
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
    this.ambienceGain?.disconnect();
    this.ambienceGain = null;
    this.ambienceAssetId = null;
    this.groups.clear();
    this.buffers.clear();
    this.assetLoads.clear();
    this.pendingPlayback.clear();
    this.pendingPlaybackWaiters.clear();
    if (this.backgroundPrefetchTimer !== null) clearTimeout(this.backgroundPrefetchTimer);
    this.backgroundPrefetchTimer = null;
    this.backgroundPrefetchQueue.length = 0;
    this.queuedPrefetchAssets.clear();
    this.activePrefetchAsset = null;
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

  private startupAssetIds(): readonly AudioAssetId[] {
    const assets: AudioAssetId[] = [
      audioAssetForBiomeAmbience(this.frame.moodId),
      ...STARTUP_AUDIO_ASSETS,
    ];
    if (this.musicTrack) assets.push(audioAssetForMusic(this.musicTrack));
    return assets;
  }

  private prefetchActiveRoute(): void {
    const context = this.context;
    if (!context || context.state !== "running" || this.disposed) return;
    const tone = creatureToneForMood(this.frame.moodId);
    let voiceMask = 0;
    for (const enemy of this.frame.enemies) {
      const index = CREATURE_VOICES.indexOf(enemy.voice);
      if (index >= 0) voiceMask |= 1 << index;
    }
    const ambience = audioAssetForBiomeAmbience(this.frame.moodId);
    const pickupRoute = this.frame.pickupKinds.join(",");
    const routeKey = `${ambience}:${tone}:${voiceMask}:${pickupRoute}`;
    if (routeKey === this.prefetchedRouteKey) return;
    const orderedEnemies = [...this.frame.enemies].sort((left, right) => {
      const leftDistance =
        (left.x - this.listener.x) ** 2 +
        (left.y - this.listener.y) ** 2 +
        (left.z - this.listener.z) ** 2;
      const rightDistance =
        (right.x - this.listener.x) ** 2 +
        (right.y - this.listener.y) ** 2 +
        (right.z - this.listener.z) ** 2;
      return leftDistance - rightDistance || left.voice.localeCompare(right.voice);
    });
    const voices = [...new Set(orderedEnemies.map((enemy) => enemy.voice))];
    this.prefetchedRouteKey = routeKey;
    const ids: AudioAssetId[] = [
      ...PLAY_AUDIO_PREFETCH_ASSETS,
      ...this.frame.pickupKinds.map(audioAssetForPickup),
    ];
    for (const voice of voices) {
      ids.push(...creatureBaseTakes(voice, "voice"), ...creatureBaseTakes(voice, "attack"));
      if (tone !== "base") {
        ids.push(creatureToneAsset(voice, "voice", tone));
        ids.push(creatureToneAsset(voice, "attack", tone));
      }
    }
    this.replaceBackgroundPrefetch(ids);
  }

  private replaceBackgroundPrefetch(ids: readonly AudioAssetId[]): void {
    this.backgroundPrefetchQueue.length = 0;
    this.queuedPrefetchAssets.clear();
    for (const id of ids) {
      if (
        this.buffers.has(id) ||
        this.assetLoads.has(id) ||
        id === this.activePrefetchAsset ||
        this.queuedPrefetchAssets.has(id)
      ) {
        continue;
      }
      this.backgroundPrefetchQueue.push(id);
      this.queuedPrefetchAssets.add(id);
    }
    this.scheduleBackgroundPrefetch();
  }

  private scheduleBackgroundPrefetch(): void {
    if (
      this.disposed ||
      this.backgroundPrefetchRunning ||
      this.backgroundPrefetchTimer !== null ||
      this.backgroundPrefetchQueue.length === 0
    ) {
      return;
    }
    this.backgroundPrefetchTimer = setTimeout(() => {
      this.backgroundPrefetchTimer = null;
      void this.drainBackgroundPrefetch();
    }, 0);
  }

  private async drainBackgroundPrefetch(): Promise<void> {
    if (this.backgroundPrefetchRunning || this.disposed) return;
    this.backgroundPrefetchRunning = true;
    try {
      while (!this.disposed) {
        const id = this.backgroundPrefetchQueue.shift();
        if (!id) break;
        this.queuedPrefetchAssets.delete(id);
        this.activePrefetchAsset = id;
        await this.ensureAsset(id);
        this.activePrefetchAsset = null;
        if (this.backgroundPrefetchQueue.length > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, BACKGROUND_PREFETCH_YIELD_MS));
        }
      }
    } finally {
      this.activePrefetchAsset = null;
      this.backgroundPrefetchRunning = false;
      this.scheduleBackgroundPrefetch();
    }
  }

  private async ensureAssets(ids: readonly AudioAssetId[]): Promise<void> {
    await Promise.all(ids.map((id) => this.ensureAsset(id)));
  }

  /** Failed or interrupted fetches leave no cache entry, so the next demand retries them. */
  private async ensureAsset(id: AudioAssetId): Promise<boolean> {
    if (this.buffers.has(id)) return true;
    const activeLoad = this.assetLoads.get(id);
    if (activeLoad) return activeLoad;
    const context = this.context;
    if (!context || this.disposed) return false;
    const asset = getAudioAsset(id);
    const load = (async (): Promise<boolean> => {
      this.requestedAssets += 1;
      try {
        const response = await fetch(`/assets/audio/dungeon/${asset.file}`);
        if (!response.ok) throw new Error(`${asset.file}: HTTP ${response.status}`);
        const encoded = await response.arrayBuffer();
        this.downloadedBytes += encoded.byteLength;
        const decodeStarted = performance.now();
        const decoded = await context.decodeAudioData(encoded);
        this.decodedMilliseconds += performance.now() - decodeStarted;
        this.decodedAssets += 1;
        if (this.disposed) return false;
        this.buffers.set(id, decoded);
        return true;
      } catch (error) {
        console.warn(`[dungeon-audio] Failed to load ${asset.file}`, error);
        return false;
      }
    })();
    this.assetLoads.set(id, load);
    try {
      return await load;
    } finally {
      if (this.assetLoads.get(id) === load) this.assetLoads.delete(id);
    }
  }

  private syncBiomeSoundscape(): void {
    const context = this.context;
    if (!context || context.state !== "running" || this.disposed) return;
    const requested = audioAssetForBiomeAmbience(this.frame.moodId);
    if (requested === this.ambienceAssetId && this.ambienceSource) return;
    void this.ensureAssets([requested, audioAssetForBiomeAccent(this.frame.moodId)]).then(() => {
      if (this.disposed || requested !== audioAssetForBiomeAmbience(this.frame.moodId)) return;
      this.startAmbience(requested);
      this.biomeAccentTimer = 7 + Math.random() * 8;
    });
  }

  private startAmbience(assetId: AudioAssetId): void {
    const context = this.context;
    const destination = this.groups.get("ambience");
    const buffer = this.buffers.get(assetId);
    if (!context || !destination || !buffer || this.disposed) return;
    if (this.ambienceSource && this.ambienceAssetId === assetId) return;
    const now = context.currentTime;
    const fadingSource = this.ambienceSource;
    const fadingGain = this.ambienceGain;
    if (fadingSource && fadingGain) {
      fadingGain.gain.cancelScheduledValues(now);
      fadingGain.gain.setValueAtTime(Math.max(SILENT_GAIN, fadingGain.gain.value), now);
      fadingGain.gain.linearRampToValueAtTime(SILENT_GAIN, now + MUSIC_FADE_SEC);
      globalThis.setTimeout(
        () => {
          try {
            fadingSource.stop();
          } catch {
            // Source already stopped.
          }
          fadingSource.disconnect();
          fadingGain.disconnect();
        },
        MUSIC_FADE_SEC * 1000 + 40,
      );
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    gain.gain.value = SILENT_GAIN;
    gain.gain.setValueAtTime(SILENT_GAIN, now);
    gain.gain.linearRampToValueAtTime(getAudioAsset(assetId).gain, now + MUSIC_FADE_SEC);
    source.connect(gain).connect(destination);
    source.start();
    source.onended = () => {
      if (this.ambienceSource === source) {
        this.ambienceSource = null;
        this.ambienceGain = null;
        this.ambienceAssetId = null;
      }
    };
    this.ambienceSource = source;
    this.ambienceGain = gain;
    this.ambienceAssetId = assetId;
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

  private playAsset(
    id: AudioAssetId,
    position?: AudioPosition,
    gainScale = 1,
    delaySeconds = 0,
  ): void {
    const context = this.context;
    const asset = getAudioAsset(id);
    const buffer = this.buffers.get(id);
    const destination = this.groups.get(asset.group);
    if (
      !context ||
      context.state !== "running" ||
      !destination ||
      this.muted ||
      (this.paused && asset.group !== "ui")
    ) {
      return;
    }
    if (!buffer) {
      this.pendingPlayback.set(id, {
        position: position ? { ...position } : undefined,
        gainScale,
        delaySeconds,
      });
      if (!this.pendingPlaybackWaiters.has(id)) {
        this.pendingPlaybackWaiters.add(id);
        void this.ensureAsset(id).then((loaded) => {
          const pending = this.pendingPlayback.get(id);
          this.pendingPlayback.delete(id);
          this.pendingPlaybackWaiters.delete(id);
          if (loaded && pending) {
            this.playAsset(id, pending.position, pending.gainScale, pending.delaySeconds);
          }
        });
      }
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
    const when = context.currentTime + Math.max(0, delaySeconds);
    source.start(when);
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
