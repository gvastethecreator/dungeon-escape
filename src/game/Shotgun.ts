/**
 * Runtime rules for the chest shotgun: six shells, pump after every shot, cone hitscan.
 * Presentation stays in the viewmodel; this module owns ammo and hit tests.
 */

export const SHOTGUN_SHELLS = 6;
/** Horizontal + vertical reach of one blast (meters). */
export const SHOTGUN_RANGE = 9.2;
/** Half-angle of the pellet cone (radians). ~18°. */
export const SHOTGUN_CONE_HALF_ANGLE = 0.314;
export const SHOTGUN_CONE_COS = Math.cos(SHOTGUN_CONE_HALF_ANGLE);
/** Visible pellets per blast. Combat stays hitscan; these are presentation. */
export const SHOTGUN_PELLET_COUNT = 10;
/** Seconds for a pellet to cover `SHOTGUN_RANGE`. */
export const SHOTGUN_PELLET_TRAVEL_SECONDS = 0.1;
/** Pump delay between shots. */
export const SHOTGUN_PUMP_SECONDS = 0.78;
/** Rack sound starts as the gun finishes dipping out of frame. */
export const SHOTGUN_PUMP_SOUND_DELAY = 0.22;
export const SHOTGUN_MIN_PHASE_VISIBILITY = 0.04;
export const SHOTGUN_ENEMY_REACH_MIN = 0.28;
export const SHOTGUN_ENEMY_REACH_SCALE = 0.2;

export interface ShotgunState {
  shells: number;
  pumpSeconds: number;
}

export interface ShotgunEnemyPose {
  defeated: boolean;
  scaleX: number;
  scaleY: number;
  phaseVisibility: number;
  position: { x: number; y: number; z: number };
  baseScaleX?: number;
  baseScaleY?: number;
}

export function createShotgunState(): ShotgunState {
  return { shells: 0, pumpSeconds: 0 };
}

/** Picking up a shotgun always restores a full tube. */
export function activateShotgun(state: ShotgunState): void {
  state.shells = SHOTGUN_SHELLS;
  state.pumpSeconds = 0;
}

export function tickShotgun(state: ShotgunState, delta: number): void {
  if (!Number.isFinite(state.shells) || state.shells < 0) state.shells = 0;
  const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
  state.pumpSeconds = Math.max(
    0,
    (Number.isFinite(state.pumpSeconds) ? state.pumpSeconds : 0) - safeDelta,
  );
}

export function isShotgunEquipped(state: ShotgunState): boolean {
  return state.shells > 0 || state.pumpSeconds > 0.0001;
}

/**
 * Spend one shell and start the pump, including after the last round.
 * Returns false when empty or still pumping.
 */
export function tryFireShotgun(state: ShotgunState): boolean {
  if (state.shells <= 0 || state.pumpSeconds > 0.0001) return false;
  state.shells -= 1;
  state.pumpSeconds = SHOTGUN_PUMP_SECONDS;
  return true;
}

