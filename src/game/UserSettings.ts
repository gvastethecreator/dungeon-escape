export const USER_SETTINGS_KEY = "dungeon-escape:user-settings-v1";

export interface UserSettings {
  readonly musicVolume: number;
  readonly effectsVolume: number;
  readonly textureSmoothing: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = Object.freeze({
  musicVolume: 1,
  effectsVolume: 1,
  textureSmoothing: false,
});

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

function volume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

export function readUserSettings(storage: SettingsStorage = localStorage): UserSettings {
  try {
    const raw = storage.getItem(USER_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    const value = JSON.parse(raw) as Record<string, unknown>;
    return {
      musicVolume: volume(value.musicVolume, DEFAULT_USER_SETTINGS.musicVolume),
      effectsVolume: volume(value.effectsVolume, DEFAULT_USER_SETTINGS.effectsVolume),
      textureSmoothing:
        typeof value.textureSmoothing === "boolean"
          ? value.textureSmoothing
          : DEFAULT_USER_SETTINGS.textureSmoothing,
    };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function writeUserSettings(
  settings: UserSettings,
  storage: SettingsStorage = localStorage,
): boolean {
  try {
    storage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
