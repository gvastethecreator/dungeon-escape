import { ENEMY_ARCHETYPES, type EnemyKind } from "../world/EnemyArchetypes";

export const DEFAULT_DIFFICULTY = 0.5;

export type DifficultyLabel = "MERCIFUL" | "CAUTIOUS" | "STANDARD" | "HARD" | "RELENTLESS";

export interface DifficultyTuning {
  value: number;
  label: DifficultyLabel;
  initialOccupiedRooms: number;
  initialEnemies: number;
  maxEnemies: number;
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
  const mapCap = initialEnemies + Math.round(rooms * (0.65 + difficulty * 0.55));
  const maxEnemies = Math.min(available, Math.max(initialEnemies, Math.min(128, mapCap)));
  return {
    value: difficulty,
    label: difficultyLabel(difficulty),
    initialOccupiedRooms: Math.min(initialOccupiedRooms, initialEnemies),
    initialEnemies,
    maxEnemies,
    waveSeconds: 30,
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
  // Pulses add +2, +4, +6… to make delay costly without front-loading the run.
  const cumulativeWaveEnemies = normalWaves * (normalWaves + 1);
  const targetEnemies = Math.min(tuning.maxEnemies, tuning.initialEnemies + cumulativeWaveEnemies);
  const pressureLevel = Math.min(5, 1 + Math.floor(elapsed / tuning.waveSeconds));
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
