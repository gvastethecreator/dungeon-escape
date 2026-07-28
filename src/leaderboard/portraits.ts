import { hashSeed } from "../core/random";

/** Fixed roster size for name → portrait assignment. */
export const LEADERBOARD_PORTRAIT_COUNT = 72;

/**
 * Salt for name → portrait hashing. Bump this string when rotating assignments
 * so existing names land on a new face after a roster refresh.
 */
export const LEADERBOARD_PORTRAIT_SEED_PREFIX = "portrait-v4:";

export type LeaderboardFrameKind = "gold" | "silver" | "bronze" | "wood";

export interface LeaderboardPortrait {
  /** Stable 0-based index used by the name hash. */
  id: number;
  /** File slug under /assets/ui/portraits/. */
  slug: string;
  /** Short flavor title shown under the player name. */
  title: string;
  /** Resolved asset path for `<img src>`. */
  src: string;
}

export interface LeaderboardFrame {
  kind: LeaderboardFrameKind;
  /** Resolved overlay asset path. */
  src: string;
}

/**
 * Creative hall-of-fame faces. Same name always maps to the same entry.
 * Order is part of the public contract — append only; never reorder.
 * To reshuffle who gets which face, bump LEADERBOARD_PORTRAIT_SEED_PREFIX.
 */
const PORTRAIT_DEFS = [
  { slug: "candlebat", title: "Candlebat" },
  { slug: "moss-knight", title: "Moss Knight" },
  { slug: "soup-mimic", title: "Soup Mimic" },
  { slug: "bone-bard", title: "Bone Bard" },
  { slug: "cheese-golem", title: "Cheese Golem" },
  { slug: "mushroom-sage", title: "Mushroom Sage" },
  { slug: "ash-imp", title: "Ash Imp" },
  { slug: "frog-wizard", title: "Frog Wizard" },
  { slug: "lantern-ghost", title: "Lantern Ghost" },
  { slug: "rat-thief", title: "Rat Thief" },
  { slug: "crystal-slug", title: "Crystal Slug" },
  { slug: "teapot-elemental", title: "Teapot Elemental" },
  { slug: "owl-alchemist", title: "Owl Alchemist" },
  { slug: "armored-snail", title: "Armored Snail" },
  { slug: "void-kitten", title: "Void Kitten" },
  { slug: "pickle-knight", title: "Pickle Knight" },
  { slug: "spider-librarian", title: "Spider Librarian" },
  { slug: "ember-salamander", title: "Ember Salamander" },
  { slug: "cobweb-nun", title: "Cobweb Nun" },
  { slug: "potato-paladin", title: "Potato Paladin" },
  { slug: "ice-wisp", title: "Ice Wisp" },
  { slug: "goblin-chef", title: "Goblin Chef" },
  { slug: "bone-fish", title: "Bone Fish" },
  { slug: "stone-gargoyle", title: "Stone Gargoyle" },
  { slug: "slime-prince", title: "Slime Prince" },
  { slug: "crow-merchant", title: "Crow Merchant" },
  { slug: "cactus-monk", title: "Cactus Monk" },
  { slug: "moth-oracle", title: "Moth Oracle" },
  { slug: "barrel-ogre", title: "Barrel Ogre" },
  { slug: "paper-dragon", title: "Paper Dragon" },
  { slug: "goblin-scout", title: "Goblin Scout" },
  { slug: "orc-bruiser", title: "Orc Bruiser" },
  { slug: "swamp-shaman", title: "Swamp Shaman" },
  { slug: "ash-warlock", title: "Ash Warlock" },
  { slug: "bone-necromancer", title: "Bone Necromancer" },
  { slug: "goblin-king", title: "Goblin King" },
  { slug: "orc-shaman", title: "Orc Shaman" },
  { slug: "fire-mage", title: "Fire Mage" },
  { slug: "ice-mage", title: "Ice Mage" },
  { slug: "ring-courier", title: "Ring Courier" },
  { slug: "white-staff-elder", title: "White Staff Elder" },
  { slug: "iron-helm-lord", title: "Iron Helm Lord" },
  { slug: "green-spiked-brawler", title: "Spiked Brawler" },
  { slug: "blue-quilled-runner", title: "Blue Quill Runner" },
  { slug: "red-capped-goblin", title: "Red Cap Mage" },
  { slug: "hooded-assassin", title: "Hooded Assassin" },
  { slug: "crystal-sorceress", title: "Crystal Sorceress" },
  { slug: "rust-paladin", title: "Rust Paladin" },
  // v3 expansion
  { slug: "slime-knight", title: "Slime Knight" },
  { slug: "dwarf-brewer", title: "Dwarf Brewer" },
  { slug: "elf-ranger", title: "Elf Ranger" },
  { slug: "minotaur-guard", title: "Minotaur Guard" },
  { slug: "harpy-scout", title: "Harpy Scout" },
  { slug: "kobold-trapper", title: "Kobold Trapper" },
  { slug: "vampire-butler", title: "Vampire Butler" },
  { slug: "witch-apprentice", title: "Witch Apprentice" },
  { slug: "golem-mason", title: "Golem Mason" },
  { slug: "naga-oracle", title: "Naga Oracle" },
  { slug: "goblin-bard", title: "Goblin Bard" },
  { slug: "orc-engineer", title: "Orc Engineer" },
  { slug: "cyclops-chef", title: "Cyclops Chef" },
  { slug: "pixie-thief", title: "Pixie Thief" },
  { slug: "werewolf-monk", title: "Werewolf Monk" },
  { slug: "dragon-hatchling", title: "Dragon Hatchling" },
  { slug: "skeleton-pirate", title: "Skeleton Pirate" },
  { slug: "troll-gardener", title: "Troll Gardener" },
  { slug: "fairy-blacksmith", title: "Fairy Blacksmith" },
  { slug: "basilisk-spy", title: "Basilisk Spy" },
  { slug: "griffon-rider", title: "Griffon Rider" },
  { slug: "merfolk-mage", title: "Merfolk Mage" },
  { slug: "dryad-hunter", title: "Dryad Hunter" },
  { slug: "clockwork-imp", title: "Clockwork Imp" },
] as const;

