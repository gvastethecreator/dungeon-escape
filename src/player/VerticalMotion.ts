export interface VerticalMotionConfig {
  eyeHeight: number;
  ceilingHeight: number;
  headClearance: number;
  gravity: number;
  jumpSpeed: number;
  /**
   * Extra jumps allowed after leaving the ground (1 = classic double jump).
   * Grounded jumps do not consume this budget.
   */
  maxAirJumps: number;
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

/**
 * Allocation-free first-person jump step. Supports one or more air jumps.
 * The fixed floor and ceiling match the current static dungeon architecture;
 * slopes/platforms stay out of scope.
 */
export function stepVerticalMotion(
  state: VerticalMotionState,
  delta: number,
  jumpRequested: boolean,
  config: VerticalMotionConfig,
): number {
  const dt = Math.min(Math.max(delta, 0), 0.05);
  const maxAirJumps = Math.max(0, Math.floor(config.maxAirJumps));
  let events = VERTICAL_EVENT.none;
  state.landingSpeed = 0;

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
    const ceilingY = Math.max(config.eyeHeight, config.ceilingHeight - config.headClearance);
    if (state.y >= ceilingY) {
      state.y = ceilingY;
      if (state.velocity > 0) state.velocity = 0;
      events |= VERTICAL_EVENT.hitCeiling;
    }
    if (state.y <= config.eyeHeight) {
      state.landingSpeed = Math.abs(state.velocity);
      state.y = config.eyeHeight;
      state.velocity = 0;
      state.grounded = true;
      state.airJumpsRemaining = maxAirJumps;
      events |= VERTICAL_EVENT.landed;
    }
  }

  return events;
}
