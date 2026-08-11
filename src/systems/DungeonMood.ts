import type { DungeonData } from "../dungeon/types";
import { isBiomeId, listBiomeIds, parseBiomeId, type BiomeId } from "./BiomeIdentity";

/** Dungeon-wide look: forge theme when present, else profile/seed. */
export type DungeonMoodId = BiomeId;

/**
 * Interior lighting response for one biome.
 * Authored colors stay in the palette fields; these scales drive LightingRig /
 * AtmosphereSystem so bright albedo biomes (frost ice) cannot wash the frame.
 */
export interface DungeonMood {
  id: DungeonMoodId;
  label: string;
  fog: number;
  fogDensity: number;
  background: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  keyColor: number;
  keyIntensity: number;
  rimColor: number;
  rimIntensity: number;
  /** Multiplies base room surface palettes (1,1,1 neutral). */
  surfaceTint: number;
  surfaceStrength: number;
  mistColor: number;
  dustColor: number;
  dustFineColor: number;
  lanternColor: number;
  /** Biome response for the player's short radial exploration light. */
  playerLightScale: number;
  /** Added to tone-mapping exposure after light-level slider. */
  exposureBias: number;
  /**
   * Scene IBL strength (RoomEnvironment PMREM). Keep low for interiors so
   * metals get a read without outdoor studio wash.
   */
  environmentIntensity: number;
  /**
   * Final albedo gain on room surfaces after mood tint.
   * Frost ice maps average ~2× other biomes — gain < 1 restores interior contrast.
   */
  albedoGain: number;
  /** Hemisphere bounce scale applied in LightingRig (practical fires win form). */
  bounceScale: number;
  /** Directional key scale. */
  keyScale: number;
  /** Directional rim scale. */
  rimScale: number;
  /** Multiplies fogDensity for FogExp2 base. */
  fogMul: number;
  /** Multiplies environmentIntensity when IBL is bound. */
  iblScale: number;
  /** Soft volumetric ground-fog density scale. */
  volumeFogMul: number;
  /** Peak dust mote opacity scale (bright ice dust must stay faint). */
  dustOpacityScale: number;
  /** Editor map floor overlay (rgba via alpha). */
  editorFloorTint: string;
  editorWallTint: string;
  editorCorridorTint: string;
}

