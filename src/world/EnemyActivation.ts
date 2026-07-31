/**
 * Pure enemy reserve → active seat selection filters.
 * DungeonWorld still mutates seats; this module owns candidacy and pool preference.
 */

export type EnemyActivationMode = "opening" | "play" | "resume";

export interface EnemyActivationSeat {
  kind: string;
  tier: number;
  startsActive: boolean;
  position: { x: number; y: number; z: number };
}

export interface EnemyActivationFilterInput {
  mode: EnemyActivationMode;
  player: { x: number; z: number };
  unlockedMaxTier: number;
  safeSpawnDistance: number;
  /** Resume mode soft exclusion radius. */
  resumeMinDistance?: number;
  /** Minimum separation from already-active seats and this-pulse picks. */
  minSpread: number;
  isKindUnlocked: (kind: string) => boolean;
  isObjectOccupied: (position: { x: number; z: number }) => boolean;
  hasLineOfSight: (position: { x: number; z: number }) => boolean;
}

export function enemyActivationDistance(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Indices into `reserve` that may activate under the current mode and pressure gates.
 */
export function filterEnemyActivationCandidates(
  reserve: readonly EnemyActivationSeat[],
  input: EnemyActivationFilterInput,
): number[] {
  const resumeMin = input.resumeMinDistance ?? 2.4;
  const candidates: number[] = [];
  for (let index = 0; index < reserve.length; index += 1) {
    const enemy = reserve[index]!;
    if (input.mode === "opening" && !enemy.startsActive) continue;
    if (enemy.tier > input.unlockedMaxTier) continue;
    if (!input.isKindUnlocked(enemy.kind)) continue;
    if (input.isObjectOccupied(enemy.position)) continue;
    const distance = enemyActivationDistance(enemy.position, input.player);
    if (input.mode === "play" && distance < input.safeSpawnDistance) continue;
    if (input.mode === "resume" && distance < resumeMin) continue;
    if (input.mode === "play" && input.hasLineOfSight(enemy.position)) continue;
    candidates.push(index);
  }
  return candidates;
}

/**
 * Prefer newest-tier seats that still honor spread, then spread-only, then raw candidates.
 */
export function preferEnemyActivationPool(
  reserve: readonly EnemyActivationSeat[],
  candidates: readonly number[],
  activePositions: readonly { x: number; z: number }[],
  pulsePositions: readonly { x: number; z: number }[],
  unlockedMaxTier: number,
  minSpread: number,
): number[] {
  const spreadCandidates = candidates.filter((index) => {
    const enemy = reserve[index]!;
    const farFromPulse = pulsePositions.every(
      (active) => enemyActivationDistance(enemy.position, active) >= minSpread,
    );
    if (!farFromPulse) return false;
    return activePositions.every(
      (active) => enemyActivationDistance(enemy.position, active) >= minSpread,
    );
  });
  const newest = candidates.filter((index) => reserve[index]!.tier === unlockedMaxTier);
  const preferred =
    newest.length > 0
      ? newest.filter((index) => spreadCandidates.includes(index) || spreadCandidates.length === 0)
      : [];
  if (preferred.length > 0) return preferred;
  if (spreadCandidates.length > 0) return spreadCandidates;
  return [...candidates];
}
