import * as THREE from "three";

import {
  canOccupy,
  feetClearColliderTop,
  gridToWorld,
  moveWithCollision,
  overlapsWorldCollider,
  worldToGridInto,
  type VerticalCollisionRange,
  type WorldCollider,
} from "../dungeon/gridCollision";
import type { DungeonData, GridCell } from "../dungeon/types";
import { LookInputFilter } from "./LookInputFilter";
import {
  createStaminaState,
  DEFAULT_STAMINA_CONFIG,
  resetStamina,
  STAMINA_MAX,
  stepStamina,
  type StaminaState,
} from "./Stamina";
import {
  MOBILITY_BOOST_CAMERA_BOB_SCALE,
  MOBILITY_BOOST_FOV_KICK,
  MOBILITY_BOOST_SPEED_MULTIPLIER,
  MOBILITY_BOOST_STRIDE_RATE,
} from "../game/MobilityBoost";
import { SLOW_CURSE_SPEED_MULTIPLIER } from "../game/SlowCurse";
import {
  createVerticalMotionState,
  resetVerticalMotion,
  stepVerticalMotion,
  VERTICAL_EVENT,
  type VerticalMotionConfig,
  type VerticalMotionState,
} from "./VerticalMotion";

export type PlayerAction =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "sprint"
  | "jump"
  | "turnLeft"
  | "turnRight"
  | "interact";

const KEY_ACTIONS: Readonly<Record<string, PlayerAction>> = {
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "backward",
  ArrowDown: "backward",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
  Space: "jump",
  KeyE: "interact",
};
const MAX_LOOK_PITCH = 1.18;
const MOBILITY_STAMINA_CONFIG = Object.freeze({
  ...DEFAULT_STAMINA_CONFIG,
  drainPerSecond: 0,
  regenEarlyPerSecond: 5,
  regenExhaustedPerSecond: 5,
});
/** Peak camera bank while fully strafing (radians). Soft enough to stay readable. */
export const STRAFE_LEAN_MAX = 0.052;
/** How quickly lean eases toward the current strafe (higher = snappier). */
export const STRAFE_LEAN_RESPONSE = 8.2;

export interface ControllerState {
  locked: boolean;
  position: { x: number; y: number; z: number };
  cell: GridCell | null;
  distanceTravelled: number;
  speed: number;
  moving: boolean;
  sprinting: boolean;
  /** 0..1 sprint stamina remaining. */
  stamina: number;
  /** True after a full drain until partial recovery. */
  staminaExhausted: boolean;
  stridePhase: number;
  cameraMotion: number;
  lookYaw: number;
  lookPitch: number;
  grounded: boolean;
  jumping: boolean;
  verticalSpeed: number;
  jumpHeight: number;
  intents: PlayerAction[];
}

export interface ControllerPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  distanceTravelled?: number;
}

interface RestorablePoseOptions {
  readonly tileSize: number;
  readonly eyeHeight: number;
  readonly radius: number;
  readonly headClearance: number;
  readonly isBlockedCell?: (cell: GridCell) => boolean;
  readonly colliders?: readonly WorldCollider[];
}

export function resolveRestorableControllerPose(
  dungeon: DungeonData,
  pose: ControllerPose,
  options: RestorablePoseOptions,
): Required<ControllerPose> | null {
  const distanceTravelled = pose.distanceTravelled ?? 0;
  if (
    ![pose.x, pose.y, pose.z, pose.yaw, pose.pitch, distanceTravelled].every(Number.isFinite) ||
    distanceTravelled < 0 ||
    distanceTravelled > 1_000_000
  ) {
    return null;
  }
  if (Math.abs(pose.y) > 1_000_000) return null;
  // Saves do not carry vertical velocity/grounded state. Resume on the floor
  // instead of freezing a mid-jump camera at an unsupported height.
  const restoredY = options.eyeHeight;
  const verticalRange = {
    minY: 0.08,
    maxY: restoredY + options.headClearance,
  };
  if (
    !canOccupy(
      dungeon,
      pose,
      options.tileSize,
      options.radius,
      options.isBlockedCell,
      options.colliders,
      verticalRange,
    )
  ) {
    return null;
  }
  return {
    x: pose.x,
    y: restoredY,
    z: pose.z,
    yaw: Math.atan2(Math.sin(pose.yaw), Math.cos(pose.yaw)),
    pitch: THREE.MathUtils.clamp(pose.pitch, -MAX_LOOK_PITCH, MAX_LOOK_PITCH),
    distanceTravelled,
  };
}

