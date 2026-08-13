import { canOccupy, WorldColliderSpatialIndex, type WorldCollider } from "../dungeon/gridCollision";
import type { DungeonData } from "../dungeon/types";
import {
  ENEMY_ARCHETYPES,
  getEnemyMotion,
  isHoverEnemy,
  isLowProfileEnemy,
  type EnemyArchetype,
  type EnemyKind,
} from "./EnemyArchetypes";
import { applyBiomeEnemyMods } from "./EnemyBiomeMods";
import { enemyStrikesPlayerVertically, PLAYER_COMBAT_EYE_HEIGHT } from "./EnemyContact";
import { knockbackAwayFrom } from "./knockback";
import { DEFAULT_DIFFICULTY } from "../game/DifficultyDirector";

export {
  enemyContactVerticalRange,
  enemyStrikesPlayerVertically,
  playerHurtVerticalRange,
  PLAYER_COMBAT_EYE_HEIGHT,
  type VerticalRange,
} from "./EnemyContact";

/** Simulation-only enemy body (no Three mesh references). */
export interface EnemySimBody {
  kind: EnemyKind;
  position: { x: number; y: number; z: number };
  hitCooldown: number;
  attackPulse: number;
  baseY: number;
  baseScale: { x: number; y: number };
  phase: number;
  scaleX: number;
  scaleY: number;
  roll: number;
  /** Last hidden-cycle relocation applied to this body. */
  phaseEpoch: number;
  /** 0 while phased out, 1 while fully present. */
  phaseVisibility: number;
  /** Horizontal travel in the current tick; presentation selects idle from it. */
  moving: boolean;
  /** Permanent run-local death. The instanced seat stays allocated at zero scale. */
  defeated?: boolean;
}

export interface EnemySimResult {
  damage: number;
  nearestThreat: number;
  knockX: number;
  knockZ: number;
  knockHits: number;
  attacker: EnemySimBody | null;
}

export interface EnemySimContext {
  delta: number;
  elapsed: number;
  player: { x: number; y: number; z: number };
  dungeon: DungeonData | null;
  solidColliders: readonly WorldCollider[];
  solidColliderIndex?: WorldColliderSpatialIndex;
  tileSize: number;
  /** Horizontal safety radius enforced by a luminous ward. */
  repelRadius?: number;
  /** Optional flee speed multiplier for stronger fields. */
  repelSpeedMultiplier?: number;
  /** Wider ring where enemies still pursue, but slower (held torch). */
  slowRadius?: number;
  /** Pursuit speed inside `slowRadius` when not already fleeing. 0–1. */
  slowSpeedMultiplier?: number;
  /** Active dungeon biome; drives EnemyBiomeMods. */
  moodId?: string | null;
  /** Run difficulty 0–1; scales biome mods. */
  difficulty?: number;
  /**
   * Camera/eye height used to recover feet Y from player.y.
   * Defaults to the play controller eye height.
   */
  playerEyeHeight?: number;
  /**
   * Optional pre-resolved archetypes for this tick. When omitted, each enemy
   * resolves through applyBiomeEnemyMods(kind, moodId, difficulty).
   */
  archetypes?: Readonly<Partial<Record<EnemyKind, EnemyArchetype>>>;
  /** Timed frenzy curse: multiplies pursuit step speed. */
  pursuitSpeedMultiplier?: number;
  /** Timed frenzy curse: multiplies hit-cooldown drain. */
  attackRateMultiplier?: number;
  /** Timed frenzy curse: multiplies detection range used by motion. */
  detectionRangeMultiplier?: number;
}

// Enemy simulation runs every rendered frame. Reuse its temporary vectors so
// busy rooms do not turn ordinary pursuit into garbage-collector work.
const tempDir = { x: 0, z: 0 };
const tempSide = { x: 0, z: 0 };
const tempMove = { x: 0, z: 0 };
const tempPos = { x: 0, y: 0, z: 0 };
const tempSolidColliders: WorldCollider[] = [];

const PHASED_ENEMIES = new Set<EnemyKind>(["ghost", "white-eyed-shadow"]);

export function isPhasingEnemy(kind: EnemyKind): boolean {
  return PHASED_ENEMIES.has(kind);
}

function phaseDuration(kind: EnemyKind): number {
  return kind === "ghost" ? 4.6 : 3.75;
}

/**
 * Stable visibility envelope for spectral threats. Their phase offset keeps a
 * room of ghosts from vanishing on the same frame.
 */