const MOODS: Record<DungeonMoodId, DungeonMood> = {
  ancient: {
    id: "ancient",
    label: "Ancient",
    fog: 0x06070c,
    fogDensity: 0.04,
    background: 0x05060a,
    hemiSky: 0x5a6578,
    hemiGround: 0x08090e,
    hemiIntensity: 0.5,
    keyColor: 0xf0dcc0,
    keyIntensity: 0.44,
    rimColor: 0x405060,
    rimIntensity: 0.2,
    surfaceTint: 0xb8c0d0,
    surfaceStrength: 0.48,
    mistColor: 0x8a96b0,
    dustColor: 0xc8d0e0,
    dustFineColor: 0xa8b4c8,
    lanternColor: 0xc8a070,
    playerLightScale: 1,
    exposureBias: 0.04,
    environmentIntensity: 0.18,
    albedoGain: 0.98,
    bounceScale: 0.72,
    keyScale: 0.56,
    rimScale: 0.38,
    fogMul: 1,
    iblScale: 0.64,
    volumeFogMul: 1.05,
    dustOpacityScale: 0.95,
    editorFloorTint: "rgba(90, 100, 120, 0.22)",
    editorWallTint: "rgba(12, 14, 20, 0.4)",
    editorCorridorTint: "rgba(40, 48, 62, 0.32)",
  },
  molten: {
    id: "molten",
    label: "Molten",
    fog: 0x140804,
    fogDensity: 0.048,
    background: 0x0a0504,
    hemiSky: 0x7a4028,
    hemiGround: 0x120402,
    hemiIntensity: 0.46,
    keyColor: 0xffc8a0,
    keyIntensity: 0.38,
    rimColor: 0x903018,
    rimIntensity: 0.22,
    surfaceTint: 0xf0b888,
    surfaceStrength: 0.55,
    mistColor: 0xb07048,
    dustColor: 0xffb070,
    dustFineColor: 0xe88848,
    lanternColor: 0xff9860,
    playerLightScale: 0.95,
    exposureBias: 0.05,
    environmentIntensity: 0.15,
    albedoGain: 1.05,
    bounceScale: 0.72,
    keyScale: 0.6,
    rimScale: 0.4,
    fogMul: 0.96,
    iblScale: 0.58,
    volumeFogMul: 1.18,
    dustOpacityScale: 0.9,
    editorFloorTint: "rgba(140, 70, 30, 0.28)",
    editorWallTint: "rgba(40, 12, 6, 0.42)",
    editorCorridorTint: "rgba(90, 40, 18, 0.34)",
  },
  /**
   * Frost ice maps are ~2× brighter than other biomes. Keep cold blue read
   * while forcing dark corridors: lower bounce/key/IBL, denser fog, albedo cut.
   */
  frost: {
    id: "frost",
    label: "Frost",
    fog: 0x050a12,
    fogDensity: 0.05,
    background: 0x03070e,
    hemiSky: 0x3a5470,
    hemiGround: 0x060a12,
    hemiIntensity: 0.38,
    keyColor: 0x9eb8d4,
    keyIntensity: 0.3,
    rimColor: 0x2a4058,
    rimIntensity: 0.16,
    surfaceTint: 0x6a849c,
    surfaceStrength: 0.62,
    mistColor: 0x5a7898,
    dustColor: 0x88a0b8,
    dustFineColor: 0x6888a4,
    lanternColor: 0x88b0d0,
    playerLightScale: 1.05,
    exposureBias: 0.02,
    environmentIntensity: 0.11,
    albedoGain: 0.82,
    bounceScale: 0.72,
    keyScale: 0.6,
    rimScale: 0.3,
    fogMul: 0.96,
    iblScale: 0.56,
    volumeFogMul: 1.22,
    dustOpacityScale: 0.55,
    editorFloorTint: "rgba(70, 100, 130, 0.28)",
    editorWallTint: "rgba(8, 14, 24, 0.45)",
    editorCorridorTint: "rgba(40, 58, 80, 0.36)",
  },
  grim: {
    id: "grim",
    label: "Grim",
    fog: 0x081008,
    fogDensity: 0.048,
    background: 0x050805,
    hemiSky: 0x3a5038,
    hemiGround: 0x060805,
    hemiIntensity: 0.46,
    keyColor: 0xa8c098,
    keyIntensity: 0.36,
    rimColor: 0x304028,
    rimIntensity: 0.16,
    surfaceTint: 0x98b088,
    surfaceStrength: 0.52,
    mistColor: 0x6a9860,
    dustColor: 0xa8c878,
    dustFineColor: 0x88a860,
    lanternColor: 0xb0a060,
    playerLightScale: 1.1,
    exposureBias: 0.04,
    environmentIntensity: 0.13,
    albedoGain: 1,
    bounceScale: 0.72,
    keyScale: 0.58,
    rimScale: 0.34,
    fogMul: 0.98,
    iblScale: 0.58,
    volumeFogMul: 1.18,
    dustOpacityScale: 0.85,
    editorFloorTint: "rgba(70, 95, 55, 0.26)",
    editorWallTint: "rgba(8, 14, 8, 0.42)",
    editorCorridorTint: "rgba(40, 55, 35, 0.34)",
  },
  verdant: {
    id: "verdant",
    label: "Verdant",
    fog: 0x07120c,
    fogDensity: 0.041,
    background: 0x050a07,
    hemiSky: 0x3a6854,
    hemiGround: 0x06100a,
    hemiIntensity: 0.5,
    keyColor: 0xc0e0b0,
    keyIntensity: 0.42,
    rimColor: 0x284838,
    rimIntensity: 0.18,
    surfaceTint: 0x98c090,
    surfaceStrength: 0.5,
    mistColor: 0x68b888,
    dustColor: 0xa8d8a0,
    dustFineColor: 0x88c090,
    lanternColor: 0xc8b070,
    playerLightScale: 1,
    exposureBias: 0.03,
    environmentIntensity: 0.16,
    albedoGain: 1.02,
    bounceScale: 0.72,
    keyScale: 0.58,
    rimScale: 0.36,
    fogMul: 1,
    iblScale: 0.6,
    volumeFogMul: 1.08,
    dustOpacityScale: 0.9,
    editorFloorTint: "rgba(60, 110, 70, 0.24)",
    editorWallTint: "rgba(8, 18, 12, 0.4)",
    editorCorridorTint: "rgba(35, 70, 45, 0.32)",
  },
  ash: {
    id: "ash",
    label: "Ash",
    fog: 0x0a0806,
    fogDensity: 0.04,
    background: 0x070605,
    hemiSky: 0x6a6058,
    hemiGround: 0x0a0806,
    hemiIntensity: 0.46,
    keyColor: 0xe0d0b8,
    keyIntensity: 0.38,
    rimColor: 0x504838,
    rimIntensity: 0.16,
    surfaceTint: 0xd0c0a8,
    surfaceStrength: 0.42,
    mistColor: 0xa89880,
    dustColor: 0xc0b090,
    dustFineColor: 0xa09078,
    lanternColor: 0xc89858,
    playerLightScale: 1,
    exposureBias: 0.04,
    environmentIntensity: 0.14,
    albedoGain: 1,
    bounceScale: 0.73,
    keyScale: 0.6,
    rimScale: 0.36,
    fogMul: 1,
    iblScale: 0.6,
    volumeFogMul: 1.0,
    dustOpacityScale: 1.0,
    editorFloorTint: "rgba(90, 78, 60, 0.22)",
    editorWallTint: "rgba(14, 12, 10, 0.38)",
    editorCorridorTint: "rgba(50, 44, 36, 0.3)",
  },
  iron: {
    id: "iron",
    label: "Iron",
    fog: 0x070809,
    fogDensity: 0.044,
    background: 0x040505,
    hemiSky: 0x5a6264,
    hemiGround: 0x070809,
    hemiIntensity: 0.46,
    keyColor: 0xc0c0b8,
    keyIntensity: 0.38,
    rimColor: 0x384048,
    rimIntensity: 0.2,
    surfaceTint: 0xa8acb0,
    surfaceStrength: 0.46,
    mistColor: 0x889098,
    dustColor: 0xa8a090,
    dustFineColor: 0x888880,
    lanternColor: 0xb89868,
    playerLightScale: 1,
    exposureBias: 0.03,
    environmentIntensity: 0.18,
    albedoGain: 0.98,
    bounceScale: 0.72,
    keyScale: 0.58,
    rimScale: 0.4,
    fogMul: 1,
    iblScale: 0.64,
    volumeFogMul: 1.08,
    dustOpacityScale: 0.92,
    editorFloorTint: "rgba(70, 76, 80, 0.24)",
    editorWallTint: "rgba(10, 12, 14, 0.4)",
    editorCorridorTint: "rgba(40, 44, 48, 0.32)",
  },
  obsidian: {
    id: "obsidian",
    label: "Obsidian",
    fog: 0x09050d,
    fogDensity: 0.052,
    background: 0x040306,
    hemiSky: 0x4c2858,
    hemiGround: 0x080309,
    hemiIntensity: 0.38,
    keyColor: 0xcf9fd2,
    keyIntensity: 0.32,
    rimColor: 0x76284e,
    rimIntensity: 0.25,
    surfaceTint: 0xb77ab7,
    surfaceStrength: 0.5,
    mistColor: 0x774868,
    dustColor: 0xc17d9c,
    dustFineColor: 0x8f527b,
    lanternColor: 0xe06c58,
    playerLightScale: 1.12,
    exposureBias: 0.05,
    environmentIntensity: 0.12,
    albedoGain: 1.16,
    bounceScale: 0.75,
    keyScale: 0.64,
    rimScale: 0.46,
    fogMul: 0.95,
    iblScale: 0.62,
    volumeFogMul: 1.14,
    dustOpacityScale: 0.82,
    editorFloorTint: "rgba(88, 38, 96, 0.28)",
    editorWallTint: "rgba(13, 7, 18, 0.45)",
    editorCorridorTint: "rgba(59, 25, 70, 0.35)",
  },
  sunken: {
    id: "sunken",
    label: "Sunken",
    fog: 0x041213,
    fogDensity: 0.047,
    background: 0x03090a,
    hemiSky: 0x315f60,
    hemiGround: 0x041010,
    hemiIntensity: 0.44,
    keyColor: 0x98ceca,
    keyIntensity: 0.34,
    rimColor: 0x1f5960,
    rimIntensity: 0.23,
    surfaceTint: 0x77aaa2,
    surfaceStrength: 0.55,
    mistColor: 0x4d8d89,
    dustColor: 0x8bc4b5,
    dustFineColor: 0x5fa095,
    lanternColor: 0x6fc7ba,
    playerLightScale: 1.08,
    exposureBias: 0.05,
    environmentIntensity: 0.14,
    albedoGain: 1,
    bounceScale: 0.72,
    keyScale: 0.62,
    rimScale: 0.42,
    fogMul: 0.98,
    iblScale: 0.6,
    volumeFogMul: 1.28,
    dustOpacityScale: 0.7,
    editorFloorTint: "rgba(45, 108, 105, 0.3)",
    editorWallTint: "rgba(4, 20, 22, 0.44)",
    editorCorridorTint: "rgba(28, 75, 76, 0.36)",
  },
  fungal: {
    id: "fungal",
    label: "Fungal",
    fog: 0x100916,
    fogDensity: 0.049,
    background: 0x08050c,
    hemiSky: 0x5f3f70,
    hemiGround: 0x0f0714,
    hemiIntensity: 0.42,
    keyColor: 0xc9afd8,
    keyIntensity: 0.33,
    rimColor: 0x3f9b8f,
    rimIntensity: 0.25,
    surfaceTint: 0xb48fbe,
    surfaceStrength: 0.54,
    mistColor: 0x855f94,
    dustColor: 0x78d6c0,
    dustFineColor: 0xa17bc0,
    lanternColor: 0x68d8bd,
    playerLightScale: 1.05,
    exposureBias: 0.05,
    environmentIntensity: 0.13,
    albedoGain: 1.05,
    bounceScale: 0.74,
    keyScale: 0.64,
    rimScale: 0.45,
    fogMul: 0.98,
    iblScale: 0.58,
    volumeFogMul: 1.22,
    dustOpacityScale: 1.08,
    editorFloorTint: "rgba(95, 55, 108, 0.3)",
    editorWallTint: "rgba(20, 9, 27, 0.43)",
    editorCorridorTint: "rgba(62, 40, 78, 0.35)",
  },
  backrooms: {
    id: "backrooms",
    label: "Backrooms",
    fog: 0x171509,
    fogDensity: 0.019,
    background: 0x0d0c07,
    hemiSky: 0x77704d,
    hemiGround: 0x121006,
    hemiIntensity: 1.42,
    keyColor: 0xe2dcad,
    keyIntensity: 0.9,
    rimColor: 0x8a7e4c,
    rimIntensity: 0.34,
    surfaceTint: 0xd1c47a,
    surfaceStrength: 0.48,
    mistColor: 0x9d9566,
    dustColor: 0xd4ca8c,
    dustFineColor: 0xa79d69,
    lanternColor: 0xe5dda7,
    playerLightScale: 1.08,
    exposureBias: 0.26,
    environmentIntensity: 0.3,
    albedoGain: 1.18,
    bounceScale: 0.62,
    keyScale: 0.7,
    rimScale: 0.55,
    fogMul: 0.92,
    iblScale: 0.82,
    volumeFogMul: 0.58,
    dustOpacityScale: 0.72,
    editorFloorTint: "rgba(132, 116, 60, 0.28)",
    editorWallTint: "rgba(40, 36, 16, 0.42)",
    editorCorridorTint: "rgba(92, 82, 38, 0.34)",
  },
};

