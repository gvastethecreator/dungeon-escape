/** Unit XZ push from source toward target (player knockback away from attacker). */
export function knockbackAwayFrom(
  targetX: number,
  targetZ: number,
  sourceX: number,
  sourceZ: number,
): { x: number; z: number } {
  const dx = targetX - sourceX;
  const dz = targetZ - sourceZ;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return { x: 0, z: 1 };
  return { x: dx / len, z: dz / len };
}
