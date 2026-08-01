/** Sticky floor curse: doubles active monster demand until the floor rebuilds. */

/** Multiplies difficulty-director target enemies while active on the floor. */
export const SWARM_CURSE_TARGET_MULTIPLIER = 2;

export function activateSwarmCurse(_active = false): boolean {
  return true;
}

export function isSwarmCurseActive(active: boolean): boolean {
  return active === true;
}

export function swarmTargetEnemies(baseTarget: number, active: boolean): number {
  const safe = Math.max(0, Math.floor(Number.isFinite(baseTarget) ? baseTarget : 0));
  if (!isSwarmCurseActive(active)) return safe;
  return safe * SWARM_CURSE_TARGET_MULTIPLIER;
}