export function enemyPhaseVisibility(kind: EnemyKind, elapsed: number, phase: number): number {
  if (!isPhasingEnemy(kind)) return 1;
  const duration = phaseDuration(kind);
  const local = (((elapsed + phase * 0.37) % duration) + duration) % duration;
  const progress = local / duration;
  if (progress < 0.46) return 1;
  if (progress < 0.58) {
    const fade = (progress - 0.46) / 0.12;
    return 1 - fade * fade * (3 - 2 * fade);
  }
  if (progress < 0.78) return 0;
  const fade = (progress - 0.78) / 0.22;
  return fade * fade * (3 - 2 * fade);
}

export function spiderPounceHeight(
  distance: number,
  elapsed: number,
  phase: number,
  attackRange = ENEMY_ARCHETYPES.spider.attackRange,
): number {
  if (distance <= attackRange * 0.9 || distance > 12) return 0;
  const pulse = Math.max(0, Math.sin(elapsed * 3.45 + phase));
  return Math.pow(pulse, 7) * 0.3;
}

function resolveSimArchetype(kind: EnemyKind, ctx: EnemySimContext): EnemyArchetype {
  const cached = ctx.archetypes?.[kind];
  if (cached) return cached;
  return applyBiomeEnemyMods(kind, ctx.moodId ?? "ash", ctx.difficulty ?? DEFAULT_DIFFICULTY);
}

export function impFlightOffset(distance: number, elapsed: number, phase: number): number {
  const proximity = 0.58 + clampScalar((12 - distance) / 12, 0, 1) * 0.42;
  const descent = (Math.sin(elapsed * 1.18 + phase) + 1) * 0.5;
  return -(0.12 + descent * 0.86 * proximity);
}

function clampScalar(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function enemyPhaseEpoch(kind: EnemyKind, elapsed: number, phase: number): number {
  const duration = phaseDuration(kind);
  return Math.floor((elapsed + phase * 0.37) / duration);
}

function relocatePhasedEnemy(
  enemy: EnemySimBody,
  player: EnemySimContext["player"],
  dungeon: DungeonData,
  solidColliders: readonly WorldCollider[],
  solidColliderIndex: WorldColliderSpatialIndex | undefined,
  tileSize: number,
  distance: number,
  epoch: number,
  archetype: EnemyArchetype = ENEMY_ARCHETYPES[enemy.kind],
): void {
  if (distance <= archetype.attackRange + 0.9) return;
  const towardX = (player.x - enemy.position.x) / Math.max(distance, 1e-4);
  const towardZ = (player.z - enemy.position.z) / Math.max(distance, 1e-4);
  const hash = Math.sin((enemy.phase + 1.7) * 12.9898 + epoch * 78.233);
  const sideSign = hash >= 0 ? 1 : -1;
  const lateral = (0.68 + Math.abs(hash) * 0.46) * sideSign;
  const advance = Math.min(1.25, Math.max(0.72, distance - archetype.attackRange - 0.45));
  const sideX = -towardZ;
  const sideZ = towardX;

  // Try the chosen flank, its mirror, then a shorter advance. This keeps the
  // relocation inside authored corridors without adding per-frame allocations.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const mirrored = attempt === 1 ? -1 : 1;
    const attemptAdvance = attempt === 2 ? advance * 0.55 : advance;
    const attemptLateral = attempt === 2 ? lateral * 0.35 : lateral * mirrored;
    tempPos.x = enemy.position.x + towardX * attemptAdvance + sideX * attemptLateral;
    tempPos.y = enemy.position.y;
    tempPos.z = enemy.position.z + towardZ * attemptAdvance + sideZ * attemptLateral;
    const nearbyColliders = solidColliderIndex
      ? solidColliderIndex.queryAroundInto(tempPos, 0.2, tempSolidColliders)
      : solidColliders;
    if (!canOccupy(dungeon, tempPos, tileSize, 0.2, undefined, nearbyColliders)) continue;
    enemy.position.x = tempPos.x;
    enemy.position.z = tempPos.z;
    return;
  }
}

/**
 * Pure-ish combat + motion tick. Mutates enemy bodies in place.
 * Presentation (instanced matrices) stays in DungeonWorld.
 */
