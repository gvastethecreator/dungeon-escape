import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { OFFENSE_POWER_KINDS, planOffensePowerKind } from "../src/game/OffensePowerPlan";
import {
  applyPickupToRunPowers,
  createRunPowerRuntime,
  isShotgunOn,
  restoreRunPowerRuntime,
} from "../src/game/RunPowerRuntime";
import {
  activateShotgun,
  createShotgunState,
  fillShotgunPelletDirections,
  isShotgunEquipped,
  restoreShotgun,
  SHOTGUN_CONE_COS,
  SHOTGUN_CONE_HALF_ANGLE,
  SHOTGUN_PELLET_COUNT,
  SHOTGUN_PELLET_TRAVEL_SECONDS,
  SHOTGUN_PUMP_SECONDS,
  SHOTGUN_RANGE,
  SHOTGUN_SHELLS,
  shotgunHitsEnemy,
  shotgunLookDirection,
  shotgunMuzzleWorldOrigin,
  shotgunPelletDirection,
  shotgunRackPose,
  tickShotgun,
  tryFireShotgun,
} from "../src/game/Shotgun";
import { createFirstPersonShotgun } from "../src/player/FirstPersonShotgun";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createPumpShotgun, createShotgunPickup } from "../src/world/ShotgunFactory";
import {
  createShotgunSparkTexture,
  ShotgunBlastVfx,
  SHOTGUN_BLAST_KILL_SPARKS,
  SHOTGUN_BLAST_MUZZLE_SPARKS,
  SHOTGUN_BLAST_PELLET_COUNT,
  SHOTGUN_BLAST_SPARK_COUNT,
} from "../src/world/ShotgunBlastVfx";