if (PORTRAIT_DEFS.length !== LEADERBOARD_PORTRAIT_COUNT) {
  throw new Error(
    `Portrait roster size mismatch: expected ${LEADERBOARD_PORTRAIT_COUNT}, got ${PORTRAIT_DEFS.length}`,
  );
}

export const LEADERBOARD_PORTRAITS: readonly LeaderboardPortrait[] = PORTRAIT_DEFS.map(
  (def, id) => ({
    id,
    slug: def.slug,
    title: def.title,
    src: `/assets/ui/portraits/${def.slug}.png`,
  }),
);

const FRAME_SRCS: Record<LeaderboardFrameKind, string> = {
  gold: "/assets/ui/portraits/frames/frame-gold.png",
  silver: "/assets/ui/portraits/frames/frame-silver.png",
  bronze: "/assets/ui/portraits/frames/frame-bronze.png",
  wood: "/assets/ui/portraits/frames/frame-wood.png",
};

/**
 * Deterministic portrait index from a display name.
 * Uses the same FNV-1a hash as dungeon seeds so assignment stays stable across builds.
 */
export function portraitIndexForName(playerName: string): number {
  const key = playerName.normalize("NFKC").trim().toLowerCase();
  if (!key) return 0;
  return hashSeed(`${LEADERBOARD_PORTRAIT_SEED_PREFIX}${key}`) % LEADERBOARD_PORTRAIT_COUNT;
}

export function portraitForName(playerName: string): LeaderboardPortrait {
  return LEADERBOARD_PORTRAITS[portraitIndexForName(playerName)]!;
}

export function portraitForIndex(index: number): LeaderboardPortrait {
  const safe =
    ((Math.floor(index) % LEADERBOARD_PORTRAIT_COUNT) + LEADERBOARD_PORTRAIT_COUNT) %
    LEADERBOARD_PORTRAIT_COUNT;
  return LEADERBOARD_PORTRAITS[safe]!;
}

/** Podium frames for ranks 1–3; everyone else hangs in wood. */
export function frameKindForRank(rank: number): LeaderboardFrameKind {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "wood";
}

export function frameForRank(rank: number): LeaderboardFrame {
  const kind = frameKindForRank(rank);
  return { kind, src: FRAME_SRCS[kind] };
}

export function frameForKind(kind: LeaderboardFrameKind): LeaderboardFrame {
  return { kind, src: FRAME_SRCS[kind] };
}
