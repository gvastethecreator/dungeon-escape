/** Asset-backed dungeon mix. Sources live in public/assets/audio/dungeon. */

import type { FootstepSurface } from "./FootstepSurface";

export type AudioCue =
  | "ui"
  | "mode"
  | "forge"
  | "spawn"
  | "step"
  | "pickup"
  | "damage"
  | "win"
  | "lose"
  | "enemyGrowl"
  | "enemyAttack"
  | "torch"
  | "portal";

export type AudioGroup = "sfx" | "ui" | "ambience" | "threat";

export interface AudioPosition {
  x: number;
  y: number;
  z: number;
}

export interface AudioAnchor extends AudioPosition {
  id: string;
}

export type CreatureVoice =
  | "beast"
  | "demon"
  | "insect"
  | "ooze"
  | "spectral"
  | "undead"
  | "vermin";

export interface EnemyAudioAnchor extends AudioAnchor {
  voice: CreatureVoice;
}

export interface DungeonAudioFrame {
  fires: AudioAnchor[];
  magicStones: AudioAnchor[];
  enemies: EnemyAudioAnchor[];
  portal: AudioAnchor | null;
}

export interface CollectedPickupAudio {
  kind: "stone" | "resolve" | "time-freeze" | "luminous-ward";
  position: AudioPosition;
}

interface AssetDefinition {
  file: string;
  group: AudioGroup;
  gain: number;
  spatial?: {
    refDistance: number;
    maxDistance: number;
    rolloff: number;
  };
}

const AUDIO_ASSETS = {
  "ambience-cave": { file: "ambience-cave.opus", group: "ambience", gain: 0.62 },
  "torch-crackle": {
    file: "torch-crackle.opus",
    group: "ambience",
    gain: 0.72,
    spatial: { refDistance: 2.2, maxDistance: 17, rolloff: 1.5 },
  },
  "step-stone-a": { file: "step-stone-a.opus", group: "sfx", gain: 0.11 },
  "step-stone-b": { file: "step-stone-b.opus", group: "sfx", gain: 0.1 },
  "step-water-a": { file: "step-water-a.opus", group: "sfx", gain: 0.16 },
  "step-water-b": { file: "step-water-b.opus", group: "sfx", gain: 0.14 },
  "ui-metal": { file: "ui-metal.opus", group: "ui", gain: 0.5 },
  "pickup-stone": {
    file: "pickup-stone.opus",
    group: "sfx",
    gain: 0.72,
    spatial: { refDistance: 1.5, maxDistance: 13, rolloff: 1.25 },
  },
  "pickup-resolve": {
    file: "pickup-resolve.opus",
    group: "sfx",
    gain: 0.55,
    spatial: { refDistance: 1.5, maxDistance: 11, rolloff: 1.25 },
  },
  "enemy-alert": {
    file: "enemy-alert.opus",
    group: "threat",
    gain: 0.55,
    spatial: { refDistance: 2.3, maxDistance: 24, rolloff: 1.35 },
  },
  "enemy-growl": {
    file: "enemy-growl.opus",
    group: "threat",
    gain: 0.66,
    spatial: { refDistance: 1.8, maxDistance: 19, rolloff: 1.45 },
  },
  "enemy-attack": {
    file: "enemy-attack.opus",
    group: "threat",
    gain: 0.78,
    spatial: { refDistance: 1.25, maxDistance: 16, rolloff: 1.25 },
  },
  "enemy-demon": {
    file: "enemy-demon.opus",
    group: "threat",
    gain: 0.52,
    spatial: { refDistance: 1.8, maxDistance: 19, rolloff: 1.45 },
  },
  "enemy-insect": {
    file: "enemy-insect.opus",
    group: "threat",
    gain: 0.44,
    spatial: { refDistance: 1.7, maxDistance: 17, rolloff: 1.5 },
  },
  "enemy-ooze": {
    file: "enemy-ooze.opus",
    group: "threat",
    gain: 0.48,
    spatial: { refDistance: 1.7, maxDistance: 18, rolloff: 1.45 },
  },
  "enemy-vermin": {
    file: "enemy-vermin.opus",
    group: "threat",
    gain: 0.4,
    spatial: { refDistance: 1.4, maxDistance: 13, rolloff: 1.55 },
  },
  "door-open": {
    file: "door-open.opus",
    group: "sfx",
    gain: 0.46,
    spatial: { refDistance: 2, maxDistance: 18, rolloff: 1.4 },
  },
  "door-close": {
    file: "door-close.opus",
    group: "sfx",
    gain: 0.5,
    spatial: { refDistance: 2, maxDistance: 18, rolloff: 1.4 },
  },
  damage: { file: "damage.opus", group: "sfx", gain: 0.68 },
  "portal-open": {
    file: "portal-open.opus",
    group: "sfx",
    gain: 0.76,
    spatial: { refDistance: 3.5, maxDistance: 28, rolloff: 1.2 },
  },
} as const satisfies Record<string, AssetDefinition>;

