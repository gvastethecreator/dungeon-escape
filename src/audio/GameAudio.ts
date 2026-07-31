/** Asset-backed dungeon mix. Sources live in public/assets/audio/dungeon. */

import type { FootstepSurface } from "./FootstepSurface";
import { MUSIC_ASSET_IDS, type MusicTrack } from "./AudioMusicPolicy";

export type {
  BiomeMusicTrack,
  BiomePortalMusicTrack,
  MusicTrack,
} from "./AudioMusicPolicy";
export { musicTrackForBiome, MUSIC_ASSET_IDS } from "./AudioMusicPolicy";

export type AudioCue =
  | "ui"
  | "uiClick"
  | "uiTick"
  | "uiHover"
  | "uiSelect"
  | "uiBack"
  | "uiToggle"
  | "uiDeny"
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

export type AudioGroup = "sfx" | "ui" | "ambience" | "threat" | "music";

export interface AudioPosition {
  x: number;
  y: number;
  z: number;
}

export interface AudioAnchor extends AudioPosition {
  id: string;
}

/** One voice profile per enemy kind: presence + attack map to distinct assets. */
export type CreatureVoice =
  | "carrion"
  | "goblin"
  | "ghost"
  | "ratling"
  | "husk"
  | "imp"
  | "zombie-orc"
  | "spider"
  | "bone-slime"
  | "white-eyed-shadow"
  | "carrion-stalker";

/** Biome family used to inject themed enemy skins into the take pool. */
export type CreatureTone = "base" | "cold" | "wet" | "fire" | "weird";

export const CREATURE_VOICES = [
  "carrion",
  "goblin",
  "ghost",
  "ratling",
  "husk",
  "imp",
  "zombie-orc",
  "spider",
  "bone-slime",
  "white-eyed-shadow",
  "carrion-stalker",
] as const satisfies readonly CreatureVoice[];

export const CREATURE_TONES = ["cold", "wet", "fire", "weird"] as const satisfies readonly Exclude<
  CreatureTone,
  "base"
>[];

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
  kind:
    | "stone"
    | "resolve"
    | "time-freeze"
    | "luminous-ward"
    | "annihilation-pulse"
    | "map"
    | "mobility"
    | "clarity";
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

const THREAT_PRESENCE_SPATIAL = {
  refDistance: 1.8,
  maxDistance: 19,
  rolloff: 1.45,
} as const;
const THREAT_ATTACK_SPATIAL = {
  refDistance: 1.25,
  maxDistance: 16,
  rolloff: 1.25,
} as const;

const CREATURE_GAIN: Readonly<Record<CreatureVoice, { voice: number; attack: number }>> = {
  carrion: { voice: 0.74, attack: 0.72 },
  goblin: { voice: 0.78, attack: 0.76 },
  ghost: { voice: 0.7, attack: 0.68 },
  ratling: { voice: 1, attack: 0.95 },
  husk: { voice: 0.68, attack: 0.7 },
  imp: { voice: 0.82, attack: 0.8 },
  "zombie-orc": { voice: 0.72, attack: 0.74 },
  spider: { voice: 0.92, attack: 0.9 },
  "bone-slime": { voice: 0.73, attack: 0.75 },
  "white-eyed-shadow": { voice: 0.7, attack: 0.72 },
  "carrion-stalker": { voice: 0.76, attack: 0.74 },
};

function threatAsset(file: string, gain: number, attack: boolean): AssetDefinition {
  return {
    file,
    group: "threat",
    gain,
    spatial: attack ? { ...THREAT_ATTACK_SPATIAL } : { ...THREAT_PRESENCE_SPATIAL },
  };
}

/** Multi-take (v0–v2) plus biome skins (cold/wet/fire/weird) for every kind. */
function buildEnemyThreatAssets(): Record<string, AssetDefinition> {
  const out: Record<string, AssetDefinition> = {};
  for (const kind of CREATURE_VOICES) {
    const gains = CREATURE_GAIN[kind];
    for (let take = 0; take < 3; take++) {
      out[`enemy-${kind}-v${take}`] = threatAsset(
        `enemy-${kind}-v${take}.opus`,
        gains.voice,
        false,
      );
      out[`enemy-${kind}-attack-v${take}`] = threatAsset(
        `enemy-${kind}-attack-v${take}.opus`,
        gains.attack,
        true,
      );
    }
    for (const tone of CREATURE_TONES) {
      out[`enemy-${kind}-${tone}`] = threatAsset(`enemy-${kind}-${tone}.opus`, gains.voice, false);
      out[`enemy-${kind}-attack-${tone}`] = threatAsset(
        `enemy-${kind}-attack-${tone}.opus`,
        gains.attack,
        true,
      );
    }
  }
  return out;
}

