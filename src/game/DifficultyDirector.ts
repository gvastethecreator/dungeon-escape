import { ENEMY_ARCHETYPES, type EnemyKind } from "../world/EnemyArchetypes";

export const DEFAULT_DIFFICULTY = 0.5;

/** Hard active-enemy ceiling so large maps stay inside the instancing budget. */
export const ENEMY_HARD_CAP = 280;

/** Reinforcement cadence: new seats and danger unlocks every 25s. */
export const DEFAULT_WAVE_SECONDS = 25;

/**
 * Minimum horizontal distance between newly activated enemies (world units).
 * Keeps reinforcement pops from stacking on the same corner.
 */
export const ENEMY_ACTIVATION_SPREAD = 11;

/**
 * Pressure steps and danger-band unlocks climb every this many reinforcement
 * pulses. 1 = a new type band every 25 seconds.
 */
export const LEVEL_EVERY_WAVES = 1;

export type DifficultyLabel = "MERCIFUL" | "CAUTIOUS" | "STANDARD" | "HARD" | "RELENTLESS";

export interface DifficultyTuning {
  value: number;
  label: DifficultyLabel;
  initialOccupiedRooms: number;
  initialEnemies: number;
  maxEnemies: number;
  /** Enemies added to the active target each reinforcement pulse. */
  enemiesPerWave: number;
  waveSeconds: number;
  dangerUnlockScale: number;
  safeSpawnDistance: number;
  revealSeconds: number;
}

export interface DifficultySnapshot extends DifficultyTuning {
  elapsedSeconds: number;
  activeEnemies: number;
  reserveEnemies: number;
  targetEnemies: number;
  pressureLevel: number;
  unlockedKinds: number;
  /** Highest danger tier (0-4) currently unlocked. */
  unlockedMaxTier: number;
  /** Wave index from time + stones (each stone counts as one wave of progress). */
  progressWaves: number;
  nextEscalationSeconds: number | null;
}

export const ENEMY_DANGER_TIER: Readonly<Record<EnemyKind, number>> = {
  ratling: 0,
  spider: 0,
  carrion: 0,
  goblin: 1,
  imp: 1,
  ghost: 1,
  "carrion-stalker": 2,
  "bone-slime": 2,
  "white-eyed-shadow": 3,
  husk: 3,
  "zombie-orc": 4,
};

/** Wave index (0-based) at which each kind's danger band unlocks. */
const KIND_PHASE: Readonly<Record<EnemyKind, number>> = {
  goblin: 1,
  ratling: 0,
  "bone-slime": 2,
  spider: 0,
  carrion: 0,
  "carrion-stalker": 2,
  husk: 3,
  imp: 1,
  ghost: 1,
  "white-eyed-shadow": 3,
  "zombie-orc": 4,
};

// One new danger band every wave (25s): tier 0 at t=0, tier 1 at 25s, …
const PHASE_WAVES = [0, 1, 2, 3, 4] as const;
const PHASE_KIND_COUNTS = [3, 6, 8, 10, 11] as const;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DIFFICULTY;
  return Math.min(1, Math.max(0, value));
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function difficultyLabel(value: number): DifficultyLabel {
  const difficulty = clamp01(value);
  if (difficulty < 0.2) return "MERCIFUL";
  if (difficulty < 0.4) return "CAUTIOUS";
  if (difficulty < 0.65) return "STANDARD";
  if (difficulty < 0.85) return "HARD";
  return "RELENTLESS";
}

/** Comparable threat score built from hit strength, hit rate, speed, reach and awareness. */
export function enemyDangerScore(kind: EnemyKind): number {
  const enemy = ENEMY_ARCHETYPES[kind];
  const behaviorWeight =
    enemy.behavior === "phase" || enemy.behavior === "erratic"
      ? 2
      : enemy.behavior === "dash_halt" || enemy.behavior === "orbit"
        ? 1.4
        : enemy.behavior === "skitter"
          ? 0.8
          : 0;
  return Number(
    (
      enemy.damage * 0.5 +
      (enemy.damage / enemy.attackCooldown) * 0.2 +
      enemy.speed * 1.5 +
      enemy.attackRange +
      enemy.detectionRange * 0.08 +
      behaviorWeight
    ).toFixed(2),
  );
}

/**
 * Default pulse size is one enemy per room. Difficulty nudges that share a
 * little softer or harder without changing the readable room-based rule.
 */
export function resolveEnemiesPerWave(roomCount: number, difficulty: number): number {
  const rooms = Math.max(1, Math.floor(roomCount));
  const share = mix(0.9, 1.35, clamp01(difficulty));
  return Math.max(1, Math.round(rooms * share));
}

/**
 * Time waves plus one wave of progress per bound stone so stone finds also
 * unlock harder kinds and raise pressure.
 */
export function progressWaves(
  elapsedSeconds: number,
  waveSeconds: number,
  stonesFound = 0,
): number {
  const wave = Math.max(1, waveSeconds);
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const stones = Math.max(0, Math.floor(stonesFound));
  return Math.floor(elapsed / wave) + stones;
}

