export const CRITICAL_HEALTH_THRESHOLD = 15;
export const CRITICAL_HEALTH_PULSE_PERIOD = 4.6;
export const CRITICAL_HEALTH_PULSE_DURATION = 1.05;

export interface CriticalHealthFeel {
  active: boolean;
  severity: number;
  /** Signed lateral steering fraction. Kept below 0.1 so input stays reliable. */
  movementDrift: number;
  /** 0..1 shader tint strength. */
  redTint: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Low-health feedback with no random state or per-frame allocation.
 * Uneven sine bands add a mild movement fault; a short periodic pulse drives
 * the existing full-screen post pass instead of adding another render pass.
 */
export function computeCriticalHealthFeel(
  resolve: number,
  elapsedSeconds: number,
  reducedMotion = false,
): CriticalHealthFeel {
  const safeResolve = Number.isFinite(resolve) ? resolve : 100;
  const active = safeResolve < CRITICAL_HEALTH_THRESHOLD;
  if (!active) return { active: false, severity: 0, movementDrift: 0, redTint: 0 };

  const severity = clamp01(
    (CRITICAL_HEALTH_THRESHOLD - Math.max(0, safeResolve)) / CRITICAL_HEALTH_THRESHOLD,
  );
  const time = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const irregular =
    Math.sin(time * 0.91 + 0.4) * 0.56 +
    Math.sin(time * 1.73 + 2.2) * 0.29 +
    Math.sin(time * 0.37 + 4.1) * 0.15;
  const movementDrift = reducedMotion ? 0 : irregular * (0.055 + severity * 0.04);

  const pulsePhase = time % CRITICAL_HEALTH_PULSE_PERIOD;
  const pulseProgress = clamp01(pulsePhase / CRITICAL_HEALTH_PULSE_DURATION);
  const pulseEnvelope =
    pulsePhase <= CRITICAL_HEALTH_PULSE_DURATION
      ? Math.pow(Math.sin(pulseProgress * Math.PI), 2)
      : 0;
  const redTint = pulseEnvelope * (0.13 + severity * 0.2);

  return {
    active,
    severity: Number(severity.toFixed(4)),
    movementDrift: Number(movementDrift.toFixed(5)),
    redTint: Number(redTint.toFixed(5)),
  };
}
