import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  activateAnnihilationPulse,
  annihilationPulseEnemyReach,
  annihilationPulseHitsEnemy,
  ANNIHILATION_PULSE_DURATION_SECONDS,
  ANNIHILATION_PULSE_INTERVAL_SECONDS,
  ANNIHILATION_PULSE_RADIUS,
  ANNIHILATION_PULSE_REPEL_RADIUS,
  createAnnihilationPulseClock,
  isAnnihilationPulseActive,
  tickAnnihilationPulse,
} from "../src/game/AnnihilationPulse";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createAnnihilationPulseRelic } from "../src/world/ItemFactory";
import {
  AnnihilationPulseVfx,
  getAnnihilationBurstProfile,
} from "../src/world/AnnihilationPulseVfx";

describe("annihilation pulse", () => {
  test("fires on a stable interval and expires at its declared duration", () => {
    const clock = createAnnihilationPulseClock();
    activateAnnihilationPulse(clock);

    expect(clock.remaining).toBe(ANNIHILATION_PULSE_DURATION_SECONDS);
    expect(isAnnihilationPulseActive(clock)).toBe(true);
    expect(tickAnnihilationPulse(clock, ANNIHILATION_PULSE_INTERVAL_SECONDS - 0.02)).toBe(0);
    expect(tickAnnihilationPulse(clock, 0.03)).toBe(1);
    expect(tickAnnihilationPulse(clock, ANNIHILATION_PULSE_INTERVAL_SECONDS * 2)).toBe(2);

    expect(tickAnnihilationPulse(clock, ANNIHILATION_PULSE_DURATION_SECONDS)).toBe(0);
    expect(clock.remaining).toBe(0);
    expect(isAnnihilationPulseActive(clock)).toBe(false);
  });

  test("keeps the kill ring inside the stronger enemy safety field", () => {
    expect(ANNIHILATION_PULSE_REPEL_RADIUS).toBeGreaterThan(ANNIHILATION_PULSE_RADIUS);
    expect(ANNIHILATION_PULSE_REPEL_RADIUS).toBeGreaterThan(11);
  });

  test("hit eligibility skips defeated spectral seats and honors body reach", () => {
    const origin = { x: 0, z: 0 };
    const live = {
      defeated: false,
      scaleX: 1,
      scaleY: 1,
      phaseVisibility: 1,
      position: { x: ANNIHILATION_PULSE_RADIUS, z: 0 },
      baseScaleX: 1,
      baseScaleY: 1,
    };
    expect(annihilationPulseHitsEnemy(origin, live)).toBe(true);
    expect(annihilationPulseHitsEnemy(origin, { ...live, defeated: true })).toBe(false);
    expect(annihilationPulseHitsEnemy(origin, { ...live, phaseVisibility: 0.03 })).toBe(false);
    expect(
      annihilationPulseHitsEnemy(origin, {
        ...live,
        position: { x: ANNIHILATION_PULSE_RADIUS + annihilationPulseEnemyReach(live) + 0.01, z: 0 },
      }),
    ).toBe(false);
  });

  test("maps every dungeon biome to blood or a biome material", () => {
    expect(getAnnihilationBurstProfile("ancient").material).toBe("blood");
    expect(getAnnihilationBurstProfile("grim").material).toBe("blood");
    expect(getAnnihilationBurstProfile("ash").material).toBe("blood");
    expect(getAnnihilationBurstProfile("iron").material).toBe("blood");
    expect(getAnnihilationBurstProfile("molten").material).toBe("slag");
    expect(getAnnihilationBurstProfile("frost").material).toBe("ice");
    expect(getAnnihilationBurstProfile("verdant").material).toBe("sap");
    expect(getAnnihilationBurstProfile("sunken").material).toBe("water");
    expect(getAnnihilationBurstProfile("fungal").material).toBe("spore");
    expect(getAnnihilationBurstProfile("obsidian").material).toBe("obsidian");
    expect(getAnnihilationBurstProfile("backrooms").material).toBe("dust");
    expect(getAnnihilationBurstProfile("future-biome").material).toBe("dust");
    expect(
      new Set(
        ["ancient", "molten", "frost", "verdant", "sunken", "fungal", "obsidian", "backrooms"].map(
          (id) => getAnnihilationBurstProfile(id).shape,
        ),
      ).size,
    ).toBe(8);
  });

  test("builds a bounded relic with runtime sockets and a trigger collider", () => {
    const relic = createAnnihilationPulseRelic(createDungeonMaterials({ compact: true }));
    const bounds = new THREE.Box3().setFromObject(relic).getSize(new THREE.Vector3());
    const runtime = relic.userData.sculptRuntime as {
      sockets: { pickup: THREE.Object3D; glow: THREE.Object3D };
      colliders: Array<{ type: string; radius: number; isTrigger: boolean }>;
    };

    expect(bounds.x).toBeGreaterThan(0.8);
    expect(bounds.y).toBeGreaterThan(0.7);
    expect(relic.getObjectByName("Annihilation pulse red core")).toBeDefined();
    expect(relic.getObjectByName("Annihilation pulse iron orbit ring C")).toBeDefined();
    expect(runtime.sockets.pickup.name).toBe("Annihilation pulse pickup anchor");
    expect(runtime.sockets.glow.name).toBe("Annihilation pulse glow anchor");
    expect(runtime.colliders[0]).toMatchObject({ type: "sphere", isTrigger: true });
    expect(runtime.colliders[0]?.radius).toBeGreaterThan(0.4);
  });

  test("uses fixed VFX pools for rings and biome death particles", () => {
    const vfx = new AnnihilationPulseVfx();
    vfx.setWarmupVisible(true);
    vfx.triggerPulse({ x: 1, y: 1, z: -2 }, "molten");
    vfx.triggerEnemyBurst({ x: 1, y: 1, z: -2 }, "frost", 7);
    vfx.update(4, 0.1, { x: 1, y: 1, z: -2 }, 0.1, "frost");

    expect(vfx.root.children).toHaveLength(4 + 4);
    expect(vfx.activeBurstCount).toBe(1);
    expect(vfx.root.getObjectByName("Annihilation expanding kill ring")).toBeDefined();
    const particles = vfx.root.getObjectByName(
      "Biome annihilation enemy particles",
    ) as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
    expect(particles.geometry.getAttribute("aShape")).toBeDefined();
    expect(particles.geometry.getAttribute("aSpin")).toBeDefined();
    expect(particles.material.blending).toBe(THREE.NormalBlending);

    vfx.update(4, 1, { x: 1, y: 1, z: -2 }, 1, "frost");
    expect(vfx.activeBurstCount).toBe(0);
    vfx.dispose();
  });
});
