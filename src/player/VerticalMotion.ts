export interface VerticalMotionConfig {
  eyeHeight: number;
  ceilingHeight: number;
  headClearance: number;
  gravity: number;
  jumpSpeed: number;
}

export interface VerticalMotionState {
  y: number;
  velocity: number;
  grounded: boolean;
  landingSpeed: number;
}

export const VERTICAL_EVENT = Object.freeze({
  none: 0,
  jumped: 1 << 0,
  landed: 1 << 1,
  hitCeiling: 1 << 2,
});

export function createVerticalMotionState(eyeHeight: number): VerticalMotionState {
  return { y: eyeHeight, velocity: 0, grounded: true, landingSpeed: 0 };
}

export function resetVerticalMotion(state: VerticalMotionState, eyeHeight: number): void {
  state.y = eyeHeight;
  state.velocity = 0;
  state.grounded = true;
  state.landingSpeed = 0;
}

/**
 * Allocation-free first-person jump step. The fixed floor and ceiling match
 * the current static dungeon architecture; slopes/platforms stay out of scope.
 */
export function stepVerticalMotion(
  state: VerticalMotionState,
  delta: number,
  jumpRequested: boolean,
  config: VerticalMotionConfig,
): number {
  const dt = Math.min(Math.max(delta, 0), 0.05);
  let events = VERTICAL_EVENT.none;
  state.landingSpeed = 0;

  if (jumpRequested && state.grounded) {
    state.grounded = false;
    state.velocity = config.jumpSpeed;
    events |= VERTICAL_EVENT.jumped;
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
      events |= VERTICAL_EVENT.landed;
    }
  }

  return events;
}
