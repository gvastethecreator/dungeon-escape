import { createSeededRandom } from "../core/random";
import type { DungeonRoom, GridCell } from "../dungeon/types";
import { ENEMY_DANGER_TIER } from "../game/DifficultyDirector";
import type { EnemyKind } from "./EnemyArchetypes";
import { ENEMY_ROSTER } from "./EnemySpriteAtlas";

/**
 * Default Chebyshev gap (in cells) between planned seats. Small rooms use a
 * tighter gap so more seats actually fit.
 */
export const MIN_SPAWN_CELL_SEPARATION = 2;

export interface PlannedEnemySpawn {
  cell: GridCell;
  tier: number;
  roomId: number;
  pass: number;
}

function markSpawnNeighborhood(used: Set<string>, cell: GridCell, separation: number): void {
  const radius = Math.max(0, separation - 1);
  for (let y = cell.y - radius; y <= cell.y + radius; y += 1) {
    for (let x = cell.x - radius; x <= cell.x + radius; x += 1) {
      if (Math.max(Math.abs(x - cell.x), Math.abs(y - cell.y)) <= radius) {
        used.add(`${x},${y}`);
      }
    }
  }
}

/** Walkable interior area used for room-size threat budgets. */
export function roomInteriorArea(room: Pick<DungeonRoom, "width" | "height">): number {
  const innerW = Math.max(0, room.width - 2);
  const innerH = Math.max(0, room.height - 2);
  return innerW * innerH;
}

/**
 * Hard seat budget for a room. Small rooms still get a real reserve stack so
 * wave seats are not starved by the limit; large halls pack denser.
 */
export function roomEnemySeatCap(room: Pick<DungeonRoom, "width" | "height">): number {
  const innerW = Math.max(0, room.width - 2);
  const innerH = Math.max(0, room.height - 2);
  const area = innerW * innerH;
  const minSide = Math.min(innerW, innerH);
  if (area <= 0) return 0;
  // Closets / tight nooks: enough seats for opening + later pulses.
  if (minSide <= 2 || area <= 12) return 4;
  // Small combat rooms.
  if (minSide <= 3 || area <= 25) return 6;
  // Mid rooms (~8×8 outer).
  if (area <= 36) return 8;
  if (area <= 49) return 10;
  if (area <= 64) return 12;
  // Large halls.
  if (area <= 100) return 15;
  if (area <= 144) return 18;
  return 22;
}

/** Chebyshev separation for seats inside a room (tighter in small interiors). */
export function roomSpawnSeparation(room: Pick<DungeonRoom, "width" | "height">): number {
  const area = roomInteriorArea(room);
  if (area <= 12) return 1;
  if (area <= 25) return 2;
  return MIN_SPAWN_CELL_SEPARATION;
}

/** Opening-wave seats a room may start with (subset of the full seat cap). */
export function roomOpeningEnemyCap(room: Pick<DungeonRoom, "width" | "height">): number {
  const seat = roomEnemySeatCap(room);
  if (seat <= 0) return 0;
  if (seat <= 4) return Math.min(2, seat);
  if (seat <= 8) return 3;
  if (seat <= 12) return 4;
  return 5;
}

/** Sum of per-room seat caps — drives the map-wide reserve pool size. */
export function totalEnemySeatBudget(rooms: readonly Pick<DungeonRoom, "width" | "height">[]): number {
  return rooms.reduce((sum, room) => sum + roomEnemySeatCap(room), 0);
}

/**
 * Assigns the opening room quota. A preferred room (normally the entrance)
 * consumes the first empty slot. Larger rooms may open with 2–4 enemies so
 * halls never start quieter than small combat rooms.
 */