/**
 * Per-asset gains are tuned from measured integrated LUFS so effective bus level
 * (file LUFS + asset gain + group gain + master 0.76) sits near the design target.
 * Footsteps stay intentional soft and are not auto-matched to other SFX.
 */
const AUDIO_ASSETS: Record<string, AssetDefinition> = {
  "ambience-cave": { file: "ambience-cave.opus", group: "ambience", gain: 0.7 },
  "torch-crackle": {
    file: "torch-crackle.opus",
    group: "ambience",
    gain: 0.69,
    spatial: { refDistance: 2.2, maxDistance: 17, rolloff: 1.5 },
  },
  "step-stone-a": { file: "step-stone-a.opus", group: "sfx", gain: 0.11 },
  "step-stone-b": { file: "step-stone-b.opus", group: "sfx", gain: 0.1 },
  "step-water-a": { file: "step-water-a.opus", group: "sfx", gain: 0.16 },
  "step-water-b": { file: "step-water-b.opus", group: "sfx", gain: 0.14 },
  "ui-metal": { file: "ui-metal.opus", group: "ui", gain: 0.38 },
  "ui-click": { file: "ui-click.opus", group: "ui", gain: 0.36 },
  "ui-tick": { file: "ui-tick.opus", group: "ui", gain: 0.28 },
  "ui-hover": { file: "ui-hover.opus", group: "ui", gain: 0.18 },
  "ui-select": { file: "ui-select.opus", group: "ui", gain: 0.4 },
  "ui-back": { file: "ui-back.opus", group: "ui", gain: 0.34 },
  "ui-toggle": { file: "ui-toggle.opus", group: "ui", gain: 0.34 },
  "ui-deny": { file: "ui-deny.opus", group: "ui", gain: 0.36 },
  "pickup-stone": {
    file: "pickup-stone.opus",
    group: "sfx",
    gain: 0.77,
    spatial: { refDistance: 1.5, maxDistance: 13, rolloff: 1.25 },
  },
  "pickup-resolve": {
    file: "pickup-resolve.opus",
    group: "sfx",
    gain: 0.85,
    spatial: { refDistance: 1.5, maxDistance: 11, rolloff: 1.25 },
  },
  "pickup-time-freeze": {
    file: "pickup-time-freeze.opus",
    group: "sfx",
    gain: 0.83,
    spatial: { refDistance: 1.6, maxDistance: 14, rolloff: 1.2 },
  },
  "pickup-ward": {
    file: "pickup-ward.opus",
    group: "sfx",
    gain: 0.77,
    spatial: { refDistance: 1.6, maxDistance: 14, rolloff: 1.2 },
  },
  "enemy-growl": {
    file: "enemy-growl.opus",
    group: "threat",
    gain: 0.68,
    spatial: { refDistance: 1.8, maxDistance: 19, rolloff: 1.45 },
  },
  "enemy-attack": {
    file: "enemy-attack.opus",
    group: "threat",
    gain: 0.67,
    spatial: { refDistance: 1.25, maxDistance: 16, rolloff: 1.25 },
  },
  ...buildEnemyThreatAssets(),
  "door-open": {
    file: "door-open.opus",
    group: "sfx",
    gain: 0.67,
    spatial: { refDistance: 2, maxDistance: 18, rolloff: 1.4 },
  },
  "door-close": {
    file: "door-close.opus",
    group: "sfx",
    gain: 0.72,
    spatial: { refDistance: 2, maxDistance: 18, rolloff: 1.4 },
  },
  "chest-open": {
    file: "chest-open.opus",
    group: "sfx",
    gain: 0.67,
    spatial: { refDistance: 1.8, maxDistance: 15, rolloff: 1.35 },
  },
  "chest-reward": {
    file: "chest-reward.opus",
    group: "sfx",
    gain: 0.73,
    spatial: { refDistance: 1.8, maxDistance: 14, rolloff: 1.3 },
  },
  damage: { file: "damage.opus", group: "sfx", gain: 1 },
  lose: { file: "lose.opus", group: "sfx", gain: 0.99 },
  win: { file: "win.opus", group: "sfx", gain: 0.98 },
  "portal-open": {
    file: "portal-open.opus",
    group: "sfx",
    gain: 1,
    spatial: { refDistance: 3.5, maxDistance: 28, rolloff: 1.2 },
  },
  // Menu/win remain soft 8-bit beds; lose and biome beds are Neo-SPC renders.
  "music-menu": { file: "music-menu.opus", group: "music", gain: 0.55 },
  "music-win": { file: "music-win.opus", group: "music", gain: 0.52 },
  "music-lose": { file: "music-lose.ogg", group: "music", gain: 0.48 },
  "music-biome-ancient": { file: "music-biome-ancient.ogg", group: "music", gain: 0.34 },
  "music-biome-molten": { file: "music-biome-molten.ogg", group: "music", gain: 0.32 },
  "music-biome-frost": { file: "music-biome-frost.ogg", group: "music", gain: 0.35 },
  "music-biome-grim": { file: "music-biome-grim.ogg", group: "music", gain: 0.34 },
  "music-biome-verdant": { file: "music-biome-verdant.ogg", group: "music", gain: 0.34 },
  "music-biome-ash": { file: "music-biome-ash.ogg", group: "music", gain: 0.34 },
  "music-biome-iron": { file: "music-biome-iron.ogg", group: "music", gain: 0.32 },
  "music-biome-obsidian": { file: "music-biome-obsidian.ogg", group: "music", gain: 0.34 },
  "music-biome-sunken": { file: "music-biome-sunken.ogg", group: "music", gain: 0.35 },
  "music-biome-fungal": { file: "music-biome-fungal.ogg", group: "music", gain: 0.35 },
  "music-biome-backrooms": { file: "music-biome-backrooms.ogg", group: "music", gain: 0.33 },
  "music-biome-ancient-portal": { file: "music-biome-ancient-portal.ogg", group: "music", gain: 0.4 },
  "music-biome-molten-portal": { file: "music-biome-molten-portal.ogg", group: "music", gain: 0.38 },
  "music-biome-frost-portal": { file: "music-biome-frost-portal.ogg", group: "music", gain: 0.4 },
  "music-biome-grim-portal": { file: "music-biome-grim-portal.ogg", group: "music", gain: 0.4 },
  "music-biome-verdant-portal": { file: "music-biome-verdant-portal.ogg", group: "music", gain: 0.4 },
  "music-biome-ash-portal": { file: "music-biome-ash-portal.ogg", group: "music", gain: 0.4 },
  "music-biome-iron-portal": { file: "music-biome-iron-portal.ogg", group: "music", gain: 0.38 },
  "music-biome-obsidian-portal": { file: "music-biome-obsidian-portal.ogg", group: "music", gain: 0.4 },
  "music-biome-sunken-portal": { file: "music-biome-sunken-portal.ogg", group: "music", gain: 0.4 },
  "music-biome-fungal-portal": { file: "music-biome-fungal-portal.ogg", group: "music", gain: 0.4 },
  "music-biome-backrooms-portal": { file: "music-biome-backrooms-portal.ogg", group: "music", gain: 0.39 },
};