type AudioAssetId = keyof typeof AUDIO_ASSETS;

const CREATURE_VOICE_ASSETS: Readonly<Record<CreatureVoice, AudioAssetId>> = {
  beast: "enemy-alert",
  demon: "enemy-demon",
  insect: "enemy-insect",
  ooze: "enemy-ooze",
  spectral: "enemy-attack",
  undead: "enemy-growl",
  vermin: "enemy-vermin",
};

const CUE_ASSETS: Readonly<Record<Exclude<AudioCue, "step" | "pickup">, AudioAssetId>> = {
  ui: "ui-metal",
  mode: "ui-metal",
  forge: "ui-metal",
  spawn: "portal-open",
  damage: "damage",
  win: "portal-open",
  lose: "damage",
  enemyGrowl: "enemy-growl",
  enemyAttack: "enemy-attack",
  torch: "torch-crackle",
  portal: "portal-open",
};

const GROUP_LEVELS: Readonly<Record<AudioGroup, number>> = {
  ambience: 0.6,
  sfx: 0.84,
  threat: 0.72,
  ui: 0.58,
};

const SILENT_GAIN = 0.0001;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Small mixer with asset loading, group gain, a limiter, and one-shot HRTF sources.
 * It owns sound presentation only; DungeonWorld remains the source of game state.
 */
