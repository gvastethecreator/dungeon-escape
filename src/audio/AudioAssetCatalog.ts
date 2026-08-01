import { MUSIC_ASSET_IDS, type MusicTrack } from "./AudioMusicPolicy";

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

export type CreatureTone = "base" | "cold" | "wet" | "fire" | "weird";
export type CreatureRole = "voice" | "attack";
export type AudioAssetId = string;
export type CollectedPickupKind =
  | "stone"
  | "resolve"
  | "time-freeze"
  | "luminous-ward"
  | "annihilation-pulse"
  | "map"
  | "mobility"
  | "clarity"
  | "swarm-curse"
  | "slow-curse"
  | "frenzy-curse"
  | "gloom-curse";

export interface AudioAssetDefinition {
  readonly file: string;
  readonly group: AudioGroup;
  readonly gain: number;
  readonly spatial?: {
    readonly refDistance: number;
    readonly maxDistance: number;
    readonly rolloff: number;
  };
}

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

function threatAsset(file: string, gain: number, attack: boolean): AudioAssetDefinition {
  return {
    file,
    group: "threat",
    gain,
    spatial: attack ? { ...THREAT_ATTACK_SPATIAL } : { ...THREAT_PRESENCE_SPATIAL },
  };
}

function buildEnemyThreatAssets(): Record<AudioAssetId, AudioAssetDefinition> {
  const assets: Record<AudioAssetId, AudioAssetDefinition> = {};
  for (const kind of CREATURE_VOICES) {
    const gains = CREATURE_GAIN[kind];
    for (let take = 0; take < 3; take++) {
      assets[`enemy-${kind}-v${take}`] = threatAsset(
        `enemy-${kind}-v${take}.opus`,
        gains.voice,
        false,
      );
      assets[`enemy-${kind}-attack-v${take}`] = threatAsset(
        `enemy-${kind}-attack-v${take}.opus`,
        gains.attack,
        true,
      );
    }
    for (const tone of CREATURE_TONES) {
      assets[`enemy-${kind}-${tone}`] = threatAsset(
        `enemy-${kind}-${tone}.opus`,
        gains.voice,
        false,
      );
      assets[`enemy-${kind}-attack-${tone}`] = threatAsset(
        `enemy-${kind}-attack-${tone}.opus`,
        gains.attack,
        true,
      );
    }
  }
  return assets;
}

const AUDIO_ASSETS: Readonly<Record<AudioAssetId, AudioAssetDefinition>> = {
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
  "music-biome-ancient-portal": {
    file: "music-biome-ancient-portal.ogg",
    group: "music",
    gain: 0.4,
  },
  "music-biome-molten-portal": {
    file: "music-biome-molten-portal.ogg",
    group: "music",
    gain: 0.38,
  },
  "music-biome-frost-portal": { file: "music-biome-frost-portal.ogg", group: "music", gain: 0.4 },
  "music-biome-grim-portal": { file: "music-biome-grim-portal.ogg", group: "music", gain: 0.4 },
  "music-biome-verdant-portal": {
    file: "music-biome-verdant-portal.ogg",
    group: "music",
    gain: 0.4,
  },
  "music-biome-ash-portal": { file: "music-biome-ash-portal.ogg", group: "music", gain: 0.4 },
  "music-biome-iron-portal": { file: "music-biome-iron-portal.ogg", group: "music", gain: 0.38 },
  "music-biome-obsidian-portal": {
    file: "music-biome-obsidian-portal.ogg",
    group: "music",
    gain: 0.4,
  },
  "music-biome-sunken-portal": { file: "music-biome-sunken-portal.ogg", group: "music", gain: 0.4 },
  "music-biome-fungal-portal": { file: "music-biome-fungal-portal.ogg", group: "music", gain: 0.4 },
  "music-biome-backrooms-portal": {
    file: "music-biome-backrooms-portal.ogg",
    group: "music",
    gain: 0.39,
  },
};

const MUSIC_ASSETS: Readonly<Record<MusicTrack, AudioAssetId>> = MUSIC_ASSET_IDS;

function buildCreatureTakeTable(
  role: CreatureRole,
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

function buildCreatureToneTable(
  role: CreatureRole,
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

const PICKUP_ASSETS: Readonly<Record<CollectedPickupKind, AudioAssetId>> = {
  stone: "pickup-stone",
  resolve: "pickup-resolve",
  "time-freeze": "pickup-time-freeze",
  "luminous-ward": "pickup-ward",
  "annihilation-pulse": "pickup-ward",
  map: "pickup-stone",
  mobility: "pickup-resolve",
  clarity: "pickup-time-freeze",
  "swarm-curse": "pickup-ward",
  "slow-curse": "pickup-ward",
  "frenzy-curse": "pickup-ward",
  "gloom-curse": "pickup-ward",
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
  ui: 0.28,
  music: 0.48,
};

const AUDIO_ASSET_ENTRIES = Object.entries(AUDIO_ASSETS) as [AudioAssetId, AudioAssetDefinition][];

export function listAudioAssets(): readonly [AudioAssetId, AudioAssetDefinition][] {
  return AUDIO_ASSET_ENTRIES;
}

export function audioAssetCount(): number {
  return AUDIO_ASSET_ENTRIES.length;
}

export function getAudioAsset(id: AudioAssetId): AudioAssetDefinition {
  const asset = AUDIO_ASSETS[id];
  if (!asset) throw new Error(`Unknown audio asset: ${id}`);
  return asset;
}

export function audioAssetForCue(cue: Exclude<AudioCue, "step" | "pickup">): AudioAssetId {
  return CUE_ASSETS[cue];
}

export function audioAssetForPickup(kind: CollectedPickupKind): AudioAssetId {
  return PICKUP_ASSETS[kind];
}

export function audioAssetForMusic(track: MusicTrack): AudioAssetId {
  return MUSIC_ASSETS[track];
}

export function createAudioGroupLevels(): Record<AudioGroup, number> {
  return { ...GROUP_LEVELS };
}

export function creatureBaseTakes(
  voice: CreatureVoice,
  role: CreatureRole,
): readonly AudioAssetId[] {
  return role === "voice" ? CREATURE_VOICE_TAKES[voice] : CREATURE_ATTACK_TAKES[voice];
}

export function creatureToneAsset(
  voice: CreatureVoice,
  role: CreatureRole,
  tone: Exclude<CreatureTone, "base">,
): AudioAssetId {
  return role === "voice" ? CREATURE_VOICE_TONES[tone][voice] : CREATURE_ATTACK_TONES[tone][voice];
}