const ALL_MOOD_IDS = listBiomeIds();
const FORGE_THEME_IDS = new Set<string>(ALL_MOOD_IDS);
const PROFILE_MOOD: Record<string, DungeonMoodId> = {
  crypt: "grim",
  gauntlet: "molten",
  tight: "iron",
  sprawl: "ancient",
  balanced: "ash",
};
const REGULAR_SEED_ORDER: readonly DungeonMoodId[] = [
  "ancient",
  "molten",
  "frost",
  "grim",
  "verdant",
  "ash",
  "iron",
  "obsidian",
  "sunken",
  "fungal",
];

/** Backrooms share of seeded runs (percent). Rare, but always in the NEW GAME pool. */
const BACKROOMS_SEED_CHANCE = 8;
/** When a generation profile is set, chance to stick to its preferred mood. */
const PROFILE_PREFERENCE_CHANCE = 50;

/**
 * Independent hash channel so rare rolls and mood picks never share the same modulus.
 * Previous logic used `seedHash % 10` for both profile bias and regular pick, which
 * locked the alternate branch to only three biomes (obsidian/sunken/fungal).
 */
function moodChannel(seedHash: number, salt: number): number {
  return Math.imul(Math.abs(seedHash) ^ salt, 2654435761) >>> 0;
}