type AudioAssetId = string;

const MUSIC_ASSETS: Readonly<Record<MusicTrack, AudioAssetId>> = MUSIC_ASSET_IDS;

function buildCreatureTakeTable(
  role: "voice" | "attack",
): Readonly<Record<CreatureVoice, readonly AudioAssetId[]>> {
  const table = {} as Record<CreatureVoice, readonly AudioAssetId[]>;
  for (const kind of CREATURE_VOICES) {
    const prefix = role === "voice" ? `enemy-${kind}` : `enemy-${kind}-attack`;
    table[kind] = [`${prefix}-v0`, `${prefix}-v1`, `${prefix}-v2`];
  }
  return table;
}

const CREATURE_VOICE_TAKES = buildCreatureTakeTable("voice");
const CREATURE_ATTACK_TAKES = buildCreatureTakeTable("attack");

/** Biome family → themed presence clip per kind (extra weight in the take pool). */
function buildCreatureToneTable(
  role: "voice" | "attack",
): Readonly<Record<Exclude<CreatureTone, "base">, Readonly<Record<CreatureVoice, AudioAssetId>>>> {
  const table = {} as Record<Exclude<CreatureTone, "base">, Record<CreatureVoice, AudioAssetId>>;
  for (const tone of CREATURE_TONES) {
    const row = {} as Record<CreatureVoice, AudioAssetId>;
    for (const kind of CREATURE_VOICES) {
      row[kind] = role === "voice" ? `enemy-${kind}-${tone}` : `enemy-${kind}-attack-${tone}`;
    }
    table[tone] = row;
  }
  return table;
}

