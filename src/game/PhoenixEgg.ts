/** Phoenix egg: one armed charge that converts lethal damage into a revival. */

export const PHOENIX_REVIVE_RESOLVE = 50;
export const PHOENIX_MAX_CHARGES = 1;

export function clampPhoenixCharges(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(PHOENIX_MAX_CHARGES, Math.max(0, Math.floor(value)));
}

export function armPhoenixCharge(current = 0): number {
  return clampPhoenixCharges(Math.max(current, 1));
}

export function hasPhoenixCharge(charges: number): boolean {
  return clampPhoenixCharges(charges) > 0;
}

/**
 * Spend one charge. Returns remaining charges and whether a charge was used.
 */
export function tryConsumePhoenixCharge(charges: number): {
  charges: number;
  consumed: boolean;
} {
  const safe = clampPhoenixCharges(charges);
  if (safe <= 0) return { charges: 0, consumed: false };
  return { charges: safe - 1, consumed: true };
}

/** Resolve after a successful phoenix revive (never 0). */
export function phoenixReviveResolve(
  reviveResolve = PHOENIX_REVIVE_RESOLVE,
): number {
  const value = Number.isFinite(reviveResolve) ? reviveResolve : PHOENIX_REVIVE_RESOLVE;
  return Math.min(100, Math.max(1, Math.round(value)));
}