export function buildInitialRoomEnemyQuotas(
  seed: string,
  rooms: readonly DungeonRoom[],
  initialEnemies: number,
  preferredEmptyRoomId?: number,
): ReadonlyMap<number, number> {
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
  const openingCaps = new Map(rooms.map((room) => [room.id, roomOpeningEnemyCap(room)]));
  const maxOpeningSeats = rooms.reduce((sum, room) => sum + (openingCaps.get(room.id) ?? 0), 0);
  const requested = Math.max(0, Math.min(Math.floor(initialEnemies), maxOpeningSeats));
  const occupiedTarget = Math.min(occupiedRooms, requested);
  const quotas = new Map<number, number>(rooms.map((room) => [room.id, 0]));
  const occupied = shuffled.slice(emptyRooms, emptyRooms + occupiedTarget);

  // Prefer seating larger rooms first when stacking beyond the first enemy.
  const bySize = [...occupied].sort(
    (left, right) => roomInteriorArea(right) - roomInteriorArea(left) || left.id - right.id,
  );

  // Seed every occupied room with one seat if the room can hold it.
  let placed = 0;
  for (const room of occupied) {
    if (placed >= requested) break;
    if ((openingCaps.get(room.id) ?? 0) >= 1) {
      quotas.set(room.id, 1);
      placed += 1;
    }
  }
  // Stack extra opening seats into the largest rooms first.
  for (let stack = 2; stack <= 5 && placed < requested; stack += 1) {
    for (const room of bySize) {
      if (placed >= requested) break;
      const cap = openingCaps.get(room.id) ?? 0;
      const current = quotas.get(room.id) ?? 0;
      if (current < stack && cap >= stack) {
        quotas.set(room.id, stack);
        placed += 1;
      }
    }
  }
  return quotas;
}

/**
 * Fills the full room set in shuffled passes. Each room gets a point before a
 * second point enters that room, which prevents wave reserves from clustering.
 * Room size caps stop small interiors from stacking an abusive reserve pile.
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
  const seatCapById = new Map(rooms.map((room) => [room.id, roomEnemySeatCap(room)]));
  const seatsByRoom = new Map<number, number>(rooms.map((room) => [room.id, 0]));
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
      const seated = seatsByRoom.get(room.id) ?? 0;
      const cap = seatCapById.get(room.id) ?? 0;
      if (seated >= cap) continue;
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
      // Tighter gap in small rooms so seat caps are actually reachable.
      markSpawnNeighborhood(used, cell, roomSpawnSeparation(room));
      const rank = rankById.get(room.id) ?? 0;
      // Each later pass is one danger band higher (aligned with 25s unlock waves).
      // Opening pass stays tier 0; pass 1+ climbs so reserves unlock over time.
      const distanceTier = Math.floor((rank / Math.max(1, rooms.length)) * 5);
      const passTier = Math.min(4, passIndex);
      const tier =
        passIndex === 0 ? 0 : Math.min(4, Math.max(1, Math.max(passTier, distanceTier)));
      result.push({ cell, tier, roomId: room.id, pass: passIndex });
      seatsByRoom.set(room.id, seated + 1);
      placedThisPass += 1;
      if (result.length >= count) break;
    }
    if (placedThisPass === 0) break;
    passIndex += 1;
  }
  return result;
}

export interface EnemyKindSeat {
  tier: number;
  /** When set, kinds diversify inside that room before repeating. */
  roomId?: number;
}

function kindsForTier(tier: number): EnemyKind[] {
  const clamped = Math.max(0, Math.min(4, Math.round(tier)));
  const exact = ENEMY_ROSTER.filter((kind) => ENEMY_DANGER_TIER[kind] === clamped) as EnemyKind[];
  return exact.length > 0 ? exact : ([...ENEMY_ROSTER] as EnemyKind[]);
}

function shuffleKinds(label: string, kinds: readonly EnemyKind[]): EnemyKind[] {
  const deck = [...kinds];
  const random = createSeededRandom(label);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = random.integer(0, index);
    [deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!];
  }
  return deck;
}

/** Legacy path: rotate inside each danger band (no room-local expansion). */
function selectEnemyKindsByTierOnly(seed: string, tiers: readonly number[]): EnemyKind[] {
  const random = createSeededRandom(`${seed}:enemy-roster`);
  const decks = new Map<number, EnemyKind[]>();
  const cursor = new Map<number, number>();
  for (let tier = 0; tier <= 4; tier += 1) {
    const deck = shuffleKinds(`${seed}:enemy-roster:tier-${tier}`, kindsForTier(tier));
    // Advance outer stream so seed still matters if shuffle keys collide.
    void random.next();
    decks.set(tier, deck);
  }
  return tiers.map((rawTier) => {
    const tier = Math.max(0, Math.min(4, Math.round(rawTier)));
    const deck = decks.get(tier) ?? (["goblin"] as EnemyKind[]);
    const index = cursor.get(tier) ?? 0;
    cursor.set(tier, index + 1);
    return deck[index % deck.length] ?? "goblin";
  });
}