export function resolveDifficultyTuning(
  value: number,
  roomCount: number,
  availableEnemies: number,
): DifficultyTuning {
  const difficulty = clamp01(value);
  const rooms = Math.max(1, Math.floor(roomCount));
  const available = Math.max(0, Math.floor(availableEnemies));
  // At most one room in each complete group of six starts empty. Every other
  // room receives one actor, then difficulty decides how many receive two+.
  const initialOccupiedRooms = Math.max(0, rooms - Math.floor(rooms / 6));
  const doubleRoomShare = mix(0.35, 0.9, difficulty);
  const requestedInitialEnemies =
    initialOccupiedRooms + Math.round(initialOccupiedRooms * doubleRoomShare);
  const initialEnemies = Math.min(available, requestedInitialEnemies);
  const enemiesPerWave = resolveEnemiesPerWave(rooms, difficulty);
  // Keep long climb room so seat budget can actually activate over a run.
  const waveHeadroom = Math.round(mix(10, 16, difficulty));
  const mapCap = initialEnemies + enemiesPerWave * waveHeadroom;
  const maxEnemies = Math.min(
    available,
    Math.max(initialEnemies, Math.min(ENEMY_HARD_CAP, mapCap)),
  );
  return {
    value: difficulty,
    label: difficultyLabel(difficulty),
    initialOccupiedRooms: Math.min(initialOccupiedRooms, initialEnemies),
    initialEnemies,
    maxEnemies,
    enemiesPerWave,
    waveSeconds: DEFAULT_WAVE_SECONDS,
    // Fixed scale so unlocks land on the 25s pulse clock.
    dangerUnlockScale: 1,
    safeSpawnDistance: mix(14, 11, difficulty),
    revealSeconds: mix(1.45, 1.05, difficulty),
  };
}

export function enemyUnlockWave(kind: EnemyKind): number {
  return PHASE_WAVES[KIND_PHASE[kind]] ?? 0;
}

export function enemyUnlockSeconds(kind: EnemyKind, tuning: DifficultyTuning): number {
  return enemyUnlockWave(kind) * tuning.waveSeconds * tuning.dangerUnlockScale;
}

export function isEnemyKindUnlocked(
  kind: EnemyKind,
  elapsedSeconds: number,
  tuning: DifficultyTuning,
  stonesFound = 0,
): boolean {
  const waves = progressWaves(elapsedSeconds, tuning.waveSeconds, stonesFound);
  return waves + 1e-6 >= enemyUnlockWave(kind);
}

/** Highest danger tier unlocked for the current progress wave index. */
export function unlockedMaxTierForWaves(progressWaveCount: number): number {
  const waves = Math.max(0, Math.floor(progressWaveCount));
  let tier = 0;
  for (let index = 1; index < PHASE_WAVES.length; index += 1) {
    if (waves < PHASE_WAVES[index]!) break;
    tier = index;
  }
  return tier;
}

/**
 * Each bound magic stone permanently raises the active-enemy target by one
 * full reinforcement pulse, so progress toward the portal also escalates threat.
 */
export function stoneEnemyPressureBonus(stonesFound: number, enemiesPerWave: number): number {
  const stones = Math.max(0, Math.floor(stonesFound));
  const wave = Math.max(1, Math.floor(enemiesPerWave));
  return stones * wave;
}

export function resolveDifficultySnapshot(
  value: number,
  elapsedSeconds: number,
  roomCount: number,
  activeEnemies: number,
  reserveEnemies: number,
  stonesFound = 0,
): DifficultySnapshot {
  const active = Math.max(0, Math.floor(activeEnemies));
  const reserve = Math.max(0, Math.floor(reserveEnemies));
  const available = active + reserve;
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const tuning = resolveDifficultyTuning(value, roomCount, available);
  const waves = progressWaves(elapsed, tuning.waveSeconds, stonesFound);
  const timeWaves = Math.floor(elapsed / tuning.waveSeconds);
  // Each pulse adds about one enemy per room (see enemiesPerWave).
  const cumulativeWaveEnemies = timeWaves * tuning.enemiesPerWave;
  const stoneBonus = stoneEnemyPressureBonus(stonesFound, tuning.enemiesPerWave);
  const targetEnemies = Math.min(
    tuning.maxEnemies,
    tuning.initialEnemies + cumulativeWaveEnemies + stoneBonus,
  );
  const pressureLevel = Math.min(5, 1 + Math.floor(waves / LEVEL_EVERY_WAVES));
  const unlockedMaxTier = unlockedMaxTierForWaves(waves);
  const unlockedKinds = PHASE_KIND_COUNTS[unlockedMaxTier] ?? PHASE_KIND_COUNTS[0]!;
  const nextWave = (timeWaves + 1) * tuning.waveSeconds;
  return {
    ...tuning,
    elapsedSeconds: elapsed,
    activeEnemies: active,
    reserveEnemies: reserve,
    targetEnemies,
    pressureLevel,
    unlockedKinds,
    unlockedMaxTier,
    progressWaves: waves,
    nextEscalationSeconds: targetEnemies >= tuning.maxEnemies ? null : nextWave,
  };
}

export function formatRunClock(elapsedSeconds: number): string {
  const safe = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
