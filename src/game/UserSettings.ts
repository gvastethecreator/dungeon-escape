export const USER_SETTINGS_KEY = "dungeon-escape:user-settings-v1";

export interface UserSettings {
  readonly musicVolume: number;
  readonly effectsVolume: number;
  readonly textureSmoothing: boolean;
  readonly audioMuted: boolean;
  readonly crtEnabled: boolean | null;
  /** 0.5–1.5 multiplier on look. 1 is the default feel. */
  readonly lookSensitivity: number;
}

export const DEFAULT_USER_SETTINGS: UserSettings = Object.freeze({
  musicVolume: 1,
  effectsVolume: 1,
  textureSmoothing: false,
  audioMuted: false,
  crtEnabled: null,
  lookSensitivity: 1,
});

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

function volume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function lookSensitivity(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0.5, Math.min(1.5, value));
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
      audioMuted: typeof value.audioMuted === "boolean" ? value.audioMuted : false,
      crtEnabled: typeof value.crtEnabled === "boolean" ? value.crtEnabled : null,
      lookSensitivity: lookSensitivity(value.lookSensitivity, DEFAULT_USER_SETTINGS.lookSensitivity),
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