/**
 * Builds a deterministic kind list.
 *
 * - Plain tier numbers keep band-exact rotation (editor / tests).
 * - Seat objects with `roomId` maximize variety inside each room: unused kinds
 *   first, then nearest danger bands, then least-used. Packed halls never
 *   spawn as one clone army.
 */
export function selectEnemyKindsForSpawns(
  seed: string,
  seats: readonly number[] | readonly EnemyKindSeat[],
): EnemyKind[] {
  if (seats.length === 0) return [];
  if (typeof seats[0] === "number") {
    return selectEnemyKindsByTierOnly(seed, seats as readonly number[]);
  }

  const roomSeats = seats as readonly EnemyKindSeat[];
  const usedByRoom = new Map<number, Map<EnemyKind, number>>();
  const results: EnemyKind[] = [];

  for (let seatIndex = 0; seatIndex < roomSeats.length; seatIndex += 1) {
    const seat = roomSeats[seatIndex]!;
    const tier = Math.max(0, Math.min(4, Math.round(seat.tier)));
    const roomId = seat.roomId ?? -1 - seatIndex;
    const roomUsed = usedByRoom.get(roomId) ?? new Map<EnemyKind, number>();
    if (!usedByRoom.has(roomId)) usedByRoom.set(roomId, roomUsed);

    const exact = kindsForTier(tier);
    const unusedExact = exact.filter((kind) => !roomUsed.has(kind));
    let pool: EnemyKind[];

    if (unusedExact.length > 0) {
      pool = unusedExact;
    } else {
      // Exact band exhausted in this room — pick unused kinds from any band,
      // preferring danger closest to the seat tier so variety still feels local.
      const unusedAll = (ENEMY_ROSTER as readonly EnemyKind[]).filter((kind) => !roomUsed.has(kind));
      if (unusedAll.length > 0) {
        let bestDist = Infinity;
        for (const kind of unusedAll) {
          bestDist = Math.min(bestDist, Math.abs(ENEMY_DANGER_TIER[kind] - tier));
        }
        pool = unusedAll.filter((kind) => Math.abs(ENEMY_DANGER_TIER[kind] - tier) === bestDist);
      } else {
        // Full roster already sits in this room: rebalance toward least-used,
        // still preferring the seat's danger band when counts tie.
        const candidates = exact.length > 0 ? exact : ([...ENEMY_ROSTER] as EnemyKind[]);
        let minCount = Infinity;
        for (const kind of candidates) {
          minCount = Math.min(minCount, roomUsed.get(kind) ?? 0);
        }
        pool = candidates.filter((kind) => (roomUsed.get(kind) ?? 0) === minCount);
        if (pool.length === 0) {
          const full = [...ENEMY_ROSTER] as EnemyKind[];
          minCount = Infinity;
          for (const kind of full) {
            minCount = Math.min(minCount, roomUsed.get(kind) ?? 0);
          }
          pool = full.filter((kind) => (roomUsed.get(kind) ?? 0) === minCount);
        }
      }
    }

    const deck = shuffleKinds(`${seed}:enemy-roster:${roomId}:${seatIndex}:${tier}`, pool);
    const kind = deck[0] ?? "goblin";
    roomUsed.set(kind, (roomUsed.get(kind) ?? 0) + 1);
    results.push(kind);
  }

  return results;
}

/**
 * Pick a kind for the current progress wave: prefer the newest unlocked tier
 * (so each 25s / stone find rotates into a fresh type band), then cycle kinds.
 */
export function selectEnemyKindForProgress(
  seed: string,
  activationIndex: number,
  unlockedMaxTier: number,
): EnemyKind {
  const maxTier = Math.max(0, Math.min(4, Math.floor(unlockedMaxTier)));
  // Alternate newest-band vs full unlocked range so the roster keeps rotating.
  const preferNewest = activationIndex % 3 !== 2;
  const tier = preferNewest ? maxTier : activationIndex % (maxTier + 1);
  const exact = ENEMY_ROSTER.filter((kind) => ENEMY_DANGER_TIER[kind] === tier) as EnemyKind[];
  const deck = exact.length > 0 ? exact : ([...ENEMY_ROSTER] as EnemyKind[]);
  let hash = 2166136261;
  const key = `${seed}:progress-kind:${tier}:${activationIndex}`;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return deck[Math.abs(hash) % deck.length] ?? "goblin";
}