export interface ControllerUpdate {
  moved: boolean;
  changedCell: boolean;
  blockedX: boolean;
  blockedZ: boolean;
  cell: GridCell | null;
  atExit: boolean;
  interactPressed: boolean;
  footstep: boolean;
  jumped: boolean;
  landed: boolean;
  hitCeiling: boolean;
  /** True on the frame sprint stamina first hits empty. */
  justExhausted: boolean;
  /** 0..1 fill for the stamina meter. */
  stamina: number;
  staminaExhausted: boolean;
}

interface ControllerOptions {
  tileSize?: number;
  eyeHeight?: number;
  radius?: number;
  moveSpeed?: number;
  sprintMultiplier?: number;
  acceleration?: number;
  deceleration?: number;
  /** Horizontal steer response while airborne with input held. */
  airAcceleration?: number;
  /** Horizontal coast decay while airborne with no input. */
  airDeceleration?: number;
  mouseSensitivity?: number;
  cameraMotion?: number;
  lookResponse?: number;
  ceilingHeight?: number;
  jumpSpeed?: number;
  gravity?: number;
  /** Extra jumps after leaving the ground (1 = double jump). */
  maxAirJumps?: number;
  onLockChange?: (locked: boolean, message: string) => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, button"))
  );
}

export class FirstPersonController {
  readonly camera: THREE.PerspectiveCamera;
  readonly domElement: HTMLElement;
  readonly position = new THREE.Vector3();

