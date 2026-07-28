import { DEFAULT_DIFFICULTY } from "../game/DifficultyDirector";
import { isBiomeId, listBiomeIds, type BiomeId } from "../systems/BiomeIdentity";
import {
  ENEMY_ARCHETYPES,
  type EnemyArchetype,
  type EnemyBehavior,
  type EnemyKind,
} from "./EnemyArchetypes";
import { ENEMY_ROSTER } from "./EnemySpriteAtlas";

/**
 * Per-biome combat profile. Multipliers apply to the base archetype (1 = same).
 * `attackCooldown` > 1 means slower hits; < 1 means snappier strikes.
 */
export interface EnemyBiomeProfile {
  /** Short design note for docs/tests. */
  label: string;
  speed: number;
  detectionRange: number;
  attackRange: number;
  preferredRange: number;
  damage: number;
  attackCooldown: number;
  /**
   * Soft default behavior when a kind has no explicit override.
   * Spectral `phase` kinds never take this soft default.
   */
  behavior?: EnemyBehavior;
  /** Explicit per-kind behavior for this biome. */
  kindBehavior?: Partial<Record<EnemyKind, EnemyBehavior>>;
}

const PHASE_LOCKED = new Set<EnemyBehavior>(["phase"]);

/**
 * Authored biome pressure. Every BiomeId has a full profile so frost, molten,
 * backrooms, and iron each read differently in pursuit and contact.
 */
