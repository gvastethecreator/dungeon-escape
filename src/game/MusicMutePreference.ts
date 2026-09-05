export const MUSIC_MUTED_KEY = "dungeon-escape:music-muted";

type MuteStorage = Pick<Storage, "getItem" | "setItem">;

/** Music mute is independent of master mix mute in UserSettings. */
export function readMusicMuted(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  try {
    return storage.getItem(MUSIC_MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeMusicMuted(muted: boolean, storage: MuteStorage = localStorage): boolean {
  try {
    storage.setItem(MUSIC_MUTED_KEY, muted ? "1" : "0");
    return true;
  } catch {
    return false;
  }
}
