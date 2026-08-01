/**
 * Pure enemy-threat proximity policy for GameAudio.
 * The mixer owns playback; this module owns intensity, band, and bark cooldowns.
 */

export const THREAT_NEAR_DISTANCE = 2.2;
export const THREAT_FAR_SPAN = 12.8;
export const THREAT_BAND_LOW = 0.18;
export const THREAT_BAND_MID = 0.42;
export const THREAT_BAND_HIGH = 0.72;
export const THREAT_AMBIENT_INTENSITY = 0.34;
export const THREAT_BAND_COOLDOWN_HIGH = 1.25;
export const THREAT_BAND_COOLDOWN_MID = 2.4;
export const THREAT_AMBIENT_COOLDOWN_BASE = 3.6;
export const THREAT_AMBIENT_COOLDOWN_SPAN = 2.8;
export const THREAT_AMBIENT_RATE = 0.25;

export type ThreatBand = 0 | 1 | 2 | 3;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Map nearest enemy distance to 0..1 threat intensity (squared falloff). */
export function threatIntensityFromDistance(distance: number | null): number {
  if (distance === null || !Number.isFinite(distance)) return 0;
  const linear = 1 - clamp01((distance - THREAT_NEAR_DISTANCE) / THREAT_FAR_SPAN);
  return linear * linear;
}

/** Discrete proximity band used for bark priority. */
export function threatBandFromIntensity(intensity: number): ThreatBand {
  if (intensity > THREAT_BAND_HIGH) return 3;
  if (intensity > THREAT_BAND_MID) return 2;
  if (intensity > THREAT_BAND_LOW) return 1;
  return 0;
}

export function threatBandCooldown(band: ThreatBand): number {
  return band === 3 ? THREAT_BAND_COOLDOWN_HIGH : THREAT_BAND_COOLDOWN_MID;
}

export interface ThreatBandBarkInput {
  intensity: number;
  previousBand: ThreatBand;
  cooldownRemaining: number;
}

export interface ThreatBandBarkDecision {
  band: ThreatBand;
  /** True when the host must play a rising-band bark. */
  playBark: boolean;
  nextCooldown: number;
}

/**
 * Rising band edges at mid/high fire one bark when the cooldown is clear.
 * Returns the updated band and optional cooldown latch.
 */
export function resolveThreatBandBark(input: ThreatBandBarkInput): ThreatBandBarkDecision {
  const band = threatBandFromIntensity(input.intensity);
  const cooldownReady = input.cooldownRemaining <= 0;
  const playBark = band > input.previousBand && band >= 2 && cooldownReady;
  return {
    band,
    playBark,
    nextCooldown: playBark ? threatBandCooldown(band) : input.cooldownRemaining,
  };
}

export interface ThreatAmbientBarkInput {
  intensity: number;
  cooldownRemaining: number;
  delta: number;
  /** Unit random in [0, 1). Inject for tests. */
  randomUnit: number;
  /** Unit random for cooldown jitter in [0, 1). */
  randomCooldownUnit: number;
}

export interface ThreatAmbientBarkDecision {
  playBark: boolean;
  nextCooldown: number;
}

/**
 * Low-rate ambient growl while threat stays above the ambient intensity floor.
 */
export function resolveThreatAmbientBark(input: ThreatAmbientBarkInput): ThreatAmbientBarkDecision {
  const delta = Math.max(0, input.delta);
  if (
    input.intensity > THREAT_AMBIENT_INTENSITY &&
    input.cooldownRemaining <= 0 &&
    input.randomUnit < delta * THREAT_AMBIENT_RATE
  ) {
    const jitter = clamp01(input.randomCooldownUnit);
    return {
      playBark: true,
      nextCooldown: THREAT_AMBIENT_COOLDOWN_BASE + jitter * THREAT_AMBIENT_COOLDOWN_SPAN,
    };
  }
  return { playBark: false, nextCooldown: input.cooldownRemaining };
}