const CREATURE_VOICE_TONES = buildCreatureToneTable("voice");
const CREATURE_ATTACK_TONES = buildCreatureToneTable("attack");

export function creatureToneForMood(moodId: string | null | undefined): CreatureTone {
  const id = (moodId ?? "").trim().toLowerCase();
  if (id === "frost") return "cold";
  if (id === "sunken" || id === "fungal") return "wet";
  if (id === "molten" || id === "obsidian") return "fire";
  if (id === "backrooms") return "weird";
  return "base";
}

const PICKUP_ASSETS: Readonly<Record<CollectedPickupAudio["kind"], AudioAssetId>> = {
  stone: "pickup-stone",
  resolve: "pickup-resolve",
  "time-freeze": "pickup-time-freeze",
  "luminous-ward": "pickup-ward",
  "annihilation-pulse": "pickup-ward",
  map: "pickup-stone",
  mobility: "pickup-resolve",
  clarity: "pickup-time-freeze",
};

const CUE_ASSETS: Readonly<Record<Exclude<AudioCue, "step" | "pickup">, AudioAssetId>> = {
  ui: "ui-click",
  uiClick: "ui-click",
  uiTick: "ui-tick",
  uiHover: "ui-hover",
  uiSelect: "ui-select",
  uiBack: "ui-back",
  uiToggle: "ui-toggle",
  uiDeny: "ui-deny",
  mode: "ui-toggle",
  forge: "ui-metal",
  spawn: "portal-open",
  damage: "damage",
  win: "win",
  lose: "lose",
  enemyGrowl: "enemy-growl",
  enemyAttack: "enemy-attack",
  torch: "torch-crackle",
  portal: "portal-open",
};

const GROUP_LEVELS: Readonly<Record<AudioGroup, number>> = {
  ambience: 0.6,
  sfx: 0.84,
  threat: 0.72,
  // Soft interface bus — clicks should sit under dungeon SFX.
  ui: 0.28,
  // Music stays under SFX and threat so beds never crowd the dungeon.
  music: 0.48,
};

const MUSIC_FADE_SEC = 0.55;

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
  private lastThreatBand = 0;
  private frame: DungeonAudioFrame = {
    fires: [],
    magicStones: [],
    enemies: [],
    portal: null,
    moodId: null,
  };
  private listener: AudioPosition = { x: 0, y: 0, z: 0 };
  /** Last asset id played per creature pool key, to avoid immediate repeats. */
  private readonly lastCreatureTake = new Map<string, AudioAssetId>();

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
    this.playAsset(CUE_ASSETS[cue]);
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
    this.playAsset(PICKUP_ASSETS[pickup.kind], pickup.position);
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
      resolved ? this.pickCreatureAsset(resolved, "attack") : "enemy-attack",
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
        threat
          ? this.pickCreatureAsset(threat.voice, "voice")
          : band === 3
            ? "enemy-attack"
            : "enemy-growl",
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
      if (threat) this.playAsset(this.pickCreatureAsset(threat.voice, "voice"), threat);
      this.threatCooldown = 3.6 + Math.random() * 2.8;
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
    for (const group of Object.keys(GROUP_LEVELS) as AudioGroup[]) {
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
    const assetId = MUSIC_ASSETS[track];
    const buffer = this.buffers.get(assetId);
    if (!buffer) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    const target = AUDIO_ASSETS[assetId].gain;
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

  /**
   * Random take from v0–v2, plus the active biome skin (weighted twice) when the
   * dungeon mood maps to cold/wet/fire/weird. Avoids repeating the last pick.
   */
  private pickCreatureAsset(voice: CreatureVoice, role: "voice" | "attack"): AudioAssetId {
    const base = role === "voice" ? CREATURE_VOICE_TAKES[voice] : CREATURE_ATTACK_TAKES[voice];
    const tone = creatureToneForMood(this.frame.moodId);
    const pool: AudioAssetId[] = [...base];
    if (tone !== "base") {
      const themed =
        role === "voice" ? CREATURE_VOICE_TONES[tone][voice] : CREATURE_ATTACK_TONES[tone][voice];
      // Double-weight the biome skin so themed dungeons read as that biome.
      pool.push(themed, themed);
    }
    const key = `${voice}:${role}`;
    const last = this.lastCreatureTake.get(key);
    let choices = last && pool.length > 1 ? pool.filter((id) => id !== last) : pool;
    if (choices.length === 0) choices = pool;
    const pick = choices[Math.floor(Math.random() * choices.length)] ?? pool[0]!;
    this.lastCreatureTake.set(key, pick);
    return pick;
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
