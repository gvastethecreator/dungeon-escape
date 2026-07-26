export interface SeededRandom {
  next(): number;
  integer(minimum: number, maximum: number): number;
  chance(probability: number): boolean;
  pick<T>(values: readonly T[]): T;
}

export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;

  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function createSeededRandom(seed: string): SeededRandom {
  let state = hashSeed(seed);

  return {
    next(): number {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let value = Math.imul(state ^ (state >>> 15), 1 | state);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
    integer(minimum: number, maximum: number): number {
      return minimum + Math.floor(this.next() * (maximum - minimum + 1));
    },
    chance(probability: number): boolean {
      return this.next() < probability;
    },
    pick<T>(values: readonly T[]): T {
      if (values.length === 0) throw new Error("Cannot pick from an empty collection.");
      return values[this.integer(0, values.length - 1)] as T;
    },
  };
}
