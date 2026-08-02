import { normalizePlayerName } from "../leaderboard/contract";
import { LEADERBOARD_PORTRAIT_COUNT, portraitIndexForName } from "../leaderboard/portraits";
import { listBiomeIds, type BiomeId } from "../systems/BiomeIdentity";

export const PLAYER_PROFILE_KEY = "blackflag.dungeon.player.v1";
export const PLAYER_PROFILE_VERSION = 1 as const;
/** Profile name cheat: unlocks every campaign biome on create/rename. */
export const UNLOCK_ALL_BIOMES_PROFILE_NAME = "unlock";

export interface PlayerProfile {
  version: typeof PLAYER_PROFILE_VERSION;
  name: string;
  avatarIndex: number;
  /** The Hall stays out of the first-run flow until one game reaches an ending. */
  hasCompletedRun: boolean;
  /** Highest campaign rank available to start; Ancient is rank zero. */
  highestUnlockedRank: number;
  clears: Partial<Record<BiomeId, number>>;
  updatedAt: number;
}

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function maxCampaignRank(): number {
  return listBiomeIds().length - 1;
}

/** Case-insensitive match after name normalization. */
export function isUnlockAllBiomesProfileName(name: string): boolean {
  return name.toLowerCase() === UNLOCK_ALL_BIOMES_PROFILE_NAME;
}

function startingUnlockedRank(name: string): number {
  return isUnlockAllBiomesProfileName(name) ? maxCampaignRank() : 0;
}

function validAvatarIndex(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < LEADERBOARD_PORTRAIT_COUNT
  );
}

function validRank(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < listBiomeIds().length
  );
}

function parseClears(value: unknown): Partial<Record<BiomeId, number>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const ids = new Set<string>(listBiomeIds());
  const clears: Partial<Record<BiomeId, number>> = {};
  for (const [id, count] of Object.entries(value)) {
    if (
      !ids.has(id) ||
      typeof count !== "number" ||
      !Number.isInteger(count) ||
      count < 0 ||
      count > 9_999
    ) {
      return null;
    }
    if (count > 0) clears[id as BiomeId] = count;
  }
  return clears;
}

function parseProfile(value: unknown): PlayerProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const name = normalizePlayerName(raw.name);
  const clears = parseClears(raw.clears);
  if (
    raw.version !== PLAYER_PROFILE_VERSION ||
    !name ||
    !validAvatarIndex(raw.avatarIndex) ||
    !validRank(raw.highestUnlockedRank) ||
    (raw.hasCompletedRun !== undefined && typeof raw.hasCompletedRun !== "boolean") ||
    !clears ||
    typeof raw.updatedAt !== "number" ||
    !Number.isFinite(raw.updatedAt) ||
    raw.updatedAt < 0
  ) {
    return null;
  }
  const hasCompletedRun =
    raw.hasCompletedRun === true || raw.highestUnlockedRank > 0 || Object.keys(clears).length > 0;
  return {
    version: PLAYER_PROFILE_VERSION,
    name,
    avatarIndex: raw.avatarIndex,
    hasCompletedRun,
    highestUnlockedRank: raw.highestUnlockedRank,
    clears,
    updatedAt: raw.updatedAt,
  };
}

export function createPlayerProfile(
  inputName: unknown,
  avatarIndex?: number,
  updatedAt = Date.now(),
): PlayerProfile | null {
  const name = normalizePlayerName(inputName);
  const resolvedAvatar = avatarIndex ?? (name ? portraitIndexForName(name) : -1);
  if (!name || !validAvatarIndex(resolvedAvatar)) return null;
  return {
    version: PLAYER_PROFILE_VERSION,
    name,
    avatarIndex: resolvedAvatar,
    hasCompletedRun: false,
    highestUnlockedRank: startingUnlockedRank(name),
    clears: {},
    updatedAt,
  };
}

export function updatePlayerIdentity(
  profile: PlayerProfile,
  inputName: unknown,
  avatarIndex: number,
  updatedAt = Date.now(),
): PlayerProfile | null {
  const name = normalizePlayerName(inputName);
  if (!name || !validAvatarIndex(avatarIndex)) return null;
  const highestUnlockedRank = isUnlockAllBiomesProfileName(name)
    ? maxCampaignRank()
    : profile.highestUnlockedRank;
  return { ...profile, name, avatarIndex, highestUnlockedRank, updatedAt };
}

export function isBiomeUnlocked(profile: PlayerProfile, biomeId: BiomeId): boolean {
  const rank = listBiomeIds().indexOf(biomeId);
  return rank >= 0 && rank <= profile.highestUnlockedRank;
}

export function markPlayerRunCompleted(
  profile: PlayerProfile,
  updatedAt = Date.now(),
): PlayerProfile {
  if (profile.hasCompletedRun) return profile;
  return { ...profile, hasCompletedRun: true, updatedAt };
}

export function completeCampaignBiome(
  profile: PlayerProfile,
  biomeId: BiomeId,
  updatedAt = Date.now(),
): PlayerProfile {
  const ids = listBiomeIds();
  const rank = ids.indexOf(biomeId);
  if (rank < 0 || rank > profile.highestUnlockedRank) return profile;
  const clears = {
    ...profile.clears,
    [biomeId]: (profile.clears[biomeId] ?? 0) + 1,
  };
  return {
    ...profile,
    hasCompletedRun: true,
    highestUnlockedRank: Math.min(ids.length - 1, Math.max(profile.highestUnlockedRank, rank + 1)),
    clears,
    updatedAt,
  };
}

export function readPlayerProfile(storage: StoragePort = localStorage): PlayerProfile | null {
  try {
    const raw = storage.getItem(PLAYER_PROFILE_KEY);
    return raw ? parseProfile(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function writePlayerProfile(
  profile: PlayerProfile,
  storage: StoragePort = localStorage,
): boolean {
  try {
    const parsed = parseProfile(profile);
    if (!parsed) return false;
    storage.setItem(PLAYER_PROFILE_KEY, JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}