function pickRegularMood(seedHash: number, salt = 0xb7e15163): DungeonMoodId {
  const index = moodChannel(seedHash, salt) % REGULAR_SEED_ORDER.length;
  return REGULAR_SEED_ORDER[index]!;
}

function pickSeededMood(seedHash: number, preferred: DungeonMoodId | null): DungeonMoodId {
  // Keep the special biome uncommon, but include it in every NEW GAME path.
  if (moodChannel(seedHash, 0xa5a5a5a5) % 100 < BACKROOMS_SEED_CHANCE) {
    return "backrooms";
  }
  if (preferred && moodChannel(seedHash, 0xc3c3c3c3) % 100 < PROFILE_PREFERENCE_CHANCE) {
    return preferred;
  }
  let pick = pickRegularMood(seedHash);
  // Avoid collapsing variety when the random regular equals the profile favorite.
  if (preferred && pick === preferred) {
    pick = pickRegularMood(seedHash, 0x27d4eb2f);
    if (pick === preferred) {
      const idx = REGULAR_SEED_ORDER.indexOf(preferred);
      pick = REGULAR_SEED_ORDER[(idx + 1) % REGULAR_SEED_ORDER.length]!;
    }
  }
  return pick;
}

export function getDungeonMood(id: DungeonMoodId): DungeonMood {
  return MOODS[id];
}