export function tickEnemySim(
  enemies: readonly EnemySimBody[],
  ctx: EnemySimContext,
): EnemySimResult {
  let damage = 0;
  let nearestThreat = Number.POSITIVE_INFINITY;
  let knockX = 0;
  let knockZ = 0;
  let knockHits = 0;
  let attacker: EnemySimBody | null = null;
  let attackerDistance = Number.POSITIVE_INFINITY;
  const { delta, elapsed, player, dungeon, solidColliders, tileSize } = ctx;
  const repelRadius = Math.max(0, ctx.repelRadius ?? 0);
  const repelSpeedMultiplier = Math.max(1, ctx.repelSpeedMultiplier ?? 1);
  const slowRadius = Math.max(0, ctx.slowRadius ?? 0);
  const slowSpeedMultiplier = clampScalar(ctx.slowSpeedMultiplier ?? 1, 0, 1);
  const pursuitSpeedMultiplier = Math.max(0.1, ctx.pursuitSpeedMultiplier ?? 1);
  const attackRateMultiplier = Math.max(0.1, ctx.attackRateMultiplier ?? 1);
  const detectionRangeMultiplier = Math.max(0.1, ctx.detectionRangeMultiplier ?? 1);
  const eyeHeight = ctx.playerEyeHeight ?? PLAYER_COMBAT_EYE_HEIGHT;
  for (const enemy of enemies) {
    if (enemy.defeated || enemy.scaleX <= 0.001 || enemy.scaleY <= 0.001) {
      enemy.moving = false;
      continue;
    }
    const archetype = resolveSimArchetype(enemy.kind, ctx);
    enemy.hitCooldown = Math.max(0, enemy.hitCooldown - delta * attackRateMultiplier);
    enemy.attackPulse = Math.max(0, enemy.attackPulse - delta * 3.8 * attackRateMultiplier);
    const dx = enemy.position.x - player.x;
    const dz = enemy.position.z - player.z;
    let distance = Math.hypot(dx, dz);
    let repelActive = repelRadius > 0 && distance < repelRadius;
    let slowActive = !repelActive && slowRadius > 0 && distance < slowRadius;
    nearestThreat = Math.min(nearestThreat, distance);
    enemy.phaseVisibility = enemyPhaseVisibility(enemy.kind, elapsed, enemy.phase);
    if (isPhasingEnemy(enemy.kind) && !repelActive && dungeon && enemy.phaseVisibility <= 0.001) {
      const epoch = enemyPhaseEpoch(enemy.kind, elapsed, enemy.phase);
      if (enemy.phaseEpoch !== epoch) {
        relocatePhasedEnemy(
          enemy,
          player,
          dungeon,
          solidColliders,
          ctx.solidColliderIndex,
          tileSize,
          distance,
          epoch,
          archetype,
        );
        enemy.phaseEpoch = epoch;
        distance = Math.hypot(enemy.position.x - player.x, enemy.position.z - player.z);
        nearestThreat = Math.min(nearestThreat, distance);
        repelActive = repelRadius > 0 && distance < repelRadius;
        slowActive = !repelActive && slowRadius > 0 && distance < slowRadius;
      }
    }
    let travelled = 0;
    // Scale perceived distance so frenzy also widens pursuit engagement bands.
    const motionDistance =
      detectionRangeMultiplier > 1.001 ? distance / detectionRangeMultiplier : distance;
    const motion = getEnemyMotion(enemy.kind, motionDistance, elapsed, enemy.phase, archetype);
    if (motion.speedMultiplier > 0 && dungeon) {
      // An active protection field reverses pursuit inside its safety radius.
      // Keep a small lateral component so several enemies do not stack on one line.
      const flee = repelActive;
      if (flee && distance <= 1e-4) {
        // A just-spawned enemy can share the player's cell. Give it a stable
        // escape heading so the ward still creates space on the first tick.
        const escapeAngle = enemy.phase + enemy.position.x * 0.7 + enemy.position.z * 0.31;
        tempDir.x = Math.cos(escapeAngle);
        tempDir.z = Math.sin(escapeAngle);
      } else {
        tempDir.x = flee ? enemy.position.x - player.x : player.x - enemy.position.x;
        tempDir.z = flee ? enemy.position.z - player.z : player.z - enemy.position.z;
      }
      const len = Math.hypot(tempDir.x, tempDir.z);
      if (len > 1e-4) {
        tempDir.x /= len;
        tempDir.z /= len;
      }
      tempSide.x = -tempDir.z;
      tempSide.z = tempDir.x;
      const forward = flee ? Math.max(0.84, Math.abs(motion.forward)) : motion.forward;
      const strafe = flee ? motion.strafe * 0.18 : motion.strafe;
      tempMove.x = tempDir.x * forward + tempSide.x * strafe;
      tempMove.z = tempDir.z * forward + tempSide.z * strafe;
      const mLen = Math.hypot(tempMove.x, tempMove.z);
      if (mLen > 1e-4) {
        tempMove.x /= mLen;
        tempMove.z /= mLen;
      }
      const step =
        archetype.speed *
        motion.speedMultiplier *
        delta *
        pursuitSpeedMultiplier *
        (flee ? repelSpeedMultiplier : slowActive ? slowSpeedMultiplier : 1);
      tempPos.x = enemy.position.x + tempMove.x * step;
      tempPos.y = enemy.position.y;
      tempPos.z = enemy.position.z + tempMove.z * step;
      const nearbyColliders = ctx.solidColliderIndex
        ? ctx.solidColliderIndex.queryAroundInto(tempPos, 0.2, tempSolidColliders)
        : solidColliders;
      if (canOccupy(dungeon, tempPos, tileSize, 0.2, undefined, nearbyColliders)) {
        enemy.position.x = tempPos.x;
        enemy.position.z = tempPos.z;
        travelled = step;
      }
    }

    enemy.moving = travelled > 0.0001;
    const breath = Math.sin(elapsed * 2.15 + enemy.phase);
    const gait =
      travelled > 0 ? Math.sin(elapsed * (6.5 + archetype.speed * 2.2) + enemy.phase) : 0;
    const attack = Math.sin(enemy.attackPulse * Math.PI);
    const crawl = isLowProfileEnemy(enemy.kind) ? Math.sin(elapsed * 10 + enemy.phase) : 0;
    const hover =
      isHoverEnemy(enemy.kind) && enemy.kind !== "imp"
        ? Math.sin(elapsed * 2.8 + enemy.phase) * (enemy.kind === "ghost" ? 0.12 : 0.08)
        : 0;
    const pounce =
      enemy.kind === "spider"
        ? spiderPounceHeight(distance, elapsed, enemy.phase, archetype.attackRange)
        : 0;
    const flight = enemy.kind === "imp" ? impFlightOffset(distance, elapsed, enemy.phase) : 0;
    const heavy =
      enemy.kind === "zombie-orc" || enemy.kind === "husk" || enemy.kind === "bone-slime"
        ? 0.55
        : 1;
    enemy.position.y =
      enemy.baseY + Math.abs(gait) * 0.055 * heavy + attack * 0.08 + hover + pounce + flight;
    enemy.scaleX =
      enemy.baseScale.x *
      (1 - breath * 0.018 + Math.abs(gait) * 0.025 + attack * 0.07 + Math.abs(crawl) * 0.035);
    enemy.scaleY =
      enemy.baseScale.y *
      (1 + breath * 0.026 - Math.abs(gait) * 0.018 + attack * 0.04 - Math.abs(crawl) * 0.025);
    const sway =
      enemy.kind === "white-eyed-shadow"
        ? 0.052
        : enemy.kind === "ghost"
          ? 0.025
          : enemy.kind === "goblin" || enemy.kind === "spider"
            ? 0.03
            : 0.018;
    const lowCrawl = isLowProfileEnemy(enemy.kind);
    const shadowTwitch =
      enemy.kind === "white-eyed-shadow"
        ? Math.sin(elapsed * 9.4 + enemy.phase) * 0.022 +
          Math.sin(elapsed * 4.1 + enemy.phase * 2.3) * 0.014
        : 0;
    enemy.roll =
      Math.sin(elapsed * 2.2 + enemy.phase) * sway +
      gait * (lowCrawl ? 0.028 : 0.012) +
      shadowTwitch;

    if (
      !repelActive &&
      distance < archetype.attackRange &&
      enemy.hitCooldown === 0 &&
      enemy.phaseVisibility >= 0.82 &&
      enemyStrikesPlayerVertically(player.y, enemy, archetype, eyeHeight)
    ) {
      damage += archetype.damage;
      enemy.hitCooldown = archetype.attackCooldown;
      enemy.attackPulse = 1;
      const push = knockbackAwayFrom(player.x, player.z, enemy.position.x, enemy.position.z);
      knockX += push.x;
      knockZ += push.z;
      knockHits += 1;
      if (distance < attackerDistance) {
        attacker = enemy;
        attackerDistance = distance;
      }
    }
  }

  return { damage, nearestThreat, knockX, knockZ, knockHits, attacker };
}
