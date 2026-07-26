import { createSeededRandom } from "../core/random";
import type { EnemyKind } from "./EnemyArchetypes";
import { ENEMY_ROSTER } from "./EnemySpriteAtlas";

const PREFERRED_TIER: Readonly<Record<EnemyKind, number>> = {
  carrion: 0,
  goblin: 0,
  ghost: 2,
  ratling: 0,
  husk: 1,
  imp: 2,
  "zombie-orc": 3,
  spider: 0,
  "bone-slime": 1,
  "white-eyed-shadow": 2,
  "carrion-stalker": 1,
};

/**
 * Builds a deterministic threat deck. A creature appears at most once until
 * the full production roster has had a turn, while the nearest threat tier
 * wins each draw. Seeded tie-breaking keeps repeat maps stable.
 */
export function selectEnemyKindsForSpawns(seed: string, tiers: readonly number[]): EnemyKind[] {
  const random = createSeededRandom(`${seed}:enemy-roster`);
  const deck = [...ENEMY_ROSTER] as EnemyKind[];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = random.integer(0, index);
    [deck[index], deck[swapIndex]] = [deck[swapIndex] as EnemyKind, deck[index] as EnemyKind];
  }

  const used = new Set<EnemyKind>();
  return tiers.map((rawTier) => {
    if (used.size >= deck.length) used.clear();
    const tier = Math.max(0, Math.min(3, Math.round(rawTier)));
    let selected: EnemyKind | undefined;
    let selectedDistance = Number.POSITIVE_INFINITY;
    for (const kind of deck) {
      if (used.has(kind)) continue;
      const tierDistance = Math.abs(PREFERRED_TIER[kind] - tier);
      if (tierDistance >= selectedDistance) continue;
      selected = kind;
      selectedDistance = tierDistance;
      if (tierDistance === 0) break;
    }
    const kind = selected ?? deck[0] ?? "goblin";
    used.add(kind);
    return kind;
  });
}
