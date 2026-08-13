import { describe, expect, test } from "bun:test";

import { collectPlayStepPresentation } from "../src/game/PlayStepPresentation";

const quietUpdate = {
  collectedPickup: null,
  annihilationPulse: null,
  cullBrandKill: null,
  shotgunFire: null,
  shotgunDryFire: null,
  doorSound: null,
  chestSound: null,
  damage: 0,
  surfaceEffect: { kind: null, damage: 0 },
  damageSource: null,
  knockback: null,
} as const;

describe("play step presentation", () => {
  test("emits pickup, pulse, shotgun, and phoenix events in order", () => {
    const events = collectPlayStepPresentation(
      {
        ...quietUpdate,
        collectedPickup: { kind: "shotgun", position: { x: 1, y: 1, z: 1 } },
        annihilationPulse: { position: { x: 2, y: 1, z: 2 }, hits: 3 },
        shotgunFire: { position: { x: 3, y: 1.4, z: 3 }, hits: 2, pump: true },
      },
      {
        playPickup: true,
        pickup: { label: "Pump shotgun" },
        phoenixRevive: true,
        flash: "event",
      },
    );
    expect(events.map((event) => event.kind)).toEqual([
      "pickup",
      "annihilation-pulse",
      "shotgun-fire",
      "phoenix-revive",
      "flash",
    ]);
  });
});
