import { describe, expect, test } from "bun:test";
import {
  createHazardClockState,
  HAZARD_FIRE_DAMAGE,
  HAZARD_SPIKE_DAMAGE,
  HAZARD_SPIKE_EXPOSURE_THRESHOLD,
  HAZARD_TOXIN_DAMAGE,
  spikeExposure,
  tickHazardTraversal,
} from "../src/world/HazardTraversal";

describe("HazardTraversal", () => {
  test("spike exposure curve is shared for damage and presentation", () => {
    const high = spikeExposure(Math.PI / 2 / 2.3, 0);
    expect(high).toBeGreaterThan(HAZARD_SPIKE_EXPOSURE_THRESHOLD);
    const low = spikeExposure(0, 0);
    expect(low).toBeLessThan(HAZARD_SPIKE_EXPOSURE_THRESHOLD);
    expect(spikeExposure(1.25, 0.4)).toBeCloseTo(spikeExposure(1.25, 0.4), 10);
  });

  test("spike exposure matches THREE.MathUtils.smoothstep on the authored edges", async () => {
    const THREE = await import("three");
    const samples = [0, 0.4, 1.25, Math.PI / 2 / 2.3];
    for (const elapsed of samples) {
      for (const phase of [0, 0.7, 1.4]) {
        const expected = THREE.MathUtils.smoothstep(
          Math.sin(elapsed * 2.3 + phase),
          -0.25,
          0.72,
        );
        expect(spikeExposure(elapsed, phase)).toBeCloseTo(expected, 10);
      }
    }
  });


  test("applies fire damage once then cools down", () => {

    const first = tickHazardTraversal(createHazardClockState(), {
      delta: 0.016,
      contactKind: "fire",
      spikeExposure: 0,
      airborne: false,
      immune: false,
    });
    expect(first.effect.damage).toBe(HAZARD_FIRE_DAMAGE);
    expect(first.clocks.fireCooldown).toBeGreaterThan(0);

    const second = tickHazardTraversal(first.clocks, {
      delta: 0.016,
      contactKind: "fire",
      spikeExposure: 0,
      airborne: false,
      immune: false,
    });
    expect(second.effect.damage).toBe(0);
  });

  test("airborne and immune skip contact damage", () => {
    const airborne = tickHazardTraversal(createHazardClockState(), {
      delta: 0.016,
      contactKind: "spikes",
      spikeExposure: 1,
      airborne: true,
      immune: false,
    });
    expect(airborne.effect.damage).toBe(0);

    const immune = tickHazardTraversal(createHazardClockState(), {
      delta: 0.016,
      contactKind: "fire",
      spikeExposure: 0,
      airborne: false,
      immune: true,
    });
    expect(immune.effect.damage).toBe(0);
    expect(immune.clocks.toxinRemaining).toBe(0);
  });

  test("toxin residue ticks after leaving the pad", () => {
    const contact = tickHazardTraversal(createHazardClockState(), {
      delta: 0.016,
      contactKind: "toxin",
      spikeExposure: 0,
      airborne: false,
      immune: false,
    });
    expect(contact.effect.damage).toBe(HAZARD_TOXIN_DAMAGE);
    expect(contact.clocks.toxinRemaining).toBeGreaterThan(0);

    const residue = tickHazardTraversal(contact.clocks, {
      delta: 0.9,
      contactKind: null,
      spikeExposure: 0,
      airborne: false,
      immune: false,
    });
    expect(residue.effect.kind).toBe("toxin");
    expect(residue.effect.damage).toBe(HAZARD_TOXIN_DAMAGE);
  });

  test("spikes require exposure threshold", () => {
    const low = tickHazardTraversal(createHazardClockState(), {
      delta: 0.016,
      contactKind: "spikes",
      spikeExposure: 0.2,
      airborne: false,
      immune: false,
    });
    expect(low.effect.damage).toBe(0);

    const high = tickHazardTraversal(createHazardClockState(), {
      delta: 0.016,
      contactKind: "spikes",
      spikeExposure: 0.9,
      airborne: false,
      immune: false,
    });
    expect(high.effect.damage).toBe(HAZARD_SPIKE_DAMAGE);
  });
});
