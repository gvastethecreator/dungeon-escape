/**
 * Pure biome / portal music track resolution.
 * GameAudio owns the mixer; this module owns which bed ID to request.
 */

export type BiomeMusicTrack =
  | "biome-ancient"
  | "biome-molten"
  | "biome-frost"
  | "biome-grim"
  | "biome-verdant"
  | "biome-ash"
  | "biome-iron"
  | "biome-obsidian"
  | "biome-sunken"
  | "biome-fungal"
  | "biome-backrooms";

export type BiomePortalMusicTrack =
  | "biome-ancient-portal"
  | "biome-molten-portal"
  | "biome-frost-portal"
  | "biome-grim-portal"
  | "biome-verdant-portal"
  | "biome-ash-portal"
  | "biome-iron-portal"
  | "biome-obsidian-portal"
  | "biome-sunken-portal"
  | "biome-fungal-portal"
  | "biome-backrooms-portal";

export type MusicTrack = "menu" | "win" | "lose" | BiomeMusicTrack | BiomePortalMusicTrack;

/** Asset ids for every music track key (files live under public/assets/audio/dungeon). */
export const MUSIC_ASSET_IDS: Readonly<Record<MusicTrack, string>> = {
  menu: "music-menu",
  win: "music-win",
  lose: "music-lose",
  "biome-ancient": "music-biome-ancient",
  "biome-molten": "music-biome-molten",
  "biome-frost": "music-biome-frost",
  "biome-grim": "music-biome-grim",
  "biome-verdant": "music-biome-verdant",
  "biome-ash": "music-biome-ash",
  "biome-iron": "music-biome-iron",
  "biome-obsidian": "music-biome-obsidian",
  "biome-sunken": "music-biome-sunken",
  "biome-fungal": "music-biome-fungal",
  "biome-backrooms": "music-biome-backrooms",
  "biome-ancient-portal": "music-biome-ancient-portal",
  "biome-molten-portal": "music-biome-molten-portal",
  "biome-frost-portal": "music-biome-frost-portal",
  "biome-grim-portal": "music-biome-grim-portal",
  "biome-verdant-portal": "music-biome-verdant-portal",
  "biome-ash-portal": "music-biome-ash-portal",
  "biome-iron-portal": "music-biome-iron-portal",
  "biome-obsidian-portal": "music-biome-obsidian-portal",
  "biome-sunken-portal": "music-biome-sunken-portal",
  "biome-fungal-portal": "music-biome-fungal-portal",
  "biome-backrooms-portal": "music-biome-backrooms-portal",
};

export function musicTrackForBiome(
  moodId: string,
  options?: { portalOpen?: boolean },
): BiomeMusicTrack | BiomePortalMusicTrack {
  const normalized = moodId.trim().toLowerCase();
  const base = `biome-${normalized}` as BiomeMusicTrack;
  const exploration: BiomeMusicTrack = base in MUSIC_ASSET_IDS ? base : "biome-ancient";
  if (!options?.portalOpen) return exploration;
  const portal = `${exploration}-portal` as BiomePortalMusicTrack;
  return portal in MUSIC_ASSET_IDS ? portal : "biome-ancient-portal";
}

export function musicAssetIdForTrack(track: MusicTrack): string {
  return MUSIC_ASSET_IDS[track];
}
