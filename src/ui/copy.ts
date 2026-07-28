/** English UI copy for dungeon runtime and editor shell. */

export const COPY = {
  objective: {
    label: "OBJECTIVE",
    /** Run intro banner (fades after a few seconds). */
    intro: "Find the four magic stones",
    findStones: (found: number, total: number) => `Find the four magic stones (${found}/${total})`,
    openPortal: "All stones bound. Reach the open portal",
    escape: "Escape through the iron portal",
  },
  threat: {
    clear: "NO PRESENCE NEARBY",
    near: (distance: number) => `PRESENCE ${distance.toFixed(0)} m`,
  },
  pickup: {
    small: "BOUND",
    notice: "UPDATE",
    /** Gothic body label — sentence case only. */
    stone: (name: string) => name,
    flask: "HEALTH RESTORED",
    timeFreeze: "TIME FROZEN",
    luminousWard: "WARD STONE",
  },
  interaction: {
    openChest: "OPEN CHEST",
  },
  stones: {
    ember: "Ember core",
    ash: "Ash vein",
    crypt: "Crypt shard",
    verdant: "Verdant heart",
  } as const,
  status: {
    enter: "Click the scene to explore.",
    enterPlay: "Click the scene to explore. ESC opens options.",
    exploring: "WASD move · SHIFT sprint · SPACE jump · E interact · ESC options.",
    pointerReleased: "Paused. ESC or RESUME to continue.",
    pointerFailed: "Could not capture the pointer. Click the scene to retry.",
    pointerBlocked: "The browser blocked the pointer. Click the scene to retry.",
    portalSealed: "The portal is sealed. Four magic stones are required.",
    portalOpen: "The portal spins open. Enter its center.",
    stoneFound: (name: string, found: number, total: number) => `${name} bound · ${found}/${total}`,
    timeFreeze: "Time frozen for 20 seconds.",
    luminousWard: "Ward active for 30 seconds.",
    won: "You escaped the dungeon",
    dead: "Keep distance. Shadows strike on contact.",
    hydrate: (seed: string) => `Loaded from server · seed ${seed}`,
    generation: (profile: string, mood: string) =>
      `Profile ${profile} · mood ${mood}. Collect four stones. Avoid the presence.`,
    forgeLoaded: "Dungeon creation loaded",
    pushOk: "Map params sent to the server (best effort).",
    pushOffline: "Server offline · local only.",
    serverOnline: (active: string, count: number) =>
      `Server: online · active ${active} · ${count} runs`,
    serverError: (message: string) => `Server: error · ${message}`,
    serverOffline: "Server: offline · local only",
    serverProbe: (detail: string) => `Server: online · ${detail}`,
  },
  end: {
    winKicker: "Portal escape",
    winTitle: "You escaped the dungeon",
    winLead: "All four stones are bound. The exit is open.",
    winCopy: (totalSec: number, stones: string) =>
      `Escape in ${formatTime(totalSec)}. Stones: ${stones}`,
    loseKicker: "The dungeon keeps its dead",
    loseTitle: "You Died",
    loseCopy: "",
    retry: "Try again",
    newDungeon: "New dungeon",
    next: "Another run",
  },
  leaderboard: {
    title: "Hall of Escapes",
    loading: "Reading local records…",
    empty: "No completed escapes yet. Be the first face on the wall.",
    unavailable: "Local records are unavailable.",
    nameLabel: "Name for the hall",
    namePlaceholder: "Wanderer",
    submit: "Save score",
    saving: "Saving…",
    saved: (rank: number, score: number) =>
      `Saved at rank ${rank}. Score ${score.toLocaleString("en-US")}.`,
    playSeed: (seed: string) => `Play seed ${seed}`,
    rankLabel: (rank: number) => `Rank ${rank}`,
    /** End-screen note when the escape used Custom Run / Forge / Map Tools. */
    customExcluded: "Custom run · practice only. New Game scores enter the Hall.",
  },
  hud: {
    map: "MAP",
    mapExpand: "EXPAND",
    mapShrink: "SHRINK",
    enter: "ENTER",
    escapeKey: "ESC",
    mute: "AUDIO OFF",
    audioOn: "AUDIO ON",
    musicOff: "MUSIC OFF",
    musicOn: "MUSIC ON",
    crtOn: "CRT ON",
    crtOff: "CRT OFF",
    mapTools: "MAP TOOLS",
    seedDefault: "CAMPAIGN-17",
  },
  timer: {
    run: "RUN",
    stones: "STONES",
  },
} as const;

export type StoneId = keyof typeof COPY.stones;

export const STONE_ORDER: readonly StoneId[] = ["ember", "ash", "crypt", "verdant"];

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const cs = Math.floor((safe % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function stoneLabel(id: StoneId): string {
  return COPY.stones[id];
}
