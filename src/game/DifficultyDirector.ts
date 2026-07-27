import { ENEMY_ARCHETYPES, type EnemyKind } from "../world/EnemyArchetypes";

export const DEFAULT_DIFFICULTY = 0.5;

/** Hard active-enemy ceiling so large maps stay inside the instancing budget. */
export const ENEMY_HARD_CAP = 200;

/** Default reinforcement cadence: one new seat per room. */
export const DEFAULT_WAVE_SECONDS = 16;

/**
 * Pressure and danger-band unlocks climb every this many reinforcement pulses.
 * Two waves keeps readable steps without waiting a full minute.
 */
export const LEVEL_EVERY_WAVES = 2;

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

// Unlock bands advance every LEVEL_EVERY_WAVES reinforcement pulses.
const PHASE_WAVES = [0, 2, 4, 6, 8] as const;
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
  const share = mix(0.85, 1.2, clamp01(difficulty));
  return Math.max(1, Math.round(rooms * share));
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
  // room receives one actor, then difficulty decides how many receive two.
  const initialOccupiedRooms = Math.max(0, rooms - Math.floor(rooms / 6));
  const doubleRoomShare = mix(0.25, 0.75, difficulty);
  const requestedInitialEnemies =
    initialOccupiedRooms + Math.round(initialOccupiedRooms * doubleRoomShare);
  const initialEnemies = Math.min(available, requestedInitialEnemies);
  const enemiesPerWave = resolveEnemiesPerWave(rooms, difficulty);
  // Keep several full room pulses available so 16s waves climb for a few
  // minutes before the hard instancing ceiling.
  const waveHeadroom = Math.round(mix(5, 9, difficulty));
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
    dangerUnlockScale: mix(1.25, 0.75, difficulty),
    safeSpawnDistance: mix(16, 13, difficulty),
    revealSeconds: mix(1.6, 1.15, difficulty),
  };
}

export function enemyUnlockSeconds(kind: EnemyKind, tuning: DifficultyTuning): number {
  const phase = KIND_PHASE[kind];
  return PHASE_WAVES[phase] * tuning.waveSeconds * tuning.dangerUnlockScale;
}

export function isEnemyKindUnlocked(
  kind: EnemyKind,
  elapsedSeconds: number,
  tuning: DifficultyTuning,
): boolean {
  return elapsedSeconds + 1e-6 >= enemyUnlockSeconds(kind, tuning);
}

export function resolveDifficultySnapshot(
  value: number,
  elapsedSeconds: number,
  roomCount: number,
  activeEnemies: number,
  reserveEnemies: number,
): DifficultySnapshot {
  const active = Math.max(0, Math.floor(activeEnemies));
  const reserve = Math.max(0, Math.floor(reserveEnemies));
  const available = active + reserve;
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const tuning = resolveDifficultyTuning(value, roomCount, available);
  const normalWaves = Math.floor(elapsed / tuning.waveSeconds);
  // Each pulse adds about one enemy per room (see enemiesPerWave).
  const cumulativeWaveEnemies = normalWaves * tuning.enemiesPerWave;
  const targetEnemies = Math.min(tuning.maxEnemies, tuning.initialEnemies + cumulativeWaveEnemies);
  const pressureLevel = Math.min(5, 1 + Math.floor(normalWaves / LEVEL_EVERY_WAVES));
  let phase = 0;
  for (let index = 1; index < PHASE_WAVES.length; index += 1) {
    if (elapsed < PHASE_WAVES[index]! * tuning.waveSeconds * tuning.dangerUnlockScale) break;
    phase = index;
  }
  const nextWave = (normalWaves + 1) * tuning.waveSeconds;
  return {
    ...tuning,
    elapsedSeconds: elapsed,
    activeEnemies: active,
    reserveEnemies: reserve,
    targetEnemies,
    pressureLevel,
    unlockedKinds: PHASE_KIND_COUNTS[phase]!,
    nextEscalationSeconds: targetEnemies >= tuning.maxEnemies ? null : nextWave,
  };
}

export function formatRunClock(elapsedSeconds: number): string {
  const safe = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
