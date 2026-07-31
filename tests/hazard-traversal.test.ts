import { describe, expect, test } from "bun:test";
import {
  createHazardClockState,
  HAZARD_FIRE_DAMAGE,
  HAZARD_SPIKE_DAMAGE,
  HAZARD_TOXIN_DAMAGE,
  tickHazardTraversal,
} from "../src/world/HazardTraversal";

describe("HazardTraversal", () => {
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
