import { describe, expect, test } from "bun:test";
import {
  resolveThreatAmbientBark,
  resolveThreatBandBark,
  threatBandFromIntensity,
  threatIntensityFromDistance,
  THREAT_AMBIENT_INTENSITY,
  THREAT_BAND_COOLDOWN_HIGH,
  THREAT_BAND_COOLDOWN_MID,
  THREAT_BAND_HIGH,
  THREAT_BAND_MID,
} from "../src/audio/AudioThreatPolicy";

describe("AudioThreatPolicy", () => {
  test("maps distance to squared intensity and bands", () => {
    expect(threatIntensityFromDistance(null)).toBe(0);
    expect(threatIntensityFromDistance(2.2)).toBe(1);
    expect(threatIntensityFromDistance(2.2 + 12.8)).toBe(0);
    const mid = threatIntensityFromDistance(2.2 + 12.8 * 0.5);
    expect(mid).toBeCloseTo(0.25, 5);
    expect(threatBandFromIntensity(THREAT_BAND_HIGH + 0.01)).toBe(3);
    expect(threatBandFromIntensity(THREAT_BAND_MID + 0.01)).toBe(2);
    expect(threatBandFromIntensity(0.1)).toBe(0);
  });

  test("fires band bark only on rising mid/high edges with clear cooldown", () => {
    const rise = resolveThreatBandBark({
      intensity: THREAT_BAND_HIGH + 0.05,
      previousBand: 1,
      cooldownRemaining: 0,
    });
    expect(rise.playBark).toBe(true);
    expect(rise.band).toBe(3);
    expect(rise.nextCooldown).toBe(THREAT_BAND_COOLDOWN_HIGH);

    const midRise = resolveThreatBandBark({
      intensity: THREAT_BAND_MID + 0.05,
      previousBand: 0,
      cooldownRemaining: 0,
    });
    expect(midRise.playBark).toBe(true);
    expect(midRise.nextCooldown).toBe(THREAT_BAND_COOLDOWN_MID);

    const cooling = resolveThreatBandBark({
      intensity: THREAT_BAND_HIGH + 0.05,
      previousBand: 1,
      cooldownRemaining: 0.5,
    });
    expect(cooling.playBark).toBe(false);
    expect(cooling.nextCooldown).toBe(0.5);

    const hold = resolveThreatBandBark({
      intensity: THREAT_BAND_HIGH + 0.05,
      previousBand: 3,
      cooldownRemaining: 0,
    });
    expect(hold.playBark).toBe(false);
  });

  test("ambient bark respects intensity floor and injects cooldown jitter", () => {
    const miss = resolveThreatAmbientBark({
      intensity: THREAT_AMBIENT_INTENSITY,
      cooldownRemaining: 0,
      delta: 1,
      randomUnit: 0,
      randomCooldownUnit: 0.5,
    });
    expect(miss.playBark).toBe(false);

    const hit = resolveThreatAmbientBark({
      intensity: THREAT_AMBIENT_INTENSITY + 0.01,
      cooldownRemaining: 0,
      delta: 1,
      randomUnit: 0,
      randomCooldownUnit: 0.5,
    });
    expect(hit.playBark).toBe(true);
    expect(hit.nextCooldown).toBeCloseTo(3.6 + 0.5 * 2.8, 5);
  });
});