describe("shotgun", () => {
  test("pickup fills six shells and fire spends one with a pump delay", () => {
    const state = createShotgunState();
    expect(isShotgunEquipped(state)).toBe(false);
    activateShotgun(state);
    expect(state.shells).toBe(SHOTGUN_SHELLS);
    expect(tryFireShotgun(state)).toBe(true);
    expect(state.shells).toBe(5);
    expect(state.pumpSeconds).toBe(SHOTGUN_PUMP_SECONDS);
    expect(tryFireShotgun(state)).toBe(false);
    tickShotgun(state, SHOTGUN_PUMP_SECONDS);
    expect(tryFireShotgun(state)).toBe(true);
    expect(state.shells).toBe(4);
  });

  test("empty tube cannot fire and restore clamps ammo", () => {
    const state = createShotgunState();
    activateShotgun(state);
    for (let shot = 0; shot < SHOTGUN_SHELLS; shot += 1) {
      expect(tryFireShotgun(state)).toBe(true);
      tickShotgun(state, SHOTGUN_PUMP_SECONDS);
    }
    expect(tryFireShotgun(state)).toBe(false);
    expect(isShotgunEquipped(state)).toBe(false);
    restoreShotgun(state, 99, 12);
    expect(state.shells).toBe(SHOTGUN_SHELLS);
    expect(state.pumpSeconds).toBe(SHOTGUN_PUMP_SECONDS);
  });

  test("last shot still pumps then unequips", () => {
    const state = createShotgunState();
    activateShotgun(state);
    for (let shot = 0; shot < SHOTGUN_SHELLS - 1; shot += 1) {
      expect(tryFireShotgun(state)).toBe(true);
      tickShotgun(state, SHOTGUN_PUMP_SECONDS);
    }
    expect(tryFireShotgun(state)).toBe(true);
    expect(state.shells).toBe(0);
    expect(state.pumpSeconds).toBe(SHOTGUN_PUMP_SECONDS);
    expect(isShotgunEquipped(state)).toBe(true);
    expect(tryFireShotgun(state)).toBe(false);
    tickShotgun(state, SHOTGUN_PUMP_SECONDS);
    expect(isShotgunEquipped(state)).toBe(false);
  });

  test("cone hitscan kills in front and misses behind or out of range", () => {
    const origin = { x: 0, y: 1.6, z: 0 };
    const forward = { x: 0, y: 0, z: -1 };
    const live = {
      defeated: false,
      scaleX: 1,
      scaleY: 1,
      phaseVisibility: 1,
      position: { x: 0, y: 1.6, z: -4 },
      baseScaleX: 1,
      baseScaleY: 1,
    };
    expect(shotgunHitsEnemy(origin, forward, live)).toBe(true);
    expect(shotgunHitsEnemy(origin, forward, { ...live, defeated: true })).toBe(false);
    expect(shotgunHitsEnemy(origin, forward, { ...live, phaseVisibility: 0.02 })).toBe(false);
    expect(
      shotgunHitsEnemy(origin, forward, { ...live, position: { x: 0, y: 1.6, z: 4 } }),
    ).toBe(false);
    expect(
      shotgunHitsEnemy(origin, forward, {
        ...live,
        position: { x: 0, y: 1.6, z: -(SHOTGUN_RANGE + 2) },
      }),
    ).toBe(false);
    expect(SHOTGUN_CONE_HALF_ANGLE).toBeGreaterThan(0.2);
  });

  test("one blast can kill several enemies inside the cone", () => {
    const origin = { x: 0, y: 1.6, z: 0 };
    const forward = { x: 0, y: 0, z: -1 };
    const left = {
      defeated: false,
      scaleX: 1,
      scaleY: 1,
      phaseVisibility: 1,
      position: { x: -0.45, y: 1.6, z: -3.2 },
      baseScaleX: 1,
      baseScaleY: 1,
    };
    const right = { ...left, position: { x: 0.5, y: 1.55, z: -4.1 } };
    const far = { ...left, position: { x: 0, y: 1.6, z: -7.4 } };
    expect(shotgunHitsEnemy(origin, forward, left)).toBe(true);
    expect(shotgunHitsEnemy(origin, forward, right)).toBe(true);
    expect(shotgunHitsEnemy(origin, forward, far)).toBe(true);
  });

  test("look direction matches camera-forward YXZ", () => {
    const ahead = shotgunLookDirection(0, 0);
    expect(ahead.x).toBeCloseTo(0, 5);
    expect(ahead.y).toBeCloseTo(0, 5);
    expect(ahead.z).toBeCloseTo(-1, 5);
  });

  test("rack pose dips the gun then holds a beat before rising", () => {
    const rest = shotgunRackPose(0);
    expect(rest.dip).toBe(0);
    expect(rest.pumpSlide).toBe(0);
    const hold = shotgunRackPose(SHOTGUN_PUMP_SECONDS * 0.58);
    expect(hold.dip).toBeGreaterThan(0.85);
    expect(hold.pitch).toBeGreaterThan(0.3);
    expect(hold.pumpSlide).toBeGreaterThan(0.85);
    const rising = shotgunRackPose(SHOTGUN_PUMP_SECONDS * 0.12);
    expect(rising.dip).toBeGreaterThan(0);
    expect(rising.dip).toBeLessThan(hold.dip);
  });

  test("pellet directions stay inside the combat cone", () => {
    const aim = { x: 0, y: 0, z: -1 };
    const center = shotgunPelletDirection(aim, 0, 4);
    expect(center.x).toBeCloseTo(0, 5);
    expect(center.y).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(-1, 5);
    const pellets = fillShotgunPelletDirections(aim, 11);
    expect(pellets).toHaveLength(SHOTGUN_PELLET_COUNT);
    for (const pellet of pellets) {
      const length = Math.hypot(pellet.x, pellet.y, pellet.z);
      expect(length).toBeCloseTo(1, 5);
      const dot = pellet.x * aim.x + pellet.y * aim.y + pellet.z * aim.z;
      expect(dot).toBeGreaterThanOrEqual(SHOTGUN_CONE_COS - 0.002);
    }
    const muzzle = shotgunMuzzleWorldOrigin({ x: 2, y: 1.62, z: -3 }, aim);
    expect(muzzle.z).toBeLessThan(-3);
    expect(muzzle.x).toBeLessThan(2);
  });

  test("blast vfx pools pellets, tracers, and impact sparks", () => {
    const vfx = new ShotgunBlastVfx();
    try {
      expect(vfx.root.name).toBe("Shotgun blast field");
      expect(vfx.root.getObjectByName("Shotgun pellets")).toBeTruthy();
      expect(vfx.root.getObjectByName("Shotgun pellet tracers")).toBeTruthy();
      expect(vfx.activePelletCount).toBe(0);

      vfx.triggerBlast({
        origin: { x: 0, y: 1.4, z: 0 },
        direction: { x: 0, y: 0, z: -1 },
        impacts: [{ x: 0, y: 1.4, z: -3 }],
        seed: 3,
      });
      expect(vfx.activePelletCount).toBe(SHOTGUN_BLAST_PELLET_COUNT);
      expect(vfx.activeSparkCount).toBe(SHOTGUN_BLAST_MUZZLE_SPARKS + SHOTGUN_BLAST_KILL_SPARKS);
      expect(vfx.activeSparkCount).toBeLessThanOrEqual(SHOTGUN_BLAST_SPARK_COUNT);

      const pellets = vfx.root.getObjectByName("Shotgun pellets") as THREE.InstancedMesh;
      const first = new THREE.Matrix4();
      pellets.getMatrixAt(0, first);
      const start = new THREE.Vector3().setFromMatrixPosition(first);

      vfx.update(SHOTGUN_PELLET_TRAVEL_SECONDS * 0.5, { x: 0, y: 1.6, z: 0 });
      pellets.getMatrixAt(0, first);
      const mid = new THREE.Vector3().setFromMatrixPosition(first);
      expect(mid.z).toBeLessThan(start.z);
      expect(vfx.activePelletCount).toBe(SHOTGUN_BLAST_PELLET_COUNT);

      vfx.update(SHOTGUN_PELLET_TRAVEL_SECONDS, { x: 0, y: 1.6, z: 0 });
      expect(vfx.activePelletCount).toBe(0);
      vfx.update(1, { x: 0, y: 1.6, z: 0 });
      expect(vfx.activeSparkCount).toBe(0);
      vfx.update(0.016, { x: 0, y: 1.6, z: 0 });
      expect(vfx.activePelletCount).toBe(0);
      expect(vfx.activeSparkCount).toBe(0);

      vfx.triggerBlast({
        origin: { x: 1, y: 1.4, z: 1 },
        direction: { x: 0, y: 0, z: -1 },
        seed: 8,
      });
      vfx.triggerBlast({
        origin: { x: 2, y: 1.4, z: 2 },
        direction: { x: 1, y: 0, z: 0 },
        seed: 9,
      });
      expect(vfx.activePelletCount).toBe(SHOTGUN_BLAST_PELLET_COUNT * 2);
    } finally {
      vfx.dispose();
    }
  });

  test("warmup draws non-empty pellets, tracers, sparks, and muzzle without starting a blast", () => {
    const vfx = new ShotgunBlastVfx();
    try {
      vfx.setWarmupVisible(true, { x: 2, y: 0.4, z: -3 });
      expect(vfx.activePelletCount).toBe(0);
      expect(vfx.activeSparkCount).toBe(0);
      const pellets = vfx.root.getObjectByName("Shotgun pellets") as THREE.InstancedMesh;
      const tracers = vfx.root.getObjectByName("Shotgun pellet tracers") as THREE.LineSegments;
      const sparks = vfx.root.getObjectByName("Shotgun blast sparks") as THREE.Points;
      const muzzle = vfx.root.getObjectByName("Shotgun world muzzle flash") as THREE.Mesh;
      const cone = vfx.root.getObjectByName("Shotgun muzzle cone") as THREE.Mesh;
      expect(pellets.visible).toBe(true);
      expect(tracers.visible).toBe(true);
      expect(sparks.visible).toBe(true);
      expect(muzzle.visible).toBe(true);
      expect(cone.visible).toBe(true);
      expect(tracers.geometry.drawRange.count).toBeGreaterThan(0);
      const matrix = new THREE.Matrix4();
      pellets.getMatrixAt(0, matrix);
      const scale = new THREE.Vector3();
      matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      expect(scale.x).toBeGreaterThan(0.5);
      expect((muzzle.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0);

      vfx.setWarmupVisible(false, { x: 2, y: 0.4, z: -3 });
      expect(pellets.visible).toBe(false);
      expect(tracers.visible).toBe(false);
      expect(sparks.visible).toBe(false);
      expect(muzzle.visible).toBe(false);
      expect(tracers.geometry.drawRange.count).toBe(0);
      expect(vfx.activePelletCount).toBe(0);
    } finally {
      vfx.dispose();
    }
  });

  test("viewmodel warmup shows flash and sparks so the first shot does not compile them", () => {
    const shotgun = createFirstPersonShotgun();
    try {
      shotgun.setWarmupVisible(true);
      const flash = shotgun.root.getObjectByName("Shotgun muzzle flash") as THREE.Mesh;
      const cone = shotgun.root.getObjectByName("Shotgun muzzle cone") as THREE.Mesh;
      const sparks = shotgun.root.getObjectByName("Shotgun muzzle sparks") as THREE.Points;
      expect(shotgun.root.visible).toBe(true);
      expect(flash.visible).toBe(true);
      expect(cone.visible).toBe(true);
      expect(sparks.visible).toBe(true);
      expect((flash.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0);
      shotgun.setWarmupVisible(false);
      expect(shotgun.root.visible).toBe(false);
      expect(flash.visible).toBe(false);
      expect(sparks.visible).toBe(false);
    } finally {
      shotgun.dispose();
    }
  });

  test("spark texture is a soft disc", () => {
    const texture = createShotgunSparkTexture(24);
    try {
      expect(texture.image || texture.source).toBeTruthy();
    } finally {
      texture.dispose();
    }
  });

  test("run powers activate and restore shotgun ammo", () => {
    const powers = createRunPowerRuntime();
    expect(applyPickupToRunPowers(powers, "shotgun")).toBe(true);
    expect(isShotgunOn(powers)).toBe(true);
    expect(powers.shotgun.shells).toBe(SHOTGUN_SHELLS);
    restoreRunPowerRuntime(powers, { shotgunShells: 2, shotgunPumpRemaining: 0.4 });
    expect(powers.shotgun.shells).toBe(2);
    expect(powers.shotgun.pumpSeconds).toBe(0.4);
  });

  test("offense pool includes the shotgun without adding a chest slot", () => {
    expect(OFFENSE_POWER_KINDS).toContain("shotgun");
    const kind = planOffensePowerKind("offense-seed-9");
    expect(OFFENSE_POWER_KINDS).toContain(kind);
  });

  test("procedural factory exposes named parts and pickup sockets", () => {
    const materials = createDungeonMaterials({ compact: true });
    const assembly = createPumpShotgun(materials);
    expect(assembly.root.name).toBe("Pump-action shotgun");
    expect(assembly.root.getObjectByName("Shotgun stock")).toBeTruthy();
    expect(assembly.root.getObjectByName("Shotgun muzzle socket")).toBe(assembly.muzzle);
    expect(assembly.pump.name.length).toBeGreaterThan(0);
    const pickup = createShotgunPickup(materials);
    expect(pickup.userData.pickupKind).toBe("shotgun");
    expect(pickup.getObjectByName("Shotgun pickup light")).toBeTruthy();
    expect(pickup.getObjectByName("Shotgun pickup halo")).toBeTruthy();
  });

  test("runtime shotgun audio files are dedicated opus takes", async () => {
    for (const file of [
      "shotgun-fire.opus",
      "shotgun-pump.opus",
      "shotgun-dry.opus",
      "pickup-shotgun-v2.opus",
    ]) {
      const blob = Bun.file(new URL(`../public/assets/audio/dungeon/${file}`, import.meta.url));
      expect(await blob.exists()).toBe(true);
      expect(blob.size).toBeGreaterThan(800);
    }
  });
});
