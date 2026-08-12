import * as THREE from "three";

import {
  canOccupy,
  feetClearColliderTop,
  gridToWorld,
  moveWithCollision,
  overlapsWorldCollider,
  sampleFloorSupportHeightfield,
  worldToGridInto,
  type FloorSupportHeightfield,
  WorldColliderSpatialIndex,
  type VerticalCollisionRange,
  type WorldCollider,
} from "../dungeon/gridCollision";
import type { DungeonData, GridCell } from "../dungeon/types";
import { PLAYER_COMBAT_EYE_HEIGHT } from "./CombatPose";
import {
  stepCameraMotion,
  type CameraMotionInput,
  type CameraMotionProjection,
} from "./CameraMotionProjection";
import { LookInputFilter } from "./LookInputFilter";
import {
  consumeStamina,
  createStaminaState,
  DEFAULT_STAMINA_CONFIG,
  JUMP_STAMINA_COST,
  resetStamina,
  STAMINA_MAX,
  stepStamina,
  type StaminaState,
} from "./Stamina";
import { MOBILITY_BOOST_SPEED_MULTIPLIER, MOBILITY_BOOST_STRIDE_RATE } from "../game/MobilityBoost";
import { SLOW_CURSE_SPEED_MULTIPLIER } from "../game/SlowCurse";
import {
  createVerticalMotionState,
  pickSupportTop,
  resetVerticalMotion,
  stepVerticalMotion,
  VERTICAL_EVENT,
  type VerticalMotionConfig,
  type VerticalMotionState,
} from "./VerticalMotion";
import { STORY_HEIGHT, STORY_MAX_STEP_UP, closedCeilingY } from "../world/StoryMetrics";

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
export {
  computeStrafeLeanTarget,
  STRAFE_LEAN_MAX,
  STRAFE_LEAN_RESPONSE,
} from "./CameraMotionProjection";

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
  // Prefer the saved eye Y so multi-slab resumes and stair teleports keep height.
  // Fall back to the default standing eye only when Y is missing/degenerate.
  const restoredY =
    Number.isFinite(pose.y) && pose.y >= options.eyeHeight * 0.5 ? pose.y : options.eyeHeight;
  const feetY = restoredY - options.eyeHeight + 0.08;
  const verticalRange = {
    minY: feetY,
    maxY: restoredY + options.headClearance,
  };
  // Walkable tops (floor decks, stair treads) must not fail occupancy when the
  // capsule is already standing on them.
  const blockingColliders = (options.colliders ?? []).filter((collider) => {
    if (collider.maxY === undefined || !Number.isFinite(collider.maxY)) return true;
    return feetY < collider.maxY - 0.05;
  });
  if (
    !canOccupy(
      dungeon,
      pose,
      options.tileSize,
      options.radius,
      options.isBlockedCell,
      blockingColliders,
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
  /** True while LMB is held under pointer lock (click-to-walk). */
  mouseForwardHeld: boolean;
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
  private invertLook = false;
  private invertMove = false;
  private yawBias = 0;
  private sensitivityScale = 1;
  private readonly lookResponse: number;
  private readonly verticalConfig: VerticalMotionConfig;
  private readonly verticalState: VerticalMotionState;
  private readonly staminaState: StaminaState = createStaminaState(STAMINA_MAX);
  private dungeon: DungeonData | null = null;
  private readonly blockedCells = new Set<string>();
  private solidColliders: WorldCollider[] = [];
  private solidColliderIndex: WorldColliderSpatialIndex | null = null;
  private supportHeightfields: FloorSupportHeightfield[] = [];
  private allSupportTreads: WorldCollider[] = [];
  /** At most the inbound + outbound flights around the bound slab. */
  private supportTreads: WorldCollider[] = [];
  private readonly supportCandidates: number[] = [];
  private readonly supportSamplePoint = { x: 0, z: 0 };
  private readonly supportSampleCell: GridCell = { x: 0, y: 0 };
  /**
   * Prop colliders the player has already cleared with their feet while airborne.
   * Kept until the player is grounded and free of that footprint so landing on a
   * crate mid-vault does not re-trap the capsule inside the solid.
   */
  private readonly vaultedColliderIds = new Set<number>();
  private readonly nearbyColliderIds: number[] = [];
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
  private readonly cameraMotionInput: CameraMotionInput = {
    delta: 0,
    moved: false,
    sprinting: false,
    reducedMotion: false,
    motionScale: 0,
    velocityX: 0,
    velocityZ: 0,
    rightX: 0,
    rightZ: 0,
    maxSpeed: 1,
    stridePhase: 0,
    elapsed: 0,
    landingDip: 0,
    strafeLean: 0,
    currentFov: 0,
    baseFov: 0,
    mobilityBoost: false,
  };
  private readonly cameraMotionProjection: CameraMotionProjection = {
    rightOffset: 0,
    verticalOffset: 0,
    landingDip: 0,
    roll: 0,
    fov: 0,
  };
  private locked = false;
  private enabled = true;
  /** LMB hold while pointer-locked → walk forward. */
  private mouseForwardHeld = false;
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
    this.eyeHeight = options.eyeHeight ?? PLAYER_COMBAT_EYE_HEIGHT;
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
      maxStepUp: STORY_MAX_STEP_UP,
    };
    this.verticalState = createVerticalMotionState(this.eyeHeight, this.verticalConfig.maxAirJumps);
    this.onLockChange = options.onLockChange ?? (() => undefined);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    document.addEventListener("pointerlockerror", this.handlePointerLockError);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener("blur", this.handleBlur);
    this.domElement.addEventListener("click", this.handleSceneClick);
    this.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.domElement.addEventListener("contextmenu", this.handleContextMenu);
    // Release may happen outside the canvas while pointer-locked.
    document.addEventListener("pointerup", this.handlePointerUp);
    document.addEventListener("pointercancel", this.handlePointerUp);
  }

  setDungeon(dungeon: DungeonData): void {
    this.dungeon = dungeon;
    this.refreshSupportTreads();
    const spawn = gridToWorld(dungeon, dungeon.spawn, this.tileSize);
    const exit = gridToWorld(dungeon, dungeon.exit, this.tileSize);
    this.position.set(spawn.x, this.eyeHeight, spawn.z);
    this.velocity.set(0, 0);
    this.knockVel.set(0, 0);
    this.surfaceSpeedScale = 1;
    this.surfaceTraction = 1;
    this.mobilityBoostActive = false;
    this.slowCurseActive = false;
    this.invertLook = false;
    this.invertMove = false;
    this.yawBias = 0;
    this.sensitivityScale = 1;
    this.vaultedColliderIds.clear();
    resetVerticalMotion(this.verticalState, this.eyeHeight, this.verticalConfig.maxAirJumps);
    resetStamina(this.staminaState, STAMINA_MAX);
    this.mouseForwardHeld = false;
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
   * Swap the collision/grid dungeon without moving the player.
   * Used when the multi-slab stack rebinds the active floor by height.
   */
  bindDungeon(dungeon: DungeonData): void {
    this.dungeon = dungeon;
    this.refreshSupportTreads();
    worldToGridInto(this.dungeon, this.position, this.tileSize, this.currentCell);
    this.lastCell.x = this.currentCell.x;
    this.lastCell.y = this.currentCell.y;
    this.hasLastCell = true;
  }

  /**
   * Place the player at a saved pose after setDungeon. Keeps dungeon collision
   * bindings; only body, look, and distance resume.
   */
  restorePose(pose: ControllerPose): boolean {
    if (!this.dungeon) return false;
    const restoreColliders = this.solidColliderIndex
      ? this.solidColliderIndex.queryAroundInto(pose, this.radius, this.activeColliders)
      : this.solidColliders;
    const restored = resolveRestorableControllerPose(this.dungeon, pose, {
      tileSize: this.tileSize,
      eyeHeight: this.eyeHeight,
      radius: this.radius,
      headClearance: this.verticalConfig.headClearance,
      isBlockedCell: this.isBlockedCell,
      colliders: restoreColliders,
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

  setSolidColliders(
    colliders: readonly WorldCollider[],
    supportHeightfields: readonly FloorSupportHeightfield[] = [],
    supportTreads: readonly WorldCollider[] = [],
  ): void {
    this.solidColliders = colliders.map((collider) => ({ ...collider }));
    this.solidColliderIndex = new WorldColliderSpatialIndex(this.solidColliders, this.tileSize * 2);
    this.supportHeightfields = supportHeightfields.map((heightfield) => ({
      width: heightfield.width,
      height: heightfield.height,
      floorIndices: heightfield.floorIndices.slice(),
    }));
    this.allSupportTreads = supportTreads.map((collider) => ({ ...collider }));
    this.refreshSupportTreads();
    this.vaultedColliderIds.clear();
    this.activeColliders = [];
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.virtualActions.clear();
      this.mouseForwardHeld = false;
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

  /**
   * Control-curse bag. Invert look/move for mirror; yawBias/sensitivity for spin.
   * Values are absolute (not stacked) so the host can clear them each frame.
   */
  setControlMods(mods: {
    invertLook?: boolean;
    invertMove?: boolean;
    yawBias?: number;
    sensitivityScale?: number;
  }): void {
    this.invertLook = mods.invertLook === true;
    this.invertMove = mods.invertMove === true;
    this.yawBias = Number.isFinite(mods.yawBias) ? (mods.yawBias as number) : 0;
    this.sensitivityScale =
      Number.isFinite(mods.sensitivityScale) && (mods.sensitivityScale as number) > 0
        ? (mods.sensitivityScale as number)
        : 1;
  }

  /**
   * Single locomotion seam for mobility, slow, and control curses.
   * Expand-contract: setMobilityBoost / setSlowCurse / setControlMods still work.
   */
  setLocomotionMods(mods: {
    mobilityActive?: boolean;
    slowActive?: boolean;
    invertLook?: boolean;
    invertMove?: boolean;
    yawBias?: number;
    sensitivityScale?: number;
  }): void {
    if (mods.mobilityActive !== undefined) this.mobilityBoostActive = mods.mobilityActive === true;
    if (mods.slowActive !== undefined) this.slowCurseActive = mods.slowActive === true;
    this.setControlMods(mods);
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
        mouseForwardHeld: this.locked && this.mouseForwardHeld,
      };

    this.elapsed += delta;
    const lookDelta = this.lookInput.consume();
    const lookSign = this.invertLook ? -1 : 1;
    const lookSensitivity = this.mouseSensitivity * this.sensitivityScale;
    this.targetYaw -= lookDelta.x * lookSensitivity * lookSign;
    this.targetPitch = clampLookPitch(
      this.targetPitch - lookDelta.y * lookSensitivity * 0.72 * lookSign,
    );

    const turnDirection =
      Number(this.isActionActive("turnRight") || this.virtualPulse.has("turnRight")) -
      Number(this.isActionActive("turnLeft") || this.virtualPulse.has("turnLeft"));
    if (turnDirection !== 0) {
      this.targetYaw -= turnDirection * delta * 1.9 * lookSign;
    }
    if (Math.abs(this.yawBias) > 1e-6) {
      this.targetYaw += this.yawBias * delta;
    }

    this.lookYaw = dampAngle(this.lookYaw, this.targetYaw, this.lookResponse * 0.72, delta);
    this.lookPitch = THREE.MathUtils.damp(
      this.lookPitch,
      this.targetPitch,
      this.lookResponse * 0.58,
      delta,
    );

    // Click-to-walk only while pointer-locked (never drive movement from a stale hold).
    const mouseDrive = this.locked && this.mouseForwardHeld;
    const moveSign = this.invertMove ? -1 : 1;
    const forwardInput =
      (Number(this.isActionActive("forward") || this.virtualPulse.has("forward") || mouseDrive) -
        Number(this.isActionActive("backward") || this.virtualPulse.has("backward"))) *
      moveSign;
    const sidewaysInput =
      (Number(this.isActionActive("right") || this.virtualPulse.has("right")) -
        Number(this.isActionActive("left") || this.virtualPulse.has("left"))) *
      moveSign;
    const hasIntent = forwardInput !== 0 || sidewaysInput !== 0;
    const movementAllowed =
      this.locked || this.virtualActions.size > 0 || this.virtualPulse.size > 0 || mouseDrive;
    const stamina = stepStamina(
      this.staminaState,
      delta,
      movementAllowed && this.isActionActive("sprint"),
      hasIntent && movementAllowed,
      this.mobilityBoostActive ? MOBILITY_STAMINA_CONFIG : DEFAULT_STAMINA_CONFIG,
    );
    this.refreshVerticalSupport();
    const verticalEvents = stepVerticalMotion(
      this.verticalState,
      delta,
      movementAllowed && this.consumePressed("jump"),
      this.verticalConfig,
    );
    const jumped = (verticalEvents & VERTICAL_EVENT.jumped) !== 0;
    if (jumped) consumeStamina(this.staminaState, JUMP_STAMINA_COST);
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
      stamina: this.staminaState.value / STAMINA_MAX,
      staminaExhausted: this.staminaState.exhausted,
      mouseForwardHeld: mouseDrive,
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
    this.mouseForwardHeld = false;
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("keyup", this.handleKeyUp);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    document.removeEventListener("pointerlockerror", this.handlePointerLockError);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    document.removeEventListener("pointerup", this.handlePointerUp);
    document.removeEventListener("pointercancel", this.handlePointerUp);
    window.removeEventListener("blur", this.handleBlur);
    this.domElement.removeEventListener("click", this.handleSceneClick);
    this.domElement.removeEventListener("pointerdown", this.handlePointerDown);
    this.domElement.removeEventListener("contextmenu", this.handleContextMenu);
  }

  /**
   * While airborne, mark props whose tops the feet have cleared. Keep them
   * ignored until the player is free of that footprint so landing mid-vault
   * cannot re-embed the capsule.
   */
  /**
   * Sample nearby collider tops and set floorEyeY / ceiling for multi-slab stairs.
   * Falls back to the flat-floor eye plane when no support is near the capsule.
   */
  private refreshVerticalSupport(): void {
    const feetY = this.verticalState.y - this.eyeHeight + 0.08;
    const candidates = this.supportCandidates;
    candidates.length = 0;
    if (this.supportHeightfields.length > 0) {
      // Match the old capsule overlap tolerance while remaining on a tiny,
      // predictable sample set: centre plus the four nearby sole edges.
      const sampleRadius = this.radius * 0.72;
      this.sampleHeightfieldSupport(this.position.x, this.position.z);
      this.sampleHeightfieldSupport(this.position.x + sampleRadius, this.position.z);
      this.sampleHeightfieldSupport(this.position.x - sampleRadius, this.position.z);
      this.sampleHeightfieldSupport(this.position.x, this.position.z + sampleRadius);
      this.sampleHeightfieldSupport(this.position.x, this.position.z - sampleRadius);
      for (const collider of this.supportTreads) {
        if (overlapsWorldCollider(this.position, this.radius * 1.15, collider)) {
          const top = collider.maxY;
          if (top !== undefined && Number.isFinite(top)) candidates.push(top);
        }
      }
    } else {
      // Compatibility for isolated controller callers that have not migrated
      // to heightfield support yet.
      candidates.push(0);
      const nearby = this.nearbyColliderIds;
      if (this.solidColliderIndex) {
        this.solidColliderIndex.queryAabbIndicesInto(
          this.position.x - this.radius * 1.2,
          this.position.x + this.radius * 1.2,
          this.position.z - this.radius * 1.2,
          this.position.z + this.radius * 1.2,
          nearby,
        );
      } else {
        nearby.length = 0;
        for (let index = 0; index < this.solidColliders.length; index += 1) nearby.push(index);
      }
      for (const index of nearby) {
        const collider = this.solidColliders[index];
        if (!collider || collider.maxY === undefined || !Number.isFinite(collider.maxY)) continue;
        if (!overlapsWorldCollider(this.position, this.radius * 1.15, collider)) continue;
        candidates.push(collider.maxY);
      }
    }
    const supportTop = pickSupportTop(candidates, feetY, STORY_MAX_STEP_UP, STORY_MAX_STEP_UP) ?? 0;
    this.verticalConfig.floorEyeY = supportTop + this.eyeHeight - 0.08;
    // Closed rooms use one story of headroom; mid-flight shafts open to the next slab.
    const slabIndex = Math.max(0, Math.floor((supportTop + 0.05) / STORY_HEIGHT));
    const slabY = slabIndex * STORY_HEIGHT;
    const onFlight = supportTop > slabY + 0.12 && supportTop < slabY + STORY_HEIGHT - 0.12;
    this.verticalConfig.ceilingHeight = onFlight
      ? slabY + STORY_HEIGHT * 2
      : closedCeilingY(slabY, STORY_HEIGHT);
  }

  private sampleHeightfieldSupport(x: number, z: number): void {
    if (!this.dungeon) return;
    this.supportSamplePoint.x = x;
    this.supportSamplePoint.z = z;
    worldToGridInto(this.dungeon, this.supportSamplePoint, this.tileSize, this.supportSampleCell);
    for (const heightfield of this.supportHeightfields) {
      const floorIndex = sampleFloorSupportHeightfield(heightfield, this.supportSampleCell);
      if (floorIndex !== null) this.supportCandidates.push(floorIndex * STORY_HEIGHT);
    }
  }

  private refreshSupportTreads(): void {
    this.supportTreads.length = 0;
    if (this.allSupportTreads.length === 0) return;
    const feetY = this.position.y - this.eyeHeight + 0.08;
    const slabIndex = Math.max(0, Math.floor((feetY + 0.05) / STORY_HEIGHT));
    const minY = Math.max(0, (slabIndex - 1) * STORY_HEIGHT) - 0.01;
    const maxY = (slabIndex + 1) * STORY_HEIGHT + 0.01;
    for (const collider of this.allSupportTreads) {
      if ((collider.maxY ?? Number.NEGATIVE_INFINITY) < minY || (collider.minY ?? 0) > maxY) continue;
      this.supportTreads.push(collider);
    }
  }

  private updateVaultedColliders(feetY: number): void {
    if (!this.verticalState.grounded) {
      const nearby = this.nearbyColliderIds;
      if (this.solidColliderIndex) {
        this.solidColliderIndex.queryAabbIndicesInto(
          this.position.x - this.tileSize,
          this.position.x + this.tileSize,
          this.position.z - this.tileSize,
          this.position.z + this.tileSize,
          nearby,
        );
      } else {
        nearby.length = 0;
        for (let index = 0; index < this.solidColliders.length; index += 1) nearby.push(index);
      }
      for (const index of nearby) {
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
    if (this.solidColliderIndex) {
      this.solidColliderIndex.querySweepInto(
        this.position,
        this.movementDelta,
        this.radius,
        active,
        this.vaultedColliderIds,
      );
      return;
    }
    active.length = 0;
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
    if (!this.locked) this.mouseForwardHeld = false;
    if (this.locked) this.domElement.focus();
    this.onLockChange(
      this.locked,
      this.locked
        ? "Pointer active. WASD or hold click moves. Right-click or SPACE jumps. SHIFT sprints. E interacts."
        : "Pointer released. The run is paused.",
    );
  };

  private readonly handlePointerLockError = (): void =>
    this.onLockChange(false, "The browser blocked the pointer. Press Enter to retry.");
  private readonly handleBlur = (): void => {
    this.keys.clear();
    this.justPressed.clear();
    this.virtualPulse.clear();
    this.mouseForwardHeld = false;
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
  private readonly handleContextMenu = (event: Event): void => {
    event.preventDefault();
  };
  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled || !this.locked) return;
    if (event.button === 0) {
      this.mouseForwardHeld = true;
      return;
    }
    if (event.button === 2) {
      event.preventDefault();
      this.justPressed.add("jump");
    }
  };
  private readonly handlePointerUp = (event: PointerEvent): void => {
    // pointercancel may omit button 0; always release click-to-walk.
    if (event.type === "pointercancel" || event.button === 0) {
      this.mouseForwardHeld = false;
    }
  };
  private syncCameraPosition(): void {
    this.camera.position.copy(this.position);
  }

  private syncCameraTransform(delta: number, moved: boolean, sprinting: boolean): void {
    const input = this.cameraMotionInput;
    input.delta = delta;
    input.moved = moved;
    input.sprinting = sprinting;
    input.reducedMotion = this.reducedMotionQuery.matches;
    input.motionScale = this.cameraMotion;
    input.velocityX = this.velocity.x;
    input.velocityZ = this.velocity.y;
    input.rightX = this.right.x;
    input.rightZ = this.right.z;
    input.maxSpeed = this.moveSpeed * this.sprintMultiplier;
    input.stridePhase = this.stridePhase;
    input.elapsed = this.elapsed;
    input.landingDip = this.landingDip;
    input.strafeLean = this.strafeLean;
    input.currentFov = this.camera.fov;
    input.baseFov = this.baseFov;
    input.mobilityBoost = this.mobilityBoostActive;
    const projection = stepCameraMotion(input, this.cameraMotionProjection);

    this.landingDip = projection.landingDip;
    this.strafeLean = projection.roll;
    this.camera.position.copy(this.position).addScaledVector(this.right, projection.rightOffset);
    this.camera.position.y += projection.verticalOffset;
    this.euler.set(this.lookPitch, this.lookYaw, this.strafeLean, "YXZ");
    this.camera.quaternion.setFromEuler(this.euler);
    if (
      input.reducedMotion
        ? projection.fov !== this.camera.fov
        : Math.abs(projection.fov - this.camera.fov) > 0.001
    ) {
      this.camera.fov = projection.fov;
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