export function restoreShotgun(state: ShotgunState, shells = 0, pumpSeconds = 0): void {
  const safeShells = Math.max(0, Math.floor(Number.isFinite(shells) ? shells : 0));
  const safePump = Math.max(0, Number.isFinite(pumpSeconds) ? pumpSeconds : 0);
  state.shells = Math.min(SHOTGUN_SHELLS, safeShells);
  state.pumpSeconds = Math.min(SHOTGUN_PUMP_SECONDS, safePump);
  if (state.shells <= 0 && state.pumpSeconds <= 0.0001) {
    state.shells = 0;
    state.pumpSeconds = 0;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smooth01(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

export interface ShotgunRackPose {
  /** 0 rest, 1 fully dropped below the view. */
  dip: number;
  /** Extra pitch down (radians). */
  pitch: number;
  roll: number;
  /** 0 rest, 1 pump fully back. */
  pumpSlide: number;
}

/**
 * Viewmodel rack after a shot. `pumpSeconds` counts down from `SHOTGUN_PUMP_SECONDS`.
 * The gun dips out of frame, holds a beat, racks, then rises.
 */
export function shotgunRackPose(
  pumpSeconds: number,
  out: ShotgunRackPose = { dip: 0, pitch: 0, roll: 0, pumpSlide: 0 },
): ShotgunRackPose {
  if (!Number.isFinite(pumpSeconds) || pumpSeconds <= 0.0001) {
    out.dip = 0;
    out.pitch = 0;
    out.roll = 0;
    out.pumpSlide = 0;
    return out;
  }
  const progress = clamp01(1 - pumpSeconds / SHOTGUN_PUMP_SECONDS);
  let dip = 0;
  if (progress >= 0.1 && progress < 0.32) dip = smooth01((progress - 0.1) / 0.22);
  else if (progress >= 0.32 && progress < 0.52) dip = 1;
  else if (progress >= 0.52) dip = 1 - smooth01((progress - 0.52) / 0.48);

  let pumpSlide = 0;
  if (progress >= 0.12 && progress < 0.36) pumpSlide = smooth01((progress - 0.12) / 0.24);
  else if (progress >= 0.36 && progress < 0.55) pumpSlide = 1;
  else if (progress >= 0.55) pumpSlide = 1 - smooth01((progress - 0.55) / 0.45);

  out.dip = dip;
  out.pitch = dip * 0.48;
  out.roll = dip * 0.11;
  out.pumpSlide = pumpSlide;
  return out;
}

/**
 * Camera-forward unit vector matching FirstPersonController (Euler YXZ applied to 0,0,−1).
 * Positive pitch looks down in Three.js, so Y goes negative.
 */
export function shotgunLookDirection(
  yaw: number,
  pitch: number,
  out: { x: number; y: number; z: number } = { x: 0, y: 0, z: -1 },
): { x: number; y: number; z: number } {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  out.x = -sy * cp;
  out.y = -sp;
  out.z = -cy * cp;
  return out;
}

export function shotgunEnemyReach(enemy: ShotgunEnemyPose): number {
  const scaleX = enemy.baseScaleX ?? enemy.scaleX;
  const scaleY = enemy.baseScaleY ?? enemy.scaleY;
  const body = Math.min(scaleX, scaleY) * SHOTGUN_ENEMY_REACH_SCALE;
  return Math.max(SHOTGUN_ENEMY_REACH_MIN, body);
}

/**
 * True when the blast origin+direction kills this enemy pose.
 * Skips defeated, near-zero scale, and spectral low-visibility seats.
 */
export function shotgunHitsEnemy(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  enemy: ShotgunEnemyPose,
  range: number = SHOTGUN_RANGE,
  coneCos: number = SHOTGUN_CONE_COS,
): boolean {
  if (
    enemy.defeated ||
    enemy.scaleX <= 0.001 ||
    enemy.scaleY <= 0.001 ||
    enemy.phaseVisibility < SHOTGUN_MIN_PHASE_VISIBILITY
  ) {
    return false;
  }
  const dx = enemy.position.x - origin.x;
  const dy = enemy.position.y - origin.y;
  const dz = enemy.position.z - origin.z;
  const distance = Math.hypot(dx, dy, dz);
  const reach = shotgunEnemyReach(enemy);
  if (distance > range + reach) return false;
  if (distance <= reach) return true;
  const inv = 1 / Math.max(distance, 1e-4);
  const dot = dx * inv * direction.x + dy * inv * direction.y + dz * inv * direction.z;
  return dot >= coneCos;
}

export interface ShotgunVec3 {
  x: number;
  y: number;
  z: number;
}

function shotgunHash01(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function normalizeInto(vec: ShotgunVec3): ShotgunVec3 {
  const length = Math.hypot(vec.x, vec.y, vec.z);
  if (length < 1e-6) {
    vec.x = 0;
    vec.y = 0;
    vec.z = -1;
    return vec;
  }
  const inv = 1 / length;
  vec.x *= inv;
  vec.y *= inv;
  vec.z *= inv;
  return vec;
}

/** Camera-right from a look direction (Y-up, matches Three.js look -Z). */
export function shotgunAimRight(
  aim: ShotgunVec3,
  out: ShotgunVec3 = { x: 1, y: 0, z: 0 },
): ShotgunVec3 {
  const length = Math.hypot(aim.x, aim.y, aim.z);
  const fx = length > 1e-6 ? aim.x / length : 0;
  const fz = length > 1e-6 ? aim.z / length : -1;
  out.x = -fz;
  out.y = 0;
  out.z = fx;
  if (Math.hypot(out.x, out.z) < 1e-4) {
    out.x = 1;
    out.y = 0;
    out.z = 0;
    return out;
  }
  return normalizeInto(out);
}

/**
 * World-space muzzle in front of the left-hand viewmodel.
 * `eye` is the camera/player eye; `aim` is camera-forward.
 */
export function shotgunMuzzleWorldOrigin(
  eye: ShotgunVec3,
  aim: ShotgunVec3,
  out: ShotgunVec3 = { x: 0, y: 0, z: 0 },
): ShotgunVec3 {
  const length = Math.hypot(aim.x, aim.y, aim.z);
  const fx = length > 1e-6 ? aim.x / length : 0;
  const fy = length > 1e-6 ? aim.y / length : 0;
  const fz = length > 1e-6 ? aim.z / length : -1;
  const right = shotgunAimRight(aim);
  out.x = eye.x + fx * 0.48 - right.x * 0.22;
  out.y = eye.y + fy * 0.48 - 0.2;
  out.z = eye.z + fz * 0.48 - right.z * 0.22;
  return out;
}

/**
 * Unit direction for pellet `index` inside the combat cone.
 * Index 0 is dead-center (matches hitscan). Others fill a disk using `seed`.
 */
export function shotgunPelletDirection(
  aim: ShotgunVec3,
  index: number,
  seed = 0,
  out: ShotgunVec3 = { x: 0, y: 0, z: -1 },
): ShotgunVec3 {
  const length = Math.hypot(aim.x, aim.y, aim.z);
  const fx = length > 1e-6 ? aim.x / length : 0;
  const fy = length > 1e-6 ? aim.y / length : 0;
  const fz = length > 1e-6 ? aim.z / length : -1;
  if (index <= 0) {
    out.x = fx;
    out.y = fy;
    out.z = fz;
    return out;
  }
  const right = shotgunAimRight(aim);
  const upX = right.y * fz - right.z * fy;
  const upY = right.z * fx - right.x * fz;
  const upZ = right.x * fy - right.y * fx;
  const radius = SHOTGUN_CONE_HALF_ANGLE * Math.sqrt(shotgunHash01(seed * 1.91 + index * 19.17));
  const angle = shotgunHash01(seed * 0.73 + index * 7.91) * Math.PI * 2;
  const ox = Math.cos(angle) * Math.tan(radius);
  const oy = Math.sin(angle) * Math.tan(radius);
  out.x = fx + right.x * ox + upX * oy;
  out.y = fy + right.y * ox + upY * oy;
  out.z = fz + right.z * ox + upZ * oy;
  return normalizeInto(out);
}

export function fillShotgunPelletDirections(
  aim: ShotgunVec3,
  seed = 0,
  out: ShotgunVec3[] = [],
): ShotgunVec3[] {
  for (let index = 0; index < SHOTGUN_PELLET_COUNT; index += 1) {
    const slot = out[index] ?? { x: 0, y: 0, z: -1 };
    shotgunPelletDirection(aim, index, seed, slot);
    out[index] = slot;
  }
  out.length = SHOTGUN_PELLET_COUNT;
  return out;
}
