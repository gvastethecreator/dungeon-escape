/** A scene candidate owned by one generated room. */
export interface BiomeDecorRoomCandidate {
  readonly roomId: number;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(Math.trunc(left));
  let b = Math.abs(Math.trunc(right));
  while (b > 0) [a, b] = [b, a % b];
  return a;
}

function coprimeStep(length: number, seedSalt: number): number {
  if (length <= 1) return 1;
  let step = positiveModulo(Math.abs(Math.trunc(seedSalt)) * 2 + 1, length);
  if (step === 0) step = 1;
  while (greatestCommonDivisor(step, length) !== 1) step = (step + 1) % length || 1;
  return step;
}

/**
 * Walk every authored definition once before repeating any definition. Across
 * any sequence, usage counts differ by at most one.
 */
export function balancedBiomeDecorItem<T>(
  items: readonly T[],
  sequenceIndex: number,
  seedSalt: number,
): T {
  if (items.length === 0) throw new Error("balanced biome decor needs at least one item");
  const offset = positiveModulo(Math.trunc(seedSalt), items.length);
  const step = coprimeStep(items.length, seedSalt);
  return items[positiveModulo(offset + Math.trunc(sequenceIndex) * step, items.length)]!;
}

/**
 * Select one candidate from each room before taking a second from any room.
 * Room and within-room order are deterministic but rotate with the map seed.
 */
export function selectFairBiomeDecorPlacements<T extends BiomeDecorRoomCandidate>(
  candidates: readonly T[],
  count: number,
  seedSalt: number,
): T[] {
  if (candidates.length === 0 || count <= 0) return [];
  const groups = new Map<number, T[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.roomId) ?? [];
    group.push(candidate);
    groups.set(candidate.roomId, group);
  }
  const rooms = [...groups.keys()].sort((left, right) => {
    const leftRank = positiveModulo(left * 53 + seedSalt * 19, 104729);
    const rightRank = positiveModulo(right * 53 + seedSalt * 19, 104729);
    return leftRank - rightRank || left - right;
  });
  for (const roomId of rooms) {
    const group = groups.get(roomId)!;
    const offset = positiveModulo(seedSalt + roomId * 31, group.length);
    groups.set(roomId, [...group.slice(offset), ...group.slice(0, offset)]);
  }

  const selected: T[] = [];
  for (let round = 0; selected.length < Math.min(count, candidates.length); round += 1) {
    let added = 0;
    for (const roomId of rooms) {
      const candidate = groups.get(roomId)?.[round];
      if (!candidate) continue;
      selected.push(candidate);
      added += 1;
      if (selected.length >= count) break;
    }
    if (added === 0) break;
  }
  return selected;
}