export class GameAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly groups = new Map<AudioGroup, GainNode>();
  private readonly groupLevels: Record<AudioGroup, number> = { ...GROUP_LEVELS };
  private readonly buffers = new Map<AudioAssetId, AudioBuffer>();
  private loadPromise: Promise<void> | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private muted = false;
  private paused = true;
  private disposed = false;
  private threatIntensity = 0;
  private threatCooldown = 0;
  private torchTimer = 1.4;
  private stepVariant = 0;
  private lastThreatBand = 0;
  private frame: DungeonAudioFrame = { fires: [], magicStones: [], enemies: [], portal: null };
  private listener: AudioPosition = { x: 0, y: 0, z: 0 };

  get isUnlocked(): boolean {
    return this.context?.state === "running";
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isReady(): boolean {
    return this.buffers.size === Object.keys(AUDIO_ASSETS).length;
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
    this.playAsset(CUE_ASSETS[cue]);
  }

  playFootstep(surface: FootstepSurface): void {
    const alternate = this.stepVariant++ % 2 === 1;
    const asset: AudioAssetId =
      surface === "water"
        ? alternate
          ? "step-water-b"
          : "step-water-a"
        : alternate
          ? "step-stone-b"
          : "step-stone-a";
    this.playAsset(asset);
  }

  playDoor(kind: "open" | "close", position: AudioPosition): void {
    this.playAsset(kind === "open" ? "door-open" : "door-close", position);
  }

  playPickup(pickup: CollectedPickupAudio | null): void {
    if (!pickup) {
      this.play("pickup");
      return;
    }
    this.playAsset(
      pickup.kind === "stone" || pickup.kind === "luminous-ward"
        ? "pickup-stone"
        : "pickup-resolve",
      pickup.position,
    );
  }

  playPortal(position: AudioPosition | null): void {
    this.playAsset("portal-open", position ?? undefined);
  }

  /** Enemy attack stays at the attacker; damage feedback stays on the player. */
  playEnemyHit(position: AudioPosition | null = null, voice: CreatureVoice | null = null): void {
    const nearest = this.nearestEnemy();
    this.playAsset(
      voice
        ? CREATURE_VOICE_ASSETS[voice]
        : nearest
          ? CREATURE_VOICE_ASSETS[nearest.voice]
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
    const gain = this.groups.get(group);
    const context = this.context;
    if (!gain || !context) return;
    this.groupLevels[group] = clamp(value, 0, 1);
    gain.gain.setTargetAtTime(this.groupLevels[group], context.currentTime, 0.04);
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
    const now = context.currentTime;
    const listener = context.listener;
    listener.positionX.setValueAtTime(position.x, now);
    listener.positionY.setValueAtTime(position.y, now);
    listener.positionZ.setValueAtTime(position.z, now);
    listener.forwardX.setValueAtTime(forward.x, now);
    listener.forwardY.setValueAtTime(forward.y, now);
    listener.forwardZ.setValueAtTime(forward.z, now);
  }

  syncWorld(frame: DungeonAudioFrame): void {
    this.frame = frame;
  }

  /** Continuous enemy proximity. Calls remain safe before unlock. */
  setThreatDistance(distance: number | null): void {
    let intensity = 0;
    if (distance !== null && Number.isFinite(distance)) {
      intensity = 1 - clamp((distance - 2.2) / 12.8, 0, 1);
      intensity *= intensity;
    }
    this.threatIntensity = intensity;
    const band = intensity > 0.72 ? 3 : intensity > 0.42 ? 2 : intensity > 0.18 ? 1 : 0;
    if (band > this.lastThreatBand && band >= 2 && this.threatCooldown <= 0) {
      const threat = this.nearestEnemy();
      this.playAsset(
        threat ? CREATURE_VOICE_ASSETS[threat.voice] : band === 3 ? "enemy-attack" : "enemy-growl",
        threat ?? undefined,
      );
      this.threatCooldown = band === 3 ? 1.25 : 2.4;
    }
    this.lastThreatBand = band;
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
    if (this.threatIntensity > 0.34 && this.threatCooldown <= 0 && Math.random() < delta * 0.25) {
      const threat = this.nearestEnemy(22);
      if (threat) this.playAsset(CREATURE_VOICE_ASSETS[threat.voice], threat);
      this.threatCooldown = 3.6 + Math.random() * 2.8;
    }
  }

  dispose(): void {
    this.disposed = true;
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
    for (const group of Object.keys(GROUP_LEVELS) as AudioGroup[]) {
      const gain = context.createGain();
      gain.gain.value = group === "ui" ? this.groupLevels[group] : SILENT_GAIN;
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
    const entries = Object.entries(AUDIO_ASSETS) as [AudioAssetId, AssetDefinition][];
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
    gain.gain.value = AUDIO_ASSETS["ambience-cave"].gain;
    source.connect(gain).connect(destination);
    source.start();
    source.onended = () => {
      if (this.ambienceSource === source) this.ambienceSource = null;
    };
    this.ambienceSource = source;
  }

  private playAsset(id: AudioAssetId, position?: AudioPosition): void {
    const context = this.context;
    const asset: AssetDefinition = AUDIO_ASSETS[id];
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
    gain.gain.value = asset.gain;
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
      panner.positionX.setValueAtTime(position.x, context.currentTime);
      panner.positionY.setValueAtTime(position.y, context.currentTime);
      panner.positionZ.setValueAtTime(position.z, context.currentTime);
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
      const active = group === "ui" || !this.paused;
      gain.gain.setTargetAtTime(active ? this.groupLevels[group] : SILENT_GAIN, now, 0.12);
    }
  }
}
