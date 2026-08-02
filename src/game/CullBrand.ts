/** Runtime rules for the cull-brand power: one contact kill charge. */

export const CULL_BRAND_DURATION_SECONDS = 12;
/** Minimum enemy phase visibility required to spend the brand. */
export const CULL_BRAND_MIN_PHASE_VISIBILITY = 0.04;

export interface CullBrandState {
  /** Remaining window window while a charge is held. */
  remaining: number;
  /** Unused brand charges (0 or 1 in the current design). */
  charges: number;
}

export function createCullBrandState(): CullBrandState {
  return { remaining: 0, charges: 0 };
}

export function activateCullBrand(state: CullBrandState): void {
  state.remaining = CULL_BRAND_DURATION_SECONDS;
  state.charges = 1;
}

export function tickCullBrand(state: CullBrandState, delta: number): void {
  if (!Number.isFinite(state.remaining) || state.remaining <= 0) {
    state.remaining = 0;
    state.charges = 0;
    return;
  }
  const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
  state.remaining = Math.max(0, state.remaining - safeDelta);
  if (state.remaining <= 0) state.charges = 0;
}

export function isCullBrandActive(state: CullBrandState): boolean {
  return (
    state.charges > 0 && Number.isFinite(state.remaining) && state.remaining > 0.0001
  );
}

/**
 * Spend one brand charge. Returns true when a charge was available.
 * Caller performs the enemy defeat presentation.
 */
export function tryConsumeCullBrand(state: CullBrandState): boolean {
  if (!isCullBrandActive(state)) return false;
  state.charges = 0;
  state.remaining = 0;
  return true;
}

export function restoreCullBrand(
  state: CullBrandState,
  remaining = 0,
  charges = 0,
): void {
  const safeRemaining = Math.max(0, Number.isFinite(remaining) ? remaining : 0);
  const safeCharges = Math.max(0, Math.floor(Number.isFinite(charges) ? charges : 0));
  if (safeRemaining <= 0 || safeCharges <= 0) {
    state.remaining = 0;
    state.charges = 0;
    return;
  }
  state.remaining = Math.min(CULL_BRAND_DURATION_SECONDS, safeRemaining);
  state.charges = Math.min(1, safeCharges);
}
