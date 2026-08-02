/** English UI copy for dungeon runtime and editor shell. */

import { ANNIHILATION_PULSE_DURATION_SECONDS } from "../game/AnnihilationPulse";
import { CULL_BRAND_DURATION_SECONDS } from "../game/CullBrand";
import { FOG_CLEAR_DURATION_SECONDS } from "../game/FogClear";
import { FRENZY_CURSE_DURATION_SECONDS } from "../game/FrenzyCurse";
import { GLOOM_CURSE_DURATION_SECONDS } from "../game/GloomCurse";
import { LUMINOUS_WARD_DURATION_SECONDS } from "../game/LuminousWard";
import { MIRROR_CURSE_DURATION_SECONDS } from "../game/MirrorCurse";
import { PHOENIX_REVIVE_RESOLVE } from "../game/PhoenixEgg";
import { SLOW_CURSE_DURATION_SECONDS } from "../game/SlowCurse";
import { SPIN_CURSE_DURATION_SECONDS } from "../game/SpinCurse";
import { TIME_FREEZE_DURATION_SECONDS } from "../game/TimeFreeze";

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
    /** Small action kicker above the item/curse name. */
    itemFound: "ITEM FOUND",
    curseFound: "CURSE FOUND",
    notice: "UPDATE",
    /** Large gothic body label — Title Case (not full caps). */
    stone: (name: string) => name,
    flask: "Health Restored",
    timeFreeze: "Time Freeze",
    luminousWard: "Ward Stone",
    annihilationPulse: "Pulse Relic",
    cullBrand: "Cull Brand",
    phoenixEgg: "Phoenix Egg",
    map: "Dungeon Map",
    mobility: "Wayfinder Draught",
    clarity: "Clear Air",
    swarmCurse: "Swarm Curse",
    slowCurse: "Heavy Limbs",
    frenzyCurse: "Blood Frenzy",
    gloomCurse: "Gathering Gloom",
    mirrorCurse: "Mirror Curse",
    spinCurse: "Spin Curse",
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
    enter: "Click the scene to lock the pointer. Hold click to walk.",
    enterPlay:
      "Click the scene to lock the pointer. Hold click to walk · right-click to jump · ESC options.",
    forgingMap: "Forging the dungeon…",
    enteringDungeon: "Entering the depths…",
    exploring:
      "WASD or hold click move · Right-click or SPACE jump · SHIFT sprint · E interact · ESC options.",
    pointerReleased: "Paused. ESC or RESUME to continue.",
    pointerFailed: "Could not capture the pointer. Click the scene to retry.",
    pointerBlocked: "The browser blocked the pointer. Click the scene to retry.",
    portalSealed: "The portal is sealed. Four magic stones are required.",
    portalOpen: "The portal spins open. Enter its center.",
    stoneFound: (name: string, found: number, total: number) => `${name} bound · ${found}/${total}`,
    timeFreeze: `Time frozen for ${TIME_FREEZE_DURATION_SECONDS} seconds.`,
    luminousWard: `Ward active for ${LUMINOUS_WARD_DURATION_SECONDS} seconds.`,
    annihilationPulse: `Annihilation pulse active for ${ANNIHILATION_PULSE_DURATION_SECONDS} seconds.`,
    cullBrand: `Next enemy contact kills for ${CULL_BRAND_DURATION_SECONDS} seconds.`,
    phoenixEgg: "Phoenix egg equipped. Survives one death.",
    phoenixRevive: `Reborn at ${PHOENIX_REVIVE_RESOLVE} health. Annihilation pulse ignited.`,
    map: "Dungeon map found. Every room and route is now visible.",
    mobility: "Speed and stamina boosted. Floor traps cannot harm you for 14 seconds.",
    clarity: `Fog thins for ${FOG_CLEAR_DURATION_SECONDS} seconds.`,
    swarmCurse: "The dungeon swarms. Monster pressure doubles on this floor.",
    slowCurse: `Your limbs are heavy for ${SLOW_CURSE_DURATION_SECONDS} seconds.`,
    frenzyCurse: `Enemies hunt harder for ${FRENZY_CURSE_DURATION_SECONDS} seconds.`,
    gloomCurse: `Darkness thickens for ${GLOOM_CURSE_DURATION_SECONDS} seconds.`,
    mirrorCurse: `Look and movement inverted for ${MIRROR_CURSE_DURATION_SECONDS} seconds.`,
    spinCurse: `The world spins for ${SPIN_CURSE_DURATION_SECONDS} seconds.`,
    won: "You escaped the dungeon",
    dead: "Keep distance. Shadows strike on contact.",
    hydrate: (seed: string) => `Loaded from server · seed ${seed}`,
    generation: (profile: string, mood: string) =>
      `Profile ${profile} · mood ${mood}. Collect four stones. Avoid the presence.`,
    /** Player-facing line after a map loads (no tech profile / renderer timing). */
    generationPlayer: (mood: string) => `${mood}. Find the four stones. Avoid the presence.`,
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
    winKicker: "Round complete",
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
    /** Disabled Next run CTA (final biome, death, or not yet unlocked). */
    nextRun: "Next run",
    /** Victory CTA after Hall save when a harder biome remains. */
    nextBiome: (label: string) => `Next level · ${label}`,
    /** Victory note after Hall save on the final campaign biome. */
    finalBiomeSaved: "Final biome cleared. The hall remembers this escape.",
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
    comparisonLoadingTitle: "CHECKING THE HALL",
    comparisonLoading: "Comparing this run with the leaderboard.",
    comparisonEmptyTitle: "FIRST ESCAPE",
    comparisonEmpty: "No Hall scores yet. Save this run to set the pace.",
    comparisonUnavailableTitle: "HALL UNAVAILABLE",
    comparisonUnavailable: "The run result stays visible. You can still retry the save.",
    comparisonProjected: (rank: number) => `#${rank} PROJECTED`,
    comparisonSavedRank: (rank: number) => `#${rank} IN THE HALL`,
    comparisonOutside: (limit: number) => `OUTSIDE TOP ${limit}`,
    comparisonAhead: (points: number) =>
      `${points.toLocaleString("en-US")} pts above the current #1.`,
    comparisonBehind: (points: number, leaderScore: number) =>
      `${points.toLocaleString("en-US")} pts behind #1 · ${leaderScore.toLocaleString("en-US")} pts`,
    comparisonTied: "Tied with the current #1 score.",
    comparisonLeader: "New Hall leader.",
    comparisonSavedDetail: "The Hall accepted this run.",
    comparisonCustomTitle: "PRACTICE RUN",
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
    mute: "OFF",
    audioOn: "ON",
    musicOff: "OFF",
    musicOn: "ON",
    crtOn: "ON",
    crtOff: "OFF",
    mapTools: "MAP TOOLS",
    seedDefault: "CAMPAIGN-17",
    resume: "RESUME",
    restartMap: "RESTART MAP",
    backToMain: "MAIN MENU",
  },
  pause: {
    title: "Paused",
    settings: "SETTINGS",
    restarted: "Map restarted. Click the scene to explore.",
    returnedHome: "Returned to the main screen.",
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