  private readonly baseFov: number;
  private readonly tileSize: number;
  private readonly eyeHeight: number;
  private readonly radius: number;
  private readonly moveSpeed: number;
  private readonly sprintMultiplier: number;
  private readonly acceleration: number;
  private readonly deceleration: number;
  private readonly airAcceleration: number;
  private readonly airDeceleration: number;
  private readonly onLockChange: (locked: boolean, message: string) => void;
  private mouseSensitivity: number;
  private cameraMotion: number;
  private criticalMovementDrift = 0;
  private surfaceSpeedScale = 1;
  private surfaceTraction = 1;
  private mobilityBoostActive = false;
  private slowCurseActive = false;
  private readonly lookResponse: number;
  private readonly verticalConfig: VerticalMotionConfig;
  private readonly verticalState: VerticalMotionState;
  private readonly staminaState: StaminaState = createStaminaState(STAMINA_MAX);
  private dungeon: DungeonData | null = null;
  private readonly blockedCells = new Set<string>();
  private solidColliders: WorldCollider[] = [];
  /**
   * Prop colliders the player has already cleared with their feet while airborne.
   * Kept until the player is grounded and free of that footprint so landing on a
   * crate mid-vault does not re-trap the capsule inside the solid.
   */
  private readonly vaultedColliderIds = new Set<number>();
  /** Scratch list rebuilt each move — no per-frame allocation growth beyond capacity. */
  private activeColliders: WorldCollider[] = [];
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly keys = new Set<PlayerAction>();
  private readonly virtualActions = new Set<PlayerAction>();
  private readonly virtualPulse = new Set<PlayerAction>();
  private readonly justPressed = new Set<PlayerAction>();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly velocity = new THREE.Vector2();
  /** Separate decay impulse for hit knockback (XZ; y slot = Z). */
  private readonly knockVel = new THREE.Vector2();
  private readonly lookInput = new LookInputFilter();
  private lookYaw = 0;
  private lookPitch = 0;
  private targetYaw = 0;
  private targetPitch = 0;
  private stridePhase = 0;
  private strideDistance = 0;
  private elapsed = 0;
  private landingDip = 0;
  /** Smoothed camera roll while strafing (radians, Z in YXZ euler). */
  private strafeLean = 0;
  private locked = false;
  private enabled = true;
  private distanceTravelled = 0;
  private readonly lastCell: GridCell = { x: 0, y: 0 };
  private hasLastCell = false;
  /**
   * Cell computed during update(); reused by getState() so we never call
   * worldToGrid twice per frame. Stays null when the controller has no dungeon.
   */
  private readonly currentCell: GridCell = { x: 0, y: 0 };
  private readonly movementDelta = { x: 0, z: 0 };
  private readonly collisionVerticalRange: VerticalCollisionRange = { minY: 0, maxY: 0 };
  private readonly isBlockedCell = (cell: GridCell): boolean =>
    this.blockedCells.has(`${cell.x},${cell.y}`);
  // Hot-path scratch — getState() mutates these in place instead of allocating.
  private readonly stateScratch: ControllerState = {
    locked: false,
    position: { x: 0, y: 0, z: 0 },
    cell: null,
    distanceTravelled: 0,
    speed: 0,
    moving: false,
    sprinting: false,
    stamina: 1,
    staminaExhausted: false,
    stridePhase: 0,
    cameraMotion: 0,
    lookYaw: 0,
    lookPitch: 0,
    grounded: true,
    jumping: false,
    verticalSpeed: 0,
    jumpHeight: 0,
    intents: [],
  };
  /** Union of keys + virtual actions, rebuilt in place each getState() call. */
  private readonly intentUnion = new Set<PlayerAction>();
  /** Cached reduced-motion query (matchMedia per frame is wasteful). */
  private readonly reducedMotionQuery: MediaQueryList = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    options: ControllerOptions = {},
  ) {
    this.camera = camera;
    this.baseFov = camera.fov;
    this.domElement = domElement;
    this.tileSize = options.tileSize ?? 2.4;
    this.eyeHeight = options.eyeHeight ?? 1.68;
    this.radius = options.radius ?? 0.32;
    this.moveSpeed = options.moveSpeed ?? 5.1;
    this.sprintMultiplier = options.sprintMultiplier ?? 1.55;
    this.acceleration = options.acceleration ?? 18;
    this.deceleration = options.deceleration ?? 14;
    // Air steer is intentional: redirect quickly toward held WASD, coast when released.
    this.airAcceleration = options.airAcceleration ?? 22;
    this.airDeceleration = options.airDeceleration ?? 2.4;
    this.mouseSensitivity = options.mouseSensitivity ?? 0.0018;
    this.cameraMotion = options.cameraMotion ?? 0.72;
    // Higher look response = snappier camera (less floaty lag on pointer move).
    this.lookResponse = options.lookResponse ?? 36;
    this.verticalConfig = {
      eyeHeight: this.eyeHeight,
      ceilingHeight: options.ceilingHeight ?? 4.4,
      headClearance: 0.18,
      gravity: options.gravity ?? 17,
      jumpSpeed: options.jumpSpeed ?? 5.8,
      maxAirJumps: options.maxAirJumps ?? 1,
    };
    this.verticalState = createVerticalMotionState(
      this.eyeHeight,
      this.verticalConfig.maxAirJumps,
    );
    this.onLockChange = options.onLockChange ?? (() => undefined);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    document.addEventListener("pointerlockerror", this.handlePointerLockError);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("blur", this.handleBlur);
    this.domElement.addEventListener("click", this.handleSceneClick);
  }

  setDungeon(dungeon: DungeonData): void {
    this.dungeon = dungeon;
    const spawn = gridToWorld(dungeon, dungeon.spawn, this.tileSize);
    const exit = gridToWorld(dungeon, dungeon.exit, this.tileSize);
    this.position.set(spawn.x, this.eyeHeight, spawn.z);
    this.velocity.set(0, 0);
    this.knockVel.set(0, 0);
    this.surfaceSpeedScale = 1;
    this.surfaceTraction = 1;
    this.mobilityBoostActive = false;
    this.slowCurseActive = false;
    this.vaultedColliderIds.clear();
    resetVerticalMotion(this.verticalState, this.eyeHeight, this.verticalConfig.maxAirJumps);
    resetStamina(this.staminaState, STAMINA_MAX);
    this.landingDip = 0;
    this.distanceTravelled = 0;
    this.currentCell.x = dungeon.spawn.x;
    this.currentCell.y = dungeon.spawn.y;
    this.lastCell.x = dungeon.spawn.x;
    this.lastCell.y = dungeon.spawn.y;
    this.hasLastCell = true;
    this.lookPitch = 0;
    this.lookYaw = Math.atan2(-(exit.x - spawn.x), -(exit.z - spawn.z));
    this.targetPitch = this.lookPitch;
    this.targetYaw = this.lookYaw;
    this.stridePhase = 0;
    this.strideDistance = 0;
    this.elapsed = 0;
    this.strafeLean = 0;
    this.euler.set(this.lookPitch, this.lookYaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(this.euler);
    this.syncCameraPosition();
  }

  /**
   * Place the player at a saved pose after setDungeon. Keeps dungeon collision
   * bindings; only body, look, and distance resume.
   */
  restorePose(pose: ControllerPose): boolean {
    if (!this.dungeon) return false;
    const restored = resolveRestorableControllerPose(this.dungeon, pose, {
      tileSize: this.tileSize,
      eyeHeight: this.eyeHeight,
      radius: this.radius,
      headClearance: this.verticalConfig.headClearance,
      isBlockedCell: this.isBlockedCell,
      colliders: this.solidColliders,
    });
    if (!restored) return false;
    this.position.set(restored.x, restored.y, restored.z);
    this.velocity.set(0, 0);
    this.knockVel.set(0, 0);
    this.vaultedColliderIds.clear();
    resetVerticalMotion(this.verticalState, restored.y, this.verticalConfig.maxAirJumps);
    this.landingDip = 0;
    this.distanceTravelled = restored.distanceTravelled;
    this.lookYaw = restored.yaw;
    this.lookPitch = restored.pitch;
    this.targetYaw = restored.yaw;
    this.targetPitch = restored.pitch;
    this.stridePhase = 0;
    this.strideDistance = 0;
    this.strafeLean = 0;
    worldToGridInto(this.dungeon, this.position, this.tileSize, this.currentCell);
    this.lastCell.x = this.currentCell.x;
    this.lastCell.y = this.currentCell.y;
    this.hasLastCell = true;
    this.euler.set(this.lookPitch, this.lookYaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(this.euler);
    this.syncCameraPosition();
    return true;
  }

  setBlockedCells(cells: readonly GridCell[]): void {
    this.blockedCells.clear();
    for (const cell of cells) this.blockedCells.add(`${cell.x},${cell.y}`);
  }

  setSolidColliders(colliders: readonly WorldCollider[]): void {
    this.solidColliders = colliders.map((collider) => ({ ...collider }));
    this.vaultedColliderIds.clear();
    this.activeColliders = [];
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.virtualActions.clear();
      this.velocity.set(0, 0);
      this.knockVel.set(0, 0);
      this.lookInput.clear();
      this.targetYaw = this.lookYaw;
      this.targetPitch = this.lookPitch;
    }
  }

  /**
   * Instant XZ push (unit direction preferred). Used when enemies land a hit.
   * strength is m/s impulse; decays independently of walk input.
   */
  applyKnockback(dirX: number, dirZ: number, strength = 9.2): void {
    const len = Math.hypot(dirX, dirZ);
    let nx = dirX;
    let nz = dirZ;
    if (len < 1e-4) {
      // Fall back to camera rear if source and player overlap.
      nx = Math.sin(this.lookYaw);
      nz = Math.cos(this.lookYaw);
    } else {
      nx /= len;
      nz /= len;
    }
    this.knockVel.x += nx * strength;
    this.knockVel.y += nz * strength;
    // Cap so stacked hits stay readable, not teleporty.
    const knockLen = this.knockVel.length();
    if (knockLen > 14) this.knockVel.multiplyScalar(14 / knockLen);
  }

  setMouseSensitivity(value: number): void {
    this.mouseSensitivity = THREE.MathUtils.clamp(value, 0.00045, 0.0032);
  }

  setCameraMotion(value: number): void {
    this.cameraMotion = THREE.MathUtils.clamp(value, 0, 1);
  }

  setCriticalMovementDrift(value: number): void {
    this.criticalMovementDrift = THREE.MathUtils.clamp(value, -0.1, 0.1);
  }

  setSurfaceMovement(speedScale: number, traction: number): void {
    this.surfaceSpeedScale = THREE.MathUtils.clamp(speedScale, 0.45, 1.2);
    this.surfaceTraction = THREE.MathUtils.clamp(traction, 0.12, 1.2);
  }

  setMobilityBoost(active: boolean): void {
    this.mobilityBoostActive = active;
  }

  setSlowCurse(active: boolean): void {
    this.slowCurseActive = active;
  }

  requestPointerLock(): void {
    if (!this.domElement.requestPointerLock || !this.enabled) return;
    const result = this.domElement.requestPointerLock();
    if (result?.catch)
      void result.catch(() =>
        this.onLockChange(false, "Could not capture the pointer. Press Enter to retry."),
      );
  }

  releasePointerLock(): void {
    if (document.pointerLockElement === this.domElement) void document.exitPointerLock();
  }

  setVirtualAction(action: PlayerAction, active: boolean): void {
    if (active) {
      if (!this.virtualActions.has(action)) {
        this.justPressed.add(action);
        this.virtualPulse.add(action);
      }
      this.virtualActions.add(action);
    } else {
      this.virtualActions.delete(action);
    }
  }

  isActionActive(action: PlayerAction): boolean {
    return this.keys.has(action) || this.virtualActions.has(action);
  }

  consumePressed(action: PlayerAction): boolean {
    const pressed = this.justPressed.has(action);
    this.justPressed.delete(action);
    return pressed;
  }

  update(delta: number): ControllerUpdate {
    if (!this.dungeon || !this.enabled)
      return {
        moved: false,
        changedCell: false,
        blockedX: false,
        blockedZ: false,
        cell: null,
        atExit: false,
        interactPressed: false,
        footstep: false,
        jumped: false,
        landed: false,
        hitCeiling: false,
        justExhausted: false,
        stamina: this.staminaState.value / STAMINA_MAX,
        staminaExhausted: this.staminaState.exhausted,
      };

    this.elapsed += delta;
    const lookDelta = this.lookInput.consume();
    this.targetYaw -= lookDelta.x * this.mouseSensitivity;
    this.targetPitch = clampLookPitch(
      this.targetPitch - lookDelta.y * this.mouseSensitivity * 0.72,
    );

    const turnDirection =
      Number(this.isActionActive("turnRight") || this.virtualPulse.has("turnRight")) -
      Number(this.isActionActive("turnLeft") || this.virtualPulse.has("turnLeft"));
    if (turnDirection !== 0) {
      this.targetYaw -= turnDirection * delta * 1.9;
    }

    this.lookYaw = dampAngle(this.lookYaw, this.targetYaw, this.lookResponse * 0.72, delta);
    this.lookPitch = THREE.MathUtils.damp(
      this.lookPitch,
      this.targetPitch,
      this.lookResponse * 0.58,
      delta,
    );

    const forwardInput =
      Number(this.isActionActive("forward") || this.virtualPulse.has("forward")) -
      Number(this.isActionActive("backward") || this.virtualPulse.has("backward"));
    const sidewaysInput =
      Number(this.isActionActive("right") || this.virtualPulse.has("right")) -
      Number(this.isActionActive("left") || this.virtualPulse.has("left"));
    const hasIntent = forwardInput !== 0 || sidewaysInput !== 0;
    const movementAllowed =
      this.locked || this.virtualActions.size > 0 || this.virtualPulse.size > 0;
    const stamina = stepStamina(
      this.staminaState,
      delta,
      movementAllowed && this.isActionActive("sprint"),
      hasIntent && movementAllowed,
      this.mobilityBoostActive ? MOBILITY_STAMINA_CONFIG : DEFAULT_STAMINA_CONFIG,
    );
    const verticalEvents = stepVerticalMotion(
      this.verticalState,
      delta,
      movementAllowed && this.consumePressed("jump"),
      this.verticalConfig,
    );
    const jumped = (verticalEvents & VERTICAL_EVENT.jumped) !== 0;
    const landed = (verticalEvents & VERTICAL_EVENT.landed) !== 0;
    const hitCeiling = (verticalEvents & VERTICAL_EVENT.hitCeiling) !== 0;
    if (landed) {
      this.landingDip = -Math.min(0.085, this.verticalState.landingSpeed * 0.009);
    }
    this.position.y = this.verticalState.y;
    // Foot skin: slightly above true sole so floor-flush collider tops clear mid-jump.
    const feetY = this.verticalState.y - this.eyeHeight + 0.08;
    this.updateVaultedColliders(feetY);
    let blockedX = false;
    let blockedZ = false;

    this.forward.set(-Math.sin(this.lookYaw), 0, -Math.cos(this.lookYaw));
    this.right.crossVectors(this.forward, this.camera.up).normalize();
    this.desired.set(0, 0, 0);
    if (hasIntent && movementAllowed) {
      this.desired
        .addScaledVector(this.forward, forwardInput)
        .addScaledVector(this.right, sidewaysInput)
        .normalize();
      if (Math.abs(this.criticalMovementDrift) > 0.0001) {
        const desiredX = this.desired.x;
        const desiredZ = this.desired.z;
        this.desired.x += -desiredZ * this.criticalMovementDrift;
        this.desired.z += desiredX * this.criticalMovementDrift;
        this.desired.normalize();
      }
    }

    const targetSpeed =
      hasIntent && movementAllowed
        ? this.moveSpeed *
          this.surfaceSpeedScale *
          (this.mobilityBoostActive ? MOBILITY_BOOST_SPEED_MULTIPLIER : 1) *
          (this.slowCurseActive ? SLOW_CURSE_SPEED_MULTIPLIER : 1) *
          (stamina.sprinting ? this.sprintMultiplier : 1)
        : 0;
    // While airborne, steer toward the held direction so double-jumps can
    // re-commit horizontally; without input, keep air momentum (light coast).
    const airborne = !this.verticalState.grounded;
    const baseResponse = airborne
      ? targetSpeed > 0
        ? this.airAcceleration
        : this.airDeceleration
      : targetSpeed > 0
        ? this.acceleration
        : this.deceleration;
    const response = baseResponse * this.surfaceTraction;
    this.velocity.x = THREE.MathUtils.damp(
      this.velocity.x,
      this.desired.x * targetSpeed,
      response,
      delta,
    );
    this.velocity.y = THREE.MathUtils.damp(
      this.velocity.y,
      this.desired.z * targetSpeed,
      response,
      delta,
    );
    // Knockback decays fast so the shove reads as a hit, not a long slide.
    this.knockVel.x = THREE.MathUtils.damp(this.knockVel.x, 0, 7.5, delta);
    this.knockVel.y = THREE.MathUtils.damp(this.knockVel.y, 0, 7.5, delta);
    if (this.knockVel.lengthSq() < 0.0004) this.knockVel.set(0, 0);

    const totalVx = this.velocity.x + this.knockVel.x;
    const totalVz = this.velocity.y + this.knockVel.y;
    const moving = totalVx * totalVx + totalVz * totalVz > 0.0025;
    const sprinting = stamina.sprinting && targetSpeed > this.moveSpeed + 0.01;
    let movedDistance = 0;

    if (moving) {
      this.movementDelta.x = totalVx * delta;
      this.movementDelta.z = totalVz * delta;
      this.collisionVerticalRange.minY = feetY;
      this.collisionVerticalRange.maxY = this.verticalState.y + this.verticalConfig.headClearance;
      this.rebuildActiveColliders();
      const result = moveWithCollision(
        this.dungeon,
        this.position,
        this.movementDelta,
        this.tileSize,
        this.radius,
        this.isBlockedCell,
        this.activeColliders,
        this.collisionVerticalRange,
      );
      movedDistance = Math.hypot(
        result.position.x - this.position.x,
        result.position.z - this.position.z,
      );
      this.position.set(result.position.x, this.verticalState.y, result.position.z);
      this.distanceTravelled += movedDistance;
      blockedX = result.blockedX;
      blockedZ = result.blockedZ;
      if (blockedX) {
        this.velocity.x = 0;
        this.knockVel.x = 0;
      }
      if (blockedZ) {
        this.velocity.y = 0;
        this.knockVel.y = 0;
      }
    }

    const strideLength =
      (sprinting ? 0.92 : 0.76) * (this.mobilityBoostActive ? MOBILITY_BOOST_STRIDE_RATE : 1);
    const groundedTravel = this.verticalState.grounded && !landed ? movedDistance : 0;
    const previousStep = Math.floor(this.strideDistance / strideLength);
    this.strideDistance += groundedTravel;
    this.stridePhase += (groundedTravel / strideLength) * Math.PI;
    const footstep =
      groundedTravel > 0 && Math.floor(this.strideDistance / strideLength) > previousStep;
    this.syncCameraTransform(delta, movedDistance > 0.0001, sprinting);

    const cell = worldToGridInto(this.dungeon, this.position, this.tileSize, this.currentCell);
    const changedCell =
      !this.hasLastCell || cell.x !== this.lastCell.x || cell.y !== this.lastCell.y;
    this.lastCell.x = cell.x;
    this.lastCell.y = cell.y;
    this.hasLastCell = true;
    const interactPressed = this.consumePressed("interact");
    this.justPressed.clear();
    this.virtualPulse.clear();
    return {
      moved: movedDistance > 0.0001,
      changedCell,
      blockedX,
      blockedZ,
      cell,
      atExit: cell.x === this.dungeon.exit.x && cell.y === this.dungeon.exit.y,
      interactPressed,
      footstep,
      jumped,
      landed,
      hitCeiling,
      justExhausted: stamina.justExhausted,
      stamina: stamina.ratio,
      staminaExhausted: stamina.exhausted,
    };
  }

  getState(): ControllerState {
    const s = this.stateScratch;
    s.locked = this.locked;
    s.position.x = this.position.x;
    s.position.y = this.position.y;
    s.position.z = this.position.z;
    s.cell = this.dungeon ? this.currentCell : null;
    s.distanceTravelled = this.distanceTravelled;
    s.speed = this.velocity.length();
    s.moving = this.velocity.lengthSq() > 0.0025;
    s.sprinting =
      this.isActionActive("sprint") &&
      !this.staminaState.exhausted &&
      this.staminaState.value > 0 &&
      this.velocity.length() > this.moveSpeed * 0.72;
    s.stamina = this.staminaState.value / STAMINA_MAX;
    s.staminaExhausted = this.staminaState.exhausted;
    s.stridePhase = this.stridePhase;
    s.cameraMotion = this.cameraMotion;
    s.lookYaw = this.lookYaw;
    s.lookPitch = this.lookPitch;
    s.grounded = this.verticalState.grounded;
    s.jumping = !this.verticalState.grounded;
    s.verticalSpeed = this.verticalState.velocity;
    s.jumpHeight = this.verticalState.y - this.eyeHeight;
    // Rebuild intent union into a reused array (no Set/array allocation).
    this.intentUnion.clear();
    for (const k of this.keys) this.intentUnion.add(k);
    for (const v of this.virtualActions) this.intentUnion.add(v);
    s.intents.length = 0;
    for (const a of this.intentUnion) s.intents.push(a);
    return s;
  }

  dispose(): void {
    this.releasePointerLock();
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("keyup", this.handleKeyUp);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    document.removeEventListener("pointerlockerror", this.handlePointerLockError);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("blur", this.handleBlur);
    this.domElement.removeEventListener("click", this.handleSceneClick);
  }

  /**
   * While airborne, mark props whose tops the feet have cleared. Keep them
   * ignored until the player is free of that footprint so landing mid-vault
   * cannot re-embed the capsule.
   */
  private updateVaultedColliders(feetY: number): void {
    if (!this.verticalState.grounded) {
      for (let index = 0; index < this.solidColliders.length; index += 1) {
        const collider = this.solidColliders[index]!;
        if (feetClearColliderTop(collider, feetY)) this.vaultedColliderIds.add(index);
      }
      return;
    }
    if (this.vaultedColliderIds.size === 0) return;
    for (const index of this.vaultedColliderIds) {
      const collider = this.solidColliders[index];
      if (!collider || !overlapsWorldCollider(this.position, this.radius * 1.05, collider)) {
        this.vaultedColliderIds.delete(index);
      }
    }
  }

  private rebuildActiveColliders(): void {
    const active = this.activeColliders;
    active.length = 0;
    if (this.vaultedColliderIds.size === 0) {
      for (let index = 0; index < this.solidColliders.length; index += 1) {
        active.push(this.solidColliders[index]!);
      }
      return;
    }
    for (let index = 0; index < this.solidColliders.length; index += 1) {
      if (!this.vaultedColliderIds.has(index)) active.push(this.solidColliders[index]!);
    }
  }

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.locked || !this.enabled) return;
    this.lookInput.push(event.movementX, event.movementY);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => this.handleKeyboard(event, true);
  private readonly handleKeyUp = (event: KeyboardEvent): void => this.handleKeyboard(event, false);

  private handleKeyboard(event: KeyboardEvent, active: boolean): void {
    const action = KEY_ACTIONS[event.code];
    if (!action || isEditableTarget(event.target) || !this.enabled) return;
    event.preventDefault();
    if (active) {
      if (!this.keys.has(action)) this.justPressed.add(action);
      this.keys.add(action);
    } else {
      this.keys.delete(action);
    }
  }

  private readonly handlePointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.domElement;
    this.lookInput.clear();
    this.targetYaw = this.lookYaw;
    this.targetPitch = this.lookPitch;
    if (this.locked) this.domElement.focus();
    this.onLockChange(
      this.locked,
      this.locked
        ? "Pointer active. WASD moves. SHIFT sprints. SPACE double-jumps. E interacts."
        : "Pointer released. The run is paused.",
    );
  };

  private readonly handlePointerLockError = (): void =>
    this.onLockChange(false, "The browser blocked the pointer. Press Enter to retry.");
  private readonly handleBlur = (): void => {
    this.keys.clear();
    this.justPressed.clear();
    this.virtualPulse.clear();
    this.velocity.set(0, 0);
    this.knockVel.set(0, 0);
    this.lookInput.clear();
    this.targetYaw = this.lookYaw;
    this.targetPitch = this.lookPitch;
  };
  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) this.handleBlur();
  };
  private readonly handleSceneClick = (): void => this.requestPointerLock();
  private syncCameraPosition(): void {
    this.camera.position.copy(this.position);
  }

  private syncCameraTransform(delta: number, moved: boolean, sprinting: boolean): void {
    if (this.reducedMotionQuery.matches) {
      this.landingDip = 0;
      this.strafeLean = 0;
      this.camera.position.copy(this.position);
      this.euler.set(this.lookPitch, this.lookYaw, 0, "YXZ");
      this.camera.quaternion.setFromEuler(this.euler);
      if (this.camera.fov !== this.baseFov) {
        this.camera.fov = this.baseFov;
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    const motionScale = this.cameraMotion;
    const speedRatio = THREE.MathUtils.clamp(
      this.velocity.length() / (this.moveSpeed * this.sprintMultiplier),
      0,
      1,
    );
    const stride = moved ? speedRatio : 0;
    const bobScale = this.mobilityBoostActive ? MOBILITY_BOOST_CAMERA_BOB_SCALE : 1;
    const bobX = Math.sin(this.stridePhase) * 0.024 * stride * motionScale * bobScale;
    const bobY =
      (Math.abs(Math.sin(this.stridePhase)) * 0.05 - 0.009) * stride * motionScale * bobScale;
    const breath = Math.sin(this.elapsed * 1.65) * 0.0035 * (1 - stride) * motionScale;
    this.landingDip = THREE.MathUtils.damp(this.landingDip, 0, 13, delta);
    this.camera.position.copy(this.position).addScaledVector(this.right, bobX);
    this.camera.position.y += bobY + breath + this.landingDip * motionScale;

    // Soft bank into lateral movement. Uses walk velocity (not knockback) so hits
    // do not yank the horizon; cameraMotion scales the amount.
    const leanTarget = computeStrafeLeanTarget(
      this.velocity.x,
      this.velocity.y,
      this.right.x,
      this.right.z,
      this.moveSpeed * this.sprintMultiplier,
      STRAFE_LEAN_MAX * motionScale,
    );
    this.strafeLean = THREE.MathUtils.damp(
      this.strafeLean,
      leanTarget,
      STRAFE_LEAN_RESPONSE,
      delta,
    );
    this.euler.set(this.lookPitch, this.lookYaw, this.strafeLean, "YXZ");
    this.camera.quaternion.setFromEuler(this.euler);

    const boostFovKick = this.mobilityBoostActive ? MOBILITY_BOOST_FOV_KICK * stride : 0;
    const targetFov =
      this.baseFov + ((sprinting ? 3.2 : stride * 0.8) + boostFovKick) * motionScale;
    const nextFov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7.5, delta);
    if (Math.abs(nextFov - this.camera.fov) > 0.001) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
  }
}

export function dampAngle(
  current: number,
  target: number,
  response: number,
  delta: number,
): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-response * delta));
}

export function clampLookPitch(value: number): number {
  return THREE.MathUtils.clamp(value, -MAX_LOOK_PITCH, MAX_LOOK_PITCH);
}

/**
 * Map world-space walk velocity onto camera roll.
 * Positive lateral speed (along camera right) leans into the right (negative Z).
 */
export function computeStrafeLeanTarget(
  velocityX: number,
  velocityZ: number,
  rightX: number,
  rightZ: number,
  referenceSpeed: number,
  maxLean = STRAFE_LEAN_MAX,
): number {
  const speed = Math.max(0.001, referenceSpeed);
  const rightLen = Math.hypot(rightX, rightZ);
  if (rightLen < 1e-6 || Math.abs(maxLean) < 1e-8) return 0;
  const nx = rightX / rightLen;
  const nz = rightZ / rightLen;
  const lateral = velocityX * nx + velocityZ * nz;
  const ratio = THREE.MathUtils.clamp(lateral / speed, -1, 1);
  return -ratio * maxLean;
}
