export interface VerticalMotionConfig {
  /**
   * Standing eye height above the default ground when `floorEyeY` is omitted.
   * Also used as the default ground eye plane for single-floor rooms.
   */
  eyeHeight: number;
  /**
   * Absolute eye Y of the current walkable support (slab or tread).
   * Defaults to `eyeHeight` when omitted.
   */
  floorEyeY?: number;
  /** Absolute world ceiling plane (underside). Eye clamps to this minus head clearance. */
  ceilingHeight: number;
  headClearance: number;
  gravity: number;
  jumpSpeed: number;
  /**
   * Extra jumps allowed after leaving the ground (1 = classic double jump).
   * Grounded jumps do not consume this budget.
   */
  maxAirJumps: number;
  /**
   * Max eye-Y raise applied while grounded without jumping (stair step-up).
   * Defaults to 0.27 when omitted.
   */
  maxStepUp?: number;
}

export interface VerticalMotionState {
  y: number;
  velocity: number;
  grounded: boolean;
  landingSpeed: number;
  /** Remaining mid-air jumps until the next landing. */
  airJumpsRemaining: number;
}

export const VERTICAL_EVENT = Object.freeze({
  none: 0,
  jumped: 1 << 0,
  landed: 1 << 1,
  hitCeiling: 1 << 2,
  steppedUp: 1 << 3,
});

export function createVerticalMotionState(
  eyeHeight: number,
  maxAirJumps = 1,
): VerticalMotionState {
  return {
    y: eyeHeight,
    velocity: 0,
    grounded: true,
    landingSpeed: 0,
    airJumpsRemaining: Math.max(0, Math.floor(maxAirJumps)),
  };
}

export function resetVerticalMotion(
  state: VerticalMotionState,
  eyeHeight: number,
  maxAirJumps = 1,
): void {
  state.y = eyeHeight;
  state.velocity = 0;
  state.grounded = true;
  state.landingSpeed = 0;
  state.airJumpsRemaining = Math.max(0, Math.floor(maxAirJumps));
}

export function resolveFloorEyeY(config: VerticalMotionConfig): number {
  return Number.isFinite(config.floorEyeY) ? (config.floorEyeY as number) : config.eyeHeight;
}

export function resolveMaxStepUp(config: VerticalMotionConfig): number {
  if (Number.isFinite(config.maxStepUp) && (config.maxStepUp as number) > 0) {
    return config.maxStepUp as number;
  }
  return 0.27;
}

/**
 * Highest support top the capsule can stand on (world Y of the surface).
 * Callers convert to eye Y with `supportY + eyeHeight - soleSkin` as needed.
 */
export function pickSupportTop(
  candidates: readonly number[],
  feetY: number,
  maxStepUp: number,
  snapTolerance = 0.08,
): number | null {
  let best: number | null = null;
  for (const top of candidates) {
    if (!Number.isFinite(top)) continue;
    const delta = top - feetY;
    // Accept tops we are standing on, slightly below, or within step-up range above.
    if (delta > maxStepUp) continue;
    if (delta < -snapTolerance) continue;
    if (best === null || top > best) best = top;
  }
  return best;
}

/**
 * Allocation-free first-person vertical step. Supports multi-level supports via
 * `floorEyeY`, grounded stair step-up, and one or more air jumps.
 */
export function stepVerticalMotion(
  state: VerticalMotionState,
  delta: number,
  jumpRequested: boolean,
  config: VerticalMotionConfig,
): number {
  const dt = Math.min(Math.max(delta, 0), 0.05);
  const maxAirJumps = Math.max(0, Math.floor(config.maxAirJumps));
  const floorEyeY = resolveFloorEyeY(config);
  const maxStepUp = resolveMaxStepUp(config);
  let events = VERTICAL_EVENT.none;
  state.landingSpeed = 0;

  if (state.grounded) {
    const raise = floorEyeY - state.y;
    if (raise > 0.001 && raise <= maxStepUp) {
      state.y = floorEyeY;
      events |= VERTICAL_EVENT.steppedUp;
    } else if (raise < -0.001) {
      // Walked off a ledge or support dropped (top of stairs into open air).
      state.grounded = false;
      state.velocity = 0;
    }
  }

  if (jumpRequested) {
    if (state.grounded) {
      state.grounded = false;
      state.velocity = config.jumpSpeed;
      state.airJumpsRemaining = maxAirJumps;
      events |= VERTICAL_EVENT.jumped;
    } else if (state.airJumpsRemaining > 0) {
      state.velocity = config.jumpSpeed;
      state.airJumpsRemaining -= 1;
      events |= VERTICAL_EVENT.jumped;
    }
  }

  if (!state.grounded) {
    state.velocity -= config.gravity * dt;
    state.y += state.velocity * dt;
    const ceilingY = Math.max(floorEyeY, config.ceilingHeight - config.headClearance);
    if (state.y >= ceilingY) {
      state.y = ceilingY;
      if (state.velocity > 0) state.velocity = 0;
      events |= VERTICAL_EVENT.hitCeiling;
    }
    if (state.y <= floorEyeY) {
      state.landingSpeed = Math.abs(state.velocity);
      state.y = floorEyeY;
      state.velocity = 0;
      state.grounded = true;
      state.airJumpsRemaining = maxAirJumps;
      events |= VERTICAL_EVENT.landed;
    }
  }

  return events;
}