export const BIOME_ENEMY_PROFILES: Readonly<Record<BiomeId, EnemyBiomeProfile>> = {
  ancient: {
    label: "Slow watchful ruin pressure",
    speed: 0.94,
    detectionRange: 1.08,
    attackRange: 1.02,
    preferredRange: 1.04,
    damage: 1.04,
    attackCooldown: 1.06,
    behavior: "guard",
    kindBehavior: {
      husk: "guard",
      "zombie-orc": "guard",
      "bone-slime": "guard",
      ghost: "phase",
      "white-eyed-shadow": "erratic",
      goblin: "dash_halt",
    },
  },
  molten: {
    label: "Hot aggressive rushes",
    speed: 1.12,
    detectionRange: 1.04,
    attackRange: 0.98,
    preferredRange: 0.94,
    damage: 1.14,
    attackCooldown: 0.88,
    behavior: "skitter",
    kindBehavior: {
      imp: "orbit",
      goblin: "dash_halt",
      carrion: "skitter",
      "carrion-stalker": "skitter",
      spider: "skitter",
      husk: "pursue",
      "zombie-orc": "pursue",
      ghost: "phase",
      "white-eyed-shadow": "erratic",
    },
  },
  frost: {
    label: "Cold stalk and long awareness",
    speed: 0.86,
    detectionRange: 1.18,
    attackRange: 1.06,
    preferredRange: 1.1,
    damage: 1.06,
    attackCooldown: 1.14,
    behavior: "stalk",
    kindBehavior: {
      spider: "stalk",
      carrion: "stalk",
      "carrion-stalker": "stalk",
      ratling: "skitter",
      ghost: "phase",
      "white-eyed-shadow": "phase",
      husk: "pursue",
      "zombie-orc": "pursue",
      imp: "orbit",
    },
  },
  grim: {
    label: "Heavy grim pressure",
    speed: 0.96,
    detectionRange: 1.1,
    attackRange: 1.04,
    preferredRange: 1.02,
    damage: 1.12,
    attackCooldown: 1.02,
    behavior: "pursue",
    kindBehavior: {
      husk: "pursue",
      "zombie-orc": "pursue",
      "white-eyed-shadow": "erratic",
      ghost: "phase",
      goblin: "dash_halt",
      "bone-slime": "guard",
    },
  },
  verdant: {
    label: "Living skitter and orbit",
    speed: 1.06,
    detectionRange: 1.05,
    attackRange: 1,
    preferredRange: 0.96,
    damage: 0.98,
    attackCooldown: 0.94,
    behavior: "skitter",
    kindBehavior: {
      spider: "skitter",
      ratling: "skitter",
      carrion: "skitter",
      "carrion-stalker": "skitter",
      imp: "orbit",
      goblin: "dash_halt",
      ghost: "phase",
      "white-eyed-shadow": "erratic",
      "bone-slime": "guard",
    },
  },
  ash: {
    label: "Neutral ash baseline",
    speed: 1,
    detectionRange: 1,
    attackRange: 1,
    preferredRange: 1,
    damage: 1,
    attackCooldown: 1,
  },
  iron: {
    label: "Armored guards and committed swings",
    speed: 0.9,
    detectionRange: 1.06,
    attackRange: 1.08,
    preferredRange: 1.06,
    damage: 1.1,
    attackCooldown: 1.12,
    behavior: "guard",
    kindBehavior: {
      husk: "guard",
      "zombie-orc": "guard",
      goblin: "dash_halt",
      "bone-slime": "guard",
      imp: "orbit",
      ghost: "phase",
      "white-eyed-shadow": "erratic",
      spider: "skitter",
    },
  },
  obsidian: {
    label: "Sharp close violence",
    speed: 1.08,
    detectionRange: 1.02,
    attackRange: 0.96,
    preferredRange: 0.92,
    damage: 1.16,
    attackCooldown: 0.9,
    behavior: "dash_halt",
    kindBehavior: {
      goblin: "dash_halt",
      imp: "orbit",
      "white-eyed-shadow": "erratic",
      ghost: "phase",
      carrion: "skitter",
      "carrion-stalker": "skitter",
      husk: "pursue",
      "zombie-orc": "pursue",
    },
  },
  sunken: {
    label: "Dragged wet pursuit and longer reach",
    speed: 0.88,
    detectionRange: 1.12,
    attackRange: 1.1,
    preferredRange: 1.08,
    damage: 1.05,
    attackCooldown: 1.1,
    behavior: "pursue",
    kindBehavior: {
      "bone-slime": "guard",
      spider: "skitter",
      ratling: "skitter",
      ghost: "phase",
      "white-eyed-shadow": "phase",
      husk: "pursue",
      "zombie-orc": "pursue",
      imp: "orbit",
    },
  },
  fungal: {
    label: "Spore-aware crawl and cling",
    speed: 0.92,
    detectionRange: 1.14,
    attackRange: 1.05,
    preferredRange: 1.06,
    damage: 1.08,
    attackCooldown: 1.05,
    behavior: "skitter",
    kindBehavior: {
      spider: "skitter",
      ratling: "skitter",
      "bone-slime": "guard",
      carrion: "skitter",
      "carrion-stalker": "stalk",
      ghost: "phase",
      "white-eyed-shadow": "erratic",
      husk: "pursue",
      imp: "orbit",
    },
  },
  backrooms: {
    label: "Uncanny erratic stalking",
    speed: 1.04,
    detectionRange: 1.16,
    attackRange: 1.02,
    preferredRange: 1,
    damage: 1.06,
    attackCooldown: 0.96,
    behavior: "erratic",
    kindBehavior: {
      goblin: "erratic",
      ratling: "erratic",
      "white-eyed-shadow": "erratic",
      ghost: "phase",
      spider: "skitter",
      imp: "orbit",
      husk: "pursue",
      "zombie-orc": "pursue",
      "bone-slime": "guard",
      carrion: "erratic",
      "carrion-stalker": "erratic",
    },
  },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DIFFICULTY;
  return Math.min(1, Math.max(0, value));
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function clampMul(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolveEnemyBiomeId(moodId: string | null | undefined): BiomeId {
  if (isBiomeId(moodId)) return moodId;
  return "ash";
}

export function getEnemyBiomeProfile(moodId: string | null | undefined): EnemyBiomeProfile {
  return BIOME_ENEMY_PROFILES[resolveEnemyBiomeId(moodId)];
}

/**
 * Spectral kinds keep `phase` unless the biome profile explicitly names them.
 * Soft biome defaults never strip phasing.
 */
export function resolveEnemyBehavior(
  kind: EnemyKind,
  profile: EnemyBiomeProfile,
  base: EnemyBehavior,
): EnemyBehavior {
  const explicit = profile.kindBehavior?.[kind];
  if (explicit) return explicit;
  if (PHASE_LOCKED.has(base)) return base;
  if (profile.behavior) return profile.behavior;
  return base;
}

/**
 * Resolve the live combat archetype for one kind under the active biome and
 * run difficulty. Presentation size fields stay at base values.
 */
export function applyBiomeEnemyMods(
  kind: EnemyKind,
  moodId: string | null | undefined,
  difficulty: number = DEFAULT_DIFFICULTY,
): EnemyArchetype {
  const base = ENEMY_ARCHETYPES[kind];
  const profile = getEnemyBiomeProfile(moodId);
  const d = clamp01(difficulty);

  // Difficulty leans aggressive: faster, harder hits, shorter cooldowns, more awareness.
  const speedMul = clampMul(profile.speed * mix(1, 1.18, d), 0.7, 1.45);
  const detectionMul = clampMul(profile.detectionRange * mix(1, 1.16, d), 0.8, 1.45);
  const attackRangeMul = clampMul(profile.attackRange * mix(1, 1.08, d), 0.85, 1.3);
  const preferredMul = clampMul(profile.preferredRange * mix(1, 0.96, d), 0.8, 1.25);
  const damageMul = clampMul(profile.damage * mix(1, 1.22, d), 0.8, 1.55);
  const cooldownMul = clampMul(profile.attackCooldown * mix(1, 0.82, d), 0.65, 1.4);

  return {
    ...base,
    speed: base.speed * speedMul,
    detectionRange: base.detectionRange * detectionMul,
    attackRange: base.attackRange * attackRangeMul,
    preferredRange: base.preferredRange * preferredMul,
    damage: base.damage * damageMul,
    attackCooldown: base.attackCooldown * cooldownMul,
    behavior: resolveEnemyBehavior(kind, profile, base.behavior),
  };
}

/** Convenience: resolve the full roster once per tick when callers need a map. */
export function resolveEnemyArchetypeTable(
  moodId: string | null | undefined,
  difficulty: number = DEFAULT_DIFFICULTY,
): Readonly<Record<EnemyKind, EnemyArchetype>> {
  const table = {} as Record<EnemyKind, EnemyArchetype>;
  for (const kind of ENEMY_ROSTER) {
    table[kind] = applyBiomeEnemyMods(kind, moodId, difficulty);
  }
  return table;
}

/** Test/docs helper: every biome ships a profile. */
export function listEnemyBiomeProfiles(): readonly {
  id: BiomeId;
  profile: EnemyBiomeProfile;
}[] {
  return listBiomeIds().map((id) => ({ id, profile: BIOME_ENEMY_PROFILES[id] }));
}
