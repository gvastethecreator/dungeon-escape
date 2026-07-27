import { createSeededRandom } from "../core/random";
import type { DungeonRoom, GridCell } from "../dungeon/types";
import { ENEMY_DANGER_TIER } from "../game/DifficultyDirector";
import type { EnemyKind } from "./EnemyArchetypes";
import { ENEMY_ROSTER } from "./EnemySpriteAtlas";

export interface PlannedEnemySpawn {
  cell: GridCell;
  tier: number;
  roomId: number;
  pass: number;
}

/**
 * Assigns the opening room quota. A preferred room (normally the entrance)
 * consumes the first empty slot, while the seed rotates every other vacancy
 * and every room that receives a second enemy.
 */
export function buildInitialRoomEnemyQuotas(
  seed: string,
  rooms: readonly DungeonRoom[],
  initialEnemies: number,
  preferredEmptyRoomId?: number,
): ReadonlyMap<number, 0 | 1 | 2> {
  const random = createSeededRandom(`${seed}:initial-room-occupation`);
  const shuffled = [...rooms];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = random.integer(0, index);
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }
  if (preferredEmptyRoomId !== undefined) {
    const preferredIndex = shuffled.findIndex((room) => room.id === preferredEmptyRoomId);
    if (preferredIndex >= 0) {
      const [preferred] = shuffled.splice(preferredIndex, 1);
      if (preferred) shuffled.unshift(preferred);
    }
  }

  const emptyRooms = Math.floor(rooms.length / 6);
  const occupiedRooms = Math.max(0, rooms.length - emptyRooms);
  const requested = Math.max(0, Math.min(Math.floor(initialEnemies), occupiedRooms * 2));
  const occupiedTarget = Math.min(occupiedRooms, requested);
  const doubleRooms = Math.min(occupiedTarget, Math.max(0, requested - occupiedTarget));
  const quotas = new Map<number, 0 | 1 | 2>(rooms.map((room) => [room.id, 0]));
  const occupied = shuffled.slice(emptyRooms, emptyRooms + occupiedTarget);
  occupied.forEach((room, index) => quotas.set(room.id, index < doubleRooms ? 2 : 1));
  return quotas;
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
  let passIndex = 0;
  while (result.length < count && attempts < count * 12) {
    let placedThisPass = 0;
    const pass = [...rooms];
    for (let index = pass.length - 1; index > 0; index -= 1) {
      const swap = random.integer(0, index);
      [pass[index], pass[swap]] = [pass[swap]!, pass[index]!];
    }
    for (const room of pass) {
      const candidates: GridCell[] = [];
      for (let y = room.y + 1; y <= room.y + room.height - 2; y += 1) {
        for (let x = room.x + 1; x <= room.x + room.width - 2; x += 1) {
          candidates.push({ x, y });
        }
      }
      for (let index = candidates.length - 1; index > 0; index -= 1) {
        const swap = random.integer(0, index);
        [candidates[index], candidates[swap]] = [candidates[swap]!, candidates[index]!];
      }
      attempts += 1;
      const cell = candidates.find((candidate) => !used.has(`${candidate.x},${candidate.y}`));
      if (!cell) continue;
      const key = `${cell.x},${cell.y}`;
      used.add(key);
      const rank = rankById.get(room.id) ?? 0;
      // Opening seats stay basic. Every two later passes bumps the danger band
      // so reinforcements get stronger every couple of room pulses.
      const distanceTier = Math.floor((rank / Math.max(1, rooms.length)) * 5);
      const passTier = Math.min(4, Math.floor(passIndex / 2));
      const tier =
        passIndex < 2 ? 0 : Math.min(4, Math.max(1, Math.max(passTier, distanceTier)));
      result.push({ cell, tier, roomId: room.id, pass: passIndex });
      placedThisPass += 1;
      if (result.length >= count) break;
    }
    if (placedThisPass === 0) break;
    passIndex += 1;
  }
  return result;
}

/** Builds one deterministic rotating deck per danger tier. */
export function selectEnemyKindsForSpawns(seed: string, tiers: readonly number[]): EnemyKind[] {
  const random = createSeededRandom(`${seed}:enemy-roster`);
  const decks = new Map<number, EnemyKind[]>();
  const cursor = new Map<number, number>();
  for (let tier = 0; tier <= 4; tier += 1) {
    const exact = ENEMY_ROSTER.filter((kind) => ENEMY_DANGER_TIER[kind] === tier) as EnemyKind[];
    const deck = exact.length > 0 ? exact : ([...ENEMY_ROSTER] as EnemyKind[]);
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swapIndex = random.integer(0, index);
      [deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!];
    }
    decks.set(tier, deck);
  }

  return tiers.map((rawTier) => {
    const tier = Math.max(0, Math.min(4, Math.round(rawTier)));
    const deck = decks.get(tier) ?? ["goblin"];
    const index = cursor.get(tier) ?? 0;
    cursor.set(tier, index + 1);
    return deck[index % deck.length] ?? "goblin";
  });
}
