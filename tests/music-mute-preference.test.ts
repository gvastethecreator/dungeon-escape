import { describe, expect, test } from "bun:test";

import { MUSIC_MUTED_KEY, readMusicMuted, writeMusicMuted } from "../src/game/MusicMutePreference";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("music mute preference", () => {
  test("stores muted as 1 on the shared key", () => {
    const storage = memoryStorage();
    expect(readMusicMuted(storage)).toBe(false);
    expect(writeMusicMuted(true, storage)).toBe(true);
    expect(storage.getItem(MUSIC_MUTED_KEY)).toBe("1");
    expect(readMusicMuted(storage)).toBe(true);
    writeMusicMuted(false, storage);
    expect(readMusicMuted(storage)).toBe(false);
  });
});