export function listDungeonMoodIds(): readonly DungeonMoodId[] {
  return ALL_MOOD_IDS;
}

/** True when `raw` is a known mood id (case-insensitive). */
export function isDungeonMoodId(raw: string | null | undefined): raw is DungeonMoodId {
  return isBiomeId(raw);
}

/** Parse a mood id from free text (URL param, etc.). */
export function parseDungeonMoodId(raw: string | null | undefined): DungeonMoodId | null {
  return parseBiomeId(raw);
}

/**
 * Rec.709 luminance of a packed RGB hex (0..1).
 * Used by lighting/atmosphere to keep bright mist/ice from bleaching interiors.
 */
export function moodColorLuminance(hex: number): number {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

/**
 * Pick mood from forge theme (play import), editor profile, or seed hash.
 * Same seed + same profile always resolves the same look.
 *
 * Seeded NEW GAME runs can resolve every biome, including backrooms (~8%).
 * Generation profiles only bias the look; they no longer lock out whole biomes.
 */
export function resolveDungeonMood(dungeon: DungeonData, profile?: string): DungeonMood {
  const forgeKey = dungeon.forge?.themeKey?.toLowerCase();
  if (forgeKey && FORGE_THEME_IDS.has(forgeKey)) {
    return MOODS[forgeKey as DungeonMoodId];
  }
  const profileKey = (profile ?? "").toLowerCase();
  const preferred = profileKey && PROFILE_MOOD[profileKey] ? PROFILE_MOOD[profileKey]! : null;
  return MOODS[pickSeededMood(dungeon.seedHash, preferred)];
}
