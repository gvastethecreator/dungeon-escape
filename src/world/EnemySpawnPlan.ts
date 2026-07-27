import { createSeededRandom } from "../core/random";
import type { DungeonRoom, GridCell } from "../dungeon/types";
import { ENEMY_DANGER_TIER } from "../game/DifficultyDirector";
import type { EnemyKind } from "./EnemyArchetypes";
import { ENEMY_ROSTER } from "./EnemySpriteAtlas";

export interface PlannedEnemySpawn {
  cell: GridCell;
  tier: number;
}

/**
 * Fills the full room set in shuffled passes. Each room gets a point before a
 * second point enters that room, which prevents wave reserves from clustering.
 */
export function buildDistributedEnemySpawns(
  seed: string,
  rooms: readonly DungeonRoom[],
  count: number,
  excludedCellKeys: ReadonlySet<string> = new Set(),
): PlannedEnemySpawn[] {
  if (rooms.length === 0 || count <= 0) return [];
  const random = createSeededRandom(`${seed}:enemy-cells`);
  const rankById = new Map(rooms.map((room, index) => [room.id, index]));
  const used = new Set(excludedCellKeys);
  const result: PlannedEnemySpawn[] = [];
  let attempts = 0;
  while (result.length < count && attempts < count * 12) {
    const pass = [...rooms];
    for (let index = pass.length - 1; index > 0; index -= 1) {
      const swap = random.integer(0, index);
      [pass[index], pass[swap]] = [pass[swap]!, pass[index]!];
    }
    for (const room of pass) {
      attempts += 1;
      const x = random.integer(room.x + 1, room.x + room.width - 2);
      const y = random.integer(room.y + 1, room.y + room.height - 2);
      const key = `${x},${y}`;
      if (used.has(key)) continue;
      used.add(key);
      const rank = rankById.get(room.id) ?? 0;
      const tier = Math.min(4, Math.floor((rank / Math.max(1, rooms.length)) * 5));
      result.push({ cell: { x, y }, tier });
      if (result.length >= count) break;
    }
  }
  return result;
}

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
    const tier = Math.max(0, Math.min(4, Math.round(rawTier)));
    let selected: EnemyKind | undefined;
    let selectedDistance = Number.POSITIVE_INFINITY;
    for (const kind of deck) {
      if (used.has(kind)) continue;
      const tierDistance = Math.abs(ENEMY_DANGER_TIER[kind] - tier);
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
